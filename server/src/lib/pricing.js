import { config } from '../config.js';
import { first } from '../db.js';
import { fail, money } from './http.js';
import { getSettings, taxRate, curbsideEnabled } from './store.js';
import { priceLine, productById, BEANS_CATEGORY_SLUG } from './catalog.js';
import { packageWeights, upsRates } from './ups.js';

// ── Coupons (port of App\Models\Coupon) ─────────────────────────────────────

const utc = (value) => (value ? new Date(`${String(value).replace(' ', 'T')}Z`) : null);

export function couponProblem(coupon, subtotal) {
  const now = new Date();
  if (!coupon.is_active) return 'This coupon is not valid.';
  if (coupon.starts_at && utc(coupon.starts_at) > now) return 'This coupon is not valid yet.';
  if (coupon.expires_at && utc(coupon.expires_at) < now) return 'This coupon has expired.';
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return 'This coupon has reached its usage limit.';
  if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
    return `Minimum order of $${Number(coupon.min_order_amount).toFixed(2)} required.`;
  }
  return null;
}

export function couponDiscount(coupon, subtotal) {
  let discount = 0;
  if (coupon.type === 'percentage') {
    discount = subtotal * (coupon.value / 100);
    if (coupon.max_discount && discount > coupon.max_discount) discount = coupon.max_discount;
  } else if (coupon.type === 'fixed') {
    discount = Math.min(coupon.value, subtotal);
  }
  return money(discount);
}

export const couponLabel = (coupon) =>
  coupon.type === 'percentage' ? `${Math.round(coupon.value)}% off` : `$${Number(coupon.value).toFixed(2)} off`;

export async function findCoupon(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  return first('SELECT * FROM coupons WHERE code = ?', [clean]);
}

// ── Delivery for coffee beans (port of App\Services\ShippingService) ────────

export async function shippingSettings() {
  const s = await getSettings(['local_delivery_fee', 'local_delivery_zips', 'standard_shipping_rate']);
  const zips = s.local_delivery_zips != null
    ? s.local_delivery_zips.split(/[\s,;]+/).filter(Boolean)
    : config.shipping.localZips;
  return {
    localFee: s.local_delivery_fee != null ? Number(s.local_delivery_fee) : config.shipping.localFee,
    standardRate: s.standard_shipping_rate != null && s.standard_shipping_rate !== ''
      ? Number(s.standard_shipping_rate)
      : config.shipping.standardRate,
    localZips: [...new Set(zips.map((z) => z.trim().slice(0, 5)))],
  };
}

/** Delivery is only offered when every item is coffee beans. */
export const linesAreDeliverable = (lines) =>
  lines.length > 0 && lines.every((l) => l.product.category_slug === BEANS_CATEGORY_SLUG);

const upsQuoteCache = new Map();

/** UPS quotes for an address + bag, reused for 30 minutes so the price shown is the price charged. */
async function cachedUpsRates(address, lines) {
  const weights = packageWeights(lines);
  const key = JSON.stringify([address.line1, address.line2, address.city, address.state, address.zip, weights].map((v) => String(v ?? '').toLowerCase()));
  const hit = upsQuoteCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.rates;
  const rates = await upsRates(address, weights);
  if (rates.length) {
    if (upsQuoteCache.size >= 500) upsQuoteCache.delete(upsQuoteCache.keys().next().value); // oldest first
    upsQuoteCache.set(key, { rates, expires: Date.now() + 30 * 60 * 1000 });
  }
  return rates;
}

export async function deliveryOptions(address, lines) {
  if (!linesAreDeliverable(lines)) return { ok: false, message: 'Delivery is available for coffee bean orders only.' };
  const s = await shippingSettings();
  if (s.localZips.includes(String(address.zip).trim().slice(0, 5))) {
    return { ok: true, method: 'local_delivery', options: [{ code: 'local', name: 'Local Delivery', price: money(s.localFee), days: null }] };
  }
  // Flat Standard Shipping, plus faster UPS services at live account rates (as on the website).
  const options = [{ code: 'standard', name: 'Standard Shipping', price: money(s.standardRate), days: null }, ...(await cachedUpsRates(address, lines))];
  return { ok: true, method: 'ups', options };
}

export function normalizeAddress(a = {}) {
  const line1 = String(a.line1 ?? a.address_line1 ?? '').trim();
  const line2 = String(a.line2 ?? a.address_line2 ?? '').trim() || null;
  const city = String(a.city ?? '').trim();
  const state = String(a.state ?? '').trim().toUpperCase();
  const zipRaw = String(a.zip ?? '').trim();

  if (!line1) fail(422, 'Please enter your street address.');
  if (line1.length > 120 || (line2 && line2.length > 120)) fail(422, 'Street address is too long.');
  if (!city) fail(422, 'Please enter your city.');
  if (!/^[A-Z]{2}$/.test(state)) fail(422, 'Please choose your state.');
  if (!/^\d{5}(-\d{4})?$/.test(zipRaw)) fail(422, 'Please enter a valid 5-digit ZIP code.');

  return { line1, line2, city, state, zip: zipRaw.slice(0, 5) };
}

export const formatAddress = (a) => `${[a.line1, a.line2, a.city].filter(Boolean).join(', ')}, ${a.state} ${a.zip}`;

// ── Whole-cart quote ────────────────────────────────────────────────────────

/** Re-price every line on the server and merge identical lines. */
export async function priceCart(items) {
  if (!Array.isArray(items) || items.length === 0) fail(422, 'Your cart is empty!');
  if (items.length > 60) fail(422, 'Too many items in one order.');

  const cache = new Map();
  const merged = new Map();
  for (const item of items) {
    const id = Number(item?.product_id);
    if (!cache.has(id)) cache.set(id, await productById(id));
    const line = await priceLine(item, cache.get(id) ?? undefined);
    const existing = merged.get(line.key);
    if (existing) {
      existing.quantity += line.quantity;
      if (existing.quantity > 50) fail(422, 'Quantity must be between 1 and 50.');
    } else {
      merged.set(line.key, line);
    }
  }
  return [...merged.values()].map((l) => ({ ...l, total: money(l.unit_price * l.quantity) }));
}

/**
 * Everything the checkout screen shows, computed exactly like the website:
 * tax on (subtotal − discount), delivery fee untaxed.
 */
export async function quote({ items, coupon_code, pickup_method, address, shipping_option, strict = false }) {
  const lines = await priceCart(items);
  const subtotal = money(lines.reduce((sum, l) => sum + l.total, 0));

  let coupon = null;
  let discount = 0;
  let couponMessage = null;
  if (coupon_code) {
    const found = await findCoupon(coupon_code);
    const problem = found ? couponProblem(found, subtotal) : 'Invalid coupon code.';
    if (problem) {
      couponMessage = problem;
    } else {
      coupon = found;
      discount = couponDiscount(found, subtotal);
    }
  }

  const rate = await taxRate();
  const tax = money((subtotal - discount) * rate);
  const canDeliver = linesAreDeliverable(lines) && subtotal - discount + tax > 0;

  let delivery = null;
  let deliveryQuote = null;
  if (pickup_method === 'delivery') {
    if (!canDeliver) fail(422, 'Delivery is available for coffee bean orders only.');
    const normalized = normalizeAddress(address);
    deliveryQuote = await deliveryOptions(normalized, lines);
    if (!deliveryQuote.ok) fail(422, deliveryQuote.message);
    // Live quotes fall back to the first option (e.g. the ZIP changed); placing an order must match exactly.
    const option = deliveryQuote.options.find((o) => o.code === shipping_option) ?? (strict ? null : deliveryQuote.options[0]);
    if (!option) fail(422, 'Delivery prices changed — please choose your delivery option again.');
    delivery = { address: normalized, method: deliveryQuote.method, service: option.name, code: option.code, fee: money(option.price) };
  }

  const deliveryFee = delivery ? delivery.fee : 0;
  const total = money(subtotal - discount + tax + deliveryFee);

  return {
    lines,
    subtotal,
    discount,
    coupon,
    couponMessage,
    taxRate: rate,
    tax,
    deliveryFee,
    total,
    canDeliver,
    delivery,
    deliveryOptions: deliveryQuote?.options ?? null,
    curbsideEnabled: await curbsideEnabled(),
  };
}

export function serializeQuote(q, base, imageFor) {
  return {
    items: q.lines.map((l) => ({
      key: l.key,
      product_id: l.product_id,
      name: l.name,
      image: imageFor(l),
      size_name: l.size_name,
      modifiers: l.modifiers.map((m) => m.id),
      modifiers_label: l.modifiers_label,
      unit_price: l.unit_price,
      quantity: l.quantity,
      total: l.total,
      is_beans: l.product.category_slug === BEANS_CATEGORY_SLUG,
    })),
    subtotal: q.subtotal,
    discount: q.discount,
    coupon: q.coupon ? { code: q.coupon.code, label: couponLabel(q.coupon) } : null,
    coupon_message: q.couponMessage,
    tax_rate: q.taxRate,
    tax: q.tax,
    delivery_fee: q.deliveryFee,
    total: q.total,
    can_deliver: q.canDeliver,
    curbside_enabled: q.curbsideEnabled,
    delivery: q.delivery ? { method: q.delivery.method, service: q.delivery.service, code: q.delivery.code, fee: q.delivery.fee } : null,
    delivery_options: q.deliveryOptions,
  };
}
