const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');

const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const user = await AdminUser.findById(payload.sub).select('username role permissions isActive currentSessionId');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }

    const tokenSessionId = String(payload.sid || '');
    const activeSessionId = String(user.currentSessionId || '');
    if (!tokenSessionId || !activeSessionId || tokenSessionId !== activeSessionId) {
      return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }

    req.auth = {
      userId: String(user._id),
      username: user.username,
      role: user.role,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      sessionId: tokenSessionId,
    };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const authorizePermissions = (...requiredPermissions) => (req, res, next) => {
  if (!req.auth) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (req.auth.role === 'super_admin') {
    return next();
  }

  const permissionSet = new Set(req.auth.permissions || []);
  const hasPermission = requiredPermissions.some((permission) => permissionSet.has(permission));

  if (!hasPermission) {
    return res.status(403).json({ success: false, message: 'Permission denied' });
  }

  return next();
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.auth) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (req.auth.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }

  return next();
};

module.exports = {
  JWT_SECRET,
  authenticateToken,
  authorizePermissions,
  requireSuperAdmin,
};
