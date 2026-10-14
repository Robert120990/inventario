import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import inventoryPool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env from inventario root is loaded when imported from CLI scripts
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const round2 = (num) => {
    if (num === null || num === undefined || Number.isNaN(Number(num))) return 0;
    return Number(Math.round(Number(num) + 'e+2') + 'e-2');
};

const round4 = (num) => {
    if (num === null || num === undefined || Number.isNaN(Number(num))) return 0;
    return Number(Math.round(Number(num) + 'e+4') + 'e-4');
};

const round6 = (num) => {
    if (num === null || num === undefined || Number.isNaN(Number(num))) return 0;
    return Number(Math.round(Number(num) + 'e+6') + 'e-6');
};

/**
 * Convierte un monto numérico a letras según formato oficial DTE El Salvador.
 */
export function getAmountInWords(amount) {
    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
        return 'CERO 00/100 DOLARES';
    }

    const parts = Number(amount).toFixed(2).split('.');
    const integerPart = parseInt(parts[0], 10);
    const decimalPart = parts[1];

    if (integerPart === 0) return `CERO ${decimalPart}/100 DOLARES`;

    const unidad = (n) => ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'][n];
    const decena = (n) => ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'][n];
    const especial = (n) => ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'][n - 10];
    const centena = (n) => ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'][n];

    const convertThreeDigits = (n) => {
        let output = '';
        const c = Math.floor(n / 100);
        const d = Math.floor((n % 100) / 10);
        const u = n % 10;

        if (c > 0) {
            if (c === 1 && d === 0 && u === 0) output += 'CIEN';
            else output += centena(c);
        }

        if (d > 0) {
            if (output !== '') output += ' ';
            if (d === 1 && u >= 0) {
                output += especial(d * 10 + u);
                return output;
            } else if (d === 2 && u === 0) {
                output += 'VEINTE';
            } else if (d === 2 && u > 0) {
                output += 'VEINTI' + unidad(u);
            } else {
                output += decena(d);
                if (u > 0) output += ' Y ' + unidad(u);
            }
        } else if (u > 0) {
            if (output !== '') output += ' ';
            output += unidad(u);
        }
        return output;
    };

    let result = '';
    const millions = Math.floor(integerPart / 1000000);
    const thousands = Math.floor((integerPart % 1000000) / 1000);
    const hundreds = integerPart % 1000;

    if (millions > 0) {
        if (millions === 1) result += 'UN MILLON';
        else result += convertThreeDigits(millions) + ' MILLONES';
    }

    if (thousands > 0) {
        if (result !== '') result += ' ';
        if (thousands === 1) result += 'MIL';
        else result += convertThreeDigits(thousands) + ' MIL';
    }

    if (hundreds > 0) {
        if (result !== '') result += ' ';
        result += convertThreeDigits(hundreds);
    }

    return `${result.trim()} ${decimalPart}/100 DOLARES`;
}

/**
 * Definición Base del Contrato de Integración SIPE (Inversiones LIL -> Avícola Salvadoreña)
 */
export const EXPECTED_SIPE_CONTRACT = {
    apiVersion: '2.4.0',
    contractHash: '25e786eaab209dd966a6d3ce2bda2c95c298a92a106556bf1b89bf02b93d4e3a',
    sourceDigests: {
        dteGenerator: 'df7d8fde200d2586f2c1077ad0654bfcfe0221b6c6027b2f7525ce8aa481ac7e',
        dteController: 'c49ddbd4fae91d44964352187cd0e03d3b3e4064d9e09705047adb4dafee6e69'
    },
    mhSchemaVersions: {
        '01': 1,
        '03': 3,
        '05': 3,
        '06': 3,
        '07': 1,
        '11': 1,
        '14': 1
    },
    schema: {
        endpoint: '/api/dte/emit',
        salesEndpoint: '/api/sales',
        coldroomBillingEndpoint: '/api/integration/coldroom-billing',
        requiredHeaders: ['Authorization', 'x-company-id', 'x-branch-id'],
        requiredPayloadFields: ['tipoDte', 'condicionOperacion', 'customer', 'items'],
        requiredItemFields: ['tipoItem', 'cantidad', 'uniMedida', 'descripcion', 'precioUnitario', 'tributos'],
        supportedDteTypes: ['01', '03', '05', '06'],
        serviceDefaults: {
            tipoItem: 2,
            uniMedida: 99,
            tributos: ['20'],
            ivaRate: 0.13
        }
    },
    expectedDatabaseSchema: {
        sales_headers: [
            'id', 'company_id', 'branch_id', 'customer_id', 'dte_type', 'tipo_documento',
            'condicion_operacion', 'fecha_emision', 'hora_emision', 'estado',
            'total_gravado', 'total_iva', 'total_pagar', 'codigo_generacion',
            'numero_control', 'sello_recepcion'
        ],
        sales_items: [
            'id', 'sale_id', 'codigo', 'descripcion', 'cantidad',
            'precio_unitario', 'venta_gravada', 'tributos'
        ],
        dtes: [
            'id', 'venta_id', 'codigo_generacion', 'numero_control', 'tipo_dte',
            'company_id', 'branch_id', 'status', 'ambiente', 'json_original',
            'json_firmado', 'sello_recepcion', 'fh_procesamiento', 'respuesta_hacienda'
        ]
    },
    expectedIssuer: {
        id: 1,
        razonSocial: 'Inversiones Lil, S.A. de C.V.',
        nit: '0614-270114-103-3',
        nrc: '230360-6',
        ambiente: 'Producción (01)',
        branchId: 1,
        branchName: 'Puma San Martin II (Km 19 San Martín)',
        codigoMh: 'S001'
    },
    expectedReceptor: {
        id: 5038,
        nombre: 'AVICOLA SALVADOREÑA, S.A DE C.V',
        nit: '0614-130571-001-2',
        nrc: '233-0',
        correo: 'FRANCISCO.PORTILLO@SOMOSCMI.COM',
        direccion: 'CANTON EL ROSARIO, GRANJA OMOA'
    },
    changelog: [
        {
            version: '2.4.0',
            date: '2026-10-13',
            summary: 'Contrato de integración facturación Cuarto Frío Inversiones LIL (DTE 03)'
        }
    ]
};

// Pool dedicado para consultar db_sistema_saas en el mismo servidor MySQL (5.252.55.29)
let sipeDbPool = null;

function getSipeDbPool() {
    if (!sipeDbPool) {
        const sslConfig = process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
            : undefined;

        sipeDbPool = mysql.createPool({
            host: process.env.SIPE_DB_HOST || process.env.DB_HOST || '5.252.55.29',
            user: process.env.SIPE_DB_USER || process.env.DB_USER || 'sysadmin',
            password: process.env.SIPE_DB_PASS || process.env.DB_PASS || process.env.DB_PASSWORD || 'QwErTy?123',
            database: process.env.SIPE_DB_NAME || 'db_sistema_saas',
            port: Number(process.env.SIPE_DB_PORT || process.env.DB_PORT || 3306),
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            connectTimeout: 6000,
            decimalNumbers: true,
            ssl: sslConfig
        });
    }
    return sipeDbPool;
}

function hashNormalizedFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
            return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
        }
    } catch (_) {
        // Ignore read error
    }
    return null;
}

/**
 * Calcula el hash SHA-256 determinístico del contrato SIPE y archivos fuente locales (si existen).
 */
export function computeSipeContractHash(overrides = {}) {
    const sipeRoot = process.env.SIPE_LOCAL_PATH || path.resolve(__dirname, '../../../../SIPEWEBgas');
    const dteGenPath = path.join(sipeRoot, 'dte-api/src/services/dteGenerator.js');
    const dteCtrlPath = path.join(sipeRoot, 'dte-api/src/controllers/dteController.js');

    const localDteGenDigest = hashNormalizedFile(dteGenPath);
    const localDteCtrlDigest = hashNormalizedFile(dteCtrlPath);

    const dteGeneratorDigest = overrides.dteGeneratorDigest
        ?? localDteGenDigest
        ?? EXPECTED_SIPE_CONTRACT.sourceDigests.dteGenerator;
    const dteControllerDigest = overrides.dteControllerDigest
        ?? localDteCtrlDigest
        ?? EXPECTED_SIPE_CONTRACT.sourceDigests.dteController;

    const schemaObj = overrides.schema || EXPECTED_SIPE_CONTRACT.schema;
    const hashInput = {
        apiVersion: overrides.apiVersion || EXPECTED_SIPE_CONTRACT.apiVersion,
        mhSchemaVersions: overrides.mhSchemaVersions || EXPECTED_SIPE_CONTRACT.mhSchemaVersions,
        schema: {
            endpoint: schemaObj.endpoint,
            salesEndpoint: schemaObj.salesEndpoint,
            requiredHeaders: schemaObj.requiredHeaders,
            requiredPayloadFields: schemaObj.requiredPayloadFields,
            requiredItemFields: schemaObj.requiredItemFields,
            supportedDteTypes: schemaObj.supportedDteTypes,
            serviceDefaults: schemaObj.serviceDefaults
        },
        sourceDigests: {
            dteGenerator: dteGeneratorDigest,
            dteController: dteControllerDigest
        }
    };

    const contractHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(hashInput), 'utf8')
        .digest('hex');

    return {
        contractHash,
        localSourcePresent: Boolean(localDteGenDigest && localDteCtrlDigest),
        sourceDigests: {
            dteGenerator: dteGeneratorDigest,
            dteController: dteControllerDigest
        }
    };
}

function formatAmbienteLabel(rawAmbiente) {
    const str = String(rawAmbiente || '').trim().toLowerCase();
    if (str === '2' || str === '01' || str === 'prod' || str === 'production' || str === 'produccion') {
        return 'Producción (01)';
    }
    return 'Pruebas (00)';
}

let billingColumnsEnsured = false;

/**
 * Garantiza de forma idempotente que las tablas daily_cuts e insurance_cuts en db_web_inventory
 * tengan las columnas de trazabilidad DTE / SIPE.
 */
export async function ensureCutBillingColumns() {
    if (billingColumnsEnsured) return true;

    const columnsToEnsure = [
        { name: 'sipe_sale_id', def: 'sipe_sale_id INT NULL' },
        { name: 'dte_codigo_generacion', def: 'dte_codigo_generacion VARCHAR(60) NULL' },
        { name: 'dte_numero_control', def: 'dte_numero_control VARCHAR(60) NULL' },
        { name: 'dte_sello_recepcion', def: 'dte_sello_recepcion VARCHAR(100) NULL' },
        { name: 'dte_status', def: 'dte_status VARCHAR(40) DEFAULT NULL' },
        { name: 'dte_emitted_at', def: 'dte_emitted_at TIMESTAMP NULL DEFAULT NULL' },
        { name: 'dte_payload', def: 'dte_payload LONGTEXT NULL' }
    ];

    const tables = ['daily_cuts', 'insurance_cuts'];
    for (const table of tables) {
        try {
            const [existingCols] = await inventoryPool.query(`SHOW COLUMNS FROM ${table}`);
            const existingSet = new Set(existingCols.map(c => c.Field));
            for (const col of columnsToEnsure) {
                if (!existingSet.has(col.name)) {
                    try {
                        await inventoryPool.query(`ALTER TABLE ${table} ADD COLUMN ${col.def}`);
                    } catch (_) {
                        // Ignore duplicate column race condition
                    }
                }
            }
        } catch (err) {
            console.warn(`[SipeBillingService] No se pudo verificar columnas DTE en ${table}:`, err.message);
        }
    }

    billingColumnsEnsured = true;
    return true;
}

/**
 * Verifica el estado del contrato de integración SIPE (HTTP + MySQL db_sistema_saas + código fuente DTE)
 * y detecta cualquier deriva de esquema (Schema Drift).
 */
export async function checkSipeContractStatus(options = {}) {
    const driftDetails = [];
    let httpContract = null;
    let httpConnected = false;
    let dbConnected = false;

    const candidateUrls = [
        options.sipeApiUrl,
        process.env.SIPE_API_URL,
        'http://127.0.0.1:4000'
    ].filter(Boolean);

    // 1. Intentar consultar endpoint HTTP /api/integration/contract
    for (const baseUrl of candidateUrls) {
        const cleanBase = String(baseUrl).replace(/\/+$/, '').replace(/\/api$/, '');
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2200);
            const res = await fetch(`${cleanBase}/api/integration/contract`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timer);

            if (res.ok) {
                const data = await res.json();
                if (data && data.contractHash) {
                    httpContract = data;
                    httpConnected = true;
                    break;
                }
            }
        } catch (_) {
            // Continuar con inspección directa de BD compartida
        }
    }

    // 2. Inspeccionar BD compartida db_sistema_saas y archivos locales DTE
    let issuerData = { ...EXPECTED_SIPE_CONTRACT.expectedIssuer, totalDtesEmitted: 0 };
    let receptorData = { ...EXPECTED_SIPE_CONTRACT.expectedReceptor, diasCredito: 15 };
    let contingencyOpen = false;
    let openContingencies = [];
    const tableChecks = {};

    try {
        const sipePool = getSipeDbPool();

        const [companies] = await sipePool.query(
            'SELECT id, razon_social, nombre_comercial, nit, nrc, codigo_actividad, ambiente, dte_active FROM companies WHERE id = 1 LIMIT 1'
        );
        const [branches] = await sipePool.query(
            'SELECT id, company_id, nombre, codigo, codigo_mh, tipo_establecimiento, departamento, municipio, distrito, direccion, telefono, correo, ambiente FROM branches WHERE company_id = 1 ORDER BY id ASC'
        );
        const [customers] = await sipePool.query(
            'SELECT id, nombre, nombre_comercial, nit, nrc, codigo_actividad, direccion, departamento, municipio, distrito, telefono, correo, condicion_fiscal, es_credito, dias_credito FROM customers WHERE id = 5038 LIMIT 1'
        );
        const [contingencies] = await sipePool.query(
            'SELECT id, branch_id, fecha_inicio, motivo, tipo_contingencia, estado FROM dte_contingencies WHERE company_id = 1 AND estado = ? ORDER BY id DESC',
            ['OPEN']
        );
        const [dteCountRows] = await sipePool.query(
            'SELECT COUNT(*) AS total FROM dtes WHERE company_id = 1'
        );

        dbConnected = true;

        if (companies.length === 0) {
            driftDetails.push('La empresa emisora id=1 (Inversiones LIL) no existe en db_sistema_saas.companies.');
        } else {
            const comp = companies[0];
            const branch1 = branches.find(b => Number(b.id) === 1) || branches[0] || {};
            issuerData = {
                id: comp.id,
                razonSocial: 'Inversiones Lil, S.A. de C.V.',
                rawRazonSocial: comp.razon_social,
                nombreComercial: comp.nombre_comercial || 'INV LIL',
                nit: comp.nit,
                nrc: comp.nrc,
                codActividad: comp.codigo_actividad || '47300',
                ambiente: formatAmbienteLabel(branch1.ambiente || comp.ambiente),
                dteActive: Boolean(comp.dte_active),
                branchId: branch1.id || 1,
                branchName: branch1.id === 1
                    ? 'Puma San Martin II (Km 19 San Martín)'
                    : (branch1.nombre || 'Puma San Martin II'),
                codigoMh: branch1.codigo_mh || 'S001',
                direccion: branch1.direccion || 'CARR. PANAMERICANA CA01 KM 19',
                departamento: branch1.departamento || '06',
                municipio: branch1.municipio || '22',
                distrito: branch1.distrito || '13',
                telefono: branch1.telefono || '2222-2222',
                correo: branch1.correo || 'pumasanmartin@sipesv.com',
                totalDtesEmitted: Number(dteCountRows[0]?.total || 0),
                branches: branches.map(b => ({
                    id: b.id,
                    nombre: b.nombre,
                    codigo: b.codigo,
                    codigoMh: b.codigo_mh,
                    ambiente: formatAmbienteLabel(b.ambiente || comp.ambiente)
                }))
            };

            if (comp.nit !== EXPECTED_SIPE_CONTRACT.expectedIssuer.nit) {
                driftDetails.push(`NIT de emisor cambió: esperado "${EXPECTED_SIPE_CONTRACT.expectedIssuer.nit}", actual "${comp.nit}".`);
            }
            if (comp.nrc !== EXPECTED_SIPE_CONTRACT.expectedIssuer.nrc) {
                driftDetails.push(`NRC de emisor cambió: esperado "${EXPECTED_SIPE_CONTRACT.expectedIssuer.nrc}", actual "${comp.nrc}".`);
            }
        }

        if (customers.length === 0) {
            driftDetails.push('El cliente receptor id=5038 (AVICOLA SALVADOREÑA) no existe en db_sistema_saas.customers.');
        } else {
            const cust = customers[0];
            receptorData = {
                id: cust.id,
                nombre: cust.nombre,
                nombreComercial: cust.nombre_comercial || 'AVICOLA SALVADOREÑA',
                nit: cust.nit,
                nrc: cust.nrc,
                codActividad: cust.codigo_actividad || '10103',
                correo: cust.correo || 'FRANCISCO.PORTILLO@SOMOSCMI.COM',
                telefono: cust.telefono || '6988-3158',
                direccion: cust.direccion || 'CANTON EL ROSARIO, GRANJA OMOA',
                departamento: cust.departamento || '06',
                municipio: cust.municipio || '23',
                distrito: cust.distrito || '14',
                condicionFiscal: cust.condicion_fiscal || 'gran contribuyente',
                esCredito: Boolean(cust.es_credito ?? 1),
                diasCredito: Number(cust.dias_credito || 15)
            };

            if (cust.nit !== EXPECTED_SIPE_CONTRACT.expectedReceptor.nit) {
                driftDetails.push(`NIT de cliente 5038 cambió: esperado "${EXPECTED_SIPE_CONTRACT.expectedReceptor.nit}", actual "${cust.nit}".`);
            }
            if (cust.nrc !== EXPECTED_SIPE_CONTRACT.expectedReceptor.nrc) {
                driftDetails.push(`NRC de cliente 5038 cambió: esperado "${EXPECTED_SIPE_CONTRACT.expectedReceptor.nrc}", actual "${cust.nrc}".`);
            }
        }

        contingencyOpen = contingencies.length > 0;
        openContingencies = contingencies;

        // 3. Verificar columnas requeridas en tablas de facturación SIPE (sales_headers, sales_items, dtes)
        for (const [tableName, expectedCols] of Object.entries(EXPECTED_SIPE_CONTRACT.expectedDatabaseSchema)) {
            const [cols] = await sipePool.query(`SHOW COLUMNS FROM ${tableName}`);
            const liveColNames = cols.map(c => c.Field);
            const missingCols = expectedCols.filter(reqCol => !liveColNames.includes(reqCol));

            tableChecks[tableName] = {
                totalColumns: liveColNames.length,
                requiredColumnsChecked: expectedCols.length,
                missingColumns: missingCols,
                compatible: missingCols.length === 0
            };

            if (missingCols.length > 0) {
                driftDetails.push(
                    `Tabla db_sistema_saas.${tableName} no contiene las columnas requeridas: ${missingCols.join(', ')}`
                );
            }
        }
    } catch (dbErr) {
        if (!httpConnected) {
            driftDetails.push(`No fue posible conectar con db_sistema_saas: ${dbErr.message}`);
        }
    }

    // 4. Calcular y verificar hash del contrato y archivos fuente DTE
    const computed = computeSipeContractHash(
        httpContract
            ? {
                apiVersion: httpContract.apiVersion,
                mhSchemaVersions: httpContract.mhSchemaVersions,
                schema: httpContract.schema,
                dteGeneratorDigest: httpContract.sourceDigests?.dteGenerator,
                dteControllerDigest: httpContract.sourceDigests?.dteController
            }
            : {}
    );

    const liveContractHash = httpContract?.contractHash || computed.contractHash;
    const liveApiVersion = httpContract?.apiVersion || EXPECTED_SIPE_CONTRACT.apiVersion;

    if (liveApiVersion !== EXPECTED_SIPE_CONTRACT.apiVersion) {
        driftDetails.push(
            `Versión de API SIPE cambió: esperada "${EXPECTED_SIPE_CONTRACT.apiVersion}", detectada "${liveApiVersion}".`
        );
    }

    if (computed.sourceDigests.dteGenerator !== EXPECTED_SIPE_CONTRACT.sourceDigests.dteGenerator) {
        driftDetails.push(
            'El archivo dteGenerator.js en SIPEWEBgas fue modificado respecto a la firma base del contrato.'
        );
    }

    if (computed.sourceDigests.dteController !== EXPECTED_SIPE_CONTRACT.sourceDigests.dteController) {
        driftDetails.push(
            'El archivo dteController.js en SIPEWEBgas fue modificado respecto a la firma base del contrato.'
        );
    }

    if (liveContractHash !== EXPECTED_SIPE_CONTRACT.contractHash) {
        driftDetails.push(
            `Hash SHA-256 del contrato difiere: esperado ${EXPECTED_SIPE_CONTRACT.contractHash.slice(0, 12)}..., actual ${liveContractHash.slice(0, 12)}...`
        );
    }

    // Si el contrato vino por HTTP, comparar también requiredPayloadFields y requiredItemFields
    if (httpContract?.schema) {
        const livePayloadFields = httpContract.schema.requiredPayloadFields || [];
        const liveItemFields = httpContract.schema.requiredItemFields || [];

        const addedPayloadFields = livePayloadFields.filter(
            f => !EXPECTED_SIPE_CONTRACT.schema.requiredPayloadFields.includes(f)
        );
        const addedItemFields = liveItemFields.filter(
            f => !EXPECTED_SIPE_CONTRACT.schema.requiredItemFields.includes(f)
        );

        if (addedPayloadFields.length > 0) {
            driftDetails.push(`SIPE exige nuevos campos de cabecera no contemplados: ${addedPayloadFields.join(', ')}`);
        }
        if (addedItemFields.length > 0) {
            driftDetails.push(`SIPE exige nuevos campos de ítem no contemplados: ${addedItemFields.join(', ')}`);
        }
    }

    const connected = httpConnected || dbConnected;
    const mode = httpConnected && dbConnected
        ? 'http+db'
        : (dbConnected ? 'shared_db' : (httpConnected ? 'http' : 'offline'));
    const driftDetected = driftDetails.length > 0;
    const compatible = connected && !driftDetected;

    return {
        connected,
        mode,
        apiVersion: liveApiVersion,
        contractHash: liveContractHash,
        expectedContractHash: EXPECTED_SIPE_CONTRACT.contractHash,
        sourceDigests: computed.sourceDigests,
        localSourcePresent: computed.localSourcePresent,
        driftDetected,
        driftDetails,
        compatible,
        checkedAt: new Date().toISOString(),
        mhSchemaVersions: httpContract?.mhSchemaVersions || EXPECTED_SIPE_CONTRACT.mhSchemaVersions,
        issuer: httpContract?.issuer || issuerData,
        receptor: httpContract?.defaultCustomer || receptorData,
        contingencyOpen: httpContract?.issuer?.contingencyOpen ?? contingencyOpen,
        openContingencies,
        tableChecks,
        schema: httpContract?.schema || EXPECTED_SIPE_CONTRACT.schema,
        changelog: httpContract?.changelog || EXPECTED_SIPE_CONTRACT.changelog
    };
}

function toDateStr(val) {
    if (!val) return new Date().toISOString().split('T')[0];
    if (val instanceof Date) {
        return val.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (str.includes('T')) return str.split('T')[0];
    return str.substring(0, 10);
}

function safeJsonParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

/**
 * Valida un payload DTE 03 construido contra las reglas del contrato SIPE.
 */
export function validateCutDtePayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
        return { valid: false, errors: ['El payload DTE está vacío o no es un objeto válido.'] };
    }

    for (const reqField of EXPECTED_SIPE_CONTRACT.schema.requiredPayloadFields) {
        if (payload[reqField] === undefined || payload[reqField] === null) {
            errors.push(`Campo obligatorio de cabecera faltante: "${reqField}"`);
        }
    }

    if (!EXPECTED_SIPE_CONTRACT.schema.supportedDteTypes.includes(String(payload.tipoDte))) {
        errors.push(`Tipo de DTE no soportado por el contrato: "${payload.tipoDte}"`);
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
        errors.push('El documento DTE debe incluir al menos un ítem en "items".');
    } else {
        payload.items.forEach((item, idx) => {
            for (const reqItemField of EXPECTED_SIPE_CONTRACT.schema.requiredItemFields) {
                if (item[reqItemField] === undefined || item[reqItemField] === null) {
                    errors.push(`Ítem #${idx + 1}: falta el campo requerido "${reqItemField}".`);
                }
            }
            if (Number(item.cantidad) <= 0) {
                errors.push(`Ítem #${idx + 1}: la cantidad debe ser mayor a 0.`);
            }
            if (Number(item.precioUnitario) <= 0) {
                errors.push(`Ítem #${idx + 1}: el precioUnitario debe ser mayor a 0.`);
            }
            const calcLine = round2(Number(item.cantidad) * Number(item.precioUnitario));
            const declaredLine = round2(item.ventaGravada ?? calcLine);
            if (Math.abs(calcLine - declaredLine) > 0.01) {
                errors.push(
                    `Ítem #${idx + 1}: descuadre entre cantidad * precioUnitario ($${calcLine}) y ventaGravada ($${declaredLine}).`
                );
            }
        });
    }

    if (!payload.customer?.nit || !payload.customer?.nrc) {
        errors.push('El receptor de un Crédito Fiscal (DTE 03) debe poseer NIT y NRC válidos.');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Construye el payload exacto de Comprobante de Crédito Fiscal (DTE 03) para un Corte Diario (Summary2)
 * o un Corte de Seguro de Mercadería (InsuranceReport).
 */
export function buildCutDtePayload({ cutType = 'daily_cut', cutData = {}, options = {} }) {
    const normalizedType = (cutType === 'insurance' || cutType === 'insurance_cut')
        ? 'insurance_cut'
        : 'daily_cut';

    const detailMode = options.detailMode || 'consolidated'; // 'consolidated' | 'unitary'
    const servicesMode = options.servicesMode || 'grouped'; // 'grouped' | 'itemized' | 'single'
    const condicionOperacion = Number(options.condicionOperacion || 2); // 2 = Crédito (15 días por defecto), 1 = Contado
    const diasCredito = Number(options.diasCredito || 15);
    const branchId = Number(options.branchId || 1);

    const customer = {
        id: 5038,
        nombre: options.customer?.nombre || EXPECTED_SIPE_CONTRACT.expectedReceptor.nombre,
        nombreComercial: 'AVICOLA SALVADOREÑA',
        nit: options.customer?.nit || EXPECTED_SIPE_CONTRACT.expectedReceptor.nit,
        nrc: options.customer?.nrc || EXPECTED_SIPE_CONTRACT.expectedReceptor.nrc,
        codActividad: '10103',
        descActividad: 'Procesamiento y conservación de carne de aves',
        correo: options.customer?.correo || EXPECTED_SIPE_CONTRACT.expectedReceptor.correo,
        telefono: '6988-3158',
        direccion: {
            departamento: '06',
            municipio: '23',
            distrito: '14',
            complemento: options.customer?.direccion || EXPECTED_SIPE_CONTRACT.expectedReceptor.direccion
        }
    };

    const items = [];
    let periodStart = '';
    let periodEnd = '';

    if (normalizedType === 'daily_cut') {
        periodStart = toDateStr(cutData.startDate);
        periodEnd = toDateStr(cutData.endDate);

        const congeladosRows = safeJsonParse(cutData.congeladosData, []);
        const preparadosRows = safeJsonParse(cutData.preparadosData, []);
        const servicesRows = safeJsonParse(cutData.servicesData, []);
        const totalsData = safeJsonParse(cutData.totalsData, {});

        const totalPounds = round4(
            congeladosRows.reduce((acc, r) => acc + (Number(r.stockFinal) || 0), 0)
        );
        const ratePounds = Number(congeladosRows[0]?.precio || 0.001);
        const rawCongMonto = Number(
            totalsData.congeladosMonto ??
            congeladosRows.reduce((acc, r) => acc + (Number(r.totalMonto) || 0), 0)
        );
        const congeladosMonto = round2(rawCongMonto);

        const totalBaskets = round4(
            preparadosRows.reduce((acc, r) => acc + (Number(r.stockFinal) || 0), 0)
        );
        const rateBaskets = Number(preparadosRows[0]?.precio || 0.038);
        const rawPrepMonto = Number(
            totalsData.preparadosMonto ??
            preparadosRows.reduce((acc, r) => acc + (Number(r.totalMonto) || 0), 0)
        );
        const preparadosMonto = round2(rawPrepMonto);

        // Línea 1: Producto Congelado (si > 0)
        if (congeladosMonto > 0) {
            const canUseUnitary = detailMode === 'unitary' &&
                totalPounds > 0 &&
                round2(totalPounds * ratePounds) === congeladosMonto;

            const cantidad = canUseUnitary ? totalPounds : 1;
            const precioUnitario = canUseUnitary ? round6(ratePounds) : congeladosMonto;
            const lbsText = totalPounds > 0
                ? ` - ${totalPounds.toLocaleString('en-US', { maximumFractionDigits: 2 })} LBS A $${ratePounds}/LB`
                : '';

            items.push({
                numItem: items.length + 1,
                tipoItem: 2,
                uniMedida: 99,
                codigo: 'SRV-ALM-CONG',
                descripcion: `SERVICIO DE ALMACENAMIENTO Y FRIO PRODUCTO CONGELADO (PERIODO ${periodStart} AL ${periodEnd}${lbsText})`,
                cantidad,
                precioUnitario,
                montoDescu: 0,
                ventaNoSuj: 0,
                ventaExenta: 0,
                ventaGravada: congeladosMonto,
                tributos: ['20']
            });
        }

        // Línea 2: Producto Preparado (si > 0)
        if (preparadosMonto > 0) {
            const canUseUnitary = detailMode === 'unitary' &&
                totalBaskets > 0 &&
                round2(totalBaskets * rateBaskets) === preparadosMonto;

            const cantidad = canUseUnitary ? totalBaskets : 1;
            const precioUnitario = canUseUnitary ? round6(rateBaskets) : preparadosMonto;
            const basketsText = totalBaskets > 0
                ? ` - ${totalBaskets.toLocaleString('en-US', { maximumFractionDigits: 0 })} CESTAS A $${rateBaskets}/CESTA`
                : '';

            items.push({
                numItem: items.length + 1,
                tipoItem: 2,
                uniMedida: 99,
                codigo: 'SRV-ALM-PREP',
                descripcion: `SERVICIO DE ALMACENAMIENTO Y FRIO PRODUCTO PREPARADO (PERIODO ${periodStart} AL ${periodEnd}${basketsText})`,
                cantidad,
                precioUnitario,
                montoDescu: 0,
                ventaNoSuj: 0,
                ventaExenta: 0,
                ventaGravada: preparadosMonto,
                tributos: ['20']
            });
        }

        // Líneas adicionales: Servicios Extraordinarios / Temperatura
        const validServices = (Array.isArray(servicesRows) ? servicesRows : []).filter(
            s => round2(s.value) > 0
        );

        if (validServices.length > 0) {
            if (servicesMode === 'itemized') {
                validServices.forEach((srv) => {
                    const val = round2(srv.value);
                    const isTemp = String(srv.description || '').toLowerCase().includes('temperatura');
                    const code = isTemp ? 'SRV-EXT-TEMP' : 'SRV-EXT-OPER';
                    const refLabel = srv.ref ? ` [${srv.ref}]` : '';
                    const dateLabel = srv.date ? ` (${srv.date})` : '';
                    const canUnitary = detailMode === 'unitary' &&
                        Number(srv.quantity) > 0 &&
                        Number(srv.unitPrice) > 0 &&
                        round2(Number(srv.quantity) * Number(srv.unitPrice)) === val;

                    items.push({
                        numItem: items.length + 1,
                        tipoItem: 2,
                        uniMedida: 99,
                        codigo: code,
                        descripcion: `SERVICIO EXTRAORDINARIO: ${String(srv.description || 'CARGO OPERATIVO').toUpperCase()}${dateLabel}${refLabel}`,
                        cantidad: canUnitary ? round4(srv.quantity) : 1,
                        precioUnitario: canUnitary ? round6(srv.unitPrice) : val,
                        montoDescu: 0,
                        ventaNoSuj: 0,
                        ventaExenta: 0,
                        ventaGravada: val,
                        tributos: ['20']
                    });
                });
            } else if (servicesMode === 'single') {
                const totalServMonto = round2(
                    validServices.reduce((acc, s) => acc + round2(s.value), 0)
                );
                if (totalServMonto > 0) {
                    items.push({
                        numItem: items.length + 1,
                        tipoItem: 2,
                        uniMedida: 99,
                        codigo: 'SRV-EXT-CF',
                        descripcion: `SERVICIOS EXTRAORDINARIOS DE MANIOBRA Y CONTROL DE TEMPERATURA EN CUARTO FRIO (PERIODO ${periodStart} AL ${periodEnd} - ${validServices.length} EVENTOS)`,
                        cantidad: 1,
                        precioUnitario: totalServMonto,
                        montoDescu: 0,
                        ventaNoSuj: 0,
                        ventaExenta: 0,
                        ventaGravada: totalServMonto,
                        tributos: ['20']
                    });
                }
            } else {
                // Modo 'grouped' (por defecto): separa recargos de temperatura (SRV-EXT-TEMP) y maniobras operativas (SRV-EXT-OPER)
                const tempServices = validServices.filter(s =>
                    String(s.description || '').toLowerCase().includes('temperatura')
                );
                const operServices = validServices.filter(s =>
                    !String(s.description || '').toLowerCase().includes('temperatura')
                );

                const operTotal = round2(operServices.reduce((acc, s) => acc + round2(s.value), 0));
                const tempTotal = round2(tempServices.reduce((acc, s) => acc + round2(s.value), 0));

                if (operTotal > 0) {
                    items.push({
                        numItem: items.length + 1,
                        tipoItem: 2,
                        uniMedida: 99,
                        codigo: 'SRV-EXT-OPER',
                        descripcion: `SERVICIOS EXTRAORDINARIOS DE CARGA, DESCARGA Y MANIOBRAS EN CUARTO FRIO (PERIODO ${periodStart} AL ${periodEnd} - ${operServices.length} SERVICIOS)`,
                        cantidad: 1,
                        precioUnitario: operTotal,
                        montoDescu: 0,
                        ventaNoSuj: 0,
                        ventaExenta: 0,
                        ventaGravada: operTotal,
                        tributos: ['20']
                    });
                }

                if (tempTotal > 0) {
                    items.push({
                        numItem: items.length + 1,
                        tipoItem: 2,
                        uniMedida: 99,
                        codigo: 'SRV-EXT-TEMP',
                        descripcion: `SERVICIO EXTRAORDINARIO DE ABATIMIENTO TERMICO POR TEMPERATURA DE RECEPCION (PERIODO ${periodStart} AL ${periodEnd} - ${tempServices.length} EVENTOS)`,
                        cantidad: 1,
                        precioUnitario: tempTotal,
                        montoDescu: 0,
                        ventaNoSuj: 0,
                        ventaExenta: 0,
                        ventaGravada: tempTotal,
                        tributos: ['20']
                    });
                }
            }
        }

        // Respaldo si totalsData tenía subtotal pero los arreglos individuales estaban vacíos
        if (items.length === 0 && round2(totalsData.subtotal || totalsData.totalAlmacenaje) > 0) {
            const fallbackSub = round2(totalsData.subtotal || totalsData.totalAlmacenaje);
            items.push({
                numItem: 1,
                tipoItem: 2,
                uniMedida: 99,
                codigo: 'SRV-ALM-CF',
                descripcion: `SERVICIO DE ALMACENAMIENTO Y CUSTODIA EN CUARTO FRIO (PERIODO ${periodStart} AL ${periodEnd})`,
                cantidad: 1,
                precioUnitario: fallbackSub,
                montoDescu: 0,
                ventaNoSuj: 0,
                ventaExenta: 0,
                ventaGravada: fallbackSub,
                tributos: ['20']
            });
        }
    } else {
        // cutType === 'insurance_cut'
        const rowsData = safeJsonParse(cutData.rowsData, []);
        const totalsData = safeJsonParse(cutData.totalsData, {});

        periodStart = toDateStr(cutData.startDate || cutData.cutoffDate);
        periodEnd = toDateStr(cutData.cutoffDate);

        const totalInsuredValue = round2(
            totalsData.totalInsuredValue ??
            rowsData.reduce((acc, r) => acc + (Number(r.insuredValue) || 0), 0)
        );
        const totalPremium = round2(
            totalsData.totalPremium ??
            rowsData.reduce((acc, r) => acc + (Number(r.premium) || 0), 0)
        );

        const formattedInsured = totalInsuredValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        items.push({
            numItem: 1,
            tipoItem: 2,
            uniMedida: 99,
            codigo: 'SRV-SEG-MERC',
            descripcion: `COBRO DE PRIMA DE SEGURO DE MERCADERIA EN CUARTO FRIO (PERIODO ${periodStart} AL ${periodEnd} - VALOR ASEGURADO $${formattedInsured})`,
            cantidad: 1,
            precioUnitario: totalPremium,
            montoDescu: 0,
            ventaNoSuj: 0,
            ventaExenta: 0,
            ventaGravada: totalPremium,
            tributos: ['20']
        });
    }

    const subtotalGravado = round2(
        items.reduce((acc, it) => acc + round2(Number(it.cantidad) * Number(it.precioUnitario)), 0)
    );
    const iva13 = round2(subtotalGravado * 0.13);
    const totalPagar = round2(subtotalGravado + iva13);
    const totalLetras = getAmountInWords(totalPagar);

    const pagos = [
        {
            codigo: condicionOperacion === 2 ? '13' : '01',
            montoPago: totalPagar,
            referencia: null,
            plazo: condicionOperacion === 2 ? '01' : null,
            periodo: condicionOperacion === 2 ? diasCredito : null
        }
    ];

    const now = new Date();
    const fecEmi = now.toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
    const horEmi = now.toLocaleTimeString('en-GB', { timeZone: 'America/El_Salvador' }).substring(0, 8);
    const previewUuid = (options.codigoGeneracion || crypto.randomUUID()).toUpperCase();

    const dtePreview = {
        identificacion: {
            version: EXPECTED_SIPE_CONTRACT.mhSchemaVersions['03'],
            ambiente: '01',
            tipoDte: '03',
            numeroControl: options.numeroControl || 'DTE-03-S001P001-000000000000001',
            codigoGeneracion: previewUuid,
            tipoModelo: 1,
            tipoOperacion: 1,
            tipoContingencia: null,
            motivoContin: null,
            fecEmi,
            horEmi,
            tipoMoneda: 'USD'
        },
        documentoRelacionado: null,
        emisor: {
            nit: '06142701141033',
            nrc: '2303606',
            nombre: 'INVERSIONES LIL, S.A. DE C.V.',
            codActividad: '47300',
            descActividad: 'VENTA AL POR MENOR DE COMBUSTIBLES Y SERVICIOS DE ALMACENAMIENTO',
            nombreComercial: 'INV LIL',
            tipoEstablecimiento: '01',
            direccion: {
                departamento: '06',
                municipio: '22',
                distrito: '13',
                complemento: 'CARR. PANAMERICANA CA01 KM 19, SAN MARTIN'
            },
            telefono: '22222222',
            correo: 'pumasanmartin@sipesv.com',
            codEstable: 'S001',
            codPuntoVenta: 'P001'
        },
        receptor: {
            nit: '06141305710012',
            nrc: '2330',
            nombre: customer.nombre,
            codActividad: customer.codActividad,
            descActividad: customer.descActividad,
            nombreComercial: customer.nombreComercial,
            direccion: customer.direccion,
            telefono: '69883158',
            correo: customer.correo
        },
        otrosDocumentos: null,
        ventaTercero: null,
        cuerpoDocumento: items.map((it, idx) => ({
            numItem: idx + 1,
            tipoItem: it.tipoItem,
            numeroDocumento: null,
            cantidad: it.cantidad,
            codigo: it.codigo,
            codTributo: null,
            uniMedida: it.uniMedida,
            descripcion: it.descripcion,
            precioUni: it.precioUnitario,
            montoDescu: 0,
            ventaNoSuj: 0,
            ventaExenta: 0,
            ventaGravada: it.ventaGravada,
            tributos: it.tributos,
            psv: 0,
            noGravado: 0
        })),
        resumen: {
            totalNoSuj: 0,
            totalExenta: 0,
            totalGravada: subtotalGravado,
            subTotalVentas: subtotalGravado,
            descuNoSuj: 0,
            descuExenta: 0,
            descuGravada: 0,
            porcentajeDescuento: 0,
            totalDescu: 0,
            tributos: [
                {
                    codigo: '20',
                    descripcion: 'Impuesto al Valor Agregado 13%',
                    valor: iva13
                }
            ],
            subTotal: subtotalGravado,
            ivaPerci1: 0,
            ivaRete1: 0,
            reteRenta: 0,
            montoTotalOperacion: totalPagar,
            totalNoGravado: 0,
            totalPagar,
            totalLetras,
            saldoFavor: 0,
            condicionOperacion,
            pagos,
            numPagoElectronico: null
        },
        extension: null,
        apendice: null
    };

    const payload = {
        cutId: cutData.id || options.cutId || null,
        cutType: normalizedType,
        companyId: 1,
        branchId,
        tipoDte: '03',
        condicionOperacion,
        diasCredito: condicionOperacion === 2 ? diasCredito : 0,
        detailMode,
        servicesMode,
        periodStart,
        periodEnd,
        customer,
        items,
        pagos,
        subtotalGravado,
        iva13,
        totalPagar,
        totalLetras,
        observaciones: options.observaciones || `Facturación Cuarto Frío (${normalizedType === 'daily_cut' ? 'Corte Diario Almacenamiento' : 'Corte Póliza de Seguro'}) Del ${periodStart} al ${periodEnd}`,
        dtePreview,
        dte: dtePreview
    };

    const validation = validateCutDtePayload(payload);
    payload.validation = validation;

    if (!validation.valid && options.throwOnInvalid !== false) {
        const err = new Error(`Payload DTE 03 no cumple el contrato SIPE: ${validation.errors.join('; ')}`);
        err.validationErrors = validation.errors;
        throw err;
    }

    return payload;
}

/**
 * Emite o registra como Pre-Factura un corte (daily_cut o insurance_cut) hacia el sistema SIPE
 * de Inversiones LIL, S.A. de C.V., garantizando idempotencia y protección anti-drift.
 */
export async function emitCutToSipe({ cutId, cutType = 'daily_cut', cutData = null, options = {}, user = {} }) {
    await ensureCutBillingColumns();

    const normalizedType = (cutType === 'insurance' || cutType === 'insurance_cut')
        ? 'insurance_cut'
        : 'daily_cut';
    const tableName = normalizedType === 'insurance_cut' ? 'insurance_cuts' : 'daily_cuts';

    // 1. Obtener el corte desde db_web_inventory y verificar idempotencia
    let targetCut = cutData;
    const effectiveCutId = cutId || cutData?.id;

    if (effectiveCutId) {
        const [rows] = await inventoryPool.query(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`, [effectiveCutId]);
        if (rows.length === 0 && !targetCut) {
            throw new Error(`El corte (${normalizedType}) con ID "${effectiveCutId}" no existe en la base de datos.`);
        }
        if (rows.length > 0) {
            targetCut = rows[0];
        }
    }

    if (!targetCut) {
        throw new Error('No se proporcionaron datos del corte para facturar en SIPE.');
    }

    if (
        (targetCut.dte_status === 'EMITTED' || targetCut.dte_status === 'ACCEPTED') &&
        !options.forceReemit
    ) {
        const err = new Error(
            `Este corte ya fue facturado en SIPE (Control: ${targetCut.dte_numero_control || 'N/A'}, Generación: ${targetCut.dte_codigo_generacion || 'N/A'}). No se permite doble facturación.`
        );
        err.code = 'ALREADY_EMITTED';
        err.statusCode = 409;
        err.existingDte = {
            sipeSaleId: targetCut.sipe_sale_id,
            codigoGeneracion: targetCut.dte_codigo_generacion,
            numeroControl: targetCut.dte_numero_control,
            selloRecepcion: targetCut.dte_sello_recepcion,
            dteStatus: targetCut.dte_status,
            emittedAt: targetCut.dte_emitted_at
        };
        throw err;
    }

    // 2. Verificación Pre-Flight del Contrato SIPE (Anti-Drift)
    const contractStatus = await checkSipeContractStatus(options);
    if (!contractStatus.connected) {
        throw new Error('No hay conexión disponible con el servidor SIPE (db_sistema_saas / API).');
    }
    if (contractStatus.driftDetected && !options.ignoreDrift) {
        const err = new Error(
            `Emisión bloqueada por cambio de contrato en SIPE (Schema Drift): ${contractStatus.driftDetails.join(' | ')}`
        );
        err.code = 'CONTRACT_DRIFT_DETECTED';
        err.statusCode = 409;
        err.driftDetails = contractStatus.driftDetails;
        throw err;
    }

    // 3. Construir y validar el payload DTE 03
    const builtPayload = buildCutDtePayload({
        cutType: normalizedType,
        cutData: targetCut,
        options
    });

    const emissionMode = options.emissionMode || 'sipe_draft'; // 'sipe_api' | 'sipe_draft' | 'staging'
    const isLiveTransmitRequested = emissionMode === 'sipe_api' || emissionMode === 'live_mh' || emissionMode === 'emit';

    let sipeSaleId = null;
    let codigoGeneracion = builtPayload.dtePreview.identificacion.codigoGeneracion;
    let numeroControl = null;
    let selloRecepcion = null;
    let fhProcesamiento = null;
    let estadoHacienda = isLiveTransmitRequested ? 'EMITTED' : 'PRE_FACTURA';
    let executionChannel = 'shared_db';

    // 4. Intentar primero vía HTTP SIPE_API_URL (/api/integration/coldroom-billing) si está disponible
    const sipeApiUrl = options.sipeApiUrl || process.env.SIPE_API_URL || 'http://127.0.0.1:4000';
    const cleanBaseUrl = String(sipeApiUrl).replace(/\/+$/, '').replace(/\/api$/, '');
    const jwtSecret = process.env.SIPE_JWT_SECRET || 'nova_saas_secret_2026_andelsa';
    const serviceToken = process.env.SIPE_API_TOKEN || jwt.sign(
        { id: 1, username: user?.username || 'inventario_lil', company_id: 1, branch_id: builtPayload.branchId },
        jwtSecret,
        { expiresIn: '5m' }
    );

    let handledViaHttp = false;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        const httpRes = await fetch(`${cleanBaseUrl}/api/integration/coldroom-billing`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceToken}`,
                'x-company-id': '1',
                'x-branch-id': String(builtPayload.branchId || 1),
                'x-service-key': process.env.SIPE_INTEGRATION_KEY || 'lil_coldroom_sipe_2026'
            },
            body: JSON.stringify({
                ...builtPayload,
                emissionMode: isLiveTransmitRequested ? 'sipe_api' : 'sipe_draft',
                allowStagingFallback: true
            }),
            signal: controller.signal
        });
        clearTimeout(timer);

        if (httpRes.ok) {
            const httpData = await httpRes.json();
            if (httpData && httpData.success) {
                sipeSaleId = httpData.saleId;
                codigoGeneracion = httpData.codigoGeneracion || codigoGeneracion;
                numeroControl = httpData.numeroControl;
                selloRecepcion = httpData.selloRecepcion || null;
                fhProcesamiento = httpData.fhProcesamiento || null;
                estadoHacienda = isLiveTransmitRequested ? 'EMITTED' : (httpData.estadoHacienda || 'PRE_FACTURA');
                executionChannel = 'http_sipe_api';
                handledViaHttp = true;
            }
        }
    } catch (_) {
        // Fallback transparente a inserción transaccional directa en db_sistema_saas
    }

    // 5. Registro transaccional directo en db_sistema_saas si el endpoint HTTP no estuvo activo en red local
    if (!handledViaHttp) {
        const sipePool = getSipeDbPool();
        const conn = await sipePool.getConnection();
        await conn.beginTransaction();

        try {
            const now = new Date();
            const horaEmision = now.toTimeString().split(' ')[0];
            const year = now.getFullYear();

            const [corrRows] = await conn.query(
                'SELECT current_number FROM dte_correlativos WHERE company_id = 1 AND tipo_dte = ? AND year = ? LIMIT 1',
                ['03', year]
            );
            const nextCorrPreview = (Number(corrRows[0]?.current_number || 0) + 1).toString().padStart(15, '0');
            numeroControl = `DTE-03-S001P001-${nextCorrPreview}`;
            builtPayload.dtePreview.identificacion.numeroControl = numeroControl;

            const [saleHeaderRes] = await conn.query('INSERT INTO sales_headers SET ?', [{
                company_id: 1,
                branch_id: builtPayload.branchId || 1,
                customer_id: 5038,
                seller_id: 3,
                pos_id: 1,
                dte_type: '03',
                tipo_documento: '03',
                condicion_operacion: builtPayload.condicionOperacion,
                fecha_emision: now,
                hora_emision: horaEmision,
                estado: 'emitido',
                total_gravado: builtPayload.subtotalGravado,
                total_exento: 0,
                total_nosujetas: 0,
                fovial: 0,
                cotrans: 0,
                total_iva: builtPayload.iva13,
                descuento_general: 0,
                iva_percibido: 0,
                iva_retenido: 0,
                total_pagar: builtPayload.totalPagar,
                payment_condition: builtPayload.condicionOperacion,
                observaciones: builtPayload.observaciones,
                cliente_nombre: builtPayload.customer.nombre,
                codigo_generacion: codigoGeneracion,
                numero_control: numeroControl,
                sello_recepcion: null,
                fh_procesamiento: null,
                created_at: now
            }]);

            sipeSaleId = saleHeaderRes.insertId;

            for (const it of builtPayload.items) {
                const cant = Number(it.cantidad) || 1;
                const netUnit = Number(it.precioUnitario) || 0;
                const inclusiveUnit = round6(netUnit * 1.13);

                await conn.query('INSERT INTO sales_items SET ?', [{
                    sale_id: sipeSaleId,
                    product_id: null,
                    codigo: it.codigo,
                    combo_id: null,
                    descripcion: it.descripcion,
                    cantidad: cant,
                    precio_unitario: inclusiveUnit,
                    monto_descuento: 0,
                    venta_gravada: it.ventaGravada,
                    venta_exenta: 0,
                    tributos: JSON.stringify(it.tributos || ['20'])
                }]);
            }

            await conn.query('INSERT INTO sales_payments SET ?', [{
                sale_id: sipeSaleId,
                metodo_pago: builtPayload.condicionOperacion === 2 ? '13' : '01',
                monto: builtPayload.totalPagar,
                referencia: effectiveCutId ? `CUT:${effectiveCutId}` : null
            }]);

            const dteRowStatus = isLiveTransmitRequested ? 'CONTINGENCIA_PENDIENTE' : 'PENDING';
            await conn.query(
                `INSERT INTO dtes (venta_id, codigo_generacion, numero_control, tipo_dte, company_id, branch_id, usuario_id, status, ambiente, json_original, respuesta_hacienda)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sipeSaleId,
                    codigoGeneracion,
                    numeroControl,
                    '03',
                    1,
                    builtPayload.branchId || 1,
                    1,
                    dteRowStatus,
                    '01',
                    JSON.stringify(builtPayload.dtePreview),
                    JSON.stringify({
                        origen: 'CUARTO_FRIO_INVENTARIO',
                        cutId: effectiveCutId,
                        cutType: normalizedType,
                        mode: emissionMode,
                        emittedBy: user?.username || 'Sistema'
                    })
                ]
            );

            await conn.commit();
            executionChannel = 'shared_db';
        } catch (txErr) {
            await conn.rollback();
            throw txErr;
        } finally {
            conn.release();
        }
    }

    // 6. Actualizar corte en db_web_inventory (daily_cuts o insurance_cuts)
    const emittedAt = new Date();
    const persistedStatus = isLiveTransmitRequested ? 'EMITTED' : 'PRE_FACTURA';
    const storedPayload = {
        contractVersion: contractStatus.apiVersion,
        contractHash: contractStatus.contractHash,
        executionChannel,
        emissionMode,
        sipeSaleId,
        codigoGeneracion,
        numeroControl,
        selloRecepcion,
        fhProcesamiento,
        estadoHacienda: persistedStatus,
        emittedBy: user?.username || 'Sistema',
        emittedAt: emittedAt.toISOString(),
        payload: builtPayload
    };

    if (effectiveCutId) {
        await inventoryPool.query(
            `UPDATE ${tableName}
             SET sipe_sale_id = ?,
                 dte_codigo_generacion = ?,
                 dte_numero_control = ?,
                 dte_sello_recepcion = ?,
                 dte_status = ?,
                 dte_emitted_at = ?,
                 dte_payload = ?,
                 isLocked = 1
             WHERE id = ?`,
            [
                sipeSaleId,
                codigoGeneracion,
                numeroControl,
                selloRecepcion,
                persistedStatus,
                emittedAt,
                JSON.stringify(storedPayload),
                effectiveCutId
            ]
        );
    }

    // 7. Registrar evento en bitácora system_logs de Inventario
    try {
        await inventoryPool.query(
            `INSERT INTO system_logs (id, userId, username, action, module, details, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                crypto.randomUUID(),
                user?.id || null,
                user?.username || 'Sistema',
                persistedStatus === 'EMITTED' ? 'DTE_EMIT' : 'DTE_PREFACTURA',
                normalizedType === 'insurance_cut' ? 'Seguro' : 'Cortes Diarios',
                `Facturación SIPE DTE-03 (${persistedStatus}) para corte ${effectiveCutId || 'N/A'} | Venta SIPE #${sipeSaleId} | Control: ${numeroControl} | Total: $${builtPayload.totalPagar.toFixed(2)}`,
                user?.ip || '127.0.0.1'
            ]
        );
    } catch (_) {
        // Non-blocking audit log
    }

    return {
        success: true,
        cutId: effectiveCutId,
        cutType: normalizedType,
        sipeSaleId,
        saleId: sipeSaleId,
        codigoGeneracion,
        dteCodigoGeneracion: codigoGeneracion,
        numeroControl,
        dteNumeroControl: numeroControl,
        selloRecepcion,
        dteSelloRecepcion: selloRecepcion,
        fhProcesamiento,
        dteStatus: persistedStatus,
        emittedAt: emittedAt.toISOString(),
        dteEmittedAt: emittedAt.toISOString(),
        executionChannel,
        subtotalGravado: builtPayload.subtotalGravado,
        iva13: builtPayload.iva13,
        totalPagar: builtPayload.totalPagar,
        totalLetras: builtPayload.totalLetras,
        items: builtPayload.items,
        dtePreview: builtPayload.dtePreview,
        dte: builtPayload.dtePreview,
        contract: {
            apiVersion: contractStatus.apiVersion,
            contractHash: contractStatus.contractHash,
            compatible: contractStatus.compatible
        }
    };
}

/**
 * Obtiene el estado de facturación SIPE de un corte específico.
 */
export async function getCutSipeBillingStatus({ cutId, cutType = 'daily_cut' }) {
    await ensureCutBillingColumns();
    const normalizedType = (cutType === 'insurance' || cutType === 'insurance_cut')
        ? 'insurance_cut'
        : 'daily_cut';
    const tableName = normalizedType === 'insurance_cut' ? 'insurance_cuts' : 'daily_cuts';

    const [rows] = await inventoryPool.query(
        `SELECT id, title, isLocked, sipe_sale_id, dte_codigo_generacion, dte_numero_control, dte_sello_recepcion, dte_status, dte_emitted_at, dte_payload
         FROM ${tableName} WHERE id = ? LIMIT 1`,
        [cutId]
    );

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
        cutId: row.id,
        cutType: normalizedType,
        title: row.title,
        isLocked: Boolean(row.isLocked),
        sipeSaleId: row.sipe_sale_id,
        codigoGeneracion: row.dte_codigo_generacion,
        numeroControl: row.dte_numero_control,
        selloRecepcion: row.dte_sello_recepcion,
        dteStatus: row.dte_status,
        emittedAt: row.dte_emitted_at,
        dtePayload: safeJsonParse(row.dte_payload, null)
    };
}

export default {
    EXPECTED_SIPE_CONTRACT,
    computeSipeContractHash,
    checkSipeContractStatus,
    buildCutDtePayload,
    validateCutDtePayload,
    emitCutToSipe,
    getCutSipeBillingStatus,
    ensureCutBillingColumns,
    getAmountInWords
};
