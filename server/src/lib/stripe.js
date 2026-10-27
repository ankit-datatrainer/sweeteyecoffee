import crypto from 'node:crypto';
import { config } from '../config.js';
import { getSetting } from './store.js';

/** Stripe hosted checkout (cards, Apple Pay, Google Pay, Cash App Pay) — a port of the website's StripeService. */
const API = 'https://api.stripe.com/v1';
export const stripeConfigured = () => /^(sk|rk)_(live|test)_/.test(config.stripe.secret);

/** Stripe wants form-encoded bodies with bracketed keys: line_items[0][price_data][currency]=usd */
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') form(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

async function stripe(method, path, body, idempotencyKey) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripe.secret}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? form(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/**
 * The payment methods a customer can pick in the app. Stripe no longer lets a
 * page list its methods, so the page uses the website's payment-method setup
 * and leaves out the others: Cash App Pay and Amazon Pay open on their own;
 * Apple Pay / Google Pay are wallet buttons on Stripe's card page.
 */
const SWITCHABLE = ['card', 'cashapp', 'amazon_pay'];
export const STRIPE_METHODS = {
  apple_pay: { label: 'Apple Pay', keep: 'card' },
  google_pay: { label: 'Google Pay', keep: 'card' },
  cashapp: { label: 'Cash App Pay', keep: 'cashapp' },
  amazon_pay: { label: 'Amazon Pay', keep: 'amazon_pay' },
};

let methodsCache = null;
/** Which of those are switched on in the website's Stripe payment-method setup (checked every 10 minutes). */
export async function enabledStripeMethods() {
  if (!stripeConfigured()) return [];
  if (methodsCache && methodsCache.expires > Date.now()) return methodsCache.methods;
  let methods = Object.keys(STRIPE_METHODS);
  try {
    const pmc = await getSetting('payment_stripe_pmc');
    const r = pmc ? await stripe('GET', `/payment_method_configurations/${encodeURIComponent(pmc)}`) : null;
    if (r?.ok) methods = methods.filter((m) => r.json[m]?.available);
  } catch {
    // Stripe unreachable: offer them all; creating the page will say if one is off.
  }
  methodsCache = { methods, expires: Date.now() + 10 * 60 * 1000 };
  return methods;
}

/**
 * Create the Stripe payment page for an order: one line for the whole order
 * (items, discount, tax and delivery already added up), expiring after an hour.
 * `method` (a STRIPE_METHODS key) limits the page to what the customer chose.
 */
export async function createCheckoutSession(order, successUrl, cancelUrl, method = null) {
  const summary = order.items.map((i) => `${i.quantity}× ${i.product_name ?? 'Item'}${i.size_name ? ` (${i.size_name})` : ''}`).join(', ');
  const meta = { order_id: String(order.id), order_number: order.order_number, source: 'app' };
  const params = {
    mode: 'payment',
    client_reference_id: String(order.id),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(Number(order.total_amount) * 100),
        product_data: { name: `Sweet Eye Coffee — Order ${order.order_number}`, description: summary.slice(0, 450) || 'Sweet Eye Coffee order' },
      },
    }],
    metadata: meta,
    payment_intent_data: { metadata: meta, description: `Sweet Eye Coffee order ${order.order_number}` },
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  };

  // Same payment-method setup the website uses (Stripe Dashboard config), falling back to card + Cash App.
  const chosen = STRIPE_METHODS[method];
  const pmc = await getSetting('payment_stripe_pmc');
  const only = chosen ? { excluded_payment_method_types: SWITCHABLE.filter((t) => t !== chosen.keep) } : {};
  // The website's setup first; Stripe's account default if that one is ever removed.
  const attempts = [...(pmc ? [{ payment_method_configuration: pmc, ...only }] : []), { ...only }];
  const key = crypto.createHash('sha256').update(`sweet-eye-app|${order.id}|${order.order_number}|${successUrl}|${method ?? 'any'}`).digest('hex').slice(0, 40);

  for (const [i, methods] of attempts.entries()) {
    const r = await stripe('POST', '/checkout/sessions', { ...params, ...methods }, `cs-${i}-${key}`);
    if (r.ok && r.json.url) return { ok: true, id: r.json.id, url: r.json.url };
    console.error('Stripe: could not create checkout', r.status, r.json?.error?.message);
    if (r.status === 401 || r.status === 403) break; // the key itself is refused
    // Only a payment-method problem is worth retrying with a simpler list.
    if (!`${r.json?.error?.param ?? ''} ${r.json?.error?.message ?? ''}`.includes('payment_method')) break;
  }
  return { ok: false, message: `${chosen?.label ?? 'Apple Pay / Google Pay'} is not available right now. Please choose another way to pay.` };
}

export async function retrieveSession(sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId))) return null;
  const r = await stripe('GET', `/checkout/sessions/${sessionId}`);
  return r.ok ? r.json : null;
}

export async function expireSession(sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId))) return;
  await stripe('POST', `/checkout/sessions/${sessionId}/expire`, {});
}

/** Paid, for this order, for exactly the order total. */
export const sessionPaysOrder = (session, order) =>
  !!session &&
  session.payment_status === 'paid' &&
  String(session.metadata?.order_id ?? '') === String(order.id) &&
  Number(session.amount_total) === Math.round(Number(order.total_amount) * 100);

/** Verify a Stripe webhook signature (Stripe-Signature: t=…,v1=…). Returns the event or null. */
export function verifyWebhook(rawBody, header, tolerance = 300) {
  if (!config.stripe.webhookSecret || !header) return null;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')));
  const signatures = header.split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > tolerance) return null;
  const expected = crypto.createHmac('sha256', config.stripe.webhookSecret).update(`${t}.${rawBody}`).digest('hex');
  const ok = signatures.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  return ok ? JSON.parse(rawBody) : null;
}
