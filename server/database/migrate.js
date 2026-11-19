import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, query, transaction, nowUtc } from '../src/db.js';
import { BEAN_GRIND_SLUG, BEANS_CATEGORY_SLUG } from '../src/lib/catalog.js';

// Additive and repeatable. Uses the same table/column names as the Laravel migrations.
export async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS page_contents (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, page VARCHAR(40) NOT NULL, field VARCHAR(120) NOT NULL,
    value LONGTEXT NULL, created_at TIMESTAMP NULL, updated_at TIMESTAMP NULL, UNIQUE KEY page_contents_page_field_unique (page,field)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await query(`CREATE TABLE IF NOT EXISTS page_sections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, page VARCHAR(40) NOT NULL, type VARCHAR(30) NOT NULL,
    data JSON NOT NULL, sort_order INT UNSIGNED NOT NULL DEFAULT 0, is_visible TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL, updated_at TIMESTAMP NULL, KEY page_sections_page_index (page)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await query(`CREATE TABLE IF NOT EXISTS coffee_subscriptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(36) NOT NULL UNIQUE,
    user_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL, plan VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', stripe_subscription_id VARCHAR(255) NULL UNIQUE,
    stripe_customer_id VARCHAR(255) NULL, checkout_session_id VARCHAR(255) NULL UNIQUE, checkout_url TEXT NULL,
    selection JSON NOT NULL, recipient LONGTEXT NOT NULL, total_cents INT UNSIGNED NOT NULL,
    cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0, period_end TIMESTAMP NULL, consented_at DATETIME NOT NULL,
    created_at TIMESTAMP NULL, updated_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const columns = new Set((await query('SHOW COLUMNS FROM orders')).map((c) => c.Field));
  if (!columns.has('shipping_service_code'))
    await query('ALTER TABLE orders ADD shipping_service_code VARCHAR(20) NULL');
  if (!columns.has('coffee_subscription_id'))
    await query(
      'ALTER TABLE orders ADD coffee_subscription_id BIGINT UNSIGNED NULL, ADD CONSTRAINT orders_coffee_subscription_id_foreign FOREIGN KEY (coffee_subscription_id) REFERENCES coffee_subscriptions(id) ON DELETE RESTRICT',
    );
  if (!columns.has('subscription_invoice_id'))
    await query('ALTER TABLE orders ADD subscription_invoice_id VARCHAR(255) NULL UNIQUE');
  await query(`CREATE TABLE IF NOT EXISTS ups_shipments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL, environment VARCHAR(20) NOT NULL, service_code VARCHAR(10) NOT NULL,
    shipment_number VARCHAR(255) NULL, carrier_charge DECIMAL(10,2) NULL, currency VARCHAR(3) NULL,
    packages JSON NOT NULL, result LONGTEXT NULL, error TEXT NULL, label_created_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL, updated_at TIMESTAMP NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  if (!(await query("SHOW COLUMNS FROM coupons LIKE 'excluded_category_ids'")).length) {
    try {
      await query('ALTER TABLE coupons ADD COLUMN excluded_category_ids JSON NULL');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  await transaction(async (conn) => {
    const now = nowUtc();
    const [group] = await conn.query(
      `INSERT INTO modifier_groups (slug, name, selection, is_required, sort_order, created_at, updated_at)
       VALUES (?, 'Grind', 'single', 1, 1, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [BEAN_GRIND_SLUG, now, now],
    );
    const groupId = group.insertId;
    const [existing] = await conn.query('SELECT id FROM modifiers WHERE modifier_group_id = ? LIMIT 1', [groupId]);
    if (!existing.length) {
      const options = ['Whole bean', 'Ground'].map((name, index) => [groupId, name, 0, index, 1, now, now]);
      await conn.query(
        'INSERT INTO modifiers (modifier_group_id, name, price, sort_order, is_active, created_at, updated_at) VALUES ?',
        [options],
      );
    }
    await conn.query(
      `INSERT INTO modifier_group_product (product_id, modifier_group_id)
       SELECT p.id, ? FROM products p JOIN categories c ON c.id = p.category_id WHERE c.slug = ?
       ON DUPLICATE KEY UPDATE product_id = modifier_group_product.product_id`,
      [groupId, BEANS_CATEGORY_SLUG],
    );
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await migrate();
    console.log('Page content, subscriptions, UPS, coupon exclusions and bean grind are up to date.');
  } finally {
    await pool.end();
  }
}
