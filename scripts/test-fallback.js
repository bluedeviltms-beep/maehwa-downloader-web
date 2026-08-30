const { spawnSync } = require('child_process');
const ytdl = require('ytdl-core');
const path = require('path');
const fs = require('fs');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36';

async function run(url) {
  const outputDir = path.join(__dirname, '..', 'tmp-downloads');
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    console.log('Trying ytdl.getInfo for', url);
    const info = await ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': DEFAULT_USER_AGENT } } });
    console.log('ytdl.getInfo OK, title:', info.videoDetails?.title);
    return;
  } catch (e) {
    console.warn('ytdl.getInfo failed:', e && e.message ? e.message : e);
  }

  // fallback to yt-dlp
  const ytdlpPath = path.join(__dirname, '..', 'resources', 'bin', 'yt-dlp.exe');
  if (!fs.existsSync(ytdlpPath)) {
    console.error('yt-dlp not found at', ytdlpPath);
    process.exit(2);
  }
  const outTemplate = path.join(outputDir, '%(title)s.%(ext)s');
  console.log('Running yt-dlp', ytdlpPath, url);
  const res = spawnSync(ytdlpPath, ['-f', 'best', '-o', outTemplate, url], { stdio: 'inherit' });
  console.log('yt-dlp exit code', res.status);
}

const url = process.argv[2] || 'https://www.youtube.com/watch?v=NOiyDlWl534';
run(url).catch(err => { console.error(err); process.exit(1); });
