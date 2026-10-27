import { BlurView } from 'expo-blur';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ScrollViewInstance, type TextInputInstance } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientGlow, Steam } from '@/components/brand';
import { TAB_BAR_SPACE } from '@/components/layout';
import { ProductCard } from '@/components/product';
import { Button, Icon, PressableScale, Skeleton, T } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import type { Category, Product } from '@/lib/types';
import { useCatalog } from '@/store';
import { colors, fonts, MAX_WIDTH, radius, space, springs } from '@/theme';

type Row =
  | { type: 'header'; key: string; category: Category }
  | { type: 'items'; key: string; items: Product[] };

export default function MenuScreen() {
  const params = useLocalSearchParams<{ category?: string; focus?: string }>();
  const { categories, products, status, error, load } = useCatalog();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [active, setActive] = useState<string>(params.category ?? 'all');
  // Follow ?category= when another screen links here (adjusting state during render, not in an effect).
  const [linkedCategory, setLinkedCategory] = useState(params.category);
  if (params.category !== linkedCategory) {
    setLinkedCategory(params.category);
    if (params.category) setActive(params.category);
  }
  const [query, setQuery] = useState('');
  const listRef = useRef<FlatList<Row>>(null);
  const searchRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (params.focus === 'search') setTimeout(() => searchRef.current?.focus(), 350);
  }, [params.focus]);

  const contentWidth = Math.min(width, MAX_WIDTH) - space.xl * 2;
  const columns = contentWidth > 1000 ? 4 : contentWidth > 680 ? 3 : 2;
  const gap = 14;
  const cardWidth = (contentWidth - gap * (columns - 1)) / columns;

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = products.filter(
      (p) =>
        (active === 'all' || p.category_slug === active) &&
        (!q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)),
    );
    const out: Row[] = [];
    const chunk = (items: Product[], prefix: string) => {
      for (let i = 0; i < items.length; i += columns) out.push({ type: 'items', key: `${prefix}-${i}`, items: items.slice(i, i + columns) });
    };
    if (active === 'all' && !q) {
      for (const c of categories) {
        const items = matches.filter((p) => p.category_id === c.id);
        if (!items.length) continue;
        out.push({ type: 'header', key: `h-${c.id}`, category: c });
        chunk(items, `c${c.id}`);
      }
    } else {
      chunk(matches, `${active}-${q}`);
    }
    return out;
  }, [products, categories, active, query, columns]);

  const selectCategory = (slug: string) => {
    haptic.tap();
    setActive(slug);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const activeCategory = categories.find((c) => c.slug === active);
  const resultCount = rows.reduce((n, r) => n + (r.type === 'items' ? r.items.length : 0), 0);

  return (
    <View style={styles.screen}>
      <AmbientGlow intensity={0.5} />
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.key}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickyHeaderIndices={[0]}
        refreshing={false}
        onRefresh={() => load(true)}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        ListHeaderComponent={
          <View style={{ paddingTop: insets.top }}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,8,6,0.78)', borderBottomWidth: 1, borderColor: colors.line }]} />
            <View style={styles.headerInner}>
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <T variant="overline">Sweet Eye</T>
                  <T variant="display">Our Menu</T>
                </View>
                <Steam width={44} height={40} color={colors.goldGlow} />
              </View>
              <View style={styles.search}>
                <Icon name="search" size={17} color={colors.creamMuted} />
                <TextInput
                  ref={searchRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search lattes, pastries, beans…"
                  placeholderTextColor={colors.creamFaint}
                  selectionColor={colors.gold}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {!!query && (
                  <PressableScale onPress={() => setQuery('')} scaleTo={0.8}>
                    <Icon name="x-circle" size={17} color={colors.creamMuted} />
                  </PressableScale>
                )}
              </View>
            </View>
            <CategoryTabs categories={categories} active={active} onSelect={selectCategory} />
          </View>
        }
        renderItem={({ item, index }) =>
          item.type === 'header' ? (
            <Animated.View entering={FadeIn.duration(400)} style={[styles.contained, styles.sectionHeader]}>
              <T variant="title">{item.category.name}</T>
              <Text style={styles.sectionCount}>{item.category.product_count}</Text>
            </Animated.View>
          ) : (
            <Animated.View layout={LinearTransition.springify().damping(20)} style={[styles.contained, { flexDirection: 'row', gap, marginBottom: gap }]}>
              {item.items.map((p, i) => (
                <ProductCard key={p.id} product={p} width={cardWidth} index={(index % 6) * columns + i} />
              ))}
            </Animated.View>
          )
        }
        ListEmptyComponent={
          status === 'loading' || status === 'idle' ? (
            <View style={[styles.contained, { flexDirection: 'row', flexWrap: 'wrap', gap, paddingTop: space.lg }]}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} style={{ width: cardWidth, height: cardWidth * 1.45, borderRadius: radius.lg }} />
              ))}
            </View>
          ) : status === 'error' ? (
            <View style={[styles.contained, styles.empty]}>
              <Icon name="wifi-off" size={30} color={colors.creamMuted} />
              <T variant="heading">Can’t load the menu</T>
              <T variant="small" style={{ textAlign: 'center' }}>{error}</T>
              <Button title="Try again" size="md" onPress={() => load(true)} style={{ marginTop: 8 }} />
            </View>
          ) : (
            <Animated.View entering={FadeInDown} style={[styles.contained, styles.empty]}>
              <Steam width={60} height={50} />
              <T variant="heading">Nothing matches “{query}”</T>
              <T variant="small">Try another word or browse a category.</T>
            </Animated.View>
          )
        }
        ListFooterComponent={
          rows.length && (query || activeCategory) ? (
            <T variant="small" style={[styles.contained, { textAlign: 'center', marginTop: 10 }]}>
              {resultCount} {resultCount === 1 ? 'item' : 'items'}{activeCategory ? ` in ${activeCategory.name}` : ''}
            </T>
          ) : undefined
        }
      />
    </View>
  );
}

/** Horizontally scrolling category tabs with a gliding gold underline. */
function CategoryTabs({ categories, active, onSelect }: { categories: Category[]; active: string; onSelect: (slug: string) => void }) {
  const tabs = useMemo(() => [{ slug: 'all', name: 'All' }, ...categories.map((c) => ({ slug: c.slug, name: c.name }))], [categories]);
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const scrollRef = useRef<ScrollViewInstance>(null);
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    const l = layouts.current[active];
    if (!l) return;
    x.value = withSpring(l.x, springs.snappy);
    w.value = withSpring(l.width, springs.snappy);
    scrollRef.current?.scrollTo({ x: Math.max(0, l.x - 60), animated: true });
  }, [active, measured, x, w]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));

  const onLayout = (slug: string) => (e: LayoutChangeEvent) => {
    layouts.current[slug] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
    setMeasured((n) => n + 1);
  };

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      <Animated.View style={[styles.indicator, indicator]} />
      {tabs.map((t) => (
        <View key={t.slug} onLayout={onLayout(t.slug)}>
          <PressableScale onPress={() => onSelect(t.slug)} scaleTo={0.92} haptics={false} style={styles.tab}>
            <Text style={[styles.tabText, active === t.slug && styles.tabTextActive]}>{t.name}</Text>
          </PressableScale>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  contained: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.xl },
  headerInner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,237,227,0.05)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.cream, height: '100%', outlineStyle: 'none' as any },
  tabs: { paddingHorizontal: space.xl, paddingVertical: 12, gap: 4, alignItems: 'center' },
  tab: { paddingHorizontal: 14, paddingVertical: 9 },
  tabText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.creamMuted },
  tabTextActive: { color: colors.espresso },
  indicator: { position: 'absolute', left: 0, top: 12, bottom: 12, borderRadius: radius.pill, backgroundColor: colors.gold },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: space.xl, marginBottom: space.md },
  sectionCount: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 60 },
});
