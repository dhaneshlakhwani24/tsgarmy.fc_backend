const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    instagramUrl: {
      type: String,
      default: '',
      trim: true,
    },
    youtubeUrl: {
      type: String,
      default: '',
      trim: true,
    },
    imagePath: {
      type: String,
      required: true,
      trim: true,
    },
    isLive: {
      type: Boolean,
      default: false,
    },
    liveUrl: {
      type: String,
      default: '',
      trim: true,
    },
    rank: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Player', playerSchema);
