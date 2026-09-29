import jwt from 'jsonwebtoken';
import pool from '../db.js';

const DEFAULT_SECRET = 'inventario_secure_dev_jwt_secret_key_2026';

const INSECURE_SECRET_PATTERNS = ['defecto', 'tu_clave', 'secret', '123456', 'cambiame'];
if (process.env.NODE_ENV === 'production') {
    const s = process.env.JWT_SECRET || '';
    if (s.length < 32 || INSECURE_SECRET_PATTERNS.some(p => s.toLowerCase().includes(p))) {
        console.warn('WARNING: JWT_SECRET debe tener al menos 32 caracteres y no contener palabras clave de plantilla en entorno de producción. Configura esta variable en Vercel.');
    }
}

export const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;

export const verifyToken = async (req, res, next) => {
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
        let permissions = null;
        if (user.permissions) {
            try { permissions = JSON.parse(user.permissions); } catch { permissions = null; }
        } else if (user.rolePermissions) {
            try { permissions = JSON.parse(user.rolePermissions); } catch { permissions = null; }
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
        return res.status(500).json({ error: 'Error al verificar autenticación: ' + err.message });
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

export const requirePermission = (moduleName, action = 'view') => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado.' });
        }
        if (req.user.role === 'admin') {
            return next();
        }

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
                try { permissions = JSON.parse(rows[0].userPerms); } catch (e) {}
            } else if (rows[0].rolePerms) {
                try { permissions = JSON.parse(rows[0].rolePerms); } catch (e) {}
            }

            const modulePermissions = permissions[moduleName] || {};
            if (modulePermissions[action] === true) {
                return next();
            }

            return res.status(403).json({ 
                error: `Acceso denegado. No tienes permisos para realizar la acción '${action}' en el módulo '${moduleName}'.` 
            });
        } catch (error) {
            return res.status(500).json({ error: 'Error al verificar permisos de usuario.' });
        }
    };
};
