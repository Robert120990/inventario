/**
 * Middleware para autorización RBAC granular por módulo y acción.
 * @param {string} moduleName - Nombre del módulo: 'products', 'movements', 'inventory-count', 'summary2', 'insurance', 'security-users', 'security-roles', etc.
 * @param {string} actionName - Acción requerida: 'view', 'create', 'edit', 'delete', 'export'
 */
export const requirePermission = (moduleName, actionName) => {
    return (req, res, next) => {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Usuario no autenticado.' });
        }

        // El rol 'admin' posee control total
        if (user.role === 'admin') {
            return next();
        }

        const permissions = user.permissions;
        if (!permissions) {
            return res.status(403).json({ 
                error: `Acceso denegado. No tienes permisos configurados para realizar '${actionName}' en el módulo '${moduleName}'.` 
            });
        }

        // 1. Verificación directa en el módulo solicitado
        const mod = permissions[moduleName];
        if (mod && (mod[actionName] === true || mod.all === true)) {
            return next();
        }

        // 2. Fallback para submódulos de seguridad (ej. 'security-users' hereda de 'security')
        if (moduleName.startsWith('security-')) {
            const baseSecurity = permissions['security'];
            if (baseSecurity && (baseSecurity[actionName] === true || baseSecurity.all === true)) {
                return next();
            }
        }

        // 3. Fallback de cortes: 'summary2' puede heredar de 'summary'
        if (moduleName === 'summary2') {
            const baseSummary = permissions['summary'];
            if (baseSummary && (baseSummary[actionName] === true || baseSummary.all === true)) {
                return next();
            }
        }

        return res.status(403).json({ 
            error: `Acceso denegado. No tienes permisos para realizar '${actionName}' en el módulo '${moduleName}'.` 
        });
    };
};
