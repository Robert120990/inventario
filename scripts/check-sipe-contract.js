#!/usr/bin/env node
/**
 * Script CLI de Verificación de Contrato de Integración SIPE y Detección de Schema Drift
 * Uso: node scripts/check-sipe-contract.js
 */

import {
    checkSipeContractStatus,
    buildCutDtePayload,
    validateCutDtePayload
} from '../api/services/sipeBillingService.js';

async function main() {
    console.log('================================================================================');
    console.log('   VERIFICADOR DE CONTRATO DE INTEGRACION SIPE (CUARTO FRIO INVERSIONES LIL)    ');
    console.log('================================================================================\n');

    const status = await checkSipeContractStatus();

    console.log('1. ESTADO GENERAL DEL CONTRATO Y ANTI-DRIFT');
    console.table([
        {
            Propiedad: 'Conectado a SIPE',
            Valor: status.connected ? 'SI' : 'NO'
        },
        {
            Propiedad: 'Modo de Verificación',
            Valor: status.mode
        },
        {
            Propiedad: 'Versión de Contrato API',
            Valor: status.apiVersion
        },
        {
            Propiedad: 'Hash SHA-256 (Vivo)',
            Valor: status.contractHash
        },
        {
            Propiedad: 'Hash SHA-256 (Esperado)',
            Valor: status.expectedContractHash
        },
        {
            Propiedad: 'Código Fuente DTE Local',
            Valor: status.localSourcePresent ? 'Verificado en disco' : 'Usando firma base'
        },
        {
            Propiedad: 'Schema Drift Detectado',
            Valor: status.driftDetected ? 'ALERTA: DRIFT DETECTADO' : 'NO (0 cambios)'
        },
        {
            Propiedad: 'Compatibilidad Total',
            Valor: status.compatible ? 'COMPATIBLE (100%)' : 'INCOMPATIBLE'
        }
    ]);

    console.log('\n2. DATOS DEL EMISOR EN SIPE (COMPANY ID = 1)');
    console.table([
        { Campo: 'ID Empresa', Valor: String(status.issuer?.id ?? 1) },
        { Campo: 'Razón Social', Valor: status.issuer?.razonSocial || '' },
        { Campo: 'Nombre Comercial', Valor: status.issuer?.nombreComercial || '' },
        { Campo: 'NIT', Valor: status.issuer?.nit || '' },
        { Campo: 'NRC', Valor: status.issuer?.nrc || '' },
        { Campo: 'Ambiente MH', Valor: status.issuer?.ambiente || '' },
        { Campo: 'Sucursal Activa', Valor: `${status.issuer?.branchName || ''} [ID: ${status.issuer?.branchId || 1}]` },
        { Campo: 'Código MH Establecimiento', Valor: status.issuer?.codigoMh || 'S001' },
        { Campo: 'Contingencia Abierta', Valor: status.contingencyOpen ? 'SI' : 'NO' },
        { Campo: 'Total DTEs Emitidos', Valor: String(status.issuer?.totalDtesEmitted ?? 0) }
    ]);

    console.log('\n3. DATOS DEL RECEPTOR EN SIPE (CUSTOMER ID = 5038)');
    console.table([
        { Campo: 'ID Cliente', Valor: String(status.receptor?.id ?? 5038) },
        { Campo: 'Razón Social', Valor: status.receptor?.nombre || '' },
        { Campo: 'NIT', Valor: status.receptor?.nit || '' },
        { Campo: 'NRC', Valor: status.receptor?.nrc || '' },
        { Campo: 'Actividad Económica', Valor: status.receptor?.codActividad || '10103' },
        { Campo: 'Correo Electrónico', Valor: status.receptor?.correo || '' },
        { Campo: 'Dirección Registrada', Valor: status.receptor?.direccion || '' },
        { Campo: 'Condición / Plazo Crédito', Valor: `${status.receptor?.condicionFiscal || 'gran contribuyente'} (${status.receptor?.diasCredito || 15} días)` }
    ]);

    if (status.tableChecks && Object.keys(status.tableChecks).length > 0) {
        console.log('\n4. AUDITORIA DE ESQUEMA DE TABLAS EN db_sistema_saas');
        const tableRows = Object.entries(status.tableChecks).map(([table, info]) => ({
            Tabla: `db_sistema_saas.${table}`,
            ColumnasTotales: info.totalColumns,
            ColumnasRequeridas: info.requiredColumnsChecked,
            Faltantes: info.missingColumns.length === 0 ? 'Ninguna' : info.missingColumns.join(', '),
            Estado: info.compatible ? 'OK' : 'DRIFT'
        }));
        console.table(tableRows);
    }

    // 5. Prueba de construcción y validación de payload DTE 03 (Corte Diario y Corte de Seguro)
    console.log('\n5. SIMULACION Y VALIDACION DE PAYLOAD DTE 03 (CREDITO FISCAL)');

    const sampleDailyCut = buildCutDtePayload({
        cutType: 'daily_cut',
        cutData: {
            id: 'sample-daily-cut-001',
            startDate: '2026-09-21',
            endDate: '2026-09-27',
            congeladosData: [
                { fecha: '2026-09-21', stockFinal: 245000, precio: 0.001, totalMonto: 245.00 }
            ],
            preparadosData: [
                { fecha: '2026-09-21', stockFinal: 118175, precio: 0.038, totalMonto: 4490.65 }
            ],
            servicesData: [
                { date: '2026-09-22', description: 'Descarga y Carga Rastra (Horas hábiles)', quantity: 1, unitPrice: 54, value: 54.00, ref: 'Remisión #100-2534' },
                { date: '2026-09-23', description: 'Temperatura Promedio -12.37°C (37,122 lbs)', quantity: 37122, unitPrice: 0.004, value: 148.49, ref: 'Remisión #162923' }
            ],
            totalsData: {
                congeladosMonto: 245.00,
                preparadosMonto: 4490.65,
                serviciosMonto: 202.49,
                subtotal: 4938.14
            }
        },
        options: { detailMode: 'consolidated', servicesMode: 'grouped', condicionOperacion: 2, diasCredito: 15 }
    });

    const sampleInsuranceCut = buildCutDtePayload({
        cutType: 'insurance_cut',
        cutData: {
            id: 'sample-insurance-cut-001',
            startDate: '2026-09-01',
            cutoffDate: '2026-09-27',
            totalsData: {
                totalInsuredValue: 653524.50,
                totalPremium: 653.52
            }
        },
        options: { condicionOperacion: 2, diasCredito: 15 }
    });

    const dailyVal = validateCutDtePayload(sampleDailyCut);
    const insVal = validateCutDtePayload(sampleInsuranceCut);

    console.table([
        {
            TipoCorte: 'Corte Diario (Summary2)',
            TipoDTE: sampleDailyCut.tipoDte,
            Lineas: sampleDailyCut.items.length,
            SubtotalGravado: `$${sampleDailyCut.subtotalGravado.toFixed(2)}`,
            IVA_13: `$${sampleDailyCut.iva13.toFixed(2)}`,
            TotalPagar: `$${sampleDailyCut.totalPagar.toFixed(2)}`,
            ValidacionContrato: dailyVal.valid ? 'VALIDO' : `ERROR (${dailyVal.errors.join(', ')})`
        },
        {
            TipoCorte: 'Corte Póliza Seguro (InsuranceReport)',
            TipoDTE: sampleInsuranceCut.tipoDte,
            Lineas: sampleInsuranceCut.items.length,
            SubtotalGravado: `$${sampleInsuranceCut.subtotalGravado.toFixed(2)}`,
            IVA_13: `$${sampleInsuranceCut.iva13.toFixed(2)}`,
            TotalPagar: `$${sampleInsuranceCut.totalPagar.toFixed(2)}`,
            ValidacionContrato: insVal.valid ? 'VALIDO' : `ERROR (${insVal.errors.join(', ')})`
        }
    ]);

    if (status.driftDetected) {
        console.error('\n[!] DETALLES DE DRIFT DETECTADOS:');
        status.driftDetails.forEach((detail, idx) => {
            console.error(`  ${idx + 1}. ${detail}`);
        });
    }

    const allOk = status.compatible && dailyVal.valid && insVal.valid;
    console.log('\n================================================================================');
    if (allOk) {
        console.log(' RESULTADO: CONTRATO SIPE v2.4.0 VERIFICADO Y 100% COMPATIBLE (SIN DRIFT)');
        console.log('================================================================================\n');
        process.exit(0);
    } else {
        console.error(' RESULTADO: FALLO DE VALIDACION O CAMBIO DE CONTRATO DETECTADO');
        console.log('================================================================================\n');
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Error fatal ejecutando check-sipe-contract:', err);
    process.exit(1);
});
