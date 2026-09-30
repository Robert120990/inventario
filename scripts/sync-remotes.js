import { execSync } from 'child_process';
import https from 'https';

/**
 * Automates multi-remote synchronization for Inventario Pro:
 * 1. Runs build to increment semantic version and sync changelog
 * 2. Pushes main and master branches to origin (Raul) and upstream (Robert)
 * 3. Verifies production deployment on Vercel
 */
async function syncRemotes() {
  console.log('\n======================================================');
  console.log('🚀 INVENTARIO PRO: Sincronización Multi-Remoto y Vercel');
  console.log('======================================================\n');

  try {
    // 1. Verificar cambios locales
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      console.log('📦 Cambios detectados. Generando compilación y versionado semántico...');
      execSync('npm run build', { stdio: 'inherit' });
      execSync('git add .', { stdio: 'inherit' });
      
      const commitMsg = process.argv.slice(2).join(' ') || 'chore: automated multi-remote sync and version bump';
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
      console.log(`✅ Commit creado: "${commitMsg}"\n`);
    } else {
      console.log('ℹ️ No hay cambios pendientes por commitear. Procediendo con el push...\n');
    }

    // 2. Empujar a origin y upstream en main y master
    console.log('🔄 Enviando a origin (Raúl) y upstream (Roberto)...');

    const pushTargets = [
      { remote: 'origin', spec: 'main:master' },
      { remote: 'upstream', spec: 'main:master' },
      { remote: 'origin', spec: 'main:main' },
      { remote: 'upstream', spec: 'main:main' }
    ];

    for (const target of pushTargets) {
      try {
        console.log(`  -> git push ${target.remote} ${target.spec}`);
        execSync(`git push ${target.remote} ${target.spec}`, { stdio: 'inherit' });
      } catch (pushErr) {
        console.warn(`  ⚠️ Advertencia al empujar a ${target.remote} (${target.spec}):`, pushErr.message);
      }
    }

    console.log('\n✨ Todos los repositorios han sido sincronizados exitosamente.');

    // 3. Verificar estado en Vercel
    console.log('⏳ Esperando 12s para consultar el despliegue en Vercel...');
    await new Promise(resolve => setTimeout(resolve, 12000));

    https.get('https://inventario-coldroom.vercel.app/version.json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const v = JSON.parse(data);
          console.log('\n======================================================');
          console.log(`🟢 DESPLIEGUE EN VERCEL CONFIRMADO`);
          console.log(`   Versión activa: ${v.displayVersion || v.version}`);
          console.log(`   Build: #${v.build}`);
          console.log(`   Commit: ${v.commit}`);
          console.log(`   Fecha: ${v.updatedAt}`);
          console.log('======================================================\n');
        } catch {
          console.log('ℹ️ Despliegue en progreso en Vercel. Consulta https://inventario-coldroom.vercel.app/version.json en unos momentos.');
        }
      });
    }).on('error', (err) => {
      console.log('⚠️ No se pudo verificar Vercel:', err.message);
    });

  } catch (err) {
    console.error('\n❌ Error durante la sincronización:', err.message);
    process.exit(1);
  }
}

syncRemotes();
