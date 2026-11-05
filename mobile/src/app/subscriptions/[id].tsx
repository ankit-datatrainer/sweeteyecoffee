import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, View } from 'react-native';
import { confirmAction } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { Button, Card, Notice, Skeleton, T } from '@/components/ui';
import { errorMessage, get, post } from '@/lib/api';
import { money } from '@/lib/format';
import { billingReturnUrl, openBilling } from '@/lib/subscriptions';
import type { CoffeeSubscription } from '@/lib/types';
import { useAuth } from '@/store';

type Details = {
  subscription: CoffeeSubscription;
  orders: { id: number; order_number: string; status: string; total_amount: number; notes: string | null }[];
};
export default function SubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      setDetails(await get<Details>(`/subscriptions/${id}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, user]);
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') load();
      }, 10000);
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') load();
      });
      return () => {
        clearInterval(timer);
        listener.remove();
      };
    }, [load]),
  );
  const manage = async (action: 'cancel' | 'portal' | 'resume') => {
    setBusy(true);
    setError(null);
    try {
      const result = await post<{ url?: string; message?: string }>(
        `/subscriptions/${id}/${action === 'resume' ? 'resume' : 'manage'}`,
        { action, return_url: billingReturnUrl(`/subscriptions/${id}`) },
      );
      if (result.url)
        await openBilling(
          result.url,
          action === 'resume' ? billingReturnUrl() : billingReturnUrl(`/subscriptions/${id}`),
        );
      if (result.message) setMessage(result.message);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const s = details?.subscription;
  return (
    <PageScreen title="Your coffee subscription" contentStyle={{ maxWidth: 720 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {!user ? (
        <Button title="Sign in" onPress={() => router.push('/auth/sign-in')} />
      ) : !s ? (
        <Skeleton style={{ height: 260 }} />
      ) : (
        <View style={{ gap: 16 }}>
          <T variant="title">
            {s.selection.quantity} × {s.selection.name}
          </T>
          <T variant="body">
            {s.selection.size} · {s.selection.modifiers.map((m) => m.name).join(', ')}
          </T>
          <T variant="heading">
            {money(s.total_cents / 100)} · {s.selection.interval}
          </T>
          <T variant="body">Status: {s.status.replace(/_/g, ' ')}</T>
          {s.selection.test_mode && <Notice>TEST subscription · do not fulfill or ship test orders.</Notice>}
          {s.status === 'pending' && (
            <Notice>
              Waiting for Stripe confirmation. Only a paid invoice creates a delivery order. Refresh after completing
              checkout.
            </Notice>
          )}
          {s.cancel_at_period_end && (
            <Notice>Future renewals are canceled. Your paid delivery will still be fulfilled.</Notice>
          )}
          {s.period_end && (
            <T variant="body">
              {s.cancel_at_period_end ? 'Paid period ends' : 'Next renewal'}:{' '}
              {new Date(s.period_end).toLocaleDateString()}
            </T>
          )}
          {s.can_resume_checkout && (
            <Button title="Resume secure checkout" loading={busy} onPress={() => manage('resume')} />
          )}
          {!['pending', 'expired', 'incomplete_expired'].includes(s.status) && (
            <Button
              title="Payment method & invoices"
              variant="outline"
              loading={busy}
              onPress={() => manage('portal')}
            />
          )}
          {!s.cancel_at_period_end && ['active', 'past_due', 'unpaid', 'trialing'].includes(s.status) && (
            <Button
              title="Cancel future renewals"
              variant="outline"
              loading={busy}
              onPress={() =>
                confirmAction(
                  'Cancel future renewals?',
                  'Your paid delivery will still be fulfilled. Automatic payments stop after this paid period.',
                  'Cancel renewals',
                  () => manage('cancel'),
                )
              }
            />
          )}
          <Button title="Refresh status" variant="outline" onPress={load} />
          <T variant="small">Contact the shop for product or delivery address changes.</T>
          <T variant="title">Paid deliveries</T>
          {details.orders.length ? (
            details.orders.map((o) => (
              <Card key={o.id} style={{ gap: 8 }}>
                <T variant="heading">{o.order_number}</T>
                <T variant="body">
                  {o.status} · {money(o.total_amount)}
                </T>
                <Button title="Track delivery" size="md" onPress={() => router.push(`/order/${o.id}`)} />
              </Card>
            ))
          ) : (
            <T variant="body">No paid deliveries yet.</T>
          )}
        </View>
      )}
    </PageScreen>
  );
}
