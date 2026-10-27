import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { first } from '../db.js';
import { fail } from './http.js';

const TOKEN_TTL = '60d';
const VERIFY = { algorithms: ['HS256'] };

/** Fingerprint of the password hash: changing or resetting the password signs out every old token. */
const passwordVersion = (hash) => crypto.createHash('sha256').update(String(hash ?? '')).digest('base64url').slice(0, 12);

/** A real bcrypt hash to compare against when the email is unknown, so sign-in takes the same time either way. */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

/** bcrypt hash in PHP's "$2y$" flavour so the Laravel site can still verify it. */
export async function hashPassword(plain) {
  const hash = await bcrypt.hash(plain, 12);
  return hash.replace(/^\$2[ab]\$/, '$2y$');
}

export async function checkPassword(plain, hash) {
  if (!hash) {
    await bcrypt.compare(String(plain), DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash.replace(/^\$2y\$/, '$2b$'));
}

export function signUserToken(user) {
  return jwt.sign({ sub: String(user.id), kind: 'user', pv: passwordVersion(user.password) }, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

/** Lets a guest (no account) open and pay for the order they just placed. */
export function signOrderToken(orderId) {
  return jwt.sign({ sub: String(orderId), kind: 'order' }, config.jwtSecret, { expiresIn: '365d' });
}

export function verifyOrderToken(token, orderId) {
  try {
    const payload = jwt.verify(String(token || ''), config.jwtSecret, VERIFY);
    return payload.kind === 'order' && Number(payload.sub) === Number(orderId);
  } catch {
    return false;
  }
}

export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    address: u.address,
    role: u.role,
    is_admin: u.role === 'admin' || u.role === 'super_admin',
    created_at: u.created_at,
  };
}

/** Attaches req.user when a valid "Authorization: Bearer" user token is sent. Never rejects. */
export async function attachUser(req, _res, next) {
  if (req.user !== undefined) return next(); // already done for /api/admin
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.user = null;
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret, VERIFY);
      if (payload.kind === 'user') {
        const user = await first('SELECT * FROM users WHERE id = ?', [Number(payload.sub)]);
        req.user = user && payload.pv === passwordVersion(user.password) ? user : null;
      }
    } catch {
      // Expired or invalid token: treat as signed out.
    }
  }
  next();
}

export function requireUser(req, _res, next) {
  if (!req.user) fail(401, 'Please sign in to continue.');
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) fail(401, 'Please sign in to continue.');
  if (!['admin', 'super_admin'].includes(req.user.role)) fail(403, 'This area is for Sweet Eye staff only.');
  next();
}
