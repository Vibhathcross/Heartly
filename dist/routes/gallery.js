import { Router } from 'express';
import multer from 'multer';
import { Types } from 'mongoose';
import { Readable } from 'stream';
import { getGridFSBucket } from '../config/db.js';
import { GalleryItem } from '../models/GalleryItem.js';
import { authenticateToken, requireCoupleSpace } from '../middleware/auth.js';
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max file size
});
// Stream Media File Directly from MongoDB GridFS (Public to allow <img> tags to stream)
router.get('/media/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!Types.ObjectId.isValid(fileId)) {
            res.status(400).json({ error: 'Invalid file ID' });
            return;
        }
        const bucket = getGridFSBucket();
        const objectId = new Types.ObjectId(fileId);
        // Verify file exists
        const files = await bucket.find({ _id: objectId }).toArray();
        if (!files || files.length === 0) {
            res.status(404).json({ error: 'Media not found in MongoDB GridFS' });
            return;
        }
        const file = files[0];
        res.setHeader('Content-Type', file.contentType || 'image/jpeg');
        res.setHeader('Content-Length', file.length);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        const downloadStream = bucket.openDownloadStream(objectId);
        downloadStream.on('error', (err) => {
            console.error('GridFS stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming media' });
            }
        });
        downloadStream.pipe(res);
    }
    catch (error) {
        console.error('Media stream error:', error);
        res.status(500).json({ error: 'Failed to retrieve media' });
    }
});
// All other gallery endpoints require user to be authenticated and in a couple space
router.use(authenticateToken);
router.use(requireCoupleSpace);
// 1. Upload Photo to MongoDB GridFS with Memory Date & Caption
router.post('/upload', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No photo uploaded' });
            return;
        }
        const { caption, memoryDate, location, tags, genre } = req.body;
        const spaceId = req.user.spaceId;
        const authorId = req.user.userId;
        const authorName = req.user.name;
        const bucket = getGridFSBucket();
        // Create upload stream to MongoDB GridFS
        const uploadStream = bucket.openUploadStream(req.file.originalname, {
            contentType: req.file.mimetype,
            metadata: {
                spaceId,
                authorId,
                uploadedAt: new Date(),
            },
        });
        // Stream the buffer into MongoDB GridFS
        const readable = new Readable();
        readable.push(req.file.buffer);
        readable.push(null);
        await new Promise((resolve, reject) => {
            readable
                .pipe(uploadStream)
                .on('error', reject)
                .on('finish', () => resolve());
        });
        const gridFSFileId = uploadStream.id;
        // Create GalleryItem record in MongoDB
        const galleryItem = await GalleryItem.create({
            spaceId: new Types.ObjectId(spaceId),
            authorId: new Types.ObjectId(authorId),
            authorName,
            gridFSFileId,
            filename: req.file.originalname,
            contentType: req.file.mimetype,
            size: req.file.size,
            caption: caption || '',
            genre: genre ? String(genre).trim() : '',
            memoryDate: memoryDate ? new Date(memoryDate) : new Date(),
            location: location || '',
            tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim())) : [],
            comments: [],
            reactions: [],
        });
        res.status(201).json({
            message: 'Photo stored successfully',
            item: galleryItem,
        });
    }
    catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});
// 1b. Update Genre for a Gallery Item
router.patch('/:id/genre', async (req, res) => {
    try {
        const { id } = req.params;
        const { genre } = req.body;
        const spaceId = req.user.spaceId;
        const item = await GalleryItem.findOne({
            _id: new Types.ObjectId(id),
            spaceId: new Types.ObjectId(spaceId),
        });
        if (!item) {
            res.status(404).json({ error: 'Gallery memory not found' });
            return;
        }
        item.genre = genre ? String(genre).trim() : '';
        await item.save();
        res.json({ message: 'Genre updated successfully', item });
    }
    catch (error) {
        console.error('Update genre error:', error);
        res.status(500).json({ error: 'Failed to update genre' });
    }
});
// 2. Get All Gallery Memories for the Couple Space (Sorted by Date)
router.get('/', async (req, res) => {
    try {
        const spaceId = req.user.spaceId;
        const items = await GalleryItem.find({ spaceId: new Types.ObjectId(spaceId) })
            .sort({ memoryDate: -1, createdAt: -1 })
            .lean();
        res.json({ items });
    }
    catch (error) {
        console.error('Fetch gallery error:', error);
        res.status(500).json({ error: 'Failed to fetch gallery items' });
    }
});
// 4. Add Comment to Gallery Item
router.post('/:id/comment', async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        if (!text || !text.trim()) {
            res.status(400).json({ error: 'Comment text cannot be empty' });
            return;
        }
        const spaceId = req.user.spaceId;
        const item = await GalleryItem.findOne({
            _id: new Types.ObjectId(id),
            spaceId: new Types.ObjectId(spaceId),
        });
        if (!item) {
            res.status(404).json({ error: 'Gallery memory not found' });
            return;
        }
        const comment = {
            _id: new Types.ObjectId(),
            authorId: new Types.ObjectId(req.user.userId),
            authorName: req.user.name,
            text: text.trim(),
            createdAt: new Date(),
        };
        item.comments.push(comment);
        await item.save();
        res.status(201).json({
            message: 'Comment added',
            comment,
            comments: item.comments,
        });
    }
    catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});
// 5. Add or Toggle Reaction on Gallery Item
router.post('/:id/reaction', async (req, res) => {
    try {
        const { id } = req.params;
        const { reactionType } = req.body; // e.g. '❤️', '🥰', '✨'
        const type = reactionType || '❤️';
        const spaceId = req.user.spaceId;
        const userId = req.user.userId;
        const item = await GalleryItem.findOne({
            _id: new Types.ObjectId(id),
            spaceId: new Types.ObjectId(spaceId),
        });
        if (!item) {
            res.status(404).json({ error: 'Gallery memory not found' });
            return;
        }
        // Check if user already added this reaction, toggle it
        const existingIndex = item.reactions.findIndex((r) => r.authorId.toString() === userId && r.reactionType === type);
        if (existingIndex > -1) {
            item.reactions.splice(existingIndex, 1);
        }
        else {
            item.reactions.push({
                authorId: new Types.ObjectId(userId),
                reactionType: type,
                createdAt: new Date(),
            });
        }
        await item.save();
        res.json({ reactions: item.reactions });
    }
    catch (error) {
        console.error('Reaction error:', error);
        res.status(500).json({ error: 'Failed to update reaction' });
    }
});
// 6. Delete Memory
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const spaceId = req.user.spaceId;
        const item = await GalleryItem.findOne({
            _id: new Types.ObjectId(id),
            spaceId: new Types.ObjectId(spaceId),
        });
        if (!item) {
            res.status(404).json({ error: 'Item not found' });
            return;
        }
        // Delete file from GridFS
        const bucket = getGridFSBucket();
        try {
            await bucket.delete(item.gridFSFileId);
        }
        catch (e) {
            console.warn('GridFS delete warning (may have already been removed):', e);
        }
        await GalleryItem.findByIdAndDelete(item._id);
        res.json({ message: 'Memory removed successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete memory' });
    }
});
export default router;
