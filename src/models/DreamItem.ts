import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDreamItem extends Document {
  _id: Types.ObjectId;
  spaceId: Types.ObjectId;
  title: string;
  description: string;
  category: 'travel' | 'home' | 'experience' | 'growth' | 'romantic' | 'general';
  icon: string; // emoji or icon tag, e.g. '✈️', '🏡', '⛰️', '🌱', '💌', '🌅'
  color: 'pink' | 'blue' | 'yellow' | 'purple' | 'green' | 'peach';
  imageUrl?: string;
  targetDate?: string;
  targetDateFormatted?: string;
  authorType: 'You' | 'Her' | 'Both';
  createdBy: Types.ObjectId;
  createdByName: string;
  isCompleted: boolean;
  completedAt?: Date;
  isFavorite: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const DreamItemSchema = new Schema<IDreamItem>(
  {
    spaceId: {
      type: Schema.Types.ObjectId,
      ref: 'CoupleSpace',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      enum: ['travel', 'home', 'experience', 'growth', 'romantic', 'general'],
      default: 'romantic',
    },
    icon: {
      type: String,
      default: '💖',
    },
    color: {
      type: String,
      enum: ['pink', 'blue', 'yellow', 'purple', 'green', 'peach'],
      default: 'pink',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    targetDate: {
      type: String,
      default: '',
    },
    targetDateFormatted: {
      type: String,
      default: '',
    },
    authorType: {
      type: String,
      enum: ['You', 'Her', 'Both'],
      default: 'Both',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdByName: {
      type: String,
      required: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const DreamItem = mongoose.model<IDreamItem>('DreamItem', DreamItemSchema);
