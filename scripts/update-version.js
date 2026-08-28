import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const versionFilePath = path.join(rootDir, 'src', 'config', 'version.json');
const publicVersionPath = path.join(rootDir, 'public', 'version.json');
const distVersionPath = path.join(rootDir, 'dist', 'version.json');

// Read existing version data if present
let prevData = {
  major: 1,
  minor: 3,
  build: 86,
  commit: 'local',
  version: '1.3.86'
};

if (fs.existsSync(versionFilePath)) {
  try {
    prevData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
  } catch {}
}

let gitCommit = '';
let gitCount = 0;

try {
  gitCommit = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim();
} catch {}

try {
  gitCount = parseInt(execSync('git rev-list --count HEAD', { cwd: rootDir }).toString().trim(), 10);
} catch {}

const envCommit = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.VITE_APP_VERSION ||
  gitCommit ||
  prevData.commit ||
  'local'
).slice(0, 7);

// Auto-increment build counter monotonically
const prevBuild = Number(prevData.build) || 97;
const buildNumber = prevBuild + 1;

const major = prevData.major || 1;
const minor = prevData.minor || 3;
const version = `${major}.${minor}.${buildNumber}`;
const displayVersion = `v${major}.${minor}.${buildNumber}`;
const shortDisplay = `v${major}.${minor}`;


const versionData = {
  major,
  minor,
  build: buildNumber,
  version: version,
  displayVersion: displayVersion,
  shortDisplay: shortDisplay,
  commit: envCommit,
  timestamp: Date.now(),
  updatedAt: new Date().toISOString()
};

// Write version.json files
fs.mkdirSync(path.dirname(versionFilePath), { recursive: true });
fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');

fs.mkdirSync(path.dirname(publicVersionPath), { recursive: true });
fs.writeFileSync(publicVersionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');

if (fs.existsSync(path.join(rootDir, 'dist'))) {
  fs.writeFileSync(distVersionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
}

console.log(`[Version Auto-Increment] Updated version to ${displayVersion} (commit #${envCommit}, build #${buildNumber})`);
