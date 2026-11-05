import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

// All mutations go to a throwaway database. Customer/order data is never copied.
const sourceDb = config.db.database;
const testDb = `sweet_eye_app_test_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;
const realFetch = globalThis.fetch;
let connection, pool, query, first, appServer, base, tokens, product, selection, subscription, remote, invoice;
let processEvent, createShipment, loadOrder, verifyWebhook, readPages, cleanSection, originalPath, validatePackages;
let sessions = 0,
  expectedTotal = 0;
const providerCalls = [];
const checkoutSessions = new Map();
const checkoutKeys = new Map();
before(async () => {
  connection = await mysql.createConnection(config.db);
  await connection.query(`CREATE DATABASE \`${testDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [tables] = await connection.query('SHOW TABLES');
  await connection.query(`USE \`${testDb}\``);
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  for (const entry of tables) {
    const table = Object.values(entry)[0];
    assert.match(table, /^[a-z0-9_]+$/i);
    if (['coffee_subscriptions', 'page_contents', 'page_sections', 'ups_shipments'].includes(table)) continue;
    const [[schema]] = await connection.query(`SHOW CREATE TABLE \`${sourceDb}\`.\`${table}\``);
    await connection.query(schema['Create Table']);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS=1');
  for (const table of [
    'categories',
    'products',
    'product_variants',
    'modifier_groups',
    'modifiers',
    'modifier_group_product',
  ])
    await connection.query(`INSERT INTO \`${testDb}\`.\`${table}\` SELECT * FROM \`${sourceDb}\`.\`${table}\``);
  await connection.query(
    "INSERT INTO settings (`key`,`value`) VALUES ('tax_rate','9.75'),('local_delivery_zips','38016'),('local_delivery_fee','4.99'),('standard_shipping_rate','11.99')",
  );
  config.db.database = testDb;
  config.paymentsMode = 'test';
  config.mail.enabled = false;
  config.square.accessToken = '';
  config.subscriptions = {
    enabled: true,
    allowLive: false,
    secret: 'sk_test_fixture',
    webhookSecret: 'whsec_fixture',
    encryptionKey: `base64:${Buffer.alloc(32, 8).toString('base64')}`,
  };
  ({ pool, query, first } = await import('../src/db.js'));
  ({ processSubscriptionEvent: processEvent } = await import('../src/lib/subscriptions.js'));
  ({ createShipment, validatePackages } = await import('../src/lib/ups-shipping.js'));
  ({ loadOrder } = await import('../src/lib/orders.js'));
  ({ verifyWebhook } = await import('../src/lib/stripe.js'));
  ({ readPages, cleanSection } = await import('../src/lib/pages.js'));
  ({ originalPath } = await import('../src/lib/images.js'));
  const { migrate } = await import('../database/migrate.js');
  await migrate();
  await migrate();
  const { signUserToken } = await import('../src/lib/auth.js');
  tokens = {};
  for (const [role, name] of [
    ['customer', 'customer'],
    ['customer', 'other'],
    ['admin', 'staff'],
    ['super_admin', 'owner'],
  ]) {
    const r = await query(
      'INSERT INTO users (name,email,password,role,created_at,updated_at) VALUES (?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
      [name, `${name}@example.invalid`, 'fixture-password-hash', role],
    );
    const user = await first('SELECT * FROM users WHERE id=?', [r.insertId]);
    tokens[name] = { id: user.id, token: signUserToken(user) };
  }
  const { app } = await import('../src/index.js');
  appServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));
  base = `http://127.0.0.1:${appServer.address().port}`;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.stripe.com/v1/'))
      throw new Error('Unexpected provider network call in tests');
    providerCalls.push([url, options]);
    const form = new URLSearchParams(options?.body);
    if (String(url).endsWith('/checkout/sessions')) {
      const key = options.headers['Idempotency-Key'];
      if (checkoutKeys.has(key)) return Response.json(checkoutKeys.get(key));
      sessions++;
      const session = {
        id: `cs_test_${sessions}`,
        url: `https://checkout.stripe.com/c/pay/test_${sessions}`,
        status: 'open',
        metadata: { coffee_subscription_id: form.get('metadata[coffee_subscription_id]') },
      };
      checkoutSessions.set(session.id, session);
      checkoutKeys.set(key, session);
      return Response.json(session);
    }
    if (String(url).includes('/checkout/sessions/')) {
      const id = String(url).split('/checkout/sessions/')[1].split('/')[0];
      const session = checkoutSessions.get(id);
      if (String(url).endsWith('/expire')) session.status = 'expired';
      return Response.json(session);
    }
    if (String(url).includes('/billing_portal/'))
      return Response.json({ url: 'https://billing.stripe.com/p/session/test' });
    if (String(url).includes('/subscriptions/'))
      return Response.json(
        options?.method === 'POST'
          ? { ...remote, cancel_at_period_end: form.get('cancel_at_period_end') === 'true' }
          : remote,
      );
    if (String(url).includes('/invoices/')) return Response.json(invoice);
    throw new Error('Unexpected Stripe call');
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  if (appServer) await new Promise((resolve) => appServer.close(resolve));
  if (pool) await pool.end();
  if (connection) {
    assert.match(testDb, /^sweet_eye_app_test_\d+_[a-f0-9]+$/);
    assert.notEqual(testDb, sourceDb);
    await connection.query(`DROP DATABASE \`${testDb}\``);
    await connection.end();
  }
});
async function api(method, path, body, user) {
  const response = await realFetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${tokens[user].token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
test('catalog, photos and standard ordering keep working', async () => {
  const health = await api('GET', '/health');
  assert.equal(health.status, 200);
  const catalog = await api('GET', '/catalog');
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.products.length > 30);
  product = catalog.body.products.find((p) => p.is_beans && p.orderable);
  assert.ok(product);
  assert.deepEqual(
    product.sizes.map((s) => s.name),
    ['12oz', '2lb', '5lb'],
  );
  const modifiers = product.groups.filter((g) => g.required).map((g) => g.options[0].id);
  selection = {
    product_id: product.id,
    size: product.sizes[0].name,
    quantity: 2,
    modifiers,
    plan: 'two_weeks',
    line1: '123 Test St',
    line2: null,
    city: 'Cordova',
    state: 'TN',
    zip: '38016',
    phone: '9015550100',
  };
  const line = await api('POST', '/cart/line', {
    product_id: product.id,
    size_name: '5lb',
    quantity: 1,
    modifiers,
    price: 0.01,
  });
  assert.equal(line.status, 200);
  assert.equal(line.body.line.unit_price, product.sizes.find((s) => s.name === '5lb').price);
  assert.equal(
    (await api('POST', '/cart/line', { product_id: product.id, size_name: '3lb', quantity: 1, modifiers })).status,
    422,
  );
  const drink = catalog.body.products.find(
    (p) =>
      p.groups.some((g) => g.slug === 'temperature' && g.options.some((o) => o.name === 'Iced')) &&
      p.sizes.some((s) => s.name === 'Large'),
  );
  assert.ok(drink);
  const chosen = drink.groups
    .filter((g) => g.required || g.slug === 'temperature')
    .map((g) => (g.options.find((o) => o.name === 'Iced') ?? g.options[0]).id);
  const iced = await api('POST', '/cart/line', {
    product_id: drink.id,
    size_name: 'Large',
    quantity: 1,
    modifiers: chosen,
  });
  assert.equal(iced.status, 200);
  assert.match(iced.body.line.modifiers_label, /Iced/);
  const photo = await realFetch(product.image.replace(/^http:\/\/[^/]+/, base));
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get('content-type'), /image\//);
  const store = await api('GET', '/store');
  assert.equal(store.status, 200);
  assert.equal(store.body.timezone, 'America/Chicago');
});
test('super admin page editing, gallery, hiding and extra sections share the public content', async () => {
  assert.equal((await api('PUT', '/admin/pages/home', { fields: { 'hero.title': 'Denied' } }, 'customer')).status, 403);
  assert.equal((await api('PUT', '/admin/pages/home', { fields: { 'hero.title': 'Denied' } }, 'staff')).status, 403);
  assert.equal((await api('GET', '/admin/pages', undefined, 'owner')).status, 200);
  const save = await api(
    'PUT',
    '/admin/pages/home',
    { fields: { 'hero.title': 'Fresh app coffee' }, hidden: ['stats'] },
    'owner',
  );
  assert.equal(save.status, 200);
  let pages = (await api('GET', '/pages')).body.pages;
  assert.equal(pages.home.fields['hero.title'], 'Fresh app coffee');
  assert.ok(pages.home.hidden.includes('stats'));
  assert.ok(pages.privacy.fields['body.text'].length > 100);
  const extra = await api(
    'POST',
    '/admin/pages/home/sections',
    { type: 'text', data: { heading: 'New app section', body: '**Fresh** beans' } },
    'owner',
  );
  assert.equal(extra.status, 201);
  pages = await readPages(base);
  assert.equal(pages.home.sections[0].data.heading, 'New app section');
  await api(
    'PUT',
    `/admin/pages/home/sections/${extra.body.id}`,
    { data: { heading: 'Hidden section' }, is_visible: false },
    'owner',
  );
  assert.equal((await readPages(base)).home.sections.length, 0);
  assert.equal(
    (await api('PUT', '/admin/pages/home', { fields: { 'hero.background': '../../.env' } }, 'owner')).status,
    422,
  );
  assert.equal(
    (await api('PUT', '/admin/pages/gallery', { fields: { 'social.instagram': 'javascript:alert(1)' } }, 'owner'))
      .status,
    422,
  );
  assert.throws(() => cleanSection('cta', { button_url: '//evil.invalid' }));
  assert.equal(originalPath('/../../.env'), null);
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const upload = await api('POST', '/admin/pages/gallery/photo', { data: gif }, 'owner');
  assert.equal(upload.status, 200);
  await api(
    'PUT',
    '/admin/pages/gallery',
    { fields: { 'photos.items': [{ src: upload.body.path, caption: 'Test photo' }] } },
    'owner',
  );
  pages = await readPages(base);
  assert.equal(pages.gallery.fields['photos.items'][0].caption, 'Test photo');
  const fs = await import('node:fs/promises');
  await fs.unlink(`${config.imagesDir}/${upload.body.path}`);
  await api('PUT', '/admin/pages/home', { reset: ['hero', 'stats'] }, 'owner');
  assert.notEqual((await readPages(base)).home.fields['hero.title'], 'Fresh app coffee');
  assert.equal((await api('PUT', '/admin/settings', { timezone: 'America/New_York' }, 'owner')).status, 200);
  assert.equal((await api('GET', '/store')).body.timezone, 'America/New_York');
  assert.equal((await api('PUT', '/admin/settings', { timezone: 'Invalid/Zone' }, 'owner')).status, 422);
});
test('quotes enforce catalog, address, plans and server prices', async () => {
  const q = await api('POST', '/subscriptions/quote', { ...selection, unit_cents: 1 });
  assert.equal(q.status, 200);
  const unit =
    product.sizes[0].price +
    product.groups
      .flatMap((g) => g.options.filter((o) => selection.modifiers.includes(o.id)))
      .reduce((sum, o) => sum + o.price, 0);
  const subtotal = Math.round(unit * 100) * 2;
  const discount = Math.round(subtotal * 0.15);
  expectedTotal = subtotal - discount + Math.round((subtotal - discount) * 0.0975) + 499;
  assert.equal(q.body.total_cents, expectedTotal);
  assert.equal(q.body.discount_percent, 15);
  assert.equal(q.body.shipping_service, 'Local Delivery');
  const national = await api('POST', '/subscriptions/quote', { ...selection, zip: '10001', plan: 'two_months' });
  assert.equal(national.status, 200);
  assert.equal(national.body.shipping_cents, 1199);
  assert.equal(national.body.discount_percent, 5);
  for (const patch of [
    { quantity: 21 },
    { quantity: 1.5 },
    { size: '3lb' },
    { plan: 'invalid' },
    { modifiers: [999999] },
    { zip: 'abc' },
    { phone: 'bad' },
  ])
    assert.equal((await api('POST', '/subscriptions/quote', { ...selection, ...patch })).status, 422);
  const category = product.category_id;
  await query('UPDATE categories SET is_active=0 WHERE id=?', [category]);
  assert.equal((await api('POST', '/subscriptions/quote', selection)).status, 422);
  await query('UPDATE categories SET is_active=1 WHERE id=?', [category]);
});
test('signup requires login, consent and matching total, and concurrent starts reuse checkout', async () => {
  const body = {
    ...selection,
    return_url: 'exp://127.0.0.1:8081/--/subscriptions',
    renewal_consent: true,
    expected_total_cents: expectedTotal,
  };
  assert.equal((await api('POST', '/subscriptions', body)).status, 401);
  assert.equal((await api('POST', '/subscriptions', { ...body, renewal_consent: false }, 'customer')).status, 422);
  assert.equal((await api('POST', '/subscriptions', { ...body, expected_total_cents: 1 }, 'customer')).status, 409);
  const [a, b] = await Promise.all([
    api('POST', '/subscriptions', body, 'customer'),
    api('POST', '/subscriptions', body, 'customer'),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.subscription.id, b.body.subscription.id);
  assert.equal((await first('SELECT COUNT(*) AS n FROM coffee_subscriptions')).n, 1);
  subscription = await first('SELECT * FROM coffee_subscriptions');
  const checkoutCalls = providerCalls.filter(([url]) => url.endsWith('/checkout/sessions'));
  const params = new URLSearchParams(checkoutCalls[0][1].body);
  assert.equal(params.get('mode'), 'subscription');
  assert.equal(params.get('line_items[0][price_data][recurring][interval_count]'), '2');
  assert.equal(params.get('line_items[0][price_data][recurring][interval]'), 'week');
  assert.equal(params.has('payment_method_types'), false);
  assert.ok(
    checkoutCalls.every(
      ([, opts]) => opts.headers['Idempotency-Key'] === `coffee-subscription-${subscription.public_id}`,
    ),
  );
  assert.equal((await api('GET', `/subscriptions/${subscription.public_id}`, undefined, 'other')).status, 404);
  assert.equal((await api('GET', '/admin/subscriptions', undefined, 'customer')).status, 403);
  const own = await api('GET', `/subscriptions/${subscription.public_id}`, undefined, 'customer');
  assert.equal(own.status, 200);
  assert.equal('recipient' in own.body.subscription, false);
  assert.equal('checkout_url' in own.body.subscription, false);
});
test('signed events reject tampering; paid invoices fulfill once and failed renewals never ship', async () => {
  const t = Math.floor(Date.now() / 1000),
    raw = JSON.stringify({ type: 'invoice.paid', data: { object: { id: 'in_initial' } } });
  const sig = crypto.createHmac('sha256', config.subscriptions.webhookSecret).update(`${t}.${raw}`).digest('hex');
  assert.ok(verifyWebhook(raw, `t=${t},v1=${sig}`, 300, config.subscriptions.webhookSecret));
  assert.equal(verifyWebhook(raw + ' ', `t=${t},v1=${sig}`, 300, config.subscriptions.webhookSecret), null);
  assert.equal(
    (
      await realFetch(`${base}/api/subscriptions/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'invalid' },
        body: raw,
      })
    ).status,
    400,
  );
  remote = {
    id: 'sub_fixture',
    customer: 'cus_fixture',
    status: 'active',
    livemode: false,
    cancel_at_period_end: false,
    metadata: { coffee_subscription_id: subscription.public_id },
    items: { data: [{ current_period_end: t + 14 * 86400 }] },
  };
  invoice = {
    id: 'in_initial',
    status: 'paid',
    subscription: remote.id,
    billing_reason: 'subscription_create',
    customer: remote.customer,
    currency: 'usd',
    total: expectedTotal,
    amount_paid: expectedTotal,
    amount_remaining: 0,
    livemode: false,
  };
  const provider = async (_method, path) => (path.startsWith('/subscriptions/') ? remote : invoice);
  const event = {
    type: 'invoice.paid',
    livemode: false,
    data: { object: { id: invoice.id, subscription: remote.id } },
  };
  await Promise.all([processEvent(event, provider), processEvent(event, provider)]);
  assert.equal((await first('SELECT COUNT(*) AS n FROM orders')).n, 1);
  const order = await loadOrder((await first('SELECT id FROM orders')).id);
  assert.equal(order.awaiting_payment, 0);
  assert.equal(order.payment.status, 'completed');
  assert.match(order.notes, /TEST/);
  assert.equal(order.items[0].size_name, selection.size);
  assert.ok(order.items[0].modifiers.length);
  assert.equal((await first('SELECT COUNT(*) AS n FROM notifications')).n, 0);
  remote = { ...remote, status: 'past_due' };
  await processEvent({ ...event, type: 'invoice.payment_failed' }, provider);
  assert.equal((await first('SELECT COUNT(*) AS n FROM orders')).n, 1);
  assert.equal((await first('SELECT status FROM coffee_subscriptions')).status, 'past_due');
  remote = { ...remote, status: 'active', cancel_at_period_end: true };
  invoice = { ...invoice, id: 'in_renewal', billing_reason: 'subscription_cycle' };
  await processEvent({ ...event, data: { object: { id: invoice.id, subscription: remote.id } } }, provider);
  assert.equal((await first('SELECT COUNT(*) AS n FROM orders')).n, 2);
  assert.equal((await first('SELECT cancel_at_period_end FROM coffee_subscriptions')).cancel_at_period_end, 1);
  const wrong = { ...invoice, id: 'in_wrong', total: 1 };
  await assert.rejects(() =>
    processEvent({ ...event, data: { object: { id: wrong.id, subscription: remote.id } } }, async (method, path) =>
      path.startsWith('/subscriptions/') ? remote : wrong,
    ),
  );
  assert.equal((await first('SELECT COUNT(*) AS n FROM orders')).n, 2);
  const signedRaw = JSON.stringify({ ...event, data: { object: { id: invoice.id, subscription: remote.id } } });
  const signed = crypto
    .createHmac('sha256', config.subscriptions.webhookSecret)
    .update(`${t}.${signedRaw}`)
    .digest('hex');
  for (const endpoint of ['/api/subscriptions/webhook', '/api/stripe/webhook'])
    assert.equal(
      (
        await realFetch(`${base}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${signed}` },
          body: signedRaw,
        })
      ).status,
      200,
    );
  assert.equal((await first('SELECT COUNT(*) AS n FROM orders')).n, 2);
  const cancel = await api(
    'POST',
    `/subscriptions/${subscription.public_id}/manage`,
    { action: 'cancel', return_url: 'exp://127.0.0.1:8081/--/subscriptions' },
    'customer',
  );
  assert.equal(cancel.status, 200);
  config.subscriptions.enabled = false;
  const portal = await api(
    'POST',
    `/subscriptions/${subscription.public_id}/manage`,
    { action: 'portal', return_url: 'exp://127.0.0.1:8081/--/subscriptions' },
    'customer',
  );
  assert.equal(portal.status, 200);
  assert.match(portal.body.url, /billing\.stripe\.com/);
  config.subscriptions.enabled = true;
  await query("INSERT INTO settings (`key`,`value`) VALUES ('payment_stripe_enabled','0')");
  assert.equal((await api('GET','/subscriptions/catalog')).body.billing_ready,false);
  await query("DELETE FROM settings WHERE `key`='payment_stripe_enabled'");
});
test('UPS labels enforce paid orders, dimensions, uncertain results and duplicate protection', async () => {
  const testOrder = await loadOrder((await first('SELECT id FROM orders ORDER BY id LIMIT 1')).id);
  await assert.rejects(() =>
    createShipment(testOrder, [{ weight: 2, length: 10, width: 8, height: 6 }], async () => {
      throw new Error('Must not call carrier for test orders');
    }),
  );
  assert.throws(() => validatePackages([{ weight: 2, length: 100, width: 30, height: 20 }]));
  assert.throws(() => validatePackages([{ weight: 151, length: 10, width: 8, height: 6 }]));
  await query(
    "UPDATE orders SET notes=NULL,coffee_subscription_id=NULL,shipping_method='ups',shipping_service='Standard Shipping',shipping_service_code='03' WHERE id=?",
    [testOrder.id],
  );
  await query("UPDATE payments SET detail='Paid card' WHERE order_id=?", [testOrder.id]);
  const order = await loadOrder(testOrder.id),
    box = { weight: 2, length: 10, width: 8, height: 6 };
  let calls = 0;
  const provider = async (payload) => {
    calls++;
    assert.equal(payload.ShipmentRequest.Shipment.Service.Code, '03');
    return Response.json({
      ShipmentResponse: {
        ShipmentResults: {
          ShipmentIdentificationNumber: 'SHIP-TEST',
          PackageResults: {
            TrackingNumber: '1ZTEST',
            ShippingLabel: { GraphicImage: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' },
          },
          ShipmentCharges: { TotalCharges: { MonetaryValue: '12.34', CurrencyCode: 'USD' } },
        },
      },
    });
  };
  const row = await createShipment(order, [box], provider);
  assert.equal(row.status, 'created');
  assert.equal(row.carrier_charge, 12.34);
  await assert.rejects(() => createShipment(order, [box], provider));
  assert.equal(calls, 1);
  assert.equal((await api('GET', `/admin/orders/${order.id}/shipment`, undefined, 'customer')).status, 403);
  const info = await api('GET', `/admin/orders/${order.id}/shipment`, undefined, 'owner');
  assert.equal(info.status, 200);
  assert.equal(info.body.shipment.tracking[0], '1ZTEST');
  const label = await realFetch(info.body.shipment.labels[0]);
  assert.equal(label.status, 200);
  assert.match(label.headers.get('cache-control'), /private/);
  assert.equal((await realFetch(`${base}/api/shipping-label/${order.id}/1?token=invalid`)).status, 403);
  await query('DELETE FROM ups_shipments WHERE order_id=?', [order.id]);
  await assert.rejects(() =>
    createShipment(order, [box], async () => {
      throw new Error('Network timeout');
    }),
  );
  assert.equal((await first('SELECT status FROM ups_shipments WHERE order_id=?', [order.id])).status, 'unknown');
  await assert.rejects(() => createShipment(order, [box], provider));
  assert.equal(calls, 1);
});

test('expired and repriced pending checkouts are reconciled before another agreement is created', async () => {
  const data = { ...selection, quantity: 3, plan: 'one_month' };
  let quote = (await api('POST', '/subscriptions/quote', data)).body;
  const start = () =>
    api(
      'POST',
      '/subscriptions',
      {
        ...data,
        expected_total_cents: quote.total_cents,
        renewal_consent: true,
        return_url: 'exp://127.0.0.1:8081/--/subscriptions',
      },
      'customer',
    );
  const firstAttempt = await start();
  assert.equal(firstAttempt.status, 200);
  const old = await first('SELECT * FROM coffee_subscriptions WHERE public_id=?', [firstAttempt.body.subscription.id]);
  await query('UPDATE coffee_subscriptions SET created_at=UTC_TIMESTAMP()-INTERVAL 25 HOUR WHERE id=?', [old.id]);
  checkoutSessions.get(old.checkout_session_id).status = 'expired';
  const replacement = await start();
  assert.equal(replacement.status, 200);
  assert.notEqual(replacement.body.subscription.id, old.public_id);
  assert.equal((await first('SELECT status FROM coffee_subscriptions WHERE id=?', [old.id])).status, 'expired');
  const pending = await first('SELECT * FROM coffee_subscriptions WHERE public_id=?', [
    replacement.body.subscription.id,
  ]);
  await query('UPDATE product_variants SET price=price+1 WHERE product_id=? AND size_name=?', [
    product.id,
    selection.size,
  ]);
  quote = (await api('POST', '/subscriptions/quote', data)).body;
  const repriced = await start();
  assert.equal(repriced.status, 200);
  assert.notEqual(repriced.body.subscription.id, pending.public_id);
  assert.equal(checkoutSessions.get(pending.checkout_session_id).status, 'expired');
  assert.equal((await first('SELECT status FROM coffee_subscriptions WHERE id=?', [pending.id])).status, 'expired');
});
