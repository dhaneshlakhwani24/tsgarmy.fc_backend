const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      default: '',
      trim: true,
    },
    placement: {
      type: String,
      required: true,
      trim: true,
    },
    tier: {
      type: String,
      default: '',
      trim: true,
    },
    tournament: {
      type: String,
      required: true,
      trim: true,
    },
    prize: {
      type: String,
      default: '-',
      trim: true,
    },
    summary: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Achievement', achievementSchema);
