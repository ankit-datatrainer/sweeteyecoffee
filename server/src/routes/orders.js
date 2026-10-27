import { Router } from 'express';
import { query, first, nowUtc } from '../db.js';
import { fail, requireString } from '../lib/http.js';
import { baseUrl } from '../lib/catalog.js';
import { requireUser, verifyOrderToken } from '../lib/auth.js';
import { loadOrder, loadOrders, loadOrdersFor, serializeOrder } from '../lib/orders.js';
import { notifyAdmins } from '../lib/notify.js';
import { sendMail } from '../lib/mail.js';
import { config } from '../config.js';

export const orderRoutes = Router();

/** Signed-in customer's order history. */
orderRoutes.get('/orders', requireUser, async (req, res) => {
  const orders = await loadOrdersFor('o.user_id = ?', [req.user.id]);
  res.json({ orders: orders.map((o) => serializeOrder(o, baseUrl(req))) });
});

/** Guest orders this device placed (it keeps one order token per order). */
orderRoutes.post('/orders/lookup', async (req, res) => {
  const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens.slice(0, 50) : [];
  const ids = tokens.filter((t) => t && verifyOrderToken(t.token, t.id)).map((t) => Number(t.id));
  const found = await loadOrders(ids);
  found.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  res.json({ orders: found.map((o) => serializeOrder(o, baseUrl(req))) });
});

async function viewableOrder(req) {
  const order = await loadOrder(Number(req.params.id));
  if (!order) fail(404, 'We could not find that order.');
  const owner = order.user_id !== null && req.user?.id === order.user_id;
  const guestToken = order.user_id === null && verifyOrderToken(req.get('x-order-token'), order.id);
  if (!owner && !guestToken) fail(403, 'You cannot access this order.');
  return order;
}

orderRoutes.get('/orders/:id', async (req, res) => {
  res.json({ order: serializeOrder(await viewableOrder(req), baseUrl(req)) });
});

/** Curbside "I'm Here" — alert the team (port of OrderController::arrived). */
orderRoutes.post('/orders/:id/arrived', async (req, res) => {
  const order = await viewableOrder(req);
  if (order.type === 'delivery' || order.pickup_method !== 'curbside' || ['delivered', 'cancelled'].includes(order.status)) {
    fail(422, 'This order is not waiting for curbside pickup.');
  }
  if (!order.customer_arrived_at) {
    await query('UPDATE orders SET customer_arrived_at = ?, updated_at = ? WHERE id = ?', [nowUtc(), nowUtc(), order.id]);
    await notifyAdmins('CurbsideCustomerArrived', {
      kind: 'curbside_arrived',
      title: `Customer is outside — ${order.order_number}`,
      message: `${order.customer_name} has arrived for curbside pickup${order.vehicle_details ? ` · ${order.vehicle_details}` : ''}`,
      order_id: order.id,
      order_number: order.order_number,
      pickup_method: order.pickup_method,
      url: `/admin/orders/${order.id}`,
    });
  }
  res.json({
    message: "Thanks! We've let the team know you're here — we'll bring your order right out.",
    order: serializeOrder(await loadOrder(order.id), baseUrl(req)),
  });
});

// ── Account dashboard, support tickets & contact form ───────────────────────

orderRoutes.get('/account/summary', requireUser, async (req, res) => {
  const [stats, tickets] = await Promise.all([
    first(
      `SELECT COUNT(*) AS total_orders, COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_amount END), 0) AS total_spent
         FROM orders WHERE user_id = ? AND awaiting_payment = 0`,
      [req.user.id],
    ),
    first("SELECT COUNT(*) AS open FROM support_tickets WHERE user_id = ? AND status IN ('open','in_progress')", [req.user.id]),
  ]);
  res.json({ total_orders: stats.total_orders, total_spent: Number(stats.total_spent), open_tickets: tickets.open });
});

const serializeTicket = (t) => ({
  id: t.id,
  ticket_number: t.ticket_number,
  subject: t.subject,
  message: t.message,
  status: t.status,
  priority: t.priority,
  admin_response: t.admin_response,
  responded_at: t.responded_at ? `${t.responded_at.replace(' ', 'T')}Z` : null,
  created_at: `${t.created_at.replace(' ', 'T')}Z`,
});

orderRoutes.get('/tickets', requireUser, async (req, res) => {
  const rows = await query('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100', [req.user.id]);
  res.json({ tickets: rows.map(serializeTicket) });
});

orderRoutes.get('/tickets/:id', requireUser, async (req, res) => {
  const ticket = await first('SELECT * FROM support_tickets WHERE id = ?', [Number(req.params.id)]);
  if (!ticket || ticket.user_id !== req.user.id) fail(404, 'We could not find that ticket.');
  res.json({ ticket: serializeTicket(ticket) });
});

orderRoutes.post('/tickets', requireUser, async (req, res) => {
  const subject = requireString(req.body?.subject, 'Please enter a subject.');
  const message = requireString(req.body?.message, 'Please describe how we can help.', 5000);
  const priority = req.body?.priority ?? 'medium';
  if (!['low', 'medium', 'high'].includes(priority)) fail(422, 'Please choose a priority.');

  const now = nowUtc();
  const number = `TKT-${(Math.floor(Date.now() / 1000).toString(16) + Math.floor(Math.random() * 0xfffff).toString(16).padStart(5, '0')).toUpperCase()}`;
  const result = await query(
    `INSERT INTO support_tickets (user_id, ticket_number, subject, message, status, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
    [req.user.id, number, subject, message, priority, now, now],
  );
  await notifyAdmins('NewSupportTicket', {
    kind: 'support_ticket',
    title: `New support ticket — ${subject}`,
    message: `${req.user.name} · ${priority[0].toUpperCase()}${priority.slice(1)} priority · ${message.slice(0, 80)}`,
    url: `/admin/tickets/${result.insertId}`,
  });
  await sendMail({ to: config.store.email, subject: `New support ticket — ${subject}`, text: `${req.user.name} (${req.user.email})\n\n${message}` });
  const ticket = await first('SELECT * FROM support_tickets WHERE id = ?', [result.insertId]);
  res.status(201).json({ ticket: serializeTicket(ticket), message: 'Support ticket created successfully!' });
});

orderRoutes.post('/contact', async (req, res) => {
  const name = requireString(req.body?.name, 'Please enter your name.');
  const email = requireString(req.body?.email, 'Please enter your email.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail(422, 'Please enter a valid email address.');
  const phone = req.body?.phone ? String(req.body.phone).trim().slice(0, 20) : null;
  const message = requireString(req.body?.message, 'Please enter a message.', 5000);

  const now = nowUtc();
  await query(
    'INSERT INTO contact_messages (name, email, phone, message, is_read, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [name, email, phone, message, now, now],
  );
  await sendMail({
    to: config.store.email,
    replyTo: email,
    subject: `New Contact Message from ${name}`,
    text: `New contact message from ${name}\n\nEmail: ${email}\nPhone: ${phone ?? ''}\n\nMessage:\n${message}`,
  });
  res.status(201).json({ message: "Your message has been sent! We'll get back to you soon." });
});
