import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { CoupleSpace } from '../models/CoupleSpace.js';

export interface AuthUserPayload {
  userId: string;
  email: string;
  name: string;
  spaceId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'heartly_super_secure_jwt_secret_key_2026_duo';

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query?.token as string);

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired session token' });
  }
};

export const requireCoupleSpace = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user?.spaceId) {
    res.status(403).json({ error: 'You are not part of an active couple space yet.' });
    return;
  }

  try {
    const space = await CoupleSpace.findById(req.user.spaceId);
    if (!space) {
      res.status(404).json({ error: 'Couple space not found.' });
      return;
    }

    // Verify user is in members list
    const isMember = space.members.some(
      (m) => m.userId.toString() === req.user?.userId
    );

    if (!isMember) {
      res.status(403).json({ error: 'Unauthorized: You are not a member of this space.' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Error validating space membership' });
  }
};
