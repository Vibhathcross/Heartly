import mongoose, { Schema } from 'mongoose';
const UserSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    spaceId: {
        type: Schema.Types.ObjectId,
        ref: 'CoupleSpace',
        default: null,
    },
    avatarUrl: {
        type: String,
        default: '',
    },
    lastActive: {
        type: Date,
        default: Date.now,
    },
    isOnline: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});
export const User = mongoose.model('User', UserSchema);
