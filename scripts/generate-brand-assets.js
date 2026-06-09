/**
 * Generate favicons, PWA icons, and README badge assets from public/images/logo.png.
 * Run: npm run generate:assets
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'public', 'images', 'logo.png');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const PUBLIC_DIR = path.join(ROOT, 'public');

const PNG_SIZES = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'logo-header.png', size: 48 },
];

async function generate() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source logo not found: ${SOURCE}`);
  }

  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const icoBuffers = [];

  for (const { name, size } of PNG_SIZES) {
    const outPath = path.join(IMAGES_DIR, name);
    const buffer = await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    fs.writeFileSync(outPath, buffer);
    console.log(`Wrote ${path.relative(ROOT, outPath)}`);

    if (size <= 48) {
      icoBuffers.push(buffer);
    }
  }

  const faviconIco = await toIco(icoBuffers);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), faviconIco);
  console.log('Wrote public/favicon.ico');

  const manifest = {
    name: 'Flect',
    short_name: 'Flect',
    description: 'Wireless Android screen mirroring controller powered by scrcpy.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#7c3aed',
    icons: [
      { src: '/images/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/images/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/images/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'site.webmanifest'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log('Wrote public/site.webmanifest');

  // Copy full logo for README / docs (repo root docs folder)
  const docsDir = path.join(ROOT, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.copyFileSync(SOURCE, path.join(docsDir, 'logo.png'));
  console.log('Wrote docs/logo.png');
}

generate().catch((err) => {
  console.error('[Flect assets] ERROR:', err.message);
  process.exit(1);
});
