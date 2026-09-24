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
            pool.query = async (sql, params) => {
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
            pool.query = async (sql, params) => {
                if (sql.includes('UPDATE products SET')) {
                    executedSql = sql;
                    executedParams = params;
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
            pool.query = async (sql, params) => {
                if (sql.includes('UPDATE active_sessions')) {
                    executedSql = sql;
                    executedParams = params;
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

});
