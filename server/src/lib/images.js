import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';

/**
 * Menu photos are up to 2.4 MB PNGs. Phones get a resized, compressed WebP
 * instead (`/images/…?w=540`), generated once and kept in server/.image-cache.
 * The original files are never changed.
 */
export const WIDTHS = [160, 320, 540, 800, 1080, 1600];
const CACHE_DIR = path.join(config.publicDir, '..', '.image-cache');
const inFlight = new Map();

/** Resolve a URL path under public/images, refusing anything that escapes it. */
export function originalPath(relUrlPath) {
  let rel;
  try {
    rel = decodeURIComponent(relUrlPath).replace(/^\/+/, '');
  } catch {
    return null; // malformed %-encoding
  }
  const full = path.resolve(config.imagesDir, rel);
  if (!full.startsWith(path.resolve(config.imagesDir) + path.sep)) return null;
  return fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}

/** Nearest allowed width at or above what was asked for. */
export const pickWidth = (w) => WIDTHS.find((x) => x >= Number(w)) ?? WIDTHS.at(-1);

/** Path of the resized WebP, building it the first time (or when the original changes). */
export async function resized(full, width) {
  const rel = path.relative(config.imagesDir, full);
  const out = path.join(CACHE_DIR, String(width), `${rel}.webp`);
  const srcTime = fs.statSync(full).mtimeMs;
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= srcTime) return out;

  if (!inFlight.has(out)) {
    inFlight.set(
      out,
      (async () => {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
        await sharp(full, { failOn: 'none' })
          .rotate() // respect phone-camera orientation
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toFile(tmp);
        fs.renameSync(tmp, out);
        return out;
      })().finally(() => inFlight.delete(out)),
    );
  }
  return inFlight.get(out);
}

const SIGNATURES = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.subarray(0, 4).toString('hex') === '89504e47'],
  ['image/webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'],
  ['image/gif', (b) => b.subarray(0, 3).toString() === 'GIF'],
];

/** Content type from the file's real bytes (e.g. a JPEG saved as "mexico.webp"). */
export function sniffType(full) {
  const fd = fs.openSync(full, 'r');
  const head = Buffer.alloc(12);
  try {
    fs.readSync(fd, head, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  return SIGNATURES.find(([, test]) => test(head))?.[0] ?? null;
}

/** Express handler for /images/*: resized WebP when ?w= is given, else the original with its true type. */
export async function serveImage(req, res, next) {
  const full = originalPath(req.path);
  if (!full) return next();
  // Photo links carry ?v=<file time>, so a versioned link can be cached for good.
  const cache = req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=604800';

  if (req.query.w && !full.endsWith('.svg')) {
    try {
      const file = await resized(full, pickWidth(req.query.w));
      res.set({ 'Content-Type': 'image/webp', 'Cache-Control': cache });
      // The cache folder starts with a dot, which sendFile refuses by default.
      return res.sendFile(file, { dotfiles: 'allow' });
    } catch (error) {
      console.error(`Could not resize ${req.path}:`, error.message);
      // Fall through to the original rather than showing a broken image.
    }
  }

  const type = sniffType(full);
  res.set({ 'Cache-Control': cache, ...(type ? { 'Content-Type': type } : {}) });
  res.sendFile(full, { headers: type ? { 'Content-Type': type } : undefined });
}

/** Build the common sizes for every photo in the background, so the first visit is fast. */
export async function warmImageCache(widths = [160, 320, 540, 800, 1080]) {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const photos = walk(config.imagesDir).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
  let built = 0;
  for (const full of photos) {
    for (const w of widths) {
      try {
        const out = path.join(CACHE_DIR, String(w), `${path.relative(config.imagesDir, full)}.webp`);
        if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(full).mtimeMs) continue;
        await resized(full, w);
        built++;
      } catch (error) {
        console.error(`Could not prepare ${path.basename(full)} at ${w}px:`, error.message);
      }
    }
  }
  return { photos: photos.length, built };
}
