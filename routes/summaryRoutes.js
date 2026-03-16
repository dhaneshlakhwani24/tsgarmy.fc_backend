const express = require('express');
const Achievement = require('../models/Achievement');
const Schedule = require('../models/Schedule');

const router = express.Router();

const dateSortValue = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getScheduleStatus = (schedule, now = new Date()) => {
  if (schedule.status === 'completed' || schedule.finalPointTable?.filePath) {
    return 'completed';
  }

  const eventKey = toDateKey(schedule.eventDate);
  const todayKey = toDateKey(now);
  if (!eventKey) return 'scheduled';
  if (eventKey > todayKey) return 'scheduled';
  if (eventKey < todayKey) return 'expired';

  const eventDateTime = new Date(`${schedule.eventDate}T${schedule.eventTime || '00:00'}:00`);
  if (Number.isNaN(eventDateTime.getTime())) return 'scheduled';

  return now.getTime() < eventDateTime.getTime() ? 'upcoming' : 'ongoing';
};

router.get('/home', async (_req, res) => {
  try {
    const [achievements, schedules] = await Promise.all([
      Achievement.find().sort({ createdAt: -1 }).limit(40),
      Schedule.find().sort({ createdAt: -1 }).limit(40),
    ]);

    const topAchievements = achievements
      .map((item) => ({
        id: item._id,
        date: item.date || '-',
        placement: item.placement || '-',
        tournament: item.tournament || '-',
      }))
      .sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date))
      .slice(0, 10);

    const now = new Date();
    const todaysSchedule = schedules
      .map((item) => ({
        id: item._id,
        tournamentName: item.tournamentName || item.title || '',
        eventDate: item.eventDate || '',
        eventTime: item.eventTime || '',
        status: getScheduleStatus(item, now),
      }))
      .filter((item) => item.status === 'ongoing' || item.status === 'upcoming')
      .slice(0, 8);

    res.json({
      success: true,
      data: {
        topAchievements,
        todaysSchedule,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
