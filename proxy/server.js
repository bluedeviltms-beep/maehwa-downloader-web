const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || process.env.PROXY_PORT || 3001;
const API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyDEOy0q4fuzgaB0Zsu4bcdfgqluOMwgUhE';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS) || 5;

const downloadProgressMap = {};
let activeDownloadsCount = 0;

function findYtDlpBinary() {
  const isWin = process.platform === 'win32';
  const localBin = path.join(__dirname, '..', 'resources', 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(localBin)) return localBin;
  return 'yt-dlp';
}

function cleanupOldTempFiles() {
  const tmpDir = os.tmpdir();
  const now = Date.now();
  const MAX_AGE_MS = 20 * 60 * 1000; // 20 minutes

  try {
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      if (file.startsWith('maehwa_')) {
        const filePath = path.join(tmpDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > MAX_AGE_MS) {
            fs.unlinkSync(filePath);
            console.log(`[Clean] Deleted stale temp file: ${file}`);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

// Periodic cleanup every 10 minutes
setInterval(cleanupOldTempFiles, 10 * 60 * 1000);

async function fetchVideoViewCounts(videoIds) {
  const ids = [...new Set((videoIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const params = new URLSearchParams({
    part: 'statistics',
    id: ids.join(','),
    key: API_KEY,
  });

  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  const json = await res.json();

  if (!res.ok || !json.items) {
    throw new Error(json?.error?.message || 'YouTube videos API request failed');
  }

  return Object.fromEntries(
    (json.items || []).map((item) => [item.id, item.statistics?.viewCount ?? null])
  );
}

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

const server = http.createServer(async (req, res) => {
  // simple CORS + routing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/' || parsed.pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, status: 'online', service: 'maehwa-downloader-proxy' }));
    return;
  }

  if (parsed.pathname === '/api/search') {
    const q = parsed.query.q || parsed.query.query;
    if (!q) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing query parameter q' }));
      return;
    }

    const params = new URLSearchParams({
      part: 'snippet',
      q: String(q),
      type: 'video',
      maxResults: parsed.query.maxResults || '10',
      key: API_KEY,
    });

    if (parsed.query.order) params.set('order', String(parsed.query.order));
    if (parsed.query.videoDuration) params.set('videoDuration', String(parsed.query.videoDuration));

    const fetchUrl = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    try {
      const r = await fetch(fetchUrl);
      const body = await r.text();
      const json = JSON.parse(body);

      const items = (json.items || [])
        .map((it) => {
          const vid = it.videoId || it.id?.videoId || (typeof it.id === 'string' ? it.id : null);
          return {
            title: decodeHTMLEntities(it.snippet?.title || ''),
            thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || '',
            videoId: vid,
            url: vid ? `https://www.youtube.com/watch?v=${vid}` : '',
            channelTitle: decodeHTMLEntities(it.snippet?.channelTitle || ''),
            viewCount: null,
          };
        })
        .filter((it) => !!it.videoId);

      const ids = items.map((it) => it.videoId).filter(Boolean);
      if (ids.length) {
        try {
          const statsMap = await fetchVideoViewCounts(ids);
          items.forEach((it) => {
            if (it.videoId && statsMap[it.videoId] != null) {
              it.viewCount = statsMap[it.videoId];
            }
          });
        } catch (statsErr) {
          console.warn('proxy search stats failed:', statsErr);
        }
      }

      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, items }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || String(e) }));
    }
    return;
  }

  if (parsed.pathname === '/api/video') {
    const id = parsed.query.id || parsed.query.videoId;
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing videoId' }));
      return;
    }

    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: String(id),
      key: API_KEY,
    });

    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
      const json = await r.json();
      const it = (json.items || [])[0];
      if (!it) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Video not found' }));
        return;
      }
      const details = {
        videoId: it.id,
        title: decodeHTMLEntities(it.snippet?.title || ''),
        description: decodeHTMLEntities(it.snippet?.description || ''),
        thumbnails: it.snippet?.thumbnails || {},
        publishedAt: it.snippet?.publishedAt || null,
        duration: it.contentDetails?.duration || null,
        viewCount: it.statistics?.viewCount || null,
        likeCount: it.statistics?.likeCount || null,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, details }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || String(e) }));
    }
    return;
  }

  if (parsed.pathname === '/api/download-progress') {
    const jobId = parsed.query.id || parsed.query.jobId;
    const info = (jobId && downloadProgressMap[jobId]) ? downloadProgressMap[jobId] : { percent: 0, status: 'starting' };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(info));
    return;
  }

  if (parsed.pathname === '/api/download') {
    const videoUrl = parsed.query.url;
    const kind = parsed.query.kind || 'audio';
    const format = parsed.query.format || (kind === 'audio' ? 'm4a' : 'mp4');
    const rawTitle = parsed.query.title || 'download';
    const quality = parsed.query.quality || 'highest';
    const jobId = parsed.query.jobId || `job_${Date.now()}`;

    if (!videoUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing url' }));
      return;
    }

    if (activeDownloadsCount >= MAX_CONCURRENT_DOWNLOADS) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '서버 다운로드 요청이 많습니다. 잠시 후 다시 시도해 주세요.' }));
      return;
    }

    const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    const filename = `${cleanTitle}.${format}`;
    const encodedFilename = encodeURIComponent(filename);

    const ytDlp = findYtDlpBinary();

    const tempFile = path.join(os.tmpdir(), `maehwa_${Date.now()}_${Math.floor(Math.random()*10000)}.${format}`);

    const args = [
      '--no-playlist',
      '--newline',
      '--no-check-certificates',
      '--geo-bypass',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-o', tempFile
    ];

    if (kind === 'audio') {
      args.push('-x', '--audio-format', format === 'mp3' ? 'mp3' : 'm4a');
    } else {
      let formatSpec = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
      if (quality === '1080p') {
        formatSpec = 'bestvideo[height<=1080]+bestaudio/best';
      } else if (quality === '720p') {
        formatSpec = 'bestvideo[height<=720]+bestaudio/best';
      } else if (quality === '480p') {
        formatSpec = 'bestvideo[height<=480]+bestaudio/best';
      }
      args.push('-f', formatSpec);
      args.push('--merge-output-format', 'mp4');
    }
    args.push(videoUrl);

    downloadProgressMap[jobId] = { percent: 1, status: 'downloading' };
    activeDownloadsCount++;

    const child = cp.spawn(ytDlp, args);
    let stderrLogs = '';

    child.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)\%/);
        if (match && match[1]) {
          const p = Math.min(95, Math.round(parseFloat(match[1])));
          downloadProgressMap[jobId] = { percent: p, status: 'downloading' };
        } else if (line.includes('[Merger]') || line.includes('Merging') || line.includes('[ExtractAudio]')) {
          downloadProgressMap[jobId] = { percent: 97, status: 'processing' };
        }
      }
    });

    child.stderr.on('data', (d) => {
      const msg = d.toString();
      stderrLogs += msg;
      console.log('yt-dlp err:', msg);
    });

    const finishDownload = () => {
      activeDownloadsCount = Math.max(0, activeDownloadsCount - 1);
    };

    child.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(tempFile)) {
        console.error('yt-dlp download failed with code:', code, 'stderr:', stderrLogs);
        downloadProgressMap[jobId] = { percent: 0, status: 'error' };
        finishDownload();
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: `다운로드 실패 (${stderrLogs.slice(-200) || 'code ' + code})` }));
        }
        return;
      }

      downloadProgressMap[jobId] = { percent: 99, status: 'sending' };
      const stat = fs.statSync(tempFile);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
      });

      const readStream = fs.createReadStream(tempFile);
      readStream.pipe(res);
      readStream.on('end', () => {
        downloadProgressMap[jobId] = { percent: 100, status: 'done' };
        finishDownload();
        setTimeout(() => { delete downloadProgressMap[jobId]; }, 10000);
        fs.unlink(tempFile, () => {});
      });
      readStream.on('error', () => {
        finishDownload();
        fs.unlink(tempFile, () => {});
      });
    });

    return;
  }

  if (parsed.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`YouTube proxy listening on http://localhost:${PORT}`);
});
