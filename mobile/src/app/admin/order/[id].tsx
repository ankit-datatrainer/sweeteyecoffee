import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { orderTotals, StatusPill, Totals } from '@/components/order-bits';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Notice, Skeleton, T } from '@/components/ui';
import { errorMessage, get, patch } from '@/lib/api';
import { dateTime, money, STATUS_LABEL } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { Order, OrderStatus } from '@/lib/types';
import { colors, fonts, space } from '@/theme';

const ALL: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

export default function AdminOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<OrderStatus | null>(null);

  const load = useCallback(() => {
    get<{ order: Order }>(`/admin/orders/${id}`)
      .then((r) => setOrder(r.order))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(load, [load]);

  const setStatus = async (status: OrderStatus) => {
    setSaving(status);
    try {
      const r = await patch<{ order: Order }>(`/admin/orders/${id}/status`, { status });
      setOrder(r.order);
      haptic.success();
      toast.success(`Status → ${STATUS_LABEL[status]}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <PageScreen title={order ? order.order_number : 'Order'}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!order ? (
        !error && <Skeleton style={{ height: 300 }} />
      ) : (
        <View style={{ gap: space.lg }}>
          <Animated.View entering={FadeInDown}>
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.customer}>{order.customer_name}</Text>
                <StatusPill status={order.status} />
              </View>
              <T variant="small">{dateTime(order.created_at)} · {order.pickup_method_label}</T>
              {order.phone && <Text style={styles.link} onPress={() => Linking.openURL(`tel:${order.phone}`)}>{order.phone}</Text>}
              {order.customer_email && <Text style={styles.link} onPress={() => Linking.openURL(`mailto:${order.customer_email}`)}>{order.customer_email}</Text>}
              {order.vehicle_details && <T variant="body">Vehicle: {order.vehicle_details}</T>}
              {order.customer_arrived_at && <Notice tone="success" icon="map-pin">Customer arrived {dateTime(order.customer_arrived_at)}</Notice>}
              {order.delivery_address && <T variant="body">Deliver to: {order.delivery_address}</T>}
              {order.notes && <Notice tone="gold" icon="edit-3">{order.notes}</Notice>}
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80)}>
            <T variant="heading" style={{ marginBottom: space.md }}>Update status</T>
            <View style={styles.statuses}>
              {ALL.filter((s) => order.type === 'delivery' || s !== 'out_for_delivery').map((s) => (
                <Chip key={s} label={saving === s ? 'Saving…' : STATUS_LABEL[s]} selected={order.status === s} onPress={() => setStatus(s)} />
              ))}
            </View>
            <T variant="small" style={{ marginTop: 8 }}>Customers with an email get a message when the order is ready, on its way, completed or cancelled.</T>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140)}>
            <Card style={{ gap: 12 }}>
              {order.items.map((i) => (
                <View key={i.id} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={styles.qty}>{i.quantity}×</Text>
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong">{i.name}{i.size_name ? ` (${i.size_name})` : ''}</T>
                    {!!i.modifiers_label && <T variant="small">{i.modifiers_label}</T>}
                  </View>
                  <T variant="bodyStrong">{money(i.total)}</T>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: colors.line }} />
              <Totals rows={orderTotals(order)} />
              {order.payment && <T variant="small">{order.payment.detail} · {order.payment.status}</T>}
            </Card>
          </Animated.View>
          <Button title="Refresh" variant="outline" icon="refresh-cw" size="md" onPress={load} />
        </View>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  customer: { flex: 1, fontFamily: fonts.display, fontSize: 22, color: colors.cream },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qty: { fontFamily: fonts.bold, fontSize: 15, color: colors.gold, minWidth: 28 },
});
