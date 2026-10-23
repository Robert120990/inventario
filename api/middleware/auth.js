import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db.js';

const DEFAULT_SECRET = 'inventario_secure_dev_jwt_secret_key_2026';

const INSECURE_SECRET_PATTERNS = ['defecto', 'tu_clave', 'secret', '123456', 'cambiame'];
let resolvedSecret = process.env.JWT_SECRET || DEFAULT_SECRET;
if (process.env.NODE_ENV === 'production') {
    const s = process.env.JWT_SECRET || '';
    if (!s) {
        console.warn('WARNING: JWT_SECRET no est\u00e1 definido en producci\u00f3n. Usando clave determinista derivada para mantener sesi\u00f3n entre instancias Serverless.');
        resolvedSecret = crypto
            .createHmac('sha256', DEFAULT_SECRET)
            .update(`${process.env.DB_HOST || ''}:${process.env.DB_USER || ''}:${process.env.DB_PASS || ''}:${process.env.DB_NAME || ''}`)
            .digest('hex');
    } else if (s.length < 32 || INSECURE_SECRET_PATTERNS.some(p => s.toLowerCase().includes(p))) {
        console.warn('WARNING: JWT_SECRET debe tener al menos 32 caracteres y no contener palabras clave de plantilla en entorno de producci\u00f3n. Configura esta variable en Vercel.');
    }
}

export const JWT_SECRET = resolvedSecret;

export const verifyToken = async (req, res, next) => {
    // Evitar doble consulta a la base de datos si el middleware global ya autenticó la petición
    if (req.user && req.user.id) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Un token de acceso es requerido para la autenticación.' });
    }

    const token = authHeader.split(' ')[1]; // Formato: "Bearer <token>"
    if (!token) {
        return res.status(401).json({ error: 'Formato de token inválido.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    try {
        // 1. Verificar si el usuario existe y está activo
        const [rows] = await pool.query(
            `SELECT u.id, u.username, u.role, u.role_id, u.isActive, u.permissions,
                    r.name as roleName, r.permissions as rolePermissions
             FROM users u
             LEFT JOIN roles r ON u.role_id = r.id
             WHERE u.id = ?`,
            [decoded.id]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado o dado de baja.' });
        }

        const user = rows[0];
        if (user.isActive === 0 || user.isActive === false) {
            return res.status(401).json({ error: 'Cuenta de usuario desactivada por el administrador.' });
        }

        // 2. Verificar que la sesión activa exista en base de datos
        if (decoded.sessionId) {
            const [sessions] = await pool.query(
                'SELECT id FROM active_sessions WHERE id = ? AND userId = ?',
                [decoded.sessionId, user.id]
            );
            if (sessions.length === 0) {
                return res.status(401).json({ error: 'Sesión revocada o finalizada. Por favor inicia sesión nuevamente.' });
            }
        } else {
            return res.status(401).json({ error: 'Token inválido o desactualizado (falta identificador de sesión).' });
        }

        // 3. Resolver matriz de permisos (prioridad: permisos personalizados del usuario -> permisos del rol)
        let permissions = {};
        if (user.permissions) {
            try {
                permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
            } catch { permissions = {}; }
        } else if (user.rolePermissions) {
            try {
                permissions = typeof user.rolePermissions === 'string' ? JSON.parse(user.rolePermissions) : user.rolePermissions;
            } catch { permissions = {}; }
        }
        if (!permissions || typeof permissions !== 'object') {
            permissions = {};
        }

        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            role_id: user.role_id,
            roleName: user.roleName || (user.role === 'admin' ? 'Administrador' : 'Usuario'),
            permissions,
            sessionId: decoded.sessionId || null
        };

        next();
    } catch (err) {
        const msg = process.env.NODE_ENV === 'production'
            ? 'Error interno al verificar autenticación.'
            : 'Error al verificar autenticación: ' + err.message;
        return res.status(500).json({ error: msg });
    }
};

export const generateToken = (userPayload) => {
    // Generamos el token con validez de 24 horas
    return jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
};

export const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso restringido únicamente a administradores.' });
    }
    next();
};

const hasModulePermission = (permissions, moduleName, action) => {
    if (!permissions || typeof permissions !== 'object') return false;

    // 1. Verificación directa en el módulo solicitado
    const mod = permissions[moduleName];
    if (mod && (mod[action] === true || mod.all === true)) {
        return true;
    }

    // 2. Fallback para submódulos de seguridad (ej. 'security-users' hereda de 'security')
    if (moduleName.startsWith('security-')) {
        const baseSecurity = permissions['security'];
        if (baseSecurity && (baseSecurity[action] === true || baseSecurity.all === true)) {
            return true;
        }
    }

    // 3. Fallback de cortes: 'summary2' puede heredar de 'summary'
    if (moduleName === 'summary2') {
        const baseSummary = permissions['summary'];
        if (baseSummary && (baseSummary[action] === true || baseSummary.all === true)) {
            return true;
        }
    }

    // 4. Equivalencia operativa en toma física de inventario ('create' y 'edit' permiten registrar conteo)
    if (moduleName === 'inventory-count' && (action === 'create' || action === 'edit')) {
        if (mod && (mod.create === true || mod.edit === true)) {
            return true;
        }
    }

    return false;
};

export const requirePermission = (moduleName, action = 'view') => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado.' });
        }
        if (req.user.role === 'admin') {
            return next();
        }

        // Fast-path en memoria (0 consultas SQL extra cuando verifyToken ya pobló req.user.permissions)
        if (req.user.permissions !== undefined && req.user.permissions !== null && typeof req.user.permissions === 'object') {
            if (hasModulePermission(req.user.permissions, moduleName, action)) {
                return next();
            }
            return res.status(403).json({ 
                error: `Acceso denegado. No tienes permisos para realizar la acción '${action}' en el módulo '${moduleName}'.` 
            });
        }

        // Fallback a base de datos únicamente si req.user.permissions === undefined
        try {
            const [rows] = await pool.query(
                `SELECT u.permissions as userPerms, r.permissions as rolePerms
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE u.id = ?`,
                [req.user.id]
            );

            if (rows.length === 0) {
                return res.status(403).json({ error: 'Usuario no encontrado o inactivo.' });
            }

            let permissions = {};
            if (rows[0].userPerms) {
                try { permissions = JSON.parse(rows[0].userPerms); } catch {}
            } else if (rows[0].rolePerms) {
                try { permissions = JSON.parse(rows[0].rolePerms); } catch {}
            }

            req.user.permissions = permissions || {};

            if (hasModulePermission(req.user.permissions, moduleName, action)) {
                return next();
            }

            return res.status(403).json({ 
                error: `Acceso denegado. No tienes permisos para realizar la acción '${action}' en el módulo '${moduleName}'.` 
            });
        } catch {
            return res.status(500).json({ error: 'Error al verificar permisos de usuario.' });
        }
    };
};
