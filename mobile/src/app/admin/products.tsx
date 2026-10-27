import { router, useFocusEffect } from 'expo-router';
import { Photo } from '@/components/photo';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Badge, useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Chip, Icon, Notice, PressableScale, Skeleton, T } from '@/components/ui';
import { errorMessage, get, post } from '@/lib/api';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useCatalog } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

type Row = {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  price: number;
  image: string | null;
  is_available: boolean;
  is_sold_out: boolean;
  is_featured: boolean;
  size_count: number;
};

export default function AdminProductsScreen() {
  const staff = useStaffOnly();
  const reloadMenu = useCatalog((s) => s.load);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    get<{ products: Row[] }>('/admin/products')
      .then((r) => setRows(r.products))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (staff) load();
    }, [staff, load]),
  );

  const categories = useMemo(() => {
    const seen = new Map<number, string>();
    rows?.forEach((r) => seen.set(r.category_id, r.category_name));
    return [...seen.entries()];
  }, [rows]);

  const visible = (rows ?? []).filter(
    (r) => (category === null || r.category_id === category) && r.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const canReorder = category !== null && !q.trim() && visible.length > 1;

  /** Swap an item with its neighbour and save the new order for the category. */
  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= visible.length || saving) return;
    const ids = visible.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const byId = new Map(rows!.map((r) => [r.id, r]));
    const others = rows!.filter((r) => r.category_id !== category);
    const firstIndex = rows!.findIndex((r) => r.category_id === category);
    const reordered = ids.map((id) => byId.get(id)!);
    setRows([...others.slice(0, firstIndex), ...reordered, ...others.slice(firstIndex)]);
    haptic.tap();
    setSaving(true);
    try {
      await post('/admin/products/reorder', { ids });
      reloadMenu(true);
    } catch (e) {
      toast.error(errorMessage(e));
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageScreen
      title="Products"
      right={
        <Button
          title="New"
          icon="plus"
          size="md"
          onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: 'new', ...(category ? { category: String(category) } : {}) } })}
          style={{ paddingHorizontal: 16 }}
        />
      }>
      <View style={styles.search}>
        <Icon name="search" size={16} color={colors.creamMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Find a product" placeholderTextColor={colors.creamFaint} style={styles.searchInput} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: space.md }}>
        <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
        {categories.map(([id, name]) => (
          <Chip key={id} label={name} selected={category === id} onPress={() => setCategory(id)} />
        ))}
      </ScrollView>
      {canReorder && <T variant="small" style={{ marginBottom: space.md }}>Use the arrows to change the order customers see in this category.</T>}
      {error && <Notice tone="danger">{error}</Notice>}

      {!rows ? (
        <View style={{ gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 76 }} />)}</View>
      ) : visible.length === 0 ? (
        <T variant="body" style={{ textAlign: 'center', paddingVertical: 40 }}>No products match.</T>
      ) : (
        <View style={styles.list}>
          {visible.map((p, i) => (
            <Animated.View key={p.id} layout={LinearTransition.springify().damping(20)} entering={FadeIn.delay(Math.min(i, 10) * 30)} style={i > 0 && styles.border}>
              <PressableScale onPress={() => router.push({ pathname: '/admin/product/[id]', params: { id: String(p.id) } })} scaleTo={0.985} style={styles.row}>
                <Photo uri={p.image} width={160} style={styles.image} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <T variant="small" numberOfLines={1}>
                    {category === null ? `${p.category_name} · ` : ''}
                    {money(p.price)}
                    {p.size_count ? ` · ${p.size_count} sizes` : ''}
                  </T>
                  <View style={styles.badges}>
                    {!p.is_available && <Badge text="Hidden" />}
                    {p.is_sold_out && <Badge text="Sold out" tone="danger" />}
                    {p.is_featured && <Badge text="Featured" tone="gold" />}
                    {!p.image && <Badge text="No photo" tone="info" />}
                  </View>
                </View>
                {canReorder ? (
                  <View style={{ gap: 4 }}>
                    <PressableScale onPress={() => move(i, -1)} scaleTo={0.85} style={[styles.arrow, i === 0 && { opacity: 0.3 }]}>
                      <Icon name="chevron-up" size={16} />
                    </PressableScale>
                    <PressableScale onPress={() => move(i, 1)} scaleTo={0.85} style={[styles.arrow, i === visible.length - 1 && { opacity: 0.3 }]}>
                      <Icon name="chevron-down" size={16} />
                    </PressableScale>
                  </View>
                ) : (
                  <Icon name="chevron-right" size={18} color={colors.creamFaint} />
                )}
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.cream, outlineStyle: 'none' as any },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  border: { borderTopWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  image: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.surfaceHigh },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  arrow: { width: 32, height: 28, borderRadius: 10, backgroundColor: 'rgba(245,237,227,0.06)', alignItems: 'center', justifyContent: 'center' },
});
