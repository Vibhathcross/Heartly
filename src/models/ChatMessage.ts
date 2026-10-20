import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReaction {
  userId: Types.ObjectId;
  userName: string;
  emoji: string;
  createdAt?: Date;
}

export interface IReplyTo {
  messageId: Types.ObjectId;
  senderName: string;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
}

export interface IChatMessage extends Document {
  _id: Types.ObjectId;
  spaceId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderName: string;
  text?: string;
  imageUrl?: string;
  imageFileId?: Types.ObjectId;
  audioUrl?: string;
  audioFileId?: Types.ObjectId;
  audioDuration?: number;
  reactions?: IReaction[];
  replyTo?: IReplyTo;
  isPinned?: boolean;
  pinnedAt?: Date;
  pinnedBy?: Types.ObjectId;
  isDeleted?: boolean;
  deletedFor?: Types.ObjectId[];
  status?: 'sent' | 'read';
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    spaceId: {
      type: Schema.Types.ObjectId,
      ref: 'CoupleSpace',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    imageFileId: {
      type: Schema.Types.ObjectId,
    },
    audioUrl: {
      type: String,
      default: '',
    },
    audioFileId: {
      type: Schema.Types.ObjectId,
    },
    audioDuration: {
      type: Number,
      default: 0,
    },
    reactions: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        userName: {
          type: String,
          required: true,
        },
        emoji: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    replyTo: {
      messageId: {
        type: Schema.Types.ObjectId,
        ref: 'ChatMessage',
      },
      senderName: {
        type: String,
      },
      text: {
        type: String,
        default: '',
      },
      imageUrl: {
        type: String,
        default: '',
      },
      audioUrl: {
        type: String,
        default: '',
      },
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    pinnedAt: {
      type: Date,
    },
    pinnedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    status: {
      type: String,
      enum: ['sent', 'read'],
      default: 'sent',
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);

