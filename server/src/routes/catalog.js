import { Router } from 'express';
import { config } from '../config.js';
import { fail } from '../lib/http.js';
import { baseUrl, priceLine, productById, serializeCategory, serializeProduct, visibleProducts, imageUrl } from '../lib/catalog.js';
import { storeStatus, storeHours, hoursDisplay, taxRate, curbsideEnabled } from '../lib/store.js';
import { shippingSettings } from '../lib/pricing.js';
import { squareConfigured } from '../lib/square.js';
import { enabledStripeMethods } from '../lib/stripe.js';

export const catalogRoutes = Router();

/** Shop details, opening status and checkout settings. */
catalogRoutes.get('/store', async (req, res) => {
  const base = baseUrl(req);
  const shipping = await shippingSettings();
  const hours = await storeHours();
  const { store, square, paymentsMode } = config;
  res.json({
    name: store.name,
    address: store.address,
    address_short: store.addressShort,
    phone: store.phone,
    phone_display: store.phoneDisplay,
    email: store.email,
    timezone: store.timezone,
    hours: hoursDisplay(hours),
    status: storeStatus(new Date(), hours),
    directions_url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`Sweet Eye Coffee, ${store.address}`)}`,
    tax_rate: await taxRate(),
    curbside_enabled: await curbsideEnabled(),
    local_delivery_fee: shipping.localFee,
    standard_shipping_rate: shipping.standardRate,
    logo: imageUrl(base, 'logo_header.png'),
    logo_large: imageUrl(base, 'logo_home.png'),
    gallery: ['IMG_1801.jpg', 'IMG_1849.jpg', 'IMG_1852.jpg', 'IMG_1892.jpg', 'IMG_1899.jpg', 'IMG_1917.jpg', 'IMG_1924.jpg', 'IMG_1994.jpg', 'IMG_2008.jpg']
      .map((f) => imageUrl(base, `gallery/${f}`))
      .filter(Boolean),
    payments: {
      mode: paymentsMode,
      card_enabled: paymentsMode === 'test' || squareConfigured(),
      // Stripe's hosted page, one method at a time: apple_pay, google_pay, cashapp, amazon_pay (live only).
      stripe_methods: paymentsMode === 'live' ? await enabledStripeMethods() : [],
      square: paymentsMode === 'live'
        ? { application_id: square.applicationId, location_id: square.locationId, environment: square.environment }
        : null,
    },
  });
});

/** The whole visible menu in one call: categories + products with sizes and drink options. */
catalogRoutes.get('/catalog', async (req, res) => {
  const base = baseUrl(req);
  const { categories, products } = await visibleProducts();
  res.json({
    categories: categories.map((c) => serializeCategory(c, base)),
    products: products.map((p) => serializeProduct(p, base)),
  });
});

catalogRoutes.get('/products/:id', async (req, res) => {
  const product = await productById(Number(req.params.id));
  if (!product || !product.is_available) fail(404, 'That item is no longer on the menu.');
  res.json({ product: serializeProduct(product, baseUrl(req)) });
});

/** Validate + price one cart line before it goes into the app's cart. */
catalogRoutes.post('/cart/line', async (req, res) => {
  const base = baseUrl(req);
  const line = await priceLine(req.body ?? {});
  res.json({
    line: {
      key: line.key,
      product_id: line.product_id,
      name: line.name,
      image: imageUrl(base, line.image_path) ?? imageUrl(base, line.product.image),
      size_name: line.size_name,
      modifiers: line.modifiers.map((m) => m.id),
      modifiers_label: line.modifiers_label,
      unit_price: line.unit_price,
      quantity: line.quantity,
      is_beans: line.product.category_slug === 'coffee-beans',
    },
    message: `${line.name}${line.size_name ? ` (${line.size_name})` : ''} added to cart!`,
  });
});
