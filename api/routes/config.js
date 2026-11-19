import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { DEFAULT_CONTRACT_RATES, isValidSettingsLogo, logSystemEvent, sendApiError } from '../utils/helpers.js';

export const registerConfigRoutes = (router) => {
    router.get('/config', async (req, res) => {
        try {
            const [categories] = await pool.query('SELECT * FROM categories');
            const [docTypes] = await pool.query('SELECT * FROM document_types');
            res.json({ categories, docTypes });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/config/categories', requirePermission('settings', 'edit'), async (req, res) => {
        const { name, unit_type } = req.body;
        try {
            await pool.query('INSERT INTO categories (name, unit_type) VALUES (?, ?)', [name, unit_type || 'units']);
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.put('/config/categories/:name', requirePermission('settings', 'edit'), async (req, res) => {
        const { unit_type } = req.body;
        try {
            await pool.query('UPDATE categories SET unit_type=? WHERE name=?', [unit_type, decodeURIComponent(req.params.name)]);
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.delete('/config/categories/:name', requirePermission('settings', 'edit'), async (req, res) => {
        try {
            await pool.query('DELETE FROM categories WHERE name = ?', [decodeURIComponent(req.params.name)]);
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/config/document-types', requirePermission('settings', 'edit'), async (req, res) => {
        const { name } = req.body;
        try {
            await pool.query('INSERT INTO document_types (name) VALUES (?)', [name]);
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.delete('/config/document-types/:name', requirePermission('settings', 'edit'), async (req, res) => {
        try {
            await pool.query('DELETE FROM document_types WHERE name = ?', [decodeURIComponent(req.params.name)]);
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.get('/settings', requirePermission('settings', 'view'), async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1');
            res.json(rows[0] || { name: 'Inventario Pro', logo: null });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/settings', requirePermission('settings', 'edit'), async (req, res) => {
        const { name, logo } = req.body || {};
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        if (!isValidSettingsLogo(logo)) {
            return res.status(400).json({
                error: 'Formato de logotipo inválido. Solo se permiten imágenes PNG, JPEG o WEBP en Base64 (máx. ~2 MB).'
            });
        }

        const cleanLogo = (logo === undefined || logo === null || logo === '') ? null : logo.trim();

        try {
            await pool.query(
                'INSERT INTO settings (id, name, logo) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE name = ?, logo = ?',
                [name, cleanLogo, name, cleanLogo]
            );

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'UPDATE_SETTINGS',
                module: 'settings',
                details: 'Actualización de configuración general de almacén'
            });

            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
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
            sendApiError(res, error);
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
            sendApiError(res, error);
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
            sendApiError(res, error);
        }
    });

    // ==========================================
    // TARIFAS Y PARÁMETROS DINÁMICOS DE CONTRATO
    // ==========================================
    router.get('/contract-rates', verifyToken, async (req, res) => {
        try {
            const [rows] = await pool.query(
                "SELECT config_value, updated_by, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') as updated_at FROM system_config WHERE config_key = 'contract_rates' LIMIT 1"
            );

            if (rows.length === 0) {
                await pool.query(
                    "INSERT IGNORE INTO system_config (config_key, config_value, updated_by) VALUES ('contract_rates', ?, 'Sistema')",
                    [JSON.stringify(DEFAULT_CONTRACT_RATES)]
                );
                return res.json({
                    ...DEFAULT_CONTRACT_RATES,
                    updatedBy: 'Sistema',
                    updatedAt: new Date().toISOString()
                });
            }

            let stored = {};
            try {
                stored = typeof rows[0].config_value === 'string'
                    ? JSON.parse(rows[0].config_value)
                    : (rows[0].config_value || {});
            } catch {
                stored = {};
            }

            res.json({
                ...DEFAULT_CONTRACT_RATES,
                ...stored,
                temperatureRates: {
                    ...DEFAULT_CONTRACT_RATES.temperatureRates,
                    ...(stored.temperatureRates || {})
                },
                extraServicePresets: Array.isArray(stored.extraServicePresets) && stored.extraServicePresets.length > 0
                    ? stored.extraServicePresets
                    : DEFAULT_CONTRACT_RATES.extraServicePresets,
                updatedBy: rows[0].updated_by || 'Sistema',
                updatedAt: rows[0].updated_at || null
            });
        } catch (error) {
            console.error('Error fetching contract rates:', error);
            sendApiError(res, error);
        }
    });

    router.put('/contract-rates', verifyToken, requirePermission('settings', 'edit'), async (req, res) => {
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        try {
            const [existingRows] = await pool.query(
                "SELECT config_value FROM system_config WHERE config_key = 'contract_rates' LIMIT 1"
            );
            let current = { ...DEFAULT_CONTRACT_RATES };
            if (existingRows.length > 0 && existingRows[0].config_value) {
                try {
                    const parsed = typeof existingRows[0].config_value === 'string'
                        ? JSON.parse(existingRows[0].config_value)
                        : existingRows[0].config_value;
                    current = { ...DEFAULT_CONTRACT_RATES, ...parsed };
                } catch {
                    current = { ...DEFAULT_CONTRACT_RATES };
                }
            }

            const incoming = req.body || {};
            const merged = {
                clientName: incoming.clientName !== undefined ? String(incoming.clientName).trim() : current.clientName,
                contractorName: incoming.contractorName !== undefined ? String(incoming.contractorName).trim() : current.contractorName,
                facility: incoming.facility !== undefined ? String(incoming.facility).trim() : current.facility,
                period: incoming.period !== undefined ? String(incoming.period).trim() : current.period,
                cutoffs: Array.isArray(incoming.cutoffs) ? incoming.cutoffs.map(Number) : current.cutoffs,
                defaultStorageRatePounds: incoming.defaultStorageRatePounds !== undefined ? Number(incoming.defaultStorageRatePounds) : current.defaultStorageRatePounds,
                defaultStorageRateBaskets: incoming.defaultStorageRateBaskets !== undefined ? Number(incoming.defaultStorageRateBaskets) : current.defaultStorageRateBaskets,
                palletBasketCapacity: incoming.palletBasketCapacity !== undefined ? Number(incoming.palletBasketCapacity) : current.palletBasketCapacity,
                ivaRate: incoming.ivaRate !== undefined ? Number(incoming.ivaRate) : current.ivaRate,
                insuranceRate: incoming.insuranceRate !== undefined ? Number(incoming.insuranceRate) : current.insuranceRate,
                extraServicePresets: Array.isArray(incoming.extraServicePresets) ? incoming.extraServicePresets : current.extraServicePresets,
                temperatureRates: incoming.temperatureRates && typeof incoming.temperatureRates === 'object'
                    ? { ...current.temperatureRates, ...incoming.temperatureRates }
                    : current.temperatureRates
            };

            await pool.query(
                `INSERT INTO system_config (config_key, config_value, updated_by)
                 VALUES ('contract_rates', ?, ?)
                 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
                [JSON.stringify(merged), actor]
            );

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'UPDATE_CONTRACT_RATES',
                module: 'settings',
                details: `Actualización de tarifas y parámetros de contrato (${merged.period})`
            });

            res.json({
                success: true,
                contractRates: {
                    ...merged,
                    updatedBy: actor,
                    updatedAt: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error updating contract rates:', error);
            sendApiError(res, error);
        }
    });
};
