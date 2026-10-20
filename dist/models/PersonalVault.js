import mongoose, { Schema } from 'mongoose';
const MomentClassSchema = new Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    emoji: { type: String, default: '💖' },
    createdAt: { type: Number, default: Date.now },
}, { _id: false });
const MomentItemSchema = new Schema({
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
const PersonalDiarySchema = new Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    content: { type: String, default: '' },
    mood: { type: String, default: '🌸 Peaceful' },
    createdAt: { type: Number, default: Date.now },
    updatedAt: { type: Number, default: Date.now },
}, { _id: false });
const PersonalVaultSchema = new Schema({
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
export const PersonalVault = mongoose.model('PersonalVault', PersonalVaultSchema);
