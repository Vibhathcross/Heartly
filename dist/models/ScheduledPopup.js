import mongoose, { Schema } from 'mongoose';
const ScheduledPopupSchema = new Schema({
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
}, {
    timestamps: true,
});
export const ScheduledPopup = mongoose.model('ScheduledPopup', ScheduledPopupSchema);
