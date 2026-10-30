import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDateOnly,
  addDaysToDateStr,
  buildInclusiveDateRange,
  resolveCutPeriod,
  computeNextLiveCutRange
} from '../../src/utils/dailyCutDateUtils.js';
import { formatDate, formatTimestampLocal } from '../../src/utils/formatUtils.js';

describe('Cálculo de Períodos en Resumen Diario e Historial de Cortes', () => {
  it('toma como Fecha Inicial el día siguiente al último corte (ej. último corte día 28 -> toma día 29)', () => {
    const cuts = [
      {
        id: 'cut-5',
        title: 'Corte 28/09/2026 al 15/10/2026',
        startDate: '2026-09-28',
        endDate: '2026-10-15'
      },
      {
        id: 'cut-6',
        title: 'Corte 16/10/2026 al 28/10/2026',
        startDate: '2026-10-16',
        endDate: '2026-10-28'
      }
    ];

    const range = computeNextLiveCutRange(cuts, '2026-10-30');
    assert.equal(range.lastCutEndDate, '2026-10-28');
    assert.equal(range.startDate, '2026-10-29');
    assert.equal(range.endDate, '2026-10-30');
  });

  it('resuelve correctamente cambios de mes y año bisiesto al sumar 1 día al último corte', () => {
    assert.equal(addDaysToDateStr('2026-10-31', 1), '2026-11-01');
    assert.equal(addDaysToDateStr('2026-12-31', 1), '2027-01-01');
    assert.equal(addDaysToDateStr('2028-02-28', 1), '2028-02-29');
  });

  it('corrige automáticamente metadatos desfasados contra las filas congeladas del corte', () => {
    const corruptedCut = {
      id: '8d2067d0',
      title: 'Corte 30/10/2026 al 30/10/2026',
      startDate: '2026-10-30',
      endDate: '2026-10-30',
      congeladosData: [
        { fecha: '2026-10-16', stockFinal: 100 },
        { fecha: '2026-10-28', stockFinal: 200 }
      ],
      preparadosData: [
        { fecha: '2026-10-16', stockFinal: 50 },
        { fecha: '2026-10-28', stockFinal: 60 }
      ]
    };

    const resolved = resolveCutPeriod(corruptedCut);
    assert.equal(resolved.startDate, '2026-10-16');
    assert.equal(resolved.endDate, '2026-10-28');
    assert.equal(resolved.title, 'Corte 16/10/2026 al 28/10/2026');

    // Incluso si llegara un snapshot local antiguo, el siguiente período vivo toma día 29
    const nextLive = computeNextLiveCutRange([corruptedCut], '2026-10-30');
    assert.equal(nextLive.startDate, '2026-10-29');
    assert.equal(nextLive.endDate, '2026-10-30');
  });

  it('preserva títulos personalizados del usuario al resolver el período real', () => {
    const customTitledCut = {
      id: 'c-custom',
      title: 'Cierre Especial Quincena Octubre',
      startDate: '2026-10-01',
      endDate: '2026-10-15',
      congeladosData: [
        { fecha: '2026-10-01', stockFinal: 10 },
        { fecha: '2026-10-15', stockFinal: 20 }
      ]
    };

    const resolved = resolveCutPeriod(customTitledCut);
    assert.equal(resolved.title, 'Cierre Especial Quincena Octubre');
    assert.equal(resolved.startDate, '2026-10-01');
    assert.equal(resolved.endDate, '2026-10-15');
  });

  it('cuando no existen cortes registrados usa el día 1 del mes actual hasta hoy', () => {
    const emptyRange = computeNextLiveCutRange([], '2026-10-30');
    assert.equal(emptyRange.startDate, '2026-10-01');
    assert.equal(emptyRange.endDate, '2026-10-30');
    assert.equal(emptyRange.lastCutEndDate, null);
  });

  it('construye la serie inclusiva de fechas sin desfases UTC', () => {
    const list = buildInclusiveDateRange('2026-10-28', '2026-11-01');
    assert.deepEqual(list, [
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01'
    ]);
    assert.equal(normalizeDateOnly('2026-10-28T06:00:00.000Z'), '2026-10-28');
    assert.equal(formatDate('2026-10-28T06:00:00.000Z'), '28/10/2026');
    assert.equal(formatTimestampLocal('2026-10-28'), '28/10/2026');
  });
});
