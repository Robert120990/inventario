import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import pool, { ensureSchema } from './db.js';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { verifyToken, generateToken } from './middleware/auth.js';
import { requirePermission } from './middleware/permissions.js';

const app = express();
const router = express.Router();

// 1. Cabeceras HTTP de seguridad con Helmet
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// 2. Compresión HTTP Gzip/Deflate
app.use(compression());

// 3. CORS restringido por entorno
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:5173'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Bloqueado por política CORS'));
    },
    credentials: true
}));

app.use(express.json());

// 4. Rate Limiting: protección contra fuerza bruta y DoS
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 15, // máx 15 intentos fallidos
    message: { error: 'Demasiados intentos fallidos de inicio de sesión. Por favor intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000, // 2000 peticiones cada 15 min por IP
    message: { error: 'Límite de solicitudes excedido. Por favor intenta más tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Initialize Schema once per cold start - safely without hanging requests
let isInitialized = false;

const initializeApp = async () => {
    if (isInitialized) return;
    try {
        await Promise.race([
            ensureSchema(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Init timeout')), 4000))
        ]);
        isInitialized = true;
    } catch (err) {
        console.warn('[Backend] Schema initialization warning:', err.message);
        isInitialized = true;
    }
};

app.use(async (req, res, next) => {
    if (!isInitialized) {
        await initializeApp();
    }
    next();
});

// Helper for audit logging (supports transactions through optional connection)
const logSystemEvent = async ({ userId = null, username = 'Sistema', action, module, details, ip = '', connection = null }) => {
    try {
        const logId = randomUUID();
        const executor = connection || pool;
        await executor.query(
            'INSERT INTO system_logs (id, userId, username, action, module, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [logId, userId, username, action, module, details, ip || '']
        );
    } catch (err) {
        console.error('Error writing to system_logs:', err.message);
    }
};

// Helper de respuesta de error sanitizada (previene fugas de SQL y detalles internos en producción)
const sendApiError = (res, error, defaultMessage = 'Error interno en el servidor', statusCode = 500) => {
    console.error(`[API Error] ${defaultMessage}:`, error);
    if (process.env.NODE_ENV === 'production') {
        return res.status(statusCode).json({ error: defaultMessage });
    }
    return res.status(statusCode).json({ error: error?.message || defaultMessage });
};

// Diagnostics (Sanitizado sin exposición de conteos ni errores de SQL en endpoints públicos)
router.get('/health', async (req, res) => {
    let dbStatus = 'checking...';
    try {
        await pool.query('SELECT 1');
        dbStatus = 'connected';
    } catch {
        dbStatus = 'disconnected';
    }
    res.json({ 
        status: 'ok', 
        db: dbStatus,
        time: new Date().toISOString()
    });
});

// Server Version Information (Always un-cached)
router.get('/version', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
        const vPath = path.resolve(process.cwd(), 'src', 'config', 'version.json');
        if (fs.existsSync(vPath)) {
            const vData = JSON.parse(fs.readFileSync(vPath, 'utf8'));
            return res.json(vData);
        }
    } catch {
        // Ignorar error al leer versión estática
    }
    res.json({ version: '1.3.98', displayVersion: 'v1.3.98', build: 98, commit: 'local' });
});

// Products con soporte de paginación y búsqueda server-side
router.get('/products', requirePermission('products', 'view'), async (req, res) => {
    try {
        const { page, limit, category, search, sortBy } = req.query;
        const isPaginated = limit !== undefined && limit !== '';

        let query = 'SELECT * FROM products WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
        const params = [];
        const countParams = [];

        if (category && category !== 'all') {
            query += ' AND category = ?';
            countQuery += ' AND category = ?';
            params.push(category);
            countParams.push(category);
        }

        if (search && search.trim()) {
            const searchTerm = `%${search.trim()}%`;
            query += ' AND (sku LIKE ? OR description LIKE ?)';
            countQuery += ' AND (sku LIKE ? OR description LIKE ?)';
            params.push(searchTerm, searchTerm);
            countParams.push(searchTerm, searchTerm);
        }

        // Ordenamiento
        if (sortBy === 'sku-asc') query += ' ORDER BY sku ASC';
        else if (sortBy === 'sku-desc') query += ' ORDER BY sku DESC';
        else if (sortBy === 'price-asc') query += ' ORDER BY price ASC';
        else if (sortBy === 'price-desc') query += ' ORDER BY price DESC';
        else if (sortBy === 'description-asc') query += ' ORDER BY description ASC';
        else query += ' ORDER BY created_at DESC';

        if (isPaginated) {
            const numLimit = Math.max(1, parseInt(limit, 10) || 50);
            const numPage = Math.max(1, parseInt(page, 10) || 1);
            const offset = (numPage - 1) * numLimit;

            query += ' LIMIT ? OFFSET ?';
            params.push(numLimit, offset);

            const [rows] = await pool.query(query, params);
            const [countResult] = await pool.query(countQuery, countParams);
            const total = countResult[0].total;

            return res.json({
                data: rows,
                total,
                page: numPage,
                limit: numLimit,
                totalPages: Math.ceil(total / numLimit)
            });
        }

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/products', requirePermission('products', 'create'), async (req, res) => {
    const { id, sku, description, category, price, stockUnits, stockPounds, stockBaskets } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    try {
        await pool.query('INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [id, sku || '', description || '', category || '', price || 0, stockUnits || 0, stockPounds || 0, stockBaskets || 0]);
        
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'CREATE_PRODUCT',
            module: 'products',
            details: `Creación de producto '${sku}' (${description || ''})`
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/products/:id', requirePermission('products', 'edit'), async (req, res) => {
    const { id } = req.params;
    const { sku, description, category, price } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    try {
        // Las existencias físicas (stockUnits, stockPounds, stockBaskets) no pueden modificarse aquí.
        // Se gestionan exclusivamente por /api/movements y /api/inventory-adjustments auditados.
        await pool.query('UPDATE products SET sku=?, description=?, category=?, price=? WHERE id=?', 
        [sku, description, category, price, id]);
        
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'UPDATE_PRODUCT',
            module: 'products',
            details: `Actualización de metadatos de producto ID ${id} (SKU: ${sku})`
        });

        res.json({ success: true });
    } catch (error) {
        sendApiError(res, error, 'Error al actualizar producto');
    }
});

router.delete('/products/:id', requirePermission('products', 'delete'), async (req, res) => {
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    try {
        const [rows] = await pool.query('SELECT sku, description FROM products WHERE id=?', [req.params.id]);
        const prod = rows[0] || { sku: req.params.id };

        await pool.query('DELETE FROM products WHERE id=?', [req.params.id]);

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'DELETE_PRODUCT',
            module: 'products',
            details: `Eliminación de producto SKU '${prod.sku}' (ID ${req.params.id})`
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/inventory-adjustments', requirePermission('inventory-count', 'create'), async (req, res) => {
    const { productId, stockUnits, stockPounds, stockBaskets, reason } = req.body;
    const countedUnits = Number(stockUnits);
    const countedPounds = Number(stockPounds);
    const countedBaskets = Number(stockBaskets);
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    if (!productId || !reason?.trim()) {
        return res.status(400).json({ error: 'Producto y motivo de ajuste son obligatorios.' });
    }

    if (![countedUnits, countedPounds, countedBaskets].every(Number.isFinite)
        || countedUnits < 0 || countedPounds < 0 || countedBaskets < 0
        || !Number.isInteger(countedUnits) || !Number.isInteger(countedBaskets)) {
        return res.status(400).json({ error: 'Las existencias deben ser valores numéricos válidos y no negativos.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [products] = await connection.query(
            'SELECT * FROM products WHERE id = ? FOR UPDATE',
            [productId]
        );

        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Producto no encontrado.' });
        }

        const product = products[0];
        const adjustmentId = randomUUID();

        await connection.query(
            `INSERT INTO inventory_adjustments (
                id, productId, previousUnits, previousPounds, previousBaskets,
                countedUnits, countedPounds, countedBaskets, reason, auditUser
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                adjustmentId,
                productId,
                product.stockUnits || 0,
                product.stockPounds || 0,
                product.stockBaskets || 0,
                countedUnits,
                countedPounds,
                countedBaskets,
                reason.trim(),
                actor
            ]
        );

        await connection.query(
            'UPDATE products SET stockUnits = ?, stockPounds = ?, stockBaskets = ? WHERE id = ?',
            [countedUnits, countedPounds, countedBaskets, productId]
        );

        const [updatedProducts] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'INVENTORY_ADJUSTMENT',
            module: 'inventory-count',
            details: `Ajuste físico de existencias para '${product.sku}' (${product.description || ''}). Prev: [${product.stockUnits}u, ${product.stockPounds}lbs, ${product.stockBaskets}can] -> Contado: [${countedUnits}u, ${countedPounds}lbs, ${countedBaskets}can]. Motivo: ${reason.trim()}`,
            connection
        });

        await connection.commit();

        res.json({
            success: true,
            product: updatedProducts[0],
            adjustment: {
                id: adjustmentId,
                productId,
                previousUnits: Number(product.stockUnits || 0),
                previousPounds: Number(product.stockPounds || 0),
                previousBaskets: Number(product.stockBaskets || 0),
                countedUnits,
                countedPounds,
                countedBaskets,
                reason: reason.trim(),
                auditUser: actor
            }
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.get('/inventory-adjustments', requirePermission('inventory-count', 'view'), async (req, res) => {
    try {
        const productId = req.query.productId;
        const params = [];
        let query = `SELECT ia.*, p.sku, p.description
            FROM inventory_adjustments ia
            JOIN products p ON p.id = ia.productId`;
        if (productId) {
            query += ' WHERE ia.productId = ?';
            params.push(productId);
        }
        query += ' ORDER BY ia.created_at DESC LIMIT 100';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk Import / Price Update from Excel
router.post('/products/bulk-sync', requirePermission('products', 'edit'), async (req, res) => {
    const { items, createIfNotExists = true } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'No se enviaron productos para procesar.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [existingProducts] = await connection.query('SELECT id, sku, description, price, category FROM products FOR UPDATE');
        const dbMap = new Map(existingProducts.map(p => [String(p.sku).trim(), p]));

        let createdCount = 0;
        let updatedCount = 0;

        for (const item of items) {
            const sku = String(item.sku || '').trim();
            if (!sku) continue;

            const price = Number(item.price) || 0;
            const desc = item.description ? String(item.description).trim() : '';
            const cat = item.category ? String(item.category).trim() : 'Preparados';

            if (dbMap.has(sku)) {
                const existing = dbMap.get(sku);
                if (price > 0 || desc) {
                    await connection.query(
                        'UPDATE products SET price = COALESCE(NULLIF(?, 0), price), description = COALESCE(NULLIF(?, ""), description) WHERE id = ?',
                        [price, desc, existing.id]
                    );
                    updatedCount++;
                }
            } else if (createIfNotExists) {
                const newId = randomUUID();
                await connection.query(
                    'INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, ?, ?, 0, 0, 0)',
                    [newId, sku, desc || `Producto ${sku}`, cat, price]
                );
                createdCount++;
            }
        }

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'BULK_SYNC_PRODUCTS',
            module: 'products',
            details: `Sincronización masiva vía Excel: ${updatedCount} productos actualizados, ${createdCount} productos creados.`,
            connection
        });

        await connection.commit();

        res.json({
            success: true,
            createdCount,
            updatedCount,
            totalProcessed: items.length
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Movements con soporte de paginación, filtros por fecha y búsqueda server-side
router.get('/movements', requirePermission('movements', 'view'), async (req, res) => {
    try {
        const { page, limit, startDate, endDate, type, search } = req.query;
        const isPaginated = limit !== undefined && limit !== '';

        let query = "SELECT id, type, equipment, carrier, seal, refType, refNumber, DATE_FORMAT(date, '%Y-%m-%d') as date, timeStart, timeEnd, auditUser, created_at FROM movements WHERE 1=1";
        let countQuery = "SELECT COUNT(*) as total FROM movements WHERE 1=1";
        const params = [];
        const countParams = [];

        if (type && type !== 'all') {
            query += " AND type = ?";
            countQuery += " AND type = ?";
            params.push(type);
            countParams.push(type);
        }

        if (startDate) {
            query += " AND date >= ?";
            countQuery += " AND date >= ?";
            params.push(startDate);
            countParams.push(startDate);
        }

        if (endDate) {
            query += " AND date <= ?";
            countQuery += " AND date <= ?";
            params.push(endDate);
            countParams.push(endDate);
        }

        if (search && search.trim()) {
            const searchTerm = `%${search.trim()}%`;
            query += " AND (refNumber LIKE ? OR carrier LIKE ? OR equipment LIKE ? OR seal LIKE ?)";
            countQuery += " AND (refNumber LIKE ? OR carrier LIKE ? OR equipment LIKE ? OR seal LIKE ?)";
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
            countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += " ORDER BY created_at DESC";

        let total = 0;
        let numLimit = 50;
        let numPage = 1;

        if (isPaginated) {
            numLimit = Math.max(1, parseInt(limit, 10) || 50);
            numPage = Math.max(1, parseInt(page, 10) || 1);
            const offset = (numPage - 1) * numLimit;

            const [countResult] = await pool.query(countQuery, countParams);
            total = countResult[0].total;

            query += " LIMIT ? OFFSET ?";
            params.push(numLimit, offset);
        }

        const [rows] = await pool.query(query, params);
        
        if (rows.length === 0) {
            return isPaginated
                ? res.json({ data: [], total, page: numPage, limit: numLimit, totalPages: 0 })
                : res.json([]);
        }

        const movIds = rows.map(m => m.id);
        const [allItems] = await pool.query('SELECT * FROM movement_items WHERE movementId IN (?)', [movIds]);
        const [allServices] = await pool.query('SELECT * FROM services WHERE movementId IN (?)', [movIds]);

        const itemsMap = allItems.reduce((acc, item) => {
            if (!acc[item.movementId]) acc[item.movementId] = [];
            acc[item.movementId].push(item);
            return acc;
        }, {});

        const servicesMap = allServices.reduce((acc, s) => {
            if (!acc[s.movementId]) acc[s.movementId] = [];
            acc[s.movementId].push(s);
            return acc;
        }, {});

        const results = rows.map(mov => ({
            ...mov,
            items: itemsMap[mov.id] || [],
            services: servicesMap[mov.id] || []
        }));

        if (isPaginated) {
            return res.json({
                data: results,
                total,
                page: numPage,
                limit: numLimit,
                totalPages: Math.ceil(total / numLimit)
            });
        }

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper interno para comprobar bloqueo de cortes en una fecha dada
const checkLockedCuts = async (connection, date) => {
    if (!date) return null;
    
    // 1. Corte diario
    const [dailyRows] = await connection.query(
        'SELECT id, title, startDate, endDate FROM daily_cuts WHERE isLocked = 1 AND ? BETWEEN startDate AND endDate LIMIT 1',
        [date]
    );
    if (dailyRows.length > 0) {
        const cut = dailyRows[0];
        const cleanStart = cut.startDate instanceof Date ? cut.startDate.toISOString().split('T')[0] : cut.startDate;
        const cleanEnd = cut.endDate instanceof Date ? cut.endDate.toISOString().split('T')[0] : cut.endDate;
        return `La fecha ${date} pertenece al corte diario cerrado y bloqueado '${cut.title}' (${cleanStart} al ${cleanEnd}). Debe desbloquearse antes de operar en este período.`;
    }

    // 2. Corte de seguro
    const [insRows] = await connection.query(
        'SELECT id, title, cutoffDate FROM insurance_cuts WHERE isLocked = 1 AND cutoffDate >= ? LIMIT 1',
        [date]
    );
    if (insRows.length > 0) {
        const cut = insRows[0];
        const cleanCutoff = cut.cutoffDate instanceof Date ? cut.cutoffDate.toISOString().split('T')[0] : cut.cutoffDate;
        return `La fecha ${date} se encuentra cerrada dentro del corte de póliza de seguro bloqueado '${cut.title}' al ${cleanCutoff}. Debe desbloquearse antes de alterar movimientos.`;
    }

    return null;
};

// Crear Movimiento con validación de no negatividad de stock, bloqueo de cortes y actor autenticado
router.post('/movements', requirePermission('movements', 'create'), async (req, res) => {
    const { id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, items, services } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    if (!id || !type || !date) {
        return res.status(400).json({ error: 'ID, tipo y fecha de movimiento son obligatorios.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'El movimiento debe incluir al menos un producto.' });
    }

    // Validar formato numérico de cantidades
    for (const item of items) {
        if (!item.productId) {
            return res.status(400).json({ error: 'Cada item del movimiento debe especificar un producto válido.' });
        }
        const u = Number(item.qtyUnits) || 0;
        const p = Number(item.qtyPounds) || 0;
        const b = Number(item.qtyBaskets) || 0;
        if (u < 0 || p < 0 || b < 0 || (u === 0 && p === 0 && b === 0)) {
            return res.status(400).json({ error: 'Las cantidades deben ser positivas y no negativas.' });
        }
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Verificar bloqueo de cortes en la fecha del movimiento
        const lockError = await checkLockedCuts(connection, date);
        if (lockError) {
            await connection.rollback();
            return res.status(409).json({ error: lockError });
        }

        // 2. Bloquear y verificar existencias de los productos afectados (FOR UPDATE)
        const productIds = [...new Set(items.map(i => i.productId))];
        const [dbProducts] = await connection.query(
            'SELECT id, sku, description, stockUnits, stockPounds, stockBaskets FROM products WHERE id IN (?) FOR UPDATE',
            [productIds]
        );
        const prodMap = new Map(dbProducts.map(p => [p.id, {
            ...p,
            stockUnits: Number(p.stockUnits || 0),
            stockPounds: Number(p.stockPounds || 0),
            stockBaskets: Number(p.stockBaskets || 0)
        }]));

        // Si es salida, comprobar disponibilidad
        if (type === 'out') {
            const requiredMap = new Map();
            for (const item of items) {
                const cur = requiredMap.get(item.productId) || { u: 0, p: 0, b: 0 };
                cur.u += Number(item.qtyUnits) || 0;
                cur.p += Number(item.qtyPounds) || 0;
                cur.b += Number(item.qtyBaskets) || 0;
                requiredMap.set(item.productId, cur);
            }

            for (const [prodId, reqQty] of requiredMap.entries()) {
                const prod = prodMap.get(prodId);
                if (!prod) {
                    await connection.rollback();
                    return res.status(404).json({ error: `Producto con ID '${prodId}' no existe en el catálogo.` });
                }
                if (prod.stockUnits < reqQty.u || prod.stockPounds < reqQty.p || prod.stockBaskets < reqQty.b) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: `Stock insuficiente para salida de '${prod.sku}'. Solicitado: [${reqQty.u}u, ${reqQty.p}lbs, ${reqQty.b}can]. Disponible actual: [${prod.stockUnits}u, ${prod.stockPounds}lbs, ${prod.stockBaskets}can].`
                    });
                }
            }
        }

        // 3. Insertar encabezado del movimiento
        await connection.query(
            'INSERT INTO movements (id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, type, equipment || '', carrier || '', seal || '', refType || '', refNumber || '', date, timeStart || null, timeEnd || null, actor]
        );

        // 4. Insertar items y actualizar existencias
        for (const item of items) {
            await connection.query(
                'INSERT INTO movement_items (movementId, productId, temperature, qtyUnits, qtyPounds, qtyBaskets) VALUES (?, ?, ?, ?, ?, ?)',
                [id, item.productId, item.temperature !== undefined ? item.temperature : null, item.qtyUnits || 0, item.qtyPounds || 0, item.qtyBaskets || 0]
            );

            const multiplier = type === 'in' ? 1 : -1;
            await connection.query(
                'UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [Number(item.qtyUnits || 0) * multiplier, Number(item.qtyPounds || 0) * multiplier, Number(item.qtyBaskets || 0) * multiplier, item.productId]
            );
        }

        // 5. Insertar servicios extraordinarios si aplican
        if (services && services.length > 0) {
            for (const s of services) {
                await connection.query(
                    'INSERT INTO services (movementId, description, value) VALUES (?, ?, ?)',
                    [id, s.description || '', s.value || 0]
                );
            }
        }

        // 6. Auditoría inmutable dentro de la misma transacción
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: type === 'in' ? 'MOVEMENT_IN' : 'MOVEMENT_OUT',
            module: 'movements',
            details: `Creación de movimiento de ${type === 'in' ? 'Entrada' : 'Salida'} ID '${id}' (Ref: ${refType || ''} ${refNumber || ''}, ${items.length} productos)`,
            connection
        });

        await connection.commit();
        res.json({ success: true, id });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Modificar Movimiento con verificación de deltas de stock y bloqueo de cortes
router.put('/movements/:id', requirePermission('movements', 'edit'), async (req, res) => {
    const { id } = req.params;
    const { type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, items, services } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    if (!type || !date || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Tipo, fecha y productos son obligatorios.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [movementRows] = await connection.query(
            'SELECT type, DATE_FORMAT(date, "%Y-%m-%d") as date FROM movements WHERE id = ? FOR UPDATE',
            [id]
        );

        if (movementRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Movimiento no encontrado.' });
        }

        const existingMov = movementRows[0];

        // Verificar bloqueo de cortes en la fecha previa y en la nueva fecha
        const lockOldError = await checkLockedCuts(connection, existingMov.date);
        if (lockOldError) {
            await connection.rollback();
            return res.status(409).json({ error: lockOldError });
        }
        if (existingMov.date !== date) {
            const lockNewError = await checkLockedCuts(connection, date);
            if (lockNewError) {
                await connection.rollback();
                return res.status(409).json({ error: lockNewError });
            }
        }

        // Obtener items anteriores para calcular el delta neto
        const [previousItems] = await connection.query(
            'SELECT productId, qtyUnits, qtyPounds, qtyBaskets FROM movement_items WHERE movementId = ?',
            [id]
        );

        // Bloquear todos los productos involucrados (anteriores y nuevos)
        const allProductIds = [...new Set([
            ...previousItems.map(i => i.productId),
            ...items.map(i => i.productId)
        ])];

        const [dbProducts] = await connection.query(
            'SELECT id, sku, stockUnits, stockPounds, stockBaskets FROM products WHERE id IN (?) FOR UPDATE',
            [allProductIds]
        );
        const prodMap = new Map(dbProducts.map(p => [p.id, {
            ...p,
            stockUnits: Number(p.stockUnits || 0),
            stockPounds: Number(p.stockPounds || 0),
            stockBaskets: Number(p.stockBaskets || 0)
        }]));

        // 1. Simular reversión del movimiento anterior
        const prevMultiplier = existingMov.type === 'in' ? -1 : 1;
        for (const prev of previousItems) {
            const p = prodMap.get(prev.productId);
            if (p) {
                p.stockUnits += Number(prev.qtyUnits || 0) * prevMultiplier;
                p.stockPounds += Number(prev.qtyPounds || 0) * prevMultiplier;
                p.stockBaskets += Number(prev.qtyBaskets || 0) * prevMultiplier;
            }
        }

        // 2. Simular aplicación del nuevo movimiento
        const newMultiplier = type === 'in' ? 1 : -1;
        for (const nextItem of items) {
            const p = prodMap.get(nextItem.productId);
            if (!p) {
                await connection.rollback();
                return res.status(404).json({ error: `Producto '${nextItem.productId}' no existe.` });
            }
            p.stockUnits += Number(nextItem.qtyUnits || 0) * newMultiplier;
            p.stockPounds += Number(nextItem.qtyPounds || 0) * newMultiplier;
            p.stockBaskets += Number(nextItem.qtyBaskets || 0) * newMultiplier;
        }

        // 3. Comprobar que ningún producto quede con saldo negativo
        for (const p of prodMap.values()) {
            if (p.stockUnits < 0 || p.stockPounds < -0.0001 || p.stockBaskets < 0) {
                await connection.rollback();
                return res.status(400).json({
                    error: `La modificación del movimiento generaría existencias negativas para '${p.sku}'. Saldo resultante: [${p.stockUnits}u, ${p.stockPounds}lbs, ${p.stockBaskets}can].`
                });
            }
        }

        // 4. Aplicar reversión real de productos anteriores
        for (const item of previousItems) {
            await connection.query(
                'UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [Number(item.qtyUnits || 0) * prevMultiplier, Number(item.qtyPounds || 0) * prevMultiplier, Number(item.qtyBaskets || 0) * prevMultiplier, item.productId]
            );
        }

        // 5. Actualizar encabezado del movimiento
        await connection.query(
            'UPDATE movements SET type = ?, equipment = ?, carrier = ?, seal = ?, refType = ?, refNumber = ?, date = ?, timeStart = ?, timeEnd = ?, auditUser = ? WHERE id = ?',
            [type, equipment || '', carrier || '', seal || '', refType || '', refNumber || '', date, timeStart || null, timeEnd || null, actor, id]
        );

        // 6. Reemplazar items y servicios
        await connection.query('DELETE FROM movement_items WHERE movementId = ?', [id]);
        await connection.query('DELETE FROM services WHERE movementId = ?', [id]);

        for (const item of items) {
            await connection.query(
                'INSERT INTO movement_items (movementId, productId, temperature, qtyUnits, qtyPounds, qtyBaskets) VALUES (?, ?, ?, ?, ?, ?)',
                [id, item.productId, item.temperature !== undefined ? item.temperature : null, item.qtyUnits || 0, item.qtyPounds || 0, item.qtyBaskets || 0]
            );
            await connection.query(
                'UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [Number(item.qtyUnits || 0) * newMultiplier, Number(item.qtyPounds || 0) * newMultiplier, Number(item.qtyBaskets || 0) * newMultiplier, item.productId]
            );
        }

        if (services && services.length > 0) {
            for (const service of services) {
                await connection.query(
                    'INSERT INTO services (movementId, description, value) VALUES (?, ?, ?)',
                    [id, service.description || '', service.value || 0]
                );
            }
        }

        // Auditoría dentro de la misma transacción
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'UPDATE_MOVEMENT',
            module: 'movements',
            details: `Modificación de movimiento ID '${id}' (Tipo: ${type}, Ref: ${refType || ''} ${refNumber || ''})`,
            connection
        });

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Eliminar Movimiento con verificación de no negatividad de stock y bloqueo de cortes
router.delete('/movements/:id', requirePermission('movements', 'delete'), async (req, res) => {
    const { id } = req.params;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        
        const [movRows] = await connection.query('SELECT *, DATE_FORMAT(date, "%Y-%m-%d") as dateStr FROM movements WHERE id=? FOR UPDATE', [id]);
        if (movRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Movimiento no encontrado.' });
        }

        const mov = movRows[0];

        // Verificar si la fecha pertenece a un corte bloqueado
        const lockError = await checkLockedCuts(connection, mov.dateStr);
        if (lockError) {
            await connection.rollback();
            return res.status(409).json({ error: lockError });
        }

        const [items] = await connection.query('SELECT * FROM movement_items WHERE movementId=?', [id]);
        const multiplier = mov.type === 'in' ? -1 : 1;

        // Si eliminamos una entrada ('in'), estamos restando existencias: verificar que no queden negativas
        if (mov.type === 'in' && items.length > 0) {
            const productIds = [...new Set(items.map(i => i.productId))];
            const [dbProducts] = await connection.query(
                'SELECT id, sku, stockUnits, stockPounds, stockBaskets FROM products WHERE id IN (?) FOR UPDATE',
                [productIds]
            );
            const prodMap = new Map(dbProducts.map(p => [p.id, {
                ...p,
                stockUnits: Number(p.stockUnits || 0),
                stockPounds: Number(p.stockPounds || 0),
                stockBaskets: Number(p.stockBaskets || 0)
            }]));

            for (const item of items) {
                const p = prodMap.get(item.productId);
                if (p) {
                    p.stockUnits -= Number(item.qtyUnits || 0);
                    p.stockPounds -= Number(item.qtyPounds || 0);
                    p.stockBaskets -= Number(item.qtyBaskets || 0);
                    if (p.stockUnits < 0 || p.stockPounds < -0.0001 || p.stockBaskets < 0) {
                        await connection.rollback();
                        return res.status(400).json({
                            error: `No es posible eliminar el movimiento de entrada: las existencias de '${p.sku}' ya fueron consumidas por salidas posteriores. Saldo restante sería [${p.stockUnits}u, ${p.stockPounds}lbs, ${p.stockBaskets}can].`
                        });
                    }
                }
            }
        }

        // Revertir stock
        for (const item of items) {
            await connection.query(
                'UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [Number(item.qtyUnits || 0) * multiplier, Number(item.qtyPounds || 0) * multiplier, Number(item.qtyBaskets || 0) * multiplier, item.productId]
            );
        }
        
        await connection.query('DELETE FROM movements WHERE id=?', [id]);

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'DELETE_MOVEMENT',
            module: 'movements',
            details: `Eliminación de movimiento ID '${id}' (Tipo: ${mov.type}, Ref: ${mov.refType || ''} ${mov.refNumber || ''})`,
            connection
        });

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Authentication
router.post('/auth/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    if (!cleanUser || !cleanPass) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT u.id, u.username, u.password, u.role, u.role_id, u.isActive, u.permissions, u.last_login,
                    r.name as roleName, r.permissions as rolePermissions
             FROM users u
             LEFT JOIN roles r ON u.role_id = r.id
             WHERE LOWER(u.username) = LOWER(?)`,
            [cleanUser]
        );

        const user = rows[0];
        
        // Comprobación segura: verificar primero que el usuario exista antes de llamar a bcrypt.compare
        if (!user) {
            await logSystemEvent({
                username: cleanUser,
                action: 'LOGIN_FAILED',
                module: 'auth',
                details: `Intento fallido de inicio de sesión: el usuario '${cleanUser}' no existe`,
                ip
            });
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        const isMatch = await bcrypt.compare(cleanPass, user.password);
        if (!isMatch) {
            await logSystemEvent({
                username: cleanUser,
                action: 'LOGIN_FAILED',
                module: 'auth',
                details: `Intento fallido de inicio de sesión para el usuario '${cleanUser}'`,
                ip
            });
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        if (user.isActive === 0 || user.isActive === false) {
            return res.status(403).json({ error: 'Cuenta desactivada por el administrador.' });
        }

        // Actualizar last_login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

        // Registrar sesión activa
        const sessionId = randomUUID();
        await pool.query(
            'INSERT INTO active_sessions (id, userId, username, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
            [sessionId, user.id, user.username, ip, userAgent.substring(0, 250)]
        );

        // Limpieza de sesiones con inactividad mayor a 1 día
        await pool.query('DELETE FROM active_sessions WHERE last_activity < DATE_SUB(NOW(), INTERVAL 1 DAY)');

        // Log en bitácora
        await logSystemEvent({
            userId: user.id,
            username: user.username,
            action: 'LOGIN',
            module: 'auth',
            details: `Inicio de sesión exitoso desde ${ip || 'red local'}`,
            ip
        });

        // Parsear permisos (prioridad: usuario -> rol)
        let parsedPermissions = null;
        if (user.permissions) {
            try { parsedPermissions = JSON.parse(user.permissions); } catch { parsedPermissions = null; }
        } else if (user.rolePermissions) {
            try { parsedPermissions = JSON.parse(user.rolePermissions); } catch { parsedPermissions = null; }
        }

        const safeUser = {
            id: user.id,
            username: user.username,
            role: user.role,
            role_id: user.role_id,
            roleName: user.roleName || (user.role === 'admin' ? 'Administrador' : 'Usuario'),
            isActive: user.isActive,
            permissions: parsedPermissions,
            last_login: new Date().toISOString()
        };

        // Generar JWT incluyendo el identificador de sesión activa
        const token = generateToken({ id: user.id, username: user.username, role: user.role, sessionId });

        res.json({ success: true, user: safeUser, sessionId, token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/auth/logout', async (req, res) => {
    const { sessionId } = req.body;
    const actor = req.user?.username || req.body.username || 'Usuario';
    const actorId = req.user?.id || req.body.userId || null;
    const currentSession = sessionId || req.user?.sessionId;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';

    try {
        if (currentSession) {
            await pool.query('DELETE FROM active_sessions WHERE id = ?', [currentSession]);
        } else if (actorId) {
            await pool.query('DELETE FROM active_sessions WHERE userId = ?', [actorId]);
        }

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'LOGOUT',
            module: 'auth',
            details: `Cierre de sesión de usuario '${actor}'`,
            ip
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Users
router.get('/users', requirePermission('security-users', 'view'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.username, u.role, u.role_id, u.isActive, u.permissions, u.last_login, u.created_at,
                   r.name as roleName, r.permissions as rolePermissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            ORDER BY u.id ASC
        `);
        const parsed = rows.map(u => {
            let perms = null;
            if (u.permissions) {
                try { perms = JSON.parse(u.permissions); } catch { perms = null; }
            } else if (u.rolePermissions) {
                try { perms = JSON.parse(u.rolePermissions); } catch { perms = null; }
            }
            return {
                id: u.id,
                username: u.username,
                role: u.role,
                role_id: u.role_id,
                roleName: u.roleName || (u.role === 'admin' ? 'Administrador' : 'Usuario'),
                isActive: u.isActive,
                permissions: perms,
                last_login: u.last_login,
                created_at: u.created_at
            };
        });
        res.json(parsed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/users', requirePermission('security-users', 'create'), async (req, res) => {
    const { username, password, role, role_id, permissions } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();

    if (!cleanUser || !cleanPass) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
    }

    if (cleanPass.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe contener al menos 8 caracteres.' });
    }

    // Prevención de escalamiento de privilegios: solo un administrador puede crear otro administrador
    if (role === 'admin' && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Solo un administrador puede crear usuarios con rol de Administrador.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(cleanPass, 10);
        const permJson = permissions ? JSON.stringify(permissions) : null;
        const [result] = await pool.query(
            'INSERT INTO users (username, password, role, role_id, isActive, permissions) VALUES (?, ?, ?, ?, 1, ?)',
            [cleanUser, hashedPassword, role || 'user', role_id || null, permJson]
        );
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'CREATE_USER',
            module: 'security-users',
            details: `Creación de usuario '${cleanUser}' con rol '${role || 'user'}'`
        });
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        sendApiError(res, error, 'Error al crear usuario');
    }
});

router.put('/users/:id', requirePermission('security-users', 'edit'), async (req, res) => {
    const { id } = req.params;
    const { username, password, role, role_id, isActive, permissions } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    const cleanUser = (username || '').trim();

    try {
        const [targetRows] = await pool.query('SELECT id, username, role, isActive FROM users WHERE id = ?', [id]);
        if (targetRows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const targetUser = targetRows[0];

        // Prevención de escalamiento de privilegios:
        // Solo un administrador puede modificar a un usuario administrador
        if (targetUser.role === 'admin' && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Solo un administrador puede modificar una cuenta de Administrador.' });
        }
        // Solo un administrador puede promover a un usuario al rol de administrador
        if (role === 'admin' && targetUser.role !== 'admin' && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Solo un administrador puede asignar el rol de Administrador.' });
        }

        // Prevención de bloqueo administrativo (Lockout):
        const willBeInactive = isActive === false || isActive === 0 || isActive === '0';
        if (willBeInactive) {
            if (Number(id) === Number(req.user?.id)) {
                return res.status(409).json({ error: 'No puedes desactivar tu propia cuenta de usuario activa.' });
            }
            if (targetUser.role === 'admin') {
                const [adminRows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = "admin" AND isActive = 1 AND id != ?', [id]);
                if (adminRows[0].count === 0) {
                    return res.status(409).json({ error: 'No es posible desactivar al único administrador activo del sistema.' });
                }
            }
        }

        const permJson = permissions ? JSON.stringify(permissions) : null;
        let passwordUpdated = false;

        if (password && password.trim() !== '') {
            const cleanPass = password.trim();
            if (cleanPass.length < 8) {
                return res.status(400).json({ error: 'La nueva contraseña debe contener al menos 8 caracteres.' });
            }
            const hashedPassword = await bcrypt.hash(cleanPass, 10);
            await pool.query(
                'UPDATE users SET username=?, password=?, role=?, role_id=?, isActive=?, permissions=? WHERE id=?',
                [cleanUser, hashedPassword, role || targetUser.role, role_id || null, willBeInactive ? 0 : 1, permJson, id]
            );
            passwordUpdated = true;
            // Revocar todas las sesiones activas del usuario cuya contraseña cambió
            await pool.query('DELETE FROM active_sessions WHERE userId = ?', [id]);
        } else {
            await pool.query(
                'UPDATE users SET username=?, role=?, role_id=?, isActive=?, permissions=? WHERE id=?',
                [cleanUser, role || targetUser.role, role_id || null, willBeInactive ? 0 : 1, permJson, id]
            );
        }

        // Si el usuario fue desactivado, revocar sus sesiones de inmediato
        if (willBeInactive) {
            await pool.query('DELETE FROM active_sessions WHERE userId = ?', [id]);
        }

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'UPDATE_USER',
            module: 'security-users',
            details: `Modificación de usuario ID ${id} (${cleanUser})${passwordUpdated ? ' (contraseña restablecida y sesiones revocadas)' : ''}`
        });
        res.json({ success: true });
    } catch (error) {
        sendApiError(res, error, 'Error al actualizar usuario');
    }
});

router.put('/users/:id/permissions', requirePermission('security-access', 'edit'), async (req, res) => {
    const { id } = req.params;
    const { permissions } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    // Solo un administrador con rol 'admin' puede alterar matrices de permisos
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Solo un administrador puede modificar directamente matrices de permisos.' });
    }

    try {
        const permJson = permissions ? JSON.stringify(permissions) : null;
        await pool.query('UPDATE users SET permissions=? WHERE id=?', [permJson, id]);
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'UPDATE_PERMISSIONS',
            module: 'security-access',
            details: `Actualización de matriz de permisos personalizados para usuario ID ${id}`
        });
        res.json({ success: true });
    } catch (error) {
        sendApiError(res, error, 'Error al actualizar permisos');
    }
});

router.delete('/users/:id', requirePermission('security-users', 'delete'), async (req, res) => {
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    // Prevenir auto-eliminación
    if (Number(req.params.id) === Number(req.user?.id)) {
        return res.status(409).json({ error: 'No puedes eliminar tu propia cuenta de usuario activa.' });
    }

    try {
        const [rows] = await pool.query('SELECT id, username, role, isActive FROM users WHERE id=?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const targetUser = rows[0];

        // Solo un administrador puede eliminar a otro administrador
        if (targetUser.role === 'admin' && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Solo un administrador puede eliminar una cuenta de Administrador.' });
        }

        // Prevenir eliminar al último administrador activo
        if (targetUser.role === 'admin') {
            const [adminRows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = "admin" AND isActive = 1 AND id != ?', [req.params.id]);
            if (adminRows[0].count === 0) {
                return res.status(409).json({ error: 'No es posible eliminar al único administrador activo del sistema.' });
            }
        }

        // Revocar sesiones activas asociadas al usuario eliminado
        await pool.query('DELETE FROM active_sessions WHERE userId = ?', [req.params.id]);
        await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'DELETE_USER',
            module: 'security-users',
            details: `Eliminación de usuario '${targetUser.username}' (ID ${req.params.id})`
        });
        res.json({ success: true });
    } catch (error) {
        sendApiError(res, error, 'Error al eliminar usuario');
    }
});

// Roles
router.get('/roles', requirePermission('security-roles', 'view'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM roles ORDER BY id ASC');
        const parsed = rows.map(r => ({
            ...r,
            permissions: r.permissions ? JSON.parse(r.permissions) : {}
        }));
        res.json(parsed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/roles', requirePermission('security-roles', 'create'), async (req, res) => {
    const { name, description, permissions } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    if (!name?.trim()) return res.status(400).json({ error: 'Nombre de rol obligatorio.' });
    try {
        const permJson = permissions ? JSON.stringify(permissions) : '{}';
        const [result] = await pool.query(
            'INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?)',
            [name.trim(), description || '', permJson]
        );
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'CREATE_ROLE',
            module: 'security-roles',
            details: `Creación de nuevo rol '${name.trim()}'`
        });
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/roles/:id', requirePermission('security-roles', 'edit'), async (req, res) => {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    try {
        const permJson = permissions ? JSON.stringify(permissions) : '{}';
        await pool.query(
            'UPDATE roles SET name=?, description=?, permissions=? WHERE id=?',
            [name.trim(), description || '', permJson, id]
        );
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'UPDATE_ROLE',
            module: 'security-roles',
            details: `Actualización de rol ID ${id} (${name})`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/roles/:id', requirePermission('security-roles', 'delete'), async (req, res) => {
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    try {
        await pool.query('DELETE FROM roles WHERE id=?', [req.params.id]);
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'DELETE_ROLE',
            module: 'security-roles',
            details: `Eliminación de rol ID ${req.params.id}`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// System Logs (Bitácora)
router.get('/system-logs', requirePermission('security-logs', 'view'), async (req, res) => {
    try {
        const { module, action, search, limit = 100 } = req.query;
        let query = "SELECT id, userId, username, action, module, details, ip_address, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as timestamp FROM system_logs WHERE 1=1";
        const params = [];

        if (module && module !== 'all') {
            query += " AND module = ?";
            params.push(module);
        }
        if (action && action !== 'all') {
            query += " AND action = ?";
            params.push(action);
        }
        if (search) {
            query += " AND (username LIKE ? OR details LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        query += " ORDER BY created_at DESC LIMIT ?";
        params.push(Number(limit));

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/system-logs', async (req, res) => {
    const { action, module, details } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    try {
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: action || 'ACTION',
            module: module || 'system',
            details: details || '',
            ip
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Active Sessions
router.get('/active-sessions', requirePermission('security-sessions', 'view'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, userId, username, ip_address, user_agent,
                   DATE_FORMAT(last_activity, '%Y-%m-%d %H:%i:%s') as last_activity,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as login_time
            FROM active_sessions
            WHERE last_activity >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
            ORDER BY last_activity DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/active-sessions/heartbeat', async (req, res) => {
    const { sessionId, userAgent } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const ua = userAgent || req.headers['user-agent'] || 'Navegador Web';
    const currentSession = req.user?.sessionId || sessionId;

    if (!currentSession) {
        return res.status(401).json({ success: false, revoked: true, error: 'Sesión no especificada.' });
    }

    try {
        const [updateResult] = await pool.query(
            'UPDATE active_sessions SET last_activity = NOW(), user_agent = ?, ip_address = ? WHERE id = ? AND userId = ?',
            [ua, ip, currentSession, req.user.id]
        );

        // Si la sesión fue eliminada en base de datos o no pertenece al usuario, rechazar
        if (updateResult.affectedRows === 0) {
            return res.status(401).json({ 
                success: false, 
                revoked: true, 
                error: 'Sesión finalizada, revocada o no pertenece al usuario autenticado.' 
            });
        }

        res.json({ success: true, sessionId: currentSession });
    } catch (error) {
        sendApiError(res, error, 'Error al actualizar sesión activa');
    }
});

router.delete('/active-sessions/:id', requirePermission('security-sessions', 'delete'), async (req, res) => {
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    try {
        await pool.query('DELETE FROM active_sessions WHERE id = ?', [req.params.id]);
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'REVOKE_SESSION',
            module: 'security-sessions',
            details: `Revocación manual de sesión ID '${req.params.id}'`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Notifications
router.get('/notifications', async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;
        let query = "SELECT id, userId, title, message, type, isRead, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as date FROM notifications WHERE (userId IS NULL";
        const params = [];
        if (userId) {
            query += " OR userId = ?";
            params.push(userId);
        }
        query += ") ORDER BY created_at DESC LIMIT 50";
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/notifications', requirePermission('security-notifications', 'create'), async (req, res) => {
    const { userId, title, message, type } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Título y mensaje requeridos.' });
    try {
        const id = randomUUID();
        await pool.query(
            'INSERT INTO notifications (id, userId, title, message, type) VALUES (?, ?, ?, ?, ?)',
            [id, userId || null, title, message, type || 'info']
        );
        res.json({ success: true, id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/notifications/:id/read', async (req, res) => {
    try {
        const userId = req.user?.id || null;
        await pool.query('UPDATE notifications SET isRead = 1 WHERE id = ? AND (userId = ? OR userId IS NULL)', [req.params.id, userId]);
        res.json({ success: true });
    } catch (error) {
        sendApiError(res, error, 'Error al marcar notificación como leída');
    }
});

router.put('/notifications/read-all', async (req, res) => {
    const userId = req.user?.id || req.body.userId;
    try {
        if (userId) {
            await pool.query('UPDATE notifications SET isRead = 1 WHERE userId IS NULL OR userId = ?', [userId]);
        } else {
            await pool.query('UPDATE notifications SET isRead = 1');
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/config', async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM categories');
        const [docTypes] = await pool.query('SELECT * FROM document_types');
        res.json({ categories, docTypes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/config/categories', requirePermission('settings', 'edit'), async (req, res) => {
    const { name, unit_type } = req.body;
    try {
        await pool.query('INSERT INTO categories (name, unit_type) VALUES (?, ?)', [name, unit_type || 'units']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/config/categories/:name', requirePermission('settings', 'edit'), async (req, res) => {
    const { unit_type } = req.body;
    try {
        await pool.query('UPDATE categories SET unit_type=? WHERE name=?', [unit_type, decodeURIComponent(req.params.name)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/config/categories/:name', requirePermission('settings', 'edit'), async (req, res) => {
    try {
        await pool.query('DELETE FROM categories WHERE name = ?', [decodeURIComponent(req.params.name)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/config/document-types', requirePermission('settings', 'edit'), async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO document_types (name) VALUES (?)', [name]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/config/document-types/:name', requirePermission('settings', 'edit'), async (req, res) => {
    try {
        await pool.query('DELETE FROM document_types WHERE name = ?', [decodeURIComponent(req.params.name)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/settings', requirePermission('settings', 'view'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
        res.json(rows[0] || { name: 'Inventario Pro', logo: null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/settings', requirePermission('settings', 'edit'), async (req, res) => {
    const { name, logo } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    try {
        await pool.query('INSERT INTO settings (id, name, logo) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE name = ?, logo = ?', 
        [name, logo, name, logo]);
        
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'UPDATE_SETTINGS',
            module: 'settings',
            details: 'Actualización de configuración general de almacén'
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Versions & Changelog
router.get('/versions', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, version, description, changes, author, DATE_FORMAT(created_at, '%Y-%m-%d') as date, DATE_FORMAT(created_at, '%H:%i') as time FROM versions ORDER BY id DESC");
        const parsed = rows.map(v => {
            let chList = [];
            if (v.changes) {
                try { chList = JSON.parse(v.changes); } catch { chList = [v.changes]; }
            }
            return { ...v, changes: chList };
        });
        res.json(parsed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/versions', requirePermission('security-changelog', 'create'), async (req, res) => {
    const { description, changes } = req.body;
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const [maxRows] = await connection.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM versions');
        const nextVersion = `V${maxRows[0].maxId + 1}`;
        const changesJson = changes ? JSON.stringify(Array.isArray(changes) ? changes : [changes]) : '[]';
        await connection.query(
            'INSERT INTO versions (version, description, changes, author) VALUES (?, ?, ?, ?)',
            [nextVersion, description || '', changesJson, actor]
        );

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'CREATE_VERSION',
            module: 'security-changelog',
            details: `Publicación de nueva versión '${nextVersion}': ${description || ''}`,
            connection
        });

        await connection.commit();
        res.json({ success: true, version: nextVersion });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.delete('/versions/:id', requirePermission('security-changelog', 'delete'), async (req, res) => {
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;

    try {
        await pool.query('DELETE FROM versions WHERE id=?', [req.params.id]);
        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'DELETE_VERSION',
            module: 'security-changelog',
            details: `Eliminación de versión ID ${req.params.id}`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CORTES DIARIOS CONGELADOS (DAILY CUTS)
// ==========================================

router.get('/daily-cuts', requirePermission('summary2', 'view'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT *
            FROM daily_cuts
            ORDER BY startDate DESC, created_at DESC
        `);

        const cuts = rows.map(r => {
            let totals = {};
            let congelados = [];
            let preparados = [];
            let services = [];
            try {
                totals = typeof r.totalsData === 'string' ? JSON.parse(r.totalsData) : (r.totalsData || {});
            } catch { totals = {}; }
            try {
                congelados = typeof r.congeladosData === 'string' ? JSON.parse(r.congeladosData) : (r.congeladosData || []);
            } catch { congelados = []; }
            try {
                preparados = typeof r.preparadosData === 'string' ? JSON.parse(r.preparadosData) : (r.preparadosData || []);
            } catch { preparados = []; }
            try {
                services = typeof r.servicesData === 'string' ? JSON.parse(r.servicesData) : (r.servicesData || []);
            } catch { services = []; }

            const cleanStart = r.startDate instanceof Date 
                ? r.startDate.toISOString().split('T')[0] 
                : String(r.startDate || '').split('T')[0];
            const cleanEnd = r.endDate instanceof Date 
                ? r.endDate.toISOString().split('T')[0] 
                : String(r.endDate || '').split('T')[0];

            return {
                ...r,
                startDate: cleanStart,
                endDate: cleanEnd,
                isLocked: Boolean(r.isLocked),
                congeladosData: congelados,
                preparadosData: preparados,
                servicesData: services,
                totals
            };
        });

        res.json(cuts);
    } catch (error) {
        console.error('Error fetching daily cuts:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/daily-cuts/:id', requirePermission('summary2', 'view'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM daily_cuts WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Corte no encontrado' });
        }
        const cut = rows[0];
        const cleanStart = cut.startDate instanceof Date 
            ? cut.startDate.toISOString().split('T')[0] 
            : String(cut.startDate || '').split('T')[0];
        const cleanEnd = cut.endDate instanceof Date 
            ? cut.endDate.toISOString().split('T')[0] 
            : String(cut.endDate || '').split('T')[0];

        res.json({
            ...cut,
            startDate: cleanStart,
            endDate: cleanEnd,
            isLocked: Boolean(cut.isLocked),
            congeladosData: typeof cut.congeladosData === 'string' ? JSON.parse(cut.congeladosData || '[]') : cut.congeladosData,
            preparadosData: typeof cut.preparadosData === 'string' ? JSON.parse(cut.preparadosData || '[]') : cut.preparadosData,
            servicesData: typeof cut.servicesData === 'string' ? JSON.parse(cut.servicesData || '[]') : cut.servicesData,
            totalsData: typeof cut.totalsData === 'string' ? JSON.parse(cut.totalsData || '{}') : cut.totalsData
        });
    } catch (error) {
        console.error('Error fetching daily cut by id:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/daily-cuts', requirePermission('summary2', 'edit'), async (req, res) => {
    try {
        const {
            id = randomUUID(),
            title,
            clientName,
            startDate,
            endDate,
            isLocked = 1,
            congeladosData = [],
            preparadosData = [],
            servicesData = [],
            totalsData = {}
        } = req.body;
        const actor = req.user?.username || 'admin';
        const actorId = req.user?.id || null;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Las fechas de inicio y fin son obligatorias.' });
        }

        const autoTitle = title || `Corte ${startDate} al ${endDate}`;
        const autoClient = clientName || 'SUPER SELECTOS';

        const jsonCongelados = typeof congeladosData === 'string' ? congeladosData : JSON.stringify(congeladosData);
        const jsonPreparados = typeof preparadosData === 'string' ? preparadosData : JSON.stringify(preparadosData);
        const jsonServices = typeof servicesData === 'string' ? servicesData : JSON.stringify(servicesData);
        const jsonTotals = typeof totalsData === 'string' ? totalsData : JSON.stringify(totalsData);

        await pool.query(
            `INSERT INTO daily_cuts 
            (id, title, clientName, startDate, endDate, isLocked, congeladosData, preparadosData, servicesData, totalsData, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, autoTitle, autoClient, startDate, endDate, isLocked ? 1 : 0, jsonCongelados, jsonPreparados, jsonServices, jsonTotals, actor]
        );

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'FREEZE_DAILY_CUT',
            module: 'summary2',
            details: `Cierre y congelamiento de corte diario '${autoTitle}' (${startDate} al ${endDate})`
        });

        res.status(201).json({
            success: true,
            id,
            title: autoTitle,
            clientName: autoClient,
            startDate,
            endDate,
            isLocked: Boolean(isLocked),
            created_by: actor
        });
    } catch (error) {
        console.error('Error creating daily cut:', error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar datos de un corte existente (rechaza si está bloqueado)
router.put('/daily-cuts/:id', requirePermission('summary2', 'edit'), async (req, res) => {
    try {
        const {
            title,
            clientName,
            startDate,
            endDate,
            congeladosData,
            preparadosData,
            servicesData,
            totalsData
        } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        const [existing] = await pool.query('SELECT * FROM daily_cuts WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Corte no encontrado para actualizar.' });
        }

        const current = existing[0];

        // Impedir modificación de datos en cortes bloqueados
        if (current.isLocked === 1) {
            return res.status(409).json({ 
                error: 'El corte diario se encuentra bloqueado. Para modificar sus datos debe desbloquearlo expresamente primero.' 
            });
        }

        const newTitle = title !== undefined ? title : current.title;
        const newClient = clientName !== undefined ? clientName : current.clientName;
        const newStartDate = startDate !== undefined ? startDate : current.startDate;
        const newEndDate = endDate !== undefined ? endDate : current.endDate;

        const newCongelados = congeladosData !== undefined 
            ? (typeof congeladosData === 'string' ? congeladosData : JSON.stringify(congeladosData))
            : current.congeladosData;

        const newPreparados = preparadosData !== undefined
            ? (typeof preparadosData === 'string' ? preparadosData : JSON.stringify(preparadosData))
            : current.preparadosData;

        const newServices = servicesData !== undefined
            ? (typeof servicesData === 'string' ? servicesData : JSON.stringify(servicesData))
            : current.servicesData;

        const newTotals = totalsData !== undefined
            ? (typeof totalsData === 'string' ? totalsData : JSON.stringify(totalsData))
            : current.totalsData;

        await pool.query(
            `UPDATE daily_cuts 
            SET title = ?, clientName = ?, startDate = ?, endDate = ?, 
                congeladosData = ?, preparadosData = ?, servicesData = ?, totalsData = ?
            WHERE id = ?`,
            [newTitle, newClient, newStartDate, newEndDate, newCongelados, newPreparados, newServices, newTotals, req.params.id]
        );

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'UPDATE_DAILY_CUT',
            module: 'summary2',
            details: `Actualización de corte diario '${newTitle}' (ID ${req.params.id})`
        });

        res.json({
            success: true,
            id: req.params.id,
            title: newTitle,
            isLocked: false
        });
    } catch (error) {
        console.error('Error updating daily cut:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint explícito para Bloquear / Desbloquear corte diario con motivo auditado
router.put('/daily-cuts/:id/lock-status', requirePermission('summary2', 'edit'), async (req, res) => {
    try {
        const { isLocked, reason } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        const [existing] = await pool.query('SELECT id, title, isLocked FROM daily_cuts WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Corte diario no encontrado.' });
        }

        const current = existing[0];
        const newLockState = isLocked ? 1 : 0;

        await pool.query('UPDATE daily_cuts SET isLocked = ? WHERE id = ?', [newLockState, req.params.id]);

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: newLockState === 1 ? 'LOCK_DAILY_CUT' : 'UNLOCK_DAILY_CUT',
            module: 'summary2',
            details: `Cambio de bloqueo para corte diario '${current.title}': ${newLockState === 1 ? 'BLOQUEADO' : 'DESBLOQUEADO'}. Justificación: ${reason || 'Sin justificación provista'}`
        });

        res.json({
            success: true,
            id: req.params.id,
            isLocked: Boolean(newLockState)
        });
    } catch (error) {
        console.error('Error changing daily cut lock status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un corte registrado (solo permitido si está desbloqueado)
router.delete('/daily-cuts/:id', requirePermission('summary2', 'edit'), async (req, res) => {
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    try {
        const [existing] = await pool.query('SELECT id, title, isLocked FROM daily_cuts WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Corte no encontrado.' });
        }

        if (existing[0].isLocked === 1) {
            return res.status(409).json({ error: 'No se puede eliminar un corte diario bloqueado. Debe desbloquearse primero.' });
        }

        await pool.query('DELETE FROM daily_cuts WHERE id = ?', [req.params.id]);

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'DELETE_DAILY_CUT',
            module: 'summary2',
            details: `Eliminación de corte diario '${existing[0].title}' (ID ${req.params.id})`
        });

        res.json({ success: true, id: req.params.id });
    } catch (error) {
        console.error('Error deleting daily cut:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CORTES DE SEGURO (INSURANCE CUTS)
// ==========================================

router.get('/insurance-cuts', requirePermission('insurance', 'view'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT *
            FROM insurance_cuts
            ORDER BY cutoffDate DESC, created_at DESC
        `);

        const cuts = rows.map(r => {
            let totals = {};
            let rowsData = [];
            try {
                totals = typeof r.totalsData === 'string' ? JSON.parse(r.totalsData) : (r.totalsData || {});
            } catch { totals = {}; }
            try {
                rowsData = typeof r.rowsData === 'string' ? JSON.parse(r.rowsData) : (r.rowsData || []);
            } catch { rowsData = []; }

            const cleanStart = r.startDate 
                ? (r.startDate instanceof Date ? r.startDate.toISOString().split('T')[0] : String(r.startDate).split('T')[0])
                : null;
            const cleanCutoff = r.cutoffDate instanceof Date 
                ? r.cutoffDate.toISOString().split('T')[0] 
                : String(r.cutoffDate || '').split('T')[0];

            return {
                ...r,
                startDate: cleanStart,
                cutoffDate: cleanCutoff,
                premiumRate: Number(r.premiumRate || 0.10),
                isLocked: Boolean(r.isLocked),
                rowsData,
                totals
            };
        });

        res.json(cuts);
    } catch (error) {
        console.error('Error fetching insurance cuts:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/insurance-cuts/:id', requirePermission('insurance', 'view'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM insurance_cuts WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Corte de seguro no encontrado' });
        }
        const cut = rows[0];
        const cleanStart = cut.startDate 
            ? (cut.startDate instanceof Date ? cut.startDate.toISOString().split('T')[0] : String(cut.startDate).split('T')[0])
            : null;
        const cleanCutoff = cut.cutoffDate instanceof Date 
            ? cut.cutoffDate.toISOString().split('T')[0] 
            : String(cut.cutoffDate || '').split('T')[0];

        res.json({
            ...cut,
            startDate: cleanStart,
            cutoffDate: cleanCutoff,
            premiumRate: Number(cut.premiumRate || 0.10),
            isLocked: Boolean(cut.isLocked),
            rowsData: typeof cut.rowsData === 'string' ? JSON.parse(cut.rowsData || '[]') : cut.rowsData,
            totalsData: typeof cut.totalsData === 'string' ? JSON.parse(cut.totalsData || '{}') : cut.totalsData
        });
    } catch (error) {
        console.error('Error fetching insurance cut by id:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/insurance-cuts', requirePermission('insurance', 'edit'), async (req, res) => {
    try {
        const {
            id = randomUUID(),
            title,
            customerName = 'AVICOLA SALVADOREÑA S.A. DE C.V.',
            warehouseName = 'ALMACENADORA LIL',
            startDate,
            cutoffDate,
            premiumRate = 0.10,
            isLocked = 1,
            rowsData = [],
            totalsData = {}
        } = req.body;
        const actor = req.user?.username || 'admin';
        const actorId = req.user?.id || null;

        if (!cutoffDate) {
            return res.status(400).json({ error: 'La fecha de corte es obligatoria.' });
        }

        const autoTitle = title || `Corte de Seguro al ${cutoffDate}`;
        const jsonRows = typeof rowsData === 'string' ? rowsData : JSON.stringify(rowsData);
        const jsonTotals = typeof totalsData === 'string' ? totalsData : JSON.stringify(totalsData);

        await pool.query(
            `INSERT INTO insurance_cuts 
            (id, title, customerName, warehouseName, startDate, cutoffDate, premiumRate, isLocked, rowsData, totalsData, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, autoTitle, customerName, warehouseName, startDate || null, cutoffDate, premiumRate, isLocked ? 1 : 0, jsonRows, jsonTotals, actor]
        );

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'FREEZE_INSURANCE_CUT',
            module: 'insurance',
            details: `Cierre y congelamiento de póliza de seguro '${autoTitle}' al ${cutoffDate}`
        });

        res.status(201).json({
            success: true,
            id,
            title: autoTitle,
            customerName,
            warehouseName,
            startDate,
            cutoffDate,
            premiumRate,
            isLocked: Boolean(isLocked),
            created_by: actor
        });
    } catch (error) {
        console.error('Error creating insurance cut:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/insurance-cuts/:id', requirePermission('insurance', 'edit'), async (req, res) => {
    try {
        const {
            title,
            customerName,
            warehouseName,
            startDate,
            cutoffDate,
            premiumRate,
            rowsData,
            totalsData
        } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        const [existing] = await pool.query('SELECT * FROM insurance_cuts WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Corte de seguro no encontrado para actualizar.' });
        }

        const current = existing[0];

        // Impedir modificación si el corte está bloqueado
        if (current.isLocked === 1) {
            return res.status(409).json({
                error: 'El corte de seguro se encuentra bloqueado. Para modificar sus datos debe desbloquearlo expresamente primero.'
            });
        }

        const newTitle = title !== undefined ? title : current.title;
        const newCustomer = customerName !== undefined ? customerName : current.customerName;
        const newWarehouse = warehouseName !== undefined ? warehouseName : current.warehouseName;
        const newStartDate = startDate !== undefined ? startDate : current.startDate;
        const newCutoffDate = cutoffDate !== undefined ? cutoffDate : current.cutoffDate;
        const newPremiumRate = premiumRate !== undefined ? premiumRate : current.premiumRate;

        const newRows = rowsData !== undefined 
            ? (typeof rowsData === 'string' ? rowsData : JSON.stringify(rowsData))
            : current.rowsData;

        const newTotals = totalsData !== undefined
            ? (typeof totalsData === 'string' ? totalsData : JSON.stringify(totalsData))
            : current.totalsData;

        await pool.query(
            `UPDATE insurance_cuts 
            SET title = ?, customerName = ?, warehouseName = ?, startDate = ?, cutoffDate = ?, 
                premiumRate = ?, rowsData = ?, totalsData = ?
            WHERE id = ?`,
            [newTitle, newCustomer, newWarehouse, newStartDate, newCutoffDate, newPremiumRate, newRows, newTotals, req.params.id]
        );

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'UPDATE_INSURANCE_CUT',
            module: 'insurance',
            details: `Actualización de corte de seguro '${newTitle}' (ID ${req.params.id})`
        });

        res.json({
            success: true,
            id: req.params.id,
            title: newTitle,
            isLocked: false
        });
    } catch (error) {
        console.error('Error updating insurance cut:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint explícito para Bloquear / Desbloquear corte de seguro con motivo auditado
router.put('/insurance-cuts/:id/lock-status', requirePermission('insurance', 'edit'), async (req, res) => {
    try {
        const { isLocked, reason } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        const [existing] = await pool.query('SELECT id, title, isLocked FROM insurance_cuts WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Corte de seguro no encontrado.' });
        }

        const current = existing[0];
        const newLockState = isLocked ? 1 : 0;

        await pool.query('UPDATE insurance_cuts SET isLocked = ? WHERE id = ?', [newLockState, req.params.id]);

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: newLockState === 1 ? 'LOCK_INSURANCE_CUT' : 'UNLOCK_INSURANCE_CUT',
            module: 'insurance',
            details: `Cambio de bloqueo para corte de seguro '${current.title}': ${newLockState === 1 ? 'BLOQUEADO' : 'DESBLOQUEADO'}. Justificación: ${reason || 'Sin justificación provista'}`
        });

        res.json({
            success: true,
            id: req.params.id,
            isLocked: Boolean(newLockState)
        });
    } catch (error) {
        console.error('Error changing insurance cut lock status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar corte de seguro registrado (solo permitido si está desbloqueado)
router.delete('/insurance-cuts/:id', requirePermission('insurance', 'edit'), async (req, res) => {
    const actor = req.user?.username || 'Sistema';
    const actorId = req.user?.id || null;
    try {
        const [existing] = await pool.query('SELECT id, title, isLocked FROM insurance_cuts WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Corte de seguro no encontrado.' });
        }

        if (existing[0].isLocked === 1) {
            return res.status(409).json({ error: 'No se puede eliminar un corte de seguro bloqueado. Debe desbloquearse primero.' });
        }

        await pool.query('DELETE FROM insurance_cuts WHERE id = ?', [req.params.id]);

        await logSystemEvent({
            userId: actorId,
            username: actor,
            action: 'DELETE_INSURANCE_CUT',
            module: 'insurance',
            details: `Eliminación de corte de seguro '${existing[0].title}' (ID ${req.params.id})`
        });

        res.json({ success: true, id: req.params.id });
    } catch (error) {
        console.error('Error deleting insurance cut:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mount router under /api
app.use('/api', apiLimiter, (req, res, next) => {
    // Rutas públicas que no requieren token
    const publicRoutes = ['/health', '/auth/login', '/version'];
    if (publicRoutes.includes(req.path)) {
        return next();
    }
    // Proteger todas las demás rutas con verificación de token y sesión activa
    verifyToken(req, res, next);
}, router);

// Middleware centralizado de manejo de errores (captura excepciones no controladas y sanitiza en producción)
app.use((err, req, res, _next) => {
    sendApiError(res, err, 'Error interno en el servidor');
});

// Export for Vercel
export default app;

// Standalone execution for local development
const isDirectRun = Boolean(process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('api\\index.js')));

if (isDirectRun && process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 3001; 
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
