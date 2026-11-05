import { LinearGradient } from 'expo-linear-gradient';
import { Photo } from './photo';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  LayoutAnimationConfig,
  SlideInDown,
  SlideOutUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { money } from '@/lib/format';
import { exploreSubscription } from '@/lib/subscriptions';
import type { Product } from '@/lib/types';
import { colors, fonts, radius, springs } from '@/theme';
import { openQuickAdd } from '@/store/quick-add';
import { Icon, PressableScale, T } from './ui';

export const openProduct = (p: Pick<Product, 'id'>) => router.push(`/product/${p.id}`);

/** The price shown on menu cards: the lowest size's price, without "from". */
export const priceLabel = (p: Product) => money(p.starting_price);

/** Grid card used on the menu. */
export function ProductCard({ product, index = 0, width }: { product: Product; index?: number; width: number }) {
  const showBoth = Boolean(product.image && product.iced_image);
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 55).springify().damping(18)} style={{ width }}>
      <PressableScale onPress={() => openProduct(product)} scaleTo={0.965} style={styles.card}>
        <View style={[styles.imageWrap, { height: width * (showBoth ? 0.82 : 1.05) }]}>
          {showBoth ? (
            <View style={styles.photoSplit}>
              {([
                { label: 'ICED', uri: product.iced_image, icon: 'cloud-snow', color: '#087DA6' },
                { label: 'HOT', uri: product.image, icon: 'sun', color: '#B44820' },
              ] as const).map((photo, i) => (
                <View key={photo.label} style={[styles.photoPane, i === 0 && styles.photoDivider]}
                  accessible accessibilityRole="image" accessibilityLabel={`${product.name} — ${photo.label.toLowerCase()}`}>
                  <Photo uri={photo.uri} width={540} style={StyleSheet.absoluteFill} transition={350} />
                  <View style={[styles.temperatureBadge, i === 0 ? { left: 6 } : { right: 6 }]}>
                    <Icon name={photo.icon} size={11} color={photo.color} />
                    <Text style={[styles.temperatureLabel, { color: photo.color }]}>{photo.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Photo uri={product.image} width={540} style={StyleSheet.absoluteFill} contentFit={product.is_beans ? 'contain' : 'cover'} transition={350} />
          )}
          {!showBoth && !product.is_beans && <LinearGradient colors={['transparent', 'rgba(14,8,6,0.85)']} style={styles.imageFade} />}
          {product.is_sold_out && (
            <View style={styles.soldOut}>
              <Text style={styles.soldOutText}>SOLD OUT</Text>
            </View>
          )}
          {/* "+" opens the quick customise-and-add sheet; tapping anywhere else opens the full item. */}
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
            style={[styles.addFab, showBoth && { top: 10, bottom: undefined }]}>
            <Icon name="plus" size={18} color={colors.espresso} />
          </PressableScale>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.cardPrice}>{priceLabel(product)}</Text>
          {product.is_beans && product.orderable && <Text style={{ color: colors.gold, fontFamily: fonts.semibold, fontSize: 12, marginTop: 8 }} onPress={(e) => { e.stopPropagation(); exploreSubscription({ product_id: product.id }); }}>Explore subscription</Text>}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/** Wide horizontal row used in search results and lists. */
export function ProductRow({ product, style }: { product: Product; style?: StyleProp<ViewStyle> }) {
  return (
    <PressableScale onPress={() => openProduct(product)} scaleTo={0.98} style={[styles.row, style]}>
      <Photo uri={product.image} width={320} style={styles.rowImage} transition={250} />
      <View style={{ flex: 1, gap: 4 }}>
        <T variant="subheading" numberOfLines={1}>{product.name}</T>
        {!!product.description && <T variant="small" numberOfLines={2}>{product.description}</T>}
        <Text style={styles.cardPrice}>{product.is_sold_out ? 'Sold out' : priceLabel(product)}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.creamFaint} />
    </PressableScale>
  );
}

/** A price that rolls to its new value (old one slides up, new one rises in). */
export function RollingPrice({ value, style }: { value: number; style?: object }) {
  // skipEntering: no roll on first render, only when the value changes.
  return (
    <LayoutAnimationConfig skipEntering>
      <View style={{ overflow: 'hidden' }}>
        <Animated.Text key={value.toFixed(2)} entering={SlideInDown.springify().damping(16)} exiting={SlideOutUp.duration(160)} style={style}>
          {money(value)}
        </Animated.Text>
      </View>
    </LayoutAnimationConfig>
  );
}

/** − 2 + stepper with a little pop on change. */
export function Stepper({ value, onChange, min = 1, max = 50, compact, removable }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  compact?: boolean;
  /** At the minimum, show a bin that removes the line (bag) instead of a dimmed minus. */
  removable?: boolean;
}) {
  const atMin = value <= min;
  const pop = useSharedValue(1);
  useEffect(() => {
    pop.value = withSequence(withSpring(1.25, springs.bouncy), withSpring(1, springs.snappy));
  }, [value, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: interpolate(pop.value, [1, 1.25], [1, 0.85]) }));
  const size = compact ? 32 : 42;
  return (
    <View style={[styles.stepper, compact && { padding: 3 }]}>
      <PressableScale
        onPress={() => (atMin && !removable ? undefined : onChange(removable ? value - 1 : Math.max(min, value - 1)))}
        scaleTo={0.85}
        style={[styles.stepBtn, { width: size, height: size, opacity: atMin && !removable ? 0.35 : 1 }]}>
        <Icon name={atMin && removable ? 'trash-2' : 'minus'} size={compact ? 14 : 16} color={atMin && removable ? colors.danger : colors.cream} />
      </PressableScale>
      <Animated.Text style={[styles.stepValue, compact && { fontSize: 15, minWidth: 24 }, popStyle]}>{value}</Animated.Text>
      <PressableScale onPress={() => onChange(Math.min(max, value + 1))} scaleTo={0.85} style={[styles.stepBtn, styles.stepPlus, { width: size, height: size }]}>
        <Icon name="plus" size={compact ? 14 : 16} color={colors.espresso} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  imageWrap: { width: '100%', backgroundColor: colors.surfaceHigh },
  imageFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  soldOut: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(14,8,6,0.8)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  soldOutText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.4, color: colors.danger },
  photoSplit: { flex: 1, flexDirection: 'row' },
  photoPane: { flex: 1, overflow: 'hidden' },
  photoDivider: { borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  temperatureBadge: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  temperatureLabel: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.4 },
  addFab: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: 12, paddingTop: 10, gap: 4, minHeight: 72 },
  cardName: { fontFamily: fonts.displaySemi, fontSize: 15.5, lineHeight: 20, color: colors.cream },
  cardPrice: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.goldLight },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowImage: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,237,227,0.05)',
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepBtn: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,237,227,0.06)' },
  stepPlus: { backgroundColor: colors.gold },
  stepValue: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream, minWidth: 34, textAlign: 'center' },
});
