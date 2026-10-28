import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { first, query, transaction, nowUtc } from '../db.js';
import { fail, money, optionalString, requireString } from '../lib/http.js';
import { baseUrl, forgetImage, imageUrl } from '../lib/catalog.js';
import { requireAdmin } from '../lib/auth.js';
import { getSettings, normalizeHours } from '../lib/store.js';
import { couponLabel } from '../lib/pricing.js';

/**
 * Staff editing of the menu and shop settings — the parts of the Laravel admin
 * panel (Admin\ProductController, CategoryController, ModifierController,
 * CouponController, SettingsController) that the app replaces.
 */
export const adminCatalogRoutes = Router();
adminCatalogRoutes.use('/admin', requireAdmin);

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Same idea as Laravel's Str::slug: "Croissant - Za'atar" → "croissant-zaatar". */
export const slugify = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

/** products.slug / categories.slug are unique, so add -2, -3… when a name repeats. */
async function uniqueSlug(table, name, ignoreId = null) {
  const base = slugify(name);
  for (let n = 1; n < 500; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await first(`SELECT id FROM ${table} WHERE slug = ? ${ignoreId ? 'AND id <> ?' : ''}`, ignoreId ? [slug, ignoreId] : [slug]);
    if (!taken) return slug;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function number(value, message, { min = 0, max = 99999, optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n < min || n > max) fail(422, message);
  return n;
}

const bool = (value) => (value ? 1 : 0);
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

// ── Products ────────────────────────────────────────────────────────────────

adminCatalogRoutes.get('/admin/products', async (req, res) => {
  const base = baseUrl(req);
  const rows = await query(
    `SELECT p.id, p.category_id, p.name, p.price, p.image, p.iced_image, p.sort_order,
            p.is_available, p.is_sold_out, p.is_featured, c.name AS category_name, c.slug AS category_slug,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS size_count
       FROM products p JOIN categories c ON c.id = p.category_id
      ORDER BY c.sort_order, p.sort_order, p.id`,
  );
  res.json({
    products: rows.map((p) => ({
      ...p,
      image: imageUrl(base, p.image),
      iced_image: imageUrl(base, p.iced_image),
      is_available: Boolean(p.is_available),
      is_sold_out: Boolean(p.is_sold_out),
      is_featured: Boolean(p.is_featured),
    })),
  });
});

/** Everything the edit form needs: the product, its sizes, its option groups, and the choices. */
adminCatalogRoutes.get('/admin/products/form', async (req, res) => {
  const base = baseUrl(req);
  const id = req.query.id ? Number(req.query.id) : null;
  const [categories, groups] = await Promise.all([
    query('SELECT id, name, slug, is_active FROM categories ORDER BY sort_order, id'),
    query(
      `SELECT g.id, g.name, g.slug, g.selection, g.is_required,
              (SELECT GROUP_CONCAT(m.name ORDER BY m.sort_order, m.id SEPARATOR ', ') FROM modifiers m WHERE m.modifier_group_id = g.id AND m.is_active = 1) AS options
         FROM modifier_groups g ORDER BY g.sort_order, g.id`,
    ),
  ]);

  let product = null;
  if (id) {
    const p = await first('SELECT * FROM products WHERE id = ?', [id]);
    if (!p) fail(404, 'Product not found.');
    const [sizes, links] = await Promise.all([
      query('SELECT size_name, price, image, is_available FROM product_variants WHERE product_id = ? ORDER BY sort_order, id', [id]),
      query('SELECT modifier_group_id FROM modifier_group_product WHERE product_id = ?', [id]),
    ]);
    product = {
      id: p.id,
      category_id: p.category_id,
      name: p.name,
      description: p.description,
      price: p.price,
      image: imageUrl(base, p.image),
      iced_image: imageUrl(base, p.iced_image),
      is_available: Boolean(p.is_available),
      is_sold_out: Boolean(p.is_sold_out),
      is_featured: Boolean(p.is_featured),
      sizes: sizes.map((s) => ({ name: s.size_name, price: s.price, is_available: Boolean(s.is_available), image: imageUrl(base, s.image) })),
      group_ids: links.map((l) => l.modifier_group_id),
    };
  }

  res.json({
    product,
    categories: categories.map((c) => ({ ...c, is_active: Boolean(c.is_active) })),
    groups: groups.map((g) => ({ ...g, is_required: Boolean(g.is_required) })),
  });
});

function readProductBody(body = {}) {
  const name = requireString(body.name, 'Please enter a product name.');
  const categoryId = Number(body.category_id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) fail(422, 'Please choose a category.');
  const price = money(number(body.price, 'Please enter a valid price.', { max: 9999 }));

  const seen = new Set();
  const sizes = (Array.isArray(body.sizes) ? body.sizes : [])
    .filter((s) => s && String(s.name ?? '').trim())
    .map((s) => {
      const sizeName = String(s.name).trim().slice(0, 255);
      if (seen.has(sizeName.toLowerCase())) fail(422, `The size “${sizeName}” is listed twice.`);
      seen.add(sizeName.toLowerCase());
      return { name: sizeName, price: money(number(s.price, `Please enter a price for ${sizeName}.`, { max: 9999 })), is_available: s.is_available !== false };
    });
  if (sizes.length > 30) fail(422, 'Too many sizes.');

  const groupIds = [...new Set((Array.isArray(body.group_ids) ? body.group_ids : []).map(Number).filter(Number.isInteger))];

  return {
    name,
    categoryId,
    price,
    description: optionalString(body.description, 5000),
    isAvailable: body.is_available !== false,
    isSoldOut: Boolean(body.is_sold_out),
    isFeatured: Boolean(body.is_featured),
    sizes,
    groupIds,
  };
}

async function saveProductExtras(conn, productId, data, now) {
  // Keep each size's photo and on/off state (e.g. hat colours) when sizes are re-saved.
  const [old] = await conn.query('SELECT size_name, image, is_available FROM product_variants WHERE product_id = ?', [productId]);
  const previous = new Map(old.map((v) => [v.size_name, v]));
  await conn.query('DELETE FROM product_variants WHERE product_id = ?', [productId]);
  for (const [i, s] of data.sizes.entries()) {
    await conn.query(
      'INSERT INTO product_variants (product_id, size_name, price, image, sort_order, is_available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [productId, s.name, s.price, previous.get(s.name)?.image ?? null, i, bool(s.is_available), now, now],
    );
  }

  await conn.query('DELETE FROM modifier_group_product WHERE product_id = ?', [productId]);
  if (data.groupIds.length) {
    const [valid] = await conn.query('SELECT id FROM modifier_groups WHERE id IN (?)', [data.groupIds]);
    for (const g of valid) {
      await conn.query('INSERT INTO modifier_group_product (product_id, modifier_group_id) VALUES (?, ?)', [productId, g.id]);
    }
  }
}

adminCatalogRoutes.post('/admin/products', async (req, res) => {
  const data = readProductBody(req.body);
  if (!(await first('SELECT id FROM categories WHERE id = ?', [data.categoryId]))) fail(422, 'Please choose a category.');
  const slug = await uniqueSlug('products', data.name);
  const now = nowUtc();

  const id = await transaction(async (conn) => {
    const [[{ next }]] = await conn.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM products WHERE category_id = ?', [data.categoryId]);
    const [r] = await conn.query(
      `INSERT INTO products (category_id, name, slug, description, price, is_available, is_sold_out, is_featured, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.categoryId, data.name, slug, data.description, data.price, bool(data.isAvailable), bool(data.isSoldOut), bool(data.isFeatured), next, now, now],
    );
    await saveProductExtras(conn, r.insertId, data, now);
    return r.insertId;
  });
  res.status(201).json({ id, message: `${data.name} created.` });
});

adminCatalogRoutes.put('/admin/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  const product = await first('SELECT id, category_id FROM products WHERE id = ?', [id]);
  if (!product) fail(404, 'Product not found.');
  const data = readProductBody(req.body);
  if (!(await first('SELECT id FROM categories WHERE id = ?', [data.categoryId]))) fail(422, 'Please choose a category.');
  const slug = await uniqueSlug('products', data.name, id);
  const now = nowUtc();

  await transaction(async (conn) => {
    await conn.query(
      `UPDATE products SET category_id = ?, name = ?, slug = ?, description = ?, price = ?,
              is_available = ?, is_sold_out = ?, is_featured = ?, updated_at = ? WHERE id = ?`,
      [data.categoryId, data.name, slug, data.description, data.price, bool(data.isAvailable), bool(data.isSoldOut), bool(data.isFeatured), now, id],
    );
    await saveProductExtras(conn, id, data, now);
  });
  res.json({ id, message: `${data.name} saved.` });
});

adminCatalogRoutes.delete('/admin/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  const product = await first('SELECT id, name FROM products WHERE id = ?', [id]);
  if (!product) fail(404, 'Product not found.');
  // Deleting would cascade-delete it from customers' past orders, so ordered items are hidden instead.
  if (await first('SELECT id FROM order_items WHERE product_id = ? LIMIT 1', [id])) {
    await query('UPDATE products SET is_available = 0, updated_at = ? WHERE id = ?', [nowUtc(), id]);
    return res.json({ hidden: true, message: `${product.name} has past orders, so it was hidden from the menu instead of deleted.` });
  }
  await query('DELETE FROM products WHERE id = ?', [id]);
  res.json({ deleted: true, message: `${product.name} deleted.` });
});

/** New top-to-bottom order for the items of one category. */
adminCatalogRoutes.post('/admin/products/reorder', async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
  if (!ids.length) fail(422, 'Nothing to reorder.');
  const rows = await query('SELECT id, category_id FROM products WHERE id IN (?)', [ids]);
  if (rows.length !== new Set(ids).size) fail(422, 'Some of those products no longer exist.');
  if (new Set(rows.map((r) => r.category_id)).size > 1) fail(422, 'Products must all belong to the same category.');
  await transaction(async (conn) => {
    for (const [i, id] of ids.entries()) await conn.query('UPDATE products SET sort_order = ? WHERE id = ?', [i + 1, id]);
  });
  res.json({ ok: true, message: 'Order saved.' });
});

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Upload a product photo (base64) — saved like the website did:
 * public/images/menu/{category}/{product}[-iced].{ext}, written to a temp file
 * then swapped in, with a timestamped fallback if the old file is locked.
 */
adminCatalogRoutes.post('/admin/products/:id/photo', async (req, res) => {
  const id = Number(req.params.id);
  const product = await first(
    'SELECT p.id, p.name, p.image, p.iced_image, c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?',
    [id],
  );
  if (!product) fail(404, 'Product not found.');
  const slot = req.body?.slot === 'iced_image' ? 'iced_image' : 'image';

  if (req.body?.remove) {
    if (slot !== 'iced_image') fail(422, 'Only the iced photo can be removed.');
    await query('UPDATE products SET iced_image = NULL, updated_at = ? WHERE id = ?', [nowUtc(), id]);
    return res.json({ message: 'Iced photo removed.', url: null });
  }

  const raw = String(req.body?.data ?? '');
  const match = raw.match(/^data:([\w/+.-]+);base64,(.+)$/s);
  const mime = (match?.[1] ?? req.body?.mime ?? '').toLowerCase();
  const ext = PHOTO_TYPES[mime];
  if (!ext) fail(422, 'Please choose a JPG, PNG, WebP or GIF photo.');
  const bytes = Buffer.from(match ? match[2] : raw, 'base64');
  if (!bytes.length) fail(422, 'That photo is empty.');
  if (bytes.length > 5 * 1024 * 1024) fail(422, 'Please choose a photo under 5 MB.');
  // Trust the file's real contents, not the type the client claimed.
  const real = await sharp(bytes).metadata().catch(() => null);
  const REAL_EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };
  if (!real || !REAL_EXT[real.format]) fail(422, 'That file is not a JPG, PNG, WebP or GIF photo.');

  const folder = `menu/${slugify(product.category_name)}`;
  const baseName = `${slugify(product.name)}${slot === 'iced_image' ? '-iced' : ''}`;
  const dir = path.join(config.imagesDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${baseName}-${crypto.randomBytes(4).toString('hex')}.${REAL_EXT[real.format]}`);
  fs.writeFileSync(tmp, bytes);

  let fileName = `${baseName}.${REAL_EXT[real.format]}`;
  try {
    fs.renameSync(tmp, path.join(dir, fileName));
  } catch {
    // Old photo still open (OneDrive / a viewer) → keep a readable fallback name.
    fileName = `${baseName}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.${REAL_EXT[real.format]}`;
    fs.renameSync(tmp, path.join(dir, fileName));
  }

  const relPath = `${folder}/${fileName}`;
  // Best-effort cleanup of this product's older photos in other formats, unless another product uses them.
  // Slugs are only a-z, 0-9 and "-", so they are safe inside a RegExp.
  const timestamped = new RegExp(`^${baseName}-\\d{14}\\.`);
  for (const f of fs.readdirSync(dir)) {
    const older = f !== fileName && (f.startsWith(`${baseName}.`) || timestamped.test(f));
    if (!older) continue;
    const other = `${folder}/${f}`;
    if (await first('SELECT id FROM products WHERE (image = ? OR iced_image = ?) AND id <> ?', [other, other, id])) continue;
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      // Locked — leave it.
    }
  }

  forgetImage(relPath);
  forgetImage(product[slot]);
  await query(`UPDATE products SET ${slot} = ?, updated_at = ? WHERE id = ?`, [relPath, nowUtc(), id]);
  res.json({ message: slot === 'iced_image' ? 'Iced photo updated.' : 'Photo updated.', url: imageUrl(baseUrl(req), relPath) });
});

// ── Categories ──────────────────────────────────────────────────────────────

adminCatalogRoutes.get('/admin/categories', async (_req, res) => {
  const rows = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
       FROM categories c ORDER BY c.sort_order, c.id`,
  );
  res.json({ categories: rows.map((c) => ({ ...c, is_active: Boolean(c.is_active) })) });
});

function readCategoryBody(body = {}) {
  const name = requireString(body.name, 'Please enter a category name.');
  const start = optionalString(body.season_start, 5);
  const end = optionalString(body.season_end, 5);
  if ((start && !end) || (!start && end)) fail(422, 'Please enter both the season start and end, or neither.');
  if (start && !MONTH_DAY.test(start)) fail(422, 'Use month-day format for the season start, e.g. 09-14.');
  if (end && !MONTH_DAY.test(end)) fail(422, 'Use month-day format for the season end, e.g. 11-14.');
  return {
    name,
    description: optionalString(body.description, 5000),
    notes: optionalString(body.notes, 5000),
    sortOrder: Math.round(number(body.sort_order ?? 0, 'Sort order must be a number.', { min: -9999, max: 9999 })),
    isActive: body.is_active !== false,
    start,
    end,
  };
}

adminCatalogRoutes.post('/admin/categories', async (req, res) => {
  const d = readCategoryBody(req.body);
  const now = nowUtc();
  const r = await query(
    `INSERT INTO categories (name, slug, description, notes, sort_order, is_active, season_start, season_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.name, await uniqueSlug('categories', d.name), d.description, d.notes, d.sortOrder, bool(d.isActive), d.start, d.end, now, now],
  );
  res.status(201).json({ id: r.insertId, message: 'Category created!' });
});

adminCatalogRoutes.put('/admin/categories/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await first('SELECT id FROM categories WHERE id = ?', [id]))) fail(404, 'Category not found.');
  const d = readCategoryBody(req.body);
  await query(
    `UPDATE categories SET name = ?, slug = ?, description = ?, notes = ?, sort_order = ?, is_active = ?,
            season_start = ?, season_end = ?, updated_at = ? WHERE id = ?`,
    [d.name, await uniqueSlug('categories', d.name, id), d.description, d.notes, d.sortOrder, bool(d.isActive), d.start, d.end, nowUtc(), id],
  );
  res.json({ id, message: 'Category updated!' });
});

adminCatalogRoutes.delete('/admin/categories/:id', async (req, res) => {
  const id = Number(req.params.id);
  const category = await first('SELECT c.name, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS n FROM categories c WHERE c.id = ?', [id]);
  if (!category) fail(404, 'Category not found.');
  // The database would delete its products (and their order history) with it.
  if (category.n > 0) fail(422, `${category.name} still has ${category.n} item${category.n > 1 ? 's' : ''}. Move or delete them first, or switch the category off instead.`);
  await query('DELETE FROM categories WHERE id = ?', [id]);
  res.json({ message: 'Category deleted!' });
});

// ── Drink options (modifier groups) ─────────────────────────────────────────

adminCatalogRoutes.get('/admin/modifier-groups', async (_req, res) => {
  const [groups, modifiers] = await Promise.all([
    query(
      `SELECT g.*, (SELECT COUNT(*) FROM modifier_group_product x WHERE x.modifier_group_id = g.id) AS product_count
         FROM modifier_groups g ORDER BY g.sort_order, g.id`,
    ),
    query('SELECT * FROM modifiers ORDER BY sort_order, id'),
  ]);
  res.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      selection: g.selection,
      is_required: Boolean(g.is_required),
      product_count: g.product_count,
      options: modifiers
        .filter((m) => m.modifier_group_id === g.id)
        .map((m) => ({ id: m.id, name: m.name, price: m.price, large_price: m.large_price, is_active: Boolean(m.is_active) })),
    })),
  });
});

/** Save names, prices and on/off for any number of options (port of ModifierController::update). */
adminCatalogRoutes.put('/admin/modifiers', async (req, res) => {
  const rows = Array.isArray(req.body?.options) ? req.body.options : [];
  if (!rows.length) fail(422, 'Nothing to save.');
  const now = nowUtc();
  await transaction(async (conn) => {
    for (const row of rows) {
      const name = requireString(row.name, 'Every option needs a name.', 60);
      const price = money(number(row.price, `Please enter a price for ${name}.`, { max: 99 }));
      const large = row.large_price === null || row.large_price === undefined || row.large_price === ''
        ? null
        : money(number(row.large_price, `Please enter a valid large price for ${name}.`, { max: 99 }));
      await conn.query('UPDATE modifiers SET name = ?, price = ?, large_price = ?, is_active = ?, updated_at = ? WHERE id = ?', [
        name, price, large, bool(row.is_active !== false), now, Number(row.id),
      ]);
    }
  });
  res.json({ message: 'Drink options saved.' });
});

adminCatalogRoutes.post('/admin/modifier-groups/:id/options', async (req, res) => {
  const group = await first('SELECT id, name FROM modifier_groups WHERE id = ?', [Number(req.params.id)]);
  if (!group) fail(404, 'Option group not found.');
  const name = requireString(req.body?.name, 'Please enter the option name.', 60);
  const price = money(number(req.body?.price ?? 0, 'Please enter a valid price.', { max: 99 }));
  const now = nowUtc();
  const r = await query(
    `INSERT INTO modifiers (modifier_group_id, name, price, sort_order, is_active, created_at, updated_at)
     SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, 1, ?, ? FROM modifiers WHERE modifier_group_id = ?`,
    [group.id, name, price, now, now, group.id],
  );
  res.status(201).json({ id: r.insertId, message: `${name} added to ${group.name}.` });
});

// ── Coupons ─────────────────────────────────────────────────────────────────

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?$/;

/** "2026-11-01" or "2026-11-01 14:30" → "2026-11-01 14:30:00" (stored as entered, like the website). */
function readDateTime(value, label) {
  const text = optionalString(value, 20);
  if (!text) return null;
  const m = text.match(DATE_TIME);
  if (!m || Number.isNaN(new Date(`${m[1]}T00:00:00Z`).getTime())) fail(422, `${label} must look like 2026-11-01 or 2026-11-01 14:30.`);
  return `${m[1]} ${m[2] ?? '00'}:${m[3] ?? '00'}:00`;
}

function serializeCoupon(c) {
  const now = Date.now();
  const at = (v) => (v ? new Date(`${v.replace(' ', 'T')}Z`).getTime() : null);
  let state = 'active';
  if (!c.is_active) state = 'off';
  else if (at(c.expires_at) !== null && at(c.expires_at) < now) state = 'expired';
  else if (at(c.starts_at) !== null && at(c.starts_at) > now) state = 'scheduled';
  else if (c.max_uses && c.used_count >= c.max_uses) state = 'used_up';
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: c.value,
    label: couponLabel(c),
    min_order_amount: c.min_order_amount,
    max_discount: c.max_discount,
    max_uses: c.max_uses,
    used_count: c.used_count,
    starts_at: c.starts_at ? c.starts_at.slice(0, 16) : null,
    expires_at: c.expires_at ? c.expires_at.slice(0, 16) : null,
    is_active: Boolean(c.is_active),
    state,
  };
}

adminCatalogRoutes.get('/admin/coupons', async (_req, res) => {
  const rows = await query('SELECT * FROM coupons ORDER BY created_at DESC, id DESC');
  res.json({ coupons: rows.map(serializeCoupon) });
});

async function readCouponBody(body = {}, ignoreId = null) {
  const code = requireString(body.code, 'Please enter a coupon code.', 50).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) fail(422, 'Coupon codes can use letters, numbers, dashes and underscores.');
  if (await first(`SELECT id FROM coupons WHERE code = ? ${ignoreId ? 'AND id <> ?' : ''}`, ignoreId ? [code, ignoreId] : [code])) {
    fail(422, 'That coupon code is already in use.');
  }
  const type = body.type === 'fixed' ? 'fixed' : body.type === 'percentage' ? 'percentage' : fail(422, 'Please choose percentage or fixed amount.');
  const value = money(number(body.value, 'Please enter the discount value.', { min: 0.01, max: type === 'percentage' ? 100 : 99999 }));
  const startsAt = readDateTime(body.starts_at, 'Start date');
  const expiresAt = readDateTime(body.expires_at, 'Expiry date');
  if (startsAt && expiresAt && expiresAt < startsAt) fail(422, 'The expiry date must be after the start date.');
  const maxUses = number(body.max_uses, 'Max uses must be a whole number of at least 1.', { min: 1, max: 1000000, optional: true });
  if (maxUses !== null && !Number.isInteger(maxUses)) fail(422, 'Max uses must be a whole number of at least 1.');
  return {
    code,
    type,
    value,
    minOrder: number(body.min_order_amount, 'Minimum order must be a positive amount.', { optional: true }),
    maxDiscount: number(body.max_discount, 'Max discount must be a positive amount.', { optional: true }),
    maxUses,
    startsAt,
    expiresAt,
    isActive: body.is_active !== false,
  };
}

adminCatalogRoutes.post('/admin/coupons', async (req, res) => {
  const d = await readCouponBody(req.body);
  const now = nowUtc();
  const r = await query(
    `INSERT INTO coupons (code, type, value, min_order_amount, max_discount, max_uses, used_count, starts_at, expires_at, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [d.code, d.type, d.value, d.minOrder, d.maxDiscount, d.maxUses, d.startsAt, d.expiresAt, bool(d.isActive), now, now],
  );
  res.status(201).json({ id: r.insertId, message: 'Coupon created successfully.' });
});

adminCatalogRoutes.put('/admin/coupons/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await first('SELECT id FROM coupons WHERE id = ?', [id]))) fail(404, 'Coupon not found.');
  const d = await readCouponBody(req.body, id);
  await query(
    `UPDATE coupons SET code = ?, type = ?, value = ?, min_order_amount = ?, max_discount = ?, max_uses = ?,
            starts_at = ?, expires_at = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [d.code, d.type, d.value, d.minOrder, d.maxDiscount, d.maxUses, d.startsAt, d.expiresAt, bool(d.isActive), nowUtc(), id],
  );
  res.json({ id, message: 'Coupon updated successfully.' });
});

adminCatalogRoutes.delete('/admin/coupons/:id', async (req, res) => {
  const r = await query('DELETE FROM coupons WHERE id = ?', [Number(req.params.id)]);
  if (!r.affectedRows) fail(404, 'Coupon not found.');
  // Past orders keep their coupon_code; the FK sets coupon_id to NULL.
  res.json({ message: 'Coupon deleted successfully.' });
});

// ── Shop settings ───────────────────────────────────────────────────────────

const SETTING_KEYS = ['tax_rate', 'curbside_enabled', 'local_delivery_fee', 'standard_shipping_rate', 'local_delivery_zips', 'store_hours'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function currentSettings() {
  const s = await getSettings(SETTING_KEYS);
  return {
    tax_rate: Number(s.tax_rate ?? 8),
    curbside_enabled: Number(s.curbside_enabled ?? '1') === 1,
    local_delivery_fee: Number(s.local_delivery_fee ?? config.shipping.localFee),
    standard_shipping_rate: s.standard_shipping_rate != null && s.standard_shipping_rate !== '' ? Number(s.standard_shipping_rate) : config.shipping.standardRate,
    local_delivery_zips: (s.local_delivery_zips != null ? s.local_delivery_zips.split(/[\s,;]+/).filter(Boolean) : config.shipping.localZips),
    // Sunday first: { day: 0, open: '07:30', close: '21:00', closed: false }
    store_hours: (() => {
      let saved = null;
      try { saved = s.store_hours ? JSON.parse(s.store_hours) : null; } catch {}
      const h = normalizeHours(saved);
      return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, open: h[d]?.[0] ?? '09:00', close: h[d]?.[1] ?? '17:00', closed: h[d] === null }));
    })(),
  };
}

async function setSetting(key, value) {
  const now = nowUtc();
  await query(
    'INSERT INTO settings (`key`, `value`, created_at, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = VALUES(updated_at)',
    [key, String(value), now, now],
  );
}

adminCatalogRoutes.get('/admin/settings', async (_req, res) => {
  res.json({ settings: await currentSettings() });
});

/** Save any of: tax rate, curbside on/off, delivery fees and local ZIPs (port of SettingsController). */
adminCatalogRoutes.put('/admin/settings', async (req, res) => {
  const b = req.body ?? {};
  const changes = [];
  if (b.tax_rate !== undefined) changes.push(['tax_rate', number(b.tax_rate, 'Tax must be between 0 and 100%.', { max: 100 })]);
  if (b.curbside_enabled !== undefined) changes.push(['curbside_enabled', b.curbside_enabled ? '1' : '0']);
  if (b.local_delivery_fee !== undefined) changes.push(['local_delivery_fee', money(number(b.local_delivery_fee, 'Local delivery fee must be between $0 and $999.', { max: 999 }))]);
  if (b.standard_shipping_rate !== undefined) changes.push(['standard_shipping_rate', money(number(b.standard_shipping_rate, 'Standard shipping must be between $0 and $999.', { max: 999 }))]);
  if (b.local_delivery_zips !== undefined) {
    const zips = (Array.isArray(b.local_delivery_zips) ? b.local_delivery_zips.join(',') : String(b.local_delivery_zips)).split(/[\s,;]+/).filter(Boolean);
    const invalid = zips.filter((z) => !/^\d{5}$/.test(z));
    if (invalid.length) fail(422, `These are not valid 5-digit ZIP codes: ${invalid.slice(0, 10).join(', ')}`);
    changes.push(['local_delivery_zips', [...new Set(zips)].join(',')]);
  }
  if (b.store_hours !== undefined) {
    if (!Array.isArray(b.store_hours) || b.store_hours.length !== 7) fail(422, 'Please send opening hours for all 7 days.');
    const hours = {};
    for (const row of b.store_hours) {
      const d = Number(row?.day);
      if (!Number.isInteger(d) || d < 0 || d > 6 || d in hours) fail(422, 'Opening hours have an unknown day.');
      if (row.closed) { hours[d] = null; continue; }
      if (!HHMM.test(String(row.open)) || !HHMM.test(String(row.close))) fail(422, `${DAY_NAMES[d]}: please enter times like 7:30 AM.`);
      if (row.close <= row.open) fail(422, `${DAY_NAMES[d]}: closing time must be after opening time.`);
      hours[d] = [row.open, row.close];
    }
    changes.push(['store_hours', JSON.stringify(hours)]);
  }
  if (!changes.length) fail(422, 'Nothing to save.');
  for (const [key, value] of changes) await setSetting(key, value);
  res.json({ settings: await currentSettings(), message: 'Settings saved.' });
});
