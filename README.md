# Heartly — Private Sanctuary for Two (MongoDB Edition)

Heartly is a private, secure couples application designed exclusively for two lovers. It provides an encrypted, intimate space containing a **Shared Gallery with Dates & Comments** and a **Real-Time Collaborative Scratchbook** powered entirely by **MongoDB** and **MongoDB GridFS**.

---

## 🌟 Key Features

1. **Strict Two-Party Account Isolation**:
   - Each couple account has a custom **Space Name** and a unique **Master Space Passcode**.
   - App lock protection: The master space passcode is required every time the app is opened.
   - 6-character partner pairing code: Once partner B joins, the space permanently locks to a maximum of 2 members.

2. **Shared Timeline Gallery (Powered by MongoDB GridFS)**:
   - High-resolution photo uploads stored natively in **MongoDB GridFS** (no third-party cloud buckets required).
   - Chronological memory timeline organized by event/memory dates.
   - Real-time threaded comments and heart reactions (`❤️`, `🥰`, etc.).

3. **Collaborative Shared Scratchbook**:
   - Real-time cross-platform shared canvas for freehand drawing, stickers, and draggable sticky notes.
   - Synchronized over WebSockets via **Socket.IO** and persisted to MongoDB with deterministic conflict resolution and versioning.
   - Tactile presence: "Partner is drawing..." indicator and real-time heartbeat pulse alerts (`💓`).

---

## 🏗️ Architecture

```
Heartly/
├── src/
│   ├── config/
│   │   └── db.ts           # MongoDB connection & GridFS bucket initialization
│   ├── models/
│   │   ├── User.ts         # Individual credentials (bcrypt) & space link
│   │   ├── CoupleSpace.ts  # Space Name, Master Passcode hash, pairing code, max 2 members
│   │   ├── GalleryItem.ts  # GridFS file ID reference, dates, captions, comments, reactions
│   │   └── Scratchbook.ts  # Canvas strokes, sticky notes, stickers, version vector
│   ├── middleware/
│   │   └── auth.ts         # JWT authentication & Space isolation guards
│   ├── routes/
│   │   ├── auth.ts         # Register, Login, Space Creation, Partner Join, Passcode Unlock
│   │   ├── gallery.ts      # GridFS photo upload, streaming, comments, reactions
│   │   └── scratchbook.ts  # Canvas fetch, element upsert, delete, clear
│   ├── sockets/
│   │   └── syncHandler.ts  # Socket.IO real-time sync for scratchbook strokes & presence
│   └── server.ts           # Express + HTTP + Socket.IO server
└── public/
    ├── index.html          # Responsive Web & Mobile client
    ├── css/style.css       # Romantic, cozy design system
    └── js/
        ├── api.js          # REST API & token manager
        ├── socket.js       # Real-time WebSockets & presence handler
        ├── gallery.js      # Gallery rendering, dates, comments & reactions
        ├── scratchbook.js  # Live 2D drawing canvas & draggable sticky notes
        └── app.js          # Master passcode lock & app state orchestration
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** (v18+)
- **MongoDB**: Either a local MongoDB instance (`mongodb://127.0.0.1:27017/heartly`) OR a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster URI.

### 2. Configure Environment
Check or edit `.env`:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/heartly
JWT_SECRET=heartly_super_secure_jwt_secret_key_2026_duo
NODE_ENV=development
```

*(If using MongoDB Atlas, replace `MONGODB_URI` with your connection string: `mongodb+srv://<username>:<password>@cluster0.mongodb.net/heartly?retryWrites=true&w=majority`)*

### 3. Run the Windows App 🪟
You have two easy ways to launch Heartly as a native Windows application:

**Option A (One-Click):**
Double-click [`Heartly.bat`](file:///c:/Users/USER/OneDrive/Desktop/project%20HUB/Heartly/Heartly.bat) in the project folder!

**Option B (Command Line):**
```powershell
npm run windows
```

*This will automatically launch the embedded MongoDB backend and open the dedicated Heartly Windows desktop application window with full system tray and real-time syncing!*

---

## 🧪 Testing Multi-User Cross-Platform Sync

To test real-time pairing and simultaneous editing:

1. Open **Browser Window 1** (e.g. Chrome):
   - Register **Partner A** (e.g. Leo).
   - Click **Create Space** -> Name: `Maya & Leo`, Master Passcode: `secret123`.
   - You will see the **Invite Partner Code** badge (e.g. `LOVE24`).

2. Open **Browser Window 2** (e.g. Incognito / Edge / Phone on same Wi-Fi):
   - Register **Partner B** (e.g. Maya).
   - Click **Join with Code** -> Enter the 6-character code (`LOVE24`) + Master Passcode (`secret123`).
   - Both windows will immediately enter the shared space!

3. **Test Gallery**:
   - Upload a photo with a memory date and caption in Window 1.
   - Photo is saved directly into **MongoDB GridFS**.
   - Window 2 sees the new memory, can add comments and click ❤️.

4. **Test Shared Scratchbook**:
   - Switch both windows to the **Shared Scratchbook** tab.
   - Draw or place a sticky note in Window 1 — watch it sync in real-time on Window 2!
   - Click **Send Heartbeat** to send an instant pulse to your partner.

5. **Test App Opening Passcode**:
   - Click **🔒 Lock** in either window.
   - The app instantly locks behind the **Master Space Passcode**. Content cannot be accessed without entering the password.
