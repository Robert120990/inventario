import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import pool, { ensureSchema } from './db.js';
import { createRequire } from 'node:module';
import { verifyToken } from './middleware/auth.js';
import { requirePermission, requireAdmin } from './middleware/permissions.js';
import {
    DEFAULT_CONTRACT_RATES,
    ensureTableColumns,
    checkEntityVersionConflict,
    extractClientIp,
    isAllowedCorsOrigin,
    isValidSettingsLogo,
    formatSqlDateOnly,
    formatDailyCutRow,
    maybePruneSyncTables,
    sendApiError
} from './utils/helpers.js';
import { registerBootstrapRoutes } from './routes/bootstrap.js';
import { registerProductRoutes } from './routes/products.js';
import { registerMovementRoutes } from './routes/movements.js';
import { registerAuthAndSecurityRoutes } from './routes/authAndSecurity.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerCutRoutes } from './routes/cuts.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerSystemRoutes } from './routes/system.js';

const _require = createRequire(import.meta.url);
const bcrypt = (() => {
    try { return _require('bcryptjs'); } catch { return _require('bcrypt'); }
})();

const app = express();
app.set('trust proxy', 1);
const router = express.Router();

// 1. Cabeceras HTTP de seguridad con Helmet
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// 2. Compresión HTTP Gzip/Deflate
app.use(compression());

// 3. CORS endurecido para desarrollo local, orígenes autorizados y dominios propios en Vercel
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Bloqueado por política CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '15mb' }));

// 4. Rate Limiting: protección contra fuerza bruta y DoS
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 15, // máx 15 intentos fallidos
    message: { error: 'Demasiados intentos fallidos de inicio de sesión. Por favor intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000, // 2000 peticiones cada 15 min por IP
    message: { error: 'Límite de solicitudes excedido. Por favor intenta más tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Initialize Schema once per cold start - safely without concurrent DDL races
let isInitialized = false;
let initPromise = null;

const initializeApp = async () => {
    if (isInitialized) return;
    if (process.env.SKIP_RUNTIME_SCHEMA_CHECK === 'true') {
        isInitialized = true;
        return;
    }
    if (!initPromise) {
        initPromise = (async () => {
            try {
                await Promise.race([
                    (async () => {
                        await ensureSchema();
                        await ensureTableColumns();
                    })(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Init timeout')), 6000))
                ]);
            } catch (err) {
                console.warn('[Backend] Schema initialization warning:', err.message);
            } finally {
                isInitialized = true;
                initPromise = null;
            }
        })();
    }
    await initPromise;
};

app.use(async (req, res, next) => {
    if (!isInitialized) {
        await initializeApp();
    }
    next();
});

// Middleware de Idempotencia Server-Side y Protección contra Mezcla de Cuentas Offline
export const idempotencyMiddleware = async (req, res, next) => {
    const method = String(req.method || '').toUpperCase();
    if (!['POST', 'PUT', 'DELETE'].includes(method)) {
        return next();
    }

    const opUserId = req.headers?.['x-operation-user-id'] ?? req.body?.operationUserId;
    if (opUserId !== undefined && opUserId !== null && opUserId !== '' && req.user?.id !== undefined && String(opUserId) !== String(req.user.id)) {
        return res.status(403).json({
            error: 'Esta operación offline pertenece a otra cuenta de usuario y solo esa cuenta puede sincronizarla.',
            code: 'USER_MISMATCH'
        });
    }

    const rawKey = req.headers?.['x-idempotency-key'] || req.body?.idempotencyKey;
    if (!rawKey || !req.user?.id) {
        return next();
    }

    const idempKey = String(rawKey).trim().slice(0, 100);
    if (!idempKey) {
        return next();
    }

    try {
        const [rows] = await pool.query(
            'SELECT user_id, status_code, response_body FROM idempotency_keys WHERE idempotency_key = ? LIMIT 1',
            [idempKey]
        );
        if (rows && rows.length > 0) {
            const row = rows[0];
            if (String(row.user_id) !== String(req.user.id)) {
                return res.status(403).json({
                    error: 'El identificador de operación pertenece a otro usuario.',
                    code: 'USER_MISMATCH'
                });
            }
            let parsed = row.response_body;
            if (typeof parsed === 'string') {
                try { parsed = JSON.parse(parsed); } catch { parsed = { success: true }; }
            }
            return res.status(row.status_code || 200).json({
                ...(typeof parsed === 'object' && parsed !== null ? parsed : { success: true }),
                idempotentReplay: true
            });
        }
    } catch {
        // Si la tabla aún no existe o el mock no la contempla, continuar normalmente
    }

    if (typeof res.status === 'function') {
        const origStatus = res.status.bind(res);
        res.status = (code) => {
            res.statusCode = code;
            return origStatus(code);
        };
    }

    const origJson = res.json.bind(res);
    res.json = (body) => {
        const statusCode = res.statusCode || 200;
        if (statusCode >= 200 && statusCode < 300) {
            pool.query(
                'INSERT IGNORE INTO idempotency_keys (idempotency_key, user_id, method, endpoint, status_code, response_body) VALUES (?, ?, ?, ?, ?, ?)',
                [idempKey, req.user.id, method, req.originalUrl || req.url || req.path || '', statusCode, JSON.stringify(body ?? { success: true })]
            ).catch(() => {});
        }
        return origJson(body);
    };

    return next();
};

router.use(idempotencyMiddleware);

// Registrar todas las rutas planas sobre `router`
registerBootstrapRoutes(router);
registerProductRoutes(router);
registerMovementRoutes(router);
registerAuthAndSecurityRoutes(router, { authLimiter, bcrypt });
registerConfigRoutes(router);
registerCutRoutes(router);
registerBillingRoutes(router);
registerSystemRoutes(router);

// Mount router under /api
app.use('/api', apiLimiter, (req, res, next) => {
    // Rutas públicas que no requieren token
    const publicRoutes = ['/health', '/auth/login', '/version'];
    if (publicRoutes.includes(req.path)) {
        return next();
    }
    // Proteger todas las demás rutas con verificación de token y sesión activa
    verifyToken(req, res, next);
}, router);

// Middleware centralizado de manejo de errores (captura excepciones no controladas y sanitiza en producción)
app.use((err, req, res, _next) => {
    sendApiError(res, err, 'Error interno en el servidor');
});

export {
    requirePermission,
    requireAdmin,
    DEFAULT_CONTRACT_RATES,
    ensureTableColumns,
    checkEntityVersionConflict,
    extractClientIp,
    isAllowedCorsOrigin,
    isValidSettingsLogo,
    formatSqlDateOnly,
    formatDailyCutRow,
    maybePruneSyncTables
};

// Export for Vercel
export default app;

// Standalone execution for local development
const isDirectRun = import.meta.url.startsWith('file:') &&
    (process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('api\\index.js')));

const isTestRun = process.env.NODE_ENV === 'test' || process.execArgv.includes('--test') || process.argv.some(a => a.includes('.test.js'));
if (!process.env.VERCEL && isDirectRun && !isTestRun) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
