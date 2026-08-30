const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36';

async function run() {
  const url = process.argv[2] || 'https://www.youtube.com/watch?v=BaW_jenozKc';
  const outputDir = path.join(__dirname, '..', 'tmp-downloads');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('Downloading:', url);
  try {
    const info = await ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': DEFAULT_USER_AGENT } } });
    const title = info.videoDetails?.title?.replace(/[\\/:*?"<>|]/g, '_') || Date.now().toString();
    const chosen = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
    const ext = chosen.container || 'webm';
    const outPath = path.join(outputDir, `${title}.${ext}`);
    const stream = ytdl(url, { filter: 'audioonly', requestOptions: { headers: { 'User-Agent': DEFAULT_USER_AGENT } } });
    const fileStream = fs.createWriteStream(outPath);
    stream.on('progress', (_cl, downloaded, total) => {
      const pct = total ? Math.round((downloaded/total)*100) : 0;
      console.log('progress', pct + '%');
    });
    stream.pipe(fileStream);
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
      stream.on('error', reject);
    });
    console.log('Saved to', outPath);
  } catch (e) {
    console.error('Download failed', e);
    process.exitCode = 1;
  }
}

run();
