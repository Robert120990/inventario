import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMovementNoteData,
  buildMovementNoteWordHtml,
  formatMovementPounds,
  formatTimeShort,
  computeDurationLabel,
  findProductForMovementItem
} from '../../src/utils/movementNotePrinter.js';

describe('Movement Detail & Note Printer (Nota de Envío / Nota de Recibido)', () => {
  const sampleProducts = [
    { id: 'prod-1', sku: 'POL-001', description: 'Pechuga de Pollo Congelada', category: 'Congelados' },
    { id: 'prod-2', sku: 'PAT-010', description: 'Patties Empanizados', category: 'Preparados' }
  ];

  const sampleSettings = {
    name: 'Inventario Pro San Martín',
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  };

  const sampleContract = {
    contractorName: 'Inversiones LIL, S.A. de C.V.',
    clientName: 'Avícola Salvadoreña, S.A. de C.V.',
    facility: 'Cuarto Frío San Martín'
  };

  it('generates NOTA DE ENVÍO metadata and dispatch signatures when movement type is out (Salida)', () => {
    const outMovement = {
      id: 'mov-abcd1234-ef56',
      type: 'out',
      refType: 'Nota de Remisión',
      refNumber: 'NR-9081',
      date: '2026-10-30',
      timeStart: '08:15:00',
      timeEnd: '09:45:00',
      carrier: 'Transportes Frío Express',
      equipment: 'C-88412',
      seal: 'M-55210',
      auditUser: 'almacen1',
      items: [
        { productId: 'prod-1', temperature: -18.2, qtyUnits: 40, qtyPounds: 1200.375, qtyBaskets: 0 },
        { productId: 'prod-2', temperature: -16.8, qtyUnits: 15, qtyPounds: 450.5, qtyBaskets: 35 }
      ],
      services: [
        { description: 'Descarga y Carga Camión 8 Ton (Horas hábiles)', quantity: 1, unitPrice: 30, value: 30 }
      ]
    };

    const data = buildMovementNoteData({
      movement: outMovement,
      products: sampleProducts,
      settings: sampleSettings,
      contractRates: sampleContract,
      observations: 'Marchamo colocado en presencia del motorista'
    });

    assert.equal(data.isExit, true);
    assert.equal(data.noteTitle, 'NOTA DE ENVÍO');
    assert.equal(data.noteShortLabel, 'Nota de Envío');
    assert.equal(data.scheduleLabel, 'Horario de Carga');
    assert.equal(data.formattedDate, '30/10/2026');
    assert.equal(data.timeStart, '08:15');
    assert.equal(data.timeEnd, '09:45');
    assert.equal(data.durationLabel, '1h 30m');
    assert.equal(data.internalId, 'MOV-ABCD');
    assert.equal(data.totals.totalItems, 2);
    assert.equal(data.totals.totalUnits, 55);
    assert.equal(data.totals.totalPounds, 1650.875);
    assert.equal(data.totals.totalBaskets, 35);
    assert.equal(data.totals.hasAnyTemp, true);
    assert.equal(data.totals.avgTempFormatted, '-17.5 °C');
    assert.equal(data.totals.isAvgTempOutOfRange, false);
    assert.equal(data.signatures.length, 3);
    assert.match(data.signatures[0].role, /DESPACHADO POR/);
    assert.match(data.signatures[2].role, /RECIBIDO CONFORME/);
    assert.equal(data.includeServices, true);
    assert.equal(data.totalServicesValue, 30);
  });

  it('generates NOTA DE RECIBIDO metadata and reception signatures when movement type is in (Entrada)', () => {
    const inMovement = {
      id: 'mov-11223344',
      type: 'in',
      refType: 'Factura',
      refNumber: 'FAC-4402',
      date: '2026-10-29',
      timeStart: '14:00',
      timeEnd: '14:40',
      carrier: 'Juan Pérez',
      equipment: 'P-11209',
      seal: '',
      auditUser: 'supervisor',
      items: [
        { productId: 'POL-001', temperature: -12.0, qtyUnits: 20, qtyPounds: 800, qtyBaskets: 10 },
        { productId: 'prod-2', temperature: 0, qtyUnits: 5, qtyPounds: 100.25, qtyBaskets: 5 }
      ],
      services: []
    };

    const data = buildMovementNoteData({
      movement: inMovement,
      products: sampleProducts,
      settings: { name: 'Almacén Central', logo: 'javascript:alert(1)' },
      contractRates: {}
    });

    assert.equal(data.isExit, false);
    assert.equal(data.noteTitle, 'NOTA DE RECIBIDO');
    assert.equal(data.noteShortLabel, 'Nota de Recibido');
    assert.equal(data.scheduleLabel, 'Horario de Descarga');
    assert.equal(data.logoSrc, null); // Rejects unsafe logo protocol
    assert.equal(data.durationLabel, '40 min');
    assert.equal(data.items[0].sku, 'POL-001');
    assert.equal(data.items[0].isTempOutOfRange, true);
    assert.equal(data.items[1].hasTemp, true); // 0°C must be treated as valid temperature
    assert.equal(data.items[1].tempFormatted, '0.0 °C');
    assert.equal(data.totals.isAvgTempOutOfRange, true);
    assert.equal(data.signatures.length, 3);
    assert.match(data.signatures[0].role, /ENTREGADO POR/);
    assert.match(data.signatures[1].role, /RECIBIDO POR/);
  });

  it('preserves DECIMAL(15,3) pound precision and computes overnight durations', () => {
    assert.equal(formatMovementPounds(1250.375), '1,250.375');
    assert.equal(formatMovementPounds(1250.5), '1,250.50');
    assert.equal(formatMovementPounds(0), '0.00');
    assert.equal(formatTimeShort('23:45:00'), '23:45');
    assert.equal(computeDurationLabel('23:30:00', '01:15:00'), '1h 45m');
    assert.equal(findProductForMovementItem({ productId: 'PAT-010' }, sampleProducts)?.id, 'prod-2');
  });

  it('builds Microsoft Word (.doc) HTML with MSO namespaces, table layout and XSS escaping', () => {
    const data = buildMovementNoteData({
      movement: {
        id: 'mov-word-99',
        type: 'out',
        refType: 'Remisión',
        refNumber: 'R-100<script>alert(1)</script>',
        date: '2026-10-30',
        timeStart: '07:00',
        timeEnd: '07:45',
        carrier: 'Transporte & Logística',
        equipment: 'C-500',
        seal: 'S-777',
        auditUser: 'admin',
        items: [{ productId: 'prod-1', temperature: -18.0, qtyUnits: 12, qtyPounds: 360.125, qtyBaskets: 4 }],
        services: []
      },
      products: sampleProducts,
      settings: sampleSettings,
      contractRates: sampleContract,
      observations: 'Verificado <OK>'
    });

    const wordHtml = buildMovementNoteWordHtml(data);
    assert.match(wordHtml, /xmlns:w="urn:schemas-microsoft-com:office:word"/);
    assert.match(wordHtml, /NOTA DE ENVÍO/);
    assert.match(wordHtml, /360\.125/);
    assert.match(wordHtml, /Verificado &lt;OK&gt;/);
    assert.doesNotMatch(wordHtml, /<script>alert\(1\)<\/script>/);
  });
});
