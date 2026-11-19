import { Router } from 'express';
import { query, first, nowUtc, toIso } from '../db.js';
import { fail, requireString } from '../lib/http.js';
import { baseUrl } from '../lib/catalog.js';
import { requireAdmin } from '../lib/auth.js';
import { assertStatus, loadOrder, loadOrdersFor, serializeOrder, pickupMethodLabel } from '../lib/orders.js';
import { sendMail } from '../lib/mail.js';
import { config } from '../config.js';
import { displayTimezone } from '../lib/store.js';
import { serializeTicket } from './orders.js';

/** Staff tools inside the app: live order queue, status updates, sold-out switches. */
export const adminRoutes = Router();
adminRoutes.use('/admin', requireAdmin);

adminRoutes.get('/admin/summary', async (_req, res) => {
  // "Today" in the shop's timezone, as a UTC range.
  const tz = await displayTimezone();
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

const ticketStatuses = ['open', 'in_progress', 'resolved', 'closed'];
const inboxCursor = (req) => {
  const before = req.query.before ? Number(req.query.before) : null;
  if (before !== null && (!Number.isSafeInteger(before) || before <= 0)) fail(422, 'Invalid inbox cursor.');
  return before;
};

adminRoutes.get('/admin/tickets', async (req, res) => {
  const before = inboxCursor(req);
  const rows = await query(
    `SELECT t.*, u.name AS customer_name, u.email AS customer_email FROM support_tickets t
       JOIN users u ON u.id = t.user_id ${before ? 'WHERE t.id < ?' : ''} ORDER BY t.id DESC LIMIT 50`,
    before ? [before] : [],
  );
  res.json({ tickets: rows.map((t) => ({ ...serializeTicket(t), customer_name: t.customer_name, customer_email: t.customer_email })) });
});

adminRoutes.patch('/admin/tickets/:id', async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!ticketStatuses.includes(status)) fail(422, 'Please choose a ticket status.');
  const response = requireString(req.body?.admin_response, 'Please enter a response.', 5000);
  const now = nowUtc();
  const result = await query(
    'UPDATE support_tickets SET status = ?, admin_response = ?, responded_at = ?, updated_at = ? WHERE id = ?',
    [status, response, now, now, id],
  );
  if (!result.affectedRows) fail(404, 'Support ticket not found.');
  res.json({ message: 'Response saved.' });
});

adminRoutes.get('/admin/contact-messages', async (req, res) => {
  const before = inboxCursor(req);
  const rows = await query(
    `SELECT id, name, email, phone, message, is_read, created_at FROM contact_messages
       ${before ? 'WHERE id < ?' : ''} ORDER BY id DESC LIMIT 50`, before ? [before] : [],
  );
  res.json({ messages: rows.map((m) => ({ ...m, is_read: Boolean(m.is_read), created_at: toIso(m.created_at) })) });
});

adminRoutes.patch('/admin/contact-messages/:id/read', async (req, res) => {
  const result = await query('UPDATE contact_messages SET is_read = 1, updated_at = ? WHERE id = ?', [nowUtc(), Number(req.params.id)]);
  if (!result.affectedRows) fail(404, 'Contact message not found.');
  res.json({ ok: true });
});
