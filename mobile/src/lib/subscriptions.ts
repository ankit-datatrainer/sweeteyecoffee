import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { create } from 'zustand';
import type { CartLine, Product } from './types';

export type SubscriptionDraft = {
  product_id?: number;
  size?: string | null;
  quantity?: number;
  modifiers?: number[];
  plan?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
};
// In memory so delivery details survive sign-in without being written to device storage.
export const useSubscriptionDraft = create<{ draft: SubscriptionDraft; set: (draft: SubscriptionDraft) => void }>(
  (set) => ({ draft: {}, set: (draft) => set({ draft }) }),
);
export function exploreSubscription(selection?: SubscriptionDraft) {
  if (selection) useSubscriptionDraft.getState().set(selection);
  router.push('/subscriptions');
}
export const subscriptionSelection = (
  p: Product,
  size: string | null,
  quantity: number,
  modifiers: number[],
): SubscriptionDraft => ({ product_id: p.id, size, quantity: Math.min(20, quantity), modifiers });
export const subscribeCartLine = (line: CartLine) =>
  exploreSubscription({
    product_id: line.product_id,
    size: line.size_name,
    quantity: Math.min(20, line.quantity),
    modifiers: line.modifiers,
  });
export const billingReturnUrl = (path = '/subscriptions') => Linking.createURL(path);
export async function openBilling(url: string, returnUrl = billingReturnUrl()) {
  if (!/^https:\/\/(checkout|billing)\.stripe\.com\//.test(url))
    throw new Error('Billing returned an invalid address.');
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openAuthSessionAsync(url, returnUrl);
}
