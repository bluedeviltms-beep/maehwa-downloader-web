const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, '..', 'dist');
const exeName = 'MaeHwa Downloader-Setup-0.1.0.exe';
const exePath = path.join(distDir, exeName);
if (!fs.existsSync(exePath)) {
  console.error('installer not found:', exePath);
  process.exit(1);
}
const buf = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
const size = buf.length;
const pkg = require(path.join(__dirname, '..', 'package.json'));
const latest = [];
const yaml = [];
yaml.push(`version: ${pkg.version}`);
yaml.push('files:');
yaml.push('  - url: ' + exeName);
yaml.push('    sha512: ' + sha512);
yaml.push('    size: ' + size);
yaml.push('path: ' + exeName);
yaml.push('releaseDate: ' + new Date().toISOString());

const outPath = path.join(distDir, 'latest.yml');
fs.writeFileSync(outPath, yaml.join('\n'));
console.log('Wrote', outPath);
