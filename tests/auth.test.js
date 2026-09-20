import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateToken, verifyToken } from '../api/middleware/auth.js';
import pool from '../api/db.js';

describe('Autenticación y Sesiones (verifyToken / generateToken)', () => {
    it('generateToken genera un token válido verificable', () => {
        const payload = { id: 99, username: 'testuser', role: 'user', sessionId: 'sess-123' };
        const token = generateToken(payload);
        assert.ok(typeof token === 'string');
        assert.ok(token.length > 20);
    });

    it('verifyToken rechaza peticiones sin encabezado Authorization con 401', async () => {
        const req = { headers: {} };
        let statusSent = null;
        let jsonSent = null;
        const res = {
            status(code) { statusSent = code; return this; },
            json(data) { jsonSent = data; return this; }
        };
        let nextCalled = false;

        await verifyToken(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(statusSent, 401);
        assert.match(jsonSent.error, /token de acceso es requerido/);
    });

    it('verifyToken rechaza tokens inválidos o manipulados con 401', async () => {
        const req = { headers: { authorization: 'Bearer token_invalido_falso.123' } };
        let statusSent = null;
        const res = {
            status(code) { statusSent = code; return this; },
            json() { return this; }
        };
        let nextCalled = false;

        await verifyToken(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(statusSent, 401);
    });

    it('verifyToken rechaza cuando la sesión fue eliminada de active_sessions', async () => {
        // Mock pool.query para simular usuario activo pero sesión revocada
        const originalQuery = pool.query;
        try {
            pool.query = async (sql, params) => {
                if (sql.includes('FROM users')) {
                    return [[{ id: 88, username: 'revoked_user', role: 'user', isActive: 1, permissions: null }]];
                }
                if (sql.includes('FROM active_sessions')) {
                    // Sesión eliminada (revocada)
                    return [[]];
                }
                return [[]];
            };

            const token = generateToken({ id: 88, username: 'revoked_user', role: 'user', sessionId: 'revoked-session-id' });
            const req = { headers: { authorization: `Bearer ${token}` } };
            let statusSent = null;
            let jsonSent = null;
            const res = {
                status(code) { statusSent = code; return this; },
                json(data) { jsonSent = data; return this; }
            };
            let nextCalled = false;

            await verifyToken(req, res, () => { nextCalled = true; });
            assert.equal(nextCalled, false);
            assert.equal(statusSent, 401);
            assert.match(jsonSent.error, /Sesión revocada/);
        } finally {
            pool.query = originalQuery;
        }
    });

    it('verifyToken rechaza cuando la cuenta del usuario está desactivada (isActive = 0)', async () => {
        const originalQuery = pool.query;
        try {
            pool.query = async (sql) => {
                if (sql.includes('FROM users')) {
                    return [[{ id: 77, username: 'inactive_user', role: 'user', isActive: 0 }]];
                }
                return [[]];
            };

            const token = generateToken({ id: 77, username: 'inactive_user', role: 'user' });
            const req = { headers: { authorization: `Bearer ${token}` } };
            let statusSent = null;
            let jsonSent = null;
            const res = {
                status(code) { statusSent = code; return this; },
                json(data) { jsonSent = data; return this; }
            };
            let nextCalled = false;

            await verifyToken(req, res, () => { nextCalled = true; });
            assert.equal(nextCalled, false);
            assert.equal(statusSent, 401);
            assert.match(jsonSent.error, /Cuenta de usuario desactivada/);
        } finally {
            pool.query = originalQuery;
        }
    });
});
