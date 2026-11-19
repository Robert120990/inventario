import fs from 'node:fs';
import path from 'node:path';
import pool from '../db.js';
import {
    DEFAULT_CONTRACT_RATES,
    TOMBSTONE_HORIZON_MS,
    formatDailyCutRow,
    formatSqlDateOnly,
    maybePruneSyncTables,
    sendApiError
} from '../utils/helpers.js';

export const registerBootstrapRoutes = (router) => {
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

    // Endpoint unificado de arranque (/api/bootstrap) para consolidar consultas iniciales en paralelo
    router.get('/bootstrap', async (req, res) => {
        try {
            const rawDays = parseInt(req.query?.movementDays, 10);
            const movementDays = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : null;

            const canView = (mod) =>
                req.user?.role === 'admin' ||
                req.user?.permissions?.[mod]?.view === true ||
                req.user?.permissions?.[mod]?.all === true ||
                (mod === 'summary2' && (req.user?.permissions?.summary?.view === true || req.user?.permissions?.summary?.all === true)) ||
                (mod.startsWith('security-') && (req.user?.permissions?.security?.view === true || req.user?.permissions?.security?.all === true));

            const [
                products,
                movements,
                categories,
                docTypes,
                settingsRow,
                contractRates,
                versions,
                notifications,
                dailyCuts,
                users,
                roles
            ] = await Promise.all([
                (canView('products') || canView('movements') || canView('summary2') || canView('insurance') || canView('inventory-count'))
                    ? pool.query('SELECT * FROM products ORDER BY created_at DESC').then(([rows]) => rows)
                    : Promise.resolve([]),
                (canView('movements') || canView('summary') || canView('summary2') || canView('insurance'))
                    ? (async () => {
                        const movQuery = movementDays
                            ? "SELECT id, type, equipment, carrier, seal, refType, refNumber, DATE_FORMAT(date, '%Y-%m-%d') as date, timeStart, timeEnd, auditUser, created_at, updated_at FROM movements WHERE date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY date DESC, created_at DESC"
                            : "SELECT id, type, equipment, carrier, seal, refType, refNumber, DATE_FORMAT(date, '%Y-%m-%d') as date, timeStart, timeEnd, auditUser, created_at, updated_at FROM movements WHERE 1=1 ORDER BY date DESC, created_at DESC";
                        const movParams = movementDays ? [movementDays] : [];
                        const [rows] = await pool.query(movQuery, movParams);
                        if (rows.length === 0) return [];
                        const movIds = rows.map(m => m.id);
                        const [[allItems], [allServices]] = await Promise.all([
                            pool.query('SELECT * FROM movement_items WHERE movementId IN (?)', [movIds]),
                            pool.query('SELECT * FROM services WHERE movementId IN (?)', [movIds])
                        ]);
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
                        return rows.map(mov => ({
                            ...mov,
                            items: itemsMap[mov.id] || [],
                            services: servicesMap[mov.id] || []
                        }));
                    })()
                    : Promise.resolve([]),
                pool.query('SELECT * FROM categories').then(([rows]) => rows),
                pool.query('SELECT * FROM document_types').then(([rows]) => rows),
                pool.query('SELECT * FROM settings WHERE id = 1').then(([rows]) => rows[0] || null),
                (async () => {
                    const [rows] = await pool.query(
                        "SELECT config_value, updated_by, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') as updated_at FROM system_config WHERE config_key = 'contract_rates' LIMIT 1"
                    );
                    let stored = {};
                    if (rows.length > 0 && rows[0].config_value) {
                        try {
                            stored = typeof rows[0].config_value === 'string'
                                ? JSON.parse(rows[0].config_value)
                                : (rows[0].config_value || {});
                        } catch {
                            stored = {};
                        }
                    }
                    return {
                        ...DEFAULT_CONTRACT_RATES,
                        ...stored,
                        temperatureRates: {
                            ...DEFAULT_CONTRACT_RATES.temperatureRates,
                            ...(stored.temperatureRates || {})
                        },
                        extraServicePresets: Array.isArray(stored.extraServicePresets) && stored.extraServicePresets.length > 0
                            ? stored.extraServicePresets
                            : DEFAULT_CONTRACT_RATES.extraServicePresets,
                        updatedBy: rows[0]?.updated_by || 'Sistema',
                        updatedAt: rows[0]?.updated_at || null
                    };
                })(),
                pool.query(
                    "SELECT id, version, description, changes, author, DATE_FORMAT(created_at, '%Y-%m-%d') as date, DATE_FORMAT(created_at, '%H:%i') as time FROM versions ORDER BY id DESC"
                ).then(([rows]) => rows.map(v => {
                    let chList = [];
                    if (v.changes) {
                        try { chList = JSON.parse(v.changes); } catch { chList = [v.changes]; }
                    }
                    return { ...v, changes: chList };
                })),
                pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50').then(([rows]) => rows.map(n => ({
                    ...n,
                    date: n.date || (n.created_at instanceof Date ? n.created_at.toISOString().slice(0, 16).replace('T', ' ') : (n.created_at ? String(n.created_at).slice(0, 16) : null))
                }))),
                canView('summary2')
                    ? pool.query('SELECT * FROM daily_cuts ORDER BY endDate DESC, startDate DESC, created_at DESC').then(([rows]) =>
                        rows.map((r, idx) => formatDailyCutRow(r, idx, idx >= 3))
                    )
                    : Promise.resolve([]),
                canView('security-users')
                    ? pool.query(`
                        SELECT u.id, u.username, u.role, u.role_id, u.isActive, u.permissions, u.last_login, u.created_at,
                               r.name as roleName, r.permissions as rolePermissions
                        FROM users u
                        LEFT JOIN roles r ON u.role_id = r.id
                        ORDER BY u.id ASC
                    `).then(([rows]) => rows.map(u => {
                        let perms = null;
                        if (u.permissions) {
                            try { perms = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions; } catch { perms = null; }
                        } else if (u.rolePermissions) {
                            try { perms = typeof u.rolePermissions === 'string' ? JSON.parse(u.rolePermissions) : u.rolePermissions; } catch { perms = null; }
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
                    }))
                    : Promise.resolve(req.user ? [req.user] : []),
                canView('security-roles')
                    ? pool.query('SELECT * FROM roles ORDER BY id ASC').then(([rows]) => rows.map(r => {
                        let perms = {};
                        if (r.permissions) {
                            try { perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions; } catch { perms = {}; }
                        }
                        return {
                            ...r,
                            permissions: perms
                        };
                    }))
                    : Promise.resolve([])
            ]);

            res.json({
                success: true,
                syncCursor: new Date().toISOString(),
                movementsWindowDays: movementDays,
                products,
                movements,
                config: { categories, docTypes },
                settings: settingsRow || {},
                contractRates,
                versions,
                notifications,
                dailyCuts,
                users,
                roles
            });
        } catch (error) {
            sendApiError(res, error, 'Error al cargar datos iniciales (bootstrap)');
        }
    });

    // Endpoint de sincronización incremental multi-dispositivo (/api/sync/changes?since=...)
    router.get('/sync/changes', async (req, res) => {
        try {
            void maybePruneSyncTables();
            const syncCursor = new Date().toISOString();
            const sinceRaw = req.query?.since;
            if (sinceRaw) {
                const sinceDate = new Date(sinceRaw);
                if (!Number.isNaN(sinceDate.getTime()) && (Date.now() - sinceDate.getTime() > TOMBSTONE_HORIZON_MS)) {
                    return res.json({
                        success: true,
                        hasChanges: true,
                        requiresFullBootstrap: true,
                        syncCursor
                    });
                }
            }
            const sinceTime = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 60000);
            const safeSince = new Date((Number.isNaN(sinceTime.getTime()) ? Date.now() - 60000 : sinceTime.getTime()) - 1000);
            const safeSinceIso = safeSince.toISOString().slice(0, 19).replace('T', ' ');

            const canView = (mod) =>
                req.user?.role === 'admin' ||
                req.user?.permissions?.[mod]?.view === true ||
                req.user?.permissions?.[mod]?.all === true ||
                (mod === 'summary2' && (req.user?.permissions?.summary?.view === true || req.user?.permissions?.summary?.all === true)) ||
                (mod.startsWith('security-') && (req.user?.permissions?.security?.view === true || req.user?.permissions?.security?.all === true));

            const [
                products,
                movements,
                dailyCuts,
                insuranceCuts,
                notifications,
                contractRates,
                tombstones
            ] = await Promise.all([
                (canView('products') || canView('movements') || canView('summary2') || canView('insurance') || canView('inventory-count'))
                    ? pool.query(
                        'SELECT * FROM products WHERE updated_at >= ? OR created_at >= ? ORDER BY updated_at DESC',
                        [safeSinceIso, safeSinceIso]
                    ).then(([rows]) => rows)
                    : Promise.resolve([]),
                (canView('movements') || canView('summary') || canView('summary2') || canView('insurance'))
                    ? (async () => {
                        const [rows] = await pool.query(
                            "SELECT id, type, equipment, carrier, seal, refType, refNumber, DATE_FORMAT(date, '%Y-%m-%d') as date, timeStart, timeEnd, auditUser, created_at, updated_at FROM movements WHERE updated_at >= ? OR created_at >= ? ORDER BY date DESC, created_at DESC",
                            [safeSinceIso, safeSinceIso]
                        );
                        if (rows.length === 0) return [];
                        const movIds = rows.map(m => m.id);
                        const [[allItems], [allServices]] = await Promise.all([
                            pool.query('SELECT * FROM movement_items WHERE movementId IN (?)', [movIds]),
                            pool.query('SELECT * FROM services WHERE movementId IN (?)', [movIds])
                        ]);
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
                        return rows.map(mov => ({
                            ...mov,
                            items: itemsMap[mov.id] || [],
                            services: servicesMap[mov.id] || []
                        }));
                    })()
                    : Promise.resolve([]),
                canView('summary2')
                    ? pool.query(
                        'SELECT * FROM daily_cuts WHERE updated_at >= ? OR created_at >= ? ORDER BY endDate DESC, startDate DESC, created_at DESC',
                        [safeSinceIso, safeSinceIso]
                    ).then(([rows]) => rows.map((r, idx) => formatDailyCutRow(r, idx, false)))
                    : Promise.resolve([]),
                canView('insurance')
                    ? pool.query(
                        'SELECT * FROM insurance_cuts WHERE updated_at >= ? OR created_at >= ? ORDER BY cutoffDate DESC, created_at DESC',
                        [safeSinceIso, safeSinceIso]
                    ).then(([rows]) => rows.map(r => {
                        let totals = {};
                        let rowsData = [];
                        try { totals = typeof r.totalsData === 'string' ? JSON.parse(r.totalsData) : (r.totalsData || {}); } catch { totals = {}; }
                        try { rowsData = typeof r.rowsData === 'string' ? JSON.parse(r.rowsData) : (r.rowsData || []); } catch { rowsData = []; }
                        const cleanStart = formatSqlDateOnly(r.startDate);
                        const cleanCutoff = formatSqlDateOnly(r.cutoffDate) || '';
                        return {
                            ...r,
                            startDate: cleanStart,
                            cutoffDate: cleanCutoff,
                            premiumRate: Number(r.premiumRate || 0.10),
                            isLocked: Boolean(r.isLocked),
                            rowsData,
                            totals,
                            sipeSaleId: r.sipe_sale_id ?? null,
                            dteCodigoGeneracion: r.dte_codigo_generacion ?? null,
                            dteNumeroControl: r.dte_numero_control ?? null,
                            dteSelloRecepcion: r.dte_sello_recepcion ?? null,
                            dteStatus: r.dte_status || 'UNBILLED',
                            dteEmittedAt: r.dte_emitted_at ?? null
                        };
                    }))
                    : Promise.resolve([]),
                pool.query(
                    'SELECT * FROM notifications WHERE created_at >= ? ORDER BY created_at DESC LIMIT 50',
                    [safeSinceIso]
                ).then(([rows]) => rows.map(n => ({
                    ...n,
                    date: n.date || (n.created_at instanceof Date ? n.created_at.toISOString().slice(0, 16).replace('T', ' ') : (n.created_at ? String(n.created_at).slice(0, 16) : null))
                }))),
                (async () => {
                    const [rows] = await pool.query(
                        "SELECT config_value, updated_by, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') as updated_at FROM system_config WHERE config_key = 'contract_rates' AND updated_at >= ? LIMIT 1",
                        [safeSinceIso]
                    );
                    if (rows.length === 0) return null;
                    let stored = {};
                    if (rows[0].config_value) {
                        try {
                            stored = typeof rows[0].config_value === 'string'
                                ? JSON.parse(rows[0].config_value)
                                : (rows[0].config_value || {});
                        } catch {
                            stored = {};
                        }
                    }
                    return {
                        ...DEFAULT_CONTRACT_RATES,
                        ...stored,
                        temperatureRates: {
                            ...DEFAULT_CONTRACT_RATES.temperatureRates,
                            ...(stored.temperatureRates || {})
                        },
                        extraServicePresets: Array.isArray(stored.extraServicePresets) && stored.extraServicePresets.length > 0
                            ? stored.extraServicePresets
                            : DEFAULT_CONTRACT_RATES.extraServicePresets,
                        updatedBy: rows[0]?.updated_by || 'Sistema',
                        updatedAt: rows[0]?.updated_at || null
                    };
                })(),
                pool.query(
                    'SELECT entity_type, entity_id, deleted_at FROM sync_tombstones WHERE deleted_at >= ?',
                    [safeSinceIso]
                ).then(([rows]) => rows).catch(() => [])
            ]);

            const deletions = { products: [], movements: [], dailyCuts: [], insuranceCuts: [] };
            for (const t of tombstones) {
                if (t && t.entity_type && deletions[t.entity_type]) {
                    deletions[t.entity_type].push(t.entity_id);
                }
            }

            const hasChanges =
                products.length > 0 ||
                movements.length > 0 ||
                dailyCuts.length > 0 ||
                insuranceCuts.length > 0 ||
                notifications.length > 0 ||
                Boolean(contractRates) ||
                tombstones.length > 0;

            res.json({
                success: true,
                syncCursor: new Date().toISOString(),
                since: sinceRaw || null,
                hasChanges,
                changes: {
                    products,
                    movements,
                    dailyCuts,
                    insuranceCuts,
                    notifications,
                    contractRates
                },
                deletions
            });
        } catch (error) {
            sendApiError(res, error, 'Error al consultar cambios incrementales');
        }
    });
};
