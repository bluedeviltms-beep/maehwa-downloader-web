const https = require('https');
const fs = require('fs');
const path = require('path');

(async function main(){
  try {
    const outDir = path.join(__dirname, '..', 'resources', 'bin');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'yt-dlp.exe');

    // If already exists, skip
    if (fs.existsSync(outPath)) {
      console.log('yt-dlp already exists at', outPath);
      process.exit(0);
    }

    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    console.log('Downloading yt-dlp from', url);

    const download = (u, dest) => new Promise((resolve, reject) => {
      const opts = { headers: { 'User-Agent': 'maehwa-downloader-installer' } };
      const req = https.get(u, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // follow redirect
          return resolve(download(res.headers.location, dest));
        }
        if (res.statusCode !== 200) return reject(new Error('Failed to download, status ' + res.statusCode));
        const file = fs.createWriteStream(dest, { flags: 'w' });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', (err) => reject(err));
      });
      req.on('error', reject);
    });

    const p = await download(url, outPath);
    console.log('Downloaded yt-dlp to', p);
  } catch (e) {
    console.error('Failed to download yt-dlp', e);
    process.exit(2);
  }
})();
