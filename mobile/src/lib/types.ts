export type ModifierOption = { id: number; name: string; price: number; large_price: number | null };

export type GalleryPhoto = { src: string; url?: string | null; caption: string };
export type PageSection = { id: number; type: 'text' | 'text_image' | 'image' | 'gallery' | 'cta'; data: Record<string, string | GalleryPhoto[]>; is_visible: boolean; sort_order: number };
export type PageContent = {
  title: string;
  fields: Record<string, string | GalleryPhoto[] | null>;
  hidden: string[];
  sections: PageSection[];
  schema?: Record<string, { label: string; hideable?: boolean; fields: Record<string, [string, string, string | GalleryPhoto[]]> }>;
};
export type SubscriptionQuote = {
  product_id: number; name: string; size: string; quantity: number; plan: string; interval: string;
  modifiers: { id: number; name: string; price: number }[];
  unit_cents: number; subtotal_cents: number; discount_cents: number; discount_percent: number;
  tax_cents: number; shipping_cents: number; total_cents: number; shipping_service: string; test_mode?: boolean;
};
export type CoffeeSubscription = {
  id: string; status: string; plan: string; selection: SubscriptionQuote; total_cents: number;
  cancel_at_period_end: boolean; period_end: string | null; created_at: string; can_resume_checkout: boolean;
  customer_name?: string; customer_email?: string;
};

export type ModifierGroup = {
  id: number;
  slug: string;
  name: string;
  selection: 'single' | 'multiple';
  required: boolean;
  options: ModifierOption[];
};

export type Size = { name: string; price: number; image: string | null };

export type Product = {
  id: number;
  category_id: number;
  category_slug: string;
  category_name: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  starting_price: number;
  image: string | null;
  iced_image: string | null;
  is_featured: boolean;
  is_sold_out: boolean;
  orderable: boolean;
  is_beans: boolean;
  sizes: Size[];
  groups: ModifierGroup[];
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  product_count: number;
  seasonal: boolean;
  season_label: string | null;
};

export type StoreInfo = {
  name: string;
  address: string;
  address_short: string;
  phone: string;
  phone_display: string;
  email: string;
  timezone: string;
  hours: { days: string; time: string }[];
  status: { open: boolean; label: string; detail: string };
  directions_url: string;
  tax_rate: number;
  curbside_enabled: boolean;
  local_delivery_fee: number;
  standard_shipping_rate: number;
  logo: string | null;
  logo_large: string | null;
  gallery: string[];
  payments: {
    mode: 'test' | 'live';
    card_enabled: boolean;
    /** Stripe methods switched on for the shop: apple_pay, google_pay, cashapp, amazon_pay. */
    stripe_methods?: string[];
    square: { application_id: string; location_id: string; environment: 'production' | 'sandbox' } | null;
  };
};

/** A line in the bag, priced by the server when it was added. */
export type CartLine = {
  key: string;
  product_id: number;
  name: string;
  image: string | null;
  size_name: string | null;
  modifiers: number[];
  modifiers_label: string;
  unit_price: number;
  quantity: number;
  is_beans: boolean;
};

export type Quote = {
  items: (CartLine & { total: number })[];
  subtotal: number;
  discount: number;
  coupon: { code: string; label: string } | null;
  coupon_message: string | null;
  tax_rate: number;
  tax: number;
  delivery_fee: number;
  total: number;
  can_deliver: boolean;
  curbside_enabled: boolean;
  delivery: { method: string; service: string; code: string; fee: number } | null;
  delivery_options: { code: string; name: string; price: number; days: number | null }[] | null;
};

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';

export type Order = {
  id: number;
  order_number: string;
  status: OrderStatus;
  awaiting_payment: boolean;
  type: 'pickup' | 'delivery';
  pickup_method: 'in_store' | 'curbside' | 'delivery';
  pickup_method_label: string;
  vehicle_details: string | null;
  customer_arrived_at: string | null;
  delivery_address: string | null;
  shipping_service: string | null;
  shipment?: { status: string; tracking: string[] } | null;
  customer_name: string;
  customer_email: string | null;
  phone: string | null;
  notes: string | null;
  subtotal: number;
  discount_amount: number;
  coupon_code: string | null;
  tax: number;
  delivery_fee: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
  items: {
    id: number;
    product_id: number;
    name: string;
    image: string | null;
    size_name: string | null;
    modifiers_label: string;
    quantity: number;
    price: number;
    total: number;
  }[];
  payment: { method: string; detail: string | null; status: string; amount: number } | null;
};

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  role: 'customer' | 'admin' | 'super_admin';
  is_admin: boolean;
  created_at: string;
};

export type Ticket = {
  id: number;
  ticket_number: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  admin_response: string | null;
  responded_at: string | null;
  created_at: string;
};
