import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { Button, Card, Notice, Skeleton, T } from '@/components/ui';
import { errorMessage, get } from '@/lib/api';
import { money, shortDate } from '@/lib/format';
import type { CoffeeSubscription } from '@/lib/types';

export default function StaffSubscriptions() {
  const staff = useStaffOnly();
  const [rows, setRows] = useState<CoffeeSubscription[] | null>(null),
    [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!staff) return;
    try {
      setRows((await get<{ subscriptions: CoffeeSubscription[] }>('/admin/subscriptions')).subscriptions);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [staff]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  return (
    <PageScreen title="Coffee subscriptions">
      <Button title="Refresh" variant="outline" onPress={load} />
      {error && <Notice tone="danger">{error}</Notice>}
      {!rows ? (
        <Skeleton style={{ height: 220 }} />
      ) : (
        <View style={{ gap: 12, marginTop: 20 }}>
          {!rows.length && <Notice>No subscriptions yet.</Notice>}
          {rows.map((s) => (
            <Card key={s.id} style={{ gap: 8 }}>
              <T variant="heading">{s.customer_name}</T>
              <T variant="small">{s.customer_email}</T>
              <T variant="body">
                {s.selection.quantity} × {s.selection.name} · {s.selection.size} ·{' '}
                {s.selection.modifiers.map((m) => m.name).join(', ')}
              </T>
              <T variant="body">
                {s.selection.interval} · {money(s.total_cents / 100)} · {s.status}
              </T>
              {s.period_end && <T variant="small">Period ends {shortDate(s.period_end)}</T>}
              {s.cancel_at_period_end && <Notice>Future renewals canceled</Notice>}
              {s.selection.test_mode && <Notice>TEST — do not fulfill or ship</Notice>}
            </Card>
          ))}
        </View>
      )}
    </PageScreen>
  );
}
