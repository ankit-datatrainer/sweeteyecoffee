import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config.js';

/**
 * Per-IP (and, for sign-in and password reset, per-email) request limits on the
 * endpoints people could abuse: guessing passwords or reset codes, mail-bombing,
 * coupon guessing, order spam. Locally they're 50× looser so the test scripts
 * and Expo reloads never trip them.
 */
const scale = config.isProduction ? 1 : 50;
const message = (what) => ({ message: `Too many ${what}. Please wait a few minutes and try again.` });

const limit = (minutes, max, what, extra = {}) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: max * scale,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: message(what),
    ...extra,
  });

const byEmail = (minutes, max, what, extra = {}) =>
  limit(minutes, max, what, {
    keyGenerator: (req) => `email:${String(req.body?.email ?? '').trim().toLowerCase() || ipKeyGenerator(req.ip)}`,
    ...extra,
  });

const failuresOnly = { skipSuccessfulRequests: true };

/** POST path → limiters, applied in index.js after the JSON body is parsed. */
export const LIMITS = {
  '/api/auth/login': [limit(15, 20, 'sign-in attempts', failuresOnly), byEmail(15, 8, 'sign-in attempts', failuresOnly)],
  '/api/auth/register': [limit(60, 5, 'new accounts from this network')],
  '/api/auth/forgot': [limit(60, 6, 'reset requests'), byEmail(60, 3, 'reset requests for this email')],
  '/api/auth/reset': [limit(15, 10, 'reset attempts', failuresOnly), byEmail(15, 6, 'reset attempts', failuresOnly)],
  '/api/coupon/apply': [limit(15, 20, 'coupon attempts', failuresOnly)],
  '/api/checkout': [limit(15, 15, 'orders')],
  '/api/checkout/quote': [limit(15, 300, 'price checks')],
  '/api/orders/:id/pay': [limit(15, 15, 'payment attempts')],
  '/api/orders/:id/stripe': [limit(15, 15, 'payment attempts')],
  '/api/orders/lookup': [limit(15, 60, 'order look-ups')],
  '/api/tickets': [limit(60, 10, 'support tickets')],
  '/api/contact': [limit(60, 5, 'messages')],
};

/** Everything else under /api, and the Stripe return page (it calls Stripe each time). */
export const apiLimit = limit(15, 1500, 'requests');
export const stripeReturnLimit = limit(15, 60, 'requests');
