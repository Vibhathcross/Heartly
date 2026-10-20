import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { DatePlan } from '../models/DatePlan.js';
import { AuthenticatedRequest, authenticateToken, requireCoupleSpace } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);
router.use(requireCoupleSpace);

// 1. Get all date plans for the space
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const spaceId = req.user!.spaceId!;
    const dates = await DatePlan.find({ spaceId: new Types.ObjectId(spaceId) })
      .sort({ date: 1, time: 1 })
      .lean();

    res.json({ dates });
  } catch (error) {
    console.error('Fetch dates error:', error);
    res.status(500).json({ error: 'Failed to fetch dates' });
  }
});

// 2. Propose / Send a new Date Request (starts as 'pending')
router.post('/request', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { title, date, time, location, notes } = req.body;
    if (!title || !date) {
      res.status(400).json({ error: 'Date title and date are required' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const senderId = req.user!.userId;
    const senderName = req.user!.name;

    const datePlan = await DatePlan.create({
      spaceId: new Types.ObjectId(spaceId),
      senderId: new Types.ObjectId(senderId),
      senderName,
      title: title.trim(),
      date: new Date(date),
      time: time || '19:00',
      location: location || '',
      notes: notes || '',
      status: 'pending',
    });

    res.status(201).json({
      message: 'Date request sent to partner! ❤️',
      datePlan,
    });
  } catch (error) {
    console.error('Create date request error:', error);
    res.status(500).json({ error: 'Failed to create date request' });
  }
});

// 3. Respond to Date Request (Accept or Decline)
router.put('/:id/respond', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'accepted' or 'declined'

    if (!['accepted', 'declined'].includes(action)) {
      res.status(400).json({ error: 'Action must be "accepted" or "declined"' });
      return;
    }

    const spaceId = req.user!.spaceId!;
    const datePlan = await DatePlan.findOne({
      _id: new Types.ObjectId(id),
      spaceId: new Types.ObjectId(spaceId),
    });

    if (!datePlan) {
      res.status(404).json({ error: 'Date plan not found' });
      return;
    }

    // Only the recipient (other partner) can accept or decline
    if (datePlan.senderId.toString() === req.user!.userId) {
      res.status(403).json({
        error: 'You proposed this date. Only your partner can accept or decline this request.',
      });
      return;
    }

    datePlan.status = action;
    datePlan.respondedBy = new Types.ObjectId(req.user!.userId);
    datePlan.respondedAt = new Date();
    await datePlan.save();

    res.json({
      message: action === 'accepted' ? 'Date accepted and locked on your calendar! 🎉' : 'Date proposal declined.',
      datePlan,
    });
  } catch (error) {
    console.error('Respond to date error:', error);
    res.status(500).json({ error: 'Failed to update date plan' });
  }
});

// 4. Delete Date Plan
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const spaceId = req.user!.spaceId!;

    await DatePlan.findOneAndDelete({
      _id: new Types.ObjectId(id),
      spaceId: new Types.ObjectId(spaceId),
    });

    res.json({ message: 'Date plan removed.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete date plan' });
  }
});

export default router;
