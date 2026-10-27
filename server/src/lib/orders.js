import crypto from 'node:crypto';
import { config } from '../config.js';
import { first, query, transaction, nowUtc, toIso } from '../db.js';
import { fail, money } from './http.js';
import { imageUrl } from './catalog.js';
import { formatAddress } from './pricing.js';
import { notifyAdmins } from './notify.js';
import { sendMail } from './mail.js';

export const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

/** "SEC-6720A1B2C3D4E" — same shape as Order::generateOrderNumber (uniqid). */
export function generateOrderNumber() {
  const now = Date.now();
  const seconds = Math.floor(now / 1000).toString(16);
  const micros = ((now % 1000) * 1000 + crypto.randomInt(0, 1000)).toString(16).padStart(5, '0');
  return `SEC-${(seconds + micros).toUpperCase()}`;
}

export function pickupMethodLabel(o) {
  if (o.type === 'delivery') return o.shipping_method === 'ups' ? 'UPS Shipping' : 'Local Delivery';
  return o.pickup_method === 'curbside' ? 'Curbside Pickup' : 'In-Store Pickup';
}

const customerName = (o) => o.user_name ?? o.guest_name ?? 'Guest';
const customerEmail = (o) => o.user_email ?? o.guest_email ?? null;

/** One order with its customer, items and payment (including unpaid ones when asked). */
export async function loadOrder(id, { includeUnpaid = false } = {}) {
  const order = await first(
    `SELECT o.*, u.name AS user_name, u.email AS user_email
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = ? ${includeUnpaid ? '' : 'AND o.awaiting_payment = 0'}`,
    [id],
  );
  if (!order) return null;
  const [items, payment] = await Promise.all([
    query(
      `SELECT oi.*, p.name AS product_name, p.image AS product_image, p.iced_image AS product_iced_image,
              (SELECT v.image FROM product_variants v WHERE v.product_id = oi.product_id AND v.size_name = oi.size_name LIMIT 1) AS variant_image
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ? ORDER BY oi.id`,
      [id],
    ),
    first('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1', [id]),
  ]);
  order.customer_name = customerName(order);
  order.customer_email = customerEmail(order);
  order.items = items.map((i) => ({ ...i, modifiers: i.modifiers ? JSON.parse(i.modifiers) : [] }));
  order.payment = payment;
  return order;
}

export async function loadOrdersFor(where, params, limit = 50) {
  const rows = await query(
    `SELECT o.id FROM orders o WHERE o.awaiting_payment = 0 AND ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ${Number(limit)}`,
    params,
  );
  return loadOrders(rows.map((r) => r.id));
}

/** Several paid orders in 3 queries (instead of 3 per order), in the order of `ids`. */
export async function loadOrders(ids) {
  if (!ids.length) return [];
  const [orders, items, payments] = await Promise.all([
    query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email
         FROM orders o LEFT JOIN users u ON u.id = o.user_id
        WHERE o.id IN (?) AND o.awaiting_payment = 0`,
      [ids],
    ),
    query(
      `SELECT oi.*, p.name AS product_name, p.image AS product_image, p.iced_image AS product_iced_image,
              (SELECT v.image FROM product_variants v WHERE v.product_id = oi.product_id AND v.size_name = oi.size_name LIMIT 1) AS variant_image
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id IN (?) ORDER BY oi.id`,
      [ids],
    ),
    query(
      `SELECT p.* FROM payments p JOIN (SELECT MAX(id) AS id FROM payments WHERE order_id IN (?) GROUP BY order_id) last ON last.id = p.id`,
      [ids],
    ),
  ]);
  const byId = new Map(orders.map((o) => [o.id, o]));
  for (const o of orders) {
    o.customer_name = customerName(o);
    o.customer_email = customerEmail(o);
    o.items = [];
    o.payment = null;
  }
  for (const i of items) byId.get(i.order_id)?.items.push({ ...i, modifiers: i.modifiers ? JSON.parse(i.modifiers) : [] });
  for (const p of payments) {
    const o = byId.get(p.order_id);
    if (o) o.payment = p;
  }
  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
}

const modifiersLabel = (mods) =>
  (mods || []).map((m) => m.name + (Number(m.price) > 0 && !m.hidden_price ? ` (+$${Number(m.price).toFixed(2)})` : '')).join(', ');

/** Same photo the customer saw in their bag: chosen colour/style, else the iced shot, else the product. */
const itemPhoto = (i) =>
  i.variant_image ??
  ((i.modifiers || []).some((m) => m.group === 'Hot or Iced' && String(m.name).toLowerCase() === 'iced') && i.product_iced_image
    ? i.product_iced_image
    : i.product_image);

export function serializeOrder(o, base) {
  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    awaiting_payment: Boolean(o.awaiting_payment),
    type: o.type,
    pickup_method: o.type === 'delivery' ? 'delivery' : o.pickup_method,
    pickup_method_label: pickupMethodLabel(o),
    vehicle_details: o.vehicle_details,
    customer_arrived_at: toIso(o.customer_arrived_at),
    delivery_address: o.delivery_address,
    shipping_service: o.shipping_service,
    customer_name: o.customer_name,
    customer_email: o.customer_email,
    phone: o.delivery_phone,
    notes: o.notes,
    subtotal: o.subtotal,
    discount_amount: o.discount_amount,
    coupon_code: o.coupon_code,
    tax: o.tax,
    delivery_fee: o.delivery_fee,
    total_amount: o.total_amount,
    created_at: toIso(o.created_at),
    updated_at: toIso(o.updated_at),
    items: o.items.map((i) => ({
      id: i.id,
      product_id: i.product_id,
      name: i.product_name ?? 'Item',
      image: imageUrl(base, itemPhoto(i)),
      size_name: i.size_name,
      modifiers_label: modifiersLabel(i.modifiers),
      quantity: i.quantity,
      price: i.price,
      total: i.total,
    })),
    payment: o.payment
      ? { method: o.payment.method, detail: o.payment.detail, status: o.payment.status, amount: o.payment.amount }
      : null,
  };
}

/**
 * Save a priced quote as an order (port of CheckoutController::createOrderFromCart).
 * Paid orders are created "awaiting payment" (hidden from the admin and the
 * customer's history) until the payment succeeds.
 */
export async function createOrder({ quote, user, guest, pickupMethod, vehicleDetails, phone, notes }) {
  const isDelivery = Boolean(quote.delivery);
  const total = quote.total;
  const awaitingPayment = total > 0;
  const now = nowUtc();
  const detail = total <= 0 ? 'Free order' : config.paymentsMode === 'test' ? 'Test payment (no charge)' : 'Credit / Debit Card';

  return transaction(async (conn) => {
    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, guest_name, guest_email, order_number, type, pickup_method, vehicle_details,
         status, awaiting_payment, delivery_address, delivery_address_parts, delivery_zip, delivery_phone,
         shipping_method, shipping_service, subtotal, delivery_fee, tax, total_amount, notes,
         loyalty_opt_in, coupon_id, discount_amount, coupon_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [
        user?.id ?? null,
        user ? null : guest.name,
        user ? null : guest.email,
        generateOrderNumber(),
        isDelivery ? 'delivery' : 'pickup',
        isDelivery ? 'in_store' : pickupMethod,
        pickupMethod === 'curbside' ? vehicleDetails : null,
        awaitingPayment ? 1 : 0,
        isDelivery ? formatAddress(quote.delivery.address) : null,
        isDelivery ? JSON.stringify(quote.delivery.address) : null,
        isDelivery ? quote.delivery.address.zip : null,
        phone ?? user?.phone ?? null,
        isDelivery ? quote.delivery.method : null,
        isDelivery ? quote.delivery.service : null,
        quote.subtotal,
        quote.deliveryFee,
        quote.tax,
        total,
        notes,
        quote.coupon?.id ?? null,
        quote.discount,
        quote.coupon?.code ?? null,
        now,
        now,
      ],
    );
    const orderId = orderResult.insertId;

    for (const line of quote.lines) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, size_name, modifiers, quantity, price, total, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, line.product_id, line.size_name, line.modifiers.length ? JSON.stringify(line.modifiers) : null,
          line.quantity, line.unit_price, line.total, now, now],
      );
    }

    await conn.query(
      `INSERT INTO payments (order_id, method, detail, status, amount, created_at, updated_at)
       VALUES (?, 'square', ?, 'pending', ?, ?, ?)`,
      [orderId, detail, total, now, now],
    );
    return orderId;
  });
}

/**
 * Mark the order paid and alert the shop — exactly once (port of OrderPayments::complete).
 */
export async function completeOrder(orderId, transactionId, squareOrderId = null) {
  const claimed = await transaction(async (conn) => {
    const [[fresh]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    // Only an order still waiting for its payment (or a fully discounted one) can be completed, once.
    if (!fresh || !(fresh.awaiting_payment || (transactionId === 'FREE_ORDER' && fresh.status === 'pending'))) return false;
    const now = nowUtc();
    await conn.query("UPDATE payments SET status = 'completed', transaction_id = ?, updated_at = ? WHERE order_id = ?", [transactionId, now, orderId]);
    await conn.query(
      "UPDATE orders SET status = 'confirmed', awaiting_payment = 0, square_order_id = ?, updated_at = ? WHERE id = ?",
      [squareOrderId, now, orderId],
    );
    if (fresh.coupon_id) await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [fresh.coupon_id]);
    return true;
  });
  if (!claimed) return;

  const order = await loadOrder(orderId);
  let message = `${order.customer_name} paid $${Number(order.total_amount).toFixed(2)} · ${pickupMethodLabel(order)}`;
  if (order.pickup_method === 'curbside' && order.type !== 'delivery' && order.vehicle_details) message += ` · ${order.vehicle_details}`;
  if (order.type === 'delivery' && order.delivery_address) message += ` · ${order.delivery_address}`;

  await notifyAdmins('NewOrderPaid', {
    kind: 'order_paid',
    title: `New paid order ${order.order_number}`,
    message,
    order_id: order.id,
    order_number: order.order_number,
    pickup_method: order.pickup_method,
    amount: Number(order.total_amount),
    url: `/admin/orders/${order.id}`,
  });

  const lines = order.items.map((i) => `  ${i.quantity} × ${i.product_name}${i.size_name ? ` (${i.size_name})` : ''}  $${Number(i.total).toFixed(2)}`);
  const receipt = [
    `Hi ${order.customer_name},`,
    '',
    `Thanks for your order! We're on it.`,
    '',
    `Order ${order.order_number} · ${pickupMethodLabel(order)}`,
    ...lines,
    '',
    `Total: $${Number(order.total_amount).toFixed(2)}`,
    '',
    `${config.store.name} · ${config.store.address} · ${config.store.phoneDisplay}`,
  ].join('\n');
  await sendMail({ to: order.customer_email, subject: `Order confirmed — ${order.order_number}`, text: receipt });
  await sendMail({ to: config.store.email, subject: `New paid order ${order.order_number}`, text: `${message}\n\n${lines.join('\n')}` });
}

/** Remove an order nobody paid for (cancelled or failed payment start). */
export async function discardUnpaid(orderId) {
  await transaction(async (conn) => {
    const [[order]] = await conn.query('SELECT id, awaiting_payment FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order || !order.awaiting_payment) return;
    await conn.query('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await conn.query('DELETE FROM payments WHERE order_id = ?', [orderId]);
    await conn.query('DELETE FROM orders WHERE id = ?', [orderId]);
  });
}

export const assertStatus = (status) => {
  if (!STATUSES.includes(status)) fail(422, 'Unknown order status.');
  return status;
};

export { money };
