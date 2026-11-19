import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../api/db.js';
import app from '../../api/index.js';
import { extractClientIp, isAllowedCorsOrigin } from '../../api/utils/helpers.js';
import { calculateSummaryReport } from '../../src/utils/summaryReportUtils.js';
import { ensureCascadingIntegrity, calculateStorageTotals } from '../../src/utils/summary2Engine.js';
import { buildSummary2WordHtml } from '../../src/utils/summary2Exporters.js';

const findApiRouteHandler = (routePath, method) => {
  const apiLayer = app._router.stack.find(
    layer => layer.route?.path === '/api' || layer.name === 'router'
  );
  const routeLayer = apiLayer?.handle?.stack?.find(
    layer => layer.route?.path === routePath && layer.route?.methods?.[method]
  );
  assert.ok(routeLayer, `Ruta ${method.toUpperCase()} ${routePath} debe existir`);
  return routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
};

describe('Auditoría de Mejoras: Reportes, Seguridad, Validaciones y Respaldo', () => {

  it('calculateSummaryReport suma múltiples líneas del mismo SKU y respeta fronteras exactas de fechas', () => {
    const products = [
      {
        id: 'p1',
        sku: 'POLLO-01',
        description: 'Pechuga Congelada',
        category: 'Congelados',
        price: 2.5,
        stockUnits: 100,
        stockPounds: 500,
        stockBaskets: 20
      },
      {
        id: 'p2',
        sku: 'PREP-01',
        description: 'Alitas Preparadas',
        category: 'Preparados',
        price: 10,
        stockUnits: 0,
        stockPounds: 0,
        stockBaskets: 50
      }
    ];
    const categoryUnits = { Congelados: 'pounds', Preparados: 'baskets' };

    const movements = [
      // Antes de startDate -> no debe contarse en entradas/salidas del rango ni en afterEnd
      {
        id: 'm0',
        type: 'in',
        date: '2026-04-30',
        items: [{ productId: 'p1', qtyUnits: 10, qtyPounds: 100, qtyBaskets: 2 }]
      },
      // En frontera exacta startDate con SKU duplicado en dos líneas dentro del mismo movimiento
      {
        id: 'm1',
        type: 'in',
        date: '2026-05-01',
        items: [
          { productId: 'p1', qtyUnits: 5, qtyPounds: 40.5, qtyBaskets: 1 },
          { productId: 'p1', qtyUnits: 5, qtyPounds: 59.5, qtyBaskets: 1 },
          { productId: 'p2', qtyUnits: 0, qtyPounds: 0, qtyBaskets: 12 }
        ]
      },
      // En frontera exacta endDate (salida parcial de p1 en 2 líneas)
      {
        id: 'm2',
        type: 'out',
        date: '2026-05-10',
        items: [
          { productId: 'p1', qtyUnits: 1, qtyPounds: 15, qtyBaskets: 0 },
          { productId: 'p1', qtyUnits: 1, qtyPounds: 10, qtyBaskets: 0 }
        ]
      },
      // Posterior a endDate: entrada de +50 lbs que debe revertirse al reconstruir stockFinal al 2026-05-10
      {
        id: 'm3',
        type: 'in',
        date: '2026-05-11',
        items: [{ productId: 'p1', qtyUnits: 5, qtyPounds: 50, qtyBaskets: 1 }]
      }
    ];

    const report = calculateSummaryReport({
      products,
      movements,
      categoryUnits,
      startDate: '2026-05-01',
      endDate: '2026-05-10'
    });

    assert.equal(report.length, 2);

    const p1Row = report.find(r => r.id === 'p1');
    assert.ok(p1Row);
    assert.equal(p1Row.unidad, 'Lbs');
    // Stock actual 500 - 50 (movimiento post-cierre m3) = 450
    assert.equal(p1Row.stockFinal, 450);
    // Entradas en rango: 40.5 + 59.5 = 100
    assert.equal(p1Row.entradas, 100);
    // Salidas en rango: 15 + 10 = 25
    assert.equal(p1Row.salidas, 25);
    // Stock inicial al 2026-05-01: 450 - 100 + 25 = 375
    assert.equal(p1Row.stockInicial, 375);
    assert.equal(p1Row.total, 450 * 2.5);

    const p2Row = report.find(r => r.id === 'p2');
    assert.equal(p2Row.unidad, 'Cst');
    assert.equal(p2Row.entradas, 12);
    assert.equal(p2Row.stockFinal, 50);
    assert.equal(p2Row.stockInicial, 38);
  });

  it('ensureCascadingIntegrity y calculateStorageTotals encadenan saldos diarios y recalculan desde startIndex', () => {
    const initialRows = [
      { fecha: '2026-05-01', stockInicial: 100, entradas: 50, salidas: 20, precio: 0.001 },
      { fecha: '2026-05-02', stockInicial: 999, entradas: 10, salidas: 30, precio: 0.001 },
      { fecha: '2026-05-03', stockInicial: 0, entradas: 25, salidas: 5, precio: 0.001 }
    ];

    const cascaded = ensureCascadingIntegrity(initialRows, 0.001, 0);
    assert.equal(cascaded[0].stockFinal, 130);
    assert.equal(cascaded[1].stockInicial, 130);
    assert.equal(cascaded[1].stockFinal, 110);
    assert.equal(cascaded[2].stockInicial, 110);
    assert.equal(cascaded[2].stockFinal, 130);
    assert.ok(Math.abs(cascaded[2].totalMonto - 0.13) < 1e-9);

    // Edición en línea de día 2 (startIndex = 1): recalcula día 2 y día 3 sin tocar día 1
    const edited = cascaded.map(r => ({ ...r }));
    edited[1].entradas = 40;
    const partial = ensureCascadingIntegrity(edited, 0.001, 1);
    assert.equal(partial[0].stockFinal, 130);
    assert.equal(partial[1].stockInicial, 130);
    assert.equal(partial[1].stockFinal, 140);
    assert.equal(partial[2].stockInicial, 140);
    assert.equal(partial[2].stockFinal, 160);

    const totals = calculateStorageTotals(partial);
    assert.equal(totals.invInicial, 100 + 130 + 140);
    assert.equal(totals.entradas, 50 + 40 + 25);
    assert.equal(totals.salidas, 20 + 30 + 5);
    assert.equal(totals.stockFinal, 130 + 140 + 160);
    assert.ok(Math.abs(totals.totalMonto - 0.43) < 1e-9);
  });

  it('buildSummary2WordHtml escapa cargas XSS en campos dinámicos del reporte Word', () => {
    const html = buildSummary2WordHtml({
      clientName: '<script>alert("xss-client")</script> & "Avícola"',
      startDate: '2026-05-01',
      endDate: '2026-05-01',
      daysCount: 1,
      activeCut: { title: '<img src=x onerror=alert(1)> Corte Malicioso' },
      congeladosRows: [
        {
          fecha: '2026-05-01',
          descripcion: 'Desc <b>"segura"</b> & <script>evil()</script>',
          stockInicial: 100,
          entradas: 0,
          salidas: 0,
          stockFinal: 100,
          precio: 0.001,
          totalMonto: 0.1
        }
      ],
      preparadosRows: [
        {
          fecha: '2026-05-01',
          descripcion: '<svg onload=alert(1)> Prep',
          stockInicial: 10,
          entradas: 0,
          salidas: 0,
          stockFinal: 10,
          precio: 0.038,
          totalMonto: 0.38
        }
      ],
      servicesData: [
        {
          date: '2026-05-01',
          description: '<script>steal()</script> Maniobra',
          ref: 'Doc "X" <img src=x onerror=alert(2)>',
          quantity: 1,
          unitPrice: 54,
          value: 54
        }
      ]
    });

    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img '));
    assert.ok(!html.includes('<svg '));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss-client&quot;)&lt;/script&gt; &amp; &quot;Avícola&quot;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; Corte Malicioso'));
    assert.ok(html.includes('&lt;script&gt;steal()&lt;/script&gt; Maniobra (Doc &quot;X&quot; &lt;img src=x onerror=alert(2)&gt;)'));
  });

  it('extractClientIp trunca IPs largas/arrays a <= 45 chars e isAllowedCorsOrigin valida orígenes estrictos', () => {
    const longChain = '2001:0db8:85a3:0000:0000:8a2e:0370:7334, 198.51.100.42, 203.0.113.195';
    const ipFromStr = extractClientIp({ headers: { 'x-forwarded-for': longChain } });
    assert.equal(ipFromStr.length, 45);
    assert.equal(ipFromStr, longChain.slice(0, 45));

    const ipFromArr = extractClientIp({ headers: { 'x-forwarded-for': ['192.168.1.10', '10.0.0.1'] } });
    assert.equal(ipFromArr, '192.168.1.10');

    assert.equal(isAllowedCorsOrigin('https://inventario-coldroom.vercel.app', '', 'production'), true);
    assert.equal(isAllowedCorsOrigin('http://localhost:5173', '', 'development'), true);
    assert.equal(isAllowedCorsOrigin('http://127.0.0.1:3000', '', 'development'), true);
    assert.equal(isAllowedCorsOrigin('https://evil-inventario.vercel.app', '', 'production'), false);
    assert.equal(isAllowedCorsOrigin('https://localhost.attacker.com', '', 'development'), false);
  });

  it('PUT /movements/:id rechaza tipo inválido y cantidades negativas o nulas con HTTP 400', async () => {
    const handler = findApiRouteHandler('/movements/:id', 'put');

    const callHandler = async (body) => {
      let statusCode = null;
      let payload = null;
      const req = {
        params: { id: 'mov-1' },
        body,
        user: { id: 1, username: 'admin', role: 'admin' }
      };
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { payload = data; return this; }
      };
      await handler(req, res);
      return { statusCode, payload };
    };

    const badType = await callHandler({
      type: 'transfer',
      date: '2026-05-01',
      items: [{ productId: 'p1', qtyUnits: 5, qtyPounds: 10, qtyBaskets: 0 }]
    });
    assert.equal(badType.statusCode, 400);
    assert.match(badType.payload.error, /Tipo de movimiento inválido/);

    const negativeQty = await callHandler({
      type: 'in',
      date: '2026-05-01',
      items: [{ productId: 'p1', qtyUnits: -1, qtyPounds: 10, qtyBaskets: 0 }]
    });
    assert.equal(negativeQty.statusCode, 400);
    assert.match(negativeQty.payload.error, /positivas y no negativas/);

    const zeroQty = await callHandler({
      type: 'out',
      date: '2026-05-01',
      items: [{ productId: 'p1', qtyUnits: 0, qtyPounds: 0, qtyBaskets: 0 }]
    });
    assert.equal(zeroQty.statusCode, 400);
    assert.match(zeroQty.payload.error, /positivas y no negativas/);
  });

  it('POST /system/restore restaura daily_cuts, insurance_cuts, settings y system_config dentro de la transacción', async () => {
    const handler = findApiRouteHandler('/system/restore', 'post');
    const originalGetConnection = pool.getConnection;
    const executedQueries = [];
    let committed = false;
    let released = false;

    try {
      pool.getConnection = async () => ({
        async beginTransaction() {},
        async query(sql, params = []) {
          executedQueries.push({ sql, params });
          return [[]];
        },
        async commit() { committed = true; },
        async rollback() {},
        release() { released = true; }
      });

      const req = {
        user: { id: 1, username: 'admin', role: 'admin' },
        body: {
          backup: {
            meta: { exportedAt: '2026-05-15T12:00:00Z' },
            tables: {
              products: [
                { id: 'p1', sku: 'SKU-1', description: 'Prod', category: 'Congelados', price: 1, stockUnits: 10, stockPounds: 50, stockBaskets: 2 }
              ],
              movements: [],
              movement_items: [],
              services: [],
              inventory_adjustments: [],
              daily_cuts: [
                {
                  id: 'dc-1',
                  title: 'Corte Mayo 1',
                  clientName: 'Avícola Salvadoreña',
                  startDate: '2026-05-01',
                  endDate: '2026-05-10',
                  status: 'closed',
                  isLocked: 1,
                  congeladosData: [{ fecha: '2026-05-01', stockFinal: 50 }],
                  preparadosData: [],
                  servicesData: [],
                  totalsData: { totalGeneral: 100 }
                }
              ],
              insurance_cuts: [
                {
                  id: 'ic-1',
                  title: 'Seguro Mayo',
                  customerName: 'Avícola Salvadoreña',
                  warehouseName: 'Cuarto Frío',
                  startDate: '2026-05-01',
                  cutoffDate: '2026-05-15',
                  premiumRate: 0.1,
                  isLocked: 1,
                  rowsData: [],
                  totalsData: { totalPremium: 12.5 }
                }
              ],
              settings: [{ id: 1, name: 'Inventario Pro Restaurado', logo: null }],
              system_config: [{ config_key: 'contract_rates', config_value: { ivaRate: 0.13 }, updated_by: 'admin' }]
            }
          }
        }
      };

      let statusCode = 200;
      let jsonBody = null;
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { jsonBody = data; return this; }
      };

      await handler(req, res);

      assert.equal(statusCode, 200);
      assert.equal(jsonBody.success, true);
      assert.equal(committed, true);
      assert.equal(released, true);

      const sqlList = executedQueries.map(q => q.sql);
      assert.ok(sqlList.some(s => s.includes('DELETE FROM daily_cuts')));
      assert.ok(sqlList.some(s => s.includes('INSERT INTO daily_cuts')));
      assert.ok(sqlList.some(s => s.includes('DELETE FROM insurance_cuts')));
      assert.ok(sqlList.some(s => s.includes('INSERT INTO insurance_cuts')));
      assert.ok(sqlList.some(s => s.includes('INSERT INTO settings')));
      assert.ok(sqlList.some(s => s.includes('INSERT INTO system_config')));
    } finally {
      pool.getConnection = originalGetConnection;
    }
  });
});
