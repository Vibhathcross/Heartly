import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import galleryRoutes from './routes/gallery.js';
import scratchbookRoutes from './routes/scratchbook.js';
import chatRoutes from './routes/chat.js';
import dateRoutes from './routes/dates.js';
import dreamRoutes from './routes/dreams.js';
import personalRoutes from './routes/personal.js';
import aiRoutes from './routes/ai.js';
import { setupSocketServer } from './sockets/syncHandler.js';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
// Setup Socket.IO with CORS
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
});
app.set('io', io);
// Middlewares
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
// Serve frontend static files
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));
// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/scratchbook', scratchbookRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/dates', dateRoutes);
app.use('/api/dreams', dreamRoutes);
app.use('/api/personal', personalRoutes);
app.use('/api/ai', aiRoutes);
// Health check & version endpoints
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        app: 'Heartly',
        version: '1.2.2',
        storage: 'MongoDB + MongoDB GridFS',
        time: new Date().toISOString(),
    });
});
app.get('/api/version', (req, res) => {
    res.json({
        version: '1.2.2',
        app: 'Heartly',
        name: 'Heartly Sanctuary',
    });
});
// Setup Real-Time WebSockets
setupSocketServer(io);
// Catch-all route to serve the SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});
const PORT = process.env.PORT || 5000;
// Start server immediately so frontend and health check respond instantly
server.listen(PORT, () => {
    console.log(`
  ======================================================
  ❤️  HEARTLY - Private Couples App Server Running! ❤️
  ======================================================
  🚀 Web App URL : http://localhost:${PORT}
  🗄️  Database   : MongoDB + MongoDB GridFS (100% Native)
  ⚡ Real-Time   : Socket.IO WebSockets Active
  🔒 Isolation   : Strict Two-Party Space Encryption
  ======================================================
  `);
});
// Connect to MongoDB Atlas (Native Native Connection)
connectDB().catch((err) => {
    console.error('[Heartly] MongoDB connection error:', err?.message || err);
});
