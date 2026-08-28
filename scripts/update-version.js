import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const versionFilePath = path.join(rootDir, 'src', 'config', 'version.json');
const publicVersionPath = path.join(rootDir, 'public', 'version.json');
const distVersionPath = path.join(rootDir, 'dist', 'version.json');
const changelogJsPath = path.join(rootDir, 'src', 'config', 'changelog.js');
const changelogJsonPath = path.join(rootDir, 'src', 'config', 'changelog.json');
const publicChangelogJsonPath = path.join(rootDir, 'public', 'changelog.json');

// Leer versión previa
let prevData = {
  major: 2,
  minor: 7,
  build: 101,
  commit: 'local',
  version: '2.7.101'
};

if (fs.existsSync(versionFilePath)) {
  try {
    prevData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
  } catch {}
}

let gitCommit = '';
let gitCount = 0;
let gitLogRaw = '';

try {
  gitCommit = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim();
} catch {}

try {
  gitCount = parseInt(execSync('git rev-list --count HEAD', { cwd: rootDir }).toString().trim(), 10);
} catch {}

try {
  gitLogRaw = execSync('git log -n 150 --pretty=format:"%H|||%h|||%an|||%ae|||%aI|||%s|||%b<<<COMMIT_END>>>"', { cwd: rootDir }).toString();
} catch (err) {
  console.warn('Could not read git log:', err.message);
}

const envCommit = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.VITE_APP_VERSION ||
  gitCommit ||
  prevData.commit ||
  'local'
).slice(0, 7);

// Auto-incremento monótono de versión basado en commits
const prevBuild = Number(prevData.build) || 101;
const buildNumber = Math.max(gitCount || 0, prevBuild + 1);

const major = prevData.major || 2;
const minor = prevData.minor || 7;
const version = `${major}.${minor}.${buildNumber}`;
const displayVersion = `v${major}.${minor}.${buildNumber}`;
const shortDisplay = `v${major}.${minor}`;

const versionData = {
  major,
  minor,
  build: buildNumber,
  version,
  displayVersion,
  shortDisplay,
  commit: envCommit,
  timestamp: Date.now(),
  updatedAt: new Date().toISOString()
};

// Escribir version.json
fs.mkdirSync(path.dirname(versionFilePath), { recursive: true });
fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');

fs.mkdirSync(path.dirname(publicVersionPath), { recursive: true });
fs.writeFileSync(publicVersionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');

if (fs.existsSync(path.join(rootDir, 'dist'))) {
  fs.writeFileSync(distVersionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
}

// --------------------------------------------------------------------------
// GENERADOR AUTOMÁTICO DE CHANGELOG DESDE COMMITS DE GIT / GITHUB
// --------------------------------------------------------------------------
const parseCommitType = (text) => {
  const lower = text.toLowerCase();
  if (lower.startsWith('feat') || lower.includes('nueva') || lower.includes('agregar') || lower.includes('implementar')) {
    return 'feature';
  }
  if (lower.startsWith('fix') || lower.includes('corregir') || lower.includes('reparar') || lower.includes('bloquear')) {
    return 'fix';
  }
  if (lower.startsWith('sec') || lower.includes('seguridad') || lower.includes('permiso') || lower.includes('auth')) {
    return 'security';
  }
  if (lower.startsWith('perf') || lower.startsWith('refactor') || lower.startsWith('style') || lower.startsWith('docs') || lower.includes('optimiz')) {
    return 'improvement';
  }
  return 'improvement';
};

const formatCommitTitle = (subject) => {
  if (!subject) return 'Actualización del sistema';
  // Remover prefijos tipo feat(...): o fix:
  let cleaned = subject.replace(/^(feat|fix|perf|refactor|docs|style|security|chore|build|ci)(\([a-zA-Z0-9_-]+\))?:\s*/i, '');
  // Capitalizar primera letra
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned || subject;
};

const generatedChangelog = [];

if (gitLogRaw) {
  const commitBlocks = gitLogRaw.split('<<<COMMIT_END>>>').filter(b => b.trim());
  let currentBuildIndex = buildNumber;

  commitBlocks.forEach((block, idx) => {
    const parts = block.trim().split('|||');
    if (parts.length < 6) return;

    const [fullHash, shortHash, authorName, authorEmail, isoDate, subject, body = ''] = parts;
    if (!subject) return;

    // Extraer fecha y hora
    let dateStr = '';
    let timeStr = '';
    try {
      const d = new Date(isoDate);
      dateStr = d.toISOString().slice(0, 10);
      timeStr = d.toTimeString().slice(0, 5);
    } catch {
      dateStr = new Date().toISOString().slice(0, 10);
      timeStr = '12:00';
    }

    const versionTag = `v${major}.${minor}.${currentBuildIndex - idx}`;
    const authorFormatted = authorEmail?.toLowerCase()?.includes('raul') ? 'Ing. Raúl Sosa' : (authorName || 'Desarrollador');

    // Desglosar sub-cambios si el commit tiene múltiples declaraciones
    const changes = [];
    const rawSegments = subject.split(/,\s*(?=(?:feat|fix|perf|security|refactor|chore)(?:\([a-z0-9_-]+\))?:)/i);

    if (rawSegments.length > 1) {
      rawSegments.forEach(seg => {
        const type = parseCommitType(seg);
        changes.push({
          type,
          text: formatCommitTitle(seg)
        });
      });
    } else {
      const type = parseCommitType(subject);
      changes.push({
        type,
        text: formatCommitTitle(subject)
      });
    }

    // Agregar líneas descriptivas del body si existen
    if (body && body.trim()) {
      const bodyLines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('Co-authored-by') && !l.startsWith('Signed-off-by'));
      bodyLines.forEach(line => {
        if (line.startsWith('-') || line.startsWith('*')) {
          const cleanedLine = line.replace(/^[-*]\s*/, '');
          changes.push({
            type: parseCommitType(cleanedLine),
            text: cleanedLine
          });
        }
      });
    }

    generatedChangelog.push({
      id: shortHash || versionTag,
      version: versionTag,
      commit: shortHash,
      fullCommit: fullHash,
      description: formatCommitTitle(subject),
      author: authorFormatted,
      date: dateStr,
      time: timeStr,
      isOfficial: idx < 10,
      isGitCommit: true,
      changes: changes
    });
  });
}

// Si por alguna razón git log está vacío, tener un fallback seguro
if (generatedChangelog.length === 0) {
  generatedChangelog.push({
    id: displayVersion,
    version: displayVersion,
    commit: envCommit,
    description: 'Actualización y estabilidad del sistema',
    author: 'Ing. Raúl Sosa',
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    isOfficial: true,
    changes: [
      { type: 'feature', text: 'Auto-sincronizador de versiones y commits en tiempo real' }
    ]
  });
}

// Escribir changelog.json y changelog.js
const changelogJsContent = `// Registro cronológico maestro y automático de versiones del sistema generado desde Git\n` +
  `export const SYSTEM_CHANGELOG = ${JSON.stringify(generatedChangelog, null, 2)};\n\n` +
  `export default SYSTEM_CHANGELOG;\n`;

fs.writeFileSync(changelogJsPath, changelogJsContent, 'utf8');
fs.writeFileSync(changelogJsonPath, JSON.stringify(generatedChangelog, null, 2) + '\n', 'utf8');
fs.writeFileSync(publicChangelogJsonPath, JSON.stringify(generatedChangelog, null, 2) + '\n', 'utf8');

console.log(`[Version Auto-Increment] Updated version to ${displayVersion} (commit #${envCommit}, build #${buildNumber})`);
console.log(`[Changelog Auto-Sync] Generated ${generatedChangelog.length} commits in SYSTEM_CHANGELOG from Git repository.`);
