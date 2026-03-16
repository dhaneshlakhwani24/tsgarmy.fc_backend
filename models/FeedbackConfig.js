const mongoose = require('mongoose');

const feedbackConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'global',
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    maxSubmissions: {
      type: Number,
      default: 0,
      min: 0,
    },
    acceptedSubmissions: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FeedbackConfig', feedbackConfigSchema);
