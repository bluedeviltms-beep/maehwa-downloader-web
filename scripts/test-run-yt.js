const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const exe = path.resolve(__dirname, '..', 'resources', 'bin', 'yt-dlp.exe');
const appdata = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\Users\UserK', 'AppData', 'Roaming');
const outDir = path.join(appdata, 'MaeHwa Downloader', 'logs', 'yt-dlp');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `manual-test-${new Date().toISOString().replace(/[:.]/g,'-')}.log`);
fs.writeFileSync(out, `spawning: ${exe} --version\n`,'utf8');

const subprocess = spawn(exe, ['--version'], { windowsHide: true });
subprocess.stdout.on('data', (c) => { fs.appendFileSync(out, c.toString()); });
subprocess.stderr.on('data', (c) => { fs.appendFileSync(out, c.toString()); });
subprocess.on('close', (code) => { fs.appendFileSync(out, `\nexit ${code}\n`, 'utf8'); console.log('wrote', out); });
subprocess.on('error', (err) => { fs.appendFileSync(out, `\nspawn error: ${String(err)}\n`, 'utf8'); console.error('spawn error', err); });
