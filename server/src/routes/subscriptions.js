import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { query } from '../db.js';
import { requireAdmin, requireUser } from '../lib/auth.js';
import { baseUrl } from '../lib/catalog.js';
import { fail } from '../lib/http.js';
import { jsonValue } from '../lib/pages.js';
import { verifyWebhook } from '../lib/stripe.js';
import {
  manageSubscription,
  processSubscriptionEvent,
  serializeSubscription,
  startSubscription,
  subscriptionByPublicId,
  subscriptionCatalog,
  subscriptionQuote,
} from '../lib/subscriptions.js';
import { safeReturnUrl, stripeWebhook } from './checkout.js';

export const subscriptionRoutes = Router();
const limitOptions = {
  windowMs: 60000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ message: 'Please wait a moment before trying again.' }),
};
const billingLimit = rateLimit({ ...limitOptions, limit: 15 });
const quoteLimit = rateLimit({ ...limitOptions, limit: 30 });
subscriptionRoutes.get('/subscriptions/catalog', async (req, res) => res.json(await subscriptionCatalog(baseUrl(req))));
subscriptionRoutes.get('/subscriptions/return', (req, res) => {
  const back = safeReturnUrl(req.query.back);
  if (back) return res.redirect(303, back);
  res
    .type('html')
    .send('<p>Return to the Sweet Eye app to check your subscription. Payments are confirmed securely by Stripe.</p>');
});
subscriptionRoutes.post('/subscriptions/quote', quoteLimit, async (req, res) => {
  if (!config.subscriptions.enabled) fail(404, 'Subscriptions are unavailable.');
  res.json(await subscriptionQuote(req.body));
});
subscriptionRoutes.get('/subscriptions', requireUser, async (req, res) => {
  const rows = await query('SELECT * FROM coffee_subscriptions WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  res.json({ subscriptions: rows.map((s) => serializeSubscription({ ...s, selection: jsonValue(s.selection) })) });
});
subscriptionRoutes.post('/subscriptions', requireUser, billingLimit, async (req, res) => {
  const back = safeReturnUrl(req.body?.return_url);
  if (!back) fail(422, 'Missing return address for subscription checkout.');
  res.json(
    await startSubscription(
      req.user,
      req.body ?? {},
      `${baseUrl(req)}/api/subscriptions/return?back=${encodeURIComponent(back)}`,
    ),
  );
});
async function owned(req) {
  const s = await subscriptionByPublicId(req.params.id);
  if (!s || s.user_id !== req.user.id) fail(404, 'Subscription not found.');
  return s;
}
subscriptionRoutes.get('/subscriptions/:id', requireUser, async (req, res) => {
  const s = await owned(req);
  const orders = await query(
    'SELECT id,order_number,status,total_amount,created_at,notes FROM orders WHERE coffee_subscription_id = ? AND awaiting_payment = 0 ORDER BY id DESC',
    [s.id],
  );
  res.json({ subscription: serializeSubscription(s), orders });
});
subscriptionRoutes.post('/subscriptions/:id/manage', requireUser, billingLimit, async (req, res) => {
  const s = await owned(req);
  const back = safeReturnUrl(req.body?.return_url);
  if (!back) fail(422, 'Missing return address for billing.');
  res.json(
    await manageSubscription(
      s,
      req.body?.action,
      `${baseUrl(req)}/api/subscriptions/return?back=${encodeURIComponent(back)}`,
    ),
  );
});
subscriptionRoutes.post('/subscriptions/:id/resume', requireUser, billingLimit, async (req, res) => {
  const s = await owned(req);
  if (
    s.status !== 'pending' ||
    !s.checkout_url ||
    Date.now() - new Date(`${s.created_at.replace(' ', 'T')}Z`).getTime() > 24 * 3600000
  )
    fail(409, 'Start a new subscription quote to continue.');
  res.json({ url: s.checkout_url });
});
subscriptionRoutes.get('/admin/subscriptions', requireAdmin, async (_req, res) => {
  const rows = await query(
    'SELECT s.*,u.name AS customer_name,u.email AS customer_email FROM coffee_subscriptions s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 200',
  );
  res.json({
    subscriptions: rows.map((s) => serializeSubscription({ ...s, selection: jsonValue(s.selection) }, true)),
  });
});
const isSubscriptionEvent = (event) =>
  event.type?.startsWith('customer.subscription.') ||
  event.type?.startsWith('invoice.') ||
  event.data?.object?.metadata?.coffee_subscription_id;
export async function subscriptionWebhook(req, res) {
  const event = verifyWebhook(
    req.body?.toString('utf8') ?? '',
    req.get('stripe-signature'),
    300,
    config.subscriptions.webhookSecret,
  );
  if (!event) return res.status(400).json({ message: 'Invalid signature.' });
  if (isSubscriptionEvent(event)) await processSubscriptionEvent(event);
  res.json({ received: true });
}
export async function combinedStripeWebhook(req, res) {
  const raw = req.body?.toString('utf8') ?? '',
    header = req.get('stripe-signature');
  const subscription = verifyWebhook(raw, header, 300, config.subscriptions.webhookSecret);
  if (subscription && isSubscriptionEvent(subscription)) {
    await processSubscriptionEvent(subscription);
    return res.json({ received: true });
  }
  return stripeWebhook(req, res);
}
