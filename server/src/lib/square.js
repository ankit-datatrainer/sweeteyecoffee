import crypto from 'node:crypto';
import { config } from '../config.js';

const API = () =>
  config.square.environment === 'production' ? 'https://connect.squareup.com/v2' : 'https://connect.squareupsandbox.com/v2';

export const squareConfigured = () => Boolean(config.square.accessToken && config.square.locationId);

async function squareRequest(method, path, body) {
  const res = await fetch(`${API()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.square.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = (json.errors || []).map((e) => e.detail || e.code).filter(Boolean);
    const error = new Error(errors.join(' ') || `Square request failed (${res.status}).`);
    error.squareErrors = errors;
    throw error;
  }
  return json;
}

/** Same scheme as SquareService::idempotencyKey — unique per order + card token (max 45 chars). */
const idempotencyKey = (purpose, order, sourceId) =>
  `${purpose}-${crypto.createHash('sha256').update(['sweet-eye-app', order.id, order.order_number, sourceId].join('|')).digest('hex').slice(0, 38)}`;

const cents = (amount) => Math.round(Number(amount) * 100);
const moneyObj = (amount) => ({ amount: cents(amount), currency: config.square.currency });

/** Read-only check that the Square credentials work (no charge). */
export async function squareLocation() {
  const json = await squareRequest('GET', `/locations/${config.square.locationId}`);
  return json.location;
}

/**
 * Charge a card token from the Square Web Payments SDK for an order — a port
 * of SquareService::chargeOrder: creates the Square order (POS ticket with
 * items, options, tax, discount, fulfilment) then takes the payment.
 */
export async function chargeOrder(order, items, sourceId, taxRatePercent, externalSource = null) {
  if (!squareConfigured()) return { success: false, errors: ['Square gateway is not configured.'] };
  const amount = cents(order.total_amount);
  if (amount <= 0) return { success: false, errors: ['Order total must be greater than zero.'] };

  const lineItems = items.map((item) => {
    const modifiers = (item.modifiers || []).map((m) => ({
      name: m.name,
      base_price_money: moneyObj(m.hidden_price ? 0 : m.price),
    }));
    const modifierCents = modifiers.reduce((sum, m) => sum + m.base_price_money.amount, 0);
    return {
      name: item.product_name + (item.size_name ? ` (${item.size_name})` : ''),
      quantity: String(item.quantity),
      base_price_money: { amount: cents(item.price) - modifierCents, currency: config.square.currency },
      ...(modifiers.length ? { modifiers } : {}),
    };
  });

  const isDelivery = order.type === 'delivery';
  const isUps = isDelivery && order.shipping_method === 'ups';
  const isCurbside = !isDelivery && order.pickup_method === 'curbside';
  const prefix = isDelivery ? (isUps ? 'UPS SHIP - ' : 'DELIVERY - ') : isCurbside ? 'CURBSIDE - ' : 'IN-STORE - ';

  const recipient = {
    display_name: order.customer_name,
    ...(order.customer_email ? { email_address: order.customer_email } : {}),
    ...(order.delivery_phone ? { phone_number: order.delivery_phone } : {}),
  };

  const squareOrder = {
    location_id: config.square.locationId,
    reference_id: order.order_number,
    source: { name: 'Sweet Eye Coffee App' },
    ticket_name: (prefix + order.customer_name).slice(0, 30),
    line_items: lineItems,
  };

  if (Number(order.tax) > 0) {
    squareOrder.taxes = [{ name: 'Sales Tax', type: 'ADDITIVE', percentage: String(taxRatePercent), scope: 'ORDER' }];
  }
  if (Number(order.discount_amount) > 0) {
    squareOrder.discounts = [{
      name: order.coupon_code ? `Coupon: ${order.coupon_code}` : 'Discount',
      amount_money: moneyObj(order.discount_amount),
      scope: 'ORDER',
    }];
  }

  const note = (text) => (text + (order.notes ? ` | ${order.notes}` : '')).slice(0, 500);

  if (isDelivery) {
    if (Number(order.delivery_fee) > 0) {
      squareOrder.service_charges = [{
        name: isUps ? `Shipping (${order.shipping_service || 'UPS'})` : 'Local Delivery',
        amount_money: moneyObj(order.delivery_fee),
        calculation_phase: 'TOTAL_PHASE',
        taxable: false,
      }];
    }
    const a = order.delivery_address_parts ? JSON.parse(order.delivery_address_parts) : null;
    if (a) {
      recipient.address = {
        address_line_1: a.line1,
        ...(a.line2 ? { address_line_2: a.line2 } : {}),
        locality: a.city,
        administrative_district_level_1: a.state,
        postal_code: a.zip,
        country: 'US',
      };
    }
    squareOrder.fulfillments = [{
      type: 'SHIPMENT',
      state: 'PROPOSED',
      shipment_details: {
        recipient,
        carrier: isUps ? 'UPS' : 'Local Delivery (Sweet Eye)',
        shipping_type: order.shipping_service || (isUps ? 'UPS Ground' : 'Local Delivery'),
        shipping_note: note(`${isUps ? 'SHIP VIA UPS' : 'LOCAL DELIVERY'} to ${order.delivery_address}`),
      },
    }];
  } else {
    squareOrder.fulfillments = [{
      type: 'PICKUP',
      state: 'PROPOSED',
      pickup_details: {
        recipient,
        schedule_type: 'ASAP',
        is_curbside_pickup: isCurbside,
        ...(isCurbside ? { curbside_pickup_details: { curbside_details: order.vehicle_details || 'Vehicle details not provided' } } : {}),
        note: isCurbside
          ? note(`CURBSIDE PICKUP - bring order to car: ${order.vehicle_details || 'ask customer'}`)
          : note('IN-STORE PICKUP - customer collects at counter'),
      },
    }];
  }

  try {
    const created = await squareRequest('POST', '/orders', {
      idempotency_key: idempotencyKey('order', order, sourceId),
      order: squareOrder,
    });
    const squareOrderId = created.order.id;

    const paid = await squareRequest('POST', '/payments', {
      // Paid on Stripe already: record it in Square (no card is charged) so it shows on the POS.
      source_id: externalSource ? 'EXTERNAL' : sourceId,
      ...(externalSource ? { external_details: { type: 'OTHER', source: externalSource, source_id: sourceId } } : {}),
      idempotency_key: idempotencyKey('pay', order, sourceId),
      amount_money: { amount, currency: config.square.currency },
      order_id: squareOrderId,
      location_id: config.square.locationId,
      reference_id: order.order_number,
      note: `Sweet Eye Coffee order ${order.order_number}`,
    });
    const payment = paid.payment;
    if (!payment || payment.status !== 'COMPLETED') {
      return { success: false, errors: [`Payment was not completed (status: ${payment?.status ?? 'unknown'}).`] };
    }
    return { success: true, payment_id: payment.id, square_order_id: squareOrderId };
  } catch (error) {
    console.error('Square charge failed:', error.message);
    return { success: false, errors: error.squareErrors?.length ? error.squareErrors : ['Payment was declined.'] };
  }
}
