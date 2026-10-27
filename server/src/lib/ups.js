import crypto from 'node:crypto';
import { config } from '../config.js';

/** Live UPS rates for coffee-bean shipping — a port of the website's UpsRatingService. Quotes only. */
export const upsConfigured = () => Boolean(config.ups.clientId && config.ups.clientSecret && config.ups.accountNumber);

const baseUrl = () => (config.ups.environment === 'sandbox' ? 'https://wwwcie.ups.com' : 'https://onlinetools.ups.com');
let cachedToken = null;

async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  const res = await fetch(`${baseUrl()}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-merchant-id': config.ups.accountNumber,
      Authorization: `Basic ${Buffer.from(`${config.ups.clientId}:${config.ups.clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`UPS sign-in failed (${res.status})`);
  cachedToken = { value: json.access_token, expires: Date.now() + Math.max(60, Number(json.expires_in ?? 3600) - 120) * 1000 };
  return cachedToken.value;
}

/** Faster UPS services with prices for this address, cheapest first, or [] when UPS can't quote. */
export async function upsRates(address, packageWeights) {
  if (!upsConfigured()) return [];
  try {
    const token = await accessToken();
    const { origin } = config.shipping;
    const account = config.ups.accountNumber;
    const from = { AddressLine: [origin.line1], City: origin.city, StateProvinceCode: origin.state, PostalCode: origin.zip, CountryCode: 'US' };
    const packages = packageWeights.map((lbs) => ({
      PackagingType: { Code: '02', Description: 'Package' },
      PackageWeight: { UnitOfMeasurement: { Code: 'LBS', Description: 'Pounds' }, Weight: String(Math.max(1, Math.ceil(lbs))) },
    }));
    const res = await fetch(`${baseUrl()}/api/rating/v2403/Shop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', transId: crypto.randomUUID(), transactionSrc: 'sweeteyecoffee' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        RateRequest: {
          Request: { TransactionReference: { CustomerContext: 'Sweet Eye Coffee app checkout' } },
          Shipment: {
            Shipper: { Name: origin.name, ShipperNumber: account, Address: from },
            ShipFrom: { Name: origin.name, Address: from },
            ShipTo: {
              Name: 'Customer',
              Address: {
                AddressLine: [address.line1, address.line2].filter(Boolean),
                City: address.city,
                StateProvinceCode: address.state,
                PostalCode: address.zip,
                CountryCode: 'US',
                ResidentialAddressIndicator: 'Y',
              },
            },
            PaymentDetails: { ShipmentCharge: [{ Type: '01', BillShipper: { AccountNumber: account } }] },
            ShipmentRatingOptions: { NegotiatedRatesIndicator: 'Y' },
            NumOfPieces: String(packages.length),
            Package: packages,
          },
        },
      }),
    });
    if (!res.ok) {
      console.warn('UPS rating failed', res.status, (await res.text()).slice(0, 300));
      return [];
    }
    const json = await res.json();
    let rated = json?.RateResponse?.RatedShipment ?? [];
    if (!Array.isArray(rated)) rated = [rated]; // one service comes back as an object
    return rated
      .map((s) => {
        const code = s?.Service?.Code;
        const amount = s?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue ?? s?.TotalCharges?.MonetaryValue;
        if (!config.ups.services[code] || amount == null) return null;
        const days = s?.GuaranteedDelivery?.BusinessDaysInTransit;
        return {
          code: String(code),
          name: config.ups.services[code],
          price: Math.round((Number(amount) + config.ups.handlingFee) * 100) / 100,
          days: days != null ? Number(days) : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.price - b.price);
  } catch (error) {
    console.warn('UPS rating error:', error.message);
    return [];
  }
}

/** Bag weight in lb (12oz = 0.75 lb) split into boxes UPS accepts — same as the website. */
export function packageWeights(lines) {
  const weightOf = (size) => {
    const m = String(size ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*(lbs?|oz)\s*$/i);
    if (!m) return 1;
    return m[2].toLowerCase() === 'oz' ? Number(m[1]) / 16 : Number(m[1]);
  };
  const total = lines.reduce((sum, l) => sum + weightOf(l.size_name) * l.quantity, 0) + config.shipping.packagingLbs;
  const boxes = Math.max(1, Math.ceil(total / config.shipping.maxPackageLbs));
  return Array(boxes).fill(Math.round((total / boxes) * 100) / 100);
}
