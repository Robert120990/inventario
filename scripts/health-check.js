import https from 'https';
import http from 'http';

function checkEndpoint(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({
          url,
          status: res.statusCode,
          latency,
          headers: res.headers,
          data: json || data.slice(0, 100)
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        url,
        status: 'ERROR',
        latency: Date.now() - startTime,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        url,
        status: 'TIMEOUT',
        latency: 8000,
        error: 'Petición agotó el tiempo de espera (8000ms)'
      });
    });
  });
}

async function runHealthCheck() {
  console.log('\n======================================================');
  console.log('🩺 INVENTARIO PRO: Monitoreo de Salud de Servicios Web');
  console.log('======================================================\n');

  const targets = [
    'https://inventario-coldroom.vercel.app/version.json',
    'https://inventario-coldroom.vercel.app/api/health',
    'http://localhost:3000/api/health'
  ];

  for (const url of targets) {
    process.stdout.write(`Consultando ${url}... `);
    const res = await checkEndpoint(url);
    if (res.status === 200) {
      console.log(`✅ OK (${res.latency}ms)`);
      if (res.data?.displayVersion || res.data?.version) {
        console.log(`   Versión: ${res.data.displayVersion || res.data.version} · Commit: #${res.data.commit}`);
      }
      if (res.data?.status || res.data?.db) {
        console.log(`   API Status: ${res.data.status} · DB: ${res.data.db}`);
      }
    } else if (res.status === 'ERROR' && url.includes('localhost')) {
      console.log(`ℹ️ Servidor local no iniciado (normal si no estás en npm run dev)`);
    } else {
      console.log(`⚠️ Status: ${res.status} (${res.latency}ms) - ${res.error || JSON.stringify(res.data)}`);
    }
  }

  console.log('\n======================================================\n');
}

runHealthCheck();
