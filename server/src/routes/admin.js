import { Router } from 'express';
import { query, first, nowUtc } from '../db.js';
import { fail } from '../lib/http.js';
import { baseUrl } from '../lib/catalog.js';
import { requireAdmin } from '../lib/auth.js';
import { assertStatus, loadOrder, loadOrdersFor, serializeOrder, pickupMethodLabel } from '../lib/orders.js';
import { sendMail } from '../lib/mail.js';
import { config } from '../config.js';

/** Staff tools inside the app: live order queue, status updates, sold-out switches. */
export const adminRoutes = Router();
adminRoutes.use('/admin', requireAdmin);

adminRoutes.get('/admin/summary', async (_req, res) => {
  // "Today" in the shop's timezone, as a UTC range.
  const tz = config.store.timezone;
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const offsetMs = now.getTime() - local.getTime();
  const startLocal = new Date(local.getFullYear(), local.getMonth(), local.getDate());
  const startUtc = new Date(startLocal.getTime() + offsetMs).toISOString().slice(0, 19).replace('T', ' ');

  const [today, active, totals] = await Promise.all([
    first(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_amount END), 0) AS revenue
         FROM orders WHERE awaiting_payment = 0 AND created_at >= ?`,
      [startUtc],
    ),
    first("SELECT COUNT(*) AS n FROM orders WHERE awaiting_payment = 0 AND status IN ('pending','confirmed','preparing','ready','out_for_delivery')"),
    first("SELECT COUNT(*) AS customers FROM users WHERE role = 'customer'"),
  ]);
  res.json({
    today_orders: today.orders,
    today_revenue: Number(today.revenue),
    active_orders: active.n,
    customers: totals.customers,
  });
});

adminRoutes.get('/admin/orders', async (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const filter = status === 'active'
    ? "o.status IN ('pending','confirmed','preparing','ready','out_for_delivery')"
    : status ? 'o.status = ?' : '1 = 1';
  const orders = await loadOrdersFor(filter, status && status !== 'active' ? [assertStatus(status)] : [], 100);
  res.json({ orders: orders.map((o) => serializeOrder(o, baseUrl(req))) });
});

adminRoutes.get('/admin/orders/:id', async (req, res) => {
  const order = await loadOrder(Number(req.params.id));
  if (!order) fail(404, 'Order not found.');
  res.json({ order: serializeOrder(order, baseUrl(req)) });
});

const STATUS_EMAIL = {
  ready: 'is ready for pickup',
  out_for_delivery: 'is on its way',
  delivered: 'has been delivered',
  cancelled: 'has been cancelled',
};

adminRoutes.patch('/admin/orders/:id/status', async (req, res) => {
  const order = await loadOrder(Number(req.params.id));
  if (!order) fail(404, 'Order not found.');
  const status = assertStatus(String(req.body?.status ?? ''));
  const changed = order.status !== status;
  const now = nowUtc();

  await query('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', [status, now, order.id]);
  if (status === 'delivered') await query("UPDATE payments SET status = 'completed', updated_at = ? WHERE order_id = ?", [now, order.id]);

  if (changed && STATUS_EMAIL[status] && order.customer_email) {
    const what = order.type === 'delivery' && status === 'ready' ? 'is packed and ready to ship' : STATUS_EMAIL[status];
    await sendMail({
      to: order.customer_email,
      subject: `Your order ${order.order_number} ${what}`,
      text: `Hi ${order.customer_name},\n\nYour order ${order.order_number} (${pickupMethodLabel(order)}) ${what}.\n\n${config.store.name} · ${config.store.phoneDisplay}`,
    });
  }
  res.json({ order: serializeOrder(await loadOrder(order.id), baseUrl(req)) });
});

adminRoutes.patch('/admin/products/:id', async (req, res) => {
  const product = await first('SELECT id FROM products WHERE id = ?', [Number(req.params.id)]);
  if (!product) fail(404, 'Product not found.');
  const updates = [];
  const params = [];
  for (const field of ['is_sold_out', 'is_available', 'is_featured']) {
    if (typeof req.body?.[field] === 'boolean') {
      updates.push(`${field} = ?`);
      params.push(req.body[field] ? 1 : 0);
    }
  }
  if (!updates.length) fail(422, 'Nothing to update.');
  await query(`UPDATE products SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, [...params, nowUtc(), product.id]);
  res.json({ ok: true });
});
