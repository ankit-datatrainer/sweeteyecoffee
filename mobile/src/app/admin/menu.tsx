import { useEffect, useMemo, useState } from 'react';
import { Photo } from '@/components/photo';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Icon, Notice, Skeleton, T } from '@/components/ui';
import { errorMessage, get, patch } from '@/lib/api';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useCatalog } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

// react-native-web colours the "on" thumb with its own prop.
const webThumb = { activeThumbColor: colors.cream } as object;

type AdminProduct = { id: number; name: string; price: number; image: string | null; is_available: boolean; is_sold_out: boolean; category_name: string };

/** Quick sold-out switches for the counter, synced to the live menu. */
export default function AdminMenuScreen() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const reloadCatalog = useCatalog((s) => s.load);

  useEffect(() => {
    get<{ products: AdminProduct[] }>('/admin/products')
      .then((r) => setProducts(r.products))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const filtered = useMemo(() => (products ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())), [products, q]);

  const toggle = async (p: AdminProduct, field: 'is_sold_out' | 'is_available', value: boolean) => {
    setProducts((all) => all?.map((x) => (x.id === p.id ? { ...x, [field]: value } : x)) ?? null);
    haptic.tap();
    try {
      await patch(`/admin/products/${p.id}`, { [field]: value });
      reloadCatalog(true);
    } catch (e) {
      setProducts((all) => all?.map((x) => (x.id === p.id ? { ...x, [field]: !value } : x)) ?? null);
      toast.error(errorMessage(e));
    }
  };

  return (
    <PageScreen title="Menu availability">
      <T variant="body" style={{ marginBottom: space.lg }}>Mark items sold out for today, or hide them from the menu. Changes are live for every customer.</T>
      <View style={styles.search}>
        <Icon name="search" size={16} color={colors.creamMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Find an item" placeholderTextColor={colors.creamFaint} style={styles.searchInput} />
      </View>
      {error && <Notice tone="danger">{error}</Notice>}
      {!products ? (
        <View style={{ gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 72 }} />)}</View>
      ) : (
        <View style={styles.list}>
          {filtered.map((p, i) => (
            <View key={p.id} style={[styles.row, i > 0 && styles.border]}>
              <Photo uri={p.image} width={160} style={styles.image} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                <T variant="small">{p.category_name} · {money(p.price)}</T>
              </View>
              <View style={styles.switchCol}>
                <Text style={[styles.switchLabel, p.is_sold_out && { color: colors.danger }]}>Sold out</Text>
                <Switch value={p.is_sold_out} onValueChange={(v) => toggle(p, 'is_sold_out', v)} trackColor={{ true: colors.danger, false: colors.surfaceHigh }} thumbColor={colors.cream} {...webThumb} />
              </View>
              <View style={styles.switchCol}>
                <Text style={styles.switchLabel}>On menu</Text>
                <Switch value={p.is_available} onValueChange={(v) => toggle(p, 'is_available', v)} trackColor={{ true: colors.gold, false: colors.surfaceHigh }} thumbColor={colors.cream} {...webThumb} />
              </View>
            </View>
          ))}
        </View>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, marginBottom: space.lg },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.cream, outlineStyle: 'none' as any },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  border: { borderTopWidth: 1, borderColor: colors.line },
  image: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.surfaceHigh },
  name: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.cream },
  switchCol: { alignItems: 'center', gap: 2 },
  switchLabel: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.creamMuted },
});
