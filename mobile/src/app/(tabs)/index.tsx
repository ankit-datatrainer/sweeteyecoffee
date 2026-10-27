import { BlurView } from 'expo-blur';
import { Photo } from '@/components/photo';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Platform, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientGlow, BrandMark, Steam, Wordmark } from '@/components/brand';
import { Contained, TAB_BAR_SPACE } from '@/components/layout';
import { CountUp, Reveal, ScrollYContext } from '@/components/motion';
import { openProduct, priceLabel } from '@/components/product';
import { openQuickAdd } from '@/store/quick-add';
import { Button, Icon, IconButton, PressableScale, SectionTitle, Skeleton, StatusDot, T } from '@/components/ui';
import { greeting } from '@/lib/format';
import type { Product } from '@/lib/types';
import { cartCount, useAuth, useCart, useCatalog, useUi } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

const LEGAL = 'https://sweeteyecoffee.com';

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { store, products, categories, status, load } = useCatalog();
  const user = useAuth((s) => s.user);
  const bagCount = useCart((s) => cartCount(s.lines));
  const introDone = useUi((s) => s.introDone);

  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });

  const heroHeight = Math.max(560, Math.min(height * 0.82, 820));
  const featured = useMemo(() => products.filter((p) => p.is_featured && p.orderable), [products]);
  const heroImage = store?.gallery.find((g) => g.includes('IMG_1994')) ?? store?.gallery[0];

  const heroImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(y.value, [-200, 0, heroHeight], [-100, 0, heroHeight * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [-250, 0], [1.4, 1.06], Extrapolation.CLAMP) },
    ],
  }));
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, heroHeight * 0.55], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(y.value, [0, heroHeight], [0, -80], Extrapolation.CLAMP) }],
  }));
  const headerBg = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [heroHeight * 0.55, heroHeight * 0.8], [0, 1], Extrapolation.CLAMP) }));

  return (
    <ScrollYContext.Provider value={y}>
      <View style={styles.screen}>
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(true)} tintColor={colors.gold} />}>
          {/* ── Hero ── */}
          <View style={{ height: heroHeight, overflow: 'hidden' }}>
            <Animated.View style={[StyleSheet.absoluteFill, heroImageStyle]}>
              {heroImage ? (
                <Photo eager uri={heroImage} width={1080} style={StyleSheet.absoluteFill} transition={600} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
              )}
            </Animated.View>
            <LinearGradient colors={['rgba(14,8,6,0.85)', 'rgba(14,8,6,0.25)', 'rgba(14,8,6,0.55)', colors.bg]} locations={[0, 0.3, 0.68, 1]} style={StyleSheet.absoluteFill} />
            <AmbientGlow intensity={0.5} />

            <Animated.View style={[styles.heroContent, { paddingTop: insets.top + 90 }, heroContentStyle]}>
              <Contained style={{ paddingHorizontal: space.xl, flex: 1, justifyContent: 'flex-end', paddingBottom: 36 }}>
                {introDone && (
                  <>
                    <Animated.View entering={FadeInDown.duration(700)}>
                      <T variant="overline" style={{ color: colors.goldLight }}>Globally sourced · Locally roasted</T>
                    </Animated.View>
                    <Animated.Text entering={FadeInDown.delay(120).duration(800).springify().damping(18)} style={[styles.heroTitle, width > 700 && { fontSize: 64, lineHeight: 70 }]}>
                      Exceptional Coffee,
                    </Animated.Text>
                    <Animated.Text entering={FadeInDown.delay(260).duration(800).springify().damping(18)} style={[styles.heroTitleGold, width > 700 && { fontSize: 64, lineHeight: 72 }]}>
                      Crafted for You
                    </Animated.Text>
                    <Animated.View entering={FadeInDown.delay(400).duration(700)}>
                      <T variant="body" style={styles.heroSub}>
                        Hand-selected beans from premium estates across 15 countries, roasted in small batches to unlock their full potential.
                      </T>
                    </Animated.View>
                    <Animated.View entering={FadeInDown.delay(540).duration(700)} style={styles.heroCtas}>
                      <Button title="Order Now" icon="shopping-bag" onPress={() => router.navigate('/menu')} style={{ flex: 1 }} />
                      <Button title="Our Story" variant="outline" onPress={() => router.push('/about')} style={{ flex: 1 }} />
                    </Animated.View>
                    {store && (
                      <Animated.View entering={FadeInDown.delay(680).duration(700)}>
                        <PressableScale onPress={() => Linking.openURL(store.directions_url)} style={styles.statusCard}>
                          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                          <View style={styles.statusRow}>
                            <StatusDot open={store.status.open} />
                            <Text style={[styles.statusLabel, { color: store.status.open ? colors.success : colors.danger }]}>{store.status.label}</Text>
                            <Text style={styles.statusDetail}>· {store.status.detail}</Text>
                          </View>
                          <View style={styles.statusRow}>
                            <Icon name="map-pin" size={13} color={colors.creamMuted} />
                            <Text style={styles.statusAddress} numberOfLines={1}>{store.address}</Text>
                            <Icon name="navigation" size={14} color={colors.gold} />
                          </View>
                        </PressableScale>
                      </Animated.View>
                    )}
                  </>
                )}
              </Contained>
            </Animated.View>
          </View>

          {/* ── Stats ── */}
          <Reveal>
            <Contained style={styles.stats}>
              {[
                { to: 15, suffix: '+', label: 'Origins' },
                { to: 10, suffix: 'K+', label: 'Customers' },
                { to: 4.9, decimals: 1, label: 'Rating' },
              ].map((s, i) => (
                <View key={s.label} style={[styles.stat, i > 0 && styles.statDivider]}>
                  <CountUp to={s.to} suffix={s.suffix} decimals={s.decimals} style={styles.statValue} start={introDone} />
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </Contained>
          </Reveal>

          {/* ── Categories ── */}
          <Reveal style={{ marginTop: space.xxxl }}>
            <Contained style={{ paddingHorizontal: space.xl }}>
              <SectionTitle overline="Our selection" title="Explore the Menu" action="Full menu" onAction={() => router.navigate('/menu')} />
            </Contained>
            <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
              {status !== 'ready' && !categories.length
                ? [0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ width: 150, height: 190, borderRadius: radius.lg }} />)
                : categories.map((c, i) => {
                    const cover = products.find((p) => p.category_id === c.id && p.image)?.image;
                    return (
                      <Animated.View key={c.id} entering={FadeIn.delay(i * 60)}>
                        <PressableScale onPress={() => router.navigate({ pathname: '/menu', params: { category: c.slug } })} style={styles.categoryCard}>
                          {cover && <Photo eager uri={cover} width={540} style={StyleSheet.absoluteFill} transition={300} />}
                          <LinearGradient colors={['transparent', 'rgba(14,8,6,0.92)']} locations={[0.25, 1]} style={StyleSheet.absoluteFill} />
                          <View style={styles.categoryText}>
                            <Text style={styles.categoryName} numberOfLines={2}>{c.name}</Text>
                            <Text style={styles.categoryCount}>{c.product_count} items</Text>
                          </View>
                        </PressableScale>
                      </Animated.View>
                    );
                  })}
            </Animated.ScrollView>
          </Reveal>

          {/* ── Featured carousel ── */}
          <Reveal style={{ marginTop: space.xxxl }}>
            <Contained style={{ paddingHorizontal: space.xl }}>
              <SectionTitle overline="Bestsellers" title="Featured Favorites" />
            </Contained>
            <FeaturedCarousel products={featured} />
          </Reveal>

          {/* ── The difference ── */}
          <Reveal style={{ marginTop: space.xxxl }}>
            <Contained style={{ paddingHorizontal: space.xl }}>
              <SectionTitle overline="Why Sweet Eye" title="The Difference" />
              <View style={[styles.diffGrid, width > 760 && { flexDirection: 'row' }]}>
                {[
                  { icon: 'globe' as const, title: 'Globally Sourced', body: 'Premium, specialty-grade beans from the ripest cherries across the world’s finest growing regions.' },
                  { icon: 'sun' as const, title: 'Locally Roasted', body: 'Small-batch roasted fresh to order — never sitting on shelves for months like store-bought coffee.' },
                  { icon: 'award' as const, title: 'Quality Inspected', body: 'Only Grade A specialty beans make the cut, each inspected for defects before roasting.' },
                ].map((d) => (
                  <View key={d.title} style={[styles.diffCard, width > 760 && { flex: 1 }]}>
                    <View style={styles.diffIcon}>
                      <Icon name={d.icon} size={20} color={colors.gold} />
                    </View>
                    <T variant="heading" style={{ marginBottom: 6 }}>{d.title}</T>
                    <T variant="body">{d.body}</T>
                  </View>
                ))}
              </View>
            </Contained>
          </Reveal>

          {/* ── Roasted to order editorial ── */}
          <Reveal style={{ marginTop: space.xxxl }}>
            <Contained style={{ paddingHorizontal: space.xl }}>
              <View style={styles.editorial}>
                <Photo eager uri={store?.gallery.find((g) => g.includes('IMG_1917'))} width={1080} style={StyleSheet.absoluteFill} transition={400} />
                <LinearGradient colors={['rgba(14,8,6,0.1)', 'rgba(14,8,6,0.95)']} style={StyleSheet.absoluteFill} />
                <View style={styles.editorialText}>
                  <T variant="overline">Our process</T>
                  <Text style={styles.quote}>“There are no shortcuts around quality.”</Text>
                  <T variant="body" style={{ color: colors.creamSoft }}>
                    Every batch is roasted only after you order — maximum freshness, vibrant flavor, a coffee you’ll call yours.
                  </T>
                  <Button title="Shop coffee beans" variant="outline" size="md" icon="arrow-right" onPress={() => router.navigate({ pathname: '/menu', params: { category: 'coffee-beans' } })} style={{ alignSelf: 'flex-start', marginTop: space.lg }} />
                </View>
              </View>
            </Contained>
          </Reveal>

          {/* ── Gallery strip ── */}
          {!!store?.gallery.length && (
            <Reveal style={{ marginTop: space.xxxl }}>
              <Contained style={{ paddingHorizontal: space.xl }}>
                <SectionTitle overline="Inside the café" title="Moments at Sweet Eye" action="Gallery" onAction={() => router.push('/gallery')} />
              </Contained>
              <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
                {store.gallery.map((g, i) => (
                  <PressableScale key={g} onPress={() => router.push('/gallery')} style={[styles.galleryTile, i % 2 === 1 && { marginTop: 26 }]}>
                    <Photo eager uri={g} width={540} style={StyleSheet.absoluteFill} transition={300} />
                  </PressableScale>
                ))}
              </Animated.ScrollView>
            </Reveal>
          )}

          {/* ── Visit us ── */}
          {store && (
            <Reveal style={{ marginTop: space.xxxl }}>
              <Contained style={{ paddingHorizontal: space.xl }}>
                <View style={styles.visit}>
                  <AmbientGlow intensity={0.5} />
                  <View style={{ alignItems: 'center', marginBottom: space.lg }}>
                    <Steam width={60} height={46} color={colors.goldGlow} />
                    <T variant="overline">Visit us</T>
                    <T variant="title" style={{ textAlign: 'center', marginTop: 6 }}>Your perfect cup awaits</T>
                  </View>
                  {store.hours.map((h) => (
                    <View key={h.days} style={styles.hoursRow}>
                      <Text style={styles.hoursDays}>{h.days}</Text>
                      <View style={styles.hoursDots} />
                      <Text style={styles.hoursTime}>{h.time}</Text>
                    </View>
                  ))}
                  <T variant="small" style={{ textAlign: 'center', marginTop: space.lg }}>{store.address}</T>
                  <View style={[styles.heroCtas, { marginTop: space.lg }]}>
                    <Button title="Directions" icon="navigation" size="md" onPress={() => Linking.openURL(store.directions_url)} style={{ flex: 1 }} />
                    <Button title="Call" icon="phone" variant="outline" size="md" onPress={() => Linking.openURL(`tel:${store.phone}`)} style={{ flex: 1 }} />
                  </View>
                </View>
              </Contained>
            </Reveal>
          )}

          {/* ── Footer ── */}
          <Contained style={styles.footer}>
            <BrandMark size={54} animate={false} color={colors.goldDeep} />
            <Wordmark width={150} color={colors.creamMuted} />
            <View style={styles.footerLinks}>
              {[
                ['About', () => router.push('/about')],
                ['Gallery', () => router.push('/gallery')],
                ['Contact', () => router.push('/contact')],
                ['Privacy', () => Linking.openURL(`${LEGAL}/privacy-policy`)],
                ['Terms', () => Linking.openURL(`${LEGAL}/terms-and-conditions`)],
                ['Refunds', () => Linking.openURL(`${LEGAL}/refund-policy`)],
              ].map(([label, go]) => (
                <Text key={label as string} onPress={go as () => void} style={styles.footerLink}>{label as string}</Text>
              ))}
            </View>
            <T variant="small" style={{ color: colors.creamFaint }}>© {new Date().getFullYear()} Sweet Eye Coffee Roasters · Cordova, TN</T>
          </Contained>
        </Animated.ScrollView>

        {/* ── Floating header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Animated.View style={[StyleSheet.absoluteFill, headerBg]}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,8,6,0.6)', borderBottomWidth: 1, borderColor: colors.line }]} />
          </Animated.View>
          <Contained style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{greeting()}{user ? `, ${user.name.split(' ')[0]}` : ''}</Text>
              <Text style={styles.brand}>Sweet Eye</Text>
            </View>
            <IconButton name="search" onPress={() => router.navigate({ pathname: '/menu', params: { focus: 'search' } })} />
            <IconButton name="shopping-bag" badge={bagCount} onPress={() => router.navigate('/bag')} />
          </Contained>
        </View>
      </View>
    </ScrollYContext.Provider>
  );
}

/** Snap carousel: the centered card is full size, neighbours tilt and shrink away. */
function FeaturedCarousel({ products }: { products: Product[] }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width * 0.7, 300);
  const gap = 16;
  const snap = cardWidth + gap;
  const sidePad = Math.max(space.xl, (Math.min(width, 1180) - cardWidth) / 2 - (width > 1180 ? 0 : 0));
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  if (!products.length) {
    return (
      <View style={{ flexDirection: 'row', gap, paddingHorizontal: space.xl }}>
        <Skeleton style={{ width: cardWidth, height: cardWidth * 1.45, borderRadius: radius.xl }} />
        <Skeleton style={{ width: cardWidth, height: cardWidth * 1.45, borderRadius: radius.xl }} />
      </View>
    );
  }

  return (
    <Animated.ScrollView
      horizontal
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      snapToInterval={snap}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: sidePad, gap, paddingVertical: 10 }}>
      {products.map((p, i) => (
        <FeaturedCard key={p.id} product={p} index={i} x={x} snap={snap} width={cardWidth} />
      ))}
    </Animated.ScrollView>
  );
}

function FeaturedCard({ product, index, x, snap, width }: { product: Product; index: number; x: SharedValue<number>; snap: number; width: number }) {
  const card = useAnimatedStyle(() => {
    const d = (x.value - index * snap) / snap; // −1 … 0 … 1
    return {
      transform: [
        { perspective: 900 },
        { scale: interpolate(Math.abs(d), [0, 1], [1, 0.88], Extrapolation.CLAMP) },
        { rotateY: `${interpolate(d, [-1, 0, 1], [14, 0, -14], Extrapolation.CLAMP)}deg` },
        { translateY: interpolate(Math.abs(d), [0, 1], [0, 18], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(Math.abs(d), [0, 1.4], [1, 0.55], Extrapolation.CLAMP),
    };
  });
  const image = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value - index * snap, [-snap, snap], [-40, 40], Extrapolation.CLAMP) }, { scale: 1.2 }],
  }));

  return (
    <Animated.View style={[{ width }, card]}>
      <PressableScale onPress={() => openProduct(product)} scaleTo={0.97} style={[styles.featured, { height: width * 1.45 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, image]}>
          <Photo eager uri={product.image} width={800} style={StyleSheet.absoluteFill} transition={400} />
        </Animated.View>
        <LinearGradient colors={['transparent', 'rgba(14,8,6,0.55)', 'rgba(14,8,6,0.97)']} locations={[0.35, 0.6, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.featuredBody}>
          <T variant="overline" style={{ color: colors.goldLight }}>{product.category_name}</T>
          <Text style={styles.featuredName} numberOfLines={2}>{product.name}</Text>
          {!!product.description && <T variant="small" numberOfLines={2} style={{ color: colors.creamSoft }}>{product.description}</T>}
          <View style={styles.featuredFoot}>
            <Text style={styles.featuredPrice}>{priceLabel(product)}</Text>
            <PressableScale
              onPress={(e) => {
                // Don't let the tap also reach the card (which opens the full item page).
                e.stopPropagation();
                openQuickAdd(product);
              }}
              scaleTo={0.82}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Customise and add ${product.name}`}
              style={styles.featuredAdd}>
              <Icon name="plus" size={18} color={colors.espresso} />
            </PressableScale>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  heroContent: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroTitle: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50, color: colors.cream, marginTop: 14, letterSpacing: -0.5 },
  heroTitleGold: { fontFamily: fonts.displayBoldItalic, fontSize: 44, lineHeight: 54, color: colors.gold, letterSpacing: -0.5 },
  heroSub: { marginTop: 14, maxWidth: 520, color: 'rgba(245,237,227,0.75)' },
  heroCtas: { flexDirection: 'row', gap: 12, marginTop: 24, maxWidth: 520 },
  statusCard: {
    marginTop: 18,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
    maxWidth: 520,
    backgroundColor: Platform.OS === 'android' ? 'rgba(20,12,8,0.75)' : 'rgba(20,12,8,0.35)',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusLabel: { fontFamily: fonts.semibold, fontSize: 14 },
  statusDetail: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.creamSoft, flexShrink: 1 },
  statusAddress: { fontFamily: fonts.medium, fontSize: 13, color: colors.creamMuted, flex: 1 },
  stats: {
    flexDirection: 'row',
    marginTop: space.xl,
    paddingHorizontal: space.xl,
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  statDivider: { borderLeftWidth: 1, borderColor: colors.line },
  statValue: { fontFamily: fonts.display, fontSize: 32, color: colors.gold , fontVariant: ['lining-nums'] },
  statLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 2, color: colors.creamMuted, textTransform: 'uppercase', marginTop: 4 },
  categoryRail: { paddingHorizontal: space.xl, gap: 12 },
  categoryCard: {
    width: 150,
    height: 190,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.line,
  },
  categoryText: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  categoryName: { fontFamily: fonts.displaySemi, fontSize: 17, lineHeight: 21, color: colors.cream },
  categoryCount: { fontFamily: fonts.medium, fontSize: 12, color: colors.goldLight, marginTop: 4 },
  featured: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.lineStrong },
  featuredBody: { position: 'absolute', left: 18, right: 18, bottom: 18, gap: 6 },
  featuredName: { fontFamily: fonts.display, fontSize: 26, lineHeight: 31, color: colors.cream },
  featuredFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  featuredPrice: { fontFamily: fonts.bold, fontSize: 18, color: colors.goldLight },
  featuredAdd: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  diffGrid: { gap: 14 },
  diffCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.xl,
  },
  diffIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(212,163,115,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,163,115,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  editorial: { height: 460, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  editorialText: { position: 'absolute', left: 22, right: 22, bottom: 24, gap: 10 },
  quote: { fontFamily: fonts.displayBoldItalic, fontSize: 28, lineHeight: 35, color: colors.cream },
  galleryTile: { width: 160, height: 220, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHigh },
  visit: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    padding: space.xxl,
    overflow: 'hidden',
  },
  hoursRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  hoursDays: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  hoursDots: { flex: 1, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, marginHorizontal: 10, marginTop: 6 },
  hoursTime: { fontFamily: fonts.medium, fontSize: 14, color: colors.goldLight },
  footer: { alignItems: 'center', gap: 12, paddingVertical: space.xxxl, paddingHorizontal: space.xl, marginTop: space.xl },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18, marginVertical: 6 },
  footerLink: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.creamSoft },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.xl },
  greeting: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.creamMuted, letterSpacing: 0.3 },
  brand: { fontFamily: fonts.display, fontSize: 22, color: colors.cream },
});
