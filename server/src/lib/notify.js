import crypto from 'node:crypto';
import { query, nowUtc } from '../db.js';

/**
 * Bell alerts for the shop, written in the same format as Laravel's database
 * notifications (App\Services\AdminNotifier) so the admin panel can show them.
 * Super admins get them; regular admins only when no super admin exists.
 */
export async function notifyAdmins(type, data) {
  try {
    let admins = await query("SELECT id FROM users WHERE role = 'super_admin'");
    if (!admins.length) admins = await query("SELECT id FROM users WHERE role = 'admin'");
    const now = nowUtc();
    for (const admin of admins) {
      await query(
        `INSERT INTO notifications (id, type, notifiable_type, notifiable_id, data, read_at, created_at, updated_at)
         VALUES (?, ?, 'App\\\\Models\\\\User', ?, ?, NULL, ?, ?)`,
        [crypto.randomUUID(), `App\\Notifications\\${type}`, admin.id, JSON.stringify(data), now, now],
      );
    }
  } catch (error) {
    // A failed alert must never break a paid order.
    console.error('Admin notification failed:', error.message);
  }
}
