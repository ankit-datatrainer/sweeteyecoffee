import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Badge, useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { Button, Icon, Notice, PressableScale, Skeleton, T } from '@/components/ui';
import { seasonText, type AdminCategory } from '@/lib/admin';
import { errorMessage, get } from '@/lib/api';
import { colors, fonts, radius, space } from '@/theme';

export default function AdminCategoriesScreen() {
  const staff = useStaffOnly();
  const [rows, setRows] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!staff) return;
      get<{ categories: AdminCategory[] }>('/admin/categories')
        .then((r) => setRows(r.categories))
        .catch((e) => setError(errorMessage(e)));
    }, [staff]),
  );

  return (
    <PageScreen
      title="Categories"
      right={<Button title="New" icon="plus" size="md" onPress={() => router.push({ pathname: '/admin/category/[id]', params: { id: 'new' } })} style={{ paddingHorizontal: 16 }} />}>
      <T variant="body" style={{ marginBottom: space.lg }}>
        Sections of the menu, in the order customers see them. Seasonal menus only appear between their dates (and only once they have items).
      </T>
      {error && <Notice tone="danger">{error}</Notice>}
      {!rows ? (
        <View style={{ gap: 10 }}>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 70 }} />)}</View>
      ) : (
        <View style={styles.list}>
          {rows.map((c, i) => (
            <Animated.View key={c.id} entering={FadeInDown.delay(Math.min(i, 10) * 35)} style={i > 0 && styles.border}>
              <PressableScale onPress={() => router.push({ pathname: '/admin/category/[id]', params: { id: String(c.id) } })} scaleTo={0.985} style={styles.row}>
                <Text style={styles.order}>{c.sort_order}</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <View style={styles.badges}>
                    <T variant="small">{c.product_count} {c.product_count === 1 ? 'item' : 'items'}</T>
                    {!c.is_active && <Badge text="Off" />}
                    {c.season_start && c.season_end && <Badge text={seasonText(c.season_start, c.season_end)} tone="info" />}
                  </View>
                </View>
                <Icon name="chevron-right" size={18} color={colors.creamFaint} />
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  border: { borderTopWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  order: { fontFamily: fonts.bold, fontSize: 13, color: colors.gold, minWidth: 22, textAlign: 'center' },
  name: { fontFamily: fonts.displaySemi, fontSize: 17, color: colors.cream },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
});
