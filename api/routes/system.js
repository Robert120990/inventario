import pool from '../db.js';
import { requirePermission, requireAdmin } from '../middleware/permissions.js';
import { formatSqlDateOnly, logSystemEvent, sendApiError } from '../utils/helpers.js';

const toJsonString = (val, fallback) => {
    if (val === undefined || val === null) {
        return fallback === null ? null : JSON.stringify(fallback);
    }
    return typeof val === 'string' ? val : JSON.stringify(val);
};

const formatSqlDateTime = (val) => {
    if (!val) return null;
    if (val instanceof Date) {
        return Number.isNaN(val.getTime()) ? null : val.toISOString().slice(0, 19).replace('T', ' ');
    }
    const str = String(val).trim();
    if (!str) return null;
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
        return d.toISOString().slice(0, 19).replace('T', ' ');
    }
    return str.slice(0, 19).replace('T', ' ');
};

export const registerSystemRoutes = (router) => {
    router.get('/system/database-stats', requirePermission('settings', 'view'), async (req, res) => {
        try {
            const [[prodCount]] = await pool.query('SELECT COUNT(*) as total FROM products');
            const [[movCount]] = await pool.query('SELECT COUNT(*) as total FROM movements');
            const [[itemCount]] = await pool.query('SELECT COUNT(*) as total FROM movement_items');
            const [[adjCount]] = await pool.query('SELECT COUNT(*) as total FROM inventory_adjustments');
            const [[catCount]] = await pool.query('SELECT COUNT(*) as total FROM categories');
            const [[logCount]] = await pool.query('SELECT COUNT(*) as total FROM system_logs');
            const [[usrCount]] = await pool.query('SELECT COUNT(*) as total FROM users');

            const counts = {
                products: Number(prodCount?.total || 0),
                movements: Number(movCount?.total || 0),
                movement_items: Number(itemCount?.total || 0),
                adjustments: Number(adjCount?.total || 0),
                categories: Number(catCount?.total || 0),
                logs: Number(logCount?.total || 0),
                system_logs: Number(logCount?.total || 0),
                users: Number(usrCount?.total || 0)
            };

            res.json({
                ...counts,
                tables: counts
            });
        } catch (error) {
            sendApiError(res, error, 'Error al consultar estadísticas de base de datos');
        }
    });

    router.get('/system/backup', requireAdmin, async (req, res) => {
        const actor = req.user?.username || 'admin';
        const actorId = req.user?.id || null;
        try {
            const [categories] = await pool.query('SELECT * FROM categories ORDER BY id ASC');
            const [document_types] = await pool.query('SELECT * FROM document_types ORDER BY id ASC');
            const [products] = await pool.query('SELECT * FROM products ORDER BY sku ASC');
            const [movements] = await pool.query('SELECT * FROM movements ORDER BY date ASC, created_at ASC');
            const [movement_items] = await pool.query('SELECT * FROM movement_items ORDER BY id ASC');
            const [services] = await pool.query('SELECT * FROM services ORDER BY id ASC');
            const [inventory_adjustments] = await pool.query('SELECT * FROM inventory_adjustments ORDER BY created_at ASC');
            const [daily_cuts] = await pool.query('SELECT * FROM daily_cuts ORDER BY startDate ASC');
            const [insurance_cuts] = await pool.query('SELECT * FROM insurance_cuts ORDER BY cutoffDate ASC');
            const [settings] = await pool.query('SELECT * FROM settings WHERE id = 1');
            const [system_config] = await pool.query('SELECT * FROM system_config ORDER BY config_key ASC');

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'EXPORT_BACKUP',
                module: 'settings',
                details: `Descarga de respaldo completo de base de datos (${products.length} productos, ${movements.length} movimientos)`
            });

            const nowIso = new Date().toISOString();
            const metaObj = {
                version: '1.0',
                exportDate: nowIso,
                exportedAt: nowIso,
                exportedBy: actor,
                database: process.env.DB_NAME || 'db_web_inventory',
                tableCounts: {
                    products: products.length,
                    movements: movements.length,
                    movement_items: movement_items.length,
                    services: services.length,
                    inventory_adjustments: inventory_adjustments.length,
                    daily_cuts: daily_cuts.length,
                    insurance_cuts: insurance_cuts.length,
                    settings: settings.length,
                    system_config: system_config.length
                }
            };
            const tablesObj = {
                categories,
                document_types,
                products,
                movements,
                movement_items,
                services,
                inventory_adjustments,
                daily_cuts,
                insurance_cuts,
                settings,
                system_config
            };

            res.json({
                meta: metaObj,
                metadata: metaObj,
                data: tablesObj,
                tables: tablesObj
            });
        } catch (error) {
            sendApiError(res, error, 'Error al generar el respaldo del sistema');
        }
    });

    router.post('/system/restore', requireAdmin, async (req, res) => {
        const actor = req.user?.username || 'admin';
        const actorId = req.user?.id || null;
        const payload = req.body?.backup || req.body || {};
        const metadata = payload.meta || payload.metadata || {};
        const tables = payload.data || payload.tables;

        if (!tables || !Array.isArray(tables.products)) {
            return res.status(400).json({ error: 'El archivo de respaldo no tiene una estructura válida.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('SET FOREIGN_KEY_CHECKS = 0');

            if (Array.isArray(tables.categories)) {
                await connection.query('DELETE FROM categories');
                for (const c of tables.categories) {
                    await connection.query(
                        'INSERT INTO categories (id, name, unit_type) VALUES (?, ?, ?)',
                        [c.id, c.name, c.unit_type || 'units']
                    );
                }
            }

            if (Array.isArray(tables.document_types)) {
                await connection.query('DELETE FROM document_types');
                for (const d of tables.document_types) {
                    await connection.query(
                        'INSERT INTO document_types (id, name) VALUES (?, ?)',
                        [d.id, d.name]
                    );
                }
            }

            await connection.query('DELETE FROM services');
            await connection.query('DELETE FROM movement_items');
            await connection.query('DELETE FROM movements');
            await connection.query('DELETE FROM inventory_adjustments');
            await connection.query('DELETE FROM products');

            for (const p of tables.products) {
                await connection.query(
                    'INSERT INTO products (id, sku, description, category, price, stockUnits, stockPounds, stockBaskets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [p.id, p.sku, p.description || '', p.category || '', p.price || 0, p.stockUnits || 0, p.stockPounds || 0, p.stockBaskets || 0]
                );
            }

            if (Array.isArray(tables.movements)) {
                for (const m of tables.movements) {
                    const cleanDate = formatSqlDateOnly(m.date);
                    await connection.query(
                        'INSERT INTO movements (id, type, equipment, carrier, seal, refType, refNumber, date, timeStart, timeEnd, auditUser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [m.id, m.type, m.equipment || '', m.carrier || '', m.seal || '', m.refType || '', m.refNumber || '', cleanDate, m.timeStart || null, m.timeEnd || null, m.auditUser || actor]
                    );
                }
            }

            if (Array.isArray(tables.movement_items)) {
                for (const mi of tables.movement_items) {
                    await connection.query(
                        'INSERT INTO movement_items (movementId, productId, temperature, qtyUnits, qtyPounds, qtyBaskets) VALUES (?, ?, ?, ?, ?, ?)',
                        [mi.movementId, mi.productId, mi.temperature ?? null, mi.qtyUnits || 0, mi.qtyPounds || 0, mi.qtyBaskets || 0]
                    );
                }
            }

            if (Array.isArray(tables.services)) {
                for (const s of tables.services) {
                    await connection.query(
                        'INSERT INTO services (movementId, description, quantity, unitPrice, value) VALUES (?, ?, ?, ?, ?)',
                        [s.movementId, s.description || '', s.quantity ?? 1, s.unitPrice ?? (s.value || 0), s.value || 0]
                    );
                }
            }

            if (Array.isArray(tables.inventory_adjustments)) {
                for (const ia of tables.inventory_adjustments) {
                    await connection.query(
                        'INSERT INTO inventory_adjustments (id, productId, previousUnits, previousPounds, previousBaskets, countedUnits, countedPounds, countedBaskets, reason, auditUser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [ia.id, ia.productId, ia.previousUnits || 0, ia.previousPounds || 0, ia.previousBaskets || 0, ia.countedUnits || 0, ia.countedPounds || 0, ia.countedBaskets || 0, ia.reason || 'Restauración de respaldo', ia.auditUser || actor]
                    );
                }
            }

            if (Array.isArray(tables.daily_cuts)) {
                await connection.query('DELETE FROM daily_cuts');
                for (const dc of tables.daily_cuts) {
                    const startD = formatSqlDateOnly(dc.startDate);
                    const endD = formatSqlDateOnly(dc.endDate);
                    await connection.query(
                        `INSERT INTO daily_cuts (
                            id, title, clientName, startDate, endDate, status, isLocked,
                            congeladosData, preparadosData, servicesData, totalsData, created_by,
                            sipe_sale_id, dte_codigo_generacion, dte_numero_control,
                            dte_sello_recepcion, dte_status, dte_emitted_at, dte_payload
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            dc.id,
                            dc.title || `Corte ${startD || ''} al ${endD || ''}`,
                            dc.clientName || 'Avícola Salvadoreña S.A. DE C.V.',
                            startD,
                            endD,
                            dc.status || 'closed',
                            dc.isLocked !== undefined ? (dc.isLocked ? 1 : 0) : 1,
                            toJsonString(dc.congeladosData, []),
                            toJsonString(dc.preparadosData, []),
                            toJsonString(dc.servicesData, []),
                            toJsonString(dc.totalsData ?? dc.totals, {}),
                            dc.created_by || actor,
                            dc.sipe_sale_id ?? dc.sipeSaleId ?? null,
                            dc.dte_codigo_generacion ?? dc.dteCodigoGeneracion ?? null,
                            dc.dte_numero_control ?? dc.dteNumeroControl ?? null,
                            dc.dte_sello_recepcion ?? dc.dteSelloRecepcion ?? null,
                            dc.dte_status ?? dc.dteStatus ?? 'UNBILLED',
                            formatSqlDateTime(dc.dte_emitted_at ?? dc.dteEmittedAt),
                            toJsonString(dc.dte_payload ?? dc.dtePayload ?? null, null)
                        ]
                    );
                }
            }

            if (Array.isArray(tables.insurance_cuts)) {
                await connection.query('DELETE FROM insurance_cuts');
                for (const ic of tables.insurance_cuts) {
                    const startD = formatSqlDateOnly(ic.startDate);
                    const cutoffD = formatSqlDateOnly(ic.cutoffDate);
                    await connection.query(
                        `INSERT INTO insurance_cuts (
                            id, title, customerName, warehouseName, startDate, cutoffDate,
                            premiumRate, isLocked, rowsData, totalsData, created_by,
                            sipe_sale_id, dte_codigo_generacion, dte_numero_control,
                            dte_sello_recepcion, dte_status, dte_emitted_at, dte_payload
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            ic.id,
                            ic.title || `Corte de Seguro al ${cutoffD || ''}`,
                            ic.customerName || 'AVICOLA SALVADOREÑA S.A. DE C.V.',
                            ic.warehouseName || 'ALMACENADORA LIL',
                            startD,
                            cutoffD,
                            ic.premiumRate ?? 0.10,
                            ic.isLocked !== undefined ? (ic.isLocked ? 1 : 0) : 1,
                            toJsonString(ic.rowsData, []),
                            toJsonString(ic.totalsData ?? ic.totals, {}),
                            ic.created_by || actor,
                            ic.sipe_sale_id ?? ic.sipeSaleId ?? null,
                            ic.dte_codigo_generacion ?? ic.dteCodigoGeneracion ?? null,
                            ic.dte_numero_control ?? ic.dteNumeroControl ?? null,
                            ic.dte_sello_recepcion ?? ic.dteSelloRecepcion ?? null,
                            ic.dte_status ?? ic.dteStatus ?? 'UNBILLED',
                            formatSqlDateTime(ic.dte_emitted_at ?? ic.dteEmittedAt),
                            toJsonString(ic.dte_payload ?? ic.dtePayload ?? null, null)
                        ]
                    );
                }
            }

            if (Array.isArray(tables.settings)) {
                for (const st of tables.settings) {
                    await connection.query(
                        `INSERT INTO settings (id, name, logo) VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE name = VALUES(name), logo = VALUES(logo)`,
                        [st.id || 1, st.name || 'Inventario Pro', st.logo ?? null]
                    );
                }
            }

            if (Array.isArray(tables.system_config)) {
                for (const sc of tables.system_config) {
                    if (!sc?.config_key) continue;
                    await connection.query(
                        `INSERT INTO system_config (config_key, config_value, updated_by) VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
                        [sc.config_key, toJsonString(sc.config_value, {}), sc.updated_by || actor]
                    );
                }
            }

            await connection.query('SET FOREIGN_KEY_CHECKS = 1');

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'RESTORE_BACKUP',
                module: 'settings',
                details: `Restauración completa de base de datos desde respaldo del ${metadata.exportedAt || 'N/A'} (${tables.products.length} productos)`,
                connection
            });

            await connection.commit();
            res.json({
                success: true,
                message: `Respaldo restaurado exitosamente (${tables.products.length} productos, ${(tables.movements || []).length} movimientos).`
            });
        } catch (error) {
            try { await connection.query('SET FOREIGN_KEY_CHECKS = 1'); } catch {}
            await connection.rollback();
            sendApiError(res, error, 'Error al restaurar el respaldo de base de datos');
        } finally {
            connection.release();
        }
    });
};
