import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import pool, { ensureSchema } from './db.js';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { verifyToken, generateToken } from './middleware/auth.js';

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

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
        // Do not block requests even if schema check timed out
        isInitialized = true;
    }
};

app.use(async (req, res, next) => {
    if (!isInitialized) {
        await initializeApp();
    }
    next();
});

// Diagnostics
router.get('/health', async (req, res) => {
    let dbStatus = 'checking...';
    let userCount = 0;
    try {
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM users');
        userCount = rows[0].count;
        dbStatus = 'connected';
    } catch (err) {
        dbStatus = `error: ${err.message}`;
    }
    res.json({ 
        status: 'ok', 
        db: dbStatus,
        users: userCount,
        time: new Date().toISOString(), 
        env: process.env.NODE_ENV,
        hasHost: !!process.env.DB_HOST,
        hasUser: !!process.env.DB_USER
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
    } catch (e) {}
    res.json({ version: '1.3.98', displayVersion: 'v1.3.98', build: 98, commit: 'local' });
});


// Products con soporte de paginación y búsqueda server-side
router.get('/products', async (req, res) => {
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

router.post('/products', async (req, res) => {
    const { id, sku, description, category, price, stockUnits, stockPounds, stockBaskets } = req.body;
    try {
        await pool.query('INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [id, sku || '', description || '', category || '', price || 0, stockUnits || 0, stockPounds || 0, stockBaskets || 0]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/products/:id', async (req, res) => {
    const { id } = req.params;
    const { sku, description, category, price, stockUnits, stockPounds, stockBaskets } = req.body;
    try {
        await pool.query('UPDATE products SET sku=?, description=?, category=?, price=?, stockUnits=?, stockPounds=?, stockBaskets=? WHERE id=?', 
        [sku, description, category, price, stockUnits, stockPounds, stockBaskets, id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/inventory-adjustments', async (req, res) => {
    const { productId, stockUnits, stockPounds, stockBaskets, reason, auditUser } = req.body;
    const countedUnits = Number(stockUnits);
    const countedPounds = Number(stockPounds);
    const countedBaskets = Number(stockBaskets);

    if (!productId || !reason?.trim() || !auditUser?.trim()) {
        return res.status(400).json({ error: 'Producto, motivo y usuario son obligatorios.' });
    }

    if (![countedUnits, countedPounds, countedBaskets].every(Number.isFinite)
        || countedUnits < 0 || countedPounds < 0 || countedBaskets < 0
        || !Number.isInteger(countedUnits) || !Number.isInteger(countedBaskets)) {
        return res.status(400).json({ error: 'Las existencias deben ser valores válidos y no negativos.' });
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
                auditUser.trim()
            ]
        );

        await connection.query(
            'UPDATE products SET stockUnits = ?, stockPounds = ?, stockBaskets = ? WHERE id = ?',
            [countedUnits, countedPounds, countedBaskets, productId]
        );

        const [updatedProducts] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
        await connection.commit();

        await logSystemEvent({
            username: auditUser.trim(),
            action: 'INVENTORY_ADJUSTMENT',
            module: 'inventory-count',
            details: `Ajuste de existencias producto '${product.sku}' (${product.description || ''}). Motivo: ${reason.trim()}`
        });

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
                auditUser: auditUser.trim()
            }
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.get('/inventory-adjustments', async (req, res) => {
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

router.delete('/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk Import / Price Update from Excel
router.post('/products/bulk-sync', async (req, res) => {
    const { items, createIfNotExists = true, auditUser = 'admin' } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'No se enviaron productos para procesar.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [existingProducts] = await connection.query('SELECT id, sku, description, price, category FROM products');
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
                // Update price and optionally description if provided
                if (price > 0 || desc) {
                    await connection.query(
                        'UPDATE products SET price = COALESCE(NULLIF(?, 0), price), description = COALESCE(NULLIF(?, ""), description) WHERE id = ?',
                        [price, desc, existing.id]
                    );
                    updatedCount++;
                }
            } else if (createIfNotExists) {
                const newId = crypto.randomUUID();
                await connection.query(
                    'INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, ?, ?, 0, 0, 0)',
                    [newId, sku, desc || `Producto ${sku}`, cat, price]
                );
                createdCount++;
            }
        }

        await connection.commit();

        await logSystemEvent({
            username: auditUser,
            action: 'UPDATE_PRODUCT',
            module: 'products',
            details: `Actualización masiva vía Excel: ${updatedCount} precios actualizados, ${createdCount} productos creados.`
        });

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
router.get('/movements', async (req, res) => {
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

router.post('/movements', async (req, res) => {
    const { id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser, items, services } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        await connection.query('INSERT INTO movements (id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, type, equipment || '', carrier || '', seal || '', refType || '', refNumber || '', date, timeStart, timeEnd, auditUser]);
        
        for (const item of items) {
            await connection.query('INSERT INTO movement_items (movementId, productId, temperature, qtyUnits, qtyPounds, qtyBaskets) VALUES (?, ?, ?, ?, ?, ?)',
            [id, item.productId, item.temperature, item.qtyUnits, item.qtyPounds, item.qtyBaskets]);
            
            const multiplier = type === 'in' ? 1 : -1;
            await connection.query('UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
            [item.qtyUnits * multiplier, item.qtyPounds * multiplier, item.qtyBaskets * multiplier, item.productId]);
        }
        
        if (services && services.length > 0) {
            for (const s of services) {
                await connection.query('INSERT INTO services (movementId, description, value) VALUES (?, ?, ?)',
                [id, s.description, s.value]);
            }
        }
        
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.put('/movements/:id', async (req, res) => {
    const { id } = req.params;
    const { type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser, items, services } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [movementRows] = await connection.query(
            'SELECT type FROM movements WHERE id = ? FOR UPDATE',
            [id]
        );

        if (movementRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Movimiento no encontrado' });
        }

        const [previousItems] = await connection.query(
            'SELECT productId, qtyUnits, qtyPounds, qtyBaskets FROM movement_items WHERE movementId = ?',
            [id]
        );

        const previousMultiplier = movementRows[0].type === 'in' ? -1 : 1;
        for (const item of previousItems) {
            await connection.query(
                'UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [item.qtyUnits * previousMultiplier, item.qtyPounds * previousMultiplier, item.qtyBaskets * previousMultiplier, item.productId]
            );
        }

        await connection.query(
            'UPDATE movements SET type = ?, equipment = ?, carrier = ?, seal = ?, refType = ?, refNumber = ?, date = ?, timeStart = ?, timeEnd = ?, auditUser = ? WHERE id = ?',
            [type, equipment || '', carrier || '', seal || '', refType || '', refNumber || '', date, timeStart, timeEnd, auditUser, id]
        );

        await connection.query('DELETE FROM movement_items WHERE movementId = ?', [id]);
        await connection.query('DELETE FROM services WHERE movementId = ?', [id]);

        const newMultiplier = type === 'in' ? 1 : -1;
        for (const item of items) {
            await connection.query(
                'INSERT INTO movement_items (movementId, productId, temperature, qtyUnits, qtyPounds, qtyBaskets) VALUES (?, ?, ?, ?, ?, ?)',
                [id, item.productId, item.temperature, item.qtyUnits, item.qtyPounds, item.qtyBaskets]
            );
            await connection.query(
                'UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [item.qtyUnits * newMultiplier, item.qtyPounds * newMultiplier, item.qtyBaskets * newMultiplier, item.productId]
            );
        }

        for (const service of services || []) {
            await connection.query(
                'INSERT INTO services (movementId, description, value) VALUES (?, ?, ?)',
                [id, service.description, service.value]
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.delete('/movements/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const [movRows] = await connection.query('SELECT * FROM movements WHERE id=?', [id]);
        if (movRows.length > 0) {
            const mov = movRows[0];
            const [items] = await connection.query('SELECT * FROM movement_items WHERE movementId=?', [id]);
            const multiplier = mov.type === 'in' ? -1 : 1;
            
            for (const item of items) {
                await connection.query('UPDATE products SET stockUnits = stockUnits + ?, stockPounds = stockPounds + ?, stockBaskets = stockBaskets + ? WHERE id = ?',
                [item.qtyUnits * multiplier, item.qtyPounds * multiplier, item.qtyBaskets * multiplier, item.productId]);
            }
        }
        
        await connection.query('DELETE FROM movements WHERE id=?', [id]);
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Helper for audit logging
const logSystemEvent = async ({ userId = null, username = 'Sistema', action, module, details, ip = '' }) => {
    try {
        const logId = randomUUID();
        await pool.query(
            'INSERT INTO system_logs (id, userId, username, action, module, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [logId, userId, username, action, module, details, ip || '']
        );
    } catch (err) {
        console.error('Error writing to system_logs:', err.message);
    }
};

// Authentication
router.post('/auth/login', async (req, res) => {
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
        
        // Verificar si la contraseña es correcta usando bcrypt
        // Si el usuario existe pero la contraseña aún no ha sido migrada (empieza sin $2b$), permitiremos comparar texto plano (opcional) pero como ya corrimos migración, exigimos bcrypt.
        const isMatch = await bcrypt.compare(cleanPass, user.password);

        if (!user || !isMatch) {
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

        // Update last_login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

        // Register active session
        const sessionId = randomUUID();
        await pool.query(
            'INSERT INTO active_sessions (id, userId, username, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
            [sessionId, user.id, user.username, ip, userAgent.substring(0, 250)]
        );

        // Clean older than 24h sessions
        await pool.query('DELETE FROM active_sessions WHERE last_activity < DATE_SUB(NOW(), INTERVAL 1 DAY)');

        // Log in bitacora
        await logSystemEvent({
            userId: user.id,
            username: user.username,
            action: 'LOGIN',
            module: 'auth',
            details: `Inicio de sesión exitoso desde ${ip || 'red local'}`,
            ip
        });

        // Parse permissions (user custom or role fallback)
        let parsedPermissions = null;
        if (user.permissions) {
            try { parsedPermissions = JSON.parse(user.permissions); } catch (e) {}
        } else if (user.rolePermissions) {
            try { parsedPermissions = JSON.parse(user.rolePermissions); } catch (e) {}
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

        // Generar JWT
        const token = generateToken({ id: user.id, username: user.username, role: user.role });

        res.json({ success: true, user: safeUser, sessionId, token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/auth/logout', async (req, res) => {
    const { userId, username, sessionId } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    try {
        if (sessionId) {
            await pool.query('DELETE FROM active_sessions WHERE id = ?', [sessionId]);
        } else if (userId) {
            await pool.query('DELETE FROM active_sessions WHERE userId = ?', [userId]);
        }
        if (username) {
            await logSystemEvent({
                userId: userId || null,
                username,
                action: 'LOGOUT',
                module: 'auth',
                details: `Cierre de sesión de usuario '${username}'`,
                ip
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Users (Protected: NO PASSWORDS returned)
router.get('/users', async (req, res) => {
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
                try { perms = JSON.parse(u.permissions); } catch (e) {}
            } else if (u.rolePermissions) {
                try { perms = JSON.parse(u.rolePermissions); } catch (e) {}
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

router.post('/users', async (req, res) => {
    const { username, password, role, role_id, permissions, auditUser } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        const permJson = permissions ? JSON.stringify(permissions) : null;
        const [result] = await pool.query(
            'INSERT INTO users (username, password, role, role_id, isActive, permissions) VALUES (?, ?, ?, ?, 1, ?)',
            [username.trim(), hashedPassword, role || 'user', role_id || null, permJson]
        );
        await logSystemEvent({
            username: auditUser || 'admin',
            action: 'CREATE_USER',
            module: 'users',
            details: `Creación de usuario '${username.trim()}' con rol '${role || 'user'}'`
        });
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { username, password, role, role_id, isActive, permissions, auditUser } = req.body;
    try {
        const permJson = permissions ? JSON.stringify(permissions) : null;
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password.trim(), 10);
            await pool.query(
                'UPDATE users SET username=?, password=?, role=?, role_id=?, isActive=?, permissions=? WHERE id=?',
                [username.trim(), hashedPassword, role || 'user', role_id || null, isActive !== false ? 1 : 0, permJson, id]
            );
        } else {
            await pool.query(
                'UPDATE users SET username=?, role=?, role_id=?, isActive=?, permissions=? WHERE id=?',
                [username.trim(), role || 'user', role_id || null, isActive !== false ? 1 : 0, permJson, id]
            );
        }
        await logSystemEvent({
            username: auditUser || 'admin',
            action: 'UPDATE_USER',
            module: 'users',
            details: `Modificación de usuario ID ${id} (${username})`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id/permissions', async (req, res) => {
    const { id } = req.params;
    const { permissions, auditUser } = req.body;
    try {
        const permJson = permissions ? JSON.stringify(permissions) : null;
        await pool.query('UPDATE users SET permissions=? WHERE id=?', [permJson, id]);
        await logSystemEvent({
            username: auditUser || 'admin',
            action: 'UPDATE_PERMISSIONS',
            module: 'security',
            details: `Actualización de matriz de permisos personalizados para usuario ID ${id}`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT username FROM users WHERE id=?', [req.params.id]);
        const userName = rows[0]?.username || req.params.id;
        await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
        await logSystemEvent({
            username: req.query.auditUser || 'admin',
            action: 'DELETE_USER',
            module: 'users',
            details: `Eliminación de usuario '${userName}' (ID ${req.params.id})`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Roles
router.get('/roles', async (req, res) => {
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

router.post('/roles', async (req, res) => {
    const { name, description, permissions, auditUser } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre de rol obligatorio.' });
    try {
        const permJson = permissions ? JSON.stringify(permissions) : '{}';
        const [result] = await pool.query(
            'INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?)',
            [name.trim(), description || '', permJson]
        );
        await logSystemEvent({
            username: auditUser || 'admin',
            action: 'CREATE_ROLE',
            module: 'security',
            details: `Creación de nuevo rol '${name.trim()}'`
        });
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/roles/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, permissions, auditUser } = req.body;
    try {
        const permJson = permissions ? JSON.stringify(permissions) : '{}';
        await pool.query(
            'UPDATE roles SET name=?, description=?, permissions=? WHERE id=?',
            [name.trim(), description || '', permJson, id]
        );
        await logSystemEvent({
            username: auditUser || 'admin',
            action: 'UPDATE_ROLE',
            module: 'security',
            details: `Actualización de rol ID ${id} (${name})`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/roles/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM roles WHERE id=?', [req.params.id]);
        await logSystemEvent({
            username: req.query.auditUser || 'admin',
            action: 'DELETE_ROLE',
            module: 'security',
            details: `Eliminación de rol ID ${req.params.id}`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// System Logs (Bitácora)
router.get('/system-logs', async (req, res) => {
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
    const { userId, username, action, module, details } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    try {
        await logSystemEvent({
            userId,
            username: username || 'Sistema',
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
router.get('/active-sessions', async (req, res) => {
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
    const { sessionId, userId, username, userAgent } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const ua = userAgent || req.headers['user-agent'] || 'Navegador Web';

    if (!sessionId && !username && !userId) {
        return res.json({ success: false });
    }

    try {
        let activeSessionId = sessionId;

        if (activeSessionId) {
            const [updateResult] = await pool.query(
                'UPDATE active_sessions SET last_activity = NOW(), user_agent = ?, ip_address = ? WHERE id = ?',
                [ua, ip, activeSessionId]
            );

            if (updateResult.affectedRows === 0 && username) {
                // Session ID was not found in DB, re-create it
                await pool.query(
                    'INSERT INTO active_sessions (id, userId, username, ip_address, user_agent, last_activity, created_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
                    [activeSessionId, userId || null, username, ip, ua]
                );
            }
        } else if (username) {
            // No sessionId provided, create a new active session
            activeSessionId = crypto.randomUUID();
            await pool.query(
                'INSERT INTO active_sessions (id, userId, username, ip_address, user_agent, last_activity, created_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
                [activeSessionId, userId || null, username, ip, ua]
            );
        }

        res.json({ success: true, sessionId: activeSessionId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/active-sessions/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM active_sessions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Notifications
router.get('/notifications', async (req, res) => {
    try {
        const { userId } = req.query;
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

router.post('/notifications', async (req, res) => {
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
        await pool.query('UPDATE notifications SET isRead = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/notifications/read-all', async (req, res) => {
    const { userId } = req.body;
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

router.post('/config/categories', async (req, res) => {
    const { name, unit_type } = req.body;
    try {
        await pool.query('INSERT INTO categories (name, unit_type) VALUES (?, ?)', [name, unit_type || 'units']);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/config/categories/:name', async (req, res) => {
    const { unit_type } = req.body;
    try {
        await pool.query('UPDATE categories SET unit_type=? WHERE name=?', [unit_type, decodeURIComponent(req.params.name)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/config/categories/:name', async (req, res) => {
    try {
        await pool.query('DELETE FROM categories WHERE name = ?', [decodeURIComponent(req.params.name)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/config/document-types', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO document_types (name) VALUES (?)', [name]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/config/document-types/:name', async (req, res) => {
    try {
        await pool.query('DELETE FROM document_types WHERE name = ?', [decodeURIComponent(req.params.name)]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/settings', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
        res.json(rows[0] || { name: 'Inventario Pro', logo: null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/settings', async (req, res) => {
    const { name, logo } = req.body;
    try {
        await pool.query('INSERT INTO settings (id, name, logo) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE name = ?, logo = ?', 
        [name, logo, name, logo]);
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
                try { chList = JSON.parse(v.changes); } catch (e) { chList = [v.changes]; }
            }
            return { ...v, changes: chList };
        });
        res.json(parsed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/versions', async (req, res) => {
    const { description, changes, author } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [maxRows] = await connection.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM versions');
        const nextVersion = `V${maxRows[0].maxId + 1}`;
        const changesJson = changes ? JSON.stringify(Array.isArray(changes) ? changes : [changes]) : '[]';
        await connection.query(
            'INSERT INTO versions (version, description, changes, author) VALUES (?, ?, ?, ?)',
            [nextVersion, description || '', changesJson, author || 'Admin']
        );
        await connection.commit();
        res.json({ success: true, version: nextVersion });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.delete('/versions/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM versions WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CORTES DIARIOS CONGELADOS (DAILY CUTS)
// ==========================================

// Listar todos los cortes registrados con detalle completo para continuidad y balance
router.get('/daily-cuts', async (req, res) => {
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
            } catch (e) { totals = {}; }
            try {
                congelados = typeof r.congeladosData === 'string' ? JSON.parse(r.congeladosData) : (r.congeladosData || []);
            } catch (e) { congelados = []; }
            try {
                preparados = typeof r.preparadosData === 'string' ? JSON.parse(r.preparadosData) : (r.preparadosData || []);
            } catch (e) { preparados = []; }
            try {
                services = typeof r.servicesData === 'string' ? JSON.parse(r.servicesData) : (r.servicesData || []);
            } catch (e) { services = []; }

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

// Obtener un corte específico por ID con todo su detalle de datos
router.get('/daily-cuts/:id', async (req, res) => {
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


// Crear y congelar un nuevo corte
router.post('/daily-cuts', async (req, res) => {
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
            totalsData = {},
            created_by = (req.user && req.user.username) || 'admin'
        } = req.body;

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
            [id, autoTitle, autoClient, startDate, endDate, isLocked ? 1 : 0, jsonCongelados, jsonPreparados, jsonServices, jsonTotals, created_by]
        );

        res.status(201).json({
            success: true,
            id,
            title: autoTitle,
            clientName: autoClient,
            startDate,
            endDate,
            isLocked: Boolean(isLocked),
            created_by
        });
    } catch (error) {
        console.error('Error creating daily cut:', error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un corte existente (datos editados, bloqueo / desbloqueo, totales)
router.put('/daily-cuts/:id', async (req, res) => {
    try {
        const {
            title,
            clientName,
            startDate,
            endDate,
            isLocked,
            congeladosData,
            preparadosData,
            servicesData,
            totalsData
        } = req.body;

        const [existing] = await pool.query('SELECT * FROM daily_cuts WHERE id = ?', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Corte no encontrado para actualizar' });
        }

        const current = existing[0];
        const newTitle = title !== undefined ? title : current.title;
        const newClient = clientName !== undefined ? clientName : current.clientName;
        const newStartDate = startDate !== undefined ? startDate : current.startDate;
        const newEndDate = endDate !== undefined ? endDate : current.endDate;
        const newIsLocked = isLocked !== undefined ? (isLocked ? 1 : 0) : current.isLocked;

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
            SET title = ?, clientName = ?, startDate = ?, endDate = ?, isLocked = ?, 
                congeladosData = ?, preparadosData = ?, servicesData = ?, totalsData = ?
            WHERE id = ?`,
            [newTitle, newClient, newStartDate, newEndDate, newIsLocked, newCongelados, newPreparados, newServices, newTotals, req.params.id]
        );

        res.json({
            success: true,
            id: req.params.id,
            title: newTitle,
            isLocked: Boolean(newIsLocked)
        });
    } catch (error) {
        console.error('Error updating daily cut:', error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un corte registrado
router.delete('/daily-cuts/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM daily_cuts WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Corte no encontrado' });
        }
        res.json({ success: true, id: req.params.id });
    } catch (error) {
        console.error('Error deleting daily cut:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mount router under /api
app.use('/api', (req, res, next) => {
    // Rutas públicas que no requieren token
    const publicRoutes = ['/health', '/auth/login'];
    if (publicRoutes.includes(req.path)) {
        return next();
    }
    // Proteger todas las demás rutas
    verifyToken(req, res, next);
}, router);

// Export for Vercel
export default app;

// Standalone execution for local development
const isDirectRun = import.meta.url.startsWith('file:') && 
                   (process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('api\\index.js')));

if (isDirectRun || process.env.NODE_ENV === 'development') {
    const PORT = process.env.PORT || 3001; 
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
