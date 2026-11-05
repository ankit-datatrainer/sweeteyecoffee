import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  billingReady,
  decryptRecipient,
  encryptRecipient,
  invoiceMatches,
  PLANS,
  recurringTotals,
} from '../src/lib/subscription-policy.js';

const key = `base64:${Buffer.alloc(32, 7).toString('base64')}`;
test('subscription intervals and discounts match the website', () => {
  assert.deepEqual(Object.keys(PLANS), ['two_months', 'one_month', 'two_weeks']);
  assert.deepEqual([PLANS.two_weeks.interval, PLANS.two_weeks.count, PLANS.two_weeks.discount], ['week', 2, 15]);
  assert.deepEqual([PLANS.two_months.interval, PLANS.two_months.count, PLANS.two_months.discount], ['month', 2, 5]);
  assert.deepEqual(recurringTotals(1599, 2, 15, 0.0975, 499), {
    subtotal_cents: 3198,
    discount_cents: 480,
    tax_cents: 265,
    shipping_cents: 499,
    total_cents: 3482,
  });
});
test('billing readiness refuses live development keys and incomplete configuration', () => {
  const s = {
    enabled: true,
    secret: 'sk_test_fixture',
    webhookSecret: 'whsec_fixture',
    encryptionKey: key,
    allowLive: false,
  };
  assert.equal(billingReady(s, false), true);
  assert.equal(billingReady({ ...s, secret: 'sk_live_fixture', allowLive: true }, false), false);
  assert.equal(billingReady({ ...s, secret: 'sk_live_fixture', allowLive: true }, true), true);
  assert.equal(billingReady({ ...s, webhookSecret: '' }, false), false);
  assert.equal(billingReady({ ...s, encryptionKey: '' }, false), false);
});
test('addresses use authenticated Laravel-compatible encryption', () => {
  const address = { line1: '123 Test St', city: 'Cordova', state: 'TN', zip: '38016' };
  const encrypted = encryptRecipient(address, key);
  assert.deepEqual(decryptRecipient(encrypted, key), address);
  const payload = JSON.parse(Buffer.from(encrypted, 'base64'));
  const decoded = Buffer.from(key.slice(7), 'base64');
  const cipher = crypto.createDecipheriv('aes-256-cbc', decoded, Buffer.from(payload.iv, 'base64'));
  assert.equal(
    Buffer.concat([cipher.update(payload.value, 'base64'), cipher.final()]).toString(),
    JSON.stringify(address),
  );
  payload.mac = '0'.repeat(64);
  assert.throws(() => decryptRecipient(Buffer.from(JSON.stringify(payload)).toString('base64'), key));
});
test('only authoritative fully paid expected invoices qualify for fulfillment', () => {
  const local = { stripe_customer_id: 'cus_test', total_cents: 3482 };
  const invoice = {
    status: 'paid',
    subscription: 'sub_test',
    billing_reason: 'subscription_cycle',
    customer: 'cus_test',
    currency: 'usd',
    total: 3482,
    amount_paid: 3482,
    amount_remaining: 0,
  };
  assert.equal(invoiceMatches(invoice, local, 'sub_test'), true);
  for (const patch of [
    { status: 'open' },
    { subscription: 'sub_other' },
    { billing_reason: 'manual' },
    { customer: 'cus_other' },
    { currency: 'eur' },
    { total: 1 },
    { amount_remaining: 1 },
    { amount_paid: 1 },
  ])
    assert.equal(invoiceMatches({ ...invoice, ...patch }, local, 'sub_test'), false);
  const nested = { ...invoice, parent: { subscription_details: { subscription: 'sub_test' } } };
  delete nested.subscription;
  assert.equal(invoiceMatches(nested, local, 'sub_test'), true);
});
