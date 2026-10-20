import mongoose, { Document, Schema } from 'mongoose';

export interface IScheduledPopup extends Document {
  spaceId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;
  creatorName: string;
  targetUserId: mongoose.Types.ObjectId;
  targetDate: string; // Format: "YYYY-MM-DD"
  title: string;
  message: string;
  theme: 'birthday' | 'anniversary' | 'love' | 'celebration' | 'custom';
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  hasConfetti: boolean;
  active: boolean;
  createdAt: Date;
}

const ScheduledPopupSchema = new Schema<IScheduledPopup>(
  {
    spaceId: { type: Schema.Types.ObjectId, ref: 'CoupleSpace', required: true, index: true },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    creatorName: { type: String, required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetDate: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    theme: {
      type: String,
      enum: ['birthday', 'anniversary', 'love', 'celebration', 'custom'],
      default: 'birthday',
    },
    imageUrl: { type: String, default: null },
    audioUrl: { type: String, default: null },
    audioDuration: { type: Number, default: 0 },
    hasConfetti: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export const ScheduledPopup = mongoose.model<IScheduledPopup>(
  'ScheduledPopup',
  ScheduledPopupSchema
);
