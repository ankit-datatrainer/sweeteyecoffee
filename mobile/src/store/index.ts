import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { get, setAuthToken } from '@/lib/api';
import type { CartLine, Category, Product, StoreInfo, User } from '@/lib/types';

// ── Catalog (menu + shop details) ───────────────────────────────────────────

type CatalogState = {
  store: StoreInfo | null;
  categories: Category[];
  products: Product[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  product: (id: number) => Product | undefined;
};

export const useCatalog = create<CatalogState>((set, getState) => ({
  store: null,
  categories: [],
  products: [],
  status: 'idle',
  error: null,
  load: async (force = false) => {
    if (!force && getState().status === 'loading') return;
    set({ status: getState().products.length ? getState().status : 'loading', error: null });
    try {
      const [store, catalog] = await Promise.all([
        get<StoreInfo>('/store'),
        get<{ categories: Category[]; products: Product[] }>('/catalog'),
      ]);
      set({ store, categories: catalog.categories, products: catalog.products, status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: (error as Error).message });
    }
  },
  product: (id) => getState().products.find((p) => p.id === id),
}));

// ── Bag ─────────────────────────────────────────────────────────────────────

type CartState = {
  lines: CartLine[];
  couponCode: string | null;
  add: (line: CartLine) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  setCoupon: (code: string | null) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      couponCode: null,
      add: (line) =>
        set((s) => {
          const existing = s.lines.find((l) => l.key === line.key);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.key === line.key ? { ...l, ...line, quantity: Math.min(50, l.quantity + line.quantity) } : l,
              ),
            };
          }
          return { lines: [...s.lines, line] };
        }),
      setQuantity: (key, quantity) =>
        set((s) => ({
          lines: quantity <= 0
            ? s.lines.filter((l) => l.key !== key)
            : s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l)),
        })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      setCoupon: (couponCode) => set({ couponCode }),
      clear: () => set({ lines: [], couponCode: null }),
    }),
    { name: 'sweet-eye-bag', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotal = (lines: CartLine[]) =>
  Math.round(lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0) * 100) / 100;

// ── Guest orders (no account: this device keeps a token per order) ──────────

type GuestOrdersState = {
  orders: { id: number; token: string; order_number: string }[];
  remember: (o: { id: number; token: string; order_number: string }) => void;
  tokenFor: (id: number) => string | undefined;
};

export const useGuestOrders = create<GuestOrdersState>()(
  persist(
    (set, getState) => ({
      orders: [],
      remember: (o) => set((s) => ({ orders: [o, ...s.orders.filter((x) => x.id !== o.id)].slice(0, 50) })),
      tokenFor: (id) => getState().orders.find((o) => o.id === id)?.token,
    }),
    { name: 'sweet-eye-guest-orders', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

// ── Account ─────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'sweet-eye-token';
const tokenStore = {
  get: () => (Platform.OS === 'web' ? AsyncStorage.getItem(TOKEN_KEY) : SecureStore.getItemAsync(TOKEN_KEY)),
  set: (v: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(TOKEN_KEY, v) : SecureStore.setItemAsync(TOKEN_KEY, v)),
  clear: () => (Platform.OS === 'web' ? AsyncStorage.removeItem(TOKEN_KEY) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

type AuthState = {
  user: User | null;
  ready: boolean;
  hydrate: () => Promise<void>;
  signIn: (token: string, user: User) => Promise<void>;
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  hydrate: async () => {
    try {
      const token = await tokenStore.get();
      if (token) {
        setAuthToken(token);
        const { user } = await get<{ user: User }>('/auth/me');
        set({ user });
      }
    } catch {
      setAuthToken(null);
      await tokenStore.clear().catch(() => {});
    } finally {
      set({ ready: true });
    }
  },
  signIn: async (token, user) => {
    setAuthToken(token);
    await tokenStore.set(token);
    set({ user });
  },
  setUser: (user) => set({ user }),
  signOut: async () => {
    setAuthToken(null);
    await tokenStore.clear().catch(() => {});
    set({ user: null });
  },
}));

// ── UI flags ────────────────────────────────────────────────────────────────

/** Lets screens hold their entrance animations until the launch curtain has lifted. */
export const useUi = create<{ introDone: boolean; setIntroDone: () => void }>((set) => ({
  introDone: false,
  setIntroDone: () => set({ introDone: true }),
}));
