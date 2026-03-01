/**
 * Sorryios AI - 管理后台桌面版
 * 
 * Features:
 *   - 自动启动后端服务
 *   - 加载管理后台界面
 *   - 系统托盘图标
 *   - 控制台日志查看 (Ctrl+L)
 *   - 自动清理退出
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
  APP_URL: 'http://localhost:3000/admin',
  STARTUP_TIMEOUT: 30000,
  POLL_INTERVAL: 500,
  WINDOW_WIDTH: 1440,
  WINDOW_HEIGHT: 900,
  MIN_WIDTH: 1100,
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
// Check if backend is already running
// ============================================================
function checkBackendRunning() {
  return new Promise(function(resolve) {
    var req = http.get('http://localhost:' + CONFIG.BACKEND_PORT, { timeout: 2000 }, function(res) {
      resolve(res.statusCode === 200 || res.statusCode === 304);
    });
    req.on('error', function() { resolve(false); });
    req.on('timeout', function() { req.destroy(); resolve(false); });
  });
}

// ============================================================
// Start Backend
// ============================================================
function startBackend() {
  return new Promise(function(resolve, reject) {
    log('正在启动后端服务...');

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
        dialog.showErrorBox('后端错误', '后端服务意外停止.\n应用即将关闭。');
        app.quit();
      }
    });

    var startTime = Date.now();
    function poll() {
      if (Date.now() - startTime > CONFIG.STARTUP_TIMEOUT) {
        reject(new Error('Backend timeout'));
        return;
      }
      var req = http.get('http://localhost:' + CONFIG.BACKEND_PORT, { timeout: 2000 }, function(res) {
        if (res.statusCode === 200 || res.statusCode === 304) {
          log('后端服务已就绪');
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
    title: '管理后台 - 控制台',
    icon: ICON_PATH,
    backgroundColor: '#1e1e2e',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  var logHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    + 'body{margin:0;padding:0;background:#1e1e2e;color:#cdd6f4;font:13px/1.6 "JetBrains Mono","Consolas",monospace;}'
    + '.toolbar{position:sticky;top:0;background:#181825;padding:8px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid #313244;z-index:1;}'
    + '.toolbar button{background:#45475a;color:#cdd6f4;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font:12px inherit;}'
    + '.toolbar button:hover{background:#585b70;}'
    + '#log{padding:12px 16px;white-space:pre-wrap;word-break:break-all;max-height:calc(100vh - 44px);overflow-y:auto;}'
    + '.info{color:#89b4fa;} .err{color:#f38ba8;} .backend{color:#a6e3a1;}'
    + '</style></head><body>'
    + '<div class="toolbar">'
    + '<button onclick="document.getElementById(\'log\').innerHTML=\'\'">清空</button>'
    + '<button onclick="navigator.clipboard.writeText(document.getElementById(\'log\').textContent)">复制</button>'
    + '<span style="flex:1"></span>'
    + '<span style="opacity:0.5;font-size:11px;">管理后台控制台</span>'
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

  logWindow.webContents.on('did-finish-load', function() {
    logWindow.webContents.send('log-history', logBuffer);
  });

  logWindow.on('closed', function() { logWindow = null; });
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
    title: 'Sorryios AI - 管理后台',
    icon: ICON_PATH,
    backgroundColor: '#f0f2f7',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    }
  });

  // Context menu
  mainWindow.webContents.on('context-menu', function() {
    var menu = Menu.buildFromTemplate([
      { label: '返回', click: function() { mainWindow.webContents.goBack(); } },
      { label: '刷新', click: function() { mainWindow.webContents.reload(); } },
      { type: 'separator' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' },
      { type: 'separator' },
      { label: '控制台 (Ctrl+L)', click: function() { createLogWindow(); } },
      { label: '开发者工具 (F12)', click: function() { mainWindow.webContents.openDevTools(); } },
    ]);
    menu.popup();
  });

  mainWindow.webContents.setWindowOpenHandler(function(details) {
    var url = details.url;
    if (!url || url === '' || url === 'about:blank' || url.indexOf('localhost') > -1 || url.indexOf('127.0.0.1') > -1) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 950, height: 750,
          autoHideMenuBar: true,
          title: 'Sorryios AI - 管理后台',
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
    tray.setToolTip('Sorryios AI - 管理后台');
    var trayMenu = Menu.buildFromTemplate([
      { label: '打开管理后台', click: function() { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { label: '控制台', click: function() { createLogWindow(); } },
      { type: 'separator' },
      { label: '刷新', click: function() { if (mainWindow) mainWindow.webContents.reload(); } },
      { label: '在浏览器中打开', click: function() { shell.openExternal(CONFIG.APP_URL); } },
      { type: 'separator' },
      { label: '退出', click: function() { isQuitting = true; app.quit(); } },
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
    + 'body{font-family:"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif;'
    + 'background:linear-gradient(135deg,#0f0f1a 0%,#1a1a3e 40%,#2d1b69 100%);'
    + 'height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;}'
    + '.bg-glow{position:fixed;width:400px;height:400px;border-radius:50%;filter:blur(120px);opacity:0.3;}'
    + '.bg-glow.a{top:-100px;right:-100px;background:#7c5cfc;}'
    + '.bg-glow.b{bottom:-100px;left:-100px;background:#a78bfa;}'
    + '.c{text-align:center;color:#fff;position:relative;z-index:1;}'
    + '.logo-box{width:64px;height:64px;background:linear-gradient(135deg,#7c5cfc,#a78bfa);'
    + 'border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:32px;'
    + 'margin:0 auto 20px;box-shadow:0 8px 32px rgba(124,92,252,0.3);}'
    + '.title{font-size:28px;font-weight:700;letter-spacing:1px;margin-bottom:6px;}'
    + '.sub{font-size:14px;opacity:0.6;margin-bottom:40px;letter-spacing:2px;}'
    + '.sp{width:40px;height:40px;border:3px solid rgba(255,255,255,0.15);'
    + 'border-top-color:rgba(124,92,252,0.9);border-radius:50%;'
    + 'animation:s 0.8s linear infinite;margin:0 auto 20px;}'
    + '@keyframes s{to{transform:rotate(360deg)}}'
    + '.st{font-size:13px;opacity:0.6;}'
    + '</style></head><body>'
    + '<div class="bg-glow a"></div><div class="bg-glow b"></div>'
    + '<div class="c">'
    + '<div class="logo-box">🤖</div>'
    + '<div class="title">Sorryios AI</div>'
    + '<div class="sub">管理后台</div>'
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
  log('  Sorryios AI 管理后台 - 启动中');
  log('====================================');

  var win = createWindow();
  win.loadURL(getSplashHTML('正在检查服务器状态...'));
  win.show();

  createTray();
  globalShortcut.register('CommandOrControl+L', function() { createLogWindow(); });

  try {
    // Check if backend is already running (e.g. started by the main desktop app)
    var alreadyRunning = await checkBackendRunning();

    if (alreadyRunning) {
      log('后端服务已在运行中，直接连接...');
    } else {
      win.loadURL(getSplashHTML('正在启动后端服务...'));
      await startBackend();
    }

    log('正在加载管理后台...');
    win.loadURL(CONFIG.APP_URL);

    win.webContents.on('did-finish-load', function() {
      log('管理后台加载完成');
      win.setTitle('Sorryios AI - 管理后台');
    });

    win.webContents.on('did-fail-load', function(ev, code, desc) {
      log('Load failed: ' + desc + ', retrying...');
      setTimeout(function() { if (mainWindow) mainWindow.loadURL(CONFIG.APP_URL); }, 2000);
    });

  } catch(error) {
    log('Startup failed: ' + error.message);
    dialog.showErrorBox('启动失败', error.message);
    app.quit();
  }
});

app.on('window-all-closed', function() {
  // Only stop backend if WE started it
  if (backendProcess) stopBackend();
  app.quit();
});

app.on('before-quit', function() {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (backendProcess) stopBackend();
});

app.on('activate', function() {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    mainWindow.loadURL(CONFIG.APP_URL);
    mainWindow.show();
  }
});

process.on('uncaughtException', function(err) { log('Fatal: ' + err.message); if (backendProcess) stopBackend(); });
process.on('SIGINT', function() { if (backendProcess) stopBackend(); process.exit(0); });
process.on('SIGTERM', function() { if (backendProcess) stopBackend(); process.exit(0); });
