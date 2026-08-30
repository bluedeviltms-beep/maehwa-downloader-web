const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targetDir = path.join(root, '깃허브 레포 올릴꺼');
fs.mkdirSync(targetDir, { recursive: true });

const files = [
  '.gitignore',
  'main.js',
  'package-lock.json',
  'package.json',
  'preload.js',
  path.join('public','sounds','sample-tone.wav')
];

for (const f of files) {
  const src = path.join(root, f);
  const dest = path.join(targetDir, path.basename(f));
  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log('copied', src, '->', dest);
    } else {
      console.warn('missing', src);
    }
  } catch (e) {
    console.error('failed', src, e);
  }
}
console.log('done');
