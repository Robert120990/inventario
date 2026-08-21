import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_por_defecto_cambiame_en_produccion';

export const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Un token de acceso es requerido para la autenticación.' });
    }

    const token = authHeader.split(' ')[1]; // Formato: "Bearer <token>"
    if (!token) {
        return res.status(401).json({ error: 'Formato de token inválido.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Adjuntamos los datos del usuario a la petición
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};

export const generateToken = (userPayload) => {
    // Generamos el token con validez de 24 horas
    return jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
};
