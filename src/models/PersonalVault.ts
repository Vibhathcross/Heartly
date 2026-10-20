import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMomentClass {
  id: string;
  name: string;
  emoji?: string;
  createdAt: number;
}

export interface IMomentItem {
  id: string;
  title: string;
  date?: string;
  location?: string;
  classId?: string | null;
  description: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface IPersonalDiary {
  id: string;
  name: string;
  content: string;
  mood?: string;
  createdAt: number;
  updatedAt: number;
}

export interface IPersonalVault extends Document {
  spaceId: Types.ObjectId;
  userId: Types.ObjectId;
  diaries: IPersonalDiary[];
  moments: IMomentItem[];
  momentClasses: IMomentClass[];
  currentDiaryId?: string | null;
  scratchpad?: string;
  mood?: { emoji: string; text: string; time: number };
  updatedAt: Date;
}

const MomentClassSchema = new Schema<IMomentClass>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  emoji: { type: String, default: '💖' },
  createdAt: { type: Number, default: Date.now },
}, { _id: false });

const MomentItemSchema = new Schema<IMomentItem>({
  id: { type: String, required: true },
  title: { type: String, required: true },
  date: { type: String },
  location: { type: String },
  classId: { type: String, default: null },
  description: { type: String, required: true },
  imageUrl: { type: String, default: null },
  audioUrl: { type: String, default: null },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
}, { _id: false });

const PersonalDiarySchema = new Schema<IPersonalDiary>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  content: { type: String, default: '' },
  mood: { type: String, default: '🌸 Peaceful' },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
}, { _id: false });

const PersonalVaultSchema = new Schema<IPersonalVault>({
  spaceId: { type: Schema.Types.ObjectId, ref: 'CoupleSpace', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  diaries: { type: [PersonalDiarySchema], default: [] },
  moments: { type: [MomentItemSchema], default: [] },
  momentClasses: { type: [MomentClassSchema], default: [] },
  currentDiaryId: { type: String, default: null },
  scratchpad: { type: String, default: '' },
  mood: {
    emoji: { type: String, default: '🌸' },
    text: { type: String, default: 'Peaceful & Content' },
    time: { type: Number, default: Date.now },
  },
  updatedAt: { type: Date, default: Date.now },
});

PersonalVaultSchema.index({ spaceId: 1, userId: 1 }, { unique: true });

export const PersonalVault = mongoose.model<IPersonalVault>('PersonalVault', PersonalVaultSchema);
