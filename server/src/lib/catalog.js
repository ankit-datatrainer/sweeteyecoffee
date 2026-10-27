import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { query, first } from '../db.js';
import { fail, money } from './http.js';
import { isInSeason, seasonLabel } from './store.js';

export const BEANS_CATEGORY_SLUG = 'coffee-beans';

// ── Images ──────────────────────────────────────────────────────────────────

const mtimes = new Map();

/**
 * Public URL for a photo in public/images (cache-busted), or null when the file is missing.
 * `w` asks for a resized WebP (see lib/images.js); phones get 1080px unless they ask for less.
 */
export function imageUrl(base, relPath, w = 1080) {
  if (!relPath) return null;
  const clean = String(relPath).replace(/^images\//, '');
  let mtime = mtimes.get(clean);
  if (mtime === undefined) {
    try {
      mtime = Math.floor(fs.statSync(path.join(config.imagesDir, clean)).mtimeMs / 1000);
    } catch {
      mtime = null;
    }
    mtimes.set(clean, mtime);
  }
  if (mtime === null) return null;
  const url = `${base}/images/${clean.split('/').map(encodeURIComponent).join('/')}?v=${mtime}`;
  return w && !clean.endsWith('.svg') ? `${url}&w=${w}` : url;
}

/** Drop a cached file time after a photo is replaced, so its URL busts caches. */
export const forgetImage = (relPath) => relPath && mtimes.delete(String(relPath).replace(/^images\//, ''));

export const baseUrl = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

// ── Loading ─────────────────────────────────────────────────────────────────

/** Active categories that are in season today (empty seasonal menus hidden), with product counts. */
export async function visibleCategories() {
  const rows = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_available = 1) AS product_count
       FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.id`,
  );
  return rows
    .filter((c) => isInSeason(c))
    .filter((c) => !(c.season_start && c.season_end && c.product_count === 0));
}

async function loadProducts(where, params) {
  const products = await query(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.season_start, c.season_end
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE ${where}
      ORDER BY c.sort_order, p.sort_order, p.id`,
    params,
  );
  if (!products.length) return [];

  const ids = products.map((p) => p.id);
  const [variants, groupLinks] = await Promise.all([
    query('SELECT * FROM product_variants WHERE product_id IN (?) ORDER BY sort_order, id', [ids]),
    query(
      `SELECT mgp.product_id, g.* FROM modifier_group_product mgp
         JOIN modifier_groups g ON g.id = mgp.modifier_group_id
        WHERE mgp.product_id IN (?) ORDER BY g.sort_order, g.id`,
      [ids],
    ),
  ]);
  const groupIds = [...new Set(groupLinks.map((g) => g.id))];
  const modifiers = groupIds.length
    ? await query('SELECT * FROM modifiers WHERE modifier_group_id IN (?) AND is_active = 1 ORDER BY sort_order, id', [groupIds])
    : [];

  return products.map((p) => ({
    ...p,
    variants: variants.filter((v) => v.product_id === p.id),
    groups: groupLinks
      .filter((g) => g.product_id === p.id)
      .map((g) => ({ ...g, modifiers: modifiers.filter((m) => m.modifier_group_id === g.id) })),
  }));
}

export async function visibleProducts() {
  const categories = await visibleCategories();
  if (!categories.length) return { categories, products: [] };
  const products = await loadProducts('p.is_available = 1 AND p.category_id IN (?)', [categories.map((c) => c.id)]);
  return { categories, products };
}

export async function productById(id) {
  const [product] = await loadProducts('p.id = ?', [id]);
  return product ?? null;
}

// ── Shaping for the app ─────────────────────────────────────────────────────

export function isOrderable(product) {
  return Boolean(product.is_available) && !product.is_sold_out && isInSeason(product);
}

export function serializeCategory(c, base) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    image: imageUrl(base, c.image),
    product_count: c.product_count ?? 0,
    seasonal: Boolean(c.season_start && c.season_end),
    season_label: seasonLabel(c),
  };
}

export function serializeProduct(p, base) {
  const sizes = p.variants.filter((v) => v.is_available);
  const startingPrice = p.variants.length && sizes.length ? Math.min(...sizes.map((v) => v.price)) : p.price;
  return {
    id: p.id,
    category_id: p.category_id,
    category_slug: p.category_slug,
    category_name: p.category_name,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: p.price,
    starting_price: startingPrice,
    image: imageUrl(base, p.image),
    iced_image: imageUrl(base, p.iced_image),
    is_featured: Boolean(p.is_featured),
    is_sold_out: Boolean(p.is_sold_out),
    orderable: isOrderable(p),
    is_beans: p.category_slug === BEANS_CATEGORY_SLUG,
    sizes: sizes.map((v) => ({ name: v.size_name, price: v.price, image: imageUrl(base, v.image) })),
    groups: p.groups
      .filter((g) => g.modifiers.length > 0)
      .map((g) => ({
        id: g.id,
        slug: g.slug,
        name: g.name,
        selection: g.selection,
        required: Boolean(g.is_required),
        options: g.modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price, large_price: m.large_price })),
      })),
  };
}

// ── Pricing one cart line (port of CartController::add) ─────────────────────

const modifierPrice = (m, sizeName) =>
  m.large_price !== null && String(sizeName ?? '').trim().toLowerCase() === 'large' ? m.large_price : m.price;

/** "Iced, Oat Milk (+$0.50), Extra Shot (+$1.00)" — same as OrderItem::formatModifiers. */
export function formatModifiers(modifiers) {
  return (modifiers || [])
    .map((m) => m.name + (Number(m.price) > 0 && !m.hidden_price ? ` (+$${Number(m.price).toFixed(2)})` : ''))
    .join(', ');
}

/**
 * Validate a cart line against the database and price it. Never trusts a price
 * from the app. Throws a 422 with a customer-friendly message when invalid.
 */
export async function priceLine(input, preloaded = null) {
  const productId = Number(input?.product_id);
  if (!Number.isInteger(productId) || productId <= 0) fail(422, 'Please choose an item.');

  const quantity = input.quantity === undefined ? 1 : Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) fail(422, 'Quantity must be between 1 and 50.');

  const product = preloaded ?? (await productById(productId));
  if (!product) fail(422, 'That item is no longer on the menu.');
  if (!product.is_available || !isInSeason(product)) fail(422, `${product.name} is not on the menu right now.`);
  if (product.is_sold_out) fail(422, `Sorry, ${product.name} is currently unavailable.`);

  const sizeName = input.size_name ? String(input.size_name) : null;
  let price = product.price;
  let variantImage = null;
  const availableSizes = product.variants.filter((v) => v.is_available);

  if (sizeName) {
    const variant = availableSizes.find((v) => v.size_name === sizeName);
    if (!variant) fail(422, `That size is not available for ${product.name}.`);
    price = variant.price;
    variantImage = variant.image;
  } else if (availableSizes.length) {
    fail(422, `Please choose a size for ${product.name}.`);
  }

  const rawIds = Array.isArray(input.modifiers) ? input.modifiers : [];
  if (rawIds.length > 20) fail(422, 'Too many options selected.');
  const modifierIds = [...new Set(rawIds.map(Number))];
  const groups = new Map(product.groups.map((g) => [g.id, g]));
  const options = new Map(product.groups.flatMap((g) => g.modifiers.map((m) => [m.id, m])));

  if (modifierIds.some((id) => !options.has(id))) {
    fail(422, `One of the options you picked is not available for ${product.name}.`);
  }
  const chosen = modifierIds.map((id) => options.get(id));

  for (const group of groups.values()) {
    const count = chosen.filter((m) => m.modifier_group_id === group.id).length;
    if (group.selection === 'single' && count > 1) fail(422, `Please pick just one ${group.name.toLowerCase()} option.`);
    if (group.is_required && group.modifiers.length && count === 0) fail(422, `Please choose: ${group.name}.`);
  }

  const modifiers = chosen
    .sort((a, b) => {
      const ga = groups.get(a.modifier_group_id).sort_order;
      const gb = groups.get(b.modifier_group_id).sort_order;
      return ga - gb || a.sort_order - b.sort_order || a.id - b.id;
    })
    .map((m) => ({
      id: m.id,
      group: groups.get(m.modifier_group_id).name,
      name: m.name,
      price: modifierPrice(m, sizeName),
      // Size-based extras (Iced on a Large) are charged but not shown as "+$".
      hidden_price: m.large_price !== null,
    }));

  const unitPrice = money(price + modifiers.reduce((sum, m) => sum + m.price, 0));
  const key = `${product.id}${sizeName ? `:${sizeName}` : ''}${modifiers.length ? `|${modifiers.map((m) => m.id).join('-')}` : ''}`;

  // Photo for this line: the chosen colour/design, else the iced shot for an iced drink, else the product.
  const iced = modifiers.some((m) => m.group === 'Hot or Iced' && m.name.toLowerCase() === 'iced');
  const imagePath = variantImage ?? (iced && product.iced_image ? product.iced_image : product.image);

  return {
    key,
    product,
    image_path: imagePath,
    product_id: product.id,
    name: product.name,
    size_name: sizeName,
    modifiers,
    modifiers_label: formatModifiers(modifiers),
    unit_price: unitPrice,
    quantity,
    variant_image: variantImage,
  };
}

export async function productExists(id) {
  return Boolean(await first('SELECT id FROM products WHERE id = ?', [id]));
}
