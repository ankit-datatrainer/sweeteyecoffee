import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionsForm, useCustomizer } from '@/components/customize';
import { goBack, StickyFooter } from '@/components/layout';
import { Photo } from '@/components/photo';
import { RollingPrice, Stepper } from '@/components/product';
import { Button, IconButton, Skeleton, T } from '@/components/ui';
import { errorMessage, get } from '@/lib/api';
import type { Product } from '@/lib/types';
import { cartCount, useCart, useCatalog } from '@/store';
import { colors, fonts, MAX_WIDTH, radius, space, springs } from '@/theme';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cached = useCatalog((s) => s.products.find((p) => p.id === Number(id)));
  const [product, setProduct] = useState<Product | undefined>(cached);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Always refresh: sold-out flags and prices can change while the app is open.
    get<{ product: Product }>(`/products/${id}`)
      .then((r) => setProduct(r.product))
      .catch((e) => !cached && setLoadError(errorMessage(e)));
  }, [id, cached]);

  if (!product) {
    return (
      <View style={[styles.screen, { padding: space.xl, justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
        {loadError ? (
          <>
            <T variant="heading">{loadError}</T>
            <Button title="Back to menu" size="md" onPress={goBack} />
          </>
        ) : (
          <Skeleton style={{ width: '100%', height: 360, borderRadius: radius.xl }} />
        )}
      </View>
    );
  }
  return <Customizer key={product.id} product={product} />;
}

function Customizer({ product }: { product: Product }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const bagCount = useCart((s) => cartCount(s.lines));
  const wide = width >= 900;
  const c = useCustomizer(product);
  const { image, iced, unitPrice, quantity, setQuantity, adding } = c;
  const [added, setAdded] = useState(false);

  const add = async () => {
    if (await c.add()) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1600);
    }
  };

  // ── Motion ──
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const heroHeight = wide ? Math.min(height - 120, 640) : Math.min(height * 0.56, 520);
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(y.value, [-300, 0, heroHeight], [-150, 0, heroHeight * 0.5], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [-300, 0], [1.6, 1], Extrapolation.CLAMP) },
    ],
  }));
  const topBar = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [heroHeight - 140, heroHeight - 80], [0, 1], Extrapolation.CLAMP) }));

  const bounce = useSharedValue(1);
  useEffect(() => {
    if (added) bounce.value = withSequence(withSpring(1.06, springs.bouncy), withSpring(1, springs.snappy));
  }, [added, bounce]);
  const addStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));

  const shine = useSharedValue(0);
  useEffect(() => {
    shine.value = 0;
    shine.value = withTiming(1, { duration: 700 });
  }, [image, shine]);
  const shineStyle = useAnimatedStyle(() => ({ opacity: interpolate(shine.value, [0, 0.4, 1], [0, 0.35, 0]) }));

  const hero = (
    <View style={[styles.hero, { height: heroHeight }, wide && styles.heroWide]}>
      <Animated.View style={[StyleSheet.absoluteFill, !wide && heroStyle]}>
        <Photo eager uri={image} width={1080} style={StyleSheet.absoluteFill} transition={450} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: iced ? '#BFD9FF' : colors.goldLight }, shineStyle]} />
      </Animated.View>
      <LinearGradient colors={['rgba(14,8,6,0.55)', 'transparent', 'transparent', wide ? 'transparent' : colors.bg]} locations={[0, 0.25, 0.6, 1]} style={StyleSheet.absoluteFill} />
      {product.is_sold_out && (
        <View style={styles.soldBadge}>
          <Text style={styles.soldBadgeText}>Currently sold out</Text>
        </View>
      )}
    </View>
  );

  const details = (
    <View style={[styles.details, wide && { paddingTop: insets.top + 80 }]}>
      <Animated.View entering={FadeInDown.delay(80).duration(500)}>
        <T variant="overline">{product.category_name}</T>
        <T variant="display" style={{ marginTop: 8 }}>{product.name}</T>
        {!!product.description && <T variant="body" style={{ marginTop: 10 }}>{product.description}</T>}
      </Animated.View>

      <OptionsForm product={product} c={c} />
    </View>
  );

  const footer = (
    <StickyFooter>
      <View style={styles.footerRow}>
        <Stepper value={quantity} onChange={setQuantity} min={1} compact={width < 420} />
        <Animated.View style={[{ flex: 1 }, addStyle]}>
          <Button
            title={!product.orderable ? 'Unavailable' : added ? 'Added to bag' : 'Add to bag'}
            icon={added ? 'check' : undefined}
            loading={adding}
            disabled={!product.orderable}
            onPress={add}
            right={product.orderable && !added ? <RollingPrice value={unitPrice * quantity} style={styles.footerPrice} /> : undefined}
          />
        </Animated.View>
      </View>
    </StickyFooter>
  );

  return (
    <View style={styles.screen}>
      {wide ? (
        <View style={[styles.wideRow, { paddingTop: insets.top + 70 }]}>
          <View style={{ flex: 1.1 }}>{hero}</View>
          <Animated.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
            {details}
          </Animated.ScrollView>
        </View>
      ) : (
        <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 + insets.bottom }}>
          {hero}
          {details}
        </Animated.ScrollView>
      )}

      {/* top bar */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, !wide && topBar]}>
          <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,8,6,0.85)', borderBottomWidth: 1, borderColor: colors.line }]} />
        </Animated.View>
        <View style={styles.topRow}>
          <IconButton name="arrow-left" onPress={goBack} />
          <Animated.Text style={[styles.topTitle, !wide && topBar]} numberOfLines={1}>{product.name}</Animated.Text>
          <IconButton name="shopping-bag" badge={bagCount} onPress={() => router.navigate('/bag')} />
        </View>
      </View>

      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { width: '100%', overflow: 'hidden', backgroundColor: colors.surface },
  heroWide: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line },
  wideRow: { flex: 1, flexDirection: 'row', gap: 40, paddingHorizontal: 40, maxWidth: MAX_WIDTH + 80, width: '100%', alignSelf: 'center' },
  soldBadge: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(14,8,6,0.85)',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  soldBadgeText: { fontFamily: fonts.semibold, color: colors.danger, fontSize: 13 },
  details: { paddingHorizontal: space.xl, marginTop: -6, width: '100%', maxWidth: 720, alignSelf: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, width: '100%', maxWidth: MAX_WIDTH + 80, alignSelf: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.displaySemi, fontSize: 17, color: colors.cream },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  footerPrice: { fontFamily: fonts.bold, fontSize: 15, color: colors.espresso, marginLeft: 6 },
});
