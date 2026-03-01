/**
 * Sorryios AI - Client Desktop App
 * 
 * Reads server URL from config.json
 * - localhost: auto-starts backend
 * - remote: connects directly
 */

const { app, BrowserWindow, Menu, Tray, shell, dialog, globalShortcut, ipcMain } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

// ============================================================
// Load Config
// ============================================================
const CONFIG_PATH = path.join(__dirname, 'config.json');
let userConfig = { server: 'http://localhost:3000' };
try {
  userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.log('config.json not found, using defaults');
}

const SERVER_URL = userConfig.server.replace(/\/+$/, ''); // remove trailing slash
const APP_NAME = userConfig.appName || 'Sorryios AI';
const IS_LOCAL = SERVER_URL.includes('localhost') || SERVER_URL.includes('127.0.0.1');

const CONFIG = {
  APP_URL: SERVER_URL,
  STARTUP_TIMEOUT: 30000,
  POLL_INTERVAL: 500,
  WINDOW_WIDTH: 1360,
  WINDOW_HEIGHT: 860,
  MIN_WIDTH: 1024,
  MIN_HEIGHT: 700,
  MAX_LOG_LINES: 2000,
};

// Extract port from URL
function getPort() {
  try {
    const url = new URL(SERVER_URL);
    return url.port || (url.protocol === 'https:' ? '443' : '80');
  } catch (e) {
    return '3000';
  }
}

const PROJECT_ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');
const ICON_PATH = path.join(__dirname, 'app.ico');

let mainWindow = null;
let logWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;

// ============================================================
// Log Buffer
// ============================================================
const logBuffer = [];

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = '[' + ts + '] ' + msg;
  console.log(line);
  logBuffer.push(line);
  if (logBuffer.length > CONFIG.MAX_LOG_LINES) logBuffer.shift();
  if (logWindow && !logWindow.isDestroyed()) {
    try { logWindow.webContents.send('log-line', line); } catch (e) {}
  }
}

// ============================================================
// Kill port (Windows)
// ============================================================
function killPort(port) {
  try {
    if (process.platform === 'win32') {
      var result = execSync(
        'netstat -ano | findstr ":' + port + ' " | findstr "LISTENING"',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      if (result) {
        var pids = {};
        result.split('\n').forEach(function (line) {
          var parts = line.trim().split(/\s+/);
          var pid = parts[parts.length - 1];
          if (pid && pid !== '0') pids[pid] = true;
        });
        Object.keys(pids).forEach(function (pid) {
          try { execSync('taskkill /PID ' + pid + ' /T /F', { timeout: 5000 }); } catch (e) {}
        });
      }
    }
  } catch (e) {}
}

// ============================================================
// Check if server is reachable
// ============================================================
function checkServer() {
  return new Promise(function (resolve) {
    var getter = SERVER_URL.startsWith('https') ? https : http;
    var req = getter.get(SERVER_URL, { timeout: 3000 }, function (res) {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', function () { resolve(false); });
    req.on('timeout', function () { req.destroy(); resolve(false); });
  });
}

// ============================================================
// Start Local Backend (only when server is localhost)
// ============================================================
function startBackend() {
  return new Promise(function (resolve, reject) {
    log('Starting local backend...');

    if (!fs.existsSync(path.join(BACKEND_DIR, 'server.js'))) {
      reject(new Error('Cannot find backend/server.js'));
      return;
    }

    if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
      log('Installing backend dependencies...');
      try {
        execSync('npm install', { cwd: BACKEND_DIR, timeout: 120000 });
        log('Backend dependencies installed.');
      } catch (e) {
        reject(new Error('Failed to install backend deps: ' + e.message));
        return;
      }
    }

    var port = getPort();
    killPort(port);

    var env = {};
    Object.keys(process.env).forEach(function (k) { env[k] = process.env[k]; });
    env.PORT = String(port);
    env.NODE_ENV = 'production';
    env.SORRYIOS_DESKTOP = '1';

    backendProcess = spawn('node', ['server.js'], {
      cwd: BACKEND_DIR,
      env: env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    backendProcess.stdout.on('data', function (data) {
      data.toString().split('\n').forEach(function (line) {
        line = line.trim();
        if (line) log('[Backend] ' + line);
      });
    });

    backendProcess.stderr.on('data', function (data) {
      data.toString().split('\n').forEach(function (line) {
        line = line.trim();
        if (line) log('[Backend:err] ' + line);
      });
    });

    backendProcess.on('error', function (err) {
      log('Backend error: ' + err.message);
      reject(err);
    });

    backendProcess.on('exit', function (code) {
      log('Backend exited: ' + code);
      backendProcess = null;
      if (!isQuitting) {
        dialog.showErrorBox('Backend Error', 'Backend stopped unexpectedly.\nApp will close.');
        app.quit();
      }
    });

    var startTime = Date.now();
    function poll() {
      if (Date.now() - startTime > CONFIG.STARTUP_TIMEOUT) {
        reject(new Error('Backend timeout'));
        return;
      }
      checkServer().then(function (ok) {
        if (ok) {
          log('Backend is ready');
          resolve();
        } else {
          setTimeout(poll, CONFIG.POLL_INTERVAL);
        }
      });
    }
    setTimeout(poll, 1000);
  });
}

// ============================================================
// Stop Backend
// ============================================================
function stopBackend() {
  if (backendProcess) {
    isQuitting = true;
    if (process.platform === 'win32') {
      try { execSync('taskkill /PID ' + backendProcess.pid + ' /T /F', { timeout: 5000 }); } catch (e) {}
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
    if (IS_LOCAL) killPort(getPort());
  }
}

// ============================================================
// Frontend check/build (only for local mode)
// ============================================================
function isFrontendBuilt() {
  return fs.existsSync(path.join(BACKEND_DIR, 'public', 'app', 'index.html'));
}

function buildFrontend() {
  var FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');
  var outputDir = path.join(BACKEND_DIR, 'public', 'app');
  log('Building frontend...');
  if (!fs.existsSync(path.join(FRONTEND_DIR, 'node_modules'))) {
    execSync('npm install', { cwd: FRONTEND_DIR, timeout: 120000 });
  }
  execSync('npx vite build --outDir "' + outputDir + '"', {
    cwd: FRONTEND_DIR, timeout: 120000,
    env: (function () { var e = {}; Object.keys(process.env).forEach(function (k) { e[k] = process.env[k]; }); e.NODE_ENV = 'production'; return e; })()
  });
  log('Frontend built.');
}

// ============================================================
// Log Viewer Window
// ============================================================
function createLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow({
    width: 850,
    height: 520,
    title: APP_NAME + ' - Console',
    icon: ICON_PATH,
    backgroundColor: '#1e1e2e',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  var logHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    + 'body{margin:0;padding:0;background:#1e1e2e;color:#cdd6f4;font:13px/1.6 "Consolas","JetBrains Mono",monospace;}'
    + '.toolbar{position:sticky;top:0;background:#181825;padding:8px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid #313244;z-index:1;}'
    + '.toolbar button{background:#45475a;color:#cdd6f4;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font:12px inherit;}'
    + '.toolbar button:hover{background:#585b70;}'
    + '.server-info{font-size:11px;color:#89b4fa;}'
    + '#log{padding:12px 16px;white-space:pre-wrap;word-break:break-all;max-height:calc(100vh - 44px);overflow-y:auto;}'
    + '.info{color:#89b4fa;} .err{color:#f38ba8;} .backend{color:#a6e3a1;}'
    + '</style></head><body>'
    + '<div class="toolbar">'
    + '<button onclick="document.getElementById(\'log\').innerHTML=\'\'">Clear</button>'
    + '<button onclick="navigator.clipboard.writeText(document.getElementById(\'log\').textContent)">Copy</button>'
    + '<span style="flex:1"></span>'
    + '<span class="server-info">Server: ' + SERVER_URL + '</span>'
    + '</div>'
    + '<div id="log"></div>'
    + '<script>'
    + 'const {ipcRenderer}=require("electron");'
    + 'const el=document.getElementById("log");'
    + 'function addLine(t){'
    + '  const d=document.createElement("div");'
    + '  if(t.includes("[Backend:err]"))d.className="err";'
    + '  else if(t.includes("[Backend]"))d.className="backend";'
    + '  else d.className="info";'
    + '  d.textContent=t;el.appendChild(d);'
    + '  el.scrollTop=el.scrollHeight;'
    + '}'
    + 'ipcRenderer.on("log-line",(_,t)=>addLine(t));'
    + 'ipcRenderer.on("log-history",(_,lines)=>lines.forEach(addLine));'
    + '<\/script></body></html>';

  logWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(logHTML));

  logWindow.webContents.on('did-finish-load', function () {
    logWindow.webContents.send('log-history', logBuffer);
  });

  logWindow.on('closed', function () { logWindow = null; });
}

// ============================================================
// Main Window
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: CONFIG.WINDOW_WIDTH,
    height: CONFIG.WINDOW_HEIGHT,
    minWidth: CONFIG.MIN_WIDTH,
    minHeight: CONFIG.MIN_HEIGHT,
    title: APP_NAME,
    icon: ICON_PATH,
    backgroundColor: '#f5f3ff',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    }
  });

  // Context menu with console option
  mainWindow.webContents.on('context-menu', function () {
    var menu = Menu.buildFromTemplate([
      { label: 'Back', click: function () { mainWindow.webContents.goBack(); } },
      { label: 'Reload', click: function () { mainWindow.webContents.reload(); } },
      { type: 'separator' },
      { label: 'Copy', role: 'copy' },
      { label: 'Paste', role: 'paste' },
      { label: 'Select All', role: 'selectAll' },
      { type: 'separator' },
      { label: 'Console (Ctrl+L)', click: function () { createLogWindow(); } },
      { label: 'DevTools (F12)', click: function () { mainWindow.webContents.openDevTools(); } },
      { type: 'separator' },
      { label: 'Server: ' + SERVER_URL, enabled: false },
    ]);
    menu.popup();
  });

  mainWindow.webContents.setWindowOpenHandler(function (details) {
    var url = details.url;
    if (!url || url === '' || url === 'about:blank' || url.indexOf('localhost') > -1 || url.indexOf('127.0.0.1') > -1) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 950, height: 750,
          autoHideMenuBar: true,
          title: APP_NAME,
          icon: ICON_PATH,
          backgroundColor: '#ffffff',
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', function () { mainWindow = null; });
  return mainWindow;
}

// ============================================================
// System Tray
// ============================================================
function createTray() {
  if (!fs.existsSync(ICON_PATH)) return;
  try {
    tray = new Tray(ICON_PATH);
    tray.setToolTip(APP_NAME);
    var trayMenu = Menu.buildFromTemplate([
      { label: 'Open', click: function () { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { label: 'Console', click: function () { createLogWindow(); } },
      { type: 'separator' },
      { label: 'Reload', click: function () { if (mainWindow) mainWindow.webContents.reload(); } },
      { label: 'Open in Browser', click: function () { shell.openExternal(CONFIG.APP_URL); } },
      { type: 'separator' },
      { label: 'Quit', click: function () { isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(trayMenu);
    tray.on('click', function () { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  } catch (e) {
    log('Tray icon failed: ' + e.message);
  }
}

// ============================================================
// Splash Screen
// ============================================================
function getSplashHTML(statusText) {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;'
    + 'background:linear-gradient(135deg,#0f0f1a 0%,#1a1a3e 40%,#2d1b69 100%);'
    + 'height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;}'
    + '.bg{position:fixed;width:400px;height:400px;border-radius:50%;filter:blur(120px);opacity:0.3;}'
    + '.bg.a{top:-100px;right:-100px;background:#7c5cfc;}'
    + '.bg.b{bottom:-100px;left:-100px;background:#a78bfa;}'
    + '.c{text-align:center;color:#fff;position:relative;z-index:1;}'
    + '.logo{width:64px;height:64px;background:linear-gradient(135deg,#7c5cfc,#a78bfa);'
    + 'border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:32px;'
    + 'margin:0 auto 20px;box-shadow:0 8px 32px rgba(124,92,252,0.3);}'
    + '.title{font-size:28px;font-weight:700;letter-spacing:1px;margin-bottom:6px;}'
    + '.sub{font-size:14px;opacity:0.6;margin-bottom:40px;letter-spacing:2px;}'
    + '.sp{width:40px;height:40px;border:3px solid rgba(255,255,255,0.15);'
    + 'border-top-color:rgba(124,92,252,0.9);border-radius:50%;'
    + 'animation:s 0.8s linear infinite;margin:0 auto 20px;}'
    + '@keyframes s{to{transform:rotate(360deg)}}'
    + '.st{font-size:13px;opacity:0.6;}'
    + '.sv{font-size:11px;opacity:0.3;margin-top:30px;}'
    + '</style></head><body>'
    + '<div class="bg a"></div><div class="bg b"></div>'
    + '<div class="c">'
    + '<div class="logo">\uD83E\uDD16</div>'
    + '<div class="title">' + APP_NAME + '</div>'
    + '<div class="sub">Smart Learning System</div>'
    + '<div class="sp"></div>'
    + '<div class="st">' + statusText + '</div>'
    + '<div class="sv">' + SERVER_URL + '</div>'
    + '</div></body></html>';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

// ============================================================
// App Lifecycle
// ============================================================
app.whenReady().then(async function () {
  log('====================================');
  log('  ' + APP_NAME + ' - Starting');
  log('  Server: ' + SERVER_URL);
  log('  Mode: ' + (IS_LOCAL ? 'Local' : 'Remote'));
  log('====================================');

  var win = createWindow();
  win.loadURL(getSplashHTML('Connecting to server...'));
  win.show();

  createTray();
  globalShortcut.register('CommandOrControl+L', function () { createLogWindow(); });

  try {
    if (IS_LOCAL) {
      // === LOCAL MODE: Start backend if needed ===
      var alreadyRunning = await checkServer();

      if (alreadyRunning) {
        log('Backend already running, connecting...');
      } else {
        // Check if frontend is built
        if (!isFrontendBuilt()) {
          log('Frontend not built, building...');
          win.loadURL(getSplashHTML('First run: Building frontend (1-2 min)...'));
          try { buildFrontend(); } catch (e) {
            log('Frontend build failed: ' + e.message);
            dialog.showErrorBox('Build Failed', 'Cannot build frontend.\n\n' + e.message);
            app.quit(); return;
          }
        }

        win.loadURL(getSplashHTML('Starting backend server...'));
        await startBackend();
      }
    } else {
      // === REMOTE MODE: Just check server ===
      win.loadURL(getSplashHTML('Connecting to ' + SERVER_URL + '...'));
      log('Connecting to remote server: ' + SERVER_URL);

      var retries = 0;
      var maxRetries = 10;
      while (retries < maxRetries) {
        var ok = await checkServer();
        if (ok) break;
        retries++;
        log('Connection attempt ' + retries + '/' + maxRetries + '...');
        await new Promise(function (r) { setTimeout(r, 2000); });
      }

      if (retries >= maxRetries) {
        var choice = dialog.showMessageBoxSync(win, {
          type: 'error',
          title: 'Connection Failed',
          message: 'Cannot connect to server:\n' + SERVER_URL + '\n\nCheck your network and server status.',
          buttons: ['Retry', 'Quit'],
        });
        if (choice === 1) { app.quit(); return; }
        win.loadURL(getSplashHTML('Retrying...'));
      }
    }

    log('Loading app...');
    win.loadURL(CONFIG.APP_URL);

    win.webContents.on('did-finish-load', function () {
      log('App loaded successfully');
      win.setTitle(APP_NAME);
    });

    win.webContents.on('did-fail-load', function (ev, code, desc) {
      log('Load failed: ' + desc + ', retrying in 2s...');
      setTimeout(function () { if (mainWindow) mainWindow.loadURL(CONFIG.APP_URL); }, 2000);
    });

  } catch (error) {
    log('Startup failed: ' + error.message);
    dialog.showErrorBox('Startup Failed', error.message);
    app.quit();
  }
});

app.on('window-all-closed', function () {
  if (backendProcess) stopBackend();
  app.quit();
});

app.on('before-quit', function () {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (backendProcess) stopBackend();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    mainWindow.loadURL(CONFIG.APP_URL);
    mainWindow.show();
  }
});

process.on('uncaughtException', function (err) { log('Fatal: ' + err.message); if (backendProcess) stopBackend(); });
process.on('SIGINT', function () { if (backendProcess) stopBackend(); process.exit(0); });
process.on('SIGTERM', function () { if (backendProcess) stopBackend(); process.exit(0); });
