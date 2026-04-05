const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const SVG_PATH = path.join(__dirname, '../public/icons/icon.svg')
const OUT_DIR  = path.join(__dirname, '../public/icons')

const SIZES = [
  { name: 'icon-192.png',  size: 192  },
  { name: 'icon-512.png',  size: 512  },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32  },
]

async function generate() {
  const svg = fs.readFileSync(SVG_PATH)

  for (const { name, size } of SIZES) {
    const out = path.join(OUT_DIR, name)
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(out)
    console.log(`✓ ${name} (${size}×${size})`)
  }

  console.log('\nIcone generate in public/icons/')
}

generate().catch(err => { console.error(err); process.exit(1) })
