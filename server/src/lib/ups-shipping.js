import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { first, query, transaction, nowUtc } from '../db.js';
import { fail } from './http.js';
import { jsonValue } from './pages.js';
import { normalizeAddress } from './pricing.js';
import { decryptRecipient, encryptRecipient, encryptionKey } from './subscription-policy.js';
import { accessToken, upsBaseUrl, upsConfigured } from './ups.js';

export function validatePackages(value) {
  if (!Array.isArray(value) || !value.length || value.length > 50) fail(422, 'Enter between 1 and 50 packages.');
  return value.map((box) => {
    const out = {};
    for (const key of ['weight', 'length', 'width', 'height']) {
      const n = Number(box?.[key]);
      if (!Number.isFinite(n) || n < (key === 'weight' ? 0.1 : 1) || n > (key === 'weight' ? 150 : 108))
        fail(422, `Package ${key} is outside UPS limits.`);
      out[key] = n;
    }
    const sides = [out.length, out.width, out.height].sort((a, b) => b - a);
    if (sides[0] + 2 * (sides[1] + sides[2]) > 165) fail(422, 'UPS length plus girth must be at most 165 inches.');
    return out;
  });
}
export const shipmentPackages = (row) => {
  if (!row?.result) return [];
  const result = decryptRecipient(row.result, config.subscriptions.encryptionKey);
  const boxes = result.ShipmentResponse?.ShipmentResults?.PackageResults ?? [];
  return Array.isArray(boxes) ? boxes : [boxes];
};
export async function shipmentForOrder(orderId) {
  return first('SELECT * FROM ups_shipments WHERE order_id = ?', [orderId]);
}
export function shipmentSummary(row, base, admin = false) {
  if (!row) return null;
  const boxes = row.status === 'created' ? shipmentPackages(row) : [];
  const token = admin
    ? jwt.sign({ kind: 'shipping-label', sub: String(row.order_id) }, config.jwtSecret, { expiresIn: '10m' })
    : null;
  return {
    status: row.status,
    shipment_number: row.shipment_number,
    tracking: boxes.map((p) => p.TrackingNumber).filter(Boolean),
    ...(admin
      ? {
          error: row.error,
          carrier_charge: row.carrier_charge,
          environment: row.environment,
          packages: jsonValue(row.packages, []),
          labels: boxes.map(
            (_, i) => `${base}/api/shipping-label/${row.order_id}/${i + 1}?token=${encodeURIComponent(token)}`,
          ),
        }
      : {}),
  };
}
export function shippingPayload(order, address, service, packages) {
  const origin = config.shipping.origin,
    account = config.ups.accountNumber;
  const sender = {
    Name: origin.name,
    Phone: { Number: config.store.phone.replace(/\D/g, '') },
    Address: {
      AddressLine: [origin.line1],
      City: origin.city,
      StateProvinceCode: origin.state,
      PostalCode: origin.zip,
      CountryCode: 'US',
    },
  };
  return {
    ShipmentRequest: {
      Request: { RequestOption: 'validate', TransactionReference: { CustomerContext: order.order_number } },
      Shipment: {
        Description: 'Roasted coffee beans',
        Shipper: { ...sender, ShipperNumber: account },
        ShipFrom: sender,
        ShipTo: {
          Name: order.customer_name.slice(0, 35),
          Phone: { Number: String(order.delivery_phone ?? '').replace(/\D/g, '') },
          Address: {
            AddressLine: [address.line1, address.line2].filter(Boolean),
            City: address.city,
            StateProvinceCode: address.state,
            PostalCode: address.zip,
            CountryCode: 'US',
            ResidentialAddressIndicator: 'Y',
          },
        },
        PaymentInformation: { ShipmentCharge: { Type: '01', BillShipper: { AccountNumber: account } } },
        Service: { Code: service },
        ShipmentRatingOptions: { NegotiatedRatesIndicator: 'Y' },
        Package: packages.map((p) => ({
          Description: 'Roasted coffee beans',
          Packaging: { Code: '02' },
          ReferenceNumber: { Value: order.order_number },
          PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: String(p.weight) },
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN' },
            Length: String(p.length),
            Width: String(p.width),
            Height: String(p.height),
          },
        })),
      },
      LabelSpecification: { LabelImageFormat: { Code: 'GIF' }, HTTPUserAgent: 'Mozilla/5.0' },
    },
  };
}
export async function createShipment(order, rawPackages, provider = null) {
  if (
    order.type !== 'delivery' ||
    order.shipping_method !== 'ups' ||
    order.awaiting_payment ||
    order.payment?.status !== 'completed' ||
    ['cancelled', 'delivered'].includes(order.status)
  )
    fail(422, 'Only a paid, active UPS shipping order can receive labels.');
  if (/test/i.test(order.payment?.detail ?? '') || /TEST subscription/i.test(order.notes ?? ''))
    fail(422, 'Test orders cannot purchase UPS labels.');
  if (order.coffee_subscription_id) {
    const sub = await first('SELECT selection FROM coffee_subscriptions WHERE id = ?', [order.coffee_subscription_id]);
    if (jsonValue(sub?.selection).test_mode) fail(422, 'Test subscription orders cannot purchase UPS labels.');
  }
  if (encryptionKey(config.subscriptions.encryptionKey).length !== 32)
    fail(503, 'Configure the shared encryption key before purchasing labels.');
  const names = { '03': 'UPS Ground', ...config.ups.services };
  const service =
    order.shipping_service_code ||
    (order.shipping_service === 'Standard Shipping'
      ? '03'
      : Object.keys(names).find((k) => names[k] === order.shipping_service));
  if (!Object.hasOwn(names, service ?? '')) fail(422, 'The selected UPS service is unknown.');
  const address = normalizeAddress(jsonValue(order.delivery_address_parts));
  const packages = validatePackages(rawPackages);
  if (!provider && !upsConfigured()) fail(503, 'UPS Shipping API is not configured.');
  const token = provider ? '' : await accessToken();
  const id = await transaction(async (conn) => {
    const [[fresh]] = await conn.query('SELECT status,awaiting_payment FROM orders WHERE id = ? FOR UPDATE', [
      order.id,
    ]);
    if (!fresh || fresh.awaiting_payment || ['cancelled', 'delivered'].includes(fresh.status))
      fail(409, 'This order is no longer available for shipping.');
    const [[existing]] = await conn.query('SELECT * FROM ups_shipments WHERE order_id = ?', [order.id]);
    if (existing && existing.status !== 'failed')
      fail(
        409,
        existing.status === 'created'
          ? 'This order already has UPS labels. Open the existing labels.'
          : 'UPS may have accepted this shipment. Check UPS history before retrying.',
      );
    const now = nowUtc();
    if (existing) {
      await conn.query(
        "UPDATE ups_shipments SET status='creating',environment=?,service_code=?,packages=?,result=NULL,error=NULL,updated_at=? WHERE id=?",
        [config.ups.environment, service, JSON.stringify(packages), now, existing.id],
      );
      return existing.id;
    }
    const [r] = await conn.query(
      "INSERT INTO ups_shipments (order_id,status,environment,service_code,packages,created_at,updated_at) VALUES (?,'creating',?,?,?,?,?)",
      [order.id, config.ups.environment, service, JSON.stringify(packages), now, now],
    );
    return r.insertId;
  });
  try {
    const payload = shippingPayload(order, address, service, packages);
    const response = provider
      ? await provider(payload)
      : await fetch(`${upsBaseUrl()}/api/shipments/v2409/ship`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            transId: crypto.randomUUID(),
            transactionSrc: 'sweeteyecoffee',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });
    const result = await response.json();
    await query('UPDATE ups_shipments SET result=?,updated_at=? WHERE id=?', [
      encryptRecipient(result, config.subscriptions.encryptionKey),
      nowUtc(),
      id,
    ]);
    const shipment = result.ShipmentResponse?.ShipmentResults;
    if (!response.ok) {
      const code = result.response?.errors?.[0]?.code;
      const rejected = response.status >= 400 && response.status < 500 && code && !shipment;
      const message = `UPS ${rejected ? 'rejected the shipment' : 'returned an uncertain result'} (HTTP ${response.status}${code ? `, code ${code}` : ''}). ${rejected ? 'Check the address, package and billing details.' : 'Check UPS history before buying another label.'}`;
      await query('UPDATE ups_shipments SET status=?,error=?,updated_at=? WHERE id=?', [
        rejected ? 'failed' : 'unknown',
        message,
        nowUtc(),
        id,
      ]);
      fail(502, message);
    }
    const boxes = Array.isArray(shipment?.PackageResults)
      ? shipment.PackageResults
      : shipment?.PackageResults
        ? [shipment.PackageResults]
        : [];
    if (
      !shipment?.ShipmentIdentificationNumber ||
      boxes.length !== packages.length ||
      boxes.some(
        (p) =>
          !p.TrackingNumber ||
          !Buffer.from(p.ShippingLabel?.GraphicImage ?? '', 'base64')
            .subarray(0, 4)
            .equals(Buffer.from('GIF8')),
      )
    )
      throw new Error('Incomplete UPS labels');
    const charge = shipment.NegotiatedRateCharges?.TotalCharge ?? shipment.ShipmentCharges?.TotalCharges ?? {};
    await query(
      "UPDATE ups_shipments SET status='created',shipment_number=?,carrier_charge=?,currency=?,label_created_at=?,updated_at=? WHERE id=?",
      [
        shipment.ShipmentIdentificationNumber,
        charge.MonetaryValue ?? null,
        charge.CurrencyCode ?? null,
        nowUtc(),
        nowUtc(),
        id,
      ],
    );
  } catch (e) {
    await query(
      "UPDATE ups_shipments SET status='unknown',error='The UPS result is uncertain. Check UPS shipment history before buying another label.',updated_at=? WHERE id=? AND status='creating'",
      [nowUtc(), id],
    );
    const row = await first('SELECT error FROM ups_shipments WHERE id=?', [id]);
    fail(502, row?.error ?? 'Check UPS history before retrying shipment creation.');
  }
  return shipmentForOrder(order.id);
}
