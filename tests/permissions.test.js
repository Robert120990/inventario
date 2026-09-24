import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requirePermission } from '../api/middleware/permissions.js';

describe('Middleware de Permisos RBAC (requirePermission)', () => {
    it('debe permitir acceso total a usuarios con rol admin', () => {
        const middleware = requirePermission('products', 'delete');
        const req = { user: { id: 1, username: 'admin', role: 'admin' } };
        let nextCalled = false;
        const res = {};
        const next = () => { nextCalled = true; };

        middleware(req, res, next);
        assert.equal(nextCalled, true);
    });

    it('debe rechazar con 403 si el usuario no tiene permisos para el módulo', () => {
        const middleware = requirePermission('security-users', 'create');
        const req = {
            user: {
                id: 2,
                username: 'almacenista1',
                role: 'user',
                permissions: {
                    movements: { view: true, create: true },
                    products: { view: true }
                }
            }
        };
        let statusSent = null;
        let jsonSent = null;
        const res = {
            status(code) {
                statusSent = code;
                return this;
            },
            json(data) {
                jsonSent = data;
                return this;
            }
        };
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        middleware(req, res, next);
        assert.equal(nextCalled, false);
        assert.equal(statusSent, 403);
        assert.match(jsonSent.error, /Acceso denegado/);
    });

    it('debe rechazar con 403 si el usuario tiene el módulo pero no la acción requerida', () => {
        const middleware = requirePermission('products', 'delete');
        const req = {
            user: {
                id: 3,
                username: 'supervisor1',
                role: 'user',
                permissions: {
                    products: { view: true, create: true, edit: true, delete: false }
                }
            }
        };
        let statusSent = null;
        const res = {
            status(code) {
                statusSent = code;
                return this;
            },
            json() {
                return this;
            }
        };
        let nextCalled = false;

        middleware(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(statusSent, 403);
    });

    it('debe permitir acceso cuando el usuario tiene la acción requerida activa', () => {
        const middleware = requirePermission('movements', 'create');
        const req = {
            user: {
                id: 4,
                username: 'almacenista2',
                role: 'user',
                permissions: {
                    movements: { view: true, create: true }
                }
            }
        };
        let nextCalled = false;

        middleware(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
    });

    it('debe heredar permisos de seguridad base (security) para submódulos (security-users)', () => {
        const middleware = requirePermission('security-users', 'view');
        const req = {
            user: {
                id: 5,
                username: 'auditor1',
                role: 'user',
                permissions: {
                    security: { view: true }
                }
            }
        };
        let nextCalled = false;

        middleware(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
    });

    it('debe heredar permiso de summary2 a partir de summary', () => {
        const middleware = requirePermission('summary2', 'view');
        const req = {
            user: {
                id: 6,
                username: 'auditor2',
                role: 'user',
                permissions: {
                    summary: { view: true }
                }
            }
        };
        let nextCalled = false;

        middleware(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
    });
});
