const express = require('express');
const Achievement = require('../models/Achievement');
const sseHub = require('../utils/sseHub');
const { authenticateToken, authorizePermissions } = require('../middleware/auth');

const router = express.Router();

const LIQUIPEDIA_API_URL =
  'https://liquipedia.net/freefire/api.php?action=parse&page=TSG_Army/Results&prop=text&format=json';

const decodeHtmlEntities = (value) =>
  value
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#95;/g, '_')
    .replace(/&#160;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();

const stripHtml = (html) => decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

const parseAchievementRows = (pageHtml) => {
  const detailedResultsStart = pageHtml.indexOf('id="Detailed_Results"');
  const detailedAwardsStart = pageHtml.indexOf('id="Detailed_Awards"');

  if (detailedResultsStart === -1 || detailedAwardsStart === -1 || detailedAwardsStart <= detailedResultsStart) {
    return [];
  }

  const resultsHtml = pageHtml.slice(detailedResultsStart, detailedAwardsStart);
  const rowMatches = resultsHtml.match(/<tr class="table2&#95;&#95;row--body[\s\S]*?<\/tr>/g) || [];

  return rowMatches
    .map((rowHtml) => {
      const cellMatches = rowHtml.match(/<td[\s\S]*?<\/td>/g) || [];
      if (cellMatches.length < 5) {
        return null;
      }

      const date = stripHtml(cellMatches[0]);
      const placementTextMatch = rowHtml.match(/class="placement-text">([^<]+)</);
      const placement = placementTextMatch ? decodeHtmlEntities(placementTextMatch[1]) : stripHtml(cellMatches[1]);
      const tier = stripHtml(cellMatches[2]);
      const tournament = stripHtml(cellMatches[4]);

      if (!date || !placement || !tournament) {
        return null;
      }

      const summary = `${placement} - ${tournament} (${date})`;

      return {
        date,
        placement,
        tier,
        tournament,
        summary,
      };
    })
    .filter(Boolean)
    .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime());
};

const buildSummary = (entry) => {
  const placement = (entry.placement || '').trim();
  const tournament = (entry.tournament || '').trim();
  const date = (entry.date || '').trim();

  if (!placement || !tournament) {
    return '';
  }

  const datePart = date ? ` (${date})` : '';
  return `${placement} - ${tournament}${datePart}`;
};

const dateSortValue = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toClientAchievement = (achievement) => {
  const normalized = {
    _id: achievement._id,
    date: achievement.date || '-',
    placement: achievement.placement || '-',
    tier: achievement.tier || '',
    tournament: achievement.tournament || '-',
    summary: achievement.summary || buildSummary(achievement),
    createdAt: achievement.createdAt,
    updatedAt: achievement.updatedAt,
  };

  return normalized;
};

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const storedAchievements = await Achievement.find().sort({ createdAt: -1 });

    if (storedAchievements.length > 0) {
      const normalizedRows = storedAchievements
        .map(toClientAchievement)
        .sort((first, second) => dateSortValue(second.date) - dateSortValue(first.date));

      const total = normalizedRows.length;
      const start = (page - 1) * limit;
      const pagedRows = normalizedRows.slice(start, start + limit);

      return res.json({
        success: true,
        source: 'admin',
        data: pagedRows,
        summaries: normalizedRows.map((row) => row.summary).filter(Boolean),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    }

    const response = await fetch(LIQUIPEDIA_API_URL, {
      headers: {
        'User-Agent': 'tsgarmyweb/1.0 (achievements fetch)',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, message: 'Failed to fetch achievements source' });
    }

    const payload = await response.json();
    const pageHtml = payload?.parse?.text?.['*'] || '';

    if (!pageHtml) {
      return res.status(502).json({ success: false, message: 'Achievements source returned no content' });
    }

    const rows = parseAchievementRows(pageHtml);
    const topRows = rows.slice(0, 50);

    if (topRows.length > 0) {
      const createdRows = await Achievement.insertMany(
        topRows.map((row) => ({
          date: row.date,
          placement: row.placement,
          tier: row.tier || '',
          tournament: row.tournament,
          summary: buildSummary(row),
        }))
      );

      const normalizedRows = createdRows
        .map(toClientAchievement)
        .sort((first, second) => dateSortValue(second.date) - dateSortValue(first.date));

      return res.json({
        success: true,
        source: 'admin',
        sourceUrl: 'https://liquipedia.net/freefire/TSG_Army/Results',
        data: normalizedRows.slice(0, limit),
        summaries: normalizedRows.map((row) => row.summary).filter(Boolean),
        pagination: {
          page,
          limit,
          total: normalizedRows.length,
          totalPages: Math.max(1, Math.ceil(normalizedRows.length / limit)),
        },
      });
    }

    res.json({
      success: true,
      source: 'empty',
      sourceUrl: 'https://liquipedia.net/freefire/TSG_Army/Results',
      data: topRows,
      summaries: topRows.map((row) => row.summary),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', authenticateToken, authorizePermissions('achievements'), async (req, res) => {
  try {
    const placement = (req.body.placement || '').trim();
    const tournament = (req.body.tournament || '').trim();

    if (!placement || !tournament) {
      return res.status(400).json({ success: false, message: 'Placement and tournament are required' });
    }

    const payload = {
      date: (req.body.date || '').trim(),
      placement,
      tier: (req.body.tier || '').trim(),
      tournament,
    };

    payload.summary = buildSummary(payload);

    const created = await Achievement.create(payload);
    res.status(201).json({ success: true, data: toClientAchievement(created) });
    sseHub.broadcast('achievements');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', authenticateToken, authorizePermissions('achievements'), async (req, res) => {
  try {
    const placement = (req.body.placement || '').trim();
    const tournament = (req.body.tournament || '').trim();

    if (!placement || !tournament) {
      return res.status(400).json({ success: false, message: 'Placement and tournament are required' });
    }

    const payload = {
      date: (req.body.date || '').trim(),
      placement,
      tier: (req.body.tier || '').trim(),
      tournament,
    };

    payload.summary = buildSummary(payload);

    const updated = await Achievement.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Achievement not found' });
    }

    res.json({ success: true, data: toClientAchievement(updated) });
    sseHub.broadcast('achievements');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', authenticateToken, authorizePermissions('achievements'), async (req, res) => {
  try {
    const deleted = await Achievement.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Achievement not found' });
    }

    res.json({ success: true, message: 'Achievement deleted' });
    sseHub.broadcast('achievements');
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
