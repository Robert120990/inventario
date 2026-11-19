import pool from '../db.js';
import { requirePermission } from '../middleware/permissions.js';
import {
    logSystemEvent,
    sendApiError,
    recordSyncTombstone,
    checkEntityVersionConflict,
    checkLockedCuts
} from '../utils/helpers.js';

const validateMovementItems = (items) => {
    for (const item of items) {
        if (!item?.productId) {
            return 'Cada item del movimiento debe especificar un producto válido.';
        }
        const u = Number(item.qtyUnits ?? 0);
        const p = Number(item.qtyPounds ?? 0);
        const b = Number(item.qtyBaskets ?? 0);
        if (![u, p, b].every(Number.isFinite) || u < 0 || p < 0 || b < 0 || (u === 0 && p === 0 && b === 0)) {
            return 'Las cantidades deben ser positivas y no negativas.';
        }
    }
    return null;
};

export const registerMovementRoutes = (router) => {
    // Movements con soporte de paginación, filtros por fecha y búsqueda server-side
    router.get('/movements', requirePermission('movements', 'view'), async (req, res) => {
        try {
            const { page, limit, offset: rawOffset, startDate, endDate, type, search, envelope } = req.query;
            const hasLimitOrOffset = (limit !== undefined && limit !== '') || (rawOffset !== undefined && rawOffset !== '') || (page !== undefined && page !== '');
            const useEnvelope = (page !== undefined && page !== '') || envelope === 'true';

            let query = "SELECT id, type, equipment, carrier, seal, refType, refNumber, DATE_FORMAT(date, '%Y-%m-%d') as date, timeStart, timeEnd, auditUser, created_at, updated_at FROM movements WHERE 1=1";
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

            query += " ORDER BY date DESC, created_at DESC";

            let total = 0;
            let numLimit = 100;
            let numPage = 1;
            let numOffset = 0;

            if (hasLimitOrOffset) {
                numLimit = Math.max(1, parseInt(limit, 10) || 100);
                numPage = Math.max(1, parseInt(page, 10) || 1);
                numOffset = rawOffset !== undefined && rawOffset !== ''
                    ? Math.max(0, parseInt(rawOffset, 10) || 0)
                    : (numPage - 1) * numLimit;

                const [countResult] = await pool.query(countQuery, countParams);
                total = countResult[0].total;
                if (typeof res.setHeader === 'function') {
                    res.setHeader('X-Total-Count', String(total));
                }

                query += " LIMIT ? OFFSET ?";
                params.push(numLimit, numOffset);
            }

            const [rows] = await pool.query(query, params);

            if (rows.length === 0) {
                return useEnvelope
                    ? res.json({ data: [], total, page: numPage, limit: numLimit, offset: numOffset, totalPages: 0 })
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

            if (useEnvelope) {
                return res.json({
                    data: results,
                    total,
                    page: numPage,
                    limit: numLimit,
                    offset: numOffset,
                    totalPages: Math.ceil(total / numLimit)
                });
            }

            res.json(results);
        } catch (error) {
            sendApiError(res, error);
        }
    });

    // Crear Movimiento con validación de no negatividad de stock, bloqueo de cortes y actor autenticado
    router.post('/movements', requirePermission('movements', 'create'), async (req, res) => {
        const { id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, items, services } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        if (!id || !type || !date) {
            return res.status(400).json({ error: 'ID, tipo y fecha de movimiento son obligatorios.' });
        }

        if (!['in', 'out'].includes(type)) {
            return res.status(400).json({ error: "Tipo de movimiento inválido. Debe ser 'in' o 'out'." });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'El movimiento debe incluir al menos un producto.' });
        }

        const itemValidationError = validateMovementItems(items);
        if (itemValidationError) {
            return res.status(400).json({ error: itemValidationError });
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

            // 2. Bloquear y verificar existencia de los productos afectados (FOR UPDATE)
            const strictStock = req.body.strictStock === true;
            const stockWarnings = [];
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

            // Verificar que todos los productos existan en el catálogo y evaluar disponibilidad en salidas
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
                if (type === 'out' && (prod.stockUnits < reqQty.u || prod.stockPounds < reqQty.p || prod.stockBaskets < reqQty.b)) {
                    const warnMsg = `Saldo contable superado en salida de '${prod.sku}'. Solicitado: [${reqQty.u}u, ${reqQty.p}lbs, ${reqQty.b}can]. Disponible contable: [${prod.stockUnits}u, ${prod.stockPounds}lbs, ${prod.stockBaskets}can].`;
                    if (strictStock) {
                        await connection.rollback();
                        return res.status(400).json({
                            error: `Stock insuficiente para salida de '${prod.sku}'. Solicitado: [${reqQty.u}u, ${reqQty.p}lbs, ${reqQty.b}can]. Disponible actual: [${prod.stockUnits}u, ${prod.stockPounds}lbs, ${prod.stockBaskets}can].`
                        });
                    }
                    stockWarnings.push(warnMsg);
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
                    const qty = s.quantity !== undefined && s.quantity !== null ? Number(s.quantity) : 1;
                    const uPrice = s.unitPrice !== undefined && s.unitPrice !== null ? Number(s.unitPrice) : Number(s.value || 0);
                    await connection.query(
                        'INSERT INTO services (movementId, description, quantity, unitPrice, value) VALUES (?, ?, ?, ?, ?)',
                        [id, s.description || '', qty, uPrice, s.value || 0]
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
            res.json({ success: true, id, ...(stockWarnings.length > 0 ? { stockWarnings } : {}) });
        } catch (error) {
            await connection.rollback();
            sendApiError(res, error);
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

        if (!['in', 'out'].includes(type)) {
            return res.status(400).json({ error: "Tipo de movimiento inválido. Debe ser 'in' o 'out'." });
        }

        const itemValidationError = validateMovementItems(items);
        if (itemValidationError) {
            return res.status(400).json({ error: itemValidationError });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [movementRows] = await connection.query(
                'SELECT type, DATE_FORMAT(date, "%Y-%m-%d") as date, updated_at FROM movements WHERE id = ? FOR UPDATE',
                [id]
            );

            if (movementRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Movimiento no encontrado.' });
            }

            const existingMov = movementRows[0];

            if (checkEntityVersionConflict(req, existingMov)) {
                await connection.rollback();
                return res.status(409).json({
                    error: 'El movimiento fue modificado por otro usuario mientras trabajabas sin conexión.',
                    code: 'VERSION_CONFLICT',
                    serverRecord: existingMov
                });
            }

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
            ].filter(Boolean))];

            let dbProducts = [];
            if (allProductIds.length > 0) {
                [dbProducts] = await connection.query(
                    'SELECT id, sku, stockUnits, stockPounds, stockBaskets FROM products WHERE id IN (?) FOR UPDATE',
                    [allProductIds]
                );
            }

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

            // 3. Comprobar que ningún producto quede con saldo negativo si strictStock está activo
            const strictStock = req.body.strictStock === true;
            if (strictStock) {
                for (const p of prodMap.values()) {
                    if (p.stockUnits < 0 || p.stockPounds < -0.0001 || p.stockBaskets < 0) {
                        await connection.rollback();
                        return res.status(400).json({
                            error: `La modificación del movimiento generaría existencias negativas para '${p.sku}'. Saldo resultante: [${p.stockUnits}u, ${p.stockPounds}lbs, ${p.stockBaskets}can].`
                        });
                    }
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
                    const qty = service.quantity !== undefined && service.quantity !== null ? Number(service.quantity) : 1;
                    const uPrice = service.unitPrice !== undefined && service.unitPrice !== null ? Number(service.unitPrice) : Number(service.value || 0);
                    await connection.query(
                        'INSERT INTO services (movementId, description, quantity, unitPrice, value) VALUES (?, ?, ?, ?, ?)',
                        [id, service.description || '', qty, uPrice, service.value || 0]
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
            sendApiError(res, error);
        } finally {
            connection.release();
        }
    });

    // Eliminar Movimiento con verificación de no negatividad de stock, bloqueo FOR UPDATE y bloqueo de cortes
    router.delete('/movements/:id', requirePermission('movements', 'delete'), async (req, res) => {
        const { id } = req.params;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [movRows] = await connection.query(
                'SELECT *, DATE_FORMAT(date, "%Y-%m-%d") as dateStr FROM movements WHERE id=? FOR UPDATE',
                [id]
            );
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

            // Bloquear siempre las filas de productos afectados antes de revertir stock
            const productIds = [...new Set(items.map(i => i.productId).filter(Boolean))];
            let prodMap = new Map();
            if (productIds.length > 0) {
                const [dbProducts] = await connection.query(
                    'SELECT id, sku, stockUnits, stockPounds, stockBaskets FROM products WHERE id IN (?) FOR UPDATE',
                    [productIds]
                );
                prodMap = new Map(dbProducts.map(p => [p.id, {
                    ...p,
                    stockUnits: Number(p.stockUnits || 0),
                    stockPounds: Number(p.stockPounds || 0),
                    stockBaskets: Number(p.stockBaskets || 0)
                }]));
            }

            // Si eliminamos una entrada ('in') y strictStock está activo, verificar que no queden negativas
            const strictStock = req.query.strictStock === 'true' || req.body?.strictStock === true;
            if (strictStock && mov.type === 'in' && items.length > 0) {
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
            await recordSyncTombstone('movements', id, actor, connection);

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
            sendApiError(res, error);
        } finally {
            connection.release();
        }
    });
};
