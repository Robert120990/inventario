import pool from '../db.js';
import { randomUUID } from 'node:crypto';
import { requirePermission } from '../middleware/permissions.js';
import {
    logSystemEvent,
    sendApiError,
    recordSyncTombstone,
    checkEntityVersionConflict
} from '../utils/helpers.js';

export const registerProductRoutes = (router) => {
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
            sendApiError(res, error);
        }
    });

    router.post('/products', requirePermission('products', 'create'), async (req, res) => {
        const { id, sku, description, category, price, stockUnits, stockPounds, stockBaskets } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        try {
            await pool.query(
                'INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, sku || '', description || '', category || '', price || 0, stockUnits || 0, stockPounds || 0, stockBaskets || 0]
            );

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'CREATE_PRODUCT',
                module: 'products',
                details: `Creación de producto '${sku}' (${description || ''})`
            });

            res.json({ success: true });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
                return res.status(409).json({ error: `El código SKU "${sku}" ya existe en el catálogo.` });
            }
            sendApiError(res, error, 'Error al crear producto');
        }
    });

    router.put('/products/:id', requirePermission('products', 'edit'), async (req, res) => {
        const { id } = req.params;
        const { sku, description, category, price } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        try {
            if (req.body?.baseVersion || req.headers?.['x-base-version']) {
                const [existingRows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
                if (existingRows.length > 0 && checkEntityVersionConflict(req, existingRows[0])) {
                    return res.status(409).json({
                        error: 'El producto fue modificado en el servidor mientras trabajabas sin conexión.',
                        code: 'VERSION_CONFLICT',
                        serverRecord: existingRows[0]
                    });
                }
            }

            // Las existencias físicas (stockUnits, stockPounds, stockBaskets) no pueden modificarse aquí.
            // Se gestionan exclusivamente por /api/movements y /api/inventory-adjustments auditados.
            await pool.query(
                'UPDATE products SET sku=?, description=?, category=?, price=? WHERE id=?',
                [sku, description, category, price, id]
            );

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'UPDATE_PRODUCT',
                module: 'products',
                details: `Actualización de metadatos de producto ID ${id} (SKU: ${sku})`
            });

            res.json({ success: true });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
                return res.status(409).json({ error: `El código SKU "${sku}" ya está asignado a otro producto.` });
            }
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
            await recordSyncTombstone('products', req.params.id, actor);

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'DELETE_PRODUCT',
                module: 'products',
                details: `Eliminación de producto SKU '${prod.sku}' (ID ${req.params.id})`
            });

            res.json({ success: true });
        } catch (error) {
            if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
                return res.status(409).json({
                    error: 'No se puede eliminar este producto porque tiene movimientos o ajustes históricos asociados.'
                });
            }
            sendApiError(res, error, 'Error al eliminar producto');
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
            sendApiError(res, error);
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
            sendApiError(res, error);
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
            sendApiError(res, error);
        } finally {
            connection.release();
        }
    });
};
