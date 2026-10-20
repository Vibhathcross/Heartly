import { Router, Response } from 'express';
import { Types } from 'mongoose';
import multer from 'multer';
import { Readable } from 'stream';
import { getGridFSBucket } from '../config/db.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { CoupleSpace } from '../models/CoupleSpace.js';
import { AuthenticatedRequest, authenticateToken, requireCoupleSpace } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max image size
});

router.use(authenticateToken);
router.use(requireCoupleSpace);

// 1. Get recent chat messages for couple space (supports delta sync via ?since=)
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const userId = new Types.ObjectId(req.user!.userId);
    const sinceParam = req.query.since ? new Date(String(req.query.since)) : null;

    const query: any = {
      spaceId: new Types.ObjectId(spaceId),
      deletedFor: { $ne: userId },
    };

    if (sinceParam && !isNaN(sinceParam.getTime())) {
      query.$or = [
        { createdAt: { $gt: sinceParam } },
        { updatedAt: { $gt: sinceParam } },
      ];
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: 1 })
      .limit(300)
      .lean();

    res.json({
      messages,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fetch chat error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

function parseReplyTo(raw: any) {
  if (!raw) return undefined;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && (parsed.messageId || parsed._id)) {
      return {
        messageId: new Types.ObjectId(parsed.messageId || parsed._id),
        senderName: String(parsed.senderName || 'Partner'),
        text: typeof parsed.text === 'string' ? parsed.text : '',
        imageUrl: typeof parsed.imageUrl === 'string' ? parsed.imageUrl : '',
        audioUrl: typeof parsed.audioUrl === 'string' ? parsed.audioUrl : '',
      };
    }
  } catch (e) {
    console.warn('Failed to parse replyTo payload:', e);
  }
  return undefined;
}

// 2. Send a new message
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { text, replyTo: rawReplyTo } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Message text cannot be empty' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const senderId = req.user!.userId;
    const senderName = req.user!.name;
    const replyTo = parseReplyTo(rawReplyTo);

    const message = await ChatMessage.create({
      spaceId: new Types.ObjectId(spaceId),
      senderId: new Types.ObjectId(senderId),
      senderName,
      text: text.trim(),
      replyTo,
      status: 'sent',
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// 2.1 Send an image message (stores image directly in MongoDB GridFS)
router.post('/upload-image', upload.single('image'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const senderId = req.user!.userId;
    const senderName = req.user!.name;
    const text = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';

    const bucket = getGridFSBucket();
    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: {
        spaceId,
        senderId,
        type: 'chat_image',
        uploadedAt: new Date(),
      },
    });

    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);

    await new Promise<void>((resolve, reject) => {
      readable
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => resolve());
    });

    const imageFileId = uploadStream.id;
    const imageUrl = `/api/gallery/media/${imageFileId}`;
    const replyTo = parseReplyTo(req.body.replyTo);

    const message = await ChatMessage.create({
      spaceId: new Types.ObjectId(spaceId),
      senderId: new Types.ObjectId(senderId),
      senderName,
      text,
      imageUrl,
      imageFileId,
      replyTo,
      status: 'sent',
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Upload chat image error:', error);
    res.status(500).json({ error: 'Failed to upload chat image' });
  }
});

// 2.2 Send an audio voice snippet (stores audio directly in MongoDB GridFS)
router.post('/upload-audio', upload.single('audio'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const senderId = req.user!.userId;
    const senderName = req.user!.name;
    const duration = Number(req.body.duration) || 0;
    const replyTo = parseReplyTo(req.body.replyTo);

    const bucket = getGridFSBucket();
    const uploadStream = bucket.openUploadStream(req.file.originalname || 'voice_snippet.webm', {
      contentType: req.file.mimetype || 'audio/webm',
      metadata: {
        spaceId,
        senderId,
        type: 'chat_audio',
        duration,
        uploadedAt: new Date(),
      },
    });

    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);

    await new Promise<void>((resolve, reject) => {
      readable
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => resolve());
    });

    const audioFileId = uploadStream.id;
    const audioUrl = `/api/gallery/media/${audioFileId}`;

    const message = await ChatMessage.create({
      spaceId: new Types.ObjectId(spaceId),
      senderId: new Types.ObjectId(senderId),
      senderName,
      text: '',
      audioUrl,
      audioFileId,
      audioDuration: duration,
      replyTo,
      status: 'sent',
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Upload chat audio error:', error);
    res.status(500).json({ error: 'Failed to upload chat audio' });
  }
});

// 2.3 Mark messages as read by partner
router.put('/read', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const currentUserId = req.user!.userId;

    const result = await ChatMessage.updateMany(
      {
        spaceId: new Types.ObjectId(spaceId),
        senderId: { $ne: new Types.ObjectId(currentUserId) },
        status: 'sent',
      },
      {
        $set: {
          status: 'read',
          readAt: new Date(),
        },
      }
    );

    res.json({ success: true, updatedCount: result.modifiedCount });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// 3. React to a message (toggle or update reaction)
router.post('/:id/react', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    if (!emoji || typeof emoji !== 'string') {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const userId = req.user!.userId;
    const userName = req.user!.name;

    const message = await ChatMessage.findOne({
      _id: new Types.ObjectId(id),
      spaceId: new Types.ObjectId(spaceId),
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (!message.reactions) {
      message.reactions = [];
    }

    const existingIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId
    );

    if (existingIndex > -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        // Same emoji -> toggle off (remove)
        message.reactions.splice(existingIndex, 1);
      } else {
        // Different emoji -> update
        message.reactions[existingIndex].emoji = emoji;
        message.reactions[existingIndex].userName = userName;
      }
    } else {
      // Add new reaction
      message.reactions.push({
        userId: new Types.ObjectId(userId),
        userName,
        emoji,
        createdAt: new Date(),
      });
    }

    await message.save();

    res.json({
      success: true,
      messageId: message._id.toString(),
      reactions: message.reactions,
    });
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ error: 'Failed to react to message' });
  }
});

// 4. Delete or unsend a message (Delete for Everyone or Delete for Me)
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const type = req.query.type === 'me' ? 'me' : 'everyone';

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const userId = req.user!.userId;

    const message = await ChatMessage.findOne({
      _id: new Types.ObjectId(id),
      spaceId: new Types.ObjectId(spaceId),
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (type === 'everyone') {
      // Only sender can delete for everyone
      if (message.senderId.toString() !== userId) {
        res.status(403).json({ error: 'Only the sender can delete a message for everyone' });
        return;
      }

      message.isDeleted = true;
      message.text = 'This whisper was deleted 🕊️';
      message.imageUrl = '';
      message.audioUrl = '';
      message.reactions = [];
      await message.save();

      res.json({
        success: true,
        messageId: message._id.toString(),
        type: 'everyone',
        message,
      });
    } else {
      // Delete for Me
      await ChatMessage.updateOne(
        { _id: new Types.ObjectId(id) },
        { $addToSet: { deletedFor: new Types.ObjectId(userId) } }
      );

      res.json({
        success: true,
        messageId: id,
        type: 'me',
      });
    }
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// 5. Get all pinned messages
router.get('/pinned', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const userId = new Types.ObjectId(req.user!.userId);
    const messages = await ChatMessage.find({
      spaceId: new Types.ObjectId(spaceId),
      isPinned: true,
      isDeleted: false,
      deletedFor: { $ne: userId },
    })
      .sort({ pinnedAt: -1, createdAt: -1 })
      .lean();

    res.json({ pinnedMessages: messages });
  } catch (error) {
    console.error('Fetch pinned messages error:', error);
    res.status(500).json({ error: 'Failed to fetch pinned messages' });
  }
});

// 6. Toggle pin status on a message
router.patch('/:id/pin', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const userId = req.user!.userId;

    const message = await ChatMessage.findOne({
      _id: new Types.ObjectId(id),
      spaceId: new Types.ObjectId(spaceId),
      deletedFor: { $ne: new Types.ObjectId(userId) },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (message.isDeleted) {
      res.status(400).json({ error: 'Cannot pin a deleted message' });
      return;
    }

    message.isPinned = !message.isPinned;
    message.pinnedAt = message.isPinned ? new Date() : undefined;
    message.pinnedBy = message.isPinned ? new Types.ObjectId(userId) : undefined;
    await message.save();

    res.json({
      success: true,
      messageId: message._id.toString(),
      isPinned: message.isPinned,
      message,
    });
  } catch (error) {
    console.error('Toggle pin message error:', error);
    res.status(500).json({ error: 'Failed to toggle pin on message' });
  }
});

// 7. Get shared chat wallpaper
router.get('/wallpaper', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const space = await CoupleSpace.findById(spaceId).select('chatWallpaper').lean();
    const wp = space?.chatWallpaper || { type: 'none', value: '', opacity: 0.4 };
    res.json({ wallpaper: wp, chatWallpaper: wp });
  } catch (error) {
    console.error('Fetch chat wallpaper error:', error);
    res.status(500).json({ error: 'Failed to fetch chat wallpaper' });
  }
});

// 8. Update shared chat wallpaper (preset or custom URL)
router.put('/wallpaper', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const { type, value, opacity } = req.body;

    const numOpacity = typeof opacity === 'number'
      ? (opacity > 1 ? opacity / 100 : opacity)
      : 0.4;

    const wallpaper = {
      type: type || 'preset',
      value: typeof value === 'string' ? value : '',
      opacity: Math.max(0.05, Math.min(1, numOpacity)),
      updatedAt: new Date(),
    };

    const updated = await CoupleSpace.findByIdAndUpdate(
      spaceId,
      { $set: { chatWallpaper: wallpaper } },
      { new: true }
    ).select('chatWallpaper');

    const result = updated?.chatWallpaper || wallpaper;
    res.json({ success: true, wallpaper: result, chatWallpaper: result });
  } catch (error) {
    console.error('Update chat wallpaper error:', error);
    res.status(500).json({ error: 'Failed to update chat wallpaper' });
  }
});

// 9. Upload custom wallpaper image to MongoDB GridFS
router.post('/wallpaper/upload', upload.single('wallpaper'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image uploaded' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const userId = req.user!.userId;
    const bucket = getGridFSBucket();

    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: {
        spaceId,
        uploadedBy: userId,
        type: 'chat_wallpaper',
        uploadedAt: new Date(),
      },
    });

    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);

    await new Promise<void>((resolve, reject) => {
      readable
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => resolve());
    });

    const fileId = uploadStream.id;
    const mediaUrl = `/api/gallery/media/${fileId}`;

    const rawOp = Number(req.body.opacity);
    const numOpacity = !isNaN(rawOp)
      ? (rawOp > 1 ? rawOp / 100 : rawOp)
      : 0.4;

    const wallpaper = {
      type: 'custom' as const,
      value: mediaUrl,
      opacity: Math.max(0.05, Math.min(1, numOpacity)),
      updatedAt: new Date(),
    };

    await CoupleSpace.findByIdAndUpdate(
      spaceId,
      { $set: { chatWallpaper: wallpaper } }
    );

    res.json({ success: true, wallpaper, chatWallpaper: wallpaper });
  } catch (error) {
    console.error('Upload chat wallpaper error:', error);
    res.status(500).json({ error: 'Failed to upload chat wallpaper' });
  }
});

// 9. Get Magic Words / Sentences for the couple space (no pre-seeding)
router.get('/magic-words', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const space = await CoupleSpace.findById(spaceId).select('magicWords').lean();
    if (!space) {
      res.status(404).json({ error: 'Space not found' });
      return;
    }

    const words = space.magicWords || [];
    res.json({ magicWords: words });
  } catch (error) {
    console.error('Get magic words error:', error);
    res.status(500).json({ error: 'Failed to retrieve magic words' });
  }
});

// 10. Add a new custom magic word / sentence
router.post('/magic-words', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const userId = req.user!.userId;
    const userName = req.user!.name || 'Love';

    const { phrase, effect } = req.body;
    if (!phrase || typeof phrase !== 'string' || !phrase.trim()) {
      res.status(400).json({ error: 'Sentence or phrase is required' });
      return;
    }

    const trimmedPhrase = phrase.trim();
    if (trimmedPhrase.length > 80) {
      res.status(400).json({ error: 'Phrase cannot exceed 80 characters' });
      return;
    }

    const validEffects = ['hearts', 'petals', 'stars', 'fireworks'];
    const chosenEffect = validEffects.includes(effect) ? effect : 'hearts';

    const space = await CoupleSpace.findById(spaceId);
    if (!space) {
      res.status(404).json({ error: 'Space not found' });
      return;
    }

    if (!space.magicWords) {
      space.magicWords = [];
    }

    // Check duplicate (case-insensitive)
    const exists = space.magicWords.some(
      (mw) => mw.phrase.toLowerCase() === trimmedPhrase.toLowerCase()
    );
    if (exists) {
      res.status(400).json({ error: 'This magic word/sentence is already added' });
      return;
    }

    space.magicWords!.push({
      phrase: trimmedPhrase,
      effect: chosenEffect as any,
      createdBy: new Types.ObjectId(userId),
      createdByName: userName,
      createdAt: new Date(),
    } as any);

    await space.save();

    res.json({ success: true, magicWords: space.magicWords });
  } catch (error) {
    console.error('Add magic word error:', error);
    res.status(500).json({ error: 'Failed to save magic word' });
  }
});

// 11. Delete a custom magic word
router.delete('/magic-words/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const { id } = req.params;

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid magic word ID' });
      return;
    }

    const space = await CoupleSpace.findByIdAndUpdate(
      spaceId,
      { $pull: { magicWords: { _id: new Types.ObjectId(id) } } },
      { new: true }
    ).select('magicWords').lean();

    res.json({ success: true, magicWords: space?.magicWords || [] });
  } catch (error) {
    console.error('Delete magic word error:', error);
    res.status(500).json({ error: 'Failed to delete magic word' });
  }
});

export default router;
