/**
 * Sorryios AI Desktop App - Electron Main Process (Final)
 * 
 * Features:
 *   - Zero terminal windows (fully hidden backend)
 *   - Built-in log viewer (Ctrl+L or right-click > Console)
 *   - System tray icon
 *   - Auto cleanup on exit
 */

const { app, BrowserWindow, Menu, Tray, shell, dialog, globalShortcut, ipcMain } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ============================================================
// Config
// ============================================================
const CONFIG = {
  BACKEND_PORT: 3000,
  APP_URL: 'http://localhost:3000',
  STARTUP_TIMEOUT: 30000,
  POLL_INTERVAL: 500,
  WINDOW_WIDTH: 1360,
  WINDOW_HEIGHT: 860,
  MIN_WIDTH: 1024,
  MIN_HEIGHT: 700,
  MAX_LOG_LINES: 2000,
};

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
    try { logWindow.webContents.send('log-line', line); } catch(e) {}
  }
}

// ============================================================
// Kill port
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
        result.split('\n').forEach(function(line) {
          var parts = line.trim().split(/\s+/);
          var pid = parts[parts.length - 1];
          if (pid && pid !== '0') pids[pid] = true;
        });
        Object.keys(pids).forEach(function(pid) {
          try { execSync('taskkill /PID ' + pid + ' /T /F', { timeout: 5000 }); } catch(e) {}
        });
      }
    }
  } catch(e) {}
}

// ============================================================
// Start Backend
// ============================================================
function startBackend() {
  return new Promise(function(resolve, reject) {
    log('Starting backend server...');

    if (!fs.existsSync(path.join(BACKEND_DIR, 'server.js'))) {
      reject(new Error('Cannot find backend/server.js'));
      return;
    }

    if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
      log('Installing backend dependencies...');
      try {
        execSync('npm install', { cwd: BACKEND_DIR, timeout: 120000 });
        log('Backend dependencies installed.');
      } catch(e) {
        reject(new Error('Failed to install backend deps: ' + e.message));
        return;
      }
    }

    killPort(CONFIG.BACKEND_PORT);

    var env = {};
    Object.keys(process.env).forEach(function(k) { env[k] = process.env[k]; });
    env.PORT = String(CONFIG.BACKEND_PORT);
    env.NODE_ENV = 'production';
    env.SORRYIOS_DESKTOP = '1';

    backendProcess = spawn('node', ['server.js'], {
      cwd: BACKEND_DIR,
      env: env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    backendProcess.stdout.on('data', function(data) {
      data.toString().split('\n').forEach(function(line) {
        line = line.trim();
        if (line) log('[Backend] ' + line);
      });
    });

    backendProcess.stderr.on('data', function(data) {
      data.toString().split('\n').forEach(function(line) {
        line = line.trim();
        if (line) log('[Backend:err] ' + line);
      });
    });

    backendProcess.on('error', function(err) {
      log('Backend error: ' + err.message);
      reject(err);
    });

    backendProcess.on('exit', function(code) {
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
      var req = http.get(CONFIG.APP_URL, { timeout: 2000 }, function(res) {
        if (res.statusCode === 200 || res.statusCode === 304) {
          log('Backend is ready.');
          resolve();
        } else {
          setTimeout(poll, CONFIG.POLL_INTERVAL);
        }
      });
      req.on('error', function() { setTimeout(poll, CONFIG.POLL_INTERVAL); });
      req.on('timeout', function() { req.destroy(); setTimeout(poll, CONFIG.POLL_INTERVAL); });
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
      try { execSync('taskkill /PID ' + backendProcess.pid + ' /T /F', { timeout: 5000 }); } catch(e) {}
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
    killPort(CONFIG.BACKEND_PORT);
  }
}

// ============================================================
// Frontend check/build
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
    env: (function() { var e = {}; Object.keys(process.env).forEach(function(k){e[k]=process.env[k];}); e.NODE_ENV='production'; return e; })()
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
    title: 'Sorryios AI - Console',
    icon: ICON_PATH,
    backgroundColor: '#1e1e2e',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  var logHTML = '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>Console</title>\n'
    + '<style>\n'
    + '*{margin:0;padding:0;box-sizing:border-box}\n'
    + 'body{background:#1e1e2e;color:#cdd6f4;font-family:Consolas,"Courier New",monospace;font-size:12px}\n'
    + '#bar{position:fixed;top:0;left:0;right:0;height:36px;background:#313244;display:flex;align-items:center;padding:0 12px;gap:8px;z-index:10;border-bottom:1px solid #45475a}\n'
    + '#bar button{background:#45475a;color:#cdd6f4;border:none;padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer}\n'
    + '#bar button:hover{background:#585b70}\n'
    + '.t{font-weight:700;font-size:13px;color:#cba6f7;flex:1}\n'
    + '.n{color:#6c7086;font-size:11px}\n'
    + '#log{padding:44px 12px 12px;white-space:pre-wrap;word-break:break-all;line-height:1.6}\n'
    + '.l{padding:1px 0}.l:hover{background:#313244}\n'
    + '.e{color:#f38ba8}.g{color:#a6e3a1}.b{color:#89b4fa}\n'
    + '</style></head><body>\n'
    + '<div id="bar"><span class="t">Console Output</span><span class="n" id="cnt"></span>'
    + '<button id="abtn" onclick="asc=!asc;this.textContent=asc?\'Auto-scroll: ON\':\'Auto-scroll: OFF\'">Auto-scroll: ON</button>'
    + '<button onclick="document.getElementById(\'log\').innerHTML=\'\';lc=0;document.getElementById(\'cnt\').textContent=\'\'">Clear</button></div>\n'
    + '<div id="log"></div>\n'
    + '<script>\n'
    + 'var ipc=require("electron").ipcRenderer,el=document.getElementById("log"),ce=document.getElementById("cnt"),asc=true,lc=0;\n'
    + 'function add(t){var d=document.createElement("div");d.className="l";\n'
    + 'if(t.indexOf("err")>-1||t.indexOf("ERR")>-1||t.indexOf("fail")>-1)d.className+=" e";\n'
    + 'else if(t.indexOf("ready")>-1||t.indexOf("OK")>-1||t.indexOf("success")>-1||t.indexOf("loaded")>-1||t.indexOf("built")>-1)d.className+=" g";\n'
    + 'else if(t.indexOf("Backend]")>-1)d.className+=" b";\n'
    + 'd.textContent=t;el.appendChild(d);lc++;ce.textContent=lc+" lines";\n'
    + 'if(asc)window.scrollTo(0,document.body.scrollHeight);}\n'
    + 'ipc.send("get-logs");\n'
    + 'ipc.on("all-logs",function(e,a){a.forEach(add);});\n'
    + 'ipc.on("log-line",function(e,t){add(t);});\n'
    + '</script></body></html>';

  logWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(logHTML));
  logWindow.on('closed', function() { logWindow = null; });
}

ipcMain.on('get-logs', function(event) {
  event.reply('all-logs', logBuffer);
});

// ============================================================
// Main Window
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: CONFIG.WINDOW_WIDTH,
    height: CONFIG.WINDOW_HEIGHT,
    minWidth: CONFIG.MIN_WIDTH,
    minHeight: CONFIG.MIN_HEIGHT,
    title: 'Sorryios AI',
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

  var contextMenu = Menu.buildFromTemplate([
    { label: 'Back', click: function() { mainWindow.webContents.goBack(); } },
    { label: 'Reload', click: function() { mainWindow.webContents.reload(); } },
    { type: 'separator' },
    { label: 'Copy', role: 'copy' },
    { label: 'Paste', role: 'paste' },
    { label: 'Select All', role: 'selectAll' },
    { type: 'separator' },
    { label: 'Console (Ctrl+L)', click: function() { createLogWindow(); } },
    { label: 'DevTools (F12)', click: function() { mainWindow.webContents.openDevTools(); } },
  ]);

  mainWindow.webContents.on('context-menu', function() { contextMenu.popup(); });

  mainWindow.webContents.setWindowOpenHandler(function(details) {
    var url = details.url;
    if (!url || url === '' || url === 'about:blank' || url.indexOf('localhost') > -1 || url.indexOf('127.0.0.1') > -1) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 950, height: 750,
          autoHideMenuBar: true,
          title: 'Sorryios AI',
          icon: ICON_PATH,
          backgroundColor: '#ffffff',
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', function() { mainWindow = null; });
  return mainWindow;
}

// ============================================================
// System Tray
// ============================================================
function createTray() {
  if (!fs.existsSync(ICON_PATH)) return;
  try {
    tray = new Tray(ICON_PATH);
    tray.setToolTip('Sorryios AI');
    var trayMenu = Menu.buildFromTemplate([
      { label: 'Open App', click: function() { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { label: 'Console', click: function() { createLogWindow(); } },
      { type: 'separator' },
      { label: 'Reload', click: function() { if (mainWindow) mainWindow.webContents.reload(); } },
      { label: 'Open in Browser', click: function() { shell.openExternal(CONFIG.APP_URL); } },
      { type: 'separator' },
      { label: 'Quit', click: function() { isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(trayMenu);
    tray.on('click', function() { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  } catch(e) {
    log('Tray icon failed: ' + e.message);
  }
}

// ============================================================
// Splash Screen
// ============================================================
function getSplashHTML(statusText) {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 50%,#f093fb 100%);height:100vh;display:flex;align-items:center;justify-content:center}'
    + '.c{text-align:center;color:#fff}'
    + '.logo{font-size:48px;font-weight:800;letter-spacing:2px;margin-bottom:8px;text-shadow:0 2px 20px rgba(0,0,0,.2)}'
    + '.sub{font-size:16px;opacity:.85;margin-bottom:48px;letter-spacing:4px}'
    + '.sp{width:48px;height:48px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:s .8s linear infinite;margin:0 auto 24px}'
    + '@keyframes s{to{transform:rotate(360deg)}}'
    + '.st{font-size:14px;opacity:.8}'
    + '</style></head><body><div class="c">'
    + '<div class="logo">Sorryios AI</div>'
    + '<div class="sub">Smart Note System</div>'
    + '<div class="sp"></div>'
    + '<div class="st">' + statusText + '</div>'
    + '</div></body></html>';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

// ============================================================
// App Lifecycle
// ============================================================
app.whenReady().then(async function() {
  log('====================================');
  log('  Sorryios AI Desktop - Starting');
  log('====================================');

  var win = createWindow();
  win.loadURL(getSplashHTML('Starting server...'));
  win.show();

  createTray();
  globalShortcut.register('CommandOrControl+L', function() { createLogWindow(); });

  try {
    if (!isFrontendBuilt()) {
      log('Frontend not built, building...');
      win.loadURL(getSplashHTML('First run: building frontend (1-2 min)...'));
      try { buildFrontend(); } catch(e) {
        log('Frontend build failed: ' + e.message);
        dialog.showErrorBox('Build Failed', 'Cannot build frontend.\n\n' + e.message);
        app.quit(); return;
      }
    }

    win.loadURL(getSplashHTML('Starting backend server...'));
    await startBackend();

    log('Loading app...');
    win.loadURL(CONFIG.APP_URL);

    win.webContents.on('did-finish-load', function() {
      log('App loaded OK.');
      win.setTitle('Sorryios AI');
    });

    win.webContents.on('did-fail-load', function(ev, code, desc) {
      log('Load failed: ' + desc + ', retrying...');
      setTimeout(function() { if (mainWindow) mainWindow.loadURL(CONFIG.APP_URL); }, 2000);
    });

  } catch(error) {
    log('Startup failed: ' + error.message);
    dialog.showErrorBox('Startup Failed', error.message);
    app.quit();
  }
});

app.on('window-all-closed', function() { stopBackend(); app.quit(); });
app.on('before-quit', function() { isQuitting = true; globalShortcut.unregisterAll(); stopBackend(); });
app.on('activate', function() {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(); mainWindow.loadURL(CONFIG.APP_URL); mainWindow.show();
  }
});
process.on('uncaughtException', function(err) { log('Fatal: ' + err.message); stopBackend(); });
process.on('SIGINT', function() { stopBackend(); process.exit(0); });
process.on('SIGTERM', function() { stopBackend(); process.exit(0); });
