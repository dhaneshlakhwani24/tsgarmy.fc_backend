const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
const { JWT_SECRET, authenticateToken, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

const AUTH_PERMISSIONS = ['dashboard', 'schedule', 'players', 'achievements'];
const profileImageDirectory = path.join(__dirname, '..', 'uploads', 'admins');
fs.mkdirSync(profileImageDirectory, { recursive: true });

const uploadProfilePhoto = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      return callback(new Error('Only image files are allowed'));
    }
    return callback(null, true);
  },
});

const removeLocalProfilePhoto = (photoPath) => {
  if (!photoPath || !photoPath.startsWith('/uploads/admins/')) {
    return;
  }

  const filename = photoPath.replace('/uploads/admins/', '');
  const absolutePath = path.join(profileImageDirectory, filename);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

const saveOptimizedProfilePhoto = async (file, userId) => {
  const safeName = `${userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const absolutePath = path.join(profileImageDirectory, safeName);

  await sharp(file.buffer)
    .rotate()
    .resize(420, 420, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: 78, effort: 4 })
    .toFile(absolutePath);

  return `/uploads/admins/${safeName}`;
};

const sanitizePermissions = (value) => {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(
    new Set(
      list
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => AUTH_PERMISSIONS.includes(item))
    )
  );
};

const toSafeUser = (userDoc) => ({
  id: userDoc._id,
  username: userDoc.username,
  role: userDoc.role,
  permissions: userDoc.role === 'super_admin' ? AUTH_PERMISSIONS : sanitizePermissions(userDoc.permissions),
  isActive: userDoc.isActive,
  createdBy: userDoc.createdBy || '',
  profilePhotoPath: userDoc.profilePhotoPath || '',
  createdAt: userDoc.createdAt,
  updatedAt: userDoc.updatedAt,
});

const buildToken = (safeUser, sessionId) =>
  jwt.sign(
    {
      sub: String(safeUser.id),
      username: safeUser.username,
      role: safeUser.role,
      permissions: safeUser.permissions,
      sid: String(sessionId || ''),
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );

const ensureSuperAdmin = async () => {
  const superUsername = String(process.env.SUPER_ADMIN_USERNAME || '').trim().toLowerCase();
  const superPassword = String(process.env.SUPER_ADMIN_PASSWORD || '').trim();

  if (!superUsername || !superPassword) {
    return;
  }

  const existingByRole = await AdminUser.findOne({ role: 'super_admin' });
  if (existingByRole) {
    return;
  }

  const passwordHash = await bcrypt.hash(superPassword, 12);

  await AdminUser.create({
    username: superUsername,
    passwordHash,
    role: 'super_admin',
    permissions: AUTH_PERMISSIONS,
    isActive: true,
    createdBy: superUsername,
  });
};

router.post('/login', async (req, res) => {
  try {
    await ensureSuperAdmin();

    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = await AdminUser.findOne({ username });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const sessionId = crypto.randomUUID();
    user.currentSessionId = sessionId;
    user.lastLoginAt = new Date();
    await user.save();

    const safeUser = toSafeUser(user);
    const token = buildToken(safeUser, sessionId);

    return res.json({ success: true, token, user: safeUser });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await AdminUser.findById(req.auth.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }

    return res.json({ success: true, user: toSafeUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const user = await AdminUser.findById(req.auth.userId);
    if (user && user.currentSessionId === req.auth.sessionId) {
      user.currentSessionId = '';
      await user.save();
    }

    return res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/me/photo', authenticateToken, uploadProfilePhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Profile photo is required' });
    }

    const user = await AdminUser.findById(req.auth.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }

    const previousPath = user.profilePhotoPath || '';
    const nextPhotoPath = await saveOptimizedProfilePhoto(req.file, user._id);

    user.profilePhotoPath = nextPhotoPath;
    await user.save();

    if (previousPath && previousPath !== nextPhotoPath) {
      removeLocalProfilePhoto(previousPath);
    }

    return res.json({ success: true, user: toSafeUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/admins', authenticateToken, requireSuperAdmin, async (_req, res) => {
  try {
    const users = await AdminUser.find().sort({ createdAt: -1 });
    return res.json({ success: true, data: users.map(toSafeUser) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/admins', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const permissions = sanitizePermissions(req.body.permissions);

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const exists = await AdminUser.findOne({ username });
    if (exists) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await AdminUser.create({
      username,
      passwordHash,
      role: 'admin',
      permissions,
      isActive: true,
      createdBy: req.auth.username,
    });

    return res.status(201).json({ success: true, data: toSafeUser(created) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/admins/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const user = await AdminUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (user.role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Super admin cannot be edited here' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'permissions')) {
      user.permissions = sanitizePermissions(req.body.permissions);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'isActive')) {
      user.isActive = Boolean(req.body.isActive);
    }

    if (req.body.password) {
      const password = String(req.body.password).trim();
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      user.passwordHash = await bcrypt.hash(password, 12);
    }

    await user.save();

    return res.json({ success: true, data: toSafeUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
