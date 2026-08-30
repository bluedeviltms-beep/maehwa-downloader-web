const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const outDir = fs.existsSync(path.join(rootDir, 'out')) ? path.join(rootDir, 'out') : path.join(rootDir, 'renderer', 'out')
const publicDir = path.join(rootDir, 'public')

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src)
  const stats = exists && fs.statSync(src)
  const isDirectory = exists && stats.isDirectory()
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName))
    })
  } else {
    fs.copyFileSync(src, dest)
  }
}

if (fs.existsSync(outDir)) {
  if (fs.existsSync(publicDir)) {
    fs.rmSync(publicDir, { recursive: true, force: true })
  }
  fs.mkdirSync(publicDir, { recursive: true })
  copyRecursiveSync(outDir, publicDir)

  // Copy renderer/public static icons to public root
  const rendererPublic = path.join(rootDir, 'renderer', 'public')
  if (fs.existsSync(rendererPublic)) {
    copyRecursiveSync(rendererPublic, publicDir)
  }

  console.log(`[Success] Copied clean export from ${outDir} to ${publicDir}`)
} else {
  console.error(`[Error] Export outDir not found: ${outDir}`)
}
