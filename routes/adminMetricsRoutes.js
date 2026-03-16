const express = require('express');
const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Player = require('../models/Player');
const Achievement = require('../models/Achievement');
const { getMetricsSnapshot } = require('../utils/metricsStore');
const { authenticateToken, authorizePermissions } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizePermissions('dashboard'), async (_req, res) => {
  try {
    const requestMetrics = getMetricsSnapshot();

    const [schedulesCount, playersCount, achievementsCount] = await Promise.all([
      Schedule.estimatedDocumentCount(),
      Player.estimatedDocumentCount(),
      Achievement.estimatedDocumentCount(),
    ]);

    const mongoConnection = mongoose.connection;
    const mongoConnected = mongoConnection.readyState === 1;

    let dbStats = {
      dataSize: 0,
      storageSize: 0,
      collections: 0,
      objects: 0,
    };

    if (mongoConnected && mongoConnection.db) {
      try {
        const stats = await mongoConnection.db.stats();
        dbStats = {
          dataSize: stats.dataSize || 0,
          storageSize: stats.storageSize || 0,
          collections: stats.collections || 0,
          objects: stats.objects || 0,
        };
      } catch {
        dbStats = {
          dataSize: 0,
          storageSize: 0,
          collections: 0,
          objects: schedulesCount + playersCount + achievementsCount,
        };
      }
    }

    res.json({
      success: true,
      data: {
        web: requestMetrics,
        database: {
          connected: mongoConnected,
          connectionState: mongoConnection.readyState,
          collections: {
            schedules: schedulesCount,
            players: playersCount,
            achievements: achievementsCount,
          },
          totals: {
            records: schedulesCount + playersCount + achievementsCount,
            dataSizeBytes: dbStats.dataSize,
            storageSizeBytes: dbStats.storageSize,
            collectionsCount: dbStats.collections,
            objectsCount: dbStats.objects,
          },
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
