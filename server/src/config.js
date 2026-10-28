import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Always server/.env, whatever folder the API is started from.
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const env = (key, fallback = '') => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

const nodeEnv = env('NODE_ENV', 'development');

export const config = {
  port: Number(env('PORT', 4000)),
  isProduction: nodeEnv === 'production',
  // The public address in production (https://yourdomain.com). Used for photo
  // links and Stripe return pages, and to lock the API to the web app's origin.
  publicUrl: env('PUBLIC_URL').replace(/\/+$/, ''),
  // Built web app (npm --prefix mobile run build:web) — served for every non-API address.
  webDir: path.resolve(root, env('WEB_DIR', '../mobile/dist')),
  appName: env('APP_NAME', 'Sweet Eye Coffee Roasters'),
  publicDir: path.join(root, 'public'),
  imagesDir: path.join(root, 'public', 'images'),

  db: {
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', 3306)),
    database: env('DB_DATABASE', 'sweet_eye_coffee'),
    user: env('DB_USERNAME', 'root'),
    password: env('DB_PASSWORD', ''),
    // DB_SSL=true encrypts the connection — use it when the database is on another server (Hostinger Remote MySQL).
    ...(env('DB_SSL', 'false') === 'true' ? { ssl: { rejectUnauthorized: env('DB_SSL_VERIFY', 'true') !== 'false' } } : {}),
  },

  jwtSecret: env('JWT_SECRET', ''),

  // "test" = orders complete without charging a card; "live" = Square charges real cards.
  paymentsMode: env('PAYMENTS_MODE', 'test') === 'live' ? 'live' : 'test',

  square: {
    accessToken: env('SQUARE_ACCESS_TOKEN'),
    applicationId: env('SQUARE_APPLICATION_ID'),
    locationId: env('SQUARE_LOCATION_ID'),
    environment: env('SQUARE_ENVIRONMENT', 'sandbox') === 'production' ? 'production' : 'sandbox',
    currency: 'USD',
  },

  // Stripe hosted checkout: cards, Apple Pay, Google Pay, Cash App Pay (same account as the website).
  stripe: {
    secret: env('STRIPE_SECRET'),
    publishableKey: env('STRIPE_KEY'),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
  },

  // UPS live rates for faster coffee-bean shipping (read-only quotes).
  ups: {
    clientId: env('UPS_CLIENT_ID'),
    clientSecret: env('UPS_CLIENT_SECRET'),
    accountNumber: env('UPS_ACCOUNT_NUMBER'),
    environment: env('UPS_ENVIRONMENT', 'production') === 'sandbox' ? 'sandbox' : 'production',
    handlingFee: Number(env('UPS_HANDLING_FEE', 0)),
    services: { '12': 'UPS 3 Day Select', '02': 'UPS 2nd Day Air', '01': 'UPS Next Day Air' },
  },

  mail: {
    enabled: env('MAIL_ENABLED', 'false') === 'true',
    host: env('MAIL_HOST'),
    port: Number(env('MAIL_PORT', 465)),
    user: env('MAIL_USERNAME'),
    password: env('MAIL_PASSWORD'),
    fromAddress: env('MAIL_FROM_ADDRESS', 'support@sweeteyecoffee.com'),
    fromName: env('MAIL_FROM_NAME', 'Sweet Eye Coffee'),
  },

  // Shop details — same values as the Laravel config/store.php.
  store: {
    name: 'Sweet Eye Coffee Roasters',
    address: '1140 N Germantown Pkwy Ste 115, Cordova, TN 38016',
    addressShort: '1140 N Germantown Pkwy, Cordova, TN',
    phone: '+19013104293',
    phoneDisplay: '(901) 310-4293',
    email: 'support@sweeteyecoffee.com',
    timezone: 'America/Chicago',
    // Default opening hours (staff change them in Settings → "store_hours").
    // 0 = Sunday … 6 = Saturday, 24h "HH:mm"; null = closed all day.
    hours: {
      0: ['07:30', '21:00'],
      1: ['07:30', '21:00'],
      2: ['07:30', '21:00'],
      3: ['07:30', '21:00'],
      4: ['07:30', '21:00'],
      5: ['07:30', '22:30'],
      6: ['07:30', '22:30'],
    },
  },

  // Coffee-bean delivery defaults (config/shipping.php); admin settings override them.
  shipping: {
    localFee: 4.99,
    localZips: ['38016', '38018', '38139', '38138', '38120', '38134', '38133', '38135', '38122', '38115',
      '38125', '38141', '38118', '38108', '38111', '38114', '38112', '38104', '38105', '38107'],
    standardRate: 11.99,
    packagingLbs: 1,
    maxPackageLbs: 50,
    origin: { name: 'Sweet Eye Coffee', line1: '1140 N Germantown Pkwy Ste 115', city: 'Cordova', state: 'TN', zip: '38016' },
  },
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET is missing — add it to server/.env');
}
if (config.isProduction && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET is too short for production — use: openssl rand -hex 48');
}
if (config.isProduction && !/^https:\/\//.test(config.publicUrl)) {
  throw new Error('PUBLIC_URL must be set to your https:// address in production (e.g. https://yourdomain.com)');
}
