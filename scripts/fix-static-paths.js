const fs = require('fs');
const path = require('path');

function fixDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) fixDir(p);
    else if (/\.html?$/.test(f)) {
      let s = fs.readFileSync(p, 'utf8');
      const before = s;
      s = s.replace(/href="\/_next\//g, 'href="./_next/');
      s = s.replace(/src="\/_next\//g, 'src="./_next/');
      s = s.replace(/href='\/_next\//g, "href='./_next/");
      s = s.replace(/src='\/_next\//g, "src='./_next/");
      if (s !== before) {
        fs.writeFileSync(p, s, 'utf8');
        console.log('Patched', p);
      }
    }
  }
}

const roots = [path.join(__dirname, '..', 'renderer', 'out'), path.join(__dirname, '..', 'public')];
for (const r of roots) fixDir(r);
console.log('done');
