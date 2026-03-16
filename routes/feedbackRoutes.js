const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const Feedback = require('../models/Feedback');
const FeedbackConfig = require('../models/FeedbackConfig');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

const feedbackUploadDirectory = path.join(__dirname, '..', 'uploads', 'feedback');
fs.mkdirSync(feedbackUploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      return callback(new Error('Only image files are allowed'));
    }
    return callback(null, true);
  },
});

const defaultConfig = {
  key: 'global',
  enabled: false,
  maxSubmissions: 0,
  acceptedSubmissions: 0,
};

const countWords = (value) =>
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const getOrCreateConfig = async () => {
  const config = await FeedbackConfig.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: defaultConfig },
    { new: true, upsert: true }
  );

  return config;
};

const toPublicStatus = (config) => {
  const max = Number(config.maxSubmissions || 0);
  const accepted = Number(config.acceptedSubmissions || 0);
  const remaining = Math.max(0, max - accepted);
  const isOpen = Boolean(config.enabled && max > 0 && remaining > 0);

  return {
    enabled: isOpen,
  };
};

const toAdminConfig = (config) => ({
  enabled: Boolean(config.enabled),
  maxSubmissions: Number(config.maxSubmissions || 0),
  acceptedSubmissions: Number(config.acceptedSubmissions || 0),
  remainingSubmissions: Math.max(0, Number(config.maxSubmissions || 0) - Number(config.acceptedSubmissions || 0)),
  updatedAt: config.updatedAt,
});

const saveFeedbackAttachment = async (file) => {
  const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const absolutePath = path.join(feedbackUploadDirectory, safeName);

  await sharp(file.buffer)
    .rotate()
    .resize(1400, 1400, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80, effort: 4 })
    .toFile(absolutePath);

  return {
    attachmentPath: `/uploads/feedback/${safeName}`,
    attachmentName: file.originalname || 'feedback-image',
  };
};

const removeAttachment = (attachmentPath) => {
  if (!attachmentPath || !attachmentPath.startsWith('/uploads/feedback/')) {
    return;
  }

  const filename = attachmentPath.replace('/uploads/feedback/', '');
  const absolutePath = path.join(feedbackUploadDirectory, filename);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

router.get('/public-status', async (_req, res) => {
  try {
    const config = await getOrCreateConfig();
    return res.json({ success: true, data: toPublicStatus(config) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/submit', upload.single('file'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const instagramUsername = String(req.body.instagramUsername || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const description = String(req.body.description || '').trim();

    if (!name || !email || !description) {
      return res.status(400).json({ success: false, message: 'Name, email and description are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }

    if (countWords(description) > 350) {
      return res.status(400).json({ success: false, message: 'Description cannot exceed 350 words' });
    }

    const updatedConfig = await FeedbackConfig.findOneAndUpdate(
      {
        key: 'global',
        enabled: true,
        $expr: { $lt: ['$acceptedSubmissions', '$maxSubmissions'] },
      },
      { $inc: { acceptedSubmissions: 1 } },
      {
        new: true,
        upsert: false,
      }
    );

    if (!updatedConfig) {
      return res.status(400).json({ success: false, message: 'Feedback is currently closed' });
    }

    let attachmentPath = '';
    let attachmentName = '';

    if (req.file) {
      const savedAttachment = await saveFeedbackAttachment(req.file);
      attachmentPath = savedAttachment.attachmentPath;
      attachmentName = savedAttachment.attachmentName;
    }

    await Feedback.create({
      name,
      instagramUsername,
      email,
      description,
      attachmentPath,
      attachmentName,
      submittedAt: new Date(),
    });

    const latestStatus = toPublicStatus(updatedConfig);
    if (!latestStatus.enabled && updatedConfig.enabled) {
      updatedConfig.enabled = false;
      await updatedConfig.save();
    }

    return res.status(201).json({ success: true, message: 'Thanks for submitting. We will get back to you soon.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/config', authenticateToken, requireSuperAdmin, async (_req, res) => {
  try {
    const config = await getOrCreateConfig();
    return res.json({ success: true, data: toAdminConfig(config) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/config', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const maxSubmissions = Math.max(0, Math.floor(Number(req.body.maxSubmissions || 0)));

    if (enabled && maxSubmissions <= 0) {
      return res.status(400).json({ success: false, message: 'Max submissions must be greater than 0 when enabling feedback' });
    }

    const config = await getOrCreateConfig();
    const quotaChanged = maxSubmissions !== Number(config.maxSubmissions || 0);
    const reopening = enabled && !config.enabled;

    if (enabled) {
      config.enabled = true;
      config.maxSubmissions = maxSubmissions;
      if (reopening || quotaChanged) {
        config.acceptedSubmissions = 0;
      }
    } else {
      config.enabled = false;
      config.maxSubmissions = maxSubmissions;
    }

    await config.save();

    return res.json({ success: true, data: toAdminConfig(config) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', authenticateToken, async (_req, res) => {
  try {
    const feedbackRows = await Feedback.find().sort({ createdAt: -1 });
    return res.json({ success: true, data: feedbackRows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await Feedback.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Feedback not found' });
    }

    if (deleted.attachmentPath) {
      removeAttachment(deleted.attachmentPath);
    }

    return res.json({ success: true, message: 'Feedback deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
