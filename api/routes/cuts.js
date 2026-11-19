import pool from '../db.js';
import { randomUUID } from 'node:crypto';
import { requirePermission } from '../middleware/permissions.js';
import {
    extractSeriesClosingStock,
    formatDailyCutRow,
    formatSqlDateOnly,
    resolveBackendDailyCutDates,
    logSystemEvent,
    sendApiError,
    recordSyncTombstone,
    checkEntityVersionConflict
} from '../utils/helpers.js';

export const registerCutRoutes = (router) => {
    // ==========================================
    // CORTES DIARIOS CONGELADOS (DAILY CUTS)
    // ==========================================
    router.get('/daily-cuts', requirePermission('summary2', 'view'), async (req, res) => {
        try {
            const [rows] = await pool.query(`
                SELECT *
                FROM daily_cuts
                ORDER BY endDate DESC, startDate DESC, created_at DESC
            `);

            const isSummaryMode = req.query?.summary === '1' || req.query?.summary === 'true';
            const cuts = rows.map((r, index) => formatDailyCutRow(r, index, isSummaryMode && index > 0));

            res.json(cuts);
        } catch (error) {
            console.error('Error fetching daily cuts:', error);
            sendApiError(res, error);
        }
    });

    router.get('/daily-cuts/:id', requirePermission('summary2', 'view'), async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM daily_cuts WHERE id = ?', [req.params.id]);
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Corte no encontrado' });
            }
            const cut = rows[0];
            const congeladosParsed = typeof cut.congeladosData === 'string' ? JSON.parse(cut.congeladosData || '[]') : (cut.congeladosData || []);
            const preparadosParsed = typeof cut.preparadosData === 'string' ? JSON.parse(cut.preparadosData || '[]') : (cut.preparadosData || []);
            const servicesParsed = typeof cut.servicesData === 'string' ? JSON.parse(cut.servicesData || '[]') : (cut.servicesData || []);
            const totalsParsed = typeof cut.totalsData === 'string' ? JSON.parse(cut.totalsData || '{}') : (cut.totalsData || {});

            const { cleanStart, cleanEnd, cleanTitle } = resolveBackendDailyCutDates(
                cut.startDate,
                cut.endDate,
                cut.title,
                congeladosParsed,
                preparadosParsed
            );

            const closingStock = {
                congeladosData: extractSeriesClosingStock(congeladosParsed, cleanEnd),
                preparadosData: extractSeriesClosingStock(preparadosParsed, cleanEnd)
            };

            let dtePayload = null;
            if (cut.dte_payload) {
                try {
                    dtePayload = typeof cut.dte_payload === 'string' ? JSON.parse(cut.dte_payload) : cut.dte_payload;
                } catch { dtePayload = null; }
            }

            res.json({
                ...cut,
                title: cleanTitle,
                startDate: cleanStart,
                endDate: cleanEnd,
                isLocked: Boolean(cut.isLocked),
                congeladosData: congeladosParsed,
                preparadosData: preparadosParsed,
                servicesData: servicesParsed,
                closingStock,
                totalsData: totalsParsed,
                sipeSaleId: cut.sipe_sale_id ?? null,
                dteCodigoGeneracion: cut.dte_codigo_generacion ?? null,
                dteNumeroControl: cut.dte_numero_control ?? null,
                dteSelloRecepcion: cut.dte_sello_recepcion ?? null,
                dteStatus: cut.dte_status || 'UNBILLED',
                dteEmittedAt: cut.dte_emitted_at ?? null,
                dtePayload
            });
        } catch (error) {
            console.error('Error fetching daily cut by id:', error);
            sendApiError(res, error);
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

            const cleanStartDate = formatSqlDateOnly(startDate);
            const cleanEndDate = formatSqlDateOnly(endDate);
            if (!cleanStartDate || !cleanEndDate) {
                return res.status(400).json({ error: 'Las fechas de inicio y fin son obligatorias.' });
            }

            const autoTitle = title || `Corte ${cleanStartDate} al ${cleanEndDate}`;
            const autoClient = clientName || 'SUPER SELECTOS';

            const jsonCongelados = typeof congeladosData === 'string' ? congeladosData : JSON.stringify(congeladosData);
            const jsonPreparados = typeof preparadosData === 'string' ? preparadosData : JSON.stringify(preparadosData);
            const jsonServices = typeof servicesData === 'string' ? servicesData : JSON.stringify(servicesData);
            const jsonTotals = typeof totalsData === 'string' ? totalsData : JSON.stringify(totalsData);

            await pool.query(
                `INSERT INTO daily_cuts 
                (id, title, clientName, startDate, endDate, isLocked, congeladosData, preparadosData, servicesData, totalsData, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, autoTitle, autoClient, cleanStartDate, cleanEndDate, isLocked ? 1 : 0, jsonCongelados, jsonPreparados, jsonServices, jsonTotals, actor]
            );

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'FREEZE_DAILY_CUT',
                module: 'summary2',
                details: `Cierre y congelamiento de corte diario '${autoTitle}' (${cleanStartDate} al ${cleanEndDate})`
            });

            res.status(201).json({
                success: true,
                id,
                title: autoTitle,
                clientName: autoClient,
                startDate: cleanStartDate,
                endDate: cleanEndDate,
                isLocked: Boolean(isLocked),
                dteStatus: 'UNBILLED',
                created_by: actor
            });
        } catch (error) {
            console.error('Error creating daily cut:', error);
            sendApiError(res, error);
        }
    });

    router.put('/daily-cuts/:id', requirePermission('summary2', 'edit'), async (req, res) => {
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
            const actor = req.user?.username || 'Sistema';
            const actorId = req.user?.id || null;

            const [existing] = await pool.query('SELECT * FROM daily_cuts WHERE id = ?', [req.params.id]);
            if (existing.length === 0) {
                return res.status(404).json({ error: 'Corte no encontrado para actualizar.' });
            }

            const current = existing[0];
            if (Number(current.isLocked) === 1 && isLocked !== false && isLocked !== 0) {
                return res.status(409).json({
                    error: `El corte diario "${current.title || current.id}" se encuentra cerrado y bloqueado. Debe desbloquearse antes de modificar sus datos.`
                });
            }

            if (checkEntityVersionConflict(req, current)) {
                return res.status(409).json({
                    error: 'El corte fue modificado en el servidor mientras trabajabas sin conexión.',
                    code: 'VERSION_CONFLICT',
                    serverRecord: current
                });
            }

            const newTitle = title !== undefined ? title : current.title;
            const newClient = clientName !== undefined ? clientName : current.clientName;
            const newStartDate = formatSqlDateOnly(startDate !== undefined ? startDate : current.startDate);
            const newEndDate = formatSqlDateOnly(endDate !== undefined ? endDate : current.endDate);
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
                isLocked: Boolean(newIsLocked)
            });
        } catch (error) {
            console.error('Error updating daily cut:', error);
            sendApiError(res, error);
        }
    });

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
            sendApiError(res, error);
        }
    });

    router.delete('/daily-cuts/:id', requirePermission('summary2', 'delete'), async (req, res) => {
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        try {
            const [existing] = await pool.query(
                'SELECT id, title, isLocked, dte_status, dte_numero_control FROM daily_cuts WHERE id = ?',
                [req.params.id]
            );
            if (existing.length === 0) {
                return res.status(404).json({ error: 'Corte no encontrado.' });
            }

            if (existing[0].dte_status === 'EMITTED') {
                return res.status(400).json({
                    error: `No se puede eliminar el corte diario '${existing[0].title}' porque ya tiene un DTE emitido (${existing[0].dte_numero_control || 'EMITTED'}).`
                });
            }

            if (existing[0].isLocked === 1) {
                return res.status(409).json({ error: 'No se puede eliminar un corte diario bloqueado. Debe desbloquearse primero.' });
            }

            await pool.query('DELETE FROM daily_cuts WHERE id = ?', [req.params.id]);
            await recordSyncTombstone('dailyCuts', req.params.id, actor);

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
            sendApiError(res, error);
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
            });

            res.json(cuts);
        } catch (error) {
            console.error('Error fetching insurance cuts:', error);
            sendApiError(res, error);
        }
    });

    router.get('/insurance-cuts/:id', requirePermission('insurance', 'view'), async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM insurance_cuts WHERE id = ?', [req.params.id]);
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Corte de seguro no encontrado' });
            }
            const cut = rows[0];
            const cleanStart = formatSqlDateOnly(cut.startDate);
            const cleanCutoff = formatSqlDateOnly(cut.cutoffDate) || '';

            let dtePayload = null;
            if (cut.dte_payload) {
                try {
                    dtePayload = typeof cut.dte_payload === 'string' ? JSON.parse(cut.dte_payload) : cut.dte_payload;
                } catch { dtePayload = null; }
            }

            res.json({
                ...cut,
                startDate: cleanStart,
                cutoffDate: cleanCutoff,
                premiumRate: Number(cut.premiumRate || 0.10),
                isLocked: Boolean(cut.isLocked),
                rowsData: typeof cut.rowsData === 'string' ? JSON.parse(cut.rowsData || '[]') : cut.rowsData,
                totalsData: typeof cut.totalsData === 'string' ? JSON.parse(cut.totalsData || '{}') : cut.totalsData,
                sipeSaleId: cut.sipe_sale_id ?? null,
                dteCodigoGeneracion: cut.dte_codigo_generacion ?? null,
                dteNumeroControl: cut.dte_numero_control ?? null,
                dteSelloRecepcion: cut.dte_sello_recepcion ?? null,
                dteStatus: cut.dte_status || 'UNBILLED',
                dteEmittedAt: cut.dte_emitted_at ?? null,
                dtePayload
            });
        } catch (error) {
            console.error('Error fetching insurance cut by id:', error);
            sendApiError(res, error);
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

            const cleanCutoffDate = formatSqlDateOnly(cutoffDate);
            const cleanStartDate = startDate ? formatSqlDateOnly(startDate) : null;
            if (!cleanCutoffDate) {
                return res.status(400).json({ error: 'La fecha de corte es obligatoria.' });
            }

            const autoTitle = title || `Corte de Seguro al ${cleanCutoffDate}`;
            const jsonRows = typeof rowsData === 'string' ? rowsData : JSON.stringify(rowsData);
            const jsonTotals = typeof totalsData === 'string' ? totalsData : JSON.stringify(totalsData);

            await pool.query(
                `INSERT INTO insurance_cuts 
                (id, title, customerName, warehouseName, startDate, cutoffDate, premiumRate, isLocked, rowsData, totalsData, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, autoTitle, customerName, warehouseName, cleanStartDate, cleanCutoffDate, premiumRate, isLocked ? 1 : 0, jsonRows, jsonTotals, actor]
            );

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'FREEZE_INSURANCE_CUT',
                module: 'insurance',
                details: `Cierre y congelamiento de póliza de seguro '${autoTitle}' al ${cleanCutoffDate}`
            });

            res.status(201).json({
                success: true,
                id,
                title: autoTitle,
                customerName,
                warehouseName,
                startDate: cleanStartDate,
                cutoffDate: cleanCutoffDate,
                premiumRate,
                isLocked: Boolean(isLocked),
                dteStatus: 'UNBILLED',
                created_by: actor
            });
        } catch (error) {
            console.error('Error creating insurance cut:', error);
            sendApiError(res, error);
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
                isLocked,
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
            if (Number(current.isLocked) === 1 && isLocked !== false && isLocked !== 0) {
                return res.status(409).json({
                    error: `El corte de seguro "${current.title || current.id}" se encuentra cerrado y bloqueado. Debe desbloquearse antes de modificar sus datos.`
                });
            }

            if (checkEntityVersionConflict(req, current)) {
                return res.status(409).json({
                    error: 'El corte fue modificado en el servidor mientras trabajabas sin conexión.',
                    code: 'VERSION_CONFLICT',
                    serverRecord: current
                });
            }

            const newTitle = title !== undefined ? title : current.title;
            const newCustomer = customerName !== undefined ? customerName : current.customerName;
            const newWarehouse = warehouseName !== undefined ? warehouseName : current.warehouseName;
            const newStartDate = formatSqlDateOnly(startDate !== undefined ? startDate : current.startDate);
            const newCutoffDate = formatSqlDateOnly(cutoffDate !== undefined ? cutoffDate : current.cutoffDate);
            const newPremiumRate = premiumRate !== undefined ? premiumRate : current.premiumRate;
            const newIsLocked = isLocked !== undefined ? (isLocked ? 1 : 0) : current.isLocked;

            const newRows = rowsData !== undefined
                ? (typeof rowsData === 'string' ? rowsData : JSON.stringify(rowsData))
                : current.rowsData;

            const newTotals = totalsData !== undefined
                ? (typeof totalsData === 'string' ? totalsData : JSON.stringify(totalsData))
                : current.totalsData;

            await pool.query(
                `UPDATE insurance_cuts 
                SET title = ?, customerName = ?, warehouseName = ?, startDate = ?, cutoffDate = ?, 
                    premiumRate = ?, isLocked = ?, rowsData = ?, totalsData = ?
                WHERE id = ?`,
                [newTitle, newCustomer, newWarehouse, newStartDate, newCutoffDate, newPremiumRate, newIsLocked, newRows, newTotals, req.params.id]
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
                isLocked: Boolean(newIsLocked)
            });
        } catch (error) {
            console.error('Error updating insurance cut:', error);
            sendApiError(res, error);
        }
    });

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
            sendApiError(res, error);
        }
    });

    router.delete('/insurance-cuts/:id', requirePermission('insurance', 'delete'), async (req, res) => {
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        try {
            const [existing] = await pool.query(
                'SELECT id, title, isLocked, dte_status, dte_numero_control FROM insurance_cuts WHERE id = ?',
                [req.params.id]
            );
            if (existing.length === 0) {
                return res.status(404).json({ error: 'Corte de seguro no encontrado.' });
            }

            if (existing[0].dte_status === 'EMITTED') {
                return res.status(400).json({
                    error: `No se puede eliminar el corte de seguro '${existing[0].title}' porque ya tiene un DTE emitido (${existing[0].dte_numero_control || 'EMITTED'}).`
                });
            }

            if (existing[0].isLocked === 1) {
                return res.status(409).json({ error: 'No se puede eliminar un corte de seguro bloqueado. Debe desbloquearse primero.' });
            }

            await pool.query('DELETE FROM insurance_cuts WHERE id = ?', [req.params.id]);
            await recordSyncTombstone('insuranceCuts', req.params.id, actor);

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
            sendApiError(res, error);
        }
    });
};
