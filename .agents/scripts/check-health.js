import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..', '..');

function runHook() {
  const envPath = path.join(appDir, '.env');
  const warnings = [];

  if (!fs.existsSync(envPath)) {
    warnings.push('Aviso: .env no detectado en ' + appDir);
  }

  const message = `[Inventario Pro Context Guardian] 
- Sistema: Gestión de Inventario Multi-Unidad (Unidades, Libras DECIMAL(15,3), Cestas).
- Seguridad: Verificar permisos con canView/canCreate/canEdit/canDelete/canExport y registrar mutaciones en system_logs.
- Backend: Express + MySQL2 pool en api/index.js y db.js.
- Frontend: React 19 + Vite en src/.
${warnings.length > 0 ? warnings.join('\n') : ''}`.trim();

  const response = {
    injectSteps: [
      {
        ephemeralMessage: message
      }
    ]
  };

  process.stdout.write(JSON.stringify(response));
}

runHook();
