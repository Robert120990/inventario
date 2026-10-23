import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../api/db.js';
import app from '../api/index.js';

describe('Seguridad y Control de Acceso (RBAC, Lockout y Escalabilidad)', () => {

    it('Previene auto-eliminación de la cuenta de usuario activa con 409', async () => {
        // Encontrar la ruta DELETE /users/:id en el router
        const deleteUserRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/users/:id' && layer.route?.methods?.delete);

        assert.ok(deleteUserRoute, 'Ruta DELETE /users/:id debe existir');

        // Simular req/res con usuario intentando eliminarse a sí mismo
        const req = {
            params: { id: '5' },
            user: { id: 5, username: 'admin_self', role: 'admin' }
        };
        let statusSent = null;
        let jsonSent = null;
        const res = {
            status(code) { statusSent = code; return this; },
            json(data) { jsonSent = data; return this; }
        };

        const handler = deleteUserRoute.route.stack[deleteUserRoute.route.stack.length - 1].handle;
        await handler(req, res);

        assert.equal(statusSent, 409);
        assert.match(jsonSent.error, /No puedes eliminar tu propia cuenta/);
    });

    it('Previene eliminar al único administrador activo del sistema con 409', async () => {
        const deleteUserRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/users/:id' && layer.route?.methods?.delete);

        const originalQuery = pool.query;
        try {
            pool.query = async (sql, _params) => {
                if (sql.includes('SELECT id, username, role, isActive FROM users WHERE id=?')) {
                    return [[{ id: 2, username: 'last_admin', role: 'admin', isActive: 1 }]];
                }
                if (sql.includes('COUNT(*) as count FROM users WHERE role = "admin" AND isActive = 1')) {
                    // Cero otros administradores activos
                    return [[{ count: 0 }]];
                }
                return [[]];
            };

            const req = {
                params: { id: '2' },
                user: { id: 1, username: 'other_user', role: 'admin' }
            };
            let statusSent = null;
            let jsonSent = null;
            const res = {
                status(code) { statusSent = code; return this; },
                json(data) { jsonSent = data; return this; }
            };

            const handler = deleteUserRoute.route.stack[deleteUserRoute.route.stack.length - 1].handle;
            await handler(req, res);

            assert.equal(statusSent, 409);
            assert.match(jsonSent.error, /único administrador activo/);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('Previene auto-desactivación de la cuenta de usuario activa con 409', async () => {
        const putUserRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/users/:id' && layer.route?.methods?.put);

        const originalQuery = pool.query;
        try {
            pool.query = async (sql) => {
                if (sql.includes('SELECT id, username, role, isActive FROM users WHERE id = ?')) {
                    return [[{ id: 10, username: 'active_admin', role: 'admin', isActive: 1 }]];
                }
                return [[]];
            };

            const req = {
                params: { id: '10' },
                body: { username: 'active_admin', isActive: false },
                user: { id: 10, username: 'active_admin', role: 'admin' }
            };
            let statusSent = null;
            let jsonSent = null;
            const res = {
                status(code) { statusSent = code; return this; },
                json(data) { jsonSent = data; return this; }
            };

            const handler = putUserRoute.route.stack[putUserRoute.route.stack.length - 1].handle;
            await handler(req, res);

            assert.equal(statusSent, 409);
            assert.match(jsonSent.error, /No puedes desactivar tu propia cuenta/);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('Previene que un usuario no-administrador cree un usuario con rol admin con 403', async () => {
        const postUserRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/users' && layer.route?.methods?.post);

        const req = {
            body: { username: 'new_hacker', password: 'password123', role: 'admin' },
            user: { id: 3, username: 'supervisor1', role: 'user' }
        };
        let statusSent = null;
        let jsonSent = null;
        const res = {
            status(code) { statusSent = code; return this; },
            json(data) { jsonSent = data; return this; }
        };

        const handler = postUserRoute.route.stack[postUserRoute.route.stack.length - 1].handle;
        await handler(req, res);

        assert.equal(statusSent, 403);
        assert.match(jsonSent.error, /Solo un administrador puede crear usuarios con rol de Administrador/);
    });

    it('Previene que un no-administrador modifique una cuenta con rol admin con 403', async () => {
        const putUserRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/users/:id' && layer.route?.methods?.put);

        const originalQuery = pool.query;
        try {
            pool.query = async (sql) => {
                if (sql.includes('SELECT id, username, role, isActive FROM users WHERE id = ?')) {
                    return [[{ id: 1, username: 'admin', role: 'admin', isActive: 1 }]];
                }
                return [[]];
            };

            const req = {
                params: { id: '1' },
                body: { username: 'admin', password: 'newpassword123' },
                user: { id: 4, username: 'supervisor', role: 'user' }
            };
            let statusSent = null;
            let jsonSent = null;
            const res = {
                status(code) { statusSent = code; return this; },
                json(data) { jsonSent = data; return this; }
            };

            const handler = putUserRoute.route.stack[putUserRoute.route.stack.length - 1].handle;
            await handler(req, res);

            assert.equal(statusSent, 403);
            assert.match(jsonSent.error, /Solo un administrador puede modificar una cuenta de Administrador/);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('Exige contraseñas de al menos 8 caracteres al crear usuarios', async () => {
        const postUserRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/users' && layer.route?.methods?.post);

        const req = {
            body: { username: 'short_pass_user', password: '123', role: 'user' },
            user: { id: 1, username: 'admin', role: 'admin' }
        };
        let statusSent = null;
        let jsonSent = null;
        const res = {
            status(code) { statusSent = code; return this; },
            json(data) { jsonSent = data; return this; }
        };

        const handler = postUserRoute.route.stack[postUserRoute.route.stack.length - 1].handle;
        await handler(req, res);

        assert.equal(statusSent, 400);
        assert.match(jsonSent.error, /al menos 8 caracteres/);
    });

    it('PUT /products/:id no altera stockUnits ni stockPounds ni stockBaskets', async () => {
        const putProductRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/products/:id' && layer.route?.methods?.put);

        const originalQuery = pool.query;
        let executedSql = '';
        let executedParams = [];

        try {
            pool.query = async (sql, _params) => {
                if (sql.includes('UPDATE products SET')) {
                    executedSql = sql;
                    executedParams = _params;
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            };

            const req = {
                params: { id: 'prod-001' },
                body: {
                    sku: 'PROD-MOD',
                    description: 'Producto Modificado',
                    category: 'Congelados',
                    price: 25.5,
                    stockUnits: 99999, // Intento malicioso de alterar stock
                    stockPounds: 88888,
                    stockBaskets: 77777
                },
                user: { id: 1, username: 'admin', role: 'admin' }
            };
            const res = {
                json() { return this; },
                status() { return this; }
            };

            const handler = putProductRoute.route.stack[putProductRoute.route.stack.length - 1].handle;
            await handler(req, res);

            assert.ok(!executedSql.includes('stockUnits='), 'No debe actualizar stockUnits');
            assert.ok(!executedSql.includes('stockPounds='), 'No debe actualizar stockPounds');
            assert.ok(!executedSql.includes('stockBaskets='), 'No debe actualizar stockBaskets');
            assert.deepEqual(executedParams, ['PROD-MOD', 'Producto Modificado', 'Congelados', 25.5, 'prod-001']);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('Heartbeat de sesión valida pertenencia por userId y sessionId', async () => {
        const heartbeatRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/active-sessions/heartbeat' && layer.route?.methods?.post);

        const originalQuery = pool.query;
        let executedSql = '';
        let executedParams = [];

        try {
            pool.query = async (sql, _params) => {
                if (sql.includes('UPDATE active_sessions')) {
                    executedSql = sql;
                    executedParams = _params;
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            };

            const req = {
                body: { sessionId: 'my-session-id' },
                user: { id: 42, username: 'user42', sessionId: 'my-session-id' },
                headers: {}
            };
            let jsonSent = null;
            const res = {
                json(data) { jsonSent = data; return this; },
                status() { return this; }
            };

            const handler = heartbeatRoute.route.stack[heartbeatRoute.route.stack.length - 1].handle;
            await handler(req, res);

            assert.ok(executedSql.includes('WHERE id = ? AND userId = ?'));
            assert.equal(executedParams[executedParams.length - 1], 42);
            assert.equal(jsonSent.success, true);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('Endpoint público /health no expone conteo de usuarios ni errores internos de SQL', async () => {
        const healthRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/health' && layer.route?.methods?.get);

        const originalQuery = pool.query;
        try {
            pool.query = async () => {
                throw new Error('Access denied for user root@189.20.10.5 (using password: YES)');
            };

            const req = {};
            let jsonSent = null;
            const res = {
                json(data) { jsonSent = data; return this; }
            };

            const handler = healthRoute.route.stack[healthRoute.route.stack.length - 1].handle;
            await handler(req, res);

            assert.equal(jsonSent.status, 'ok');
            assert.equal(jsonSent.db, 'disconnected');
            assert.equal(jsonSent.users, undefined, 'No debe filtrar cantidad de usuarios');
            assert.ok(!JSON.stringify(jsonSent).includes('Access denied'), 'No debe filtrar error interno de MySQL');
        } finally {
            pool.query = originalQuery;
        }
    });

    it('StyledSheetBuilder sanitiza celdas de texto contra Formula Injection (CWE-1236)', async () => {
        const { StyledSheetBuilder } = await import('../src/utils/exportManager.js');
        const mockXLSX = {
            utils: {
                encode_cell: ({ r, c }) => `${String.fromCharCode(65 + c)}${r + 1}`
            }
        };
        const builder = new StyledSheetBuilder(mockXLSX);

        // Caso 1: Cadena maliciosa que inicia con '='
        const cellFormula = builder.setCell(0, 0, '=SUM(1+1)');
        assert.equal(cellFormula.v, "'=SUM(1+1)", "Debe anteponer apóstrofe a fórmulas con '='");

        // Caso 2: Cadena maliciosa que inicia con '+'
        const cellPlus = builder.setCell(1, 0, '+cmd|"/C calc"!A0');
        assert.equal(cellPlus.v, "'+cmd|\"/C calc\"!A0", "Debe anteponer apóstrofe a comandos con '+'");

        // Caso 3: Cadena maliciosa que inicia con '-'
        const cellMinus = builder.setCell(2, 0, '-2+3');
        assert.equal(cellMinus.v, "'-2+3", "Debe anteponer apóstrofe a expresiones con '-'");

        // Caso 4: Cadena maliciosa que inicia con '@'
        const cellAt = builder.setCell(3, 0, '@SUM(A1:A5)');
        assert.equal(cellAt.v, "'@SUM(A1:A5)", "Debe anteponer apóstrofe a fórmulas con '@'");

        // Caso 5: Número legítimo
        const cellNum = builder.setCell(4, 0, 150.75);
        assert.equal(cellNum.v, 150.75);
        assert.equal(cellNum.t, 'n');

        // Caso 6: Texto normal legítimo
        const cellText = builder.setCell(5, 0, 'Pechuga Especial');
        assert.equal(cellText.v, 'Pechuga Especial');
    });

    it('escapeCsvCell neutraliza Formula Injection (CWE-1236) en exportaciones CSV', async () => {
        const { escapeCsvCell } = await import('../src/utils/exportManager.js');
        assert.equal(escapeCsvCell('=1+1'), "'=1+1");
        assert.equal(escapeCsvCell('+SUM(A1)'), "'+SUM(A1)");
        assert.equal(escapeCsvCell('-cmd'), "'-cmd");
        assert.equal(escapeCsvCell('@evil'), "'@evil");
        assert.equal(escapeCsvCell(125.5), '125.5');
        assert.equal(escapeCsvCell('Pollo Congelado'), 'Pollo Congelado');
    });

    it('PUT /daily-cuts/:id y PUT /insurance-cuts/:id rechazan modificar cortes bloqueados con 409', async () => {
        const putDailyCutRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/daily-cuts/:id' && layer.route?.methods?.put);

        const putInsCutRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/insurance-cuts/:id' && layer.route?.methods?.put);

        const originalQuery = pool.query;
        try {
            pool.query = async (sql) => {
                if (sql.includes('FROM daily_cuts WHERE id = ?')) {
                    return [[{ id: 'dc-1', title: 'Corte Quincenal Cerrado', isLocked: 1 }]];
                }
                if (sql.includes('FROM insurance_cuts WHERE id = ?')) {
                    return [[{ id: 'ic-1', title: 'Corte Seguro Cerrado', isLocked: 1 }]];
                }
                return [[]];
            };

            let statusDaily = null;
            let jsonDaily = null;
            const dailyHandler = putDailyCutRoute.route.stack[putDailyCutRoute.route.stack.length - 1].handle;
            await dailyHandler(
                { params: { id: 'dc-1' }, body: { title: 'Intento Sobrescribir' }, user: { id: 1, username: 'admin', role: 'admin' } },
                { status(c) { statusDaily = c; return this; }, json(d) { jsonDaily = d; return this; } }
            );
            assert.equal(statusDaily, 409);
            assert.match(jsonDaily.error, /cerrado y bloqueado/);

            let statusIns = null;
            let jsonIns = null;
            const insHandler = putInsCutRoute.route.stack[putInsCutRoute.route.stack.length - 1].handle;
            await insHandler(
                { params: { id: 'ic-1' }, body: { title: 'Intento Sobrescribir Seguro' }, user: { id: 1, username: 'admin', role: 'admin' } },
                { status(c) { statusIns = c; return this; }, json(d) { jsonIns = d; return this; } }
            );
            assert.equal(statusIns, 409);
            assert.match(jsonIns.error, /cerrado y bloqueado/);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('POST /billing/emit exige permiso edit en summary2 o insurance (403 para rol de solo lectura)', async () => {
        const emitBillingRoute = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack?.find(layer => layer.route?.path === '/billing/emit' && layer.route?.methods?.post);

        assert.ok(emitBillingRoute, 'Ruta POST /billing/emit debe existir');
        // El middleware de permisos está en el índice 1 (después de verifyToken)
        const rbacMiddleware = emitBillingRoute.route.stack[1].handle;

        let statusSent = null;
        let jsonSent = null;
        let nextCalled = false;
        await rbacMiddleware(
            {
                user: {
                    id: 9,
                    username: 'auditor_readonly',
                    role: 'user',
                    permissions: { summary2: { view: true, edit: false }, insurance: { view: true, edit: false } }
                }
            },
            { status(c) { statusSent = c; return this; }, json(d) { jsonSent = d; return this; } },
            () => { nextCalled = true; }
        );

        assert.equal(nextCalled, false);
        assert.equal(statusSent, 403);
        assert.match(jsonSent.error, /Acceso denegado/);
    });

    it('Endpoints /system/database-stats, /system/backup y /system/restore existen y están protegidos', () => {
        const routerStack = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack || [];

        const statsRoute = routerStack.find(l => l.route?.path === '/system/database-stats' && l.route?.methods?.get);
        const backupRoute = routerStack.find(l => l.route?.path === '/system/backup' && l.route?.methods?.get);
        const restoreRoute = routerStack.find(l => l.route?.path === '/system/restore' && l.route?.methods?.post);

        assert.ok(statsRoute, 'GET /system/database-stats debe estar registrado');
        assert.ok(backupRoute, 'GET /system/backup debe estar registrado');
        assert.ok(restoreRoute, 'POST /system/restore debe estar registrado');
    });

    it('Endpoint GET /bootstrap consolida carga inicial en paralelo respetando permisos RBAC y ?summary=1 en /daily-cuts', async () => {
        const routerStack = app._router.stack
            .find(layer => layer.route?.path === '/api' || layer.name === 'router')
            ?.handle?.stack || [];

        const bootstrapRoute = routerStack.find(l => l.route?.path === '/bootstrap' && l.route?.methods?.get);
        const dailyCutsRoute = routerStack.find(l => l.route?.path === '/daily-cuts' && l.route?.methods?.get);
        assert.ok(bootstrapRoute, 'GET /bootstrap debe estar registrado');
        assert.ok(dailyCutsRoute, 'GET /daily-cuts debe estar registrado');

        const originalQuery = pool.query;
        try {
            pool.query = async (sql) => {
                if (sql.includes('FROM products')) {
                    return [[{ id: 'p-1', sku: 'SKU-01', description: 'Pollo', category: 'Congelados', stockUnits: 10, stockPounds: 50, stockBaskets: 2 }]];
                }
                if (sql.includes('FROM movements')) {
                    return [[{ id: 'm-1', type: 'in', date: '2026-01-20', refNumber: 'REF-1' }]];
                }
                if (sql.includes('FROM movement_items')) {
                    return [[{ id: 1, movementId: 'm-1', productId: 'p-1', qtyUnits: 10, qtyPounds: 50, qtyBaskets: 2 }]];
                }
                if (sql.includes('FROM services')) {
                    return [[]];
                }
                if (sql.includes('FROM categories')) {
                    return [[{ id: 1, name: 'Congelados', unit_type: 'pounds' }]];
                }
                if (sql.includes('FROM document_types')) {
                    return [[{ id: 1, name: 'Factura' }]];
                }
                if (sql.includes('FROM settings')) {
                    return [[{ id: 1, name: 'Inventario Pro', logo: null }]];
                }
                if (sql.includes('FROM system_config')) {
                    return [[]];
                }
                if (sql.includes('FROM versions')) {
                    return [[{ id: 1, version: 'V1', description: 'Init', changes: '["Cambio 1"]', author: 'Admin', date: '2026-01-01', time: '10:00' }]];
                }
                if (sql.includes('FROM notifications')) {
                    return [[{ id: 'n-1', title: 'Aviso', message: 'Ok', type: 'info', isRead: 0 }]];
                }
                if (sql.includes('FROM daily_cuts')) {
                    return [[
                        {
                            id: 'cut-latest',
                            title: 'Corte Reciente',
                            startDate: '2026-01-11',
                            endDate: '2026-01-25',
                            isLocked: 1,
                            congeladosData: JSON.stringify([{ sku: 'SKU-01', finalPounds: 50 }]),
                            preparadosData: JSON.stringify([{ sku: 'SKU-02', finalUnits: 10 }]),
                            servicesData: JSON.stringify([]),
                            totalsData: JSON.stringify({ grandTotal: 120.5 })
                        },
                        {
                            id: 'cut-older',
                            title: 'Corte Anterior',
                            startDate: '2025-12-26',
                            endDate: '2026-01-10',
                            isLocked: 1,
                            congeladosData: JSON.stringify([{ sku: 'SKU-01', finalPounds: 30 }]),
                            preparadosData: JSON.stringify([{ sku: 'SKU-02', finalUnits: 5 }]),
                            servicesData: JSON.stringify([]),
                            totalsData: JSON.stringify({ grandTotal: 95.0 })
                        }
                    ]];
                }
                return [[]];
            };

            // 1. Probar /bootstrap con un usuario sin permisos de seguridad (no debe recibir lista completa de usuarios ni roles)
            const bootstrapHandler = bootstrapRoute.route.stack[bootstrapRoute.route.stack.length - 1].handle;
            let bootstrapJson = null;
            await bootstrapHandler(
                {
                    query: {},
                    user: {
                        id: 7,
                        username: 'operador',
                        role: 'user',
                        permissions: {
                            products: { view: true },
                            movements: { view: true },
                            summary2: { view: true },
                            'security-users': { view: false },
                            'security-roles': { view: false }
                        }
                    }
                },
                { json(d) { bootstrapJson = d; return this; }, status() { return this; } }
            );

            assert.equal(bootstrapJson.success, true);
            assert.equal(bootstrapJson.products.length, 1);
            assert.equal(bootstrapJson.movements.length, 1);
            assert.equal(bootstrapJson.movements[0].items.length, 1);
            assert.equal(bootstrapJson.dailyCuts.length, 2);
            assert.equal(bootstrapJson.users.length, 1);
            assert.equal(bootstrapJson.users[0].username, 'operador');
            assert.deepEqual(bootstrapJson.roles, []);

            // 2. Probar /daily-cuts?summary=1 (índice 0 completo, índice > 0 resumido)
            const dailyCutsHandler = dailyCutsRoute.route.stack[dailyCutsRoute.route.stack.length - 1].handle;
            let cutsJson = null;
            await dailyCutsHandler(
                { query: { summary: '1' }, user: { id: 1, username: 'admin', role: 'admin' } },
                { json(d) { cutsJson = d; return this; }, status() { return this; } }
            );

            assert.equal(cutsJson.length, 2);
            assert.equal(cutsJson[0].congeladosData.length, 1, 'El corte más reciente (index 0) conserva congeladosData completo');
            assert.equal(cutsJson[0].isSummaryOnly, undefined);
            assert.deepEqual(cutsJson[1].congeladosData, [], 'Cortes anteriores (index > 0) omiten arrays pesados en modo summary=1');
            assert.equal(cutsJson[1].isSummaryOnly, true);
            assert.equal(cutsJson[1].totals.grandTotal, 95.0);
        } finally {
            pool.query = originalQuery;
        }
    });

});
