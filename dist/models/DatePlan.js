import mongoose, { Schema } from 'mongoose';
const DatePlanSchema = new Schema({
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
    title: {
        type: String,
        required: true,
        trim: true,
    },
    date: {
        type: Date,
        required: true,
        index: true,
    },
    time: {
        type: String,
        default: '19:00',
    },
    location: {
        type: String,
        default: '',
    },
    notes: {
        type: String,
        default: '',
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending',
        index: true,
    },
    respondedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    respondedAt: {
        type: Date,
    },
}, {
    timestamps: true,
});
export const DatePlan = mongoose.model('DatePlan', DatePlanSchema);
