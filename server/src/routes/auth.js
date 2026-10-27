import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { first, query, nowUtc } from '../db.js';
import { fail, requireString, optionalString, isEmail } from '../lib/http.js';
import { checkPassword, hashPassword, publicUser, requireUser, signUserToken } from '../lib/auth.js';
import { sendMail } from '../lib/mail.js';
import { config } from '../config.js';

export const authRoutes = Router();

const validPassword = (password) => {
  if (typeof password !== 'string' || password.length < 8) fail(422, 'Your password must be at least 8 characters.');
  if (password.length > 255) fail(422, 'That password is too long.');
  return password;
};

const respondWithUser = (res, user, status = 200) =>
  res.status(status).json({ token: signUserToken(user), user: publicUser(user) });

authRoutes.post('/auth/register', async (req, res) => {
  const name = requireString(req.body?.name, 'Please enter your name.');
  const email = requireString(req.body?.email, 'Please enter your email.').toLowerCase();
  if (!isEmail(email)) fail(422, 'Please enter a valid email address.');
  const password = validPassword(req.body?.password);
  if (req.body?.password_confirmation !== undefined && req.body.password_confirmation !== password) {
    fail(422, 'The passwords do not match.');
  }
  if (await first('SELECT id FROM users WHERE email = ?', [email])) fail(422, 'An account with this email already exists. Try signing in.');

  const now = nowUtc();
  const result = await query(
    "INSERT INTO users (name, email, password, role, phone, created_at, updated_at) VALUES (?, ?, ?, 'customer', ?, ?, ?)",
    [name, email, await hashPassword(password), optionalString(req.body?.phone, 30), now, now],
  );
  const user = await first('SELECT * FROM users WHERE id = ?', [result.insertId]);

  await sendMail({
    to: user.email,
    subject: `Welcome to ${config.store.name}`,
    text: `Hi ${user.name},\n\nWelcome to Sweet Eye Coffee! Your account is ready — order ahead, track your orders and reach us anytime from the app.\n\n${config.store.address}`,
  });
  respondWithUser(res, user, 201);
});

authRoutes.post('/auth/login', async (req, res) => {
  const email = requireString(req.body?.email, 'Please enter your email.').toLowerCase();
  const password = String(req.body?.password ?? '');
  const user = await first('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !(await checkPassword(password, user.password))) {
    fail(422, 'These credentials do not match our records.');
  }
  respondWithUser(res, user);
});

authRoutes.get('/auth/me', requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ── Password reset with a 6-digit emailed code ──────────────────────────────

authRoutes.post('/auth/forgot', async (req, res) => {
  const email = requireString(req.body?.email, 'Please enter your email.').toLowerCase();
  const user = await first('SELECT id, name, email FROM users WHERE email = ?', [email]);
  if (user) {
    const code = String(crypto.randomInt(100000, 1000000));
    await query(
      'REPLACE INTO password_reset_tokens (email, token, created_at) VALUES (?, ?, ?)',
      [email, await bcrypt.hash(code, 10), nowUtc()],
    );
    await sendMail({
      to: email,
      subject: 'Your Sweet Eye Coffee reset code',
      text: `Hi ${user.name},\n\nYour password reset code is: ${code}\n\nIt expires in 60 minutes. If you didn't ask for this, you can ignore this email.`,
    });
  }
  // Same answer either way, so emails can't be probed.
  res.json({ message: 'If that email has an account, we sent a 6-digit code to it.' });
});

// Wrong codes per email; after 5 the code is thrown away and a new one must be requested.
const resetFailures = new Map();
const MAX_RESET_TRIES = 5;

authRoutes.post('/auth/reset', async (req, res) => {
  const email = requireString(req.body?.email, 'Please enter your email.').toLowerCase();
  const code = requireString(req.body?.code, 'Please enter the code from your email.', 10);
  const password = validPassword(req.body?.password);

  const row = await first('SELECT * FROM password_reset_tokens WHERE email = ?', [email]);
  const fresh = row && Date.now() - new Date(`${row.created_at.replace(' ', 'T')}Z`).getTime() < 60 * 60 * 1000;
  if (!row || !fresh || !(await bcrypt.compare(code, row.token))) {
    const tries = (resetFailures.get(email) ?? 0) + 1;
    if (row && tries >= MAX_RESET_TRIES) {
      resetFailures.delete(email);
      await query('DELETE FROM password_reset_tokens WHERE email = ?', [email]);
      fail(422, 'Too many wrong codes. Please request a new code.');
    }
    if (row) resetFailures.set(email, tries);
    fail(422, 'That code is invalid or has expired.');
  }
  resetFailures.delete(email);

  await query('UPDATE users SET password = ?, updated_at = ? WHERE email = ?', [await hashPassword(password), nowUtc(), email]);
  await query('DELETE FROM password_reset_tokens WHERE email = ?', [email]);
  respondWithUser(res, await first('SELECT * FROM users WHERE email = ?', [email]));
});

// ── Profile ─────────────────────────────────────────────────────────────────

authRoutes.patch('/auth/me', requireUser, async (req, res) => {
  const name = requireString(req.body?.name ?? req.user.name, 'Please enter your name.');
  const email = requireString(req.body?.email ?? req.user.email, 'Please enter your email.').toLowerCase();
  if (!isEmail(email)) fail(422, 'Please enter a valid email address.');
  if (email !== req.user.email) {
    // A stolen session must not be able to move the account to another inbox.
    if (!(await checkPassword(String(req.body?.current_password ?? ''), req.user.password))) {
      fail(422, 'Please enter your current password to change your email.');
    }
    if (await first('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.user.id])) {
      fail(422, 'That email is already used by another account.');
    }
  }
  const phone = req.body?.phone !== undefined ? optionalString(req.body.phone, 30) : req.user.phone;
  const address = req.body?.address !== undefined ? optionalString(req.body.address, 1000) : req.user.address;

  // A changed email is no longer verified (same as Laravel's ProfileController).
  const verifiedAt = email === req.user.email ? req.user.email_verified_at : null;
  await query(
    'UPDATE users SET name = ?, email = ?, phone = ?, address = ?, email_verified_at = ?, updated_at = ? WHERE id = ?',
    [name, email, phone, address, verifiedAt, nowUtc(), req.user.id],
  );
  res.json({ user: publicUser(await first('SELECT * FROM users WHERE id = ?', [req.user.id])) });
});

authRoutes.put('/auth/password', requireUser, async (req, res) => {
  if (!(await checkPassword(String(req.body?.current_password ?? ''), req.user.password))) {
    fail(422, 'Your current password is incorrect.');
  }
  const password = validPassword(req.body?.password);
  await query('UPDATE users SET password = ?, updated_at = ? WHERE id = ?', [await hashPassword(password), nowUtc(), req.user.id]);
  // Old sessions are signed out by the new password; hand this device a fresh token.
  const user = await first('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Password updated.', token: signUserToken(user) });
});

authRoutes.delete('/auth/me', requireUser, async (req, res) => {
  if (['admin', 'super_admin'].includes(req.user.role)) fail(403, 'Staff accounts cannot be deleted from the app.');
  if (!(await checkPassword(String(req.body?.password ?? ''), req.user.password))) fail(422, 'Your password is incorrect.');
  await query('DELETE FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Your account has been deleted.' });
});
