import crypto from 'node:crypto';

export const PLANS = {
  two_months: {
    label: 'Every 2 months',
    interval: 'month',
    count: 2,
    discount: 5,
    pitch: 'Stock up. Fewer deliveries.',
  },
  one_month: { label: 'Every month', interval: 'month', count: 1, discount: 10, pitch: 'A fresh monthly routine' },
  two_weeks: {
    label: 'Every 2 weeks',
    interval: 'week',
    count: 2,
    discount: 15,
    pitch: 'For your daily coffee ritual',
  },
};
export function billingReady(settings, production) {
  return (
    settings.enabled &&
    Boolean(settings.webhookSecret) &&
    encryptionKey(settings.encryptionKey).length === 32 &&
    (/^(sk|rk)_test_/.test(settings.secret) ||
      (production && settings.allowLive && /^(sk|rk)_live_/.test(settings.secret)))
  );
}
export const encryptionKey = (key) =>
  Buffer.from(String(key ?? '').replace(/^base64:/, ''), String(key ?? '').startsWith('base64:') ? 'base64' : 'utf8');
export function encryptRecipient(value, key) {
  const decoded = encryptionKey(key);
  if (decoded.length !== 32) throw new Error('Configure LARAVEL_APP_KEY for encrypted subscription addresses.');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', decoded, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]).toString('base64');
  const iv64 = iv.toString('base64');
  const mac = crypto
    .createHmac('sha256', decoded)
    .update(iv64 + encrypted)
    .digest('hex');
  return Buffer.from(JSON.stringify({ iv: iv64, value: encrypted, mac, tag: '' })).toString('base64');
}
export function decryptRecipient(value, key) {
  const payload = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  const decoded = encryptionKey(key);
  const expected = crypto
    .createHmac('sha256', decoded)
    .update(payload.iv + payload.value)
    .digest('hex');
  if (
    typeof payload.mac !== 'string' ||
    payload.mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(payload.mac), Buffer.from(expected))
  )
    throw new Error('Subscription address integrity check failed.');
  const decipher = crypto.createDecipheriv('aes-256-cbc', decoded, Buffer.from(payload.iv, 'base64'));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(payload.value, 'base64')), decipher.final()]).toString('utf8'),
  );
}
export function recurringTotals(unitCents, quantity, discountPercent, rate, shippingCents) {
  const subtotal = unitCents * quantity;
  const discount = Math.round((subtotal * discountPercent) / 100);
  const tax = Math.round((subtotal - discount) * rate);
  return {
    subtotal_cents: subtotal,
    discount_cents: discount,
    tax_cents: tax,
    shipping_cents: shippingCents,
    total_cents: subtotal - discount + tax + shippingCents,
  };
}
export function invoiceMatches(invoice, local, subscriptionId) {
  return (
    invoice.status === 'paid' &&
    (invoice.subscription ?? invoice.parent?.subscription_details?.subscription) === subscriptionId &&
    ['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason) &&
    invoice.customer === local.stripe_customer_id &&
    invoice.currency === 'usd' &&
    Number(invoice.total) === Number(local.total_cents) &&
    Number(invoice.amount_remaining) === 0 &&
    Number(invoice.amount_paid) === Number(local.total_cents)
  );
}
