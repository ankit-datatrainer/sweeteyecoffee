import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { requireAdmin } from '../lib/auth.js';
import { baseUrl } from '../lib/catalog.js';
import { fail } from '../lib/http.js';
import { loadOrder } from '../lib/orders.js';
import { createShipment, shipmentForOrder, shipmentPackages, shipmentSummary } from '../lib/ups-shipping.js';
import { upsConfigured } from '../lib/ups.js';

export const shippingRoutes = Router();
shippingRoutes.get('/admin/orders/:id/shipment', requireAdmin, async (req, res) => {
  const order = await loadOrder(Number(req.params.id));
  if (!order) fail(404, 'Order not found.');
  res
    .set('Cache-Control', 'private, no-store')
    .json({
      configured: upsConfigured(),
      environment: config.ups.environment,
      eligible:
        order.type === 'delivery' &&
        order.shipping_method === 'ups' &&
        !/test/i.test(order.payment?.detail ?? '') &&
        !['cancelled', 'delivered'].includes(order.status),
      shipment: shipmentSummary(await shipmentForOrder(order.id), baseUrl(req), true),
    });
});
shippingRoutes.post('/admin/orders/:id/shipment', requireAdmin, async (req, res) => {
  if (req.body?.confirm_purchase !== true) fail(422, 'Confirm the UPS label purchase.');
  const order = await loadOrder(Number(req.params.id));
  if (!order) fail(404, 'Order not found.');
  res
    .set('Cache-Control', 'private, no-store')
    .json({ shipment: shipmentSummary(await createShipment(order, req.body?.packages), baseUrl(req), true) });
});
shippingRoutes.get('/shipping-label/:id/:package', async (req, res) => {
  let claim;
  try {
    claim = jwt.verify(String(req.query.token ?? ''), config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    fail(403, 'This private label link has expired. Open it again from the staff dashboard.');
  }
  if (claim.kind !== 'shipping-label' || claim.sub !== req.params.id) fail(403, 'Invalid label link.');
  const row = await shipmentForOrder(Number(req.params.id));
  if (row?.status !== 'created') fail(404, 'Label not found.');
  const index = Number(req.params.package) - 1;
  if (!Number.isInteger(index) || index < 0) fail(404, 'Label not found.');
  const box = shipmentPackages(row)[index];
  if (!box) fail(404, 'Label not found.');
  res
    .set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="ups-${row.order_id}-${index + 1}.gif"`,
    })
    .send(Buffer.from(box.ShippingLabel.GraphicImage, 'base64'));
});
