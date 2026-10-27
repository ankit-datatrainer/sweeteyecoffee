import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Badge, useStaffOnly } from '@/components/admin';
import { Steam } from '@/components/brand';
import { PageScreen } from '@/components/layout';
import { Button, Icon, Notice, PressableScale, Skeleton, T } from '@/components/ui';
import { COUPON_STATE, type AdminCoupon } from '@/lib/admin';
import { errorMessage, get } from '@/lib/api';
import { money } from '@/lib/format';
import { colors, fonts, radius, space } from '@/theme';

export default function AdminCouponsScreen() {
  const staff = useStaffOnly();
  const [rows, setRows] = useState<AdminCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!staff) return;
      get<{ coupons: AdminCoupon[] }>('/admin/coupons')
        .then((r) => setRows(r.coupons))
        .catch((e) => setError(errorMessage(e)));
    }, [staff]),
  );

  return (
    <PageScreen
      title="Coupons"
      right={<Button title="New" icon="plus" size="md" onPress={() => router.push({ pathname: '/admin/coupon/[id]', params: { id: 'new' } })} style={{ paddingHorizontal: 16 }} />}>
      <T variant="body" style={{ marginBottom: space.lg }}>Codes customers can enter in their bag. A use is counted when an order is paid.</T>
      {error && <Notice tone="danger">{error}</Notice>}
      {!rows ? (
        <View style={{ gap: 10 }}>{[0, 1].map((i) => <Skeleton key={i} style={{ height: 84 }} />)}</View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Steam width={50} height={44} />
          <T variant="heading">No coupons yet</T>
          <Button title="Create a coupon" icon="tag" size="md" onPress={() => router.push({ pathname: '/admin/coupon/[id]', params: { id: 'new' } })} style={{ paddingHorizontal: 24 }} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((c, i) => {
            const state = COUPON_STATE[c.state];
            return (
              <Animated.View key={c.id} entering={FadeInDown.delay(Math.min(i, 8) * 50)}>
                <PressableScale onPress={() => router.push({ pathname: '/admin/coupon/[id]', params: { id: String(c.id) } })} scaleTo={0.985} style={styles.card}>
                  <View style={styles.ticket}>
                    <Icon name="tag" size={18} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.code}>{c.code}</Text>
                      <Badge text={state.label} tone={state.tone} />
                    </View>
                    <T variant="smallStrong" style={{ color: colors.goldLight }}>{c.label}{c.min_order_amount ? ` · min ${money(c.min_order_amount)}` : ''}</T>
                    <T variant="small">
                      Used {c.used_count}{c.max_uses ? ` of ${c.max_uses}` : ''} times{c.expires_at ? ` · ends ${c.expires_at.replace('T', ' ')}` : ''}
                    </T>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.creamFaint} />
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  ticket: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,163,115,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: 1, color: colors.cream },
});
