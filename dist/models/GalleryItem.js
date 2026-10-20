import mongoose, { Schema } from 'mongoose';
const CommentSchema = new Schema({
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    text: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
});
const ReactionSchema = new Schema({
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reactionType: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});
const GalleryItemSchema = new Schema({
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
}, {
    timestamps: true,
});
export const GalleryItem = mongoose.model('GalleryItem', GalleryItemSchema);
