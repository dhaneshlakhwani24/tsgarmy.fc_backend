const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Player = require('../models/Player');
const PlayerAccount = require('../models/PlayerAccount');
const sseHub = require('../utils/sseHub');
const { authenticateToken, requireSuperAdmin, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const toSafeAccount = (accountDoc) => ({
  id: accountDoc._id,
  playerId: accountDoc.playerId,
  username: accountDoc.username,
  isActive: accountDoc.isActive,
  lastLoginAt: accountDoc.lastLoginAt,
  createdBy: accountDoc.createdBy || '',
  createdAt: accountDoc.createdAt,
  updatedAt: accountDoc.updatedAt,
});

const toSafePlayer = (playerDoc) => ({
  id: playerDoc._id,
  name: playerDoc.name,
  role: playerDoc.role,
  description: playerDoc.description,
  isLive: Boolean(playerDoc.isLive),
  liveUrl: playerDoc.liveUrl || '',
  imagePath: playerDoc.imagePath || '',
});

const buildPlayerToken = (accountDoc, playerDoc, sessionId) =>
  jwt.sign(
    {
      sub: String(accountDoc._id),
      pid: String(playerDoc._id),
      username: accountDoc.username,
      type: 'player',
      sid: sessionId,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );

const authenticatePlayerToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'player') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const account = await PlayerAccount.findById(payload.sub).populate('playerId');
    if (!account || !account.isActive || !account.playerId) {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }

    const tokenSessionId = String(payload.sid || '');
    const activeSessionId = String(account.currentSessionId || '');
    if (!tokenSessionId || !activeSessionId || tokenSessionId !== activeSessionId) {
      return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }

    req.playerAuth = {
      account,
      player: account.playerId,
      sessionId: tokenSessionId,
    };

    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

router.get('/accounts', authenticateToken, requireSuperAdmin, async (_req, res) => {
  try {
    const [players, accounts] = await Promise.all([
      Player.find().sort({ createdAt: -1 }),
      PlayerAccount.find().sort({ createdAt: -1 }),
    ]);

    const accountMap = new Map(accounts.map((account) => [String(account.playerId), account]));

    const rows = players.map((player) => {
      const account = accountMap.get(String(player._id));
      return {
        player: {
          id: player._id,
          name: player.name,
          role: player.role,
        },
        account: account ? toSafeAccount(account) : null,
      };
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/accounts', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const playerId = String(req.body.playerId || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    if (!playerId || !username || !password) {
      return res.status(400).json({ success: false, message: 'Player, username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    const duplicate = await PlayerAccount.findOne({ username, playerId: { $ne: player._id } });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let account = await PlayerAccount.findOne({ playerId: player._id });

    if (!account) {
      account = await PlayerAccount.create({
        playerId: player._id,
        username,
        passwordHash,
        isActive: true,
        currentSessionId: '',
        createdBy: req.auth.username,
      });
    } else {
      account.username = username;
      account.passwordHash = passwordHash;
      account.isActive = true;
      account.currentSessionId = '';
      await account.save();
    }

    return res.status(201).json({ success: true, data: toSafeAccount(account) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/accounts/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const account = await PlayerAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'isActive')) {
      account.isActive = Boolean(req.body.isActive);
      if (!account.isActive) {
        account.currentSessionId = '';
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'username')) {
      const username = String(req.body.username || '').trim().toLowerCase();
      if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
      }

      const duplicate = await PlayerAccount.findOne({ username, _id: { $ne: account._id } });
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'Username already exists' });
      }

      account.username = username;
    }

    if (req.body.password) {
      const password = String(req.body.password).trim();
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      account.passwordHash = await bcrypt.hash(password, 12);
      account.currentSessionId = '';
    }

    await account.save();

    return res.json({ success: true, data: toSafeAccount(account) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const account = await PlayerAccount.findOne({ username }).populate('playerId');
    if (!account || !account.isActive || !account.playerId) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const sessionId = crypto.randomUUID();
    account.currentSessionId = sessionId;
    account.lastLoginAt = new Date();
    await account.save();

    const token = buildPlayerToken(account, account.playerId, sessionId);

    return res.json({
      success: true,
      token,
      account: toSafeAccount(account),
      player: toSafePlayer(account.playerId),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/me', authenticatePlayerToken, async (req, res) => {
  return res.json({
    success: true,
    account: toSafeAccount(req.playerAuth.account),
    player: toSafePlayer(req.playerAuth.player),
  });
});

router.patch('/me', authenticatePlayerToken, async (req, res) => {
  try {
    const player = await Player.findById(req.playerAuth.player._id);
    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
      const description = String(req.body.description || '').trim();
      if (!description) {
        return res.status(400).json({ success: false, message: 'Description is required' });
      }
      player.description = description;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'isLive')) {
      player.isLive = Boolean(req.body.isLive);
      if (!player.isLive) {
        player.liveUrl = '';
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'liveUrl')) {
      player.liveUrl = String(req.body.liveUrl || '').trim();
      if (player.liveUrl) {
        player.isLive = true;
      }
    }

    await player.save();
    sseHub.broadcast('players');

    return res.json({ success: true, player: toSafePlayer(player) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/logout', authenticatePlayerToken, async (req, res) => {
  try {
    const account = await PlayerAccount.findById(req.playerAuth.account._id);
    if (account && account.currentSessionId === req.playerAuth.sessionId) {
      account.currentSessionId = '';
      await account.save();
    }

    return res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
