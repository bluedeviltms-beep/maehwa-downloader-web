const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const versionDir = path.join(dist, `v${version}`);

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyIfExists(src, destDir) {
  if (!fs.existsSync(src)) return false;
  const base = path.basename(src);
  fs.copyFileSync(src, path.join(destDir, base));
  return true;
}

async function run() {
  ensureDir(dist);
  ensureDir(versionDir);

  // Copy installer and blockmap matching version
  const exePattern = `MaeHwa Downloader-Setup-${version}.exe`;
  const blockmapPattern = `MaeHwa Downloader-Setup-${version}.exe.blockmap`;
  const exeSrc = path.join(dist, exePattern);
  const blockmapSrc = path.join(dist, blockmapPattern);

  const didExe = copyIfExists(exeSrc, versionDir);
  const didBlock = copyIfExists(blockmapSrc, versionDir);

  // Copy latest.yml into version folder and adjust paths if present
  const latestRoot = path.join(dist, 'latest.yml');
  if (fs.existsSync(latestRoot)) {
    const content = fs.readFileSync(latestRoot, 'utf8');
    // naive update: if path line exists, leave file name as-is (it will be inside folder)
    // write same content into version folder
    fs.writeFileSync(path.join(versionDir, 'latest.yml'), content);
  }

  console.log('organize-dist: created', versionDir);
  console.log('organize-dist: copied exe:', didExe, 'blockmap:', didBlock);
}

run().catch(e => { console.error(e); process.exitCode = 1; });
