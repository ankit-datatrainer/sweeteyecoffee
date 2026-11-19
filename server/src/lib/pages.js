import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { query, transaction, nowUtc } from '../db.js';
import { config } from '../config.js';
import { imageUrl } from './catalog.js';
import { fail } from './http.js';

export const pageSchema = JSON.parse(fs.readFileSync(new URL('../page-schema.json', import.meta.url), 'utf8'));
export const sectionFields = {
  text: ['overline', 'heading', 'body', 'align', 'background'],
  text_image: ['overline', 'heading', 'body', 'side', 'background', 'image'],
  image: ['caption', 'background', 'image'],
  gallery: ['overline', 'heading', 'background', 'images'],
  cta: ['overline', 'heading', 'text', 'button_label', 'button_url', 'background'],
};
export const jsonValue = (value, fallback = {}) => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
};
export function pageDefinition(page) {
  if (!Object.hasOwn(pageSchema, page)) fail(404, 'Page not found.');
  return pageSchema[page];
}
export function safeContentPath(value, link = false) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      if (u.username || u.password) throw new Error();
      return text;
    } catch {
      fail(422, 'Please use a valid image or website URL.');
    }
  }
  if (
    text.startsWith('//') ||
    /[\\\u0000-\u001f]/.test(text) ||
    text.includes('..') ||
    /^[a-z][a-z\d+.-]*:/i.test(text)
  )
    fail(422, 'Please use a local path or an https:// link.');
  if (link && !text.startsWith('/')) fail(422, 'Page links must start with / or https://.');
  return text;
}
export function contentImage(base, value) {
  const clean = safeContentPath(value);
  if (!clean) return null;
  return /^https?:\/\//i.test(clean) ? clean : imageUrl(base, clean.replace(/^\/?images\//, ''));
}
export function cleanGallery(value) {
  if (!Array.isArray(value) || value.length > 100) fail(422, 'A gallery may contain up to 100 photos.');
  return value
    .filter((v) => v?.src)
    .map((v) => ({ src: safeContentPath(v.src), caption: String(v.caption ?? '').slice(0, 500) }));
}
export async function readPages(base, admin = false, page = null) {
  let contents = [],
    sections = [];
  const definitions = page ? [[page, pageDefinition(page)]] : Object.entries(pageSchema);
  const where = page ? ' WHERE page = ?' : '';
  const params = page ? [page] : [];
  try {
    [contents, sections] = await Promise.all([
      query(`SELECT page, field, value FROM page_contents${where}`, params),
      query(`SELECT * FROM page_sections${where} ORDER BY sort_order, id`, params),
    ]);
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  return Object.fromEntries(
    definitions.map(([key, definition]) => {
      const saved = Object.fromEntries(contents.filter((r) => r.page === key).map((r) => [r.field, r.value]));
      const fields = {},
        hidden = [];
      for (const [section, def] of Object.entries(definition.sections)) {
        if (def.hideable && saved[`${section}._hidden`] === '1') hidden.push(section);
        for (const [field, [type, , fallback]] of Object.entries(def.fields)) {
          const name = `${section}.${field}`;
          let value = saved[name] ?? fallback;
          if (type === 'gallery') value = jsonValue(value, []);
          if (!admin && type === 'image') value = contentImage(base, value);
          if (!admin && type === 'gallery')
            value = value.map((p) => ({ ...p, url: contentImage(base, p.src) })).filter((p) => p.url);
          fields[name] = value;
        }
      }
      const extra = sections
        .filter((s) => s.page === key && (admin || s.is_visible))
        .map((s) => {
          const data = { ...jsonValue(s.data) };
          if (!admin && data.image) data.image = contentImage(base, data.image);
          if (!admin && data.images) data.images = data.images.map((p) => ({ ...p, url: contentImage(base, p.src) }));
          return { id: s.id, type: s.type, data, sort_order: s.sort_order, is_visible: Boolean(s.is_visible) };
        });
      return [
        key,
        { title: definition.title, fields, hidden, sections: extra, ...(admin ? { schema: definition.sections } : {}) },
      ];
    }),
  );
}
export async function savePage(page, body) {
  const schema = pageDefinition(page);
  const updates = [];
  for (const [key, value] of Object.entries(body.fields ?? {})) {
    const [section, field] = key.split('.');
    const def = schema.sections[section]?.fields[field];
    if (!def) fail(422, 'Unknown page field.');
    const [type] = def;
    let clean;
    if (type === 'gallery') clean = JSON.stringify(cleanGallery(value));
    else {
      if (typeof value !== 'string' || value.length > 30000) fail(422, 'Page text must be under 30,000 characters.');
      clean = value.trim();
      if (type === 'image' || type === 'url') clean = safeContentPath(clean, type === 'url');
    }
    updates.push([key, clean]);
  }
  const now = nowUtc();
  await transaction(async (conn) => {
    for (const section of body.reset ?? []) {
      if (!Object.hasOwn(schema.sections, section)) fail(422, 'Unknown section.');
      await conn.query('DELETE FROM page_contents WHERE page = ? AND field LIKE ?', [page, `${section}.%`]);
    }
    for (const [key, value] of updates)
      await conn.query(
        'INSERT INTO page_contents (page, field, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)',
        [page, key, value, now, now],
      );
    if (body.hidden !== undefined) {
      if (!Array.isArray(body.hidden)) fail(422, 'Invalid hidden sections.');
      for (const [key, def] of Object.entries(schema.sections))
        if (def.hideable) {
          await conn.query(
            'INSERT INTO page_contents (page, field, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)',
            [page, `${key}._hidden`, body.hidden.includes(key) ? '1' : '0', now, now],
          );
        }
    }
  });
}
export function cleanSection(type, raw) {
  if (!Object.hasOwn(sectionFields, type)) fail(422, 'Please choose a section type.');
  const data = {};
  for (const key of sectionFields[type]) {
    const v = raw?.[key] ?? (key === 'images' ? [] : '');
    if (key === 'images') data[key] = cleanGallery(v);
    else {
      if (typeof v !== 'string' || v.length > 30000) fail(422, 'Section text is too long.');
      data[key] = key === 'image' || key === 'button_url' ? safeContentPath(v, key === 'button_url') : v;
    }
  }
  return data;
}
export async function storePageImage(page, raw) {
  pageDefinition(page);
  const match = String(raw ?? '').match(/^data:image\/(?:jpeg|png|webp|gif);base64,(.+)$/s);
  if (!match) fail(422, 'Choose a JPG, PNG, WebP or GIF photo.');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) fail(422, 'Choose a photo smaller than 5 MB.');
  const meta = await sharp(bytes, { limitInputPixels: 40000000 })
    .metadata()
    .catch(() => null);
  if (!meta || !['jpeg', 'png', 'webp', 'gif'].includes(meta.format)) fail(422, 'That file is not a supported photo.');
  const rel = `pages/${page}/${crypto.randomUUID()}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`;
  await fs.promises.mkdir(path.dirname(path.join(config.imagesDir, rel)), { recursive: true });
  await fs.promises.writeFile(path.join(config.imagesDir, rel), bytes);
  return rel;
}
