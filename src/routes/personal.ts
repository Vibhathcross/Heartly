import { Router, Response } from 'express';
import multer from 'multer';
import { Types } from 'mongoose';
import { Readable } from 'stream';
import { getGridFSBucket } from '../config/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { ScheduledPopup } from '../models/ScheduledPopup.js';
import { CoupleSpace } from '../models/CoupleSpace.js';
import { PersonalVault } from '../models/PersonalVault.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

// 0. Upload Image or Voice Note for Scheduled Surprise Popup
router.post('/upload-attachment', authenticateToken, upload.single('media'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const bucket = getGridFSBucket();
    const filename = `personal_popup_${Date.now()}_${req.file.originalname}`;
    const readableStream = new Readable();
    readableStream.push(req.file.buffer);
    readableStream.push(null);

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: {
        userId: req.user!.userId,
        spaceId: req.user!.spaceId,
        uploadedAt: new Date(),
      },
    });

    readableStream
      .pipe(uploadStream)
      .on('error', (err) => {
        console.error('[Personal] GridFS upload error:', err);
        res.status(500).json({ success: false, message: 'Upload stream failed' });
      })
      .on('finish', () => {
        const fileUrl = `/api/gallery/media/${uploadStream.id}`;
        res.json({ success: true, url: fileUrl });
      });
  } catch (error) {
    console.error('[Personal] Attachment upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload attachment' });
  }
});

// 1. Get all popups scheduled by the currently logged in user (Partner A viewing their own planned surprises)
router.get('/my-scheduled-popups', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const popups = await ScheduledPopup.find({
      spaceId: new Types.ObjectId(user.spaceId),
      creatorId: new Types.ObjectId(user.userId),
    }).sort({ targetDate: 1, createdAt: -1 });

    res.json({ success: true, popups });
  } catch (error) {
    console.error('[Personal] Error fetching user scheduled popups:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scheduled popups' });
  }
});

// 2. Schedule a new surprise popup for partner
router.post('/scheduled-popups', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { targetDate, title, message, theme, hasConfetti, imageUrl, audioUrl, audioDuration } = req.body;

    if (!targetDate || !title || !message) {
      res.status(400).json({ success: false, message: 'Target date, title, and message are required' });
      return;
    }

    // Find the partner in this space
    const space = await CoupleSpace.findById(user.spaceId);
    if (!space) {
      res.status(404).json({ success: false, message: 'Space not found' });
      return;
    }

    const partnerMember = space.members.find(
      (m) => m.userId.toString() !== user.userId.toString()
    );

    if (!partnerMember) {
      res.status(400).json({ success: false, message: 'No partner found in your space yet to surprise' });
      return;
    }

    const newPopup = new ScheduledPopup({
      spaceId: new Types.ObjectId(user.spaceId),
      creatorId: new Types.ObjectId(user.userId),
      creatorName: user.name,
      targetUserId: partnerMember.userId,
      targetDate: targetDate.trim(),
      title: title.trim(),
      message: message.trim(),
      theme: theme || 'birthday',
      imageUrl: imageUrl || null,
      audioUrl: audioUrl || null,
      audioDuration: typeof audioDuration === 'number' ? audioDuration : 0,
      hasConfetti: hasConfetti !== false,
      active: true,
    });

    await newPopup.save();

    res.status(201).json({ success: true, popup: newPopup, message: 'Surprise popup scheduled successfully!' });
  } catch (error) {
    console.error('[Personal] Error scheduling popup:', error);
    res.status(500).json({ success: false, message: 'Failed to schedule surprise popup' });
  }
});

// 3. Edit / Update an existing scheduled popup (only creator can edit)
router.put('/scheduled-popups/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { targetDate, title, message, theme, hasConfetti, imageUrl, audioUrl, audioDuration } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid popup ID' });
      return;
    }

    const popup = await ScheduledPopup.findOne({
      _id: new Types.ObjectId(id),
      creatorId: new Types.ObjectId(user.userId),
    });

    if (!popup) {
      res.status(404).json({ success: false, message: 'Popup not found or unauthorized' });
      return;
    }

    if (targetDate) popup.targetDate = targetDate.trim();
    if (title) popup.title = title.trim();
    if (message) popup.message = message.trim();
    if (theme) popup.theme = theme;
    if (typeof hasConfetti === 'boolean') popup.hasConfetti = hasConfetti;
    if (imageUrl !== undefined) popup.imageUrl = imageUrl;
    if (audioUrl !== undefined) popup.audioUrl = audioUrl;
    if (typeof audioDuration === 'number') popup.audioDuration = audioDuration;

    await popup.save();

    res.json({ success: true, popup, message: 'Surprise popup updated successfully!' });
  } catch (error) {
    console.error('[Personal] Error updating popup:', error);
    res.status(500).json({ success: false, message: 'Failed to update popup' });
  }
});

// 4. Delete a scheduled popup (only creator can delete)
router.delete('/scheduled-popups/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid popup ID' });
      return;
    }

    const popup = await ScheduledPopup.findOneAndDelete({
      _id: new Types.ObjectId(id),
      creatorId: new Types.ObjectId(user.userId),
    });

    if (!popup) {
      res.status(404).json({ success: false, message: 'Popup not found or unauthorized' });
      return;
    }

    res.json({ success: true, message: 'Scheduled popup deleted' });
  } catch (error) {
    console.error('[Personal] Error deleting popup:', error);
    res.status(500).json({ success: false, message: 'Failed to delete popup' });
  }
});

// 5. Check for incoming scheduled popups for TODAY (Target Partner checking upon app open)
router.get('/today-popup', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    // Client can provide their local date (e.g. ?date=YYYY-MM-DD)
    const clientDate = (req.query.date as string) || new Date().toISOString().split('T')[0];

    const todayPopup = await ScheduledPopup.findOne({
      spaceId: new Types.ObjectId(user.spaceId),
      targetUserId: new Types.ObjectId(user.userId),
      targetDate: clientDate,
      active: true,
    });

    res.json({ success: true, popup: todayPopup || null });
  } catch (error) {
    console.error('[Personal] Error checking today popup:', error);
    res.status(500).json({ success: false, message: 'Failed to check incoming popup' });
  }
});

// 6. Get user's Personal Vault (Diaries, Moments, Classes, Scratchpad, Mood) from MongoDB
router.get('/vault-data', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    let vault = await PersonalVault.findOne({
      spaceId: new Types.ObjectId(user.spaceId),
      userId: new Types.ObjectId(user.userId),
    });

    if (!vault) {
      vault = new PersonalVault({
        spaceId: new Types.ObjectId(user.spaceId),
        userId: new Types.ObjectId(user.userId),
        diaries: [],
        moments: [],
        momentClasses: [],
        currentDiaryId: null,
        scratchpad: '',
        mood: { emoji: '🌸', text: 'Peaceful & Content', time: Date.now() },
      });
      await vault.save();
    }

    res.json({
      success: true,
      vault: {
        diaries: vault.diaries || [],
        moments: vault.moments || [],
        momentClasses: vault.momentClasses || [],
        currentDiaryId: vault.currentDiaryId || null,
        scratchpad: vault.scratchpad || '',
        mood: vault.mood || { emoji: '🌸', text: 'Peaceful & Content', time: Date.now() },
      },
    });
  } catch (error) {
    console.error('[Personal] Error fetching vault data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch personal vault data' });
  }
});

// 7. Sync & Save user's Personal Vault into MongoDB
router.post('/vault-sync', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { diaries, moments, momentClasses, currentDiaryId, scratchpad, mood } = req.body;

    const vault = await PersonalVault.findOneAndUpdate(
      {
        spaceId: new Types.ObjectId(user.spaceId),
        userId: new Types.ObjectId(user.userId),
      },
      {
        $set: {
          diaries: Array.isArray(diaries) ? diaries : [],
          moments: Array.isArray(moments) ? moments : [],
          momentClasses: Array.isArray(momentClasses) ? momentClasses : [],
          currentDiaryId: currentDiaryId || null,
          scratchpad: typeof scratchpad === 'string' ? scratchpad : '',
          mood: mood || { emoji: '🌸', text: 'Peaceful & Content', time: Date.now() },
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Personal vault securely saved to MongoDB database' });
  } catch (error) {
    console.error('[Personal] Error syncing vault data:', error);
    res.status(500).json({ success: false, message: 'Failed to save personal vault data' });
  }
});

export default router;
