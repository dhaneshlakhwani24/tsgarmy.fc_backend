const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Player = require('../models/Player');
const PlayerAccount = require('../models/PlayerAccount');
const sseHub = require('../utils/sseHub');
const { authenticateToken, authorizePermissions } = require('../middleware/auth');

const router = express.Router();

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'players');
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      return callback(new Error('Only image files are allowed'));
    }
    callback(null, true);
  },
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

const buildVariantPath = (imagePath, variant) => {
  if (!imagePath || !imagePath.endsWith('.webp')) {
    return '';
  }

  const variantPath = imagePath.replace('.webp', `-${variant}.webp`);
  const filename = variantPath.replace('/uploads/players/', '');
  const absolutePath = path.join(uploadDirectory, filename);

  return fs.existsSync(absolutePath) ? variantPath : '';
};

const toClientPlayer = (player) => ({
  _id: player._id,
  name: player.name,
  role: player.role,
  description: player.description,
  instagramUrl: player.instagramUrl,
  youtubeUrl: player.youtubeUrl,
  imagePath: player.imagePath,
  imagePathMd: buildVariantPath(player.imagePath, 'md'),
  imagePathSm: buildVariantPath(player.imagePath, 'sm'),
  photo: player.imagePath,
  isLive: player.isLive,
  liveUrl: player.liveUrl,
  rank: player.rank,
  createdAt: player.createdAt,
  updatedAt: player.updatedAt,
});

const removeLocalImage = (imagePath) => {
  if (!imagePath || !imagePath.startsWith('/uploads/players/')) {
    return;
  }

  const filename = imagePath.replace('/uploads/players/', '');
  const absolutePath = path.join(uploadDirectory, filename);
  const absolutePathMd = absolutePath.replace('.webp', '-md.webp');
  const absolutePathSm = absolutePath.replace('.webp', '-sm.webp');
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
  if (fs.existsSync(absolutePathMd)) {
    fs.unlinkSync(absolutePathMd);
  }
  if (fs.existsSync(absolutePathSm)) {
    fs.unlinkSync(absolutePathSm);
  }
};

const saveOptimizedPlayerImage = async (file) => {
  const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const absolutePath = path.join(uploadDirectory, safeName);
  const absolutePathMd = absolutePath.replace('.webp', '-md.webp');
  const absolutePathSm = absolutePath.replace('.webp', '-sm.webp');

  const image = sharp(file.buffer).rotate();

  await image
    .clone()
    .resize(960, 1200, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: 78, effort: 4 })
    .toFile(absolutePath);

  await image
    .clone()
    .resize(640, 800, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: 74, effort: 4 })
    .toFile(absolutePathMd);

  await image
    .clone()
    .resize(360, 480, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: 68, effort: 4 })
    .toFile(absolutePathSm);

  return `/uploads/players/${safeName}`;
};

router.get('/', async (_req, res) => {
  try {
    const players = await Player.find();
    players.sort((a, b) => {
      const ar = a.rank ?? 999;
      const br = b.rank ?? 999;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });
    res.json({ success: true, data: players.map(toClientPlayer) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', authenticateToken, authorizePermissions('players'), upload.single('image'), async (req, res) => {
  let imagePath = '';

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Player image is required' });
    }

    imagePath = await saveOptimizedPlayerImage(req.file);

    const player = await Player.create({
      name: req.body.name,
      role: req.body.role,
      description: req.body.description,
      instagramUrl: req.body.instagramUrl || '',
      youtubeUrl: req.body.youtubeUrl || '',
      imagePath,
      liveUrl: req.body.liveUrl || '',
      rank: req.body.rank ? Number(req.body.rank) : null,
    });

    res.status(201).json({ success: true, data: toClientPlayer(player) });
    sseHub.broadcast('players');
  } catch (error) {
    removeLocalImage(imagePath);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', authenticateToken, authorizePermissions('players'), upload.single('image'), async (req, res) => {
  let nextImagePath = '';

  try {
    const existingPlayer = await Player.findById(req.params.id);
    if (!existingPlayer) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    const previousImagePath = existingPlayer.imagePath;
    nextImagePath = req.file ? await saveOptimizedPlayerImage(req.file) : existingPlayer.imagePath;

    existingPlayer.name = req.body.name;
    existingPlayer.role = req.body.role;
    existingPlayer.description = req.body.description;
    existingPlayer.instagramUrl = req.body.instagramUrl || '';
    existingPlayer.youtubeUrl = req.body.youtubeUrl || '';
    existingPlayer.imagePath = nextImagePath;
    existingPlayer.liveUrl = req.body.liveUrl || '';
    existingPlayer.rank = req.body.rank ? Number(req.body.rank) : null;

    const updatedPlayer = await existingPlayer.save();

    if (req.file && previousImagePath !== nextImagePath) {
      removeLocalImage(previousImagePath);
    }

    res.json({ success: true, data: toClientPlayer(updatedPlayer) });
    sseHub.broadcast('players');
  } catch (error) {
    if (req.file && nextImagePath) {
      removeLocalImage(nextImagePath);
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/:id/live', authenticateToken, authorizePermissions('players'), async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    player.isLive = !player.isLive;
    if (player.isLive) {
      player.liveUrl = req.body.liveUrl || '';
    } else {
      player.liveUrl = '';
    }
    await player.save();
    res.json({ success: true, data: toClientPlayer(player) });
    sseHub.broadcast('players');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/:id/rank', authenticateToken, authorizePermissions('players'), async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    const raw = req.body.rank;
    player.rank = raw ? Number(raw) : null;
    await player.save();
    res.json({ success: true, data: toClientPlayer(player) });
    sseHub.broadcast('players');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', authenticateToken, authorizePermissions('players'), async (req, res) => {
  try {
    const player = await Player.findByIdAndDelete(req.params.id);

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    removeLocalImage(player.imagePath);
    await PlayerAccount.deleteOne({ playerId: player._id });

    res.json({ success: true, message: 'Player deleted' });
    sseHub.broadcast('players');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
