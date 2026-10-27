import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Photo } from '@/components/photo';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { BeanBurst, StatusPill, SuccessBadge, Timeline, orderTotals, Totals } from '@/components/order-bits';
import { toast } from '@/components/toast';
import { Button, Card, Icon, Notice, Skeleton, T } from '@/components/ui';
import { errorMessage, get, post } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { Order } from '@/lib/types';
import { useCatalog, useGuestOrders } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

const FINAL = ['delivered', 'cancelled'];

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const token = useGuestOrders((s) => s.tokenFor(Number(id)));
  const store = useCatalog((s) => s.store);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arriving, setArriving] = useState(false);
  const headers = token ? { 'X-Order-Token': token } : undefined;

  const load = useCallback(
    () =>
      get<{ order: Order }>(`/orders/${id}`, { headers: token ? { 'X-Order-Token': token } : undefined })
        .then((r) => setOrder(r.order))
        .catch((e) => setError(errorMessage(e))),
    [id, token],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live status: check every 15 seconds until the order is finished — only
  // while this screen is showing and the app (or browser tab) is in front.
  const finished = !order || FINAL.includes(order.status);
  useFocusEffect(
    useCallback(() => {
      if (finished) return;
      const timer = setInterval(() => AppState.currentState === 'active' && load(), 15000);
      return () => clearInterval(timer);
    }, [finished, load]),
  );

  const arrived = async () => {
    setArriving(true);
    try {
      const r = await post<{ order: Order; message: string }>(`/orders/${id}/arrived`, {}, { headers });
      setOrder(r.order);
      haptic.success();
      toast.success(r.message);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setArriving(false);
    }
  };

  const celebrating = placed === '1';

  return (
    <PageScreen title={celebrating ? 'Order placed' : 'Order details'}>
      {!order ? (
        error ? (
          <Notice tone="danger">{error}</Notice>
        ) : (
          <View style={{ gap: 14 }}>
            <Skeleton style={{ height: 160 }} />
            <Skeleton style={{ height: 240 }} />
          </View>
        )
      ) : (
        <>
          {celebrating && (
            <View style={styles.celebrate}>
              <BeanBurst />
              <SuccessBadge />
              <Animated.View entering={FadeInDown.delay(700)} style={{ alignItems: 'center', gap: 6, marginTop: space.lg }}>
                <T variant="title" style={{ textAlign: 'center' }}>Thank you{order.customer_name ? `, ${order.customer_name.split(' ')[0]}` : ''}!</T>
                <T variant="body" style={{ textAlign: 'center' }}>
                  {order.customer_email ? `A receipt is on its way to ${order.customer_email}.` : 'Your order has been placed successfully.'}
                </T>
              </Animated.View>
            </View>
          )}

          <Animated.View entering={FadeInDown.delay(celebrating ? 900 : 0)}>
            <Card style={{ gap: 12 }}>
              <View style={styles.headRow}>
                <View style={{ flex: 1 }}>
                  <T variant="overline">Order</T>
                  <Text style={styles.number}>{order.order_number}</Text>
                </View>
                <StatusPill status={order.status} />
              </View>
              <View style={styles.metaRow}>
                <Meta icon={order.pickup_method === 'delivery' ? 'truck' : order.pickup_method === 'curbside' ? 'navigation' : 'home'} text={order.pickup_method_label} />
                <Meta icon="calendar" text={dateTime(order.created_at)} />
              </View>
              {order.delivery_address && <Meta icon="map-pin" text={order.delivery_address} />}
              {order.vehicle_details && <Meta icon="truck" text={order.vehicle_details} />}
            </Card>
          </Animated.View>

          {order.pickup_method === 'curbside' && !FINAL.includes(order.status) && (
            <Animated.View entering={FadeIn} style={{ marginTop: space.lg }}>
              {order.customer_arrived_at ? (
                <Notice tone="success" icon="check-circle">We know you’re here — we’ll bring your order right out.</Notice>
              ) : (
                <Button title="I’m here" icon="map-pin" loading={arriving} onPress={arrived} />
              )}
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(celebrating ? 1000 : 80)}>
            <T variant="heading" style={styles.sectionTitle}>Progress</T>
            <Card>
              <Timeline order={order} />
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(celebrating ? 1100 : 160)}>
            <T variant="heading" style={styles.sectionTitle}>Items</T>
            <Card style={{ gap: 14 }}>
              {order.items.map((i) => (
                <View key={i.id} style={styles.item}>
                  <Photo eager uri={i.image} width={160} style={styles.itemImage} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{i.quantity} × {i.name}</Text>
                    {!!(i.size_name || i.modifiers_label) && <T variant="small">{[i.size_name, i.modifiers_label].filter(Boolean).join(' · ')}</T>}
                  </View>
                  <Text style={styles.itemPrice}>{money(i.total)}</Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: colors.line }} />
              <Totals rows={orderTotals(order)} />
              {order.payment && (
                <View style={styles.payRow}>
                  <Icon name="credit-card" size={14} color={colors.creamMuted} />
                  <T variant="small">{order.payment.detail ?? 'Card'} · {order.payment.status === 'completed' ? 'Paid' : order.payment.status}</T>
                </View>
              )}
            </Card>
          </Animated.View>

          {order.type !== 'delivery' && store && (
            <Animated.View entering={FadeInDown.delay(celebrating ? 1200 : 240)}>
              <T variant="heading" style={styles.sectionTitle}>Pick up at</T>
              <Card style={{ gap: 10 }}>
                <T variant="bodyStrong">Sweet Eye Coffee Roasters</T>
                <T variant="small">{store.address}</T>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <Button title="Directions" icon="navigation" size="md" onPress={() => Linking.openURL(store.directions_url)} style={{ flex: 1 }} />
                  <Button title="Call" icon="phone" variant="outline" size="md" onPress={() => Linking.openURL(`tel:${store.phone}`)} style={{ flex: 1 }} />
                </View>
              </Card>
            </Animated.View>
          )}

          {celebrating && (
            <Button title="Back to home" variant="outline" onPress={() => router.replace('/')} style={{ marginTop: space.xxl }} />
          )}
        </>
      )}
    </PageScreen>
  );
}

function Meta({ icon, text }: { icon: 'home' | 'truck' | 'navigation' | 'calendar' | 'map-pin'; text: string }) {
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={14} color={colors.gold} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  celebrate: { alignItems: 'center', paddingTop: 50, paddingBottom: space.xxl },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  number: { fontFamily: fonts.bold, fontSize: 19, letterSpacing: 0.5, color: colors.cream, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  metaText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.creamSoft, flexShrink: 1 },
  sectionTitle: { marginTop: space.xxl, marginBottom: space.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemImage: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh },
  itemName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.cream },
  itemPrice: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.goldLight },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
});
