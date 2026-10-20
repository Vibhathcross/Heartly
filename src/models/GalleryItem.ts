import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IComment {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  text: string;
  createdAt: Date;
}

export interface IReaction {
  authorId: Types.ObjectId;
  reactionType: string; // '❤️', '🔥', '🥰', '✨'
  createdAt: Date;
}

export interface IGalleryItem extends Document {
  _id: Types.ObjectId;
  spaceId: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  gridFSFileId: Types.ObjectId; // Stored natively in MongoDB GridFS
  filename: string;
  contentType: string;
  size: number;
  caption: string;
  genre?: string;
  memoryDate: Date; // The date of the memory/photo
  location?: string;
  tags: string[];
  comments: IComment[];
  reactions: IReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>({
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  text: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

const ReactionSchema = new Schema<IReaction>({
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reactionType: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const GalleryItemSchema = new Schema<IGalleryItem>(
  {
    spaceId: {
      type: Schema.Types.ObjectId,
      ref: 'CoupleSpace',
      required: true,
      index: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    gridFSFileId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    caption: {
      type: String,
      default: '',
      trim: true,
    },
    genre: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    memoryDate: {
      type: Date,
      required: true,
      index: true,
    },
    location: {
      type: String,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    comments: {
      type: [CommentSchema],
      default: [],
    },
    reactions: {
      type: [ReactionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const GalleryItem = mongoose.model<IGalleryItem>('GalleryItem', GalleryItemSchema);
