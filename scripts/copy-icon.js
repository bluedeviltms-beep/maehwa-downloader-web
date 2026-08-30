const fs = require('fs');
const path = require('path');

const srcIcon = path.join(__dirname, '..', 'public', 'icon.ico');
const srcMaehwa = path.join(__dirname, '..', 'public', 'maehwadownloader.ico');
const src = fs.existsSync(srcIcon) ? srcIcon : srcMaehwa;

const destDir = path.join(__dirname, '..', 'resources');
const destMaehwa = path.join(destDir, 'maehwadownloader.ico');
const destIcon = path.join(destDir, 'icon.ico');

try {
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(src)) {
    console.error('Source icon not found at', srcIcon, 'or', srcMaehwa);
    process.exitCode = 2;
  } else {
    fs.copyFileSync(src, destMaehwa);
    fs.copyFileSync(src, destIcon);
    console.log('Copied', src, '->', destMaehwa, 'and', destIcon);
  }
} catch (e) {
  console.error('Failed to copy icon', e);
  process.exitCode = 1;
}

