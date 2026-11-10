import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { MIGRATIONS } from '../api/db.js';
import app, {
    isAllowedCorsOrigin,
    isValidSettingsLogo,
    formatSqlDateOnly,
    formatDailyCutRow,
    maybePruneSyncTables,
    requirePermission
} from '../api/index.js';
import { shouldReuseMainPool, getSipeDbPool } from '../api/services/sipeBillingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getApiRouterStack = () =>
    app._router.stack.find(layer => layer.route?.path === '/api' || layer.name === 'router')?.handle?.stack || [];

describe('Track A: Backend Security, RBAC, Sync Scalability & Pool Guards', () => {

    it('Configura trust proxy = 1 en Express y cabeceras HTTP de seguridad en vercel.json', () => {
        assert.equal(app.get('trust proxy'), 1);

        const vercelPath = path.resolve(__dirname, '../vercel.json');
        const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
        assert.equal(vercelConfig.version, 2);
        assert.ok(Array.isArray(vercelConfig.rewrites) && vercelConfig.rewrites.length > 0);
        assert.ok(Array.isArray(vercelConfig.headers), 'vercel.json debe definir bloque headers');

        const globalRule = vercelConfig.headers.find(h => h.source === '/(.*)');
        assert.ok(globalRule, 'Debe existir regla global /(.*)');
        const globalMap = Object.fromEntries(globalRule.headers.map(h => [h.key, h.value]));
        assert.equal(globalMap['X-Content-Type-Options'], 'nosniff');
        assert.equal(globalMap['X-Frame-Options'], 'DENY');
        assert.equal(globalMap['Referrer-Policy'], 'strict-origin-when-cross-origin');
        assert.equal(globalMap['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');

        const swRule = vercelConfig.headers.find(h => h.source === '/(sw\\.js|version\\.json)');
        assert.ok(swRule, 'Debe existir regla anti-caché para sw.js y version.json');
        const swMap = Object.fromEntries(swRule.headers.map(h => [h.key, h.value]));
        assert.equal(swMap['Cache-Control'], 'no-cache, no-store, must-revalidate');
    });

    it('Valida estrictamente orígenes CORS rechazando subdominios Vercel de terceros', () => {
        // Sin origen (peticiones servidor a servidor o mismo origen)
        assert.equal(isAllowedCorsOrigin(undefined, '', 'production'), true);
        assert.equal(isAllowedCorsOrigin(null, '', 'production'), true);
        assert.equal(isAllowedCorsOrigin('', '', 'production'), true);

        // URLs malformadas o protocolos no HTTP/HTTPS
        assert.equal(isAllowedCorsOrigin('not-a-valid-url', '', 'production'), false);
        assert.equal(isAllowedCorsOrigin('javascript:alert(1)', '', 'production'), false);

        // Rechaza aplicaciones arbitrarias en .vercel.app (incluyendo prefijos engañosos o HTTP plano)
        assert.equal(isAllowedCorsOrigin('https://evil.vercel.app', '', 'production'), false);
        assert.equal(isAllowedCorsOrigin('https://evil-inventario.vercel.app', '', 'production'), false);
        assert.equal(isAllowedCorsOrigin('http://inventario-preview-123.vercel.app', '', 'production'), false);

        // Acepta despliegues legítimos de inventario en Vercel sobre HTTPS
        assert.equal(isAllowedCorsOrigin('https://inventario.vercel.app', '', 'production'), true);
        assert.equal(isAllowedCorsOrigin('https://inventario-preview-123.vercel.app', '', 'production'), true);

        // Acepta coincidencias exactas normalizadas en ALLOWED_ORIGINS
        assert.equal(
            isAllowedCorsOrigin('https://almacen.lil.com.sv', 'https://almacen.lil.com.sv/, https://erp.lil.com.sv', 'production'),
            true
        );
        assert.equal(
            isAllowedCorsOrigin('https://intruso.com', 'https://almacen.lil.com.sv', 'production'),
            false
        );

        // Localhost permitido en desarrollo, bloqueado en producción salvo ALLOWED_ORIGINS
        assert.equal(isAllowedCorsOrigin('http://localhost:5173', '', 'development'), true);
        assert.equal(isAllowedCorsOrigin('http://127.0.0.1:3000', '', 'development'), true);
        assert.equal(isAllowedCorsOrigin('http://localhost:5173', '', 'production'), false);
    });

    it('POST /settings valida logotipo Base64 rechazando SVG con <script> y URLs externas con 400', async () => {
        const pngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const svgPayload = 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+';
        const trackingUrl = 'https://evil.tracker.example/pixel.png';

        assert.equal(isValidSettingsLogo(pngBase64), true);
        assert.equal(isValidSettingsLogo(null), true);
        assert.equal(isValidSettingsLogo(''), true);
        assert.equal(isValidSettingsLogo(svgPayload), false);
        assert.equal(isValidSettingsLogo(trackingUrl), false);
        assert.equal(isValidSettingsLogo({ bad: true }), false);
        assert.equal(isValidSettingsLogo('data:image/png;base64,' + 'A'.repeat(2_800_001)), false);

        const postSettingsRoute = getApiRouterStack().find(
            l => l.route?.path === '/settings' && l.route?.methods?.post
        );
        assert.ok(postSettingsRoute, 'Ruta POST /settings debe existir');
        const handler = postSettingsRoute.route.stack[postSettingsRoute.route.stack.length - 1].handle;

        // 1. Rechazar SVG malicioso con 400
        let statusSvg = null;
        let jsonSvg = null;
        await handler(
            { body: { name: 'Inventario', logo: svgPayload }, user: { id: 1, username: 'admin', role: 'admin' } },
            { status(c) { statusSvg = c; return this; }, json(d) { jsonSvg = d; return this; } }
        );
        assert.equal(statusSvg, 400);
        assert.match(jsonSvg.error, /logotipo inválido/i);

        // 2. Rechazar URL HTTP externa con 400
        let statusHttp = null;
        await handler(
            { body: { name: 'Inventario', logo: trackingUrl }, user: { id: 1, username: 'admin', role: 'admin' } },
            { status(c) { statusHttp = c; return this; }, json() { return this; } }
        );
        assert.equal(statusHttp, 400);

        // 3. Aceptar PNG Base64 legítimo
        const originalQuery = pool.query;
        try {
            pool.query = async () => [{ affectedRows: 1 }];
            let jsonOk = null;
            await handler(
                { body: { name: 'Inventario Pro', logo: pngBase64 }, user: { id: 1, username: 'admin', role: 'admin' } },
                { status() { return this; }, json(d) { jsonOk = d; return this; } }
            );
            assert.equal(jsonOk.success, true);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('formatSqlDateOnly y rutas de cortes preservan fechas locales sin desfase UTC-6 de 1 día', async () => {
        // 22:30 hora local del 25 de enero: .toISOString() en UTC-6 saltaría a 2026-01-26, pero formatSqlDateOnly conserva 2026-01-25
        const lateLocalDate = new Date(2026, 0, 25, 22, 30, 0);
        assert.equal(formatSqlDateOnly(lateLocalDate), '2026-01-25');
        assert.equal(formatSqlDateOnly('2026-02-10T00:00:00.000Z'), '2026-02-10');
        assert.equal(formatSqlDateOnly('2026-03-15 18:45:00'), '2026-03-15');
        assert.equal(formatSqlDateOnly(null), null);
        assert.equal(formatSqlDateOnly(''), null);
        assert.equal(formatSqlDateOnly(new Date('invalid')), null);

        const getInsRoute = getApiRouterStack().find(
            l => l.route?.path === '/insurance-cuts' && l.route?.methods?.get
        );
        const handler = getInsRoute.route.stack[getInsRoute.route.stack.length - 1].handle;

        const originalQuery = pool.query;
        try {
            pool.query = async () => [[{
                id: 'ins-tz-1',
                title: 'Corte Seguro Enero',
                startDate: new Date(2026, 0, 11, 21, 0, 0),
                cutoffDate: new Date(2026, 0, 25, 23, 0, 0),
                premiumRate: 0.10,
                isLocked: 1,
                rowsData: '[]',
                totalsData: '{}'
            }]];

            let cuts = null;
            await handler(
                { query: {}, user: { id: 1, role: 'admin' } },
                { status() { return this; }, json(d) { cuts = d; return this; } }
            );
            assert.equal(cuts[0].startDate, '2026-01-11');
            assert.equal(cuts[0].cutoffDate, '2026-01-25');
        } finally {
            pool.query = originalQuery;
        }
    });

    it('formatDailyCutRow preserva closingStock antes de vaciar arreglos en modo summaryOnly y /bootstrap conserva 3 cortes completos', async () => {
        const rawCut = {
            id: 'cut-hist-1',
            title: 'Corte 11/01/2026 al 25/01/2026',
            startDate: new Date(2026, 0, 11, 22, 0, 0),
            endDate: new Date(2026, 0, 25, 22, 0, 0),
            isLocked: 1,
            congeladosData: JSON.stringify([
                { fecha: '2026-01-11', stockFinal: 1000 },
                { fecha: '2026-01-25', stockFinal: 1450.75 }
            ]),
            preparadosData: JSON.stringify([
                { fecha: '2026-01-11', stockFinal: 40 },
                { fecha: '2026-01-25', stockFinal: 0 }
            ]),
            servicesData: JSON.stringify([{ description: 'Rastra', value: 54 }]),
            totalsData: JSON.stringify({ grandTotal: 210.25 })
        };

        const summarized = formatDailyCutRow(rawCut, 4, true);
        assert.equal(summarized.isSummaryOnly, true);
        assert.deepEqual(summarized.congeladosData, []);
        assert.deepEqual(summarized.preparadosData, []);
        assert.deepEqual(summarized.servicesData, []);
        assert.deepEqual(summarized.closingStock, {
            congeladosData: 1450.75,
            preparadosData: 0
        });
        assert.equal(summarized.totals.grandTotal, 210.25);

        const full = formatDailyCutRow(rawCut, 0, false);
        assert.equal(full.isSummaryOnly, undefined);
        assert.equal(full.congeladosData.length, 2);
        assert.deepEqual(full.closingStock, {
            congeladosData: 1450.75,
            preparadosData: 0
        });

        // Verificar ventana de 3 cortes completos + históricos resumidos en GET /bootstrap
        const bootstrapRoute = getApiRouterStack().find(
            l => l.route?.path === '/bootstrap' && l.route?.methods?.get
        );
        const bootstrapHandler = bootstrapRoute.route.stack[bootstrapRoute.route.stack.length - 1].handle;

        const originalQuery = pool.query;
        try {
            pool.query = async (sql) => {
                if (sql.includes('FROM daily_cuts')) {
                    return [[0, 1, 2, 3, 4].map(i => ({
                        id: `cut-${i}`,
                        title: `Corte #${i}`,
                        startDate: '2026-01-01',
                        endDate: '2026-01-10',
                        isLocked: 1,
                        congeladosData: JSON.stringify([{ fecha: '2026-01-10', stockFinal: 500 + i }]),
                        preparadosData: JSON.stringify([{ fecha: '2026-01-10', stockFinal: 10 + i }]),
                        servicesData: '[]',
                        totalsData: JSON.stringify({ grandTotal: 100 + i })
                    }))];
                }
                return [[]];
            };

            let boot = null;
            await bootstrapHandler(
                { query: {}, user: { id: 1, username: 'admin', role: 'admin' } },
                { status() { return this; }, json(d) { boot = d; return this; } }
            );

            assert.equal(boot.dailyCuts.length, 5);
            for (const idx of [0, 1, 2]) {
                assert.equal(boot.dailyCuts[idx].congeladosData.length, 1, `Corte reciente idx=${idx} debe conservar filas`);
                assert.equal(boot.dailyCuts[idx].isSummaryOnly, undefined);
                assert.equal(boot.dailyCuts[idx].closingStock.congeladosData, 500 + idx);
            }
            for (const idx of [3, 4]) {
                assert.deepEqual(boot.dailyCuts[idx].congeladosData, [], `Corte histórico idx=${idx} debe ir resumido`);
                assert.equal(boot.dailyCuts[idx].isSummaryOnly, true);
                assert.deepEqual(boot.dailyCuts[idx].closingStock, {
                    congeladosData: 500 + idx,
                    preparadosData: 10 + idx
                });
            }
        } finally {
            pool.query = originalQuery;
        }
    });

    it('RBAC exige permiso delete (no edit) en DELETE /daily-cuts/:id y DELETE /insurance-cuts/:id, y semillas de Administrador incluyen delete', async () => {
        // 1. Verificar middleware requirePermission directamente
        const guardSummaryDelete = requirePermission('summary2', 'delete');
        let deniedStatus = null;
        let nextCalled = false;
        guardSummaryDelete(
            {
                user: {
                    id: 2,
                    username: 'supervisor',
                    role: 'user',
                    permissions: { summary2: { view: true, create: true, edit: true, delete: false } }
                }
            },
            { status(c) { deniedStatus = c; return this; }, json() { return this; } },
            () => { nextCalled = true; }
        );
        assert.equal(nextCalled, false);
        assert.equal(deniedStatus, 403);

        let allowedNext = false;
        guardSummaryDelete(
            {
                user: {
                    id: 3,
                    username: 'deleter',
                    role: 'user',
                    permissions: { summary2: { view: true, edit: true, delete: true } }
                }
            },
            { status() { return this; }, json() { return this; } },
            () => { allowedNext = true; }
        );
        assert.equal(allowedNext, true);

        // 2. Verificar que las rutas DELETE de cortes tengan asociado el guard de 'delete'
        const deleteDailyRoute = getApiRouterStack().find(
            l => l.route?.path === '/daily-cuts/:id' && l.route?.methods?.delete
        );
        const deleteInsuranceRoute = getApiRouterStack().find(
            l => l.route?.path === '/insurance-cuts/:id' && l.route?.methods?.delete
        );
        assert.ok(deleteDailyRoute, 'DELETE /daily-cuts/:id debe existir');
        assert.ok(deleteInsuranceRoute, 'DELETE /insurance-cuts/:id debe existir');

        let statusDaily = null;
        deleteDailyRoute.route.stack[0].handle(
            {
                user: {
                    id: 2,
                    role: 'user',
                    permissions: { summary2: { view: true, edit: true, delete: false } }
                }
            },
            { status(c) { statusDaily = c; return this; }, json() { return this; } },
            () => {}
        );
        assert.equal(statusDaily, 403, 'Supervisor con edit:true y delete:false no puede eliminar cortes diarios');

        let statusInsurance = null;
        deleteInsuranceRoute.route.stack[0].handle(
            {
                user: {
                    id: 2,
                    role: 'user',
                    permissions: { insurance: { view: true, edit: true, delete: false } }
                }
            },
            { status(c) { statusInsurance = c; return this; }, json() { return this; } },
            () => {}
        );
        assert.equal(statusInsurance, 403, 'Supervisor con edit:true y delete:false no puede eliminar cortes de seguro');

        // 3. Verificar que la migración 004_seed_defaults incluya create/edit/delete en summary2 e insurance para Administrador
        const seedMigration = MIGRATIONS.find(m => m.version === '004_seed_defaults');
        assert.ok(seedMigration, 'Migración 004_seed_defaults debe existir');
        let capturedAdminPerms = null;
        await seedMigration.run({
            query: async (sql, params) => {
                if (sql.includes('SELECT COUNT(*) as count FROM roles')) return [[{ count: 0 }]];
                if (sql.includes('INSERT INTO roles')) {
                    capturedAdminPerms = JSON.parse(params[0]);
                    return [{ affectedRows: 4 }];
                }
                if (sql.includes('SELECT COUNT(*)')) return [[{ count: 1 }]];
                return [[]];
            }
        });
        assert.deepEqual(capturedAdminPerms.summary2, { view: true, create: true, edit: true, delete: true, export: true });
        assert.deepEqual(capturedAdminPerms.insurance, { view: true, create: true, edit: true, delete: true, export: true });
    });

    it('PUT /notifications/read-all aísla notificaciones globales (userId IS NULL) para operadores no administradores', async () => {
        const readAllRoute = getApiRouterStack().find(
            l => l.route?.path === '/notifications/read-all' && l.route?.methods?.put
        );
        assert.ok(readAllRoute, 'PUT /notifications/read-all debe existir');
        const handler = readAllRoute.route.stack[readAllRoute.route.stack.length - 1].handle;

        const originalQuery = pool.query;
        const queries = [];
        try {
            pool.query = async (sql, params) => {
                queries.push({ sql, params });
                return [{ affectedRows: 1 }];
            };

            // Operador normal: solo marca WHERE userId = ?
            await handler(
                { user: { id: 15, username: 'operador15', role: 'user' }, body: {} },
                { status() { return this; }, json() { return this; } }
            );
            assert.equal(queries.length, 1);
            assert.ok(!queries[0].sql.includes('IS NULL'), 'Operador no debe marcar alertas globales userId IS NULL');
            assert.deepEqual(queries[0].params, [15]);

            // Administrador: marca WHERE userId = ? OR userId IS NULL
            await handler(
                { user: { id: 1, username: 'admin', role: 'admin' }, body: {} },
                { status() { return this; }, json() { return this; } }
            );
            assert.equal(queries.length, 2);
            assert.ok(queries[1].sql.includes('userId = ? OR userId IS NULL'));
            assert.deepEqual(queries[1].params, [1]);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('GET /sync/changes exige requiresFullBootstrap cuando since supera 29 días y maybePruneSyncTables aplica throttling', async () => {
        const syncRoute = getApiRouterStack().find(
            l => l.route?.path === '/sync/changes' && l.route?.methods?.get
        );
        const handler = syncRoute.route.stack[syncRoute.route.stack.length - 1].handle;

        const originalQuery = pool.query;
        const executedQueries = [];
        try {
            pool.query = async (sql) => {
                executedQueries.push(sql);
                return [[]];
            };

            const staleSince = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
            let resBody = null;
            await handler(
                { query: { since: staleSince }, user: { id: 1, role: 'admin' } },
                { status() { return this; }, json(d) { resBody = d; return this; } }
            );

            assert.equal(resBody.success, true);
            assert.equal(resBody.hasChanges, true);
            assert.equal(resBody.requiresFullBootstrap, true);
            assert.ok(resBody.syncCursor);

            // Probar ejecución forzada y throttling de maybePruneSyncTables
            executedQueries.length = 0;
            const prunedForced = await maybePruneSyncTables(true);
            assert.equal(prunedForced, true);
            assert.ok(executedQueries.some(q => q.includes('DELETE FROM idempotency_keys') && q.includes('INTERVAL 7 DAY')));
            assert.ok(executedQueries.some(q => q.includes('DELETE FROM sync_tombstones') && q.includes('INTERVAL 30 DAY')));

            executedQueries.length = 0;
            const prunedThrottled = await maybePruneSyncTables(false);
            assert.equal(prunedThrottled, false, 'Llamada subsecuente dentro de la ventana de 6h debe omitirse');
            assert.equal(executedQueries.length, 0);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('sipeBillingService reutiliza mainPool cuando SIPE_DB_* apunta al mismo servidor, usuario y base de datos', () => {
        assert.equal(
            shouldReuseMainPool({
                DB_HOST: 'mysql.internal',
                DB_USER: 'inv_user',
                DB_NAME: 'db_shared',
                DB_PORT: '3306'
            }),
            true
        );

        assert.equal(
            shouldReuseMainPool({
                DB_HOST: 'mysql.internal',
                DB_USER: 'inv_user',
                DB_NAME: 'db_shared',
                SIPE_DB_HOST: 'mysql.internal',
                SIPE_DB_USER: 'inv_user',
                SIPE_DB_NAME: 'db_shared'
            }),
            true
        );

        assert.equal(
            shouldReuseMainPool({
                DB_HOST: 'mysql.internal',
                DB_USER: 'inv_user',
                DB_NAME: 'db_web_inventory',
                SIPE_DB_NAME: 'db_sistema_saas'
            }),
            false
        );

        const prevHost = process.env.SIPE_DB_HOST;
        const prevName = process.env.SIPE_DB_NAME;
        const prevUser = process.env.SIPE_DB_USER;
        const prevPort = process.env.SIPE_DB_PORT;
        try {
            delete process.env.SIPE_DB_HOST;
            delete process.env.SIPE_DB_NAME;
            delete process.env.SIPE_DB_USER;
            delete process.env.SIPE_DB_PORT;
            assert.equal(getSipeDbPool(), pool, 'getSipeDbPool() debe retornar exactamente mainPool');
        } finally {
            if (prevHost === undefined) delete process.env.SIPE_DB_HOST; else process.env.SIPE_DB_HOST = prevHost;
            if (prevName === undefined) delete process.env.SIPE_DB_NAME; else process.env.SIPE_DB_NAME = prevName;
            if (prevUser === undefined) delete process.env.SIPE_DB_USER; else process.env.SIPE_DB_USER = prevUser;
            if (prevPort === undefined) delete process.env.SIPE_DB_PORT; else process.env.SIPE_DB_PORT = prevPort;
        }
    });

});
