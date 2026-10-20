
const { app } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

app.whenReady().then(async () => {
  try {
    const serverPath = path.resolve('dist/server.js');
    console.log('[Test] Importing:', serverPath);
    await import(pathToFileURL(serverPath).href);
    console.log('[Test] In-process server loaded successfully!');
    setTimeout(() => {
      app.quit();
    }, 2000);
  } catch (err) {
    console.error('[Test] Failed:', err);
    app.quit();
  }
});
