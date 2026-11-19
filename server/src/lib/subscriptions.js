import crypto from 'node:crypto';
import { config } from '../config.js';
import { first, query, transaction, nowUtc, toIso } from '../db.js';
import { fail } from './http.js';
import { beanSizeKey, priceLine, visibleProducts, serializeProduct } from './catalog.js';
import { shippingSettings, normalizeAddress, formatAddress } from './pricing.js';
import { getSetting, taxRate } from './store.js';
import { completeOrder, generateOrderNumber, loadOrder } from './orders.js';
import { chargeOrder, squareConfigured } from './square.js';
import { jsonValue } from './pages.js';
import {
  billingReady,
  decryptRecipient,
  encryptRecipient,
  invoiceMatches,
  PLANS,
  recurringTotals,
} from './subscription-policy.js';

const credentialsReady = () => billingReady({ ...config.subscriptions, enabled: true }, config.isProduction);
export const subscriptionReady = async () => config.subscriptions.enabled && credentialsReady() && String(await getSetting('payment_stripe_enabled', '1')) !== '0';
const testMode = () => /^(sk|rk)_test_/.test(config.subscriptions.secret);
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
export async function subscriptionApi(method, path, data = {}, idempotency = null) {
  if (!credentialsReady())
    fail(503, 'Subscription billing needs Stripe credentials, a webhook secret and the shared encryption key.');
  const form = new URLSearchParams();
  function append(prefix, value) {
    if (value === null || value === undefined) return;
    if (typeof value === 'object')
      for (const [k, v] of Object.entries(value)) append(prefix ? `${prefix}[${k}]` : k, v);
    else form.append(prefix, String(value));
  }
  append('', data);
  let response;
  try {
    response = await fetch(`https://api.stripe.com/v1${path}${method === 'GET' && form.size ? `?${form}` : ''}`, {
      method,
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${config.subscriptions.secret}`,
        'Stripe-Version': '2025-06-30.basil',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
      },
      ...(method === 'POST' ? { body: form.toString() } : {}),
    });
  } catch {
    fail(503, 'Subscription billing is temporarily unavailable. Please try again.');
  }
  const body = await response.json();
  if (!response.ok) {
    console.error('Subscription provider error', response.status, body.error?.code);
    fail(503, 'Subscription billing is temporarily unavailable. Please try again or contact the shop.');
  }
  return body;
}
export async function subscriptionCatalog(base) {
  const { products } = await visibleProducts();
  return {
    enabled: config.subscriptions.enabled,
    billing_ready: await subscriptionReady(),
    test_mode: testMode(),
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    products: products
      .filter((p) => p.category_slug === 'coffee-beans' && !p.is_sold_out && p.variants.some((s) => s.is_available))
      .map((p) => serializeProduct(p, base)),
  };
}
export function subscriptionInput(raw = {}) {
  if (!Object.hasOwn(PLANS, raw.plan)) fail(422, 'Choose a subscription interval.');
  const quantity = Number(raw.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)
    fail(422, 'Subscription quantity must be between 1 and 20.');
  const a = normalizeAddress(raw.address ?? raw);
  if (a.line1.length > 35 || (a.line2?.length ?? 0) > 35 || a.city.length > 30)
    fail(422, 'Use up to 35 characters per street line and 30 for the city.');
  const phone = String(raw.phone ?? '').trim();
  if (!/^\+?[0-9 ()-]{10,20}$/.test(phone)) fail(422, 'Enter a valid delivery phone number.');
  return {
    product_id: raw.product_id,
    size_name: raw.size ?? raw.size_name,
    quantity,
    modifiers: raw.modifiers ?? [],
    plan: raw.plan,
    recipient: { ...a, phone },
  };
}
export async function subscriptionQuote(raw) {
  const input = subscriptionInput(raw);
  const line = await priceLine(input);
  if (line.product.category_slug !== 'coffee-beans' || !line.size_name)
    fail(422, 'Subscriptions are available for in-stock coffee beans and available bag sizes only.');
  const plan = PLANS[input.plan];
  const shipping = await shippingSettings();
  const local = shipping.localZips.includes(input.recipient.zip);
  const unit = Math.round(line.unit_price * 100);
  return {
    product_id: line.product_id,
    name: line.name,
    size: line.size_name,
    quantity: line.quantity,
    modifiers: line.modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })),
    unit_cents: unit,
    ...recurringTotals(
      unit,
      line.quantity,
      plan.discount,
      await taxRate(),
      Math.round((local ? shipping.localFee : shipping.standardRate) * 100),
    ),
    discount_percent: plan.discount,
    plan: input.plan,
    interval: plan.label,
    shipping_method: local ? 'local_delivery' : 'ups',
    shipping_service: local ? 'Local Delivery' : 'Standard Shipping',
    shipping_service_code: local ? 'local' : '03',
  };
}
const decode = (s) => s && { ...s, selection: jsonValue(s.selection) };
export async function subscriptionByPublicId(id) {
  return decode(await first('SELECT * FROM coffee_subscriptions WHERE public_id = ?', [id]));
}
export function serializeSubscription(s, admin = false) {
  return {
    id: s.public_id,
    status: s.status,
    plan: s.plan,
    selection: s.selection,
    total_cents: s.total_cents,
    cancel_at_period_end: Boolean(s.cancel_at_period_end),
    period_end: toIso(s.period_end),
    created_at: toIso(s.created_at),
    can_resume_checkout:
      s.status === 'pending' &&
      Boolean(s.checkout_url) &&
      Date.now() - new Date(toIso(s.created_at)).getTime() < 24 * 3600000,
    ...(admin ? { customer_name: s.customer_name, customer_email: s.customer_email } : {}),
  };
}
export async function startSubscription(user, raw, returnUrl) {
  if (raw.renewal_consent !== true) fail(422, 'Please authorize automatic renewal before continuing.');
  if (!(await subscriptionReady()))
    fail(503, 'Subscription billing is not configured yet. You can preview prices and contact the shop.');
  const input = subscriptionInput(raw);
  const quote = { ...(await subscriptionQuote(raw)), test_mode: testMode() };
  if (Number(raw.expected_total_cents) !== quote.total_cents)
    fail(409, 'Your recurring price changed. Review the updated quote and authorize renewal again.');
  const subscription = await transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [user.id]);
    const [existing] = await conn.query(
      "SELECT * FROM coffee_subscriptions WHERE user_id = ? AND status IN ('active','past_due','unpaid','incomplete','trialing','pending') ORDER BY id DESC",
      [user.id],
    );
    const identity = (q) =>
      JSON.stringify([
        q.product_id,
        beanSizeKey(q.size),
        q.quantity,
        q.plan,
        Boolean(q.test_mode),
        // Older plans without a grind already represent whole beans.
        (q.modifiers ?? []).filter((m) => m.name?.trim().toLowerCase() !== 'whole bean').map((m) => m.id).sort((a, b) => a - b),
      ]);
    for (const s of existing) {
      const recipient = decryptRecipient(s.recipient, config.subscriptions.encryptionKey);
      const old = jsonValue(s.selection);
      const addressIdentity = (a) =>
        JSON.stringify(['line1', 'line2', 'city', 'state', 'zip', 'phone'].map((k) => a[k] ?? null));
      if (addressIdentity(recipient) !== addressIdentity(input.recipient) || identity(old) !== identity(quote))
        continue;
      if (s.status !== 'pending') return decode(s);
      const sameQuote = canonical(old) === canonical(quote);
      if (sameQuote && Date.now() - new Date(toIso(s.created_at)).getTime() < 23 * 3600000) return decode(s);
      // Reconcile an older/repriced checkout before making another agreement.
      // A completed session can be waiting for its webhook; it must not be billed twice.
      if (!s.checkout_session_id)
        fail(409, 'Your previous checkout needs confirmation. Please contact the shop before starting another.');
      const session = await subscriptionApi('GET', `/checkout/sessions/${encodeURIComponent(s.checkout_session_id)}`);
      if ((session.metadata?.coffee_subscription_id ?? session.client_reference_id) !== s.public_id)
        throw new Error('Checkout identity mismatch.');
      if (session.status === 'complete') {
        const remote = await subscriptionApi('GET', `/subscriptions/${encodeURIComponent(session.subscription)}`);
        if (
          remote.metadata?.coffee_subscription_id !== s.public_id ||
          Boolean(remote.livemode) === Boolean(old.test_mode)
        )
          throw new Error('Subscription identity or mode mismatch.');
        const end = remote.items?.data?.[0]?.current_period_end ?? remote.current_period_end;
        const periodEnd = end ? nowUtc(new Date(end * 1000)) : null;
        await conn.query(
          'UPDATE coffee_subscriptions SET stripe_subscription_id=?,stripe_customer_id=?,status=?,cancel_at_period_end=?,period_end=?,updated_at=? WHERE id=?',
          [remote.id, remote.customer, remote.status, remote.cancel_at_period_end ? 1 : 0, periodEnd, nowUtc(), s.id],
        );
        return decode({
          ...s,
          stripe_subscription_id: remote.id,
          stripe_customer_id: remote.customer,
          status: remote.status,
          cancel_at_period_end: remote.cancel_at_period_end,
          period_end: periodEnd,
        });
      }
      if (session.status === 'open' && sameQuote) return decode(s);
      const expired =
        session.status === 'expired'
          ? session
          : session.status === 'open'
            ? await subscriptionApi(
                'POST',
                `/checkout/sessions/${encodeURIComponent(s.checkout_session_id)}/expire`,
                {},
                `coffee-expire-${s.public_id}`,
              )
            : null;
      if (expired?.status !== 'expired')
        fail(409, 'Your previous checkout is still being confirmed. Please try again shortly.');
      await conn.query("UPDATE coffee_subscriptions SET status='expired',updated_at=? WHERE id=?", [nowUtc(), s.id]);
    }
    const now = nowUtc(),
      publicId = crypto.randomUUID();
    const [r] = await conn.query(
      'INSERT INTO coffee_subscriptions (public_id,user_id,product_id,plan,selection,recipient,total_cents,consented_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        publicId,
        user.id,
        quote.product_id,
        quote.plan,
        JSON.stringify(quote),
        encryptRecipient(input.recipient, config.subscriptions.encryptionKey),
        quote.total_cents,
        now,
        now,
        now,
      ],
    );
    return {
      id: r.insertId,
      public_id: publicId,
      user_id: user.id,
      status: 'pending',
      selection: quote,
      total_cents: quote.total_cents,
      created_at: now,
      plan: quote.plan,
    };
  });
  if (subscription.stripe_subscription_id) return { subscription: serializeSubscription(subscription), url: null };
  if (subscription.checkout_url)
    return { subscription: serializeSubscription(subscription), url: subscription.checkout_url };
  const q = subscription.selection,
    plan = PLANS[q.plan],
    meta = { coffee_subscription_id: subscription.public_id };
  const session = await subscriptionApi(
    'POST',
    '/checkout/sessions',
    {
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: subscription.public_id,
      metadata: meta,
      subscription_data: { metadata: meta },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: q.total_cents,
            recurring: { interval: plan.interval, interval_count: plan.count },
            product_data: {
              name: `${q.quantity} × ${q.name} (${q.size}) — ${plan.label}`,
              description: `${q.modifiers.map((m) => m.name).join(', ')}. ${plan.discount}% off beans. Includes tax and delivery per renewal.`,
            },
          },
        },
      ],
      custom_text: {
        submit: { message: `Automatic payment and one delivery ${plan.label.toLowerCase()}. Renews until canceled.` },
      },
      expires_at: Math.floor(new Date(toIso(subscription.created_at)).getTime() / 1000) + 86400,
      success_url: returnUrl,
      cancel_url: returnUrl,
    },
    `coffee-subscription-${subscription.public_id}`,
  );
  if (!session.id || !/^https:\/\/checkout\.stripe\.com\//.test(session.url ?? ''))
    fail(503, 'Stripe did not return a checkout page.');
  await query(
    'UPDATE coffee_subscriptions SET checkout_session_id = ?, checkout_url = ?, updated_at = ? WHERE id = ?',
    [session.id, session.url, nowUtc(), subscription.id],
  );
  return { subscription: serializeSubscription({ ...subscription, checkout_url: session.url }), url: session.url };
}
export async function syncSubscription(local, remote) {
  if (
    remote.metadata?.coffee_subscription_id !== local.public_id ||
    (local.stripe_subscription_id && local.stripe_subscription_id !== remote.id)
  )
    throw new Error('Subscription identity mismatch.');
  if (Boolean(remote.livemode) === Boolean(local.selection.test_mode))
    throw new Error('Subscription payment mode mismatch.');
  const end = remote.items?.data?.[0]?.current_period_end ?? remote.current_period_end;
  await query(
    'UPDATE coffee_subscriptions SET stripe_subscription_id = ?, stripe_customer_id = ?, status = ?, cancel_at_period_end = ?, period_end = ?, updated_at = ? WHERE id = ?',
    [
      remote.id,
      remote.customer,
      remote.status,
      remote.cancel_at_period_end ? 1 : 0,
      end ? nowUtc(new Date(end * 1000)) : null,
      nowUtc(),
      local.id,
    ],
  );
  return { ...local, stripe_subscription_id: remote.id, stripe_customer_id: remote.customer, status: remote.status };
}
export async function manageSubscription(local, action, returnUrl) {
  if (action === 'portal') {
    if (!local.stripe_customer_id) fail(409, 'Billing is still being confirmed. Please try again shortly.');
    const result = await subscriptionApi('POST', '/billing_portal/sessions', {
      customer: local.stripe_customer_id,
      return_url: returnUrl,
    });
    if (!/^https:\/\/billing\.stripe\.com\//.test(result.url ?? '')) fail(503, 'The billing portal is unavailable.');
    return { url: result.url };
  }
  if (action !== 'cancel') fail(422, 'Choose cancel or portal.');
  if (!local.stripe_subscription_id) fail(409, 'Billing is still being confirmed. Please try again shortly.');
  const remote = await subscriptionApi(
    'POST',
    `/subscriptions/${encodeURIComponent(local.stripe_subscription_id)}`,
    { cancel_at_period_end: true },
    `coffee-cancel-${local.public_id}`,
  );
  await syncSubscription(local, remote);
  return { message: 'Future renewals are canceled. Your paid delivery will still be fulfilled.' };
}
export async function processSubscriptionEvent(event, api = subscriptionApi) {
  const object = event.data?.object ?? {};
  if (Boolean(event.livemode) !== !testMode()) throw new Error('Subscription event mode mismatch.');
  if (event.type === 'checkout.session.expired') {
    await query(
      "UPDATE coffee_subscriptions SET status = 'expired', updated_at = ? WHERE checkout_session_id = ? AND status = 'pending'",
      [nowUtc(), object.id ?? ''],
    );
    return;
  }
  const remoteId = event.type.startsWith('customer.subscription.')
    ? object.id
    : (object.subscription ?? object.parent?.subscription_details?.subscription);
  if (!remoteId) return;
  const remote = await api('GET', `/subscriptions/${encodeURIComponent(remoteId)}`);
  const local = await subscriptionByPublicId(remote.metadata?.coffee_subscription_id ?? '');
  if (!local) return;
  // Serialize remote reads on this subscription; delayed events read current state again.
  await transaction(async (conn) => {
    await conn.query('SELECT id FROM coffee_subscriptions WHERE id = ? FOR UPDATE', [local.id]);
    const current = await api('GET', `/subscriptions/${encodeURIComponent(remoteId)}`);
    if (
      current.metadata?.coffee_subscription_id !== local.public_id ||
      (local.stripe_subscription_id && local.stripe_subscription_id !== current.id) ||
      Boolean(current.livemode) === Boolean(local.selection.test_mode)
    )
      throw new Error('Subscription identity or mode mismatch.');
    const end = current.items?.data?.[0]?.current_period_end ?? current.current_period_end;
    await conn.query(
      'UPDATE coffee_subscriptions SET stripe_subscription_id = ?, stripe_customer_id = ?, status = ?, cancel_at_period_end = ?, period_end = ?, updated_at = ? WHERE id = ?',
      [
        current.id,
        current.customer,
        current.status,
        current.cancel_at_period_end ? 1 : 0,
        end ? nowUtc(new Date(end * 1000)) : null,
        nowUtc(),
        local.id,
      ],
    );
    local.stripe_customer_id = current.customer;
  });
  if (event.type !== 'invoice.paid') return;
  const invoice = await api('GET', `/invoices/${encodeURIComponent(object.id)}`);
  if (Boolean(invoice.livemode) === Boolean(local.selection.test_mode) || !invoiceMatches(invoice, local, remoteId))
    throw new Error('Paid subscription invoice needs reconciliation; no shipping order created.');
  const orderId = await transaction(async (conn) => {
    await conn.query('SELECT id FROM coffee_subscriptions WHERE id = ? FOR UPDATE', [local.id]);
    const [[existing]] = await conn.query('SELECT id FROM orders WHERE subscription_invoice_id = ?', [invoice.id]);
    if (existing) return existing.id;
    const q = local.selection,
      a = decryptRecipient(local.recipient, config.subscriptions.encryptionKey),
      now = nowUtc();
    const [r] = await conn.query(
      `INSERT INTO orders (user_id,order_number,type,pickup_method,status,awaiting_payment,delivery_address,delivery_address_parts,delivery_zip,delivery_phone,shipping_method,shipping_service,shipping_service_code,subtotal,discount_amount,delivery_fee,tax,total_amount,coffee_subscription_id,subscription_invoice_id,notes,created_at,updated_at) VALUES (?,?,'delivery','in_store','pending',1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        local.user_id,
        generateOrderNumber(),
        formatAddress(a),
        JSON.stringify(a),
        a.zip,
        a.phone,
        q.shipping_method,
        q.shipping_service,
        q.shipping_service_code,
        q.subtotal_cents / 100,
        q.discount_cents / 100,
        q.shipping_cents / 100,
        q.tax_cents / 100,
        q.total_cents / 100,
        local.id,
        invoice.id,
        q.test_mode ? 'TEST subscription payment — do not fulfill or ship.' : null,
        now,
        now,
      ],
    );
    await conn.query(
      'INSERT INTO order_items (order_id,product_id,size_name,modifiers,quantity,price,total,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        r.insertId,
        q.product_id,
        q.size,
        JSON.stringify(q.modifiers ?? []),
        q.quantity,
        q.unit_cents / 100,
        q.subtotal_cents / 100,
        now,
        now,
      ],
    );
    await conn.query(
      "INSERT INTO payments (order_id,method,detail,status,amount,created_at,updated_at) VALUES (?,'stripe',?,'pending',?,?,?)",
      [
        r.insertId,
        q.test_mode ? 'TEST coffee subscription — do not fulfill' : 'Coffee subscription renewal',
        q.total_cents / 100,
        now,
        now,
      ],
    );
    return r.insertId;
  });
  if (local.selection.test_mode) {
    await transaction(async (conn) => {
      await conn.query('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);
      await conn.query(
        "UPDATE payments SET status = 'completed', transaction_id = ?, updated_at = ? WHERE order_id = ?",
        [invoice.id, nowUtc(), orderId],
      );
      await conn.query(
        "UPDATE orders SET status = 'confirmed', awaiting_payment = 0, updated_at = ? WHERE id = ? AND awaiting_payment = 1",
        [nowUtc(), orderId],
      );
    });
  } else {
    const order = await loadOrder(orderId, { includeUnpaid: true });
    let squareId = order.square_order_id;
    if (order.awaiting_payment && squareConfigured()) {
      const recorded = await chargeOrder(
        order,
        order.items,
        invoice.id,
        Math.round((await taxRate()) * 10000) / 100,
        'Stripe',
      );
      if (recorded.success) squareId = recorded.square_order_id;
    }
    await completeOrder(orderId, invoice.id, squareId);
  }
}
