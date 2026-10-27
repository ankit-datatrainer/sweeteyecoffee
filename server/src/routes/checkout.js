import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { fail, requireString, optionalString, isEmail } from '../lib/http.js';
import { baseUrl, imageUrl } from '../lib/catalog.js';
import { quote, serializeQuote, findCoupon, couponProblem, couponDiscount, couponLabel, priceCart } from '../lib/pricing.js';
import { taxRate } from '../lib/store.js';
import { signOrderToken, verifyOrderToken } from '../lib/auth.js';
import { createOrder, completeOrder, discardUnpaid, loadOrder, serializeOrder } from '../lib/orders.js';
import { chargeOrder, squareConfigured } from '../lib/square.js';
import { STRIPE_METHODS, createCheckoutSession, enabledStripeMethods, expireSession, retrieveSession, sessionPaysOrder, stripeConfigured, verifyWebhook } from '../lib/stripe.js';
import { query, nowUtc } from '../db.js';

export const checkoutRoutes = Router();

const lineImage = (base) => (l) => imageUrl(base, l.image_path) ?? imageUrl(base, l.product.image);

/** Live totals for the cart / checkout screens (prices always come from the database). */
checkoutRoutes.post('/checkout/quote', async (req, res) => {
  const body = req.body ?? {};
  const q = await quote({
    items: body.items,
    coupon_code: body.coupon_code,
    pickup_method: body.pickup_method,
    address: body.address,
    shipping_option: body.shipping_option,
  });
  res.json(serializeQuote(q, baseUrl(req), lineImage(baseUrl(req))));
});

checkoutRoutes.post('/coupon/apply', async (req, res) => {
  const code = requireString(req.body?.coupon_code, 'Please enter a coupon code.', 50);
  const coupon = await findCoupon(code);
  if (!coupon) fail(422, 'Invalid coupon code.');
  const lines = await priceCart(req.body?.items);
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const problem = couponProblem(coupon, subtotal);
  if (problem) fail(422, problem);
  const discount = couponDiscount(coupon, subtotal);
  const tax = Math.round((subtotal - discount) * (await taxRate()) * 100) / 100;
  res.json({
    message: 'Coupon applied!',
    coupon: { code: coupon.code, label: couponLabel(coupon) },
    discount,
    tax,
    total: Math.round((subtotal - discount + tax) * 100) / 100,
  });
});

/**
 * Place an order (port of CheckoutController::createOrderFromCart). Returns the
 * order and, for guests, a token that lets this device open and pay for it.
 */
checkoutRoutes.post('/checkout', async (req, res) => {
  const body = req.body ?? {};
  const user = req.user;
  const pickupMethod = body.pickup_method ?? 'in_store';
  if (!['in_store', 'curbside', 'delivery'].includes(pickupMethod)) fail(422, 'Please choose In-Store, Curbside or Delivery.');
  const isDelivery = pickupMethod === 'delivery';

  const guest = { name: null, email: null };
  if (!user) {
    guest.name = requireString(body.name, 'Please enter your full name so we can prepare your order.');
    guest.email = optionalString(body.email);
    if (guest.email && !isEmail(guest.email)) fail(422, 'Please enter a valid email address.');
  }

  const phone = optionalString(body.phone, 30);
  if ((!user || isDelivery) && !phone) fail(422, 'Please enter your phone number so we can reach you about your order.');

  const vehicleDetails = pickupMethod === 'curbside'
    ? requireString(body.vehicle_details, 'Please describe your vehicle so we can find you at the curb.', 150)
    : null;
  if (isDelivery && !body.shipping_option) fail(422, 'Please choose a delivery option.');

  const q = await quote({
    items: body.items,
    coupon_code: body.coupon_code,
    pickup_method: pickupMethod,
    address: body.address,
    shipping_option: body.shipping_option,
    strict: true,
  });
  if (pickupMethod === 'curbside' && !q.curbsideEnabled) fail(422, 'Curbside pickup is currently unavailable. Please choose In-Store Pickup.');
  if (body.coupon_code && !q.coupon) fail(422, q.couponMessage ?? 'This coupon is not valid.');

  const orderId = await createOrder({
    quote: q,
    user,
    guest,
    pickupMethod,
    vehicleDetails,
    phone,
    notes: optionalString(body.notes, 1000),
  });

  // Nothing to pay (fully discounted): confirm right away.
  if (q.total <= 0) await completeOrder(orderId, 'FREE_ORDER');

  const order = await loadOrder(orderId, { includeUnpaid: true });
  res.status(201).json({
    order: serializeOrder(order, baseUrl(req)),
    order_token: signOrderToken(orderId),
    payment_required: q.total > 0,
    payments_mode: config.paymentsMode,
  });
});

/** Who may pay for / cancel an order: its owner, or the device holding its order token. */
async function payableOrder(req) {
  const order = await loadOrder(Number(req.params.id), { includeUnpaid: true });
  if (!order) fail(404, 'We could not find that order.');
  const owner = order.user_id !== null && req.user?.id === order.user_id;
  if (!owner && !verifyOrderToken(req.get('x-order-token') ?? req.body?.order_token, order.id)) {
    fail(403, 'You cannot access this order.');
  }
  return order;
}

checkoutRoutes.post('/orders/:id/pay', async (req, res) => {
  const order = await payableOrder(req);
  const base = baseUrl(req);

  if (!order.awaiting_payment) {
    if (order.payment?.status === 'completed') return res.json({ order: serializeOrder(order, base) });
    fail(422, 'This order is not waiting for payment.');
  }

  if (config.paymentsMode === 'test') {
    await completeOrder(order.id, `TEST-${crypto.randomBytes(6).toString('hex').toUpperCase()}`);
  } else {
    const sourceId = requireString(req.body?.source_id, 'Payment information is missing. Please re-enter your card details.', 512);
    if (!/^cnon:[\w-]+$/.test(sourceId)) fail(422, 'Payment information is invalid. Please re-enter your card details.');
    // Claim the payment first, so two quick taps can never charge the card twice.
    const claim = await query("UPDATE payments SET status = 'processing', updated_at = ? WHERE order_id = ? AND status = 'pending'", [nowUtc(), order.id]);
    if (!claim.affectedRows) fail(409, 'This order is already being paid. Please wait a moment.');
    const result = await chargeOrder(order, order.items, sourceId, Math.round((await taxRate()) * 10000) / 100);
    if (!result.success) {
      await query("UPDATE payments SET status = 'pending', updated_at = ? WHERE order_id = ? AND status = 'processing'", [nowUtc(), order.id]);
      fail(402, `Payment failed: ${result.errors.join(' ')} Please check your card and try again.`);
    }
    await completeOrder(order.id, result.payment_id, result.square_order_id);
  }

  res.json({ order: serializeOrder(await loadOrder(order.id), base) });
});

/** The customer backed out before paying — remove the unpaid order. */
/** An unpaid order's open Stripe page must close with it, so nobody can pay for an order that's gone. */
async function discardWithStripe(order) {
  const sessionId = order.payment?.method === 'stripe' ? order.payment.transaction_id : null;
  if (sessionId) {
    const session = await retrieveSession(sessionId);
    // Paid a moment before cancelling: keep the order, it's paid.
    if (session && (await finishStripe(order, session))) return;
    if (session?.status === 'open') await expireSession(sessionId);
  }
  await discardUnpaid(order.id);
}

checkoutRoutes.post('/orders/:id/cancel-unpaid', async (req, res) => {
  const order = await payableOrder(req);
  if (order.awaiting_payment) await discardWithStripe(order);
  res.json({ ok: true });
});

// ── Stripe: Apple Pay, Google Pay, Cash App Pay and cards on Stripe's page ───

/**
 * Only send customers back into the installed app or our own website. Locally,
 * Expo Go (exp://) and LAN / localhost web builds are allowed too.
 */
function safeReturnUrl(value) {
  const url = String(value ?? '');
  if (url.length > 500) return null;
  if (/^sweeteye:\/\//i.test(url)) return url;
  if (config.publicUrl && url.startsWith(`${config.publicUrl}/`)) return url;
  if (config.isProduction) return null;
  if (/^(exp|exps):\/\//i.test(url)) return url;
  const m = url.match(/^https?:\/\/([^/:?#]+)/i);
  if (m && /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(m[1])) return url;
  return null;
}

const withParam = (url, key, value) => `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;

/** Confirm a paid Stripe session and finish the order (also records it in Square POS, like the website). */
async function finishStripe(order, session) {
  if (!sessionPaysOrder(session, order)) return false;
  const paymentId = String(session.payment_intent ?? session.id);
  if (order.awaiting_payment) {
    let squareOrderId = null;
    if (squareConfigured()) {
      const recorded = await chargeOrder(order, order.items, paymentId, Math.round((await taxRate()) * 10000) / 100, 'Stripe');
      if (recorded.success) squareOrderId = recorded.square_order_id;
      else console.warn(`Stripe order ${order.order_number} paid but not added to Square:`, recorded.errors);
    }
    await completeOrder(order.id, paymentId, squareOrderId);
  }
  return true;
}

checkoutRoutes.post('/orders/:id/stripe', async (req, res) => {
  if (!stripeConfigured()) fail(422, 'Apple Pay / Google Pay is not available right now. Please pay by card instead.');
  const order = await payableOrder(req);
  if (!order.awaiting_payment) fail(422, 'This order is not waiting for payment.');
  const back = safeReturnUrl(req.body?.return_url);
  if (!back) fail(422, 'Missing return address for the payment page.');
  const method = req.body?.method ? String(req.body.method) : null;
  if (method && !(STRIPE_METHODS[method] && (await enabledStripeMethods()).includes(method))) {
    fail(422, 'That payment option is not available right now. Please choose another way to pay.');
  }

  const api = `${baseUrl(req)}/api/stripe`;
  const token = signOrderToken(order.id);
  const success = `${api}/return?order=${order.id}&session_id={CHECKOUT_SESSION_ID}&back=${encodeURIComponent(back)}`;
  const cancel = `${api}/cancel?order=${order.id}&back=${encodeURIComponent(back)}&t=${encodeURIComponent(token)}`;
  if (order.payment?.status !== 'pending') fail(409, 'This order is already being paid. Please wait a moment.');
  const session = await createCheckoutSession(order, success, cancel, method);
  if (!session.ok) fail(422, session.message);

  const detail = `${STRIPE_METHODS[method]?.label ?? 'Apple Pay / Google Pay / Card'} (Stripe)`;
  await query("UPDATE payments SET method = 'stripe', detail = ?, transaction_id = ?, updated_at = ? WHERE order_id = ? AND status = 'pending'", [detail, session.id, nowUtc(), order.id]);
  res.json({ url: session.url, session_id: session.id });
});

/** Stripe sends the customer here after paying; finish the order, then hop back into the app. */
checkoutRoutes.get('/stripe/return', async (req, res) => {
  const back = safeReturnUrl(req.query.back);
  const order = await loadOrder(Number(req.query.order), { includeUnpaid: true });
  const session = order ? await retrieveSession(req.query.session_id) : null;
  const paid = order && session ? await finishStripe(order, session) : false;
  const status = paid ? 'paid' : session?.status === 'complete' ? 'processing' : 'failed';
  if (back) return res.redirect(303, withParam(back, 'stripe', status));
  res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;background:#0E0806;color:#F5EDE3;text-align:center;padding:40px">
    <h2>${paid ? 'Payment received — thank you!' : 'Payment not completed'}</h2><p>You can return to the Sweet Eye app now.</p></body>`);
});

/** "Back" on Stripe's page: drop the unpaid order and return to checkout. */
checkoutRoutes.get('/stripe/cancel', async (req, res) => {
  const order = await loadOrder(Number(req.query.order), { includeUnpaid: true });
  if (order?.awaiting_payment && verifyOrderToken(req.query.t, order.id)) await discardWithStripe(order);
  const back = safeReturnUrl(req.query.back);
  if (back) return res.redirect(303, withParam(back, 'stripe', 'cancelled'));
  res.type('html').send('<p>Payment cancelled. You can return to the Sweet Eye app.</p>');
});

/** The app asks after the Stripe page closes (covers a customer who closed it right after paying). */
checkoutRoutes.post('/orders/:id/stripe/check', async (req, res) => {
  const order = await payableOrder(req);
  if (!order.awaiting_payment) return res.json({ status: order.payment?.status === 'completed' ? 'paid' : 'unknown' });
  const session = order.payment?.transaction_id ? await retrieveSession(order.payment.transaction_id) : null;
  if (await finishStripe(order, session)) return res.json({ status: 'paid' });
  if (session && session.status === 'open') await expireSession(session.id);
  res.json({ status: session?.status === 'complete' ? 'processing' : 'unpaid' });
});

/** Stripe webhook (works once the API is reachable from the internet). */
export async function stripeWebhook(req, res) {
  const event = verifyWebhook(req.body?.toString('utf8') ?? '', req.get('stripe-signature'));
  if (!event) return res.status(400).json({ message: 'Invalid signature.' });
  const session = event.data?.object;
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && session?.metadata?.order_id) {
    const order = await loadOrder(Number(session.metadata.order_id), { includeUnpaid: true });
    if (order) await finishStripe(order, session);
  }
  if (event.type === 'checkout.session.expired' && session?.metadata?.order_id) await discardUnpaid(Number(session.metadata.order_id));
  res.json({ received: true });
}
