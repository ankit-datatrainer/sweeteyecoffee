import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '@/theme';
import { T } from './ui';

export type SquareCardHandle = { tokenize: () => Promise<string> };
type Props = { applicationId: string; locationId: string; environment: 'production' | 'sandbox' };

declare global {
  interface Window {
    Square?: any;
  }
}

const loadSdk = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (window.Square) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Square card form.'));
    document.head.appendChild(s);
  });

// Same dark look as the phone version of the card form.
const CARD_STYLE = {
  '.input-container': { borderColor: '#4a3426', borderRadius: '14px' },
  '.input-container.is-focus': { borderColor: '#D4A373' },
  '.input-container.is-error': { borderColor: '#EE8E7A' },
  input: { backgroundColor: '#1B110C', color: '#F5EDE3', fontSize: '16px' },
  'input::placeholder': { color: '#8a7a6c' },
  '.message-text': { color: '#bfa98f' },
  '.message-icon': { color: '#bfa98f' },
};

/** Web build: Square's card form mounted straight into the page. */
export const SquareCard = forwardRef<SquareCardHandle, Props>(function SquareCard({ applicationId, locationId, environment }, ref) {
  const card = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSdk(environment === 'production' ? 'https://web.squarecdn.com/v1/square.js' : 'https://sandbox.web.squarecdn.com/v1/square.js');
        const payments = window.Square.payments(applicationId, locationId);
        const c = await payments.card({ style: CARD_STYLE });
        if (cancelled) return c.destroy?.();
        await c.attach('#sweet-eye-card');
        card.current = c;
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      card.current?.destroy?.();
    };
  }, [applicationId, locationId, environment]);

  useImperativeHandle(ref, () => ({
    tokenize: async () => {
      if (!card.current) throw new Error('The card form is still loading.');
      const r = await card.current.tokenize();
      if (r.status === 'OK') return r.token as string;
      throw new Error(r.errors?.[0]?.message ?? 'Please check your card details.');
    },
  }));

  return (
    <View style={{ minHeight: 100 }}>
      <View nativeID="sweet-eye-card" />
      {!ready && !error && <ActivityIndicator color={colors.gold} />}
      {error && <T variant="small" style={{ color: colors.danger }}>{error}</T>}
    </View>
  );
});
