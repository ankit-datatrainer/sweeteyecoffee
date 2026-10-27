import { create } from 'zustand';
import type { Product } from '@/lib/types';

/** Which item the quick-add sheet is showing (null = closed). */
export const useQuickAdd = create<{ product: Product | null; open: (p: Product) => void; close: () => void }>((set) => ({
  product: null,
  open: (product) => set({ product }),
  close: () => set({ product: null }),
}));

/** Open the customise-and-add sheet for a menu item (the "+" on menu cards). */
export const openQuickAdd = (product: Product) => useQuickAdd.getState().open(product);
