import pool from '../db.js';
import { randomUUID } from 'node:crypto';
import { verifyToken } from '../middleware/auth.js';
import { extractClientIp, formatSqlDateOnly, logSystemEvent, sendApiError } from '../utils/helpers.js';

const getSipeBillingService = async () => {
    return import('../services/sipeBillingService.js');
};

const loadCutForBilling = async (cutType, cutId) => {
    const normalizedType = String(cutType || 'daily').toLowerCase().includes('ins') ? 'insurance' : 'daily';
    if (normalizedType === 'insurance') {
        const [rows] = await pool.query('SELECT * FROM insurance_cuts WHERE id = ?', [cutId]);
        if (rows.length === 0) return null;
        const cut = rows[0];
        const cleanStart = formatSqlDateOnly(cut.startDate);
        const cleanCutoff = formatSqlDateOnly(cut.cutoffDate) || '';
        const rowsData = typeof cut.rowsData === 'string' ? JSON.parse(cut.rowsData || '[]') : (cut.rowsData || []);
        const totalsData = typeof cut.totalsData === 'string' ? JSON.parse(cut.totalsData || '{}') : (cut.totalsData || {});
        return {
            ...cut,
            cutType: 'insurance',
            startDate: cleanStart,
            cutoffDate: cleanCutoff,
            premiumRate: Number(cut.premiumRate || 0.10),
            isLocked: Boolean(cut.isLocked),
            rowsData,
            totalsData,
            totals: totalsData,
            sipeSaleId: cut.sipe_sale_id ?? null,
            dteCodigoGeneracion: cut.dte_codigo_generacion ?? null,
            dteNumeroControl: cut.dte_numero_control ?? null,
            dteSelloRecepcion: cut.dte_sello_recepcion ?? null,
            dteStatus: cut.dte_status || 'UNBILLED',
            dteEmittedAt: cut.dte_emitted_at ?? null
        };
    }

    const [rows] = await pool.query('SELECT * FROM daily_cuts WHERE id = ?', [cutId]);
    if (rows.length === 0) return null;
    const cut = rows[0];
    const cleanStart = formatSqlDateOnly(cut.startDate) || '';
    const cleanEnd = formatSqlDateOnly(cut.endDate) || '';
    const congeladosData = typeof cut.congeladosData === 'string' ? JSON.parse(cut.congeladosData || '[]') : (cut.congeladosData || []);
    const preparadosData = typeof cut.preparadosData === 'string' ? JSON.parse(cut.preparadosData || '[]') : (cut.preparadosData || []);
    const servicesData = typeof cut.servicesData === 'string' ? JSON.parse(cut.servicesData || '[]') : (cut.servicesData || []);
    const totalsData = typeof cut.totalsData === 'string' ? JSON.parse(cut.totalsData || '{}') : (cut.totalsData || {});
    return {
        ...cut,
        cutType: 'daily',
        startDate: cleanStart,
        endDate: cleanEnd,
        isLocked: Boolean(cut.isLocked),
        congeladosData,
        preparadosData,
        servicesData,
        totalsData,
        totals: totalsData,
        sipeSaleId: cut.sipe_sale_id ?? null,
        dteCodigoGeneracion: cut.dte_codigo_generacion ?? null,
        dteNumeroControl: cut.dte_numero_control ?? null,
        dteSelloRecepcion: cut.dte_sello_recepcion ?? null,
        dteStatus: cut.dte_status || 'UNBILLED',
        dteEmittedAt: cut.dte_emitted_at ?? null
    };
};

const requireBillingPermission = (action = 'view') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado.' });
        }
        if (req.user.role === 'admin') {
            return next();
        }
        const perms = req.user.permissions || {};
        const checkMod = (modName) => {
            const m = perms[modName];
            return Boolean(m && (m[action] === true || m.all === true));
        };
        if (checkMod('summary2') || checkMod('summary') || checkMod('insurance')) {
            return next();
        }
        return res.status(403).json({
            error: `Acceso denegado. Se requiere permiso "${action}" en Cortes Diarios o Cortes de Seguro para facturación SIPE.`
        });
    };
};

export const registerBillingRoutes = (router) => {
    router.get('/billing/contract-status', verifyToken, requireBillingPermission('view'), async (req, res) => {
        try {
            const sipeBillingService = await getSipeBillingService();
            const status = await sipeBillingService.checkSipeContractStatus();
            res.json(status);
        } catch (error) {
            console.error('Error checking SIPE contract status:', error);
            sendApiError(res, error);
        }
    });

    router.post('/billing/preview', verifyToken, requireBillingPermission('view'), async (req, res) => {
        try {
            const { cutId, cutType = 'daily', options = {} } = req.body || {};
            const normalizedType = String(cutType || 'daily').toLowerCase().includes('ins') ? 'insurance' : 'daily';

            let cutData = req.body?.cutData || null;
            if (cutId) {
                cutData = await loadCutForBilling(normalizedType, cutId);
                if (!cutData) {
                    return res.status(404).json({ error: `Corte (${normalizedType}) con ID '${cutId}' no encontrado.` });
                }
            } else if (!cutData) {
                return res.status(400).json({ error: 'Se requiere cutId o cutData para generar la vista previa del DTE.' });
            }

            const sipeBillingService = await getSipeBillingService();
            const preview = await sipeBillingService.buildCutDtePayload({
                cutId,
                cutType: normalizedType,
                cutData,
                cut: cutData,
                options
            });

            let contractStatus = preview?.contractStatus || null;
            if (!contractStatus && typeof sipeBillingService.checkSipeContractStatus === 'function') {
                try {
                    contractStatus = await sipeBillingService.checkSipeContractStatus();
                } catch {
                    contractStatus = null;
                }
            }

            res.json({
                success: true,
                cutId: cutData.id || cutId,
                cutType: normalizedType,
                ...preview,
                contractStatus
            });
        } catch (error) {
            console.error('Error building DTE preview:', error);
            sendApiError(res, error);
        }
    });

    router.post('/billing/emit', verifyToken, requireBillingPermission('edit'), async (req, res) => {
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        const ip = extractClientIp(req);

        try {
            const { cutId, cutType = 'daily', cutData = null, options = {} } = req.body || {};
            if (!cutId && !cutData?.id) {
                return res.status(400).json({ error: 'El identificador del corte (cutId) es obligatorio para emitir DTE.' });
            }

            const effectiveCutId = cutId || cutData?.id;
            const normalizedType = String(cutType || 'daily').toLowerCase().includes('ins') ? 'insurance' : 'daily';
            const sipeBillingService = await getSipeBillingService();
            const emitResult = await sipeBillingService.emitCutToSipe({
                cutId: effectiveCutId,
                cutType: normalizedType,
                cutData,
                options,
                user: req.user
            });

            const numeroControl = emitResult?.dteNumeroControl || emitResult?.numeroControl || emitResult?.dte?.identificacion?.numeroControl || '';
            const codigoGeneracion = emitResult?.dteCodigoGeneracion || emitResult?.codigoGeneracion || emitResult?.dte?.identificacion?.codigoGeneracion || '';
            const sipeSaleId = emitResult?.sipeSaleId || emitResult?.saleId || null;

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'EMIT_SIPE_DTE',
                module: normalizedType === 'insurance' ? 'insurance' : 'summary2',
                details: `Emisión de DTE 03 en SIPE para corte ${normalizedType === 'insurance' ? 'de seguro' : 'diario'} ID '${effectiveCutId}' (Control: ${numeroControl || 'N/A'}, Gen: ${codigoGeneracion || 'N/A'}, Venta SIPE #${sipeSaleId || 'N/A'})`,
                ip
            });

            try {
                await pool.query(
                    `INSERT INTO audit_logs (id, user_id, username, action, module, details, metadata, ip_address)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        randomUUID(),
                        actorId,
                        actor,
                        'EMIT_DTE_SIPE',
                        normalizedType === 'insurance' ? 'insurance' : 'summary2',
                        `DTE 03 emitido para corte ${cutId} (${numeroControl})`,
                        JSON.stringify({ cutId, cutType: normalizedType, sipeSaleId, codigoGeneracion, numeroControl }),
                        ip
                    ]
                );
            } catch (auditErr) {
                console.warn('Warning writing to audit_logs:', auditErr.message);
            }

            try {
                await pool.query(
                    'INSERT INTO notifications (id, userId, title, message, type) VALUES (?, ?, ?, ?, ?)',
                    [
                        randomUUID(),
                        null,
                        'DTE 03 Emitido en SIPE',
                        `Se emitió el Comprobante de Crédito Fiscal (DTE 03) ${numeroControl || codigoGeneracion} para el corte ${normalizedType === 'insurance' ? 'de seguro' : 'diario'} (${cutId}) por ${actor}.`,
                        'success'
                    ]
                );
            } catch (notifErr) {
                console.warn('Warning writing DTE notification:', notifErr.message);
            }

            res.json({
                success: true,
                ...emitResult
            });
        } catch (error) {
            console.error('Error emitting DTE to SIPE:', error);
            const statusCode = error?.statusCode || (error?.message?.includes('ya fue facturado') || error?.message?.includes('EMITTED') ? 409 : 500);
            res.status(statusCode).json({ error: error.message });
        }
    });

    router.get('/billing/history', verifyToken, requireBillingPermission('view'), async (req, res) => {
        try {
            const includeUnbilled = req.query.includeUnbilled === 'true' || req.query.all === 'true';
            const whereClause = includeUnbilled
                ? '1=1'
                : "dte_status IS NOT NULL AND dte_status != 'UNBILLED'";

            const [dailyRows] = await pool.query(`
                SELECT id, title, clientName, startDate, endDate, isLocked, totalsData,
                       sipe_sale_id, dte_codigo_generacion, dte_numero_control,
                       dte_sello_recepcion, dte_status, dte_emitted_at, created_by, created_at
                FROM daily_cuts
                WHERE ${whereClause}
                ORDER BY COALESCE(dte_emitted_at, created_at) DESC
            `);

            const [insuranceRows] = await pool.query(`
                SELECT id, title, customerName, warehouseName, startDate, cutoffDate, premiumRate, isLocked, totalsData,
                       sipe_sale_id, dte_codigo_generacion, dte_numero_control,
                       dte_sello_recepcion, dte_status, dte_emitted_at, created_by, created_at
                FROM insurance_cuts
                WHERE ${whereClause}
                ORDER BY COALESCE(dte_emitted_at, created_at) DESC
            `);

            const formatDaily = dailyRows.map(r => {
                let totals = {};
                try { totals = typeof r.totalsData === 'string' ? JSON.parse(r.totalsData) : (r.totalsData || {}); } catch { totals = {}; }
                const cleanStart = formatSqlDateOnly(r.startDate) || '';
                const cleanEnd = formatSqlDateOnly(r.endDate) || '';
                return {
                    id: r.id,
                    cutId: r.id,
                    cutType: 'daily',
                    title: r.title,
                    clientName: r.clientName,
                    startDate: cleanStart,
                    endDate: cleanEnd,
                    isLocked: Boolean(r.isLocked),
                    totals,
                    sipeSaleId: r.sipe_sale_id ?? null,
                    dteCodigoGeneracion: r.dte_codigo_generacion ?? null,
                    dteNumeroControl: r.dte_numero_control ?? null,
                    dteSelloRecepcion: r.dte_sello_recepcion ?? null,
                    dteStatus: r.dte_status || 'UNBILLED',
                    dteEmittedAt: r.dte_emitted_at ?? null,
                    created_by: r.created_by,
                    created_at: r.created_at
                };
            });

            const formatInsurance = insuranceRows.map(r => {
                let totals = {};
                try { totals = typeof r.totalsData === 'string' ? JSON.parse(r.totalsData) : (r.totalsData || {}); } catch { totals = {}; }
                const cleanStart = formatSqlDateOnly(r.startDate);
                const cleanCutoff = formatSqlDateOnly(r.cutoffDate) || '';
                return {
                    id: r.id,
                    cutId: r.id,
                    cutType: 'insurance',
                    title: r.title,
                    clientName: r.customerName,
                    warehouseName: r.warehouseName,
                    startDate: cleanStart,
                    endDate: cleanCutoff,
                    cutoffDate: cleanCutoff,
                    premiumRate: Number(r.premiumRate || 0.10),
                    isLocked: Boolean(r.isLocked),
                    totals,
                    sipeSaleId: r.sipe_sale_id ?? null,
                    dteCodigoGeneracion: r.dte_codigo_generacion ?? null,
                    dteNumeroControl: r.dte_numero_control ?? null,
                    dteSelloRecepcion: r.dte_sello_recepcion ?? null,
                    dteStatus: r.dte_status || 'UNBILLED',
                    dteEmittedAt: r.dte_emitted_at ?? null,
                    created_by: r.created_by,
                    created_at: r.created_at
                };
            });

            const combined = [...formatDaily, ...formatInsurance].sort((a, b) => {
                const dateA = new Date(a.dteEmittedAt || a.created_at || 0).getTime();
                const dateB = new Date(b.dteEmittedAt || b.created_at || 0).getTime();
                return dateB - dateA;
            });

            res.json(combined);
        } catch (error) {
            console.error('Error fetching billing history:', error);
            sendApiError(res, error);
        }
    });
};
