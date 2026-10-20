import { Router } from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import { getGridFSBucket } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { DreamItem } from '../models/DreamItem.js';
import { CoupleSpace } from '../models/CoupleSpace.js';
import { User } from '../models/User.js';
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max photo size
});
// Helper to reliably resolve couple space ID from token or MongoDB user document
async function resolveSpaceId(req) {
    if (req.user?.spaceId)
        return req.user.spaceId.toString();
    if (req.user?.userId) {
        const user = await User.findById(req.user.userId);
        if (user?.spaceId)
            return user.spaceId.toString();
    }
    return null;
}
// GET /api/dreams - List all dreams in the couple space (no pre-seeding; pure user dreams)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const spaceId = await resolveSpaceId(req);
        if (!spaceId) {
            return res.status(400).json({ error: 'User does not belong to a space' });
        }
        const dreams = await DreamItem.find({ spaceId }).sort({ order: 1, createdAt: 1 });
        res.json({ dreams });
    }
    catch (err) {
        console.error('Error fetching dreams:', err);
        res.status(500).json({ error: 'Failed to fetch dreams' });
    }
});
// POST /api/dreams/upload-photo - Upload custom image for a dream into GridFS
router.post('/upload-photo', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No image file provided' });
            return;
        }
        const userId = req.user?.userId;
        const bucket = getGridFSBucket();
        const filename = `dream-${userId}-${Date.now()}-${req.file.originalname}`;
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: req.file.mimetype,
            metadata: {
                uploadedBy: userId,
                type: 'dream-photo',
            },
        });
        const readable = new Readable();
        readable.push(req.file.buffer);
        readable.push(null);
        await new Promise((resolve, reject) => {
            readable
                .pipe(uploadStream)
                .on('error', reject)
                .on('finish', () => resolve());
        });
        const imageUrl = `/api/gallery/media/${uploadStream.id}`;
        res.json({ success: true, imageUrl });
    }
    catch (err) {
        console.error('Error uploading dream photo:', err);
        res.status(500).json({ error: 'Failed to upload dream photo' });
    }
});
// POST /api/dreams - Create a new dream on the clothesline
router.post('/', authenticateToken, async (req, res) => {
    try {
        const spaceId = await resolveSpaceId(req);
        const userId = req.user?.userId;
        const displayName = req.user?.name || 'Partner';
        if (!spaceId || !userId) {
            return res.status(400).json({ error: 'Invalid user or space' });
        }
        const { title, description, category = 'romantic', icon = '💖', color = 'pink', imageUrl = '', targetDate = '', targetDateFormatted = '', authorType = 'Both', } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Dream title is required' });
        }
        // Deduplication check: prevent accidental double-submit within 3 seconds
        const recentDuplicate = await DreamItem.findOne({
            spaceId,
            createdBy: userId,
            title: title.trim(),
            createdAt: { $gte: new Date(Date.now() - 3000) },
        });
        if (recentDuplicate) {
            return res.status(200).json({ dream: recentDuplicate });
        }
        const count = await DreamItem.countDocuments({ spaceId });
        const newDream = await DreamItem.create({
            spaceId,
            title: title.trim(),
            description: (description || '').trim(),
            category,
            icon,
            color,
            imageUrl: imageUrl || '',
            targetDate: targetDate || '',
            targetDateFormatted: targetDateFormatted || targetDate || 'Someday ♡',
            authorType: authorType || 'Both',
            createdBy: userId,
            createdByName: displayName,
            order: count + 1,
        });
        // Permanently mark space as initialized
        await CoupleSpace.updateOne({ _id: spaceId }, { $set: { hasInitializedDreams: true } });
        res.status(201).json({ dream: newDream });
    }
    catch (err) {
        console.error('Error creating dream:', err);
        res.status(500).json({ error: 'Failed to create dream' });
    }
});
// PUT /api/dreams/:id - Update an existing dream
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const spaceId = await resolveSpaceId(req);
        const { id } = req.params;
        if (!spaceId) {
            return res.status(400).json({ error: 'Invalid space' });
        }
        const dream = await DreamItem.findOne({ _id: id, spaceId });
        if (!dream) {
            return res.status(404).json({ error: 'Dream not found' });
        }
        const allowedUpdates = [
            'title',
            'description',
            'category',
            'icon',
            'color',
            'imageUrl',
            'targetDate',
            'targetDateFormatted',
            'authorType',
            'isCompleted',
            'isFavorite',
        ];
        allowedUpdates.forEach((key) => {
            if (req.body[key] !== undefined) {
                dream[key] = req.body[key];
            }
        });
        if (req.body.isCompleted !== undefined) {
            dream.completedAt = req.body.isCompleted ? new Date() : undefined;
        }
        await dream.save();
        // Real-time broadcast
        const io = req.app.get('io');
        if (io) {
            io.to(spaceId.toString()).emit('dream:updated', { dream });
        }
        res.json({ dream });
    }
    catch (err) {
        console.error('Error updating dream:', err);
        res.status(500).json({ error: 'Failed to update dream' });
    }
});
// POST /api/dreams/:id/toggle-completed - Toggle complete
router.post('/:id/toggle-completed', authenticateToken, async (req, res) => {
    try {
        const spaceId = await resolveSpaceId(req);
        const { id } = req.params;
        if (!spaceId) {
            return res.status(400).json({ error: 'Invalid space' });
        }
        const dream = await DreamItem.findOne({ _id: id, spaceId });
        if (!dream) {
            return res.status(404).json({ error: 'Dream not found' });
        }
        dream.isCompleted = !dream.isCompleted;
        dream.completedAt = dream.isCompleted ? new Date() : undefined;
        await dream.save();
        const io = req.app.get('io');
        if (io && spaceId) {
            io.to(spaceId.toString()).emit('dream:updated', { dream });
        }
        res.json({ dream });
    }
    catch (err) {
        console.error('Error toggling dream completed:', err);
        res.status(500).json({ error: 'Failed to toggle completion' });
    }
});
// POST /api/dreams/:id/toggle-favorite - Toggle favorite
router.post('/:id/toggle-favorite', authenticateToken, async (req, res) => {
    try {
        const spaceId = await resolveSpaceId(req);
        const { id } = req.params;
        if (!spaceId) {
            return res.status(400).json({ error: 'Invalid space' });
        }
        const dream = await DreamItem.findOne({ _id: id, spaceId });
        if (!dream) {
            return res.status(404).json({ error: 'Dream not found' });
        }
        dream.isFavorite = !dream.isFavorite;
        await dream.save();
        const io = req.app.get('io');
        if (io && spaceId) {
            io.to(spaceId.toString()).emit('dream:updated', { dream });
        }
        res.json({ dream });
    }
    catch (err) {
        console.error('Error toggling dream favorite:', err);
        res.status(500).json({ error: 'Failed to toggle favorite' });
    }
});
// DELETE /api/dreams - Clear all dreams from the clothesline
router.delete('/', authenticateToken, async (req, res) => {
    try {
        const spaceId = await resolveSpaceId(req);
        if (!spaceId) {
            return res.status(400).json({ error: 'Invalid space' });
        }
        await DreamItem.deleteMany({ spaceId });
        await CoupleSpace.updateOne({ _id: spaceId }, { $set: { hasInitializedDreams: true } });
        const io = req.app.get('io');
        if (io && spaceId) {
            io.to(spaceId.toString()).emit('dreams:cleared');
        }
        res.json({ success: true, message: 'All dreams cleared' });
    }
    catch (err) {
        console.error('Error clearing dreams:', err);
        res.status(500).json({ error: 'Failed to clear dreams' });
    }
});
// DELETE /api/dreams/:id - Remove dream from clothesline
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const spaceId = await resolveSpaceId(req);
        const { id } = req.params;
        if (!spaceId) {
            return res.status(400).json({ error: 'Invalid space' });
        }
        const dream = await DreamItem.findOneAndDelete({ _id: id, spaceId });
        if (!dream) {
            return res.status(404).json({ error: 'Dream not found' });
        }
        const io = req.app.get('io');
        if (io && spaceId) {
            io.to(spaceId.toString()).emit('dream:deleted', { dreamId: id });
        }
        res.json({ success: true, message: 'Dream unpinned from clothesline' });
    }
    catch (err) {
        console.error('Error deleting dream:', err);
        res.status(500).json({ error: 'Failed to delete dream' });
    }
});
export default router;
