const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { spawn } = require('child_process');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.log('[Heartly AutoUpdater] electron-updater module not present; auto-updates disabled for this mode.');
}

let mainWindow = null;
let tray = null;
let serverProcess = null;

// Resolve app root directory across dev and packaged electron modes
function getAppRootDir() {
  const candidates = [
    path.join(__dirname, '..'),
    path.join(process.resourcesPath || '', 'app'),
    app.getAppPath()
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'package.json'))) return p;
  }
  return path.join(__dirname, '..');
}

// Load .env configuration
function loadEnv() {
  const rootDir = getAppRootDir();
  const envCandidates = [
    path.join(rootDir, '.env'),
    path.join(process.resourcesPath || '', '.env'),
    path.join(process.resourcesPath || '', 'app/.env'),
    path.join(path.dirname(process.execPath || ''), '.env')
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        require('dotenv').config({ path: envPath });
        console.log(`[Heartly Windows] Loaded environment from: ${envPath}`);
        break;
      } catch (e) {
        console.warn('[Heartly Windows] dotenv load warning:', e.message);
      }
    }
  }
}

loadEnv();

const PORT = process.env.PORT || 5000;
// Remote URL takes precedence if set, otherwise fallback to local server
const REMOTE_SERVER_URL = (process.env.REMOTE_URL || process.env.SERVER_URL || '').trim();
const LOCAL_SERVER_URL = `http://localhost:${PORT}`;
const TARGET_SERVER_URL = REMOTE_SERVER_URL || LOCAL_SERVER_URL;

console.log(`[Heartly Windows] Target Server URL: ${TARGET_SERVER_URL} (Remote: ${!!REMOTE_SERVER_URL})`);

// Resolve actual location of dist/server.js across dev and packaged modes
function getServerEntryPath() {
  const candidates = [
    path.join(__dirname, '../dist/server.js'),
    path.join(process.resourcesPath || '', 'app/dist/server.js'),
    path.join(process.resourcesPath || '', 'dist/server.js'),
    path.join(app.getAppPath(), 'dist/server.js')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '../dist/server.js');
}

function getSplashPath() {
  const candidates = [
    path.join(__dirname, '../public/splash.html'),
    path.join(process.resourcesPath || '', 'app/public/splash.html'),
    path.join(app.getAppPath(), 'public/splash.html')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '../public/splash.html');
}

// Check if server is already running / healthy (works for both http and https)
function checkServerReady(url, callback, maxRetries = 60) {
  let retries = 0;
  const isHttps = url.startsWith('https://');
  const client = isHttps ? https : http;

  const interval = setInterval(() => {
    retries++;
    try {
      const healthUrl = `${url.replace(/\/$/, '')}/api/health`;
      const req = client.get(healthUrl, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          callback(true);
        }
      });

      req.on('error', () => {
        if (retries >= maxRetries) {
          clearInterval(interval);
          callback(false);
        }
      });

      req.setTimeout(3000, () => {
        req.destroy();
      });
    } catch (e) {
      if (retries >= maxRetries) {
        clearInterval(interval);
        callback(false);
      }
    }
  }, 400);
}

// Start the Node.js/MongoDB backend in-process or via spawn (only used if running locally)
async function startBackendServer() {
  if (REMOTE_SERVER_URL) {
    console.log('[Heartly Windows] Remote cloud server configured; skipping local backend spawn.');
    return;
  }

  console.log('[Heartly Windows] Starting local backend server...');
  const serverPath = getServerEntryPath();
  const rootDir = getAppRootDir();
  console.log(`[Heartly Windows] Resolved server path: ${serverPath}`);

  // 1. Try dynamic in-process import
  try {
    const { pathToFileURL } = require('url');
    const serverUrl = pathToFileURL(serverPath).href;
    await import(serverUrl);
    console.log('[Heartly Windows] In-process server loaded successfully.');
    return;
  } catch (err) {
    console.warn('[Heartly Windows] In-process import note (falling back to process spawn):', err.message);
  }

  // 2. Fallback: spawn node process
  try {
    const isPackaged = app.isPackaged;
    const execCmd = isPackaged ? process.execPath : (process.platform === 'win32' ? 'node.exe' : 'node');
    const spawnEnv = isPackaged
      ? { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: PORT.toString() }
      : { ...process.env, PORT: PORT.toString() };

    serverProcess = spawn(execCmd, [serverPath], {
      cwd: rootDir,
      stdio: 'pipe',
      env: spawnEnv
    });

    serverProcess.stdout?.on('data', (d) => {
      console.log('[Heartly Backend]', d.toString().trim());
    });
    serverProcess.stderr?.on('data', (d) => {
      console.error('[Heartly Backend Error]', d.toString().trim());
    });
    serverProcess.on('error', (e) => console.error('[Heartly Server Spawn Error]:', e));
  } catch (spawnErr) {
    console.error('[Heartly Spawn Fallback Error]:', spawnErr);
  }
}

function getAppIconPath() {
  const icoPath = path.join(__dirname, '../public/heartly.ico');
  const pngPath = path.join(__dirname, '../public/app-icon.png');
  if (process.platform === 'win32' && fs.existsSync(icoPath)) {
    return icoPath;
  }
  return pngPath;
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const iconPath = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: 'Heartly — Private Sanctuary for Two',
    backgroundColor: '#120816',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:heartly',
    },
    autoHideMenuBar: true,
    show: true, // Visible immediately with the animated heart splash screen
  });

  // Always display romantic splash screen with 3D folding heart immediately on launch
  const splashPath = getSplashPath();
  if (fs.existsSync(splashPath)) {
    mainWindow.loadFile(splashPath).catch((err) => {
      console.warn('[Heartly] Splash load note:', err.message);
    });
  }

  // Navigate to application URL
  const navigateToApp = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(TARGET_SERVER_URL).catch((err) => {
        console.warn('[Heartly] Navigation error:', err.message);
      });
    }
  };

  // Wait for health check before loading main app
  checkServerReady(TARGET_SERVER_URL, (ready) => {
    if (ready) {
      console.log('[Heartly] Target server ready! Transitioning from splash to sanctuary...');
      // Brief aesthetic pause to let the folding heart finish a cycle
      setTimeout(() => {
        navigateToApp();
      }, 700);
    } else {
      console.warn('[Heartly] Health check timeout, attempting direct navigation');
      navigateToApp();
    }
  });

  // If loading failed because server was still waking up, retry automatically
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Heartly] Page load pending backend: ${errorDescription} (${errorCode}). Retrying...`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(TARGET_SERVER_URL).catch(() => {});
      }
    }, 1500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Automated update mechanism via GitHub Releases (https://github.com/Vibhathcross/Heartly)
function initAutoUpdater() {
  if (!autoUpdater) {
    console.log('[Heartly AutoUpdater] electron-updater not available; skipping update checks.');
    return;
  }
  if (!app.isPackaged) {
    console.log('[Heartly AutoUpdater] Development mode detected; automatic update checking inactive.');
    return;
  }

  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('[Heartly AutoUpdater] Checking GitHub Releases for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log(`[Heartly AutoUpdater] Update found: v${info.version}`);
      if (Notification.isSupported()) {
        try {
          new Notification({
            title: 'Heartly Sanctuary ♡',
            body: `A new version (v${info.version}) is available and downloading in the background...`,
            icon: getAppIconPath(),
          }).show();
        } catch (e) {}
      }
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[Heartly AutoUpdater] App is up to date.');
    });

    autoUpdater.on('error', (err) => {
      console.warn('[Heartly AutoUpdater] Update check notice:', err?.message || err);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[Heartly AutoUpdater] v${info.version} downloaded.`);
      if (Notification.isSupported()) {
        try {
          const notif = new Notification({
            title: 'Heartly Update Ready ✨',
            body: `Heartly v${info.version} is ready! Click here to restart and apply updates.`,
            icon: getAppIconPath(),
          });
          notif.on('click', () => {
            autoUpdater.quitAndInstall();
          });
          notif.show();
        } catch (e) {}
      }
    });

    // Check 6 seconds after startup, then every 2 hours
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('[Heartly AutoUpdater] Initial check notice:', err?.message);
      });
    }, 6000);

    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('[Heartly AutoUpdater] Periodic check notice:', err?.message);
      });
    }, 2 * 60 * 60 * 1000);
  } catch (err) {
    console.warn('[Heartly AutoUpdater] Initialization notice:', err?.message);
  }
}

// Native Windows Tray
function createTray() {
  if (tray) return;
  try {
    const iconPath = getAppIconPath();
    tray = new Tray(iconPath);
  } catch (e) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Heartly', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else { createWindow(); } } },
    { type: 'separator' },
    { label: 'Exit Heartly', click: () => { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Heartly — Private Sanctuary for Two');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Heartly] Another instance is running, forwarding focus and exiting redundant process.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.heartly.app');
    }

    // Auto-approve microphone permission for audio recording / voice notes
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        return callback(true);
      }
      callback(false);
    });

    // Always create tray and window
    createTray();
    createWindow();

    // Check for auto-updates across devices via GitHub
    initAutoUpdater();

    // If using local server, check if running or start it
    if (!REMOTE_SERVER_URL) {
      const isHttps = TARGET_SERVER_URL.startsWith('https://');
      const client = isHttps ? https : http;
      client.get(`${TARGET_SERVER_URL}/api/health`, (res) => {
        // Backend already active
      }).on('error', async () => {
        await startBackendServer();
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  if (serverProcess) {
    console.log('[Heartly] Terminating backend server process...');
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
