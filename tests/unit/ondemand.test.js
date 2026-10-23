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
  isNetworkOrOfflineError,
  setOnDemandConnectivity,
  getOnDemandStatus,
  syncOfflineQueueWithServer
} from '../../src/utils/onDemandOffline.js';

describe('OnDemand Offline Engine & Deferred Sync Queue', () => {
  beforeEach(() => {
    store.clear();
    clearOfflineQueue();
    setOnDemandConnectivity({ isOnline: true, isPageAccessible: true, isSyncing: false, lastError: null });
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

  it('enqueues offline operations and coalesces consecutive PUT updates for the same entity', () => {
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
    assert.equal(getOfflineQueue().length, 1);

    // Dos actualizaciones PUT seguidas sobre la misma entidad se fusionan en una sola operación pendiente
    enqueueOfflineOperation({
      type: 'UPDATE_PRODUCT',
      module: 'products',
      label: 'Editar SKU-01 v1',
      method: 'PUT',
      endpoint: '/api/products/p-1',
      body: { price: 12, description: 'Inicial' },
      entityId: 'p-1'
    });
    enqueueOfflineOperation({
      type: 'UPDATE_PRODUCT',
      module: 'products',
      label: 'Editar SKU-01 v2',
      method: 'PUT',
      endpoint: '/api/products/p-1',
      body: { price: 15 },
      entityId: 'p-1'
    });

    const queue = getOfflineQueue();
    assert.equal(queue.length, 2);
    assert.equal(queue[1].method, 'PUT');
    assert.equal(queue[1].body.price, 15);
    assert.equal(queue[1].body.description, 'Inicial');

    removeOfflineOperation(op1.id);
    assert.equal(getOfflineQueue().length, 1);
  });

  it('detects network errors and gateway unavailability accurately', () => {
    assert.equal(isNetworkOrOfflineError(new TypeError('Failed to fetch')), true);
    assert.equal(isNetworkOrOfflineError(new Error('NetworkError when attempting to fetch resource')), true);
    assert.equal(isNetworkOrOfflineError(null, { status: 503 }), true);
    assert.equal(isNetworkOrOfflineError(null, { status: 502 }), true);
    assert.equal(isNetworkOrOfflineError(null, { status: 400 }), false);
  });

  it('synchronizes queued offline operations with the web server when connection returns', async () => {
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
      type: 'CREATE_MOVEMENT',
      module: 'movements',
      label: 'Entrada offline',
      method: 'POST',
      endpoint: '/api/movements',
      body: { id: 'm-100', type: 'entrada' },
      entityId: 'm-100'
    });

    const receivedCalls = [];
    const mockApiFetch = async (url, options) => {
      receivedCalls.push({ url, method: options.method, body: JSON.parse(options.body) });
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
    assert.equal(receivedCalls[0].url, '/api/products');
    assert.equal(receivedCalls[1].url, '/api/movements');
    assert.ok(getOnDemandStatus().lastSyncedAt);
  });
});
