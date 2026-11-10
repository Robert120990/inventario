import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const readProjectFile = (relPath) =>
  fs.readFileSync(path.join(projectRoot, relPath), 'utf8');

describe('Estabilidad de Historial de Cortes y Scroll Horizontal Móvil', () => {
  it('memoiza fetchDailyCuts y fetchInsuranceCuts con useCallback para evitar bucles infinitos', () => {
    const ctxSource = readProjectFile('src/context/InventoryContext.jsx');

    assert.match(
      ctxSource,
      /const\s+fetchDailyCuts\s*=\s*useCallback\(\s*async/,
      'fetchDailyCuts debe estar envuelto en useCallback'
    );
    assert.match(
      ctxSource,
      /const\s+fetchDailyCutById\s*=\s*useCallback\(\s*async/,
      'fetchDailyCutById debe estar envuelto en useCallback'
    );
    assert.match(
      ctxSource,
      /const\s+fetchInsuranceCuts\s*=\s*useCallback\(\s*async/,
      'fetchInsuranceCuts debe estar envuelto en useCallback'
    );
    assert.match(
      ctxSource,
      /const\s+fetchInsuranceCutById\s*=\s*useCallback\(\s*async/,
      'fetchInsuranceCutById debe estar envuelto en useCallback'
    );
    assert.match(
      ctxSource,
      /const\s+openCutHistoryModal\s*=\s*useCallback\(/,
      'openCutHistoryModal debe tener referencia estable'
    );
    assert.match(
      ctxSource,
      /const\s+closeCutHistoryModal\s*=\s*useCallback\(/,
      'closeCutHistoryModal debe tener referencia estable'
    );
  });

  it('DailyCutsHistoryModal hidrata inmediatamente desde dailyCuts y no oculta cortes cargados durante refresco', () => {
    const modalSource = readProjectFile('src/components/Summary/DailyCutsHistoryModal.jsx');

    assert.match(
      modalSource,
      /normalizeDailyCutsList\(dailyCuts\)/,
      'Debe hidratar cutsList de inmediato desde dailyCuts del contexto'
    );
    assert.match(
      modalSource,
      /loadingHistory\s*&&\s*cutsList\.length\s*===\s*0\s*\?/,
      'Solo debe mostrar el spinner bloqueante cuando aún no existen cortes en memoria'
    );
    assert.match(
      modalSource,
      /fetchDailyCuts\(\{\s*summary:\s*true\s*\}\)/,
      'Debe consultar el endpoint liviano summary=1 para carga móvil instantánea'
    );
    assert.match(
      modalSource,
      /className="table-container table-scroll-both"/,
      'La tabla del historial debe usar table-container table-scroll-both'
    );
  });

  it('restringe el ancho de hijos flex en .main-content y habilita scroll horizontal táctil en Dashboard y modales', () => {
    const cssSource = readProjectFile('src/index.css');
    const dashboardSource = readProjectFile('src/components/Dashboard.jsx');

    assert.match(
      cssSource,
      /\.main-content\s*>\s*\*:not\(\.mobile-header\)\s*\{[\s\S]*?width:\s*100%/,
      '.main-content > *:not(.mobile-header) debe fijar width: 100% y min-width: 0'
    );
    assert.match(
      cssSource,
      /\.table-container[\s\S]*?touch-action:\s*pan-x\s+pan-y\s*!important/,
      '.table-container debe permitir desplazamiento táctil horizontal y vertical (pan-x pan-y)'
    );

    // Asegurar que .modal-scroll-body no bloquee pan-x en tablas descendientes
    const modalScrollMatch = cssSource.match(/\.modal-scroll-body\s*\{([^}]*)\}/);
    assert.ok(modalScrollMatch, 'Debe existir la regla .modal-scroll-body');
    assert.doesNotMatch(
      modalScrollMatch[1],
      /touch-action:\s*pan-y\b/,
      '.modal-scroll-body no debe restringir touch-action únicamente a pan-y'
    );

    assert.match(
      dashboardSource,
      /width:\s*'100%',\s*minWidth:\s*0,\s*maxWidth:\s*'1400px'/,
      'El contenedor raíz de Dashboard debe definir width: 100% y minWidth: 0'
    );
    assert.match(
      dashboardSource,
      /className="card card-flush"/,
      'La tarjeta Actividad de Hoy debe usar card-flush para no recortar la tabla en móvil'
    );
    assert.match(
      dashboardSource,
      /className="table-container table-scroll-both"/,
      'La tabla Actividad de Hoy debe usar table-container table-scroll-both'
    );
  });
});
