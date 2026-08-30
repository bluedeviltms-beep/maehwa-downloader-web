const fs = require('fs');
const path = require('path');
(async () => {
  try {
    const mod = await import('png-to-ico');
    const pngToIco = mod.default || mod;
    const inPath = path.join(__dirname, '..', 'resources', 'icon.png');
    const outPath = path.join(__dirname, '..', 'resources', 'icon.ico');
    if (!fs.existsSync(inPath)) throw new Error('input PNG not found: ' + inPath);
    const buf = await pngToIco(inPath);
    fs.writeFileSync(outPath, buf);
    console.log('Wrote', outPath);
  } catch (e) {
    console.error('generate-icon failed', e);
    process.exitCode = 1;
  }
})();
