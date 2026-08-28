import 'dotenv/config';
import mysql from 'mysql2/promise';
import { getTemperatureRate, calculateTemperatureService } from '../src/utils/contractRates.js';

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  });

  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n======================================================`);
  console.log(`Recalculando Servicios de Temperatura Retroactivamente (${isDryRun ? 'DRY RUN - Solo Consulta' : 'APLICANDO CAMBIOS'})`);
  console.log(`======================================================\n`);

  // 1. Obtener todos los servicios existentes
  const [allServices] = await pool.query('SELECT * FROM services');
  const tempServices = allServices.filter(s => s.description.toLowerCase().includes('temp'));
  const movIdsWithTempServices = [...new Set(tempServices.map(s => s.movementId))];

  console.log(`Movimientos con cobros de temperatura existentes: ${movIdsWithTempServices.length}`);

  let updatedCount = 0;

  for (const movId of movIdsWithTempServices) {
    const [items] = await pool.query('SELECT * FROM movement_items WHERE movementId = ?', [movId]);
    const [mov] = await pool.query('SELECT * FROM movements WHERE id = ?', [movId]);
    const movData = mov[0] || {};

    const itemsWithTemp = items.filter(it => it.temperature !== null && it.temperature !== '' && !isNaN(Number(it.temperature)));
    const totalPounds = items.reduce((sum, it) => sum + Number(it.qtyPounds || 0), 0);

    const oldServices = tempServices.filter(s => s.movementId === movId);
    const oldTotalVal = oldServices.reduce((sum, s) => sum + Number(s.value || 0), 0);

    if (itemsWithTemp.length === 0) {
      console.log(`⚠️ Movimiento ${movId} (${movData.refType} #${movData.refNumber}): No tiene temperaturas en items.`);
      continue;
    }

    const totalTemp = itemsWithTemp.reduce((sum, it) => sum + Number(it.temperature), 0);
    const avgTemp = totalTemp / itemsWithTemp.length;
    const roundedAvgTemp = Number(avgTemp.toFixed(1));

    console.log(`\n------------------------------------------------------`);
    console.log(`📦 Movimiento: ${movId} (${movData.refType} #${movData.refNumber} · Fecha: ${movData.date?.toISOString?.().slice(0, 10) || movData.date})`);
    console.log(`   Items: ${items.length} (con temp: ${itemsWithTemp.length}) · Temperaturas: [${itemsWithTemp.map(i => i.temperature).join(', ')}]`);
    console.log(`   Promedio Temperatura: ${roundedAvgTemp}°C · Libras Totales: ${totalPounds.toLocaleString('en-US')} lbs`);
    console.log(`   Cobros anteriores (${oldServices.length}): Total $${oldTotalVal.toFixed(2)}`);
    oldServices.forEach(s => console.log(`     - [ID ${s.id}] ${s.description} -> $${s.value}`));

    if (avgTemp > -14 && totalPounds > 0) {
      const newService = calculateTemperatureService(avgTemp, totalPounds);
      console.log(`   👉 NUEVO COBRO CONSOLIDADO:`);
      console.log(`     + ${newService.description} · Tarifa: $${newService.unitPrice} · Valor: $${newService.value.toFixed(2)}`);

      if (!isDryRun) {
        // Eliminar cobros viejos de temperatura
        await pool.query('DELETE FROM services WHERE movementId = ? AND (description LIKE "%temp%" OR description LIKE "%Temp%")', [movId]);
        // Insertar nuevo cobro consolidado
        await pool.query('INSERT INTO services (movementId, description, value) VALUES (?, ?, ?)', [
          movId,
          newService.description,
          newService.value
        ]);
      }
      updatedCount++;
    } else {
      console.log(`   ❄️ El promedio (${roundedAvgTemp}°C) está dentro de rango (<= -14°C).`);
      if (!isDryRun) {
        await pool.query('DELETE FROM services WHERE movementId = ? AND (description LIKE "%temp%" OR description LIKE "%Temp%")', [movId]);
      }
      updatedCount++;
    }
  }

  console.log(`\n======================================================`);
  console.log(`Proceso completado. ${updatedCount} movimientos actualizados.`);
  console.log(`======================================================\n`);

  process.exit(0);
}

run().catch(err => {
  console.error('Error al ejecutar recálculo:', err);
  process.exit(1);
});
