import mongoose, { Schema } from 'mongoose';
const CoupleSpaceSchema = new Schema({
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
            (members) => members.length <= 2,
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
}, {
    timestamps: true,
});
export const CoupleSpace = mongoose.model('CoupleSpace', CoupleSpaceSchema);
