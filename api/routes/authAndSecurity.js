import pool from '../db.js';
import { randomUUID } from 'node:crypto';
import { generateToken, invalidateAuthCache } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { extractClientIp, logSystemEvent, maybePruneSyncTables, sendApiError } from '../utils/helpers.js';

export const registerAuthAndSecurityRoutes = (router, { authLimiter, bcrypt }) => {
    // Authentication
    router.post('/auth/login', authLimiter, async (req, res) => {
        const { username, password } = req.body;
        const cleanUser = (username || '').trim();
        const cleanPass = (password || '').trim();
        const ip = extractClientIp(req) || 'unknown';
        const userAgent = req.headers['user-agent'] || '';

        if (!cleanUser || !cleanPass) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
        }

        try {
            const [rows] = await pool.query(
                `SELECT u.id, u.username, u.password, u.role, u.role_id, u.isActive, u.permissions, u.last_login,
                        r.name as roleName, r.permissions as rolePermissions
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE LOWER(u.username) = LOWER(?)`,
                [cleanUser]
            );

            const user = rows[0];

            // Comprobación segura: verificar primero que el usuario exista antes de llamar a bcrypt.compare
            if (!user) {
                await logSystemEvent({
                    username: cleanUser,
                    action: 'LOGIN_FAILED',
                    module: 'auth',
                    details: `Intento fallido de inicio de sesión: el usuario '${cleanUser}' no existe`,
                    ip
                });
                return res.status(401).json({ error: 'Credenciales incorrectas.' });
            }

            const isMatch = await bcrypt.compare(cleanPass, user.password);
            if (!isMatch) {
                await logSystemEvent({
                    username: cleanUser,
                    action: 'LOGIN_FAILED',
                    module: 'auth',
                    details: `Intento fallido de inicio de sesión para el usuario '${cleanUser}'`,
                    ip
                });
                return res.status(401).json({ error: 'Credenciales incorrectas.' });
            }

            if (user.isActive === 0 || user.isActive === false) {
                return res.status(403).json({ error: 'Cuenta desactivada por el administrador.' });
            }

            // Actualizar last_login
            await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

            // Registrar sesión activa
            const sessionId = randomUUID();
            await pool.query(
                'INSERT INTO active_sessions (id, userId, username, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
                [sessionId, user.id, user.username, ip, userAgent.substring(0, 250)]
            );

            // Limpieza de sesiones con inactividad mayor a 1 día
            await pool.query('DELETE FROM active_sessions WHERE last_activity < DATE_SUB(NOW(), INTERVAL 1 DAY)');

            // Log en bitácora
            await logSystemEvent({
                userId: user.id,
                username: user.username,
                action: 'LOGIN',
                module: 'auth',
                details: `Inicio de sesión exitoso desde ${ip || 'red local'}`,
                ip
            });

            // Parsear permisos (prioridad: usuario -> rol)
            let parsedPermissions = null;
            if (user.permissions) {
                try { parsedPermissions = JSON.parse(user.permissions); } catch { parsedPermissions = null; }
            } else if (user.rolePermissions) {
                try { parsedPermissions = JSON.parse(user.rolePermissions); } catch { parsedPermissions = null; }
            }

            const safeUser = {
                id: user.id,
                username: user.username,
                role: user.role,
                role_id: user.role_id,
                roleName: user.roleName || (user.role === 'admin' ? 'Administrador' : 'Usuario'),
                isActive: user.isActive,
                permissions: parsedPermissions,
                last_login: new Date().toISOString()
            };

            const token = generateToken({ id: user.id, username: user.username, role: user.role, sessionId });

            void maybePruneSyncTables();

            res.json({ success: true, user: safeUser, sessionId, token });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/auth/logout', async (req, res) => {
        const { sessionId } = req.body;
        const actor = req.user?.username || req.body.username || 'Usuario';
        const actorId = req.user?.id || req.body.userId || null;
        const currentSession = sessionId || req.user?.sessionId;
        const ip = extractClientIp(req);

        try {
            if (currentSession) {
                await pool.query('DELETE FROM active_sessions WHERE id = ?', [currentSession]);
            } else if (actorId) {
                await pool.query('DELETE FROM active_sessions WHERE userId = ?', [actorId]);
            }
            invalidateAuthCache(actorId || null, currentSession || null);

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'LOGOUT',
                module: 'auth',
                details: `Cierre de sesión de usuario '${actor}'`,
                ip
            });

            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    // Users
    router.get('/users', requirePermission('security-users', 'view'), async (req, res) => {
        try {
            const [rows] = await pool.query(`
                SELECT u.id, u.username, u.role, u.role_id, u.isActive, u.permissions, u.last_login, u.created_at,
                       r.name as roleName, r.permissions as rolePermissions
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                ORDER BY u.id ASC
            `);
            const parsed = rows.map(u => {
                let perms = null;
                if (u.permissions) {
                    try { perms = JSON.parse(u.permissions); } catch { perms = null; }
                } else if (u.rolePermissions) {
                    try { perms = JSON.parse(u.rolePermissions); } catch { perms = null; }
                }
                return {
                    id: u.id,
                    username: u.username,
                    role: u.role,
                    role_id: u.role_id,
                    roleName: u.roleName || (u.role === 'admin' ? 'Administrador' : 'Usuario'),
                    isActive: u.isActive,
                    permissions: perms,
                    last_login: u.last_login,
                    created_at: u.created_at
                };
            });
            res.json(parsed);
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/users', requirePermission('security-users', 'create'), async (req, res) => {
        const { username, password, role, role_id, permissions } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        const cleanUser = (username || '').trim();
        const cleanPass = (password || '').trim();

        if (!cleanUser || !cleanPass) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
        }

        if (cleanPass.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe contener al menos 8 caracteres.' });
        }

        if (role === 'admin' && req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Solo un administrador puede crear usuarios con rol de Administrador.' });
        }

        try {
            const hashedPassword = await bcrypt.hash(cleanPass, 10);
            const permJson = permissions ? JSON.stringify(permissions) : null;
            const [result] = await pool.query(
                'INSERT INTO users (username, password, role, role_id, isActive, permissions) VALUES (?, ?, ?, ?, 1, ?)',
                [cleanUser, hashedPassword, role || 'user', role_id || null, permJson]
            );
            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'CREATE_USER',
                module: 'security-users',
                details: `Creación de usuario '${cleanUser}' con rol '${role || 'user'}'`
            });
            res.json({ success: true, id: result.insertId });
        } catch (error) {
            sendApiError(res, error, 'Error al crear usuario');
        }
    });

    router.put('/users/:id', requirePermission('security-users', 'edit'), async (req, res) => {
        const { id } = req.params;
        const { username, password, role, role_id, isActive, permissions } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        const cleanUser = (username || '').trim();

        try {
            const [targetRows] = await pool.query('SELECT id, username, role, isActive FROM users WHERE id = ?', [id]);
            if (targetRows.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado.' });
            }
            const targetUser = targetRows[0];

            if (targetUser.role === 'admin' && req.user?.role !== 'admin') {
                return res.status(403).json({ error: 'Solo un administrador puede modificar una cuenta de Administrador.' });
            }
            if (role === 'admin' && targetUser.role !== 'admin' && req.user?.role !== 'admin') {
                return res.status(403).json({ error: 'Solo un administrador puede asignar el rol de Administrador.' });
            }

            const willBeInactive = isActive === false || isActive === 0 || isActive === '0';
            if (willBeInactive) {
                if (Number(id) === Number(req.user?.id)) {
                    return res.status(409).json({ error: 'No puedes desactivar tu propia cuenta de usuario activa.' });
                }
                if (targetUser.role === 'admin') {
                    const [adminRows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = "admin" AND isActive = 1 AND id != ?', [id]);
                    if (adminRows[0].count === 0) {
                        return res.status(409).json({ error: 'No es posible desactivar al único administrador activo del sistema.' });
                    }
                }
            }

            const permJson = permissions ? JSON.stringify(permissions) : null;
            let passwordUpdated = false;

            if (password && password.trim() !== '') {
                const cleanPass = password.trim();
                if (cleanPass.length < 8) {
                    return res.status(400).json({ error: 'La nueva contraseña debe contener al menos 8 caracteres.' });
                }
                const hashedPassword = await bcrypt.hash(cleanPass, 10);
                await pool.query(
                    'UPDATE users SET username=?, password=?, role=?, role_id=?, isActive=?, permissions=? WHERE id=?',
                    [cleanUser, hashedPassword, role || targetUser.role, role_id || null, willBeInactive ? 0 : 1, permJson, id]
                );
                passwordUpdated = true;
                await pool.query('DELETE FROM active_sessions WHERE userId = ?', [id]);
            } else {
                await pool.query(
                    'UPDATE users SET username=?, role=?, role_id=?, isActive=?, permissions=? WHERE id=?',
                    [cleanUser, role || targetUser.role, role_id || null, willBeInactive ? 0 : 1, permJson, id]
                );
            }

            if (willBeInactive) {
                await pool.query('DELETE FROM active_sessions WHERE userId = ?', [id]);
            }
            invalidateAuthCache(id);

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'UPDATE_USER',
                module: 'security-users',
                details: `Modificación de usuario ID ${id} (${cleanUser})${passwordUpdated ? ' (contraseña restablecida y sesiones revocadas)' : ''}`
            });
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error, 'Error al actualizar usuario');
        }
    });

    router.put('/users/:id/permissions', requirePermission('security-access', 'edit'), async (req, res) => {
        const { id } = req.params;
        const { permissions } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Solo un administrador puede modificar directamente matrices de permisos.' });
        }

        try {
            const permJson = permissions ? JSON.stringify(permissions) : null;
            await pool.query('UPDATE users SET permissions=? WHERE id=?', [permJson, id]);
            invalidateAuthCache(id);
            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'UPDATE_PERMISSIONS',
                module: 'security-access',
                details: `Actualización de matriz de permisos personalizados para usuario ID ${id}`
            });
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error, 'Error al actualizar permisos');
        }
    });

    router.delete('/users/:id', requirePermission('security-users', 'delete'), async (req, res) => {
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        if (Number(req.params.id) === Number(req.user?.id)) {
            return res.status(409).json({ error: 'No puedes eliminar tu propia cuenta de usuario activa.' });
        }

        try {
            const [rows] = await pool.query('SELECT id, username, role, isActive FROM users WHERE id=?', [req.params.id]);
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado.' });
            }
            const targetUser = rows[0];

            if (targetUser.role === 'admin' && req.user?.role !== 'admin') {
                return res.status(403).json({ error: 'Solo un administrador puede eliminar una cuenta de Administrador.' });
            }

            if (targetUser.role === 'admin') {
                const [adminRows] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = "admin" AND isActive = 1 AND id != ?', [req.params.id]);
                if (adminRows[0].count === 0) {
                    return res.status(409).json({ error: 'No es posible eliminar al único administrador activo del sistema.' });
                }
            }

            await pool.query('DELETE FROM active_sessions WHERE userId = ?', [req.params.id]);
            await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
            invalidateAuthCache(req.params.id);

            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'DELETE_USER',
                module: 'security-users',
                details: `Eliminación de usuario '${targetUser.username}' (ID ${req.params.id})`
            });
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error, 'Error al eliminar usuario');
        }
    });

    // Roles
    router.get('/roles', requirePermission('security-roles', 'view'), async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM roles ORDER BY id ASC');
            const parsed = rows.map(r => ({
                ...r,
                permissions: r.permissions ? JSON.parse(r.permissions) : {}
            }));
            res.json(parsed);
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/roles', requirePermission('security-roles', 'create'), async (req, res) => {
        const { name, description, permissions } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        if (!name?.trim()) return res.status(400).json({ error: 'Nombre de rol obligatorio.' });
        try {
            const permJson = permissions ? JSON.stringify(permissions) : '{}';
            const [result] = await pool.query(
                'INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?)',
                [name.trim(), description || '', permJson]
            );
            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'CREATE_ROLE',
                module: 'security-roles',
                details: `Creación de nuevo rol '${name.trim()}'`
            });
            res.json({ success: true, id: result.insertId });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.put('/roles/:id', requirePermission('security-roles', 'edit'), async (req, res) => {
        const { id } = req.params;
        const { name, description, permissions } = req.body;
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        try {
            const permJson = permissions ? JSON.stringify(permissions) : '{}';
            await pool.query(
                'UPDATE roles SET name=?, description=?, permissions=? WHERE id=?',
                [name.trim(), description || '', permJson, id]
            );
            invalidateAuthCache();
            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'UPDATE_ROLE',
                module: 'security-roles',
                details: `Actualización de rol ID ${id} (${name})`
            });
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.delete('/roles/:id', requirePermission('security-roles', 'delete'), async (req, res) => {
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        try {
            await pool.query('DELETE FROM roles WHERE id=?', [req.params.id]);
            invalidateAuthCache();
            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'DELETE_ROLE',
                module: 'security-roles',
                details: `Eliminación de rol ID ${req.params.id}`
            });
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    // System Logs (Bitácora)
    router.get('/system-logs', requirePermission('security-logs', 'view'), async (req, res) => {
        try {
            const { module, action, search, limit = 100 } = req.query;
            let query = "SELECT id, userId, username, action, module, details, ip_address, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as timestamp FROM system_logs WHERE 1=1";
            const params = [];

            if (module && module !== 'all') {
                query += " AND module = ?";
                params.push(module);
            }
            if (action && action !== 'all') {
                query += " AND action = ?";
                params.push(action);
            }
            if (search) {
                query += " AND (username LIKE ? OR details LIKE ?)";
                params.push(`%${search}%`, `%${search}%`);
            }

            query += " ORDER BY created_at DESC LIMIT ?";
            params.push(Number(limit));

            const [rows] = await pool.query(query, params);
            res.json(rows);
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/system-logs', async (req, res) => {
        const { action, module, details } = req.body || {};
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;
        const ip = extractClientIp(req);
        const safeAction = String(action || 'CLIENT_ACTION').trim().slice(0, 50);
        const safeModule = String(module || 'system').trim().slice(0, 50);
        const safeDetails = String(details || '').trim().slice(0, 1000);
        try {
            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: safeAction,
                module: safeModule,
                details: safeDetails,
                ip
            });
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error, 'Error al registrar evento en bitácora');
        }
    });

    // Active Sessions
    router.get('/active-sessions', requirePermission('security-sessions', 'view'), async (req, res) => {
        try {
            const [rows] = await pool.query(`
                SELECT id, userId, username, ip_address, user_agent,
                       DATE_FORMAT(last_activity, '%Y-%m-%d %H:%i:%s') as last_activity,
                       DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as login_time
                FROM active_sessions
                WHERE last_activity >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
                ORDER BY last_activity DESC
            `);
            res.json(rows);
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/active-sessions/heartbeat', async (req, res) => {
        const { sessionId, userAgent } = req.body;
        const ip = extractClientIp(req) || '127.0.0.1';
        const ua = String(userAgent || req.headers['user-agent'] || 'Navegador Web').substring(0, 250);
        const currentSession = req.user?.sessionId || sessionId;

        if (!currentSession) {
            return res.status(401).json({ success: false, revoked: true, error: 'Sesión no especificada.' });
        }

        try {
            const [updateResult] = await pool.query(
                'UPDATE active_sessions SET last_activity = NOW(), user_agent = ?, ip_address = ? WHERE id = ? AND userId = ?',
                [ua, ip, currentSession, req.user.id]
            );

            if (updateResult.affectedRows === 0) {
                return res.status(401).json({
                    success: false,
                    revoked: true,
                    error: 'Sesión finalizada, revocada o no pertenece al usuario autenticado.'
                });
            }

            res.json({ success: true, sessionId: currentSession });
        } catch (error) {
            sendApiError(res, error, 'Error al actualizar sesión activa');
        }
    });

    router.delete('/active-sessions/:id', requirePermission('security-sessions', 'delete'), async (req, res) => {
        const actor = req.user?.username || 'Sistema';
        const actorId = req.user?.id || null;

        try {
            await pool.query('DELETE FROM active_sessions WHERE id = ?', [req.params.id]);
            invalidateAuthCache(null, req.params.id);
            await logSystemEvent({
                userId: actorId,
                username: actor,
                action: 'REVOKE_SESSION',
                module: 'security-sessions',
                details: `Revocación manual de sesión ID '${req.params.id}'`
            });
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    // Notifications
    router.get('/notifications', async (req, res) => {
        try {
            const userId = req.user?.id || req.query.userId;
            let query = "SELECT id, userId, title, message, type, isRead, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as date FROM notifications WHERE (userId IS NULL";
            const params = [];
            if (userId) {
                query += " OR userId = ?";
                params.push(userId);
            }
            query += ") ORDER BY created_at DESC LIMIT 50";
            const [rows] = await pool.query(query, params);
            res.json(rows);
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.post('/notifications', requirePermission('security-notifications', 'create'), async (req, res) => {
        const { userId, title, message, type } = req.body;
        if (!title || !message) return res.status(400).json({ error: 'Título y mensaje requeridos.' });
        try {
            const id = randomUUID();
            await pool.query(
                'INSERT INTO notifications (id, userId, title, message, type) VALUES (?, ?, ?, ?, ?)',
                [id, userId || null, title, message, type || 'info']
            );
            res.json({ success: true, id });
        } catch (error) {
            sendApiError(res, error);
        }
    });

    router.put('/notifications/:id/read', async (req, res) => {
        try {
            const userId = req.user?.id || null;
            await pool.query('UPDATE notifications SET isRead = 1 WHERE id = ? AND (userId = ? OR userId IS NULL)', [req.params.id, userId]);
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error, 'Error al marcar notificación como leída');
        }
    });

    router.put('/notifications/read-all', async (req, res) => {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'No autenticado.' });
        }
        const isAdmin = req.user?.role === 'admin' || req.user?.role === 'Administrador';
        try {
            if (isAdmin) {
                await pool.query('UPDATE notifications SET isRead = 1 WHERE userId = ? OR userId IS NULL', [userId]);
            } else {
                await pool.query('UPDATE notifications SET isRead = 1 WHERE userId = ?', [userId]);
            }
            res.json({ success: true });
        } catch (error) {
            sendApiError(res, error);
        }
    });
};
