import { router, useFocusEffect } from 'expo-router';
import { Photo } from '@/components/photo';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientGlow, Steam } from '@/components/brand';
import { TAB_BAR_SPACE } from '@/components/layout';
import { StatusPill } from '@/components/order-bits';
import { Button, Icon, Notice, PressableScale, Skeleton, T } from '@/components/ui';
import { errorMessage, get, post } from '@/lib/api';
import { money, shortDate } from '@/lib/format';
import type { Order } from '@/lib/types';
import { useAuth, useGuestOrders } from '@/store';
import { colors, fonts, MAX_WIDTH, radius, space } from '@/theme';

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const authReady = useAuth((s) => s.ready);
  const guestOrders = useGuestOrders((s) => s.orders);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = user
        ? await get<{ orders: Order[] }>('/orders')
        : await post<{ orders: Order[] }>('/orders/lookup', { tokens: guestOrders.map((o) => ({ id: o.id, token: o.token })) });
      setOrders(r.orders);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [user, guestOrders]);

  useFocusEffect(
    useCallback(() => {
      if (authReady) load();
    }, [authReady, load]),
  );

  const active = orders?.filter((o) => !['delivered', 'cancelled'].includes(o.status)) ?? [];

  return (
    <View style={styles.screen}>
      <AmbientGlow intensity={0.5} />
      <FlatList
        data={orders ?? []}
        keyExtractor={(o) => String(o.id)}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: TAB_BAR_SPACE + insets.bottom, paddingHorizontal: space.xl, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 12 }}
        ListHeaderComponent={
          <View style={{ marginBottom: space.md }}>
            <T variant="overline">Your history</T>
            <T variant="display" style={{ marginTop: 6 }}>Orders</T>
            {active.length > 0 && (
              <Animated.View entering={FadeInDown} style={styles.activeBanner}>
                <Steam width={34} height={30} color={colors.goldGlow} />
                <Text style={styles.activeText}>{active.length} order{active.length > 1 ? 's' : ''} in progress</Text>
              </Animated.View>
            )}
            {!user && (
              <PressableScale onPress={() => router.push('/auth/sign-in')} style={styles.signIn}>
                <Icon name="user" size={16} color={colors.gold} />
                <Text style={styles.signInText}>
                  Showing orders placed on this device. <Text style={{ color: colors.gold }}>Sign in</Text> to see your full history.
                </Text>
              </PressableScale>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 60)}>
            <PressableScale onPress={() => router.push(`/order/${item.id}`)} scaleTo={0.98} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.number}>{item.order_number}</Text>
                  <T variant="small">{shortDate(item.created_at)} · {item.pickup_method_label}</T>
                </View>
                <StatusPill status={item.status} />
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.thumbs}>
                  {item.items.slice(0, 4).map((i, n) => (
                    <Photo eager key={i.id} uri={i.image} width={160} style={[styles.thumb, { marginLeft: n ? -14 : 0, zIndex: 10 - n }]} />
                  ))}
                  {item.items.length > 4 && <Text style={styles.more}>+{item.items.length - 4}</Text>}
                </View>
                <Text style={styles.total}>{money(item.total_amount)}</Text>
                <Icon name="chevron-right" size={18} color={colors.creamFaint} />
              </View>
            </PressableScale>
          </Animated.View>
        )}
        ListEmptyComponent={
          orders === null && !error ? (
            <View style={{ gap: 12 }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 120, borderRadius: radius.lg }} />)}
            </View>
          ) : (
            <View style={styles.empty}>
              <Steam width={60} height={52} />
              <T variant="heading">No orders yet</T>
              <T variant="small" style={{ textAlign: 'center' }}>When you place an order it will show up here, with live status.</T>
              <Button title="Start an order" icon="coffee" size="md" onPress={() => router.navigate('/menu')} style={{ marginTop: 8, paddingHorizontal: 28 }} />
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: space.lg,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(212,163,115,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,163,115,0.22)',
  },
  activeText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.goldLight },
  signIn: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: space.lg, padding: 14, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  signInText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.creamSoft },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  number: { fontFamily: fonts.bold, fontSize: 15.5, letterSpacing: 0.4, color: colors.cream, marginBottom: 2 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumbs: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  thumb: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: colors.card, backgroundColor: colors.surfaceHigh },
  more: { fontFamily: fonts.semibold, fontSize: 12, color: colors.creamMuted, marginLeft: 8 },
  total: { fontFamily: fonts.bold, fontSize: 16, color: colors.goldLight },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 50 },
});
