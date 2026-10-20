import { Router } from 'express';
import multer from 'multer';
import { Types } from 'mongoose';
import { Readable } from 'stream';
import { getGridFSBucket } from '../config/db.js';
import { Scratchbook } from '../models/Scratchbook.js';
import { authenticateToken, requireCoupleSpace } from '../middleware/auth.js';
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max (images or voice clips)
});
// Ensure unique index on spaceId is dropped to support multiple scrapbooks per space
Scratchbook.collection.dropIndex('spaceId_1').catch(() => {
    // Index may not exist or already dropped, ignore
});
// Stream Media (Polaroids & Voice Clips) from GridFS (Public so <audio> and <img> can load directly)
router.get('/media/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        if (!Types.ObjectId.isValid(fileId)) {
            res.status(400).json({ error: 'Invalid file ID' });
            return;
        }
        const bucket = getGridFSBucket();
        const objectId = new Types.ObjectId(fileId);
        const files = await bucket.find({ _id: objectId }).toArray();
        if (!files || files.length === 0) {
            res.status(404).json({ error: 'Media not found' });
            return;
        }
        const file = files[0];
        res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
        res.setHeader('Content-Length', file.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const downloadStream = bucket.openDownloadStream(objectId);
        downloadStream.on('error', (err) => {
            console.error('Scratchbook media stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming media' });
            }
        });
        downloadStream.pipe(res);
    }
    catch (error) {
        console.error('Scratchbook media stream error:', error);
        res.status(500).json({ error: 'Failed to retrieve media' });
    }
});
router.use(authenticateToken);
router.use(requireCoupleSpace);
// Upload Scratchbook Media (Polaroid Image or Voice Clip) to MongoDB GridFS
router.post('/upload-media', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No media file provided' });
            return;
        }
        const spaceId = req.user.spaceId;
        const authorId = req.user.userId;
        const bucket = getGridFSBucket();
        const uploadStream = bucket.openUploadStream(req.file.originalname, {
            contentType: req.file.mimetype,
            metadata: {
                spaceId,
                authorId,
                uploadedAt: new Date(),
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
        const fileId = uploadStream.id.toString();
        const mediaUrl = `/api/scratchbook/media/${fileId}`;
        res.status(201).json({
            fileId,
            mediaUrl,
            contentType: req.file.mimetype,
        });
    }
    catch (error) {
        console.error('Scratchbook media upload error:', error);
        res.status(500).json({ error: 'Failed to upload media to MongoDB' });
    }
});
// 1. List all saved scrapbooks for the couple's space
router.get('/list', async (req, res) => {
    try {
        const spaceId = req.user.spaceId;
        const books = await Scratchbook.find({ spaceId: new Types.ObjectId(spaceId) })
            .select('_id title backgroundColor version createdAt updatedAt elements')
            .sort({ updatedAt: -1 })
            .lean();
        const formatted = books.map((b) => ({
            _id: b._id,
            title: b.title || 'Our Shared Scrapbook',
            backgroundColor: b.backgroundColor || '#ffffff',
            elementsCount: b.elements ? b.elements.length : 0,
            version: b.version,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
        }));
        res.json({ scrapbooks: formatted });
    }
    catch (error) {
        console.error('List scrapbooks error:', error);
        res.status(500).json({ error: 'Failed to list scrapbooks' });
    }
});
// 2. Create a new named scrapbook
router.post('/new', async (req, res) => {
    try {
        const spaceId = req.user.spaceId;
        const title = (req.body.title || 'New Scrapbook').trim();
        const backgroundColor = req.body.backgroundColor || '#ffffff';
        const scratchbook = await Scratchbook.create({
            spaceId: new Types.ObjectId(spaceId),
            title: title || 'Our Romantic Scrapbook',
            backgroundColor,
            elements: [],
            version: 1,
            lastEditedBy: new Types.ObjectId(req.user.userId),
        });
        res.status(201).json({ scratchbook });
    }
    catch (error) {
        console.error('Create new scrapbook error:', error);
        res.status(500).json({ error: 'Failed to create new scrapbook' });
    }
});
function deduplicateElements(elements) {
    if (!elements || !Array.isArray(elements))
        return [];
    const map = new Map();
    for (const el of elements) {
        if (!el || !el.id)
            continue;
        const existing = map.get(el.id);
        if (!existing || (el.updatedAt || 0) >= (existing.updatedAt || 0)) {
            map.set(el.id, el);
        }
    }
    return Array.from(map.values());
}
// 3. Get Active/Latest Scratchbook for Space (or specific book by query `?id=...`)
router.get('/', async (req, res) => {
    try {
        const spaceId = req.user.spaceId;
        const requestedId = req.query.id;
        let scratchbook = null;
        if (requestedId && Types.ObjectId.isValid(requestedId)) {
            scratchbook = await Scratchbook.findOne({
                _id: new Types.ObjectId(requestedId),
                spaceId: new Types.ObjectId(spaceId),
            });
        }
        if (!scratchbook) {
            scratchbook = await Scratchbook.findOne({ spaceId: new Types.ObjectId(spaceId) }).sort({ updatedAt: -1 });
        }
        if (!scratchbook) {
            scratchbook = await Scratchbook.create({
                spaceId: new Types.ObjectId(spaceId),
                title: 'Our Shared Scrapbook',
                backgroundColor: '#ffffff',
                elements: [],
                version: 1,
                lastEditedBy: new Types.ObjectId(req.user.userId),
            });
        }
        scratchbook.elements = deduplicateElements(scratchbook.elements);
        res.json({ scratchbook });
    }
    catch (error) {
        console.error('Fetch scratchbook error:', error);
        res.status(500).json({ error: 'Failed to fetch scratchbook' });
    }
});
// 4. Get specific scrapbook by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const spaceId = req.user.spaceId;
        if (!Types.ObjectId.isValid(id)) {
            res.status(400).json({ error: 'Invalid scrapbook ID' });
            return;
        }
        const scratchbook = await Scratchbook.findOne({
            _id: new Types.ObjectId(id),
            spaceId: new Types.ObjectId(spaceId),
        });
        if (!scratchbook) {
            res.status(404).json({ error: 'Scrapbook not found' });
            return;
        }
        scratchbook.elements = deduplicateElements(scratchbook.elements);
        res.json({ scratchbook });
    }
    catch (error) {
        console.error('Get scrapbook by ID error:', error);
        res.status(500).json({ error: 'Failed to fetch scrapbook' });
    }
});
// 5. Update Background Color
router.put('/:id/background', async (req, res) => {
    try {
        const { id } = req.params;
        const { backgroundColor } = req.body;
        const spaceId = req.user.spaceId;
        if (!backgroundColor) {
            res.status(400).json({ error: 'Background color is required' });
            return;
        }
        const scratchbook = await Scratchbook.findOneAndUpdate({ _id: new Types.ObjectId(id), spaceId: new Types.ObjectId(spaceId) }, { backgroundColor, lastEditedBy: new Types.ObjectId(req.user.userId) }, { new: true });
        if (!scratchbook) {
            res.status(404).json({ error: 'Scrapbook not found' });
            return;
        }
        res.json({ message: 'Background updated', backgroundColor: scratchbook.backgroundColor });
    }
    catch (error) {
        console.error('Update background error:', error);
        res.status(500).json({ error: 'Failed to update background color' });
    }
});
// 6. Rename Scrapbook
router.put('/:id/rename', async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        const spaceId = req.user.spaceId;
        if (!title || !title.trim()) {
            res.status(400).json({ error: 'Title is required' });
            return;
        }
        const scratchbook = await Scratchbook.findOneAndUpdate({ _id: new Types.ObjectId(id), spaceId: new Types.ObjectId(spaceId) }, { title: title.trim(), lastEditedBy: new Types.ObjectId(req.user.userId) }, { new: true });
        if (!scratchbook) {
            res.status(404).json({ error: 'Scrapbook not found' });
            return;
        }
        res.json({ message: 'Scrapbook renamed', title: scratchbook.title });
    }
    catch (error) {
        console.error('Rename scrapbook error:', error);
        res.status(500).json({ error: 'Failed to rename scrapbook' });
    }
});
// 7. Delete a Scrapbook (keeps at least 1)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const spaceId = req.user.spaceId;
        const count = await Scratchbook.countDocuments({ spaceId: new Types.ObjectId(spaceId) });
        if (count <= 1) {
            res.status(400).json({ error: 'You must have at least one scrapbook in your space' });
            return;
        }
        await Scratchbook.findOneAndDelete({
            _id: new Types.ObjectId(id),
            spaceId: new Types.ObjectId(spaceId),
        });
        res.json({ message: 'Scrapbook deleted' });
    }
    catch (error) {
        console.error('Delete scrapbook error:', error);
        res.status(500).json({ error: 'Failed to delete scrapbook' });
    }
});
// 8. Add or Update a Canvas Element
router.put('/element', async (req, res) => {
    try {
        const spaceId = req.user.spaceId;
        const element = req.body;
        const scratchbookId = req.body.scratchbookId;
        if (!element || !element.id || !element.type) {
            res.status(400).json({ error: 'Invalid canvas element payload' });
            return;
        }
        // Ensure author info
        element.authorId = req.user.userId;
        element.authorName = req.user.name;
        element.updatedAt = element.updatedAt || Date.now();
        let query = { spaceId: new Types.ObjectId(spaceId) };
        if (scratchbookId && Types.ObjectId.isValid(scratchbookId)) {
            query._id = new Types.ObjectId(scratchbookId);
        }
        let scratchbook = await Scratchbook.findOne(query).sort({ updatedAt: -1 });
        if (!scratchbook) {
            res.status(404).json({ error: 'Scratchbook not found' });
            return;
        }
        // Ensure deterministic deduplication & upsert: remove any prior element with this id, then append updated element
        scratchbook.elements = (scratchbook.elements || []).filter((e) => e.id !== element.id);
        scratchbook.elements.push(element);
        scratchbook.markModified('elements');
        scratchbook.version += 1;
        scratchbook.lastEditedBy = new Types.ObjectId(req.user.userId);
        await scratchbook.save();
        res.json({
            message: 'Element synced',
            element,
            scratchbookId: scratchbook._id,
            version: scratchbook.version,
        });
    }
    catch (error) {
        console.error('Sync element error:', error);
        res.status(500).json({ error: 'Failed to sync canvas element' });
    }
});
// 9. Remove an Element
router.delete('/element/:elementId', async (req, res) => {
    try {
        const { elementId } = req.params;
        const spaceId = req.user.spaceId;
        const scratchbookId = req.query.scratchbookId;
        let query = { spaceId: new Types.ObjectId(spaceId) };
        if (scratchbookId && Types.ObjectId.isValid(scratchbookId)) {
            query._id = new Types.ObjectId(scratchbookId);
        }
        else {
            query['elements.id'] = elementId;
        }
        const scratchbook = await Scratchbook.findOne(query);
        if (!scratchbook) {
            res.status(404).json({ error: 'Scratchbook not found' });
            return;
        }
        scratchbook.elements = scratchbook.elements.filter((e) => e.id !== elementId);
        scratchbook.version += 1;
        scratchbook.lastEditedBy = new Types.ObjectId(req.user.userId);
        await scratchbook.save();
        res.json({ message: 'Element deleted', elementId, version: scratchbook.version });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete element' });
    }
});
// 10. Clear Canvas
router.post('/clear', async (req, res) => {
    try {
        const spaceId = req.user.spaceId;
        const scratchbookId = req.body.scratchbookId;
        let query = { spaceId: new Types.ObjectId(spaceId) };
        if (scratchbookId && Types.ObjectId.isValid(scratchbookId)) {
            query._id = new Types.ObjectId(scratchbookId);
        }
        const scratchbook = await Scratchbook.findOne(query).sort({ updatedAt: -1 });
        if (scratchbook) {
            scratchbook.elements = [];
            scratchbook.version += 1;
            await scratchbook.save();
        }
        res.json({ message: 'Scratchbook cleared', version: scratchbook?.version });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to clear canvas' });
    }
});
export default router;
