const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

let mainWindow;

async function startBackend() {
  const isDev = !app.isPackaged;

  if (isDev) {
    console.log('Development mode - backend should be running separately');
    return true;
  }

  console.log('=== Starting Backend Server ===');

  try {
    const appPath = app.getAppPath();
    console.log('App path:', appPath);
    console.log('__dirname:', __dirname);
    console.log('process.resourcesPath:', process.resourcesPath);

    const serverPath = path.join(appPath, 'backend', 'server.js');
    console.log('Server path:', serverPath);

    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(serverPath)) {
      const msg = `Backend server not found at: ${serverPath}`;
      console.error(msg);
      dialog.showErrorBox('Backend Error', msg);
      return false;
    }

    // Set environment
    process.env.NODE_ENV = 'production';

    // Require and start the server (no chdir needed)
    console.log('Loading server module...');
    require(serverPath);
    console.log('Backend server started on port 3001!');
    return true;
  } catch (error) {
    const msg = `Failed to start backend: ${error.message}\n\nStack: ${error.stack}`;
    console.error(msg);
    dialog.showErrorBox('Backend Error', msg);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist', 'index.html');
    console.log('Loading UI from:', indexPath);

    // Check if index.html exists
    const fs = require('fs');
    if (!fs.existsSync(indexPath)) {
      const msg = `UI file not found at: ${indexPath}\n\nApp Path: ${appPath}\n__dirname: ${__dirname}\nResources: ${process.resourcesPath}`;
      console.error(msg);
      dialog.showErrorBox('Startup Error', msg);
    } else {
      mainWindow.loadFile(indexPath);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Start backend first
  const backendStarted = await startBackend();

  if (!backendStarted && app.isPackaged) {
    dialog.showErrorBox('Startup Error', 'Backend server failed to start. The app may not work correctly.');
  }

  // Give backend a moment to initialize
  setTimeout(() => {
    createWindow();
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
