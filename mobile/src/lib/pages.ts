import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useCatalog } from '@/store';
import type { GalleryPhoto } from './types';

export function usePage(name: string) {
  const page = useCatalog((s) => s.pages[name]);
  useFocusEffect(
    useCallback(() => {
      const catalog = useCatalog.getState();
      if (Date.now() - catalog.loadedAt > 30000) catalog.load();
    }, []),
  );
  return {
    page,
    text: (key: string, fallback = '') =>
      typeof page?.fields[key] === 'string' ? (page.fields[key] as string) : fallback,
    image: (key: string, fallback?: string | null) =>
      typeof page?.fields[key] === 'string' ? (page.fields[key] as string) : fallback,
    gallery: (key: string): GalleryPhoto[] =>
      Array.isArray(page?.fields[key]) ? (page.fields[key] as GalleryPhoto[]) : [],
    visible: (key: string) => !page?.hidden.includes(key),
    sections: page?.sections ?? [],
  };
}
export function openPageLink(value: string) {
  if (/^https?:\/\//i.test(value)) {
    Linking.openURL(value);
    return;
  }
  if (!value.startsWith('/') || value.startsWith('//')) return;
  const aliases: Record<string, string> = {
    '/privacy-policy': '/legal/privacy',
    '/terms-and-conditions': '/legal/terms',
    '/refund-policy': '/legal/refund',
    '/coffee-subscriptions': '/subscriptions',
    '/cart': '/bag',
  };
  router.push((aliases[value] ?? value) as Href);
}
