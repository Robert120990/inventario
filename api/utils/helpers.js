import pool from '../db.js';
import { randomUUID } from 'node:crypto';

// Valores por defecto del contrato Almacenadora LIL y Avícola Salvadoreña
export const DEFAULT_CONTRACT_RATES = {
    clientName: 'Avícola Salvadoreña, S.A. de C.V.',
    contractorName: 'Inversiones LIL, S.A. de C.V.',
    facility: 'Cuarto Frío San Martín (Km 19 Carretera Panamericana)',
    period: '16 de Enero 2025 - 15 de Enero 2026',
    cutoffs: [10, 25],
    defaultStorageRatePounds: 0.001,
    defaultStorageRateBaskets: 0.038,
    palletBasketCapacity: 35,
    ivaRate: 0.13,
    insuranceRate: 0.10,
    extraServicePresets: [
        { id: 'rastra_habil', label: 'Descarga y Carga Rastra (Horas hábiles)', unitPrice: 54.00, unitLabel: 'Servicio' },
        { id: 'rastra_nohabil', label: 'Descarga y Carga Rastra (Horas no hábiles)', unitPrice: 95.00, unitLabel: 'Servicio' },
        { id: 'camion8_habil', label: 'Descarga y Carga Camión 8 Ton (Horas hábiles)', unitPrice: 30.00, unitLabel: 'Servicio' },
        { id: 'camion8_nohabil', label: 'Descarga y Carga Camión 8 Ton (Horas no hábiles)', unitPrice: 60.00, unitLabel: 'Servicio' },
        { id: 'camion5_habil', label: 'Descarga y Carga Camión 5 Ton (Horas hábiles)', unitPrice: 25.00, unitLabel: 'Servicio' },
        { id: 'camion5_nohabil', label: 'Descarga y Carga Camión 5 Ton (Horas no hábiles)', unitPrice: 50.00, unitLabel: 'Servicio' },
        { id: 'hora_extra_normal', label: 'Hora Extra (Día Normal / Horas no hábiles)', unitPrice: 50.00, unitLabel: 'Horas' },
        { id: 'hora_extra_festivo', label: 'Hora Extra (Día Festivo / No hábil)', unitPrice: 60.00, unitLabel: 'Horas' }
    ],
    temperatureRates: {
        '-13': 0.003,
        '-12': 0.004,
        '-11': 0.005,
        '-10': 0.006,
        '-9': 0.007,
        '-8': 0.008,
        '-7': 0.009,
        '-6': 0.010,
        '-5': 0.012,
        '-4': 0.014,
        '-3': 0.016,
        '-2': 0.018,
        '-1': 0.020,
        '0': 0.022,
        '1': 0.024,
        '2': 0.026,
        '3': 0.028,
        '4': 0.030,
        '5': 0.032,
        '6': 0.034
    }
};

/**
 * Extrae y trunca la IP del cliente a un máximo de 45 caracteres para ajustarse a VARCHAR(50).
 */
export const extractClientIp = (req) => {
    const raw = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '';
    const first = Array.isArray(raw) ? raw[0] : raw;
    const str = String(first || '').trim();
    if (!str) return '';
    return str.substring(0, 45);
};

/**
 * Valida si el origen CORS pertenece al proyecto o entorno local permitido.
 */
export const isAllowedCorsOrigin = (
    origin,
    allowedOriginsEnv = process.env.ALLOWED_ORIGINS,
    nodeEnv = process.env.NODE_ENV
) => {
    if (!origin) return true;

    let parsed;
    try {
        parsed = new URL(origin);
    } catch {
        return false;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
    }

    const normalizedOrigin = parsed.origin;
    const rawList = Array.isArray(allowedOriginsEnv)
        ? allowedOriginsEnv
        : String(allowedOriginsEnv || '').split(',');
    const allowedSet = new Set(
        rawList
            .map(s => String(s || '').trim())
            .filter(Boolean)
            .map(entry => {
                if (entry === '*') return '*';
                try {
                    return new URL(entry).origin;
                } catch {
                    return entry.replace(/\/+$/, '');
                }
            })
    );

    if (allowedSet.has('*') || allowedSet.has(normalizedOrigin)) {
        return true;
    }

    if (process.env.VERCEL_URL && normalizedOrigin === `https://${process.env.VERCEL_URL}`) {
        return true;
    }

    if (nodeEnv !== 'production' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        return true;
    }

    if (parsed.protocol === 'https:' && /^inventario(-[a-z0-9-]+)?\.vercel\.app$/i.test(parsed.hostname)) {
        return true;
    }

    return false;
};

/**
 * Valida logotipo Base64 (solo PNG, JPEG o WEBP, máximo ~2.8 MB).
 */
export const isValidSettingsLogo = (logo) => {
    if (logo === undefined || logo === null || logo === '') return true;
    if (typeof logo !== 'string') return false;
    if (logo.length > 2_800_000) return false;
    return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(logo.trim());
};

// Mantenimiento no bloqueante de tablas de sincronización (máximo 1 ejecución cada 6 horas)
const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const TOMBSTONE_HORIZON_MS = 29 * 24 * 60 * 60 * 1000;
let lastMaintenanceAt = 0;

export const maybePruneSyncTables = async (force = false) => {
    const now = Date.now();
    if (!force && lastMaintenanceAt > 0 && (now - lastMaintenanceAt) < MAINTENANCE_INTERVAL_MS) {
        return false;
    }
    lastMaintenanceAt = now;
    try {
        await Promise.all([
            pool.query('DELETE FROM idempotency_keys WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'),
            pool.query('DELETE FROM sync_tombstones WHERE deleted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)')
        ]);
        return true;
    } catch (err) {
        console.warn('[Maintenance] maybePruneSyncTables warning:', err?.message || err);
        return false;
    }
};

// Helper seguro para extraer YYYY-MM-DD de columnas DATE de MySQL sin desfases por zona horaria UTC
export const formatSqlDateOnly = (val) => {
    if (!val) return null;
    if (val instanceof Date) {
        if (Number.isNaN(val.getTime())) return null;
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(val).trim();
    if (!str) return null;
    const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : str.split('T')[0].split(' ')[0];
};

// Garantiza que startDate, endDate y título automático coincidan con la serie diaria congelada del corte
export const resolveBackendDailyCutDates = (rawStart, rawEnd, rawTitle, congelados = [], preparados = []) => {
    const rowDates = [];
    if (Array.isArray(congelados)) {
        for (const row of congelados) {
            const d = formatSqlDateOnly(row?.fecha);
            if (d) rowDates.push(d);
        }
    }
    if (Array.isArray(preparados)) {
        for (const row of preparados) {
            const d = formatSqlDateOnly(row?.fecha);
            if (d) rowDates.push(d);
        }
    }
    rowDates.sort();

    const cleanStart = rowDates.length > 0 ? rowDates[0] : (formatSqlDateOnly(rawStart) || '');
    const cleanEnd = rowDates.length > 0 ? rowDates[rowDates.length - 1] : (formatSqlDateOnly(rawEnd) || '');

    const titleStr = String(rawTitle || '').trim();
    const isAutoTitle = /^Corte\s+\d{2}\/\d{2}\/\d{4}\s+al\s+\d{2}\/\d{2}\/\d{4}$/i.test(titleStr)
        || /^Corte\s+\d{4}-\d{2}-\d{2}\s+al\s+\d{4}-\d{2}-\d{2}$/i.test(titleStr);
    const toDmy = (ymd) => {
        const parts = String(ymd || '').split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ymd;
    };
    const cleanTitle = (!titleStr || isAutoTitle) && cleanStart && cleanEnd
        ? `Corte ${toDmy(cleanStart)} al ${toDmy(cleanEnd)}`
        : titleStr;

    return { cleanStart, cleanEnd, cleanTitle };
};

export const extractSeriesClosingStock = (seriesRows, targetEndDate) => {
    if (!Array.isArray(seriesRows) || seriesRows.length === 0) return null;
    let targetRow = null;
    if (targetEndDate) {
        for (let i = seriesRows.length - 1; i >= 0; i--) {
            const rowDate = formatSqlDateOnly(seriesRows[i]?.fecha || seriesRows[i]?.date);
            if (rowDate && rowDate === targetEndDate) {
                targetRow = seriesRows[i];
                break;
            }
        }
    }
    if (!targetRow) {
        targetRow = seriesRows[seriesRows.length - 1];
    }
    if (!targetRow || targetRow.stockFinal === undefined || targetRow.stockFinal === null || targetRow.stockFinal === '') {
        return null;
    }
    const num = Number(targetRow.stockFinal);
    return Number.isFinite(num) ? num : null;
};

// Helper para mapear filas de daily_cuts (con soporte de modo resumen y preservación de closingStock)
export const formatDailyCutRow = (r, _index = 0, summaryOnly = false) => {
    let totals = {};
    try {
        totals = typeof r.totalsData === 'string' ? JSON.parse(r.totalsData) : (r.totalsData || {});
    } catch { totals = {}; }

    let congelados = [];
    let preparados = [];
    try {
        congelados = typeof r.congeladosData === 'string' ? JSON.parse(r.congeladosData) : (r.congeladosData || []);
    } catch { congelados = []; }
    try {
        preparados = typeof r.preparadosData === 'string' ? JSON.parse(r.preparadosData) : (r.preparadosData || []);
    } catch { preparados = []; }

    const { cleanStart, cleanEnd, cleanTitle } = resolveBackendDailyCutDates(
        r.startDate,
        r.endDate,
        r.title,
        congelados,
        preparados
    );

    const closingStock = {
        congeladosData: extractSeriesClosingStock(congelados, cleanEnd)
            ?? (typeof r.closingStock?.congeladosData === 'number' ? r.closingStock.congeladosData : null),
        preparadosData: extractSeriesClosingStock(preparados, cleanEnd)
            ?? (typeof r.closingStock?.preparadosData === 'number' ? r.closingStock.preparadosData : null)
    };

    if (summaryOnly) {
        return {
            ...r,
            title: cleanTitle,
            startDate: cleanStart,
            endDate: cleanEnd,
            isLocked: Boolean(r.isLocked),
            congeladosData: [],
            preparadosData: [],
            servicesData: [],
            isSummaryOnly: true,
            closingStock,
            totals,
            totalsData: totals,
            sipeSaleId: r.sipe_sale_id ?? null,
            dteCodigoGeneracion: r.dte_codigo_generacion ?? null,
            dteNumeroControl: r.dte_numero_control ?? null,
            dteSelloRecepcion: r.dte_sello_recepcion ?? null,
            dteStatus: r.dte_status || 'UNBILLED',
            dteEmittedAt: r.dte_emitted_at ?? null
        };
    }

    let services = [];
    try {
        services = typeof r.servicesData === 'string' ? JSON.parse(r.servicesData) : (r.servicesData || []);
    } catch { services = []; }

    return {
        ...r,
        title: cleanTitle,
        startDate: cleanStart,
        endDate: cleanEnd,
        isLocked: Boolean(r.isLocked),
        congeladosData: congelados,
        preparadosData: preparados,
        servicesData: services,
        closingStock,
        totals,
        totalsData: totals,
        sipeSaleId: r.sipe_sale_id ?? null,
        dteCodigoGeneracion: r.dte_codigo_generacion ?? null,
        dteNumeroControl: r.dte_numero_control ?? null,
        dteSelloRecepcion: r.dte_sello_recepcion ?? null,
        dteStatus: r.dte_status || 'UNBILLED',
        dteEmittedAt: r.dte_emitted_at ?? null
    };
};

// Helper for audit logging (supports transactions through optional connection)
export const logSystemEvent = async ({ userId = null, username = 'Sistema', action, module, details, ip = '', connection = null }) => {
    try {
        const logId = randomUUID();
        const executor = connection || pool;
        const rawIp = Array.isArray(ip) ? ip[0] : ip;
        const safeIp = String(rawIp || '').trim().substring(0, 45);
        await executor.query(
            'INSERT INTO system_logs (id, userId, username, action, module, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [logId, userId, username, action, module, details, safeIp]
        );
    } catch (err) {
        console.error('Error writing to system_logs:', err.message);
    }
};

// Helper de respuesta de error sanitizada (previene fugas de SQL y detalles internos en producción)
export const sendApiError = (res, error, defaultMessage = 'Error interno en el servidor', statusCode = 500) => {
    console.error(`[API Error] ${defaultMessage}:`, error);
    if (process.env.NODE_ENV === 'production') {
        const isClientSafe = error?.message && (
            error.message.includes('CORS') ||
            error.message.includes('Credenciales') ||
            error.message.includes('requerido')
        );
        return res.status(statusCode).json({ error: isClientSafe ? error.message : defaultMessage });
    }
    return res.status(statusCode).json({ error: error?.message || defaultMessage });
};

// Helper para registrar eliminaciones en sync_tombstones (sincronización incremental multi-dispositivo)
export const recordSyncTombstone = async (entityType, entityId, deletedBy = 'Sistema', connection = null) => {
    if (!entityType || entityId === undefined || entityId === null || entityId === '') return;
    try {
        const executor = connection || pool;
        await executor.query(
            `INSERT INTO sync_tombstones (entity_type, entity_id, deleted_by, deleted_at)
             VALUES (?, ?, ?, NOW(3))
             ON DUPLICATE KEY UPDATE deleted_by = VALUES(deleted_by), deleted_at = VALUES(deleted_at)`,
            [entityType, String(entityId), deletedBy]
        );
    } catch {
        // Ignorar errores silenciosamente si la tabla aún no existe o en mocks de pruebas
    }
};

// Helper de concurrencia optimista (detecta conflictos 409 VERSION_CONFLICT al sincronizar ediciones offline)
export const checkEntityVersionConflict = (req, currentRow) => {
    if (!currentRow) return null;
    const forceOverwrite = req.body?.forceOverwrite === true || req.headers?.['x-force-overwrite'] === 'true';
    if (forceOverwrite) return null;

    let baseVersion = req.body?.baseVersion;
    if (!baseVersion && req.headers?.['x-base-version']) {
        try {
            baseVersion = JSON.parse(req.headers['x-base-version']);
        } catch {
            baseVersion = req.headers['x-base-version'];
        }
    }
    if (!baseVersion) return null;

    const clientUpdatedAt = typeof baseVersion === 'object'
        ? (baseVersion.updatedAt || baseVersion.updated_at || null)
        : (typeof baseVersion === 'string' ? baseVersion : null);
    const serverUpdatedAt = currentRow.updated_at || currentRow.updatedAt || null;

    if (clientUpdatedAt && serverUpdatedAt) {
        const serverMs = new Date(serverUpdatedAt).getTime();
        const clientMs = new Date(clientUpdatedAt).getTime();
        if (Number.isFinite(serverMs) && Number.isFinite(clientMs) && (serverMs - clientMs > 1000)) {
            return { conflict: true, serverUpdatedAt, clientUpdatedAt };
        }
    }

    if (typeof baseVersion === 'object' && !clientUpdatedAt && baseVersion.sku !== undefined && currentRow.sku !== undefined && baseVersion.price !== undefined) {
        if (String(baseVersion.sku) !== String(currentRow.sku) || Number(baseVersion.price) !== Number(currentRow.price)) {
            return { conflict: true };
        }
    }

    return null;
};

// Helper interno para comprobar bloqueo de cortes en una fecha dada
export const checkLockedCuts = async (connection, date) => {
    if (!date) return null;

    // 1. Corte diario
    const [dailyRows] = await connection.query(
        'SELECT id, title, startDate, endDate FROM daily_cuts WHERE isLocked = 1 AND ? BETWEEN startDate AND endDate LIMIT 1',
        [date]
    );
    if (dailyRows.length > 0) {
        const cut = dailyRows[0];
        const cleanStart = formatSqlDateOnly(cut.startDate) || cut.startDate;
        const cleanEnd = formatSqlDateOnly(cut.endDate) || cut.endDate;
        return `La fecha ${date} pertenece al corte diario cerrado y bloqueado '${cut.title}' (${cleanStart} al ${cleanEnd}). Debe desbloquearse antes de operar en este período.`;
    }

    // 2. Corte de seguro
    const [insRows] = await connection.query(
        'SELECT id, title, cutoffDate FROM insurance_cuts WHERE isLocked = 1 AND cutoffDate >= ? LIMIT 1',
        [date]
    );
    if (insRows.length > 0) {
        const cut = insRows[0];
        const cleanCutoff = formatSqlDateOnly(cut.cutoffDate) || cut.cutoffDate;
        return `La fecha ${date} se encuentra cerrada dentro del corte de póliza de seguro bloqueado '${cut.title}' al ${cleanCutoff}. Debe desbloquearse antes de alterar movimientos.`;
    }

    return null;
};

// Verificador e instalador de columnas DTE/SIPE, system_config, audit_logs e índices de movimientos
export const ensureTableColumns = async () => {
    let connection;
    try {
        connection = await pool.getConnection();

        const [existingColRows] = await connection.query(
            `SELECT TABLE_NAME, COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN ('products', 'movements', 'services', 'daily_cuts', 'insurance_cuts')`
        );
        const existingCols = new Set(
            existingColRows.map(r => `${r.TABLE_NAME}.${r.COLUMN_NAME}`)
        );

        const addColIfMissing = async (table, colName, colDef) => {
            if (!existingCols.has(`${table}.${colName}`)) {
                await connection.query(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef}`);
                existingCols.add(`${table}.${colName}`);
            }
        };

        const addIndexIfMissing = async (table, indexName, colList) => {
            const [indexes] = await connection.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [indexName]);
            if (indexes.length === 0) {
                await connection.query(`CREATE INDEX ${indexName} ON ${table} (${colList})`);
            }
        };

        await addColIfMissing('products', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        await addColIfMissing('movements', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        await addColIfMissing('services', 'quantity', 'DECIMAL(15, 3) DEFAULT 1.000 AFTER description');
        await addColIfMissing('services', 'unitPrice', 'DECIMAL(15, 4) DEFAULT 0.0000 AFTER quantity');

        const dteColumns = [
            ['sipe_sale_id', 'INT DEFAULT NULL'],
            ['dte_codigo_generacion', 'VARCHAR(36) DEFAULT NULL'],
            ['dte_numero_control', 'VARCHAR(35) DEFAULT NULL'],
            ['dte_sello_recepcion', 'VARCHAR(60) DEFAULT NULL'],
            ['dte_status', "VARCHAR(25) DEFAULT 'UNBILLED'"],
            ['dte_emitted_at', 'DATETIME DEFAULT NULL'],
            ['dte_payload', 'JSON DEFAULT NULL']
        ];

        for (const table of ['daily_cuts', 'insurance_cuts']) {
            for (const [colName, colDef] of dteColumns) {
                await addColIfMissing(table, colName, colDef);
            }
        }

        // Tabla de configuración dinámica (tarifas de contrato, etc.)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS system_config (
                config_key VARCHAR(100) PRIMARY KEY,
                config_value JSON NOT NULL,
                updated_by VARCHAR(100) DEFAULT 'Sistema',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await connection.query(
            `INSERT IGNORE INTO system_config (config_key, config_value, updated_by) VALUES ('contract_rates', ?, 'Sistema')`,
            [JSON.stringify(DEFAULT_CONTRACT_RATES)]
        );

        // Tabla de auditoría extendida (audit_logs)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id VARCHAR(50) PRIMARY KEY,
                user_id INT NULL,
                username VARCHAR(50) NOT NULL,
                action VARCHAR(100) NOT NULL,
                module VARCHAR(50) NOT NULL,
                details TEXT NOT NULL,
                metadata JSON DEFAULT NULL,
                ip_address VARCHAR(50) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_audit_logs_module (module),
                INDEX idx_audit_logs_created (created_at)
            )
        `);

        // Tabla de llaves de idempotencia (prevención de duplicación en reintentos offline)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS idempotency_keys (
                idempotency_key VARCHAR(100) PRIMARY KEY,
                user_id INT NOT NULL,
                method VARCHAR(10) NOT NULL,
                endpoint VARCHAR(255) NOT NULL,
                status_code INT NOT NULL,
                response_body JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_idempotency_user_created (user_id, created_at)
            )
        `);

        // Tabla de tombstones para sincronización incremental de eliminaciones
        await connection.query(`
            CREATE TABLE IF NOT EXISTS sync_tombstones (
                entity_type VARCHAR(50) NOT NULL,
                entity_id VARCHAR(50) NOT NULL,
                deleted_by VARCHAR(50) DEFAULT 'Sistema',
                deleted_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (entity_type, entity_id),
                INDEX idx_sync_tombstones_deleted (deleted_at)
            )
        `);

        // Índices de rendimiento para movimientos, sesiones activas e ítems de movimiento
        await addIndexIfMissing('movements', 'idx_movements_date', 'date');
        await addIndexIfMissing('movement_items', 'idx_movement_items_mov_prod', 'movementId, productId');
        await addIndexIfMissing('active_sessions', 'idx_active_sessions_activity', 'last_activity');

        // Eliminar índice duplicado idx_products_sku si coexiste junto al índice UNIQUE de sku
        const [prodIndexes] = await connection.query('SHOW INDEX FROM products');
        const hasUniqueSku = prodIndexes.some(
            idx => idx.Key_name === 'sku' || (idx.Column_name === 'sku' && idx.Key_name !== 'idx_products_sku' && Number(idx.Non_unique) === 0)
        );
        const hasDuplicateSkuIdx = prodIndexes.some(idx => idx.Key_name === 'idx_products_sku');
        if (hasUniqueSku && hasDuplicateSkuIdx) {
            await connection.query('ALTER TABLE products DROP INDEX idx_products_sku');
        }

        return true;
    } catch (err) {
        console.warn('[Backend] ensureTableColumns warning:', err.message);
        return false;
    } finally {
        if (connection) connection.release();
    }
};
