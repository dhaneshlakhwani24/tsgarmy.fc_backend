const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Player = require('../models/Player');
const PlayerAccount = require('../models/PlayerAccount');
const sseHub = require('../utils/sseHub');
const { uploadToGridFS, downloadFromGridFS, deleteFromGridFS } = require('../utils/gridfsUtil');
const { authenticateToken, authorizePermissions } = require('../middleware/auth');

const router = express.Router();

// Still create local directory for fallback
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

const toClientPlayer = (player) => ({
  _id: player._id,
  name: player.name,
  role: player.role,
  description: player.description,
  instagramUrl: player.instagramUrl,
  youtubeUrl: player.youtubeUrl,
  imagePath: player.imagePath,
  imagePathMd: player.imagePathMd || '',
  imagePathSm: player.imagePathSm || '',
  photo: player.imagePath,
  isLive: player.isLive,
  liveUrl: player.liveUrl,
  rank: player.rank,
  createdAt: player.createdAt,
  updatedAt: player.updatedAt,
});

const deletePlayerImages = async (player) => {
  if (player.imageGridFsId) {
    try {
      await deleteFromGridFS(Player.collection.conn, player.imageGridFsId);
    } catch (err) {
      console.error('Failed to delete GridFS image:', err);
    }
  }

  // Fallback: remove local files if they exist
  if (player.imagePath && player.imagePath.startsWith('/uploads/players/')) {
    const filename = player.imagePath.replace('/uploads/players/', '');
    const absolutePath = path.join(uploadDirectory, filename);
    const absolutePathMd = absolutePath.replace('.webp', '-md.webp');
    const absolutePathSm = absolutePath.replace('.webp', '-sm.webp');
    try {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
      if (fs.existsSync(absolutePathMd)) fs.unlinkSync(absolutePathMd);
      if (fs.existsSync(absolutePathSm)) fs.unlinkSync(absolutePathSm);
    } catch (err) {
      console.error('Failed to delete local image:', err);
    }
  }
};

const saveOptimizedPlayerImage = async (file, conn) => {
  const image = sharp(file.buffer).rotate();

  // Generate main image
  const mainBuffer = await image
    .clone()
    .resize(960, 1200, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();

  // Generate medium variant
  const mdBuffer = await image
    .clone()
    .resize(640, 800, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: 74, effort: 4 })
    .toBuffer();

  // Generate small variant
  const smBuffer = await image
    .clone()
    .resize(360, 480, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: 68, effort: 4 })
    .toBuffer();

  // Upload all variants to GridFS
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);

  const mainId = await uploadToGridFS(conn, `player-${timestamp}-${random}.webp`, mainBuffer, {
    variant: 'main',
  });

  const mdId = await uploadToGridFS(conn, `player-${timestamp}-${random}-md.webp`, mdBuffer, {
    variant: 'md',
  });

  const smId = await uploadToGridFS(conn, `player-${timestamp}-${random}-sm.webp`, smBuffer, {
    variant: 'sm',
  });

  return {
    mainId,
    mdId,
    smId,
  };
};

// Endpoint to serve images from GridFS
router.get('/image/:fileId', async (req, res) => {
  try {
    const fileBuffer = await downloadFromGridFS(Player.collection.conn, req.params.fileId);
    res.type('image/webp');
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.send(fileBuffer);
  } catch (error) {
    res.status(404).json({ success: false, message: 'Image not found' });
  }
});

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
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Player image is required' });
    }

    const { mainId, mdId, smId } = await saveOptimizedPlayerImage(req.file, Player.collection.conn);

    const player = await Player.create({
      name: req.body.name,
      role: req.body.role,
      description: req.body.description,
      instagramUrl: req.body.instagramUrl || '',
      youtubeUrl: req.body.youtubeUrl || '',
      imagePath: `/api/players/image/${mainId}`,
      imagePathMd: `/api/players/image/${mdId}`,
      imagePathSm: `/api/players/image/${smId}`,
      imageGridFsId: mainId,
      imageGridFsIdMd: mdId,
      imageGridFsIdSm: smId,
      liveUrl: req.body.liveUrl || '',
      rank: req.body.rank ? Number(req.body.rank) : null,
    });

    res.status(201).json({ success: true, data: toClientPlayer(player) });
    sseHub.broadcast('players');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', authenticateToken, authorizePermissions('players'), upload.single('image'), async (req, res) => {
  try {
    const existingPlayer = await Player.findById(req.params.id);
    if (!existingPlayer) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (req.file) {
      // Delete old images from GridFS
      await deletePlayerImages(existingPlayer);

      // Upload new images
      const { mainId, mdId, smId } = await saveOptimizedPlayerImage(req.file, Player.collection.conn);
      existingPlayer.imagePath = `/api/players/image/${mainId}`;
      existingPlayer.imagePathMd = `/api/players/image/${mdId}`;
      existingPlayer.imagePathSm = `/api/players/image/${smId}`;
      existingPlayer.imageGridFsId = mainId;
      existingPlayer.imageGridFsIdMd = mdId;
      existingPlayer.imageGridFsIdSm = smId;
    }

    existingPlayer.name = req.body.name;
    existingPlayer.role = req.body.role;
    existingPlayer.description = req.body.description;
    existingPlayer.instagramUrl = req.body.instagramUrl || '';
    existingPlayer.youtubeUrl = req.body.youtubeUrl || '';
    existingPlayer.liveUrl = req.body.liveUrl || '';
    existingPlayer.rank = req.body.rank ? Number(req.body.rank) : null;

    const updatedPlayer = await existingPlayer.save();

    res.json({ success: true, data: toClientPlayer(updatedPlayer) });
    sseHub.broadcast('players');
  } catch (error) {
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

    await deletePlayerImages(player);
    await PlayerAccount.deleteOne({ playerId: player._id });

    res.json({ success: true, message: 'Player deleted' });
    sseHub.broadcast('players');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
