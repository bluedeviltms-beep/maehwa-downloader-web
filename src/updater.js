let autoUpdater = null;
let log = null;

let mainWindow = null;
let initialized = false;
let packagedMode = false;
let interactiveCheckRequested = false;
let pendingUpdateInfo = null;

// Attempt to require optional updater dependencies. If missing, fall back
// to no-op stubs so the app can run in development without installing
// `electron-updater`/`electron-log`.
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  autoUpdater = require('electron-updater').autoUpdater;
  // eslint-disable-next-line global-require
  log = require('electron-log');
} catch (err) {
  // Provide lightweight stubs
  autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: async () => { return {}; },
    quitAndInstall: () => {}
  };
  log = { error: () => {}, initialize: () => {}, transports: { file: { level: 'info' } } };
  // If missing, notify developer via console but do not crash
  console.warn('Optional updater modules not installed: electron-updater/electron-log. Updater disabled.', err && err.message);
}

function initializeAutoUpdates({ browserWindow, isPackaged }) {
  mainWindow = browserWindow;
  packagedMode = isPackaged;

  if (initialized) return;
  initialized = true;

  log.initialize();
  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  // Allow installer to run when the app quits; improves Windows install reliability
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    if (!interactiveCheckRequested) return;
    sendStatus({ state: 'checking', message: '업데이트 확인 중...' });
  });

  autoUpdater.on('update-available', (info) => {
    if (!interactiveCheckRequested) return;
    sendStatus({ state: 'available', message: `새 버전 v${info.version} 다운로드를 시작할게요!`, version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    if (!interactiveCheckRequested) return;
    interactiveCheckRequested = false;
    sendStatus({ state: 'idle', message: '이미 최신 버전입니다.' });
  });

  autoUpdater.on('download-progress', (progress) => {
    if (!interactiveCheckRequested) return;
    sendStatus({ state: 'downloading', message: `업데이트 다운로드 중... ${Math.round(progress.percent)}%`, percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    // keep pending info for later installation
    pendingUpdateInfo = info;
    // Always notify renderer that download completed; UI decides whether it's interactive
    sendStatus({ state: 'downloaded', message: `업데이트 v${info.version} 다운로드 완료. 설치하시겠어요?`, version: info.version });
  });

  autoUpdater.on('error', (error) => {
    // Always surface errors so UI and logs can diagnose install problems
    try { log.error && log.error('autoUpdater error', error); } catch (e) {}
    interactiveCheckRequested = false;
    const detail = error && (error.stack || error.message) ? (error.stack || error.message) : String(error || 'unknown');
    sendStatus({ state: 'error', message: '업데이트 처리 중 오류가 발생했습니다.', detail });
  });

  if (!isPackaged) {
    sendStatus({ state: 'dev', message: '설치된 앱에서만 자동 업데이트를 확인할 수 있어요.' });
    return;
  }

  sendStatus({ state: 'idle', message: '업데이트 확인하기 버튼으로 새 버전을 확인할 수 있어요.' });
}

async function checkForUpdates() {
  if (!packagedMode) {
    sendStatus({ state: 'dev', message: '설치된 앱에서만 자동 업데이트를 확인할 수 있어요.' });
    return { ok: true, skipped: true };
  }

  interactiveCheckRequested = true;
  await autoUpdater.checkForUpdates();
  return { ok: true };
}

async function checkForUpdatesSilently() {
  if (!packagedMode) return { ok: true, skipped: true };
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    log.error('Silent update check failed', error);
    return { ok: false, detail: String(error?.message || error || '') };
  }
}

function quitAndInstallUpdate() {
  interactiveCheckRequested = false;
  try { autoUpdater.quitAndInstall(); } catch (e) { log.error('quitAndInstall failed', e); }
}

async function safeInstallUpdate() {
  const { app } = require('electron');
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  try {
    // 1. UI 먼저 정리 (핸들 잡고 있는거 끊기)
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('updates:status', { state: 'installing', message: '업데이트 설치 준비 중...' });
      } catch (e) {}
      try { mainWindow.hide(); } catch (e) {}
    }

    // 2. 로그/IPC flush 시간 확보 (핵심)
    await sleep(300);

    // 3. 앱 종료 후 설치 트리거 (권장 방식)
    try {
      app.removeAllListeners();
    } catch (e) {}

    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (e) {
      try { log.error('safe quitAndInstall failed', e); } catch (_) {}
      sendStatus({ state: 'error', message: '업데이트 설치 실패', detail: String(e?.message || e) });
    }
  } catch (e) {
    try { log.error('safeInstallUpdate failed', e); } catch (_) {}
    sendStatus({ state: 'error', message: '업데이트 설치 실패', detail: String(e?.message || e) });
  }
}

function sendStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('updates:status', payload);
}

module.exports = {
  initializeAutoUpdates,
  checkForUpdates,
  checkForUpdatesSilently,
  quitAndInstallUpdate
};

// export safeInstallUpdate for main process to call
module.exports.safeInstallUpdate = safeInstallUpdate;
