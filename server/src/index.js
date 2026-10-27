import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError } from './lib/http.js';
import { attachUser, requireAdmin } from './lib/auth.js';
import { serveImage, warmImageCache } from './lib/images.js';
import { LIMITS, apiLimit, stripeReturnLimit } from './lib/limits.js';
import { catalogRoutes } from './routes/catalog.js';
import { authRoutes } from './routes/auth.js';
import { checkoutRoutes, stripeWebhook } from './routes/checkout.js';
import { orderRoutes } from './routes/orders.js';
import { adminRoutes } from './routes/admin.js';
import { adminCatalogRoutes } from './routes/admin-catalog.js';

const app = express();
// Only nginx on this machine may tell us the visitor's real IP / https.
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

// Security headers. The CSP allows the Square card form (web) and nothing else from outside.
const SQUARE = ['https://*.squarecdn.com', 'https://*.squareup.com', 'https://*.squareupsandbox.com', 'https://*.cardinalcommerce.com'];
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", ...SQUARE],
        styleSrc: ["'self'", "'unsafe-inline'", ...SQUARE],
        imgSrc: ["'self'", 'data:', 'blob:', ...SQUARE],
        fontSrc: ["'self'", 'data:', ...SQUARE, 'https://d1g145x70srn7h.cloudfront.net'], // Square's card-form font
        connectSrc: ["'self'", ...SQUARE, 'https://pci-connect.squareup.com'],
        frameSrc: SQUARE,
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'https://checkout.stripe.com'],
        frameAncestors: ["'none'"],
        ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    // Photos are loaded by the phone apps and the web app; let them be embedded.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    strictTransportSecurity: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  }),
);

// The web app lives on PUBLIC_URL; the phone apps send no Origin header at all.
// Locally (Expo dev server on :8081) any origin is fine.
app.use(
  cors(
    config.isProduction
      ? { origin: [config.publicUrl, config.publicUrl.replace('://', '://www.')], maxAge: 86400 }
      : undefined,
  ),
);
app.use(compression());

// Stripe signs the raw body, so the webhook reads it before JSON parsing.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhook);
// Staff routes accept photo uploads (base64): check the staff login before reading a big body.
app.use('/api/admin', attachUser, requireAdmin, express.json({ limit: '8mb' }));
app.use(express.json({ limit: '200kb' }));

// Rate limits (after parsing, so sign-in / reset can also be limited per email).
app.use('/api', apiLimit);
app.get('/api/stripe/return', stripeReturnLimit);
for (const [route, limiters] of Object.entries(LIMITS)) app.post(route, ...limiters);

// Menu photos: resized WebP for ?w=…, otherwise the original file with its true content type.
app.use('/images', serveImage, (_req, res) => res.status(404).json({ message: 'Image not found.' }));

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, payments_mode: config.paymentsMode });
});

app.use('/api', attachUser, catalogRoutes, authRoutes, checkoutRoutes, orderRoutes, adminRoutes, adminCatalogRoutes);

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found.' }));

// The web app (mobile/dist, built with `npm --prefix mobile run build:web`).
// Hashed bundles are cached for a year; index.html is always re-checked.
const webIndex = path.join(config.webDir, 'index.html');
if (fs.existsSync(webIndex)) {
  app.use(
    express.static(config.webDir, {
      index: false,
      setHeaders: (res, file) => {
        res.set('Cache-Control', file.includes(`${path.sep}_expo${path.sep}`) || file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  // Every other address is a screen of the single-page app (e.g. /menu, /order/12).
  app.get(/^\/(?!api\/|images\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(webIndex);
  });
}

// Express 5 forwards rejected promises here.
app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message, ...error.extra });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed request.' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'That upload is too large.' });
  }
  if (error?.status === 404 || error?.statusCode === 404) {
    return res.status(404).json({ message: 'Not found.' });
  }
  console.error(error);
  res.status(500).json({ message: 'Something went wrong on our side. Please try again.' });
});

const lanAddresses = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

// In production only nginx (same machine) talks to Node; locally phones on the Wi-Fi need it.
const host = config.isProduction ? '127.0.0.1' : '0.0.0.0';
app.listen(config.port, host, async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`☕ Sweet Eye API connected to MySQL ${config.db.host}:${config.db.port}/${config.db.database}`);
  } catch (error) {
    console.error(`⚠️  Cannot reach MySQL at ${config.db.host}:${config.db.port} — is MySQL running?`, error.message);
  }
  console.log(`   Mode: ${config.isProduction ? `PRODUCTION (${config.publicUrl})` : 'development'} · payments ${config.paymentsMode.toUpperCase()}${config.paymentsMode === 'test' ? ' (no cards are charged)' : ''}`);
  console.log(`   Web app: ${fs.existsSync(webIndex) ? `serving ${config.webDir}` : 'not built (npm --prefix mobile run build:web)'}`);
  console.log(`   Local:   http://localhost:${config.port}/api/health`);
  if (!config.isProduction) for (const ip of lanAddresses()) console.log(`   Network: http://${ip}:${config.port}/api/health`);
  warmImageCache()
    .then(({ photos, built }) => built && console.log(`   Photos: prepared ${built} phone-sized copies of ${photos} images`))
    .catch((error) => console.error('Photo cache warm-up failed:', error.message));
});
