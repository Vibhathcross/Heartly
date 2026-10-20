import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISpaceMember {
  userId: Types.ObjectId;
  displayName: string;
  joinedAt: Date;
}

export interface IMagicWord {
  _id?: Types.ObjectId;
  phrase: string;
  effect: 'hearts' | 'petals' | 'stars' | 'fireworks';
  createdBy?: Types.ObjectId;
  createdByName?: string;
  createdAt?: Date;
}

export interface ICoupleSpace extends Document {
  _id: Types.ObjectId;
  spaceName: string;
  masterPasswordHash: string; // Required when opening the app / accessing the space
  spaceSalt: string;          // Cryptographic salt for client-side AES derivation
  pairingCode: string | null; // 6-digit code for the second partner to join
  pairingExpiresAt: Date | null;
  isReserved: boolean;        // True once both partners have joined (permanently reserved for those two only)
  hasInitializedDreams?: boolean; // Set to true once dreams have been initialized so empty bucket lists are not repeatedly re-seeded
  members: ISpaceMember[];
  chatWallpaper?: {
    type: 'preset' | 'custom' | 'none';
    value: string; // URL, gradient, or preset name
    opacity?: number;
    updatedAt?: Date;
  };
  magicWords?: IMagicWord[];
  createdAt: Date;
  updatedAt: Date;
}

const CoupleSpaceSchema = new Schema<ICoupleSpace>(
  {
    spaceName: {
      type: String,
      required: true,
      trim: true,
    },
    masterPasswordHash: {
      type: String,
      required: true,
    },
    spaceSalt: {
      type: String,
      required: true,
    },
    pairingCode: {
      type: String,
      default: null,
      index: true,
    },
    pairingExpiresAt: {
      type: Date,
      default: null,
    },
    isReserved: {
      type: Boolean,
      default: false,
    },
    hasInitializedDreams: {
      type: Boolean,
      default: false,
    },
    members: {
      type: [
        {
          userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          displayName: {
            type: String,
            required: true,
          },
          joinedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      validate: [
        (members: ISpaceMember[]) => members.length <= 2,
        'A Heartly Couple Space cannot exceed 2 members.',
      ],
    },
    chatWallpaper: {
      type: {
        type: String,
        enum: ['preset', 'custom', 'none'],
        default: 'none',
      },
      value: {
        type: String,
        default: '',
      },
      opacity: {
        type: Number,
        default: 0.22,
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
    magicWords: [
      {
        phrase: {
          type: String,
          required: true,
          trim: true,
        },
        effect: {
          type: String,
          enum: ['hearts', 'petals', 'stars', 'fireworks'],
          default: 'hearts',
        },
        createdBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        createdByName: {
          type: String,
          default: '',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const CoupleSpace = mongoose.model<ICoupleSpace>('CoupleSpace', CoupleSpaceSchema);
