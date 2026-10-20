import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import { Readable } from 'stream';
import { getGridFSBucket } from '../config/db.js';
import { User } from '../models/User.js';
import { CoupleSpace } from '../models/CoupleSpace.js';
import { Scratchbook } from '../models/Scratchbook.js';
import { authenticateToken } from '../middleware/auth.js';
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max avatar size
});
const JWT_SECRET = process.env.JWT_SECRET || 'heartly_super_secure_jwt_secret_key_2026_duo';
const generateToken = (userId, email, name, spaceId) => {
    return jwt.sign({ userId, email, name, spaceId }, JWT_SECRET, { expiresIn: '365d' });
};
// 1. User Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ error: 'Name, email, and password are required' });
            return;
        }
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            res.status(400).json({ error: 'User with this email already exists' });
            return;
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            name,
            email: email.toLowerCase(),
            passwordHash,
        });
        const token = generateToken(user._id.toString(), user.email, user.name);
        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                spaceId: null,
            },
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error registering user' });
    }
});
// 2. User Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
        const token = generateToken(user._id.toString(), user.email, user.name, user.spaceId?.toString());
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                spaceId: user.spaceId || null,
            },
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});
// 3. Create Couple Space (Partner A)
router.post('/space/create', authenticateToken, async (req, res) => {
    try {
        const { spaceName, masterPassword } = req.body;
        const user = await User.findById(req.user?.userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (user.spaceId) {
            res.status(400).json({ error: 'You are already in a couple space' });
            return;
        }
        if (!spaceName || !masterPassword) {
            res.status(400).json({ error: 'Space name and master password are required' });
            return;
        }
        // Hash the Master Space Password (which protects access on opening the app)
        const masterPasswordHash = await bcrypt.hash(masterPassword, 12);
        // Generate a 6-character unique pairing code (e.g. "LOVE24", "HUG888")
        const pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const pairingExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const spaceSalt = crypto.randomBytes(32).toString('hex');
        const space = await CoupleSpace.create({
            spaceName,
            masterPasswordHash,
            spaceSalt,
            pairingCode,
            pairingExpiresAt,
            members: [
                {
                    userId: user._id,
                    displayName: user.name,
                    joinedAt: new Date(),
                },
            ],
        });
        // Update User with spaceId
        user.spaceId = space._id;
        await user.save();
        // Automatically create the initial Scratchbook for this space
        await Scratchbook.create({
            spaceId: space._id,
            title: `${spaceName}'s Scratchbook`,
            elements: [],
            version: 1,
            lastEditedBy: user._id,
        });
        const token = generateToken(user._id.toString(), user.email, user.name, space._id.toString());
        res.status(201).json({
            message: 'Couple Space created successfully!',
            token,
            space: {
                id: space._id,
                spaceName: space.spaceName,
                pairingCode: space.pairingCode,
                pairingExpiresAt: space.pairingExpiresAt,
                membersCount: space.members.length,
            },
        });
    }
    catch (error) {
        console.error('Create space error:', error);
        res.status(500).json({ error: 'Failed to create couple space' });
    }
});
// 4. Join Couple Space via Pairing Code (Partner B)
router.post('/space/join', authenticateToken, async (req, res) => {
    try {
        const { pairingCode, masterPassword } = req.body;
        const user = await User.findById(req.user?.userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (user.spaceId) {
            res.status(400).json({ error: 'You are already in a couple space' });
            return;
        }
        if (!pairingCode || !masterPassword) {
            res.status(400).json({ error: 'Pairing code and master password are required' });
            return;
        }
        // Find space by pairing code
        const space = await CoupleSpace.findOne({
            pairingCode: pairingCode.trim().toUpperCase(),
        });
        if (!space) {
            res.status(404).json({ error: 'Invalid pairing code' });
            return;
        }
        if (space.pairingExpiresAt && space.pairingExpiresAt < new Date()) {
            res.status(400).json({ error: 'Pairing code has expired' });
            return;
        }
        if (space.members.length >= 2 || space.isReserved) {
            const reservedNames = space.members.map((m) => m.displayName).join(' & ');
            res.status(403).json({
                error: `This space is permanently reserved for ${reservedNames || 'two partners'} only. No additional persons can ever join.`,
            });
            return;
        }
        // Verify the master space password
        const isPasswordValid = await bcrypt.compare(masterPassword, space.masterPasswordHash);
        if (!isPasswordValid) {
            res.status(401).json({ error: 'Incorrect master space password' });
            return;
        }
        // Add Partner B as second member
        space.members.push({
            userId: user._id,
            displayName: user.name,
            joinedAt: new Date(),
        });
        // Once two persons enter, permanently reserve space and invalidate pairing code
        space.isReserved = true;
        space.pairingCode = null;
        space.pairingExpiresAt = null;
        await space.save();
        // Broadcast real-time event to partner in space room
        const io = req.app.get('io');
        if (io) {
            io.to(`space:${space._id}`).emit('space:paired', {
                spaceId: space._id,
                spaceName: space.spaceName,
                members: space.members.map((m) => ({ name: m.displayName, displayName: m.displayName, joinedAt: m.joinedAt })),
                isFullyPaired: true,
                isReserved: true,
            });
        }
        // Update User with spaceId
        user.spaceId = space._id;
        await user.save();
        const token = generateToken(user._id.toString(), user.email, user.name, space._id.toString());
        res.json({
            message: 'Successfully joined your couple space!',
            token,
            space: {
                id: space._id,
                spaceName: space.spaceName,
                isReserved: true,
                isFullyPaired: true,
                members: space.members.map((m) => ({ name: m.displayName, displayName: m.displayName, joinedAt: m.joinedAt })),
            },
        });
    }
    catch (error) {
        console.error('Join space error:', error);
        res.status(500).json({ error: 'Failed to join couple space' });
    }
});
// 5. Unlock Space on App Open (Validates Master Password)
router.post('/space/unlock', authenticateToken, async (req, res) => {
    try {
        const { masterPassword } = req.body;
        if (!req.user?.spaceId) {
            res.status(400).json({ error: 'No couple space associated with this user' });
            return;
        }
        const space = await CoupleSpace.findById(req.user.spaceId);
        if (!space) {
            res.status(404).json({ error: 'Couple space not found' });
            return;
        }
        const isValid = await bcrypt.compare(masterPassword, space.masterPasswordHash);
        if (!isValid) {
            res.status(401).json({ error: 'Incorrect space password' });
            return;
        }
        res.json({
            unlocked: true,
            spaceName: space.spaceName,
            spaceSalt: space.spaceSalt,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Error unlocking space' });
    }
});
// 6. Get Current Profile & Space Info
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user?.userId).select('-passwordHash');
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        let space = null;
        let membersWithAvatars = [];
        if (user.spaceId) {
            space = await CoupleSpace.findById(user.spaceId).select('-masterPasswordHash');
            if (space) {
                const memberUserIds = space.members.map((m) => m.userId);
                const memberUsers = await User.find({ _id: { $in: memberUserIds } }).select('_id name avatarUrl');
                const userMap = new Map(memberUsers.map((u) => [u._id.toString(), u]));
                membersWithAvatars = space.members.map((m) => {
                    const u = userMap.get(m.userId.toString());
                    return {
                        userId: m.userId,
                        name: m.displayName,
                        displayName: m.displayName,
                        avatarUrl: u?.avatarUrl || '',
                        joinedAt: m.joinedAt,
                    };
                });
            }
        }
        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                spaceId: user.spaceId,
                avatarUrl: user.avatarUrl || '',
            },
            space: space
                ? {
                    id: space._id,
                    spaceName: space.spaceName,
                    pairingCode: space.pairingCode,
                    members: membersWithAvatars,
                    isFullyPaired: space.members.length === 2,
                    isReserved: space.isReserved || space.members.length === 2,
                }
                : null,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
// 7. Upload / Update Personal Profile Picture (Only logged-in user can update their own)
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ error: 'Avatar image file is required' });
            return;
        }
        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const bucket = getGridFSBucket();
        const filename = `avatar-${userId}-${Date.now()}-${req.file.originalname}`;
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: req.file.mimetype,
            metadata: {
                uploadedBy: userId,
                type: 'avatar',
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
        const avatarUrl = `/api/gallery/media/${uploadStream.id}`;
        user.avatarUrl = avatarUrl;
        await user.save();
        // Real-time broadcast to partner in space
        const io = req.app.get('io');
        if (io && user.spaceId) {
            io.to(user.spaceId.toString()).emit('user:avatar_updated', {
                userId: user._id.toString(),
                name: user.name,
                avatarUrl,
            });
        }
        res.json({
            success: true,
            avatarUrl,
            user: {
                id: user._id,
                name: user.name,
                avatarUrl: user.avatarUrl,
            },
        });
    }
    catch (error) {
        console.error('Error uploading avatar:', error);
        res.status(500).json({ error: 'Failed to upload profile picture' });
    }
});
export default router;
