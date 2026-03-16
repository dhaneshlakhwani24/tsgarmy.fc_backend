const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Schedule = require('../models/Schedule');
const sseHub = require('../utils/sseHub');
const { authenticateToken, authorizePermissions } = require('../middleware/auth');

const router = express.Router();

const finalPointTableDirectory = path.join(__dirname, '..', 'uploads', 'point-tables');
fs.mkdirSync(finalPointTableDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, finalPointTableDirectory),
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      const safeExt = extension || '.bin';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    },
  }),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

const pad2 = (value) => String(value).padStart(2, '0');

const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const normalizeArrayField = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  return String(value)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseEventDateTime = (eventDate, eventTime) => {
  if (!eventDate || !eventTime) {
    return null;
  }

  const dateTime = new Date(`${eventDate}T${eventTime}:00`);
  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return dateTime;
};

const removeLocalFile = (filePath) => {
  if (!filePath || !filePath.startsWith('/uploads/point-tables/')) {
    return;
  }

  const filename = filePath.replace('/uploads/point-tables/', '');
  const absolutePath = path.join(finalPointTableDirectory, filename);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

const getComputedStatus = (schedule, now = new Date()) => {
  if (schedule.status === 'completed' || schedule.finalPointTable?.filePath) {
    return 'completed';
  }

  const todayKey = toDateKey(now);
  const eventKey = toDateKey(schedule.eventDate);
  const eventDateTime = parseEventDateTime(schedule.eventDate, schedule.eventTime);

  if (!eventKey || !eventDateTime) {
    return 'scheduled';
  }

  if (eventKey > todayKey) {
    return 'scheduled';
  }

  if (eventKey < todayKey) {
    return 'expired';
  }

  if (now.getTime() < eventDateTime.getTime()) {
    return 'upcoming';
  }

  return 'ongoing';
};

const toClientSchedule = (schedule, now = new Date()) => {
  const computedStatus = getComputedStatus(schedule, now);

  return {
    _id: schedule._id,
    title: schedule.title || schedule.tournamentName || '',
    tournamentName: schedule.tournamentName || schedule.title || '',
    organizers: schedule.organizers || [],
    opponent: schedule.opponent || '',
    livestreamUrl: schedule.livestreamUrl || '',
    liveUpdatesPath: computedStatus === 'ongoing' ? schedule.liveUpdatesPath || '' : '',
    playing4: schedule.playing4 || [],
    liveUpdates: computedStatus === 'ongoing' ? schedule.liveUpdates || [] : [],
    finalPointTable: schedule.finalPointTable?.filePath
      ? {
          filePath: schedule.finalPointTable.filePath,
          fileName: schedule.finalPointTable.fileName || 'final-point-table',
          uploadedAt: schedule.finalPointTable.uploadedAt,
        }
      : null,
    eventDate: schedule.eventDate,
    eventTime: schedule.eventTime,
    status: computedStatus,
    rawStatus: schedule.status,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
};

const createLiveUpdatesPath = async () => {
  const schedules = await Schedule.find({ liveUpdatesPath: { $regex: '^/liveupdates/' } }).select('liveUpdatesPath');
  const numbers = schedules
    .map((item) => {
      const match = String(item.liveUpdatesPath || '').match(/^\/liveupdates\/(\d+)$/);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `/liveupdates/${pad2(next)}`;
};

router.get('/', async (_req, res) => {
  try {
    const now = new Date();
    const schedules = await Schedule.find().sort({ createdAt: -1 });
    const rows = schedules.map((item) => toClientSchedule(item, now));

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/liveupdates/:slug', async (req, res) => {
  try {
    const pathValue = `/liveupdates/${req.params.slug}`;
    const schedule = await Schedule.findOne({ liveUpdatesPath: pathValue });

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Live updates not found' });
    }

    const output = toClientSchedule(schedule, new Date());
    if (output.status !== 'ongoing') {
      return res.status(404).json({ success: false, message: 'Live updates not available for this tournament' });
    }

    return res.json({ success: true, data: output });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', authenticateToken, authorizePermissions('schedule'), async (req, res) => {
  try {
    const tournamentName = String(req.body.tournamentName || req.body.title || '').trim();
    if (!tournamentName) {
      return res.status(400).json({ success: false, message: 'Tournament name is required' });
    }

    if (!req.body.eventDate || !req.body.eventTime) {
      return res.status(400).json({ success: false, message: 'Date and time are required' });
    }

    const liveUpdatesPath = await createLiveUpdatesPath();
    const schedule = await Schedule.create({
      title: tournamentName,
      tournamentName,
      organizers: normalizeArrayField(req.body.organizers || req.body.to || req.body.toName),
      opponent: String(req.body.opponent || '').trim(),
      livestreamUrl: String(req.body.livestreamUrl || '').trim(),
      playing4: normalizeArrayField(req.body.playing4),
      eventDate: String(req.body.eventDate || '').trim(),
      eventTime: String(req.body.eventTime || '').trim(),
      tournament: String(req.body.tournament || '').trim(),
      status: 'scheduled',
      liveUpdatesPath,
    });

    res.status(201).json({ success: true, data: toClientSchedule(schedule, new Date()) });
    sseHub.broadcast('schedules');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', authenticateToken, authorizePermissions('schedule'), async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    const tournamentName = String(req.body.tournamentName || req.body.title || schedule.tournamentName || schedule.title || '').trim();
    if (!tournamentName) {
      return res.status(400).json({ success: false, message: 'Tournament name is required' });
    }

    schedule.title = tournamentName;
    schedule.tournamentName = tournamentName;
    schedule.organizers = normalizeArrayField(req.body.organizers || req.body.to || req.body.toName);
    schedule.opponent = String(req.body.opponent || '').trim();
    schedule.livestreamUrl = String(req.body.livestreamUrl || '').trim();
    if (Object.prototype.hasOwnProperty.call(req.body, 'playing4')) {
      schedule.playing4 = normalizeArrayField(req.body.playing4);
    }
    schedule.eventDate = String(req.body.eventDate || '').trim();
    schedule.eventTime = String(req.body.eventTime || '').trim();
    schedule.tournament = String(req.body.tournament || '').trim();

    if (!schedule.liveUpdatesPath) {
      schedule.liveUpdatesPath = await createLiveUpdatesPath();
    }

    const updated = await schedule.save();

    res.json({ success: true, data: toClientSchedule(updated, new Date()) });
    sseHub.broadcast('schedules');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/:id/live-updates', authenticateToken, authorizePermissions('schedule'), async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    if (schedule.status === 'completed' || schedule.finalPointTable?.filePath) {
      return res.status(400).json({ success: false, message: 'Completed tournaments cannot receive live updates' });
    }

    const incomingRows = Array.isArray(req.body.liveUpdates) ? req.body.liveUpdates : [];
    schedule.playing4 = normalizeArrayField(req.body.playing4);
    schedule.liveUpdates = incomingRows
      .map((row, index) => ({
        matchNumber: Number(row.matchNumber || index + 1),
        mapName: String(row.mapName || '').trim(),
        placement: String(row.placement || '').trim(),
        kills: Number(row.kills || 0),
        points: Number(row.points || 0),
        totalPoints: Number(row.totalPoints || 0),
        notes: String(row.notes || '').trim(),
        updatedAt: new Date(),
      }))
      .sort((first, second) => first.matchNumber - second.matchNumber);

    if (!schedule.liveUpdatesPath) {
      schedule.liveUpdatesPath = await createLiveUpdatesPath();
    }

    const updated = await schedule.save();
    res.json({ success: true, data: toClientSchedule(updated, new Date()) });
    sseHub.broadcast('schedules');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/final-point-table', authenticateToken, authorizePermissions('schedule'), upload.single('file'), async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Final point table file is required' });
    }

    if (schedule.finalPointTable?.filePath) {
      removeLocalFile(schedule.finalPointTable.filePath);
    }

    schedule.finalPointTable = {
      filePath: `/uploads/point-tables/${req.file.filename}`,
      fileName: req.file.originalname,
      uploadedAt: new Date(),
    };

    schedule.status = 'completed';
    schedule.liveUpdates = [];
    schedule.liveUpdatesPath = '';

    const updated = await schedule.save();
    res.json({ success: true, data: toClientSchedule(updated, new Date()) });
    sseHub.broadcast('schedules');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', authenticateToken, authorizePermissions('schedule'), async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    if (schedule.finalPointTable?.filePath) {
      removeLocalFile(schedule.finalPointTable.filePath);
    }

    res.json({ success: true, message: 'Schedule deleted' });
    sseHub.broadcast('schedules');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
