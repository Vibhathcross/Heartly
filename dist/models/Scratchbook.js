import mongoose, { Schema } from 'mongoose';
const CanvasElementSchema = new Schema({
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
}, { _id: false });
const ScratchbookSchema = new Schema({
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
}, {
    timestamps: true,
});
ScratchbookSchema.index({ spaceId: 1, updatedAt: -1 });
export const Scratchbook = mongoose.model('Scratchbook', ScratchbookSchema);
