/** Shapes returned by the staff (/api/admin) endpoints. */

export type AdminCategory = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  season_start: string | null;
  season_end: string | null;
  product_count: number;
};

export type AdminCoupon = {
  id: number;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  label: string;
  min_order_amount: number | null;
  max_discount: number | null;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  state: 'active' | 'off' | 'expired' | 'scheduled' | 'used_up';
};

export type AdminOptionGroup = {
  id: number;
  name: string;
  selection: 'single' | 'multiple';
  is_required: boolean;
  product_count: number;
  options: { id: number; name: string; price: number; large_price: number | null; is_active: boolean }[];
};

export type ShopSettings = {
  tax_rate: number;
  curbside_enabled: boolean;
  local_delivery_fee: number;
  standard_shipping_rate: number;
  local_delivery_zips: string[];
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "09-14", "11-14" → "Sep 14 – Nov 14" */
export const seasonText = (start: string, end: string) => {
  const f = (md: string) => `${MONTHS[Number(md.slice(0, 2)) - 1] ?? md} ${Number(md.slice(3))}`;
  return `${f(start)} – ${f(end)}`;
};

export const COUPON_STATE: Record<AdminCoupon['state'], { label: string; tone: 'success' | 'muted' | 'danger' | 'info' | 'gold' }> = {
  active: { label: 'Active', tone: 'success' },
  off: { label: 'Off', tone: 'muted' },
  expired: { label: 'Expired', tone: 'danger' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  used_up: { label: 'Used up', tone: 'gold' },
};
