import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICanvasElement {
  id: string;
  type: 'stroke' | 'sticky' | 'text' | 'sticker' | 'photo_cutout' | 'polaroid' | 'voice';
  authorId: string;
  authorName: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  color?: string;
  content?: string;     // Text content for stickies or notes
  points?: number[];    // [x1, y1, x2, y2, ...] for freehand drawings
  strokeWidth?: number;
  brushType?: 'pen' | 'highlighter' | 'calligraphy' | 'eraser';
  opacity?: number;
  mediaUrl?: string;    // Image URL for polaroids
  audioUrl?: string;    // Voice note audio stream URL
  duration?: number;    // Voice clip duration in seconds
  zIndex: number;
  updatedAt: number;    // Monotonic timestamp for deterministic conflict resolution
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  bgColor?: string;
  borderEnabled?: boolean;
  borderColor?: string;
  outlineEnabled?: boolean;
  outlineColor?: string;
}

export interface IScratchbook extends Document {
  _id: Types.ObjectId;
  spaceId: Types.ObjectId;
  title: string;
  backgroundColor: string;
  elements: ICanvasElement[];
  crdtState?: Buffer;     // Binary CRDT / Yjs state vector for advanced conflict-free merges
  version: number;        // Global vector clock for data integrity
  lastEditedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CanvasElementSchema = new Schema<ICanvasElement>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['stroke', 'sticky', 'text', 'sticker', 'photo_cutout', 'polaroid', 'voice'],
      required: true,
    },
    authorId: { type: String, required: true },
    authorName: { type: String, required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number },
    height: { type: Number },
    rotation: { type: Number, default: 0 },
    color: { type: String },
    content: { type: String, default: '' },
    points: { type: [Number], default: [] },
    strokeWidth: { type: Number, default: 3 },
    brushType: { type: String, default: 'pen' },
    opacity: { type: Number, default: 1 },
    mediaUrl: { type: String },
    audioUrl: { type: String },
    duration: { type: Number },
    zIndex: { type: Number, default: 1 },
    updatedAt: { type: Number, required: true },
    fontSize: { type: Number },
    fontFamily: { type: String },
    textColor: { type: String },
    bgColor: { type: String },
    borderEnabled: { type: Boolean },
    borderColor: { type: String },
    outlineEnabled: { type: Boolean },
    outlineColor: { type: String },
  },
  { _id: false }
);

const ScratchbookSchema = new Schema<IScratchbook>(
  {
    spaceId: {
      type: Schema.Types.ObjectId,
      ref: 'CoupleSpace',
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'Our Shared Scratchbook',
      trim: true,
    },
    backgroundColor: {
      type: String,
      default: '#ffffff',
    },
    elements: {
      type: [CanvasElementSchema],
      default: [],
    },
    crdtState: {
      type: Buffer,
    },
    version: {
      type: Number,
      default: 1,
    },
    lastEditedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

ScratchbookSchema.index({ spaceId: 1, updatedAt: -1 });

export const Scratchbook = mongoose.model<IScratchbook>('Scratchbook', ScratchbookSchema);

