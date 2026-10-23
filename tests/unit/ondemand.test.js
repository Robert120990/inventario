import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock minimal browser localStorage and window for Node test environment
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

globalThis.window = {
  dispatchEvent: () => {},
  fetch: async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', db: 'connected' }) })
};

import {
  saveLocalSnapshot,
  loadLocalSnapshot,
  getOfflineQueue,
  enqueueOfflineOperation,
  removeOfflineOperation,
  clearOfflineQueue,
  retryOfflineOperation,
  setActiveOfflineUser,
  getOtherUsersPendingSummary,
  getSyncedHistory,
  getEntitySyncState,
  isNetworkOrOfflineError,
  setOnDemandConnectivity,
  getOnDemandStatus,
  syncOfflineQueueWithServer
} from '../../src/utils/onDemandOffline.js';

describe('OnDemand Offline Engine & Deferred Sync Queue', () => {
  beforeEach(() => {
    store.clear();
    setActiveOfflineUser(null, { reset: true });
    clearOfflineQueue();
    setOnDemandConnectivity({
      isOnline: true,
      isPageAccessible: true,
      isSyncing: false,
      waitingAuth: false,
      lastError: null
    });
  });

  it('persists and hydrates local snapshots for offline operation', () => {
    const sampleProducts = [
      { id: 'p-1', sku: 'SKU-01', description: 'Pollo Congelado', stockUnits: 120 },
      { id: 'p-2', sku: 'SKU-02', description: 'Papas Fritas', stockUnits: 85 }
    ];

    const saved = saveLocalSnapshot('products', sampleProducts);
    assert.equal(saved, true);

    const hydrated = loadLocalSnapshot('products', []);
    assert.deepEqual(hydrated, sampleProducts);

    const missing = loadLocalSnapshot('non_existent_collection', ['fallback']);
    assert.deepEqual(missing, ['fallback']);
  });

  it('enqueues offline operations with metadata and coalesces consecutive PUT updates preserving initial baseVersion', () => {
    const op1 = enqueueOfflineOperation({
      type: 'CREATE_PRODUCT',
      module: 'products',
      label: 'Crear SKU-01',
      method: 'POST',
      endpoint: '/api/products',
      body: { id: 'p-1', sku: 'SKU-01', price: 10 },
      entityId: 'p-1'
    });
    assert.ok(op1.id);
    assert.equal(op1.idempotencyKey, op1.id);
    assert.ok(op1.createdAt);
    assert.equal(getOfflineQueue().length, 1);

    // Dos actualizaciones PUT seguidas sobre la misma entidad se fusionan preservando el baseVersion original
    enqueueOfflineOperation({
      type: 'UPDATE_PRODUCT',
      module: 'products',
      label: 'Editar SKU-01 v1',
      method: 'PUT',
      endpoint: '/api/products/p-1',
      body: { price: 12, description: 'Inicial' },
      entityId: 'p-1',
      baseVersion: { updatedAt: '2026-03-01T10:00:00.000Z', price: 10 }
    });
    enqueueOfflineOperation({
      type: 'UPDATE_PRODUCT',
      module: 'products',
      label: 'Editar SKU-01 v2',
      method: 'PUT',
      endpoint: '/api/products/p-1',
      body: { price: 15 },
      entityId: 'p-1',
      baseVersion: { updatedAt: '2026-03-01T10:05:00.000Z', price: 12 }
    });

    const queue = getOfflineQueue();
    assert.equal(queue.length, 2);
    assert.equal(queue[1].method, 'PUT');
    assert.equal(queue[1].body.price, 15);
    assert.equal(queue[1].body.description, 'Inicial');
    assert.deepEqual(queue[1].baseVersion, { updatedAt: '2026-03-01T10:00:00.000Z', price: 10 });

    removeOfflineOperation(op1.id);
    assert.equal(getOfflineQueue().length, 1);
  });

  it('isolates offline queues per user account and protects pending operations across logout and user switches', async () => {
    // Usuario A inicia sesión y registra cambios offline
    setActiveOfflineUser({ id: 10, username: 'operador_a' });
    enqueueOfflineOperation({
      type: 'CREATE_MOVEMENT',
      module: 'movements',
      label: 'Entrada Usuario A',
      method: 'POST',
      endpoint: '/api/movements',
      body: { id: 'mov-a1', refNumber: 'A-100' },
      entityId: 'mov-a1'
    });
    assert.equal(getOfflineQueue().length, 1);
    assert.equal(getOfflineQueue()[0].userId, '10');
    assert.equal(getOfflineQueue()[0].username, 'operador_a');

    // Usuario A cierra sesión: su cola NO se borra, pero queda oculta mientras no hay sesión
    setActiveOfflineUser(null, { loggedOut: true });
    assert.equal(getOfflineQueue().length, 0);

    // Usuario B inicia sesión en el mismo navegador: su cola está limpia y no envía lo de Usuario A
    setActiveOfflineUser({ id: 20, username: 'operador_b' });
    assert.equal(getOfflineQueue().length, 0);

    const otherSummary = getOtherUsersPendingSummary('20');
    assert.equal(otherSummary.totalCount, 1);
    assert.equal(otherSummary.accounts.length, 1);
    assert.equal(otherSummary.accounts[0].userId, '10');
    assert.equal(otherSummary.accounts[0].username, 'operador_a');

    // Si Usuario B sincroniza, NO se envía la operación de Usuario A
    const sentUrls = [];
    await syncOfflineQueueWithServer({
      apiFetch: async (url) => {
        sentUrls.push(url);
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      },
      currentUser: { id: 20, username: 'operador_b' }
    });
    assert.equal(sentUrls.length, 0);

    // Cuando Usuario A vuelve a iniciar sesión, recupera intacta su cola pendiente
    setActiveOfflineUser({ id: 10, username: 'operador_a' });
    assert.equal(getOfflineQueue().length, 1);
    assert.equal(getOfflineQueue()[0].entityId, 'mov-a1');
  });

  it('detects network errors and gateway unavailability accurately', () => {
    assert.equal(isNetworkOrOfflineError(new TypeError('Failed to fetch')), true);
    assert.equal(isNetworkOrOfflineError(new Error('NetworkError when attempting to fetch resource')), true);
    assert.equal(isNetworkOrOfflineError(null, { status: 503 }), true);
    assert.equal(isNetworkOrOfflineError(null, { status: 502 }), true);
    assert.equal(isNetworkOrOfflineError(null, { status: 400 }), false);
  });

  it('synchronizes queued offline operations with X-Idempotency-Key and X-Base-Version headers and records synced history', async () => {
    setActiveOfflineUser({ id: 1, username: 'admin' });
    enqueueOfflineOperation({
      type: 'CREATE_PRODUCT',
      module: 'products',
      label: 'Nuevo producto offline',
      method: 'POST',
      endpoint: '/api/products',
      body: { id: 'p-100', sku: 'OFF-100' },
      entityId: 'p-100'
    });
    enqueueOfflineOperation({
      type: 'UPDATE_PRODUCT',
      module: 'products',
      label: 'Editar producto offline',
      method: 'PUT',
      endpoint: '/api/products/p-100',
      body: { price: 25 },
      entityId: 'p-100',
      baseVersion: { updatedAt: '2026-03-10T12:00:00.000Z', price: 20 }
    });

    assert.equal(getEntitySyncState('products', 'p-100').state, 'pending');

    const receivedCalls = [];
    const mockApiFetch = async (url, options) => {
      receivedCalls.push({
        url,
        method: options.method,
        headers: options.headers,
        body: JSON.parse(options.body)
      });
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    };

    const result = await syncOfflineQueueWithServer({
      apiFetch: mockApiFetch,
      apiBaseUrl: ''
    });

    assert.equal(result.syncedCount, 2);
    assert.equal(result.failedCount, 0);
    assert.equal(result.remaining, 0);
    assert.equal(getOfflineQueue().length, 0);
    assert.equal(receivedCalls.length, 2);
    assert.ok(receivedCalls[0].headers['X-Idempotency-Key']);
    assert.ok(receivedCalls[1].headers['X-Base-Version']);
    assert.equal(getSyncedHistory().length, 2);
    assert.equal(getEntitySyncState('products', 'p-100').state, 'synced');
    assert.ok(getOnDemandStatus().lastSyncedAt);
  });

  it('pauses queue synchronization with waiting_auth on HTTP 401 and handles HTTP 409 conflicts with retry/forceOverwrite', async () => {
    setActiveOfflineUser({ id: 5, username: 'supervisor' });
    const op = enqueueOfflineOperation({
      type: 'UPDATE_PRODUCT',
      module: 'products',
      label: 'Actualizar precio SKU-50',
      method: 'PUT',
      endpoint: '/api/products/p-50',
      body: { price: 99 },
      entityId: 'p-50',
      baseVersion: { updatedAt: '2026-03-01T00:00:00.000Z', price: 80 }
    });

    // 1. Simular 401 (sesión expirada): no debe perder ni marcar como fallida la operación
    const res401 = await syncOfflineQueueWithServer({
      apiFetch: async () => ({ ok: false, status: 401, json: async () => ({ error: 'Token expirado' }) })
    });
    assert.equal(res401.waitingAuth, true);
    assert.equal(res401.remaining, 1);
    assert.equal(getOfflineQueue()[0].status, 'waiting_auth');

    // Al re-autenticarse el usuario, la operación vuelve a 'pending'
    setActiveOfflineUser({ id: 5, username: 'supervisor' });
    assert.equal(getOfflineQueue()[0].status, 'pending');

    // 2. Simular conflicto de versión 409 del servidor
    const res409 = await syncOfflineQueueWithServer({
      apiFetch: async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          code: 'VERSION_CONFLICT',
          error: 'El registro fue modificado por otro usuario en el servidor.'
        })
      })
    });
    assert.equal(res409.failedCount, 1);
    assert.equal(getOfflineQueue()[0].status, 'conflict');
    assert.equal(getOfflineQueue()[0].conflictCode, 'VERSION_CONFLICT');
    assert.equal(getEntitySyncState('products', 'p-50').state, 'conflict');

    // 3. Resolver conflicto forzando envío (forceOverwrite: true)
    const retried = retryOfflineOperation(op.id, { forceOverwrite: true });
    assert.equal(retried.status, 'pending');
    assert.equal(retried.forceOverwrite, true);

    let receivedForceHeader = null;
    const resResolved = await syncOfflineQueueWithServer({
      apiFetch: async (_url, options) => {
        receivedForceHeader = options.headers['X-Force-Overwrite'];
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
    });
    assert.equal(resResolved.syncedCount, 1);
    assert.equal(receivedForceHeader, 'true');
    assert.equal(getOfflineQueue().length, 0);
  });
});
