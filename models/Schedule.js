const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    tournamentName: {
      type: String,
      default: '',
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    organizers: {
      type: [String],
      default: [],
    },
    opponent: {
      type: String,
      default: '',
      trim: true,
    },
    livestreamUrl: {
      type: String,
      default: '',
      trim: true,
    },
    liveUpdatesPath: {
      type: String,
      default: '',
      trim: true,
    },
    playing4: {
      type: [String],
      default: [],
    },
    liveUpdates: {
      type: [
        {
          matchNumber: {
            type: Number,
            required: true,
            min: 1,
          },
          mapName: {
            type: String,
            default: '',
            trim: true,
          },
          placement: {
            type: String,
            default: '',
            trim: true,
          },
          kills: {
            type: Number,
            default: 0,
            min: 0,
          },
          points: {
            type: Number,
            default: 0,
            min: 0,
          },
          totalPoints: {
            type: Number,
            default: 0,
            min: 0,
          },
          notes: {
            type: String,
            default: '',
            trim: true,
          },
          updatedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
    finalPointTable: {
      filePath: {
        type: String,
        default: '',
        trim: true,
      },
      fileName: {
        type: String,
        default: '',
        trim: true,
      },
      uploadedAt: {
        type: Date,
        default: null,
      },
    },
    eventDate: {
      type: String,
      required: true,
    },
    eventTime: {
      type: String,
      required: true,
    },
    tournament: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['upcoming', 'ongoing', 'finished', 'completed', 'postponed', 'scheduled'],
      default: 'upcoming',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Schedule', scheduleSchema);
