import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { Scratchbook } from '../models/Scratchbook.js';
const JWT_SECRET = process.env.JWT_SECRET || 'heartly_super_secure_jwt_secret_key_2026_duo';
// Map of spaceId string -> Map of socketId -> { userId: string, name: string }
const spaceSockets = new Map();
export const setupSocketServer = (io) => {
    // Authentication middleware for Socket.IO
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
        if (!token) {
            return next(new Error('Authentication token required'));
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (!decoded.spaceId) {
                return next(new Error('User does not belong to an active space'));
            }
            socket.user = decoded;
            next();
        }
        catch (err) {
            return next(new Error('Invalid socket authentication token'));
        }
    });
    io.on('connection', (socket) => {
        const user = socket.user;
        const spaceIdStr = (user.spaceId || '').toString();
        const spaceRoom = `space:${spaceIdStr}`;
        socket.join(spaceRoom);
        console.log(`[Socket] User ${user.name} (${user.userId}) joined room ${spaceRoom}`);
        if (!spaceSockets.has(spaceIdStr)) {
            spaceSockets.set(spaceIdStr, new Map());
        }
        const spaceMap = spaceSockets.get(spaceIdStr);
        // Check if partner is already online in this space
        const otherConnectedUser = Array.from(spaceMap.values()).find((u) => u.userId.toString() !== user.userId.toString());
        // If partner is already online, inform this newly connected socket immediately!
        if (otherConnectedUser) {
            socket.emit('partner:presence', {
                userId: otherConnectedUser.userId,
                name: otherConnectedUser.name,
                status: 'online',
                timestamp: Date.now(),
            });
        }
        // Register this socket connection
        spaceMap.set(socket.id, { userId: user.userId, name: user.name });
        // Notify other sockets in the room that this user is online
        socket.to(spaceRoom).emit('partner:presence', {
            userId: user.userId,
            name: user.name,
            status: 'online',
            timestamp: Date.now(),
        });
        // Handle client presence status query
        socket.on('presence:query', () => {
            const currentMap = spaceSockets.get(spaceIdStr);
            if (currentMap) {
                const partner = Array.from(currentMap.values()).find((u) => u.userId.toString() !== user.userId.toString());
                if (partner) {
                    socket.emit('partner:presence', {
                        userId: partner.userId,
                        name: partner.name,
                        status: 'online',
                        timestamp: Date.now(),
                    });
                    return;
                }
            }
            socket.emit('partner:presence', {
                status: 'offline',
                timestamp: Date.now(),
            });
        });
        // 1. Live scratchbook drawing stroke broadcast (streaming coordinates)
        socket.on('scratch:stroke_live', (data) => {
            socket.to(spaceRoom).emit('scratch:stroke_live', {
                authorId: user.userId,
                authorName: user.name,
                ...data,
            });
        });
        // 2. Element Upsert (Sticky note, sticker, finished stroke, text note, polaroid)
        socket.on('scratch:element_upsert', (data) => {
            try {
                const element = data.element || data;
                const scratchbookId = data.scratchbookId;
                element.authorId = user.userId;
                element.authorName = user.name;
                element.updatedAt = element.updatedAt || Date.now();
                // Broadcast immediately to partner for zero perceived lag
                // Persistence to MongoDB is canonically handled by the REST endpoint API.syncScratchElement
                socket.to(spaceRoom).emit('scratch:element_upsert', { element, scratchbookId });
            }
            catch (err) {
                console.error('[Socket] Failed to broadcast element upsert:', err);
            }
        });
        // 3. Element Delete
        socket.on('scratch:element_delete', async (data) => {
            try {
                const elementId = typeof data === 'string' ? data : data.elementId;
                const scratchbookId = typeof data === 'object' ? data.scratchbookId : undefined;
                socket.to(spaceRoom).emit('scratch:element_delete', { elementId, scratchbookId });
                let query = { spaceId: new Types.ObjectId(user.spaceId) };
                if (scratchbookId && Types.ObjectId.isValid(scratchbookId)) {
                    query._id = new Types.ObjectId(scratchbookId);
                }
                else {
                    query['elements.id'] = elementId;
                }
                await Scratchbook.updateOne(query, {
                    $pull: { elements: { id: elementId } },
                    $inc: { version: 1 },
                    $set: { lastEditedBy: new Types.ObjectId(user.userId) },
                });
            }
            catch (err) {
                console.error('[Socket] Failed to delete element from MongoDB:', err);
            }
        });
        // 3.1 Background Color Change Real-Time Broadcast
        socket.on('scratch:background_change', async (data) => {
            try {
                socket.to(spaceRoom).emit('scratch:background_change', data);
                if (data.scratchbookId && Types.ObjectId.isValid(data.scratchbookId)) {
                    await Scratchbook.updateOne({ _id: new Types.ObjectId(data.scratchbookId), spaceId: new Types.ObjectId(user.spaceId) }, { $set: { backgroundColor: data.backgroundColor, lastEditedBy: new Types.ObjectId(user.userId) } });
                }
            }
            catch (err) {
                console.error('[Socket] Failed to persist background change:', err);
            }
        });
        // 3.2 Scratchbook Title Rename Real-Time Broadcast
        socket.on('scratch:book_rename', async (data) => {
            try {
                socket.to(spaceRoom).emit('scratch:book_rename', data);
                if (data.scratchbookId && Types.ObjectId.isValid(data.scratchbookId)) {
                    await Scratchbook.updateOne({ _id: new Types.ObjectId(data.scratchbookId), spaceId: new Types.ObjectId(user.spaceId) }, { $set: { title: data.title.trim(), lastEditedBy: new Types.ObjectId(user.userId) } });
                }
            }
            catch (err) {
                console.error('[Socket] Failed to persist book rename:', err);
            }
        });
        // 3.3 Scratchbook Switched Broadcast
        socket.on('scratch:book_switched', (data) => {
            socket.to(spaceRoom).emit('scratch:book_switched', {
                ...data,
                switchedByName: user.name,
            });
        });
        // 3.4 Scratchbook Clear Broadcast
        socket.on('scratch:clear', async (data) => {
            try {
                const scratchbookId = data?.scratchbookId;
                socket.to(spaceRoom).emit('scratch:clear', { scratchbookId });
                let query = { spaceId: new Types.ObjectId(user.spaceId) };
                if (scratchbookId && Types.ObjectId.isValid(scratchbookId)) {
                    query._id = new Types.ObjectId(scratchbookId);
                }
                await Scratchbook.updateOne(query, {
                    $set: { elements: [], lastEditedBy: new Types.ObjectId(user.userId) },
                    $inc: { version: 1 },
                });
            }
            catch (err) {
                console.error('[Socket] Failed to clear scratchbook elements:', err);
            }
        });
        // 4. Send Heartbeat Pulse to Partner
        socket.on('presence:heartbeat', () => {
            socket.to(spaceRoom).emit('presence:heartbeat', {
                fromName: user.name,
                timestamp: Date.now(),
            });
        });
        // 5. User Activity indicator ("typing", "drawing")
        socket.on('partner:activity', (activity) => {
            socket.to(spaceRoom).emit('partner:activity', {
                name: user.name,
                action: activity.action,
            });
        });
        // 6. Real-Time Chat Message Broadcast
        socket.on('chat:send', (message) => {
            socket.to(spaceRoom).emit('chat:message', message);
        });
        // 7. Chat Typing Indicator
        socket.on('chat:typing', (isTyping) => {
            socket.to(spaceRoom).emit('chat:typing', {
                name: user.name,
                isTyping,
            });
        });
        // 7.1 Chat Reaction Broadcast
        socket.on('chat:reaction', (data) => {
            socket.to(spaceRoom).emit('chat:reaction', data);
        });
        // 7.2 Chat Read Receipts Broadcast (Delivered/Seen)
        socket.on('chat:read', (data) => {
            socket.to(spaceRoom).emit('chat:read', data);
        });
        // 7.3 Chat Message Deleted Broadcast (Delete for Everyone)
        socket.on('chat:message_deleted', (data) => {
            socket.to(spaceRoom).emit('chat:message_deleted', data);
        });
        // 7.4 Chat Message Pinned / Unpinned Broadcast
        socket.on('chat:pin_toggled', (data) => {
            socket.to(spaceRoom).emit('chat:pin_toggled', data);
        });
        // 7.5 Shared Chat Wallpaper Change Broadcast
        socket.on('chat:wallpaper_change', (data) => {
            socket.to(spaceRoom).emit('chat:wallpaper_change', data);
        });
        // 7.6 Shared Magic Words Update Broadcast
        socket.on('chat:magic_words_update', (data) => {
            socket.to(spaceRoom).emit('chat:magic_words_update', data);
        });
        // 7.7 Interactive Romantic Particle Burst Broadcast
        socket.on('chat:trigger_burst', (data) => {
            socket.to(spaceRoom).emit('chat:trigger_burst', data);
        });
        // 8. Date Proposal Broadcast
        socket.on('date:proposed', (datePlan) => {
            socket.to(spaceRoom).emit('date:proposed', datePlan);
        });
        // 9. Date Response Broadcast (Accepted / Declined)
        socket.on('date:responded', (data) => {
            socket.to(spaceRoom).emit('date:responded', data);
        });
        // 10. Date Deleted / Cancelled Broadcast
        socket.on('date:deleted', (data) => {
            socket.to(spaceRoom).emit('date:deleted', data);
        });
        // 11. Real-Time Shared Dreams Broadcast
        socket.on('dream:created', (data) => {
            socket.to(spaceRoom).emit('dream:created', data);
        });
        socket.on('dream:updated', (data) => {
            socket.to(spaceRoom).emit('dream:updated', data);
        });
        socket.on('dream:deleted', (data) => {
            socket.to(spaceRoom).emit('dream:deleted', data);
        });
        socket.on('dreams:cleared', () => {
            socket.to(spaceRoom).emit('dreams:cleared');
        });
        // 12. Real-Time Memory Gallery Broadcast
        socket.on('gallery:created', (data) => {
            socket.to(spaceRoom).emit('gallery:created', data);
        });
        socket.on('gallery:deleted', (data) => {
            socket.to(spaceRoom).emit('gallery:deleted', data);
        });
        socket.on('gallery:comment_added', (data) => {
            socket.to(spaceRoom).emit('gallery:comment_added', data);
        });
        socket.on('gallery:reaction', (data) => {
            socket.to(spaceRoom).emit('gallery:reaction', data);
        });
        socket.on('gallery:genre_updated', (data) => {
            socket.to(spaceRoom).emit('gallery:genre_updated', data);
        });
        // 13. Profile & Avatar Live Update Broadcast
        socket.on('user:avatar_updated', (data) => {
            socket.to(spaceRoom).emit('user:avatar_updated', {
                userId: data.userId || user.userId,
                name: data.name || user.name,
                avatarUrl: data.avatarUrl,
            });
        });
        socket.on('disconnect', () => {
            console.log(`[Socket] User ${user.name} disconnected`);
            const currentMap = spaceSockets.get(spaceIdStr);
            if (currentMap) {
                currentMap.delete(socket.id);
                const stillConnected = Array.from(currentMap.values()).some((u) => u.userId.toString() === user.userId.toString());
                if (!stillConnected) {
                    socket.to(spaceRoom).emit('partner:presence', {
                        userId: user.userId,
                        name: user.name,
                        status: 'offline',
                        timestamp: Date.now(),
                    });
                }
                if (currentMap.size === 0) {
                    spaceSockets.delete(spaceIdStr);
                }
            }
        });
    });
};
