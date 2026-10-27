import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { ManageTile } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { CountUp } from '@/components/motion';
import { StatusPill } from '@/components/order-bits';
import { toast } from '@/components/toast';
import { Button, Chip, Icon, Notice, PressableScale, Skeleton, T } from '@/components/ui';
import { errorMessage, get, patch } from '@/lib/api';
import { money, STATUS_LABEL, timeAgo } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

const FILTERS: { key: string; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: '', label: 'All' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivered', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** Next step staff usually take for an order. */
const nextStatus = (o: Order): OrderStatus | null => {
  if (o.status === 'pending' || o.status === 'confirmed') return 'preparing';
  if (o.status === 'preparing') return 'ready';
  if (o.status === 'ready') return o.type === 'delivery' ? 'out_for_delivery' : 'delivered';
  if (o.status === 'out_for_delivery') return 'delivered';
  return null;
};

export default function AdminScreen() {
  const user = useAuth((s) => s.user);
  const [filter, setFilter] = useState('active');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [summary, setSummary] = useState<{ today_orders: number; today_revenue: number; active_orders: number; customers: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([get<{ orders: Order[] }>(`/admin/orders?status=${filter}`), get<typeof summary>('/admin/summary')]);
      setOrders(o.orders);
      setSummary(s);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.is_admin) {
        router.replace('/account');
        return;
      }
      load();
      const t = setInterval(() => AppState.currentState === 'active' && load(), 20000); // live queue
      return () => clearInterval(t);
    }, [user, load]),
  );

  const advance = async (o: Order) => {
    const next = nextStatus(o);
    if (!next) return;
    setBusy(o.id);
    try {
      await patch(`/admin/orders/${o.id}/status`, { status: next });
      haptic.success();
      toast.success(`${o.order_number} → ${STATUS_LABEL[next]}`);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageScreen title="Staff dashboard">
      <View style={styles.kpis}>
        {[
          { label: 'Orders today', value: summary?.today_orders ?? 0 },
          { label: 'Revenue today', value: summary?.today_revenue ?? 0, money: true },
          { label: 'In progress', value: summary?.active_orders ?? 0 },
          { label: 'Customers', value: summary?.customers ?? 0 },
        ].map((k, i) => (
          <Animated.View key={k.label} entering={FadeInDown.delay(i * 70)} style={styles.kpi}>
            <View style={{ flexDirection: 'row' }}>
              {k.money && <Text style={styles.kpiValue}>$</Text>}
              <CountUp to={k.value} decimals={k.money ? 2 : 0} style={styles.kpiValue} />
            </View>
            <Text style={styles.kpiLabel}>{k.label}</Text>
          </Animated.View>
        ))}
      </View>

      <T variant="overline" style={{ marginTop: space.xxl, marginBottom: space.md }}>Manage</T>
      <View style={styles.manage}>
        <ManageTile icon="package" label="Products" sub="Add, edit, photos, sizes" onPress={() => router.push('/admin/products')} />
        <ManageTile icon="grid" label="Categories" sub="Menu sections & seasons" onPress={() => router.push('/admin/categories')} />
        <ManageTile icon="toggle-right" label="Availability" sub="Sold out today" onPress={() => router.push('/admin/menu')} />
        <ManageTile icon="sliders" label="Drink options" sub="Milk, flavours, add-ons" onPress={() => router.push('/admin/options')} />
        <ManageTile icon="tag" label="Coupons" sub="Discount codes" onPress={() => router.push('/admin/coupons')} />
        <ManageTile icon="settings" label="Settings" sub="Tax, curbside, delivery" onPress={() => router.push('/admin/settings')} />
      </View>

      <T variant="overline" style={{ marginTop: space.xxl }}>Orders</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: space.md }}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            selected={filter === f.key}
            onPress={() => {
              setOrders(null);
              setFilter(f.key);
            }}
          />
        ))}
      </ScrollView>

      {error && <Notice tone="danger">{error}</Notice>}
      {orders === null ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 130 }} />)}
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="inbox" size={28} color={colors.creamMuted} />
          <T variant="heading">No orders here</T>
          <T variant="small">New paid orders appear automatically.</T>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {orders.map((o, i) => {
            const next = nextStatus(o);
            return (
              <Animated.View key={o.id} entering={FadeInDown.delay(Math.min(i, 6) * 50)} layout={LinearTransition}>
                <PressableScale onPress={() => router.push(`/admin/order/${o.id}`)} scaleTo={0.98} style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{o.customer_name}</Text>
                      <T variant="small">{o.order_number} · {timeAgo(o.created_at)}</T>
                    </View>
                    <StatusPill status={o.status} />
                  </View>
                  <View style={styles.tags}>
                    <Tag icon={o.pickup_method === 'delivery' ? 'truck' : o.pickup_method === 'curbside' ? 'navigation' : 'home'} text={o.pickup_method_label} />
                    {o.customer_arrived_at && <Tag icon="map-pin" text="Customer is here" hot />}
                    {o.vehicle_details && <Tag icon="truck" text={o.vehicle_details} />}
                  </View>
                  <T variant="small" numberOfLines={2} style={{ color: colors.creamSoft }}>
                    {o.items.map((it) => `${it.quantity}× ${it.name}${it.size_name ? ` (${it.size_name})` : ''}`).join(' · ')}
                  </T>
                  <View style={styles.cardFoot}>
                    <Text style={styles.total}>{money(o.total_amount)}</Text>
                    {next && (
                      <Button title={`Mark ${STATUS_LABEL[next].toLowerCase()}`} size="md" icon="arrow-right" loading={busy === o.id} onPress={() => advance(o)} style={{ paddingHorizontal: 16 }} />
                    )}
                  </View>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      )}
    </PageScreen>
  );
}

function Tag({ icon, text, hot }: { icon: 'truck' | 'navigation' | 'home' | 'map-pin'; text: string; hot?: boolean }) {
  return (
    <View style={[styles.tag, hot && { backgroundColor: colors.successBg, borderColor: 'rgba(143,199,155,0.4)' }]}>
      <Icon name={icon} size={12} color={hot ? colors.success : colors.gold} />
      <Text style={[styles.tagText, hot && { color: colors.success }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  manage: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16 },
  kpiValue: { fontFamily: fonts.display, fontSize: 26, color: colors.goldLight , fontVariant: ['lining-nums'] },
  kpiLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.creamMuted, marginTop: 4 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 },
  name: { fontFamily: fonts.displaySemi, fontSize: 17, color: colors.cream },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, maxWidth: '100%' },
  tagText: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.creamSoft, flexShrink: 1 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  total: { fontFamily: fonts.bold, fontSize: 17, color: colors.goldLight },
});
