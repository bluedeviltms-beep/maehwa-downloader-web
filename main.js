require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const ytdl = require('ytdl-core');
// IPC payload validators
let youtubeSearchSchema, downloadStartSchema;
try {
  ({ youtubeSearchSchema, downloadStartSchema } = require('./src/main/validators'));
} catch (e) {
  console.warn('validators not loaded', e);
}
let mainWindow;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36';
const http = require('http');

// Helper: sanitize filenames for Windows/posix filesystems
function sanitizeFilename(name, maxLen = 200) {
  if (!name) return String(Date.now());
  let s = String(name);
  // remove control chars
  s = s.replace(/[\x00-\x1f\x7f]/g, '_');
  // replace illegal filename chars for Windows and POSIX
  s = s.replace(/[\\/:*?"<>|\n\r\t]/g, '_');
  // trim trailing dots/spaces
  s = s.replace(/[\.\s]+$/g, '');
  if (!s) s = 'file';
  // avoid reserved Windows names
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(s)) s = '_' + s;
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

// Helper: basic YouTube URL validation (allow youtube / youtu.be)
function isValidYouTubeUrl(u) {
  if (!u || typeof u !== 'string') return false;
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') return true;
    // allow full hostnames like www.youtube.com
    if (host.endsWith('youtube.com') || host === 'youtu.be') return true;
    return false;
  } catch (e) {
    return false;
  }
}

// Ensure `userData` is set to a per-user writable path when packaged.
// This helps avoid Chromium cache/write permission errors when the app
// is installed to protected locations (e.g., Program Files).
try {
  const userDataPath = path.join(app.getPath('appData'), 'MaeHwa Downloader');
  app.setPath('userData', userDataPath);
} catch (e) {
  console.warn('failed to set userData path', e);
}

// Logs should be written to a per-user writable location, not inside the
// app resources (which may be under Program Files and read-only).
const appLogsDir = path.join(app.getPath('userData'), 'logs');

// Receive diagnostic logs from preload and write to a dedicated log file
try {
  ipcMain.on('preload:log', (_e, msg) => {
    try {
      fs.mkdirSync(appLogsDir, { recursive: true });
      const p = path.join(appLogsDir, 'preload.log');
      fs.appendFileSync(p, `${new Date().toISOString()} ${String(msg)}\n`);
    } catch (w) {
      console.warn('failed to write preload log', w);
    }
  });
} catch (e) {
  console.warn('failed to register preload log listener', e);
}


// If the app is running packaged, start a small static server to serve the
// exported Next static files. This ensures absolute "/_next/..." URLs in the
// exported HTML resolve correctly when loaded via file:// in Electron.
let packagedStartUrl = null;
async function startStaticServer() {
  try {
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) return null;
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
        // Map leading /_next to ./_next in public
        let filePath = path.join(publicDir, urlPath.replace(/^\//, ''));
        
        // Smart Fallback for Next.js static export & routing
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          if (urlPath.startsWith('/video/')) {
            const videoFallback = path.join(publicDir, 'video', '[id].html');
            if (fs.existsSync(videoFallback)) {
              filePath = videoFallback;
            } else {
              filePath = path.join(publicDir, 'index.html');
            }
          } else if (!path.extname(urlPath)) {
            filePath = path.join(publicDir, 'index.html');
          }
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const ct = ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : ext === '.json' ? 'application/json' : ext === '.html' ? 'text/html' : 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': ct });
          fs.createReadStream(filePath).pipe(res);
        } else {
          // Ultimate fallback to index.html instead of 404
          const indexFallback = path.join(publicDir, 'index.html');
          if (fs.existsSync(indexFallback)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(indexFallback).pipe(res);
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        }
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    return new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        packagedStartUrl = `http://127.0.0.1:${addr.port}`;
        console.log('Static server started at', packagedStartUrl);
        resolve({ server, url: packagedStartUrl });
      });
      server.on('error', reject);
    });
  } catch (e) {
    console.warn('failed to start static server', e);
    return null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    center: true,
    frame: false,
    icon: path.join(__dirname, 'public', 'maehwadownloader.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  // Ensure standard window controls remain functional (we use custom UI
  // but still want minimize/maximize/close to work). Previously these
  // were disabled causing renderer-injected buttons to be ineffective.
  try {
    if (typeof mainWindow.setMinimizable === 'function') mainWindow.setMinimizable(true);
    if (typeof mainWindow.setMaximizable === 'function') mainWindow.setMaximizable(true);
    if (typeof mainWindow.setClosable === 'function') mainWindow.setClosable(true);
  } catch (e) {
    console.warn('failed to adjust window control flags', e);
  }

  mainWindow.removeMenu();
  // In development we expect a Next.js dev server at http://localhost:3000
  const devUrl = process.env.ELECTRON_START_URL || process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    // In production, prefer the static server (started in startStaticServer)
    // so that absolute "/_next/..." URLs resolve correctly. If the server
    // didn't start, fall back to loading the file directly.
    if (packagedStartUrl) {
      mainWindow.loadURL(packagedStartUrl + '/index.html');
    } else {
      mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
    }
  }

  // Enhanced debug logging for renderer load issues
  try {
    const dbgDir = appLogsDir;
    fs.mkdirSync(dbgDir, { recursive: true });
    const debugLog = (msg) => {
      try { fs.appendFileSync(path.join(dbgDir, 'electron-debug.log'), `${new Date().toISOString()} ${msg}\n`); } catch (e) { console.warn('failed to write debug log', e); }
    };

    mainWindow.webContents.on('did-finish-load', () => {
      const url = mainWindow.webContents.getURL();
      console.log('renderer did-finish-load', url);
      debugLog(`did-finish-load ${url}`);
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      const msg = `did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`;
      console.error(msg);
      debugLog(msg);
    });

    mainWindow.webContents.on('crashed', (event) => {
      const msg = `renderer-crashed ${String(event)}`;
      console.error(msg);
      debugLog(msg);
    });

    mainWindow.on('unresponsive', () => {
      const msg = 'window-unresponsive';
      console.warn(msg);
      debugLog(msg);
    });

    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      const msg = `console[level=${level}] ${sourceId}:${line} ${message}`;
      console.log(msg);
      debugLog(msg);
    });
  } catch (e) {
    console.warn('failed to attach debug listeners', e);
  }
}

app.whenReady().then(() => {
  (async () => {
    // start static server when packaged so index.html can load /_next assets
    try {
      await startStaticServer();
    } catch (e) { /* ignore */ }
    createWindow();
  })();

  // Probe: try writing a small file to logs to verify write permission/path
  try {
    const probeDir = appLogsDir;
    fs.mkdirSync(probeDir, { recursive: true });
    const probePath = path.join(probeDir, 'probe.txt');
    fs.writeFileSync(probePath, `probe ${new Date().toISOString()}`);
    console.log('probe log written', probePath);
  } catch (probeErr) {
    console.error('probe write failed', probeErr);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Placeholder IPC handlers — implement YouTube API and download logic later
ipcMain.handle('youtube:search', async (_event, payload) => {
  // Validate payload schema early
  try {
    if (youtubeSearchSchema) youtubeSearchSchema.parse(payload);
  } catch (schemaErr) {
    try { fs.appendFileSync(path.join(appLogsDir, 'ipc-schema-errors.log'), `${new Date().toISOString()} youtube:search schemaErr ${String(schemaErr)}\n`); } catch (_){ }
    return { ok: false, error: 'Invalid payload for youtube:search' };
  }
  // payload may be string (q) or object { q, duration, order, maxResults }
  // write raw IPC payload to log to diagnose renderer->main encoding/format issues
  try {
    const ipcLogsDir = path.join(appLogsDir, 'ipc');
    fs.mkdirSync(ipcLogsDir, { recursive: true });
    const t = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(ipcLogsDir, `ipc-recv-${t}.json`), JSON.stringify({ time: new Date().toISOString(), rawPayload: payload }, null, 2), 'utf8');
  } catch (e) {
    console.warn('failed to write ipc recv log', e);
  }
  const apiKey = process.env.YOUTUBE_API_KEY || 'AIzaSyDEOy0q4fuzgaB0Zsu4bcdfgqluOMwgUhE';

  let q = '';
  let duration = 'any';
  let order = 'relevance';
  let maxResults = 12;

  if (typeof payload === 'string') q = payload;
  else if (payload && typeof payload === 'object') {
    q = String(payload.q || '');
    duration = String(payload.duration || 'any');
    order = String(payload.order || 'relevance');
    if (payload.maxResults) maxResults = Number(payload.maxResults) || maxResults;
  }
  // Basic input sanitation and limits
  q = (q || '').trim();
  if (!q) return { ok: false, error: 'Empty query' };
  // cap max results to reasonable upper bound
  maxResults = Math.min(50, Math.max(1, Number(maxResults) || 12));

  console.log('youtube:search', { q, duration, order, maxResults });

  // validate incoming filter values
  const allowedDurations = ['any', 'short', 'medium', 'long'];
  const allowedOrders = ['relevance', 'date', 'viewCount', 'rating', 'title', 'videoCount'];
  if (!allowedDurations.includes(duration)) {
    console.warn('youtube:search received invalid duration, falling back to any', duration);
    duration = 'any';
  }
  if (!allowedOrders.includes(order)) {
    console.warn('youtube:search received invalid order, falling back to relevance', order);
    order = 'relevance';
  }

  try {
    const youtube = google.youtube({ version: 'v3', auth: apiKey });
    const params = { part: 'snippet', q: q, maxResults, type: 'video', order };

    // If the query contains Hangul, bias results to Korean; otherwise don't force region/language.
    const hasHangul = /[\u3131-\u318E\uAC00-\uD7A3]/.test(q);
    if (hasHangul) {
      params.relevanceLanguage = process.env.YOUTUBE_RELEVANCE_LANG || 'ko';
      params.regionCode = process.env.YOUTUBE_REGION_CODE || 'KR';
      console.log('youtube:search - detected Hangul in query, applying ko/KR bias');
    } else {
      console.log('youtube:search - no Hangul detected, not forcing region/language');
    }

    if (duration && duration !== 'any') params.videoDuration = duration; // short/medium/long

    const res = await youtube.search.list(params);

    let items = (res.data.items || [])
      .map((it) => {
        const vid = it.id?.videoId || (typeof it.id === 'string' ? it.id : null);
        return {
          title: decodeHTMLEntities(it.snippet?.title || ''),
          thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || '',
          videoId: vid,
          url: vid ? `https://www.youtube.com/watch?v=${vid}` : '',
          channelTitle: decodeHTMLEntities(it.snippet?.channelTitle || '')
        };
      })
      .filter((it) => !!it.videoId);

    // Fetch statistics (viewCount) for the returned videos and merge them in
    const fetchStatsWithRetry = async (ids, retries = 2, delayMs = 300) => {
      let attempt = 0;
      while (attempt <= retries) {
        try {
          const statsRes = await youtube.videos.list({ part: ['statistics'], id: ids.join(',') });
          const statsMap = {};
          (statsRes.data.items || []).forEach(s => { statsMap[s.id] = s.statistics || {}; });
          return statsMap;
        } catch (e) {
          attempt += 1;
          if (attempt > retries) throw e;
          await new Promise(r => setTimeout(r, delayMs * attempt));
        }
      }
      return {};
    };

    try {
      const ids = items.map(i => i.videoId).filter(Boolean);
      if (ids.length) {
        // try once for all ids
        let statsMap = {};
        try {
          statsMap = await fetchStatsWithRetry(ids, 2, 300);
        } catch (err) {
          console.warn('Failed to fetch video statistics after retries', err);
          statsMap = {};
        }
        items = items.map(it => ({ ...it, viewCount: statsMap[it.videoId]?.viewCount || null }));

        // For any items still missing viewCount, attempt per-video fetch (slower) to maximize chance
        const missing = items.filter(i => !i.viewCount).map(i => i.videoId).filter(Boolean);
        if (missing.length) {
          try {
            for (const vid of missing) {
              try {
                const single = await youtube.videos.list({ part: ['statistics'], id: vid });
                const s = (single.data.items || [])[0];
                if (s && s.statistics && s.id) {
                  items = items.map(it => it.videoId === s.id ? { ...it, viewCount: s.statistics.viewCount || null } : it);
                }
              } catch (innerErr) {
                // ignore per-video failure, continue
                console.warn('per-video stats fetch failed', vid, innerErr);
              }
            }
          } catch (inner) {
            // nothing
          }
        }
      }
    } catch (statErr) {
      console.warn('Failed to fetch video statistics', statErr);
    }

    // write a debug log of the request+response to workspace logs for inspection
    try {
      const logsDir = appLogsDir;
      fs.mkdirSync(logsDir, { recursive: true });
      const time = new Date().toISOString().replace(/[:.]/g, '-');
      const safeItems = items.map((it) => ({ title: it.title, videoId: it.videoId, url: it.url, channelTitle: it.channelTitle, viewCount: it.viewCount }));
      const payloadForLog = { q, duration, order, maxResults };
      const logData = { time: new Date().toISOString(), payload: payloadForLog, items: safeItems };
      const filePath = path.join(logsDir, `search-${time}.json`);
      fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf8');
    } catch (logErr) {
      console.warn('Failed to write search log', logErr);
    }

    return { ok: true, items };
  } catch (err) {
    console.error('YouTube search error', err);
    return { ok: false, error: String(err.message || err) };
  }
});

function decodeHTMLEntities(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Fetch full video details (snippet, contentDetails, statistics)
ipcMain.handle('youtube:getVideo', async (_event, rawVideoId) => {
  let videoId = typeof rawVideoId === 'object' ? (rawVideoId?.id || rawVideoId?.videoId) : rawVideoId;
  if (typeof videoId === 'string') {
    videoId = videoId.replace(/\.html$/, '').trim();
  }
  if (!videoId || videoId.includes('[id]')) {
    return { ok: false, error: `Invalid video ID: ${rawVideoId}` };
  }
  const apiKey = process.env.YOUTUBE_API_KEY || 'AIzaSyDEOy0q4fuzgaB0Zsu4bcdfgqluOMwgUhE';
  try {
    const youtube = google.youtube({ version: 'v3', auth: apiKey });
    const res = await youtube.videos.list({ part: ['snippet', 'contentDetails', 'statistics'], id: videoId });
    const it = (res.data.items || [])[0];
    if (!it) return { ok: false, error: 'Video not found' };
    const details = {
      videoId: it.id,
      title: decodeHTMLEntities(it.snippet?.title || ''),
      description: decodeHTMLEntities(it.snippet?.description || ''),
      thumbnails: it.snippet?.thumbnails || {},
      publishedAt: it.snippet?.publishedAt || null,
      duration: it.contentDetails?.duration || null,
      viewCount: it.statistics?.viewCount || null,
      likeCount: it.statistics?.likeCount || null
    };
    return { ok: true, details };
  } catch (err) {
    console.error('youtube:getVideo error', err);
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('download:start', async (_event, payload) => {
  // payload: { url, kind: 'audio'|'video', quality, format, outputDir }
  console.log('download:start', payload);
  try {
    const ipcLogsDir = path.join(appLogsDir, 'ipc');
    fs.mkdirSync(ipcLogsDir, { recursive: true });
    const t = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(ipcLogsDir, `ipc-recv-download-start-${t}.json`), JSON.stringify({ time: new Date().toISOString(), rawPayload: payload }, null, 2), 'utf8');
  } catch (e) { /* ignore */ }
  try { fs.appendFileSync(path.join(appLogsDir, 'download-progress.log'), JSON.stringify({ time: new Date().toISOString(), event: 'download:start', payload }) + '\n', 'utf8'); } catch (_) {}
  const url = payload?.url;
  const kind = payload?.kind || 'audio';
  const quality = payload?.quality || 'high';
  const formatPref = payload?.format || null; // e.g. 'webm', 'm4a', 'mp3'
  let outputDir = payload?.outputDir;
  // Validate payload via schema
  try {
    if (downloadStartSchema) downloadStartSchema.parse(payload);
  } catch (schemaErr) {
    try { fs.appendFileSync(path.join(appLogsDir, 'ipc-schema-errors.log'), `${new Date().toISOString()} download:start schemaErr ${String(schemaErr)}\n`); } catch (_){ }
    return { ok: false, error: 'Invalid payload for download:start' };
  }
  // normalize outputDir to safe string if provided
  if (outputDir && typeof outputDir !== 'string') outputDir = null;
  // temp base token used for partial file cleanup and yt-dlp patterns
  let tempBase = null;

  // track whether we've already emitted a 'finished' event for this videoId
  const finishedEmittedFor = new Set();

  if (!url) return { ok: false, error: 'No url provided' };

  if (!outputDir) {
    outputDir = app.getPath('downloads');
  }

  // prepare variables in outer scope so fallback handlers can use them
  let info = null;
  let title = null;
  let filename = null;
  let outPath = null;
  let needMp3Conversion = false;

  // If user requested mp3, attempt to use yt-dlp + ffmpeg to extract & convert to mp3 directly
  if (formatPref === 'mp3') {
    try {
      // locate yt-dlp (prefer bundled)
      const { spawnSync } = require('child_process');
      let ytdlpPath = null;
      try { const bundledPrefer = path.join(__dirname, 'resources', 'bin', 'yt-dlp.exe'); if (fs.existsSync(bundledPrefer)) ytdlpPath = bundledPrefer; } catch (e) {}
      if (!ytdlpPath) {
        const which = spawnSync('where', ['yt-dlp']);
        if (which.status === 0) {
          const out = which.stdout && which.stdout.toString().split(/\r?\n/).filter(Boolean)[0];
          if (out) ytdlpPath = out.trim();
        }
      }
      // locate ffmpeg (prefer bundled)
      let ffmpegPath = null;
      try { const bundledFf = path.join(__dirname, 'resources', 'bin', 'ffmpeg.exe'); if (fs.existsSync(bundledFf)) ffmpegPath = bundledFf; } catch (e) {}
      if (!ffmpegPath) {
        try { const wf = spawnSync('where', ['ffmpeg']); if (wf.status === 0) { const out = wf.stdout && wf.stdout.toString().split(/\r?\n/).filter(Boolean)[0]; if (out) ffmpegPath = out.trim(); } } catch (e) {}
      }

      if (!ytdlpPath) {
        // cannot perform mp3 conversion without yt-dlp; fall back to downloading audio and convert locally later
        console.warn('mp3 requested but yt-dlp not found; will attempt local conversion after download if ffmpeg is available');
        needMp3Conversion = true;
      } else {
        // ensure output dir exists
        fs.mkdirSync(outputDir, { recursive: true });
        // prepare filename/title
        // try to fetch basic info for title if possible
        try {
          const basic = await (async () => {
            try { return await ytdl.getBasicInfo(url, { requestOptions: { headers: { 'User-Agent': DEFAULT_USER_AGENT } } }); } catch (e) { return null; }
          })();
          title = sanitizeFilename(basic?.videoDetails?.title) || Date.now().toString();
        } catch (e) { title = Date.now().toString(); }
        const outPathFallback = path.join(outputDir, `${title}.%(ext)s`);
        // build args: extract audio as mp3, best quality
        const args = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outPathFallback, url, '--no-playlist'];
        if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);

        // logging
        try {
          const ylogDir = path.join(appLogsDir, 'yt-dlp');
          fs.mkdirSync(ylogDir, { recursive: true });
          const tlog = new Date().toISOString().replace(/[:.]/g, '-');
          const ylogPath = path.join(ylogDir, `ytdlp-mp3-${tlog}.log`);
          const ylogStream = fs.createWriteStream(ylogPath, { flags: 'a' });
          try {
            const _origWrite = ylogStream.write.bind(ylogStream);
            ylogStream.write = function (chunk, encoding, cb) {
              try {
                if (ylogStream.destroyed || ylogStream.writableEnded) return false;
                return _origWrite(chunk, encoding, cb);
              } catch (e) { return false; }
            };
          } catch (e) {}
          const { spawn } = require('child_process');
          ylogStream.write(`spawned: ${ytdlpPath} ${args.join(' ')}\n`);
          const subprocess = spawn(ytdlpPath, args, { windowsHide: true, cwd: outputDir });
          subprocess.stdout.on('data', (c) => ylogStream.write(c.toString()));
          subprocess.stderr.on('data', (c) => ylogStream.write(c.toString()));
          await new Promise((resolve, reject) => {
            let exitVal = null;
            let outEnded = !subprocess.stdout;
            let errEnded = !subprocess.stderr;
            if (subprocess.stdout) subprocess.stdout.on('end', () => { outEnded = true; checkDone(); });
            if (subprocess.stderr) subprocess.stderr.on('end', () => { errEnded = true; checkDone(); });
            subprocess.on('close', (code) => { exitVal = code; ylogStream.write(`yt-dlp exit code: ${code}\n`); checkDone(); });
            subprocess.on('error', (err) => { exitVal = err; checkDone(); });
            function checkDone() {
              if (outEnded && errEnded && exitVal !== null) {
                if (typeof exitVal === 'number' && exitVal === 0) resolve();
                else reject(new Error('yt-dlp exited with code ' + (typeof exitVal === 'number' ? exitVal : String(exitVal))));
              }
            }
          });
          ylogStream.end();
          // try to find created mp3
          try {
            const files = fs.readdirSync(outputDir);
            const match = files.find(f => f.endsWith('.mp3') && f.includes((title || '').substring(0, 10)));
            const finalPath = match ? path.join(outputDir, match) : null;
            if (finalPath) {
              try {
                const vid = basic?.videoDetails?.videoId || (url && url.includes('v=') ? url.split('v=')[1].split('&')[0] : null);
                if (!finishedEmittedFor.has(vid || finalPath)) {
                  finishedEmittedFor.add(vid || finalPath);
                  mainWindow?.webContents.send('download:finished', { videoId: vid || null, id: `${title}.mp3`, path: finalPath, url, title: basic?.videoDetails?.title || title, uploader: basic?.videoDetails?.author?.name || null, qualityLabel: null, container: path.extname(finalPath).replace('.', '') });
                }
              } catch (e) {}
              return { ok: true, path: finalPath };
            }
          } catch (e) { /* ignore */ }
        } catch (runErr) {
          console.warn('mp3 conversion via yt-dlp failed', runErr);
          needMp3Conversion = true;
        }
      }
    } catch (e) {
      console.warn('mp3 branch failed', e);
    }
    // fallthrough to regular ytdl-core flow if mp3 path didn't succeed
  }

  try {

    // ensure output dir exists
    fs.mkdirSync(outputDir, { recursive: true });

    // try to get video info with retries and a default user-agent; fallback to getBasicInfo if extraction fails
    let lastInfoErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        info = await ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': DEFAULT_USER_AGENT } } });
        break;
      } catch (e) {
        lastInfoErr = e;
        console.warn(`ytdl.getInfo attempt ${attempt + 1} failed`, e && e.message ? e.message : e);
        // small backoff
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (!info) {
      // if the error looks like extraction failed, try getBasicInfo as a last resort
      try {
        console.warn('getInfo failed after retries, trying getBasicInfo as fallback');
        info = await ytdl.getBasicInfo(url, { requestOptions: { headers: { 'User-Agent': DEFAULT_USER_AGENT } } });
      } catch (e2) {
        console.error('getBasicInfo also failed', e2);
        // attach more context to the thrown error to be caught by outer try
        const ex = lastInfoErr || e2;
        throw ex;
      }
    }
    // write available formats to log to assist debugging
    try {
      const formatsDir = path.join(appLogsDir, 'formats');
      fs.mkdirSync(formatsDir, { recursive: true });
      const vid = info?.videoDetails?.videoId || (url && url.includes('v=') ? url.split('v=')[1].split('&')[0] : 'unknown');
      const timeKey = new Date().toISOString().replace(/[:.]/g, '-');
      const simpleFormats = (info.formats || []).map(f => ({ itag: f.itag, container: f.container, hasVideo: !!f.hasVideo, hasAudio: !!f.hasAudio, qualityLabel: f.qualityLabel || null, bitrate: f.bitrate || null }));
      fs.writeFileSync(path.join(formatsDir, `formats-${vid}-${timeKey}.json`), JSON.stringify({ time: new Date().toISOString(), videoId: vid, formats: simpleFormats }, null, 2), 'utf8');
    } catch (fmtErr) {
      console.warn('failed to write formats log', fmtErr);
    }
    title = sanitizeFilename(info.videoDetails?.title) || Date.now().toString();
    // determine selected format/quality with robust fallback selection
    let chosenFormat = null;
    try {
      const formats = info.formats || [];
      const pickBestAudio = (fmts) => {
        // prefer audio-only formats, highest bitrate
        const audioOnly = fmts.filter(f => f.hasAudio && !f.hasVideo);
        const candidates = (audioOnly.length ? audioOnly : fmts.filter(f => f.hasAudio));
        if (!candidates || candidates.length === 0) return null;
        candidates.sort((a,b) => (b.bitrate||0) - (a.bitrate||0));
        return candidates[0];
      };
      const pickBestVideo = (fmts, prefQuality) => {
        // Attempt to match quality label first (e.g., '1080p', '720p'), then bitrate
        if (prefQuality && ['1080p','720p','480p'].includes(prefQuality)) {
          const byLabel = fmts.filter(f => f.hasVideo && f.qualityLabel && f.qualityLabel.includes(prefQuality));
          if (byLabel.length) return byLabel[0];
        }
        // prefer formats with both video and audio
        const av = fmts.filter(f => f.hasVideo && f.hasAudio);
        const videoOnly = fmts.filter(f => f.hasVideo && !f.hasAudio);
        const candidates = (av.length ? av : videoOnly.length ? videoOnly : fmts.filter(f => f.hasVideo));
        if (!candidates || candidates.length === 0) return null;
        // sort by resolution (qualityLabel) if available, otherwise by bitrate
        candidates.sort((a,b) => {
          const qa = a.qualityLabel ? parseInt(a.qualityLabel.replace(/[^0-9]/g,'')) : 0;
          const qb = b.qualityLabel ? parseInt(b.qualityLabel.replace(/[^0-9]/g,'')) : 0;
          if (qb !== qa) return qb - qa;
          return (b.bitrate||0) - (a.bitrate||0);
        });
        return candidates[0];
      };

      if (kind === 'video') {
        if (quality === '1080p' || quality === '720p' || quality === '480p') {
          chosenFormat = pickBestVideo(formats, quality);
        } else if (quality === 'highest') {
          chosenFormat = pickBestVideo(formats, null) || pickBestAudio(formats);
        } else {
          chosenFormat = pickBestVideo(formats, null) || pickBestAudio(formats);
        }
      } else {
        // audio
        if (quality === 'high' || quality === 'medium' || quality === 'low') {
          chosenFormat = pickBestAudio(formats);
        } else {
          chosenFormat = pickBestAudio(formats) || formats[0];
        }
      }

      if (!chosenFormat) chosenFormat = formats && formats[0];
    } catch (e) {
      console.warn('chooseFormat robust selection failed, falling back', e);
      chosenFormat = info.formats && info.formats[0];
    }

    // decide extension
    let ext = 'mp4';
    if (kind === 'video') {
      ext = chosenFormat?.container || 'mp4';
    } else {
      // audio
      if (formatPref === 'm4a') ext = 'm4a';
      else if (formatPref === 'webm') ext = chosenFormat?.container || 'webm';
      else if (formatPref === 'mp3') {
        // mp3 requested — select an audio container to download first, convert to mp3 later if needed
        needMp3Conversion = true;
        ext = chosenFormat?.container || 'webm';
      } else {
        ext = chosenFormat?.container || 'webm';
      }
    }
    filename = `${title}.${ext}`;
    outPath = path.join(outputDir, filename);

    // derive a friendly quality label for audio or video formats
    let resolvedQualityLabel = null;
    try {
      if (chosenFormat) {
        if (kind === 'audio') {
          // For audio downloads prefer bitrate information even when a format
          // also contains video (avoid showing "360p" for m4a/aac downloads).
          if (chosenFormat.audioBitrate) resolvedQualityLabel = `${chosenFormat.audioBitrate} kbps`;
          else if (chosenFormat.bitrate) resolvedQualityLabel = `${Math.round((chosenFormat.bitrate||0)/1000)} kbps`;
          else if (chosenFormat.qualityLabel) resolvedQualityLabel = chosenFormat.qualityLabel;
        } else {
          // video: prefer qualityLabel (resolution), then audioBitrate as fallback
          if (chosenFormat.qualityLabel) resolvedQualityLabel = chosenFormat.qualityLabel;
          else if (chosenFormat.audioBitrate) resolvedQualityLabel = `${chosenFormat.audioBitrate} kbps`;
          else if (chosenFormat.bitrate) resolvedQualityLabel = `${Math.round((chosenFormat.bitrate||0)/1000)} kbps`;
        }
      }
      // if renderer explicitly requested numeric quality (audio), prefer that
      if ((!resolvedQualityLabel || resolvedQualityLabel === '0 kbps') && typeof quality === 'number') {
        resolvedQualityLabel = `${quality} kbps`;
      }
    } catch (e) { resolvedQualityLabel = resolvedQualityLabel || null; }
    const resolvedContainer = chosenFormat?.container || ext;

    // To avoid creating a zero-byte placeholder at the final path,
    // write ytdl output to a temporary file first, then atomically move it to the
    // desired filename after the download completes.
    tempBase = `maehwa_tmp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const tempOutPath = path.join(outputDir, `${tempBase}${path.extname(filename) || '.' + ext.replace(/\./g,'')}`);

    const stream = ytdl(url, { filter: kind === 'video' ? 'audioandvideo' : 'audioonly', requestOptions: { headers: { 'User-Agent': DEFAULT_USER_AGENT } } });
    const fileStream = fs.createWriteStream(tempOutPath);

    const cleanupPartial = () => {
      try {
        // remove the specific temp file if present
        try { if (tempOutPath && fs.existsSync(tempOutPath)) fs.unlinkSync(tempOutPath); } catch (e) {}
        // remove any temp files matching tempBase token
        try {
          if (tempBase && fs.existsSync(outputDir)) {
            const tmpfiles = fs.readdirSync(outputDir);
            for (const f of tmpfiles) {
              if (f && f.startsWith(tempBase)) {
                try { fs.unlinkSync(path.join(outputDir, f)); } catch (_) {}
              }
            }
          }
        } catch (e) {}
        // also remove any zero-byte final placeholder
        try {
          if (fs.existsSync(outPath)) {
            const st = fs.statSync(outPath);
            if (st.size === 0) fs.unlinkSync(outPath);
          }
        } catch (e) {}
      } catch (e) {
        try { fs.appendFileSync(path.join(appLogsDir, 'window-actions.log'), `${new Date().toISOString()} cleanupPartial failed ${String(e)}\n`); } catch(_){ }
      }
    };

    let downloaded = 0;
    let total = 0;

    // primary: ytdl progress event
    stream.on('progress', (_chunkLength, downloadedBytes, totalBytes) => {
      downloaded = downloadedBytes;
      total = totalBytes;
      const percent = total ? Math.round((downloaded / total) * 100) : 0;
      // include videoId so renderer can correlate progress to queue item
      const videoId = info?.videoDetails?.videoId || (url && url.includes('v=') ? url.split('v=')[1].split('&')[0] : null);
      const uploader = info?.videoDetails?.author?.name || null;
      const titleSend = info?.videoDetails?.title || title || null;
      const qualityLabel = resolvedQualityLabel || null;
      const container = resolvedContainer || path.extname(filename).replace('.', '') || null;
      try {
        try { fs.appendFileSync(path.join(appLogsDir, 'download-progress.log'), JSON.stringify({ time: new Date().toISOString(), id: filename, videoId, title: titleSend, uploader, qualityLabel, container, downloaded, total, percent, url }) + '\n', 'utf8'); } catch(_){}
        mainWindow?.webContents.send('download:progress', { id: filename, videoId, title: titleSend, uploader, qualityLabel, container, downloaded, total, percent, url });
      } catch (e) {
        try { fs.appendFileSync(path.join(appLogsDir, 'download-progress.log'), `send-error ${new Date().toISOString()} ${String(e)}\n`); } catch(_){}
      }
    });

    // fallback: poll temp file size periodically if ytdl progress doesn't fire
    let pollInterval = null;
    try {
      pollInterval = setInterval(() => {
        try {
          if (tempOutPath && fs.existsSync(tempOutPath)) {
            const st = fs.statSync(tempOutPath);
            const cur = st.size || 0;
            // if we don't have a known total, leave total as null
            // If total is unknown, send a numeric 0 so renderer can switch from
            // pulsing to a numeric progress bar (0 -> ... -> 100) rather than
            // staying in indeterminate mode indefinitely.
            const pct = total ? Math.round((cur / total) * 100) : 0;
            const videoId = info?.videoDetails?.videoId || (url && url.includes('v=') ? url.split('v=')[1].split('&')[0] : null);
            const titleSend = (info && info.videoDetails && info.videoDetails.title) ? info.videoDetails.title : title;
            try { fs.appendFileSync(path.join(appLogsDir, 'download-progress.log'), JSON.stringify({ time: new Date().toISOString(), id: filename, videoId, downloaded: cur, total: total || null, percent: pct, url, fallback: true }) + '\n', 'utf8'); } catch(_){}
            try { mainWindow?.webContents.send('download:progress', { id: filename, videoId, title: titleSend, uploader: info?.videoDetails?.author?.name || null, qualityLabel: resolvedQualityLabel || null, container: resolvedContainer || null, downloaded: cur, total: total || null, percent: pct, url }); } catch (e) {}
          }
        } catch (e) {}
      }, 800);
    } catch (e) {}

    stream.pipe(fileStream);

    await new Promise((resolve, reject) => {
      const onFinish = () => {
        removeHandlers();
        try { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } } catch (e) {}
        resolve();
      };
      const onError = (err) => {
        try {
          try { fs.appendFileSync(path.join(appLogsDir, 'download-errors.log'), `${new Date().toISOString()} stream error ${String(err)}\n`); } catch(_){ }
        } catch (e) {}
        try { cleanupPartial(); } catch (e) {}
        removeHandlers();
        reject(err);
      };
      const removeHandlers = () => {
        try { fileStream.removeListener('finish', onFinish); } catch(_){ }
        try { fileStream.removeListener('error', onError); } catch(_){ }
        try { stream.removeListener('error', onError); } catch(_){ }
      };
      fileStream.on('finish', onFinish);
      fileStream.on('error', onError);
      stream.on('error', onError);
    });

    // After successful ytdl download to tempOutPath, move it to desired outPath
    try {
      // remove zero-byte final placeholder if present
      try {
        if (fs.existsSync(outPath)) {
          const st = fs.statSync(outPath);
          if (st.size === 0) fs.unlinkSync(outPath);
        }
      } catch (e) {}

      // handle collisions: if non-empty exists, add suffix
      let finalPath = outPath;
      try {
        if (fs.existsSync(finalPath)) {
          const st = fs.statSync(finalPath);
          if (st.size > 0) {
            const extn = path.extname(finalPath);
            const base = path.basename(finalPath, extn);
            let i = 1;
            while (fs.existsSync(path.join(outputDir, `${base}-${i}${extn}`))) i += 1;
            finalPath = path.join(outputDir, `${base}-${i}${extn}`);
          }
        }
      } catch (e) {}

      if (tempOutPath !== finalPath) {
        try {
          fs.renameSync(tempOutPath, finalPath);
        } catch (e) {
          // fallback to copy+unlink if rename fails (Windows locks)
          try {
            fs.copyFileSync(tempOutPath, finalPath);
            try { fs.unlinkSync(tempOutPath); } catch (_){ }
          } catch (e2) {
            try { fs.appendFileSync(path.join(appLogsDir, 'download-errors.log'), `${new Date().toISOString()} move failed ${String(e)} / ${String(e2)}\n`); } catch(_){ }
          }
        }
      }
      outPath = finalPath;
    } catch (e) {
      try { fs.appendFileSync(path.join(appLogsDir, 'download-errors.log'), `${new Date().toISOString()} post-download finalize failed ${String(e)}\n`); } catch(_){ }
    }

    // If we need to convert to mp3 after download, try to run ffmpeg (prefer bundled)
    if (needMp3Conversion) {
      try {
        // look for ffmpeg
        const { spawnSync } = require('child_process');
        let ffmpegPath = null;
        try { const bundledFf = path.join(__dirname, 'resources', 'bin', 'ffmpeg.exe'); if (fs.existsSync(bundledFf)) ffmpegPath = bundledFf; } catch (e) {}
        if (!ffmpegPath) {
          try { const wf = spawnSync('where', ['ffmpeg']); if (wf.status === 0) { const out = wf.stdout && wf.stdout.toString().split(/\r?\n/).filter(Boolean)[0]; if (out) ffmpegPath = out.trim(); } } catch (e) {}
        }
        if (ffmpegPath && fs.existsSync(outPath)) {
          const mp3Path = outPath.replace(path.extname(outPath), '.mp3');
          try {
            const convLogDir = path.join(appLogsDir, 'ffmpeg');
            fs.mkdirSync(convLogDir, { recursive: true });
            const t = new Date().toISOString().replace(/[:.]/g, '-');
            const convLog = path.join(convLogDir, `ffmpeg-${t}.log`);
            fs.writeFileSync(convLog, `running: ${ffmpegPath} -i "${outPath}" -vn -ar 44100 -ac 2 -b:a 192k "${mp3Path}"\n`,'utf8');
            const conv = spawnSync(ffmpegPath, ['-y','-i', outPath, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '192k', mp3Path], { cwd: outputDir, timeout: 120000 });
            fs.appendFileSync(convLog, `status:${conv.status}\nstdout:${conv.stdout?conv.stdout.toString():''}\nstderr:${conv.stderr?conv.stderr.toString():''}\n`,'utf8');
            if (conv.status === 0 && fs.existsSync(mp3Path)) {
              // remove original (optional) and mark finished with mp3
              try { fs.unlinkSync(outPath); } catch (e) {}
              try {
                const vid = info?.videoDetails?.videoId || (url && url.includes('v=') ? url.split('v=')[1].split('&')[0] : null);
                if (!finishedEmittedFor.has(vid || mp3Path)) {
                  finishedEmittedFor.add(vid || mp3Path);
                  mainWindow?.webContents.send('download:finished', { videoId: vid || null, id: filename.replace(path.extname(filename), '.mp3'), path: mp3Path, url, title: info?.videoDetails?.title || title, uploader: info?.videoDetails?.author?.name || null, qualityLabel: chosenFormat?.qualityLabel || null, container: path.extname(mp3Path).replace('.', '') });
                }
              } catch (e) {}
              return { ok: true, path: mp3Path };
            } else {
              console.warn('ffmpeg conversion failed', conv.status);
            }
          } catch (convErr) {
            console.warn('ffmpeg conversion threw', convErr);
          }
        } else {
          console.warn('ffmpeg not found or output missing; cannot convert to mp3');
        }
      } catch (e) {
        console.warn('post-download mp3 conversion failed', e);
      }
    }

    // notify finished (no conversion performed)
    const videoId = info?.videoDetails?.videoId || (url && url.includes('v=') ? url.split('v=')[1].split('&')[0] : null);
    try {
        if (!finishedEmittedFor.has(videoId || outPath)) {
        finishedEmittedFor.add(videoId || outPath);
        const resultPayload = { videoId, id: filename, path: outPath, url, title: info?.videoDetails?.title || title, uploader: info?.videoDetails?.author?.name || null, qualityLabel: resolvedQualityLabel || null, container: resolvedContainer || path.extname(outPath).replace('.', '') };
        try { fs.appendFileSync(path.join(appLogsDir, 'download-progress.log'), JSON.stringify({ time: new Date().toISOString(), event: 'finished', ...resultPayload }) + '\n', 'utf8'); } catch(_){}
        try { mainWindow?.webContents.send('download:finished', resultPayload); } catch (e) { try { fs.appendFileSync(path.join(appLogsDir, 'download-progress.log'), `finished-send-error ${new Date().toISOString()} ${String(e)}\n`); } catch(_){} }
        // also return the detailed payload to the ipc invoker so preload can finish toast reliably
        return { ok: true, ...resultPayload };
      }
    } catch (e) {}
    return { ok: true, path: outPath };
  } catch (err) {
    console.error('download error', err);
    const errMsg = String(err && err.message ? err.message : err);
    // If ytdl failed to extract functions (player signature change), try yt-dlp fallback if available
      // Always attempt yt-dlp fallback when ytdl throws an error
      if (true) {
      try {
        // remove leftover zero-byte temporary files (maehwa_tmp_*) from a failed ytdl attempt
        try {
          const tmpfiles = fs.readdirSync(outputDir || '.');
          for (const f of tmpfiles) {
            if (f && f.startsWith('maehwa_tmp_')) {
              try {
                const p = path.join(outputDir, f);
                const st = fs.statSync(p);
                if (st.size === 0) {
                  try { fs.unlinkSync(p); } catch(_){}
                  try { fs.appendFileSync(path.join(appLogsDir, 'download-errors.log'), `${new Date().toISOString()} removed zero-byte temp ${p}\n`); } catch(_){ }
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
        const { spawnSync } = require('child_process');
        // Prefer explicit env or system PATH first, then packaged resources
        let ytdlpPath = null;
        // Respect explicit env override if user intentionally set it
        try {
          if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
            ytdlpPath = process.env.YT_DLP_PATH;
          }
        } catch (e) {}
        // check if yt-dlp exists on PATH next
        if (!ytdlpPath) {
          try {
            const which = spawnSync('where', ['yt-dlp']);
            if (which && which.status === 0 && which.stdout) {
              const out = which.stdout.toString().split(/\r?\n/).filter(Boolean)[0];
              if (out) ytdlpPath = out.trim();
            }
          } catch (e) {}
        }
        // then prefer resources unpacked in packaged app (including app.asar.unpacked)
        try {
          if (!ytdlpPath && process && process.resourcesPath) {
            const candidatesUnpacked = [
              path.join(process.resourcesPath, 'bin', 'yt-dlp.exe'),
              path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'yt-dlp.exe'),
              path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', 'yt-dlp.exe'),
              path.join(process.resourcesPath, 'resources', 'bin', 'yt-dlp.exe')
            ];
            for (const c of candidatesUnpacked) {
              try { if (fs.existsSync(c)) { ytdlpPath = c; break; } } catch (e) {}
            }
          }
        } catch (e) {}
        // finally fallback to relative __dirname bundled path (development or mis-packaged)
        try {
          if (!ytdlpPath) {
            const bundledPrefer = path.join(__dirname, 'resources', 'bin', 'yt-dlp.exe');
            if (fs.existsSync(bundledPrefer)) ytdlpPath = bundledPrefer;
          }
        } catch (e) {}
        // If not found on PATH, check common WinGet links location and AppData locations
        if (!ytdlpPath) {
          // Prefer bundled `resources/bin/yt-dlp.exe` when present, fallback to system locations.
          const candidates = [
              // In packaged apps, check resourcesPath/bin first
              (process && process.resourcesPath) ? path.join(process.resourcesPath, 'bin', 'yt-dlp.exe') : null,
              path.join(__dirname, 'resources', 'bin', 'yt-dlp.exe'),
              path.join(process.env.USERPROFILE || 'C:\\Users\\UserK', 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
              path.join(process.env.ProgramFiles || 'C:\\Program Files', 'yt-dlp', 'yt-dlp.exe'),
              path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'yt-dlp', 'yt-dlp.exe')
            ].filter(Boolean);
          for (const c of candidates) {
            try {
              if (fs.existsSync(c)) { ytdlpPath = c; break; }
            } catch (e) {}
          }
        }
        // If bundled binary exists prefer it (stronger guarantee)
        try {
          const bundled = path.join(__dirname, 'resources', 'bin', 'yt-dlp.exe');
          if (fs.existsSync(bundled)) {
            ytdlpPath = bundled;
          }
        } catch (e) {}
        // Avoid using app.asar internal paths which are not executable; prefer unpacked or system PATH
        try {
          if (ytdlpPath && String(ytdlpPath).toLowerCase().includes('app.asar') && !String(ytdlpPath).toLowerCase().includes('app.asar.unpacked')) {
            ytdlpPath = null;
          }
        } catch (e) {}
        // Log which yt-dlp path was selected (or not) and what candidates were checked
        try {
          const ylogDir = path.join(appLogsDir, 'yt-dlp');
          fs.mkdirSync(ylogDir, { recursive: true });
          const whereResult = (() => {
            try {
              const wr = require('child_process').spawnSync('where', ['yt-dlp']);
              if (wr && wr.status === 0 && wr.stdout) return wr.stdout.toString().split(/\r?\n/).filter(Boolean)[0];
            } catch (e) {}
            return null;
          })();
          const candidatesForLog = [
            (process && process.resourcesPath) ? path.join(process.resourcesPath, 'bin', 'yt-dlp.exe') : null,
            path.join(process.env.USERPROFILE || 'C:\\Users\\UserK', 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'yt-dlp', 'yt-dlp.exe'),
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'yt-dlp', 'yt-dlp.exe'),
            path.join(__dirname, 'resources', 'bin', 'yt-dlp.exe')
          ].filter(Boolean);
          const candidateChecks = candidatesForLog.map(p => ({ path: p, exists: (() => { try { return fs.existsSync(p); } catch (e) { return false; } })() }));
          const inv = {
            time: new Date().toISOString(),
            env_YT_DLP_PATH: process.env.YT_DLP_PATH || null,
            which_on_path: whereResult,
            selected_path: ytdlpPath || null,
            candidates: candidateChecks
          };
          const t = new Date().toISOString().replace(/[:.]/g, '-');
          fs.writeFileSync(path.join(ylogDir, `invoke-${t}.json`), JSON.stringify(inv, null, 2), 'utf8');
        } catch (e) {
          console.warn('failed to write yt-dlp invoke log', e);
        }
        if (!ytdlpPath) {
          // write a clear error log indicating yt-dlp is not installed
          try {
            const noteDir = path.join(appLogsDir, 'download-errors');
            fs.mkdirSync(noteDir, { recursive: true });
            const tt = new Date().toISOString().replace(/[:.]/g, '-');
            const note = { time: new Date().toISOString(), url, videoId: (url && url.includes('v=')) ? url.split('v=')[1].split('&')[0] : null, note: 'yt-dlp not found on PATH or common locations; install yt-dlp or provide path in app settings' };
            fs.writeFileSync(path.join(noteDir, `download-error-yt-dlp-missing-${tt}.json`), JSON.stringify(note, null, 2), 'utf8');
          } catch (w) { console.warn('failed to write yt-dlp-missing log', w); }
          console.warn('yt-dlp not found, skipping yt-dlp fallback');
        } else {
          // ensure yt-dlp is available, then run it via execa
          // ensure a filesystem-safe output pattern (avoid problematic characters in titles)
          const safeBase = sanitizeFilename(title || 'video', 180);
          // always use a temporary safe pattern for yt-dlp output to avoid encoding/FS issues
          const tempBase = `maehwa_tmp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
          const outPathPattern = path.join(outputDir, `${tempBase}.%(ext)s`);
            const args = ['-f', kind === 'video' ? 'bestvideo+bestaudio/best' : 'bestaudio[ext=m4a]/bestaudio', '-o', outPathPattern, url, '--restrict-filenames', '--no-mtime', '--no-playlist', '--newline', '--no-continue', '--retries', '3', '--socket-timeout', '15'];
          console.log('Using yt-dlp at', ytdlpPath, 'args', args.join(' '));
          // write yt-dlp logs
          const ylogDir = path.join(appLogsDir, 'yt-dlp');
          fs.mkdirSync(ylogDir, { recursive: true });
          const tlog = new Date().toISOString().replace(/[:.]/g, '-');
          const ylogPath = path.join(ylogDir, `ytdlp-${tlog}.log`);
          const ylogStream = fs.createWriteStream(ylogPath, { flags: 'a' });
          try {
            const _origWrite = ylogStream.write.bind(ylogStream);
            ylogStream.write = function (chunk, encoding, cb) {
              try {
                if (ylogStream.destroyed || ylogStream.writableEnded) return false;
                return _origWrite(chunk, encoding, cb);
              } catch (e) { return false; }
            };
          } catch (e) {}

          // Run yt-dlp directly using child_process.spawn for compatibility
            // First perform a synchronous check to capture immediate execution errors
              const { spawn, spawnSync } = require('child_process');
              try {
                const syncCheck = spawnSync(ytdlpPath, ['--version'], { windowsHide: true, cwd: outputDir, timeout: 15000 });
                ylogStream.write(`spawnSync stdout: ${syncCheck.stdout ? syncCheck.stdout.toString() : ''}\n`);
                ylogStream.write(`spawnSync stderr: ${syncCheck.stderr ? syncCheck.stderr.toString() : ''}\n`);
                ylogStream.write(`spawnSync status: ${syncCheck.status}, error: ${syncCheck.error ? (syncCheck.error.stack||String(syncCheck.error)) : 'none'}\n`);
                if (syncCheck.status !== 0) {
                  ylogStream.write('spawnSync reported non-zero exit; async spawn will still be attempted for detailed runtime output\n');
                }
              } catch (syncErr) {
                ylogStream.write(`spawnSync check threw: ${syncErr && syncErr.stack ? syncErr.stack : String(syncErr)}\n`);
              }
          try {
            const { spawn } = require('child_process');
            // If an earlier attempt created an empty outPath or the desired final name exists as 0-byte, remove to avoid collision
            try {
              if (outPath && fs.existsSync(outPath)) {
                const s = fs.statSync(outPath);
                if (s.size === 0) {
                  try { fs.unlinkSync(outPath); } catch (_) {}
                }
              }
            } catch (e) {}
            // compute desired final filename path (sanitized) and remove zero-byte placeholder if present
            let desiredNameSanitized = null;
            let desiredPathPre = null;
            try {
              desiredNameSanitized = sanitizeFilename(filename || `download_${Date.now()}`, 240);
              desiredPathPre = path.join(outputDir, desiredNameSanitized);
              if (desiredPathPre && fs.existsSync(desiredPathPre)) {
                try {
                  const st = fs.statSync(desiredPathPre);
                  if (st.size === 0) {
                    try { fs.unlinkSync(desiredPathPre); } catch (_) { }
                  }
                } catch (e) {}
              }
            } catch (e) {
              desiredNameSanitized = null;
              desiredPathPre = null;
            }
            // spawn with explicit cwd set to outputDir to simplify output discovery
            const subprocess = spawn(ytdlpPath, args, { windowsHide: true, cwd: outputDir });
            ylogStream.write(`spawned: ${ytdlpPath} ${args.join(' ')}\n`);

            subprocess.stdout.on('data', (chunk) => {
              const text = chunk.toString();
              ylogStream.write(text);
              const m = text.match(/\[download\]\s+([0-9]{1,3}\.\d+|[0-9]{1,3})%/);
              if (m) {
                const percent = Math.round(Number(m[1]));
                // include metadata so preload can show title/uploader/quality even during yt-dlp fallback
                try {
                  mainWindow?.webContents.send('download:progress', {
                    id: filename,
                    videoId: info?.videoDetails?.videoId || null,
                    title: info?.videoDetails?.title || title || null,
                    uploader: info?.videoDetails?.author?.name || null,
                    qualityLabel: chosenFormat?.qualityLabel || null,
                    container: chosenFormat?.container || null,
                    downloaded: null,
                    total: null,
                    percent,
                    url
                  });
                } catch (e) {
                  // best-effort
                }
              }
            });
            subprocess.stderr.on('data', (chunk) => { ylogStream.write(chunk.toString()); });

            await new Promise((resolve, reject) => {
              let exitVal = null;
              let outEnded = !subprocess.stdout;
              let errEnded = !subprocess.stderr;
              if (subprocess.stdout) subprocess.stdout.on('end', () => { outEnded = true; checkDone(); });
              if (subprocess.stderr) subprocess.stderr.on('end', () => { errEnded = true; checkDone(); });
              subprocess.on('close', (code) => { exitVal = code; ylogStream.write(`yt-dlp exit code: ${code}\n`); checkDone(); });
              subprocess.on('error', (err) => { exitVal = err; checkDone(); });
              function checkDone() {
                if (outEnded && errEnded && exitVal !== null) {
                  if (typeof exitVal === 'number' && exitVal === 0) resolve();
                  else reject(new Error('yt-dlp exited with code ' + (typeof exitVal === 'number' ? exitVal : String(exitVal))));
                }
              }
            });

            ylogStream.end();

            // locate produced file using safeBase or explicit outPath
            let finalPath = null;
            try {
              const files = fs.readdirSync(outputDir);
              // prefer explicit outPath if it exists and non-empty
              if (outPath && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
                finalPath = outPath;
              } else {
                // first prefer the tempBase produced by yt-dlp
                const tempCandidates = files.filter(f => f.startsWith(tempBase));
                if (tempCandidates.length) {
                  tempCandidates.sort((a,b)=> {
                    try { return fs.statSync(path.join(outputDir,b)).size - fs.statSync(path.join(outputDir,a)).size; } catch(e){return 0}
                  });
                  finalPath = path.join(outputDir, tempCandidates[0]);
                } else {
                  // fallback: collect candidates whose name includes safeBase or title substring
                  const candidates = files.filter(f => f.startsWith(safeBase) || f.includes((title || '').substring(0,10)));
                  if (candidates.length) {
                    candidates.sort((a,b)=> {
                      try { return fs.statSync(path.join(outputDir,b)).size - fs.statSync(path.join(outputDir,a)).size; } catch(e){return 0}
                    });
                    finalPath = path.join(outputDir, candidates[0]);
                  } else {
                    finalPath = null;
                  }
                }
              }
            } catch (e) { finalPath = null; }

            // verify produced file is non-empty
            if (!finalPath || !fs.existsSync(finalPath)) {
              try { fs.appendFileSync(path.join(appLogsDir, 'yt-dlp-missing.log'), `${new Date().toISOString()} yt-dlp finished but file not found finalPath=${finalPath}\n`); } catch(_){}
              return { ok: false, error: 'yt-dlp finished but output file not found' };
            }
            try {
              const st = fs.statSync(finalPath);
              if (st.size === 0) {
                try { fs.appendFileSync(path.join(appLogsDir, 'yt-dlp-missing.log'), `${new Date().toISOString()} yt-dlp produced zero-byte file ${finalPath}\n`); } catch(_){}
                try { fs.unlinkSync(finalPath); } catch(_){}
                return { ok: false, error: 'yt-dlp produced zero-byte file' };
              }
            } catch (e) {
              try { fs.appendFileSync(path.join(appLogsDir, 'yt-dlp-missing.log'), `${new Date().toISOString()} yt-dlp verify error ${String(e)}\n`); } catch(_){}
              return { ok: false, error: 'failed to verify yt-dlp output' };
            }

            // move to desired sanitized filename (overwrite/remove any 0-byte placeholder)
            try {
              const desiredName = desiredNameSanitized || sanitizeFilename(filename || `download_${Date.now()}`, 240);
              let desiredPath = path.join(outputDir, desiredName);
              try {
                if (fs.existsSync(desiredPath)) {
                  const st = fs.statSync(desiredPath);
                  if (st.size === 0) {
                    try { fs.unlinkSync(desiredPath); } catch (_) {}
                  } else {
                    // non-empty collision -> add suffix
                    const ext = path.extname(desiredPath);
                    const base = path.basename(desiredPath, ext);
                    let i = 1;
                    while (fs.existsSync(path.join(outputDir, `${base}-${i}${ext}`))) i += 1;
                    desiredPath = path.join(outputDir, `${base}-${i}${ext}`);
                  }
                }
              } catch (e) {}
              if (finalPath !== desiredPath) {
                try {
                  fs.renameSync(finalPath, desiredPath);
                  finalPath = desiredPath;
                } catch (e) {
                  // rename may fail due to locks; fallback to copy+unlink (overwrite)
                  try {
                    fs.copyFileSync(finalPath, desiredPath);
                    try { fs.unlinkSync(finalPath); } catch(_){}
                    finalPath = desiredPath;
                  } catch (e2) {
                    try { fs.appendFileSync(path.join(appLogsDir, 'yt-dlp-missing.log'), `${new Date().toISOString()} rename+copy failed ${String(e)} / ${String(e2)}\n`); } catch(_){}
                  }
                }
              }
            } catch (e) {
              try { fs.appendFileSync(path.join(appLogsDir, 'yt-dlp-missing.log'), `${new Date().toISOString()} desired rename error ${String(e)}\n`); } catch(_){}
            }

            // include metadata so renderer/preload can display title/uploader/format on finish
            try {
              mainWindow?.webContents.send('download:finished', {
                videoId: info?.videoDetails?.videoId || null,
                id: filename,
                path: finalPath,
                url,
                title: info?.videoDetails?.title || title || null,
                uploader: info?.videoDetails?.author?.name || null,
                qualityLabel: chosenFormat?.qualityLabel || null,
                container: path.extname(finalPath).replace('.', '') || null
              });
            } catch (e) {
              try { mainWindow?.webContents.send('download:finished', { videoId: info?.videoDetails?.videoId || null, id: filename, path: finalPath }); } catch(_){}
            }
            return { ok: true, path: finalPath };
          } catch (spawnErr) {
            try { ylogStream.end(); } catch (e) {}
            console.warn('yt-dlp fallback failed to start or run', spawnErr);
          }
        }
      } catch (spawnErr) {
        console.warn('yt-dlp fallback failed to start or run', spawnErr);
      }
    }

    try {
            const errDir = path.join(appLogsDir, 'download-errors');
          fs.mkdirSync(errDir, { recursive: true });
      const t = new Date().toISOString().replace(/[:.]/g, '-');
      const videoId = (url && url.includes('v=')) ? url.split('v=')[1].split('&')[0] : null;
      const payload = { time: new Date().toISOString(), url, videoId, error: String(err && err.stack ? err.stack : err) };
      fs.writeFileSync(path.join(errDir, `download-error-${t}.json`), JSON.stringify(payload, null, 2), 'utf8');
      // notify renderer about error if possible
      try {
        mainWindow?.webContents.send('download:error', { videoId, id: null, error: String(err.message || err), url, title: info?.videoDetails?.title || null, uploader: info?.videoDetails?.author?.name || null });
      } catch (e) {}
    } catch (w) {
      console.warn('failed to write download error log', w);
    }
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('dialog:pick-output', async () => {
  const { dialog } = require('electron');
  const res = await dialog.showOpenDialog(mainWindow, { title: '저장 폴더 선택', properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled) return null;
  return res.filePaths[0];
});

ipcMain.handle('path:get-default-downloads', async () => {
  return app.getPath('downloads');
});

ipcMain.handle('window:minimize', () => {
  try {
    fs.appendFileSync(path.join(appLogsDir, 'window-actions.log'), `${new Date().toISOString()} window:minimize called mainWindow=${!!mainWindow}\n`);
  } catch (e) {}
  mainWindow?.minimize();
  return { ok: true };
});

ipcMain.handle('window:close', () => {
  try {
    fs.appendFileSync(path.join(appLogsDir, 'window-actions.log'), `${new Date().toISOString()} window:close called mainWindow=${!!mainWindow}\n`);
  } catch (e) {}
  mainWindow?.close();
  return { ok: true };
});

ipcMain.handle('window:toggle-maximize', () => {
  try {
    try { fs.appendFileSync(path.join(appLogsDir, 'window-actions.log'), `${new Date().toISOString()} window:toggle-maximize called mainWindow=${!!mainWindow}\n`); } catch (e) {}
    if (!mainWindow) return { ok: false };
    const wasMax = mainWindow.isMaximized();
    if (wasMax) mainWindow.unmaximize(); else mainWindow.maximize();
    try { fs.appendFileSync(path.join(appLogsDir, 'window-actions.log'), `${new Date().toISOString()} window:toggle-maximize finished wasMax=${wasMax} nowMax=${mainWindow.isMaximized()}\n`); } catch (e) {}
    return { ok: true, isMaximized: mainWindow.isMaximized() };
  } catch (e) {
    console.warn('toggle-maximize failed', e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});
