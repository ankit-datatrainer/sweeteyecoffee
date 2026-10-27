import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { errorMessage, post } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import type { CartLine, ModifierGroup, ModifierOption, Product } from '@/lib/types';
import { useCart } from '@/store';
import { colors, fonts, radius, space, springs } from '@/theme';
import { toast } from './toast';
import { Chip, Icon, PressableScale, T } from './ui';

const isLarge = (size: string | null) => (size ?? '').trim().toLowerCase() === 'large';
export const optionPrice = (o: ModifierOption, size: string | null) => (o.large_price !== null && isLarge(size) ? o.large_price : o.price);

/**
 * Everything needed to customise one menu item — size, Hot/Iced, milk,
 * add-ons, quantity — and add it to the bag. Shared by the product page and
 * the quick-add sheet so both follow exactly the same rules.
 */
export function useCustomizer(product: Product) {
  const addLine = useCart((s) => s.add);
  const [size, setSize] = useState<string | null>(product.sizes[0]?.name ?? null);
  const [selected, setSelected] = useState<Record<number, number[]>>(() =>
    // Required single-choice groups start on their first option (e.g. Hot, Light roast).
    Object.fromEntries(product.groups.filter((g) => g.required && g.selection === 'single').map((g) => [g.id, [g.options[0].id]])),
  );
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  const temperature = product.groups.find((g) => g.slug === 'temperature');
  const iced = temperature ? temperature.options.some((o) => o.name.toLowerCase() === 'iced' && selected[temperature.id]?.includes(o.id)) : false;
  const sizeImage = product.sizes.find((s) => s.name === size)?.image;
  const image = (iced && product.iced_image) || sizeImage || product.image;

  const unitPrice = useMemo(() => {
    const base = product.sizes.find((s) => s.name === size)?.price ?? product.price;
    const extras = product.groups.flatMap((g) => g.options.filter((o) => selected[g.id]?.includes(o.id))).reduce((sum, o) => sum + optionPrice(o, size), 0);
    return Math.round((base + extras) * 100) / 100;
  }, [product, size, selected]);

  const missing = product.groups.find((g) => g.required && !(selected[g.id]?.length));

  const toggle = (group: ModifierGroup, option: ModifierOption) => {
    setSelected((s) => {
      const current = s[group.id] ?? [];
      if (group.selection === 'single') {
        if (current.includes(option.id)) return group.required ? s : { ...s, [group.id]: [] };
        return { ...s, [group.id]: [option.id] };
      }
      return { ...s, [group.id]: current.includes(option.id) ? current.filter((x) => x !== option.id) : [...current, option.id] };
    });
  };

  /** Price-check the line on the server, put it in the bag. Resolves true when added. */
  const add = async () => {
    if (missing) {
      haptic.error();
      toast.error(`Please choose: ${missing.name}.`);
      return false;
    }
    setAdding(true);
    try {
      const { line } = await post<{ line: CartLine }>('/cart/line', {
        product_id: product.id,
        size_name: size,
        modifiers: Object.values(selected).flat(),
        quantity,
      });
      addLine(line);
      haptic.success();
      toast.success(`${quantity} × ${product.name} added to your bag`, line.image);
      return true;
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
      return false;
    } finally {
      setAdding(false);
    }
  };

  return { size, setSize, selected, toggle, quantity, setQuantity, adding, add, unitPrice, image, iced, temperature, missing };
}

export type Customizer = ReturnType<typeof useCustomizer>;

/** Hot/Iced switch, sizes and every option group for a product. */
export function OptionsForm({ product, c, animate = true }: { product: Product; c: Customizer; animate?: boolean }) {
  const enter = (delay: number) => (animate ? FadeInDown.delay(delay).duration(450) : undefined);
  const { temperature, selected, size, toggle } = c;

  return (
    <View>
      {temperature && (
        <Animated.View entering={enter(140)} style={styles.tempToggle}>
          {temperature.options.map((o) => {
            const on = selected[temperature.id]?.includes(o.id);
            const isIced = o.name.toLowerCase() === 'iced';
            return (
              <PressableScale key={o.id} onPress={() => toggle(temperature, o)} scaleTo={0.95} style={[styles.tempOption, on && (isIced ? styles.tempIced : styles.tempHot)]}>
                <Icon name={isIced ? 'cloud-snow' : 'sun'} size={18} color={on ? (isIced ? colors.info : colors.goldLight) : colors.creamMuted} />
                <Text style={[styles.tempText, on && { color: colors.cream }]}>{o.name}</Text>
              </PressableScale>
            );
          })}
        </Animated.View>
      )}

      {product.sizes.length > 0 && (
        <Animated.View entering={enter(200)} style={styles.group}>
          <GroupTitle title={product.is_beans ? 'Bag size' : product.category_slug === 'accessories' ? 'Choose a style' : 'Size'} hint="Required" />
          <SizeSelector sizes={product.sizes} value={size} onChange={c.setSize} />
        </Animated.View>
      )}

      {product.groups
        .filter((g) => g.slug !== 'temperature')
        .map((g, i) => (
          <Animated.View key={g.id} entering={enter(260 + i * 60)} style={styles.group}>
            <GroupTitle title={g.name} hint={g.required ? 'Required' : g.selection === 'single' ? 'Choose one' : 'Choose any'} />
            <View style={styles.chips}>
              {g.options.map((o) => {
                const price = optionPrice(o, size);
                return (
                  <Chip
                    key={o.id}
                    label={o.name}
                    sub={price > 0 && o.large_price === null ? `+$${price.toFixed(2)}` : null}
                    selected={selected[g.id]?.includes(o.id)}
                    onPress={() => toggle(g, o)}
                  />
                );
              })}
            </View>
          </Animated.View>
        ))}

      {product.is_beans && (
        <Animated.View entering={animate ? FadeIn.delay(400) : undefined} style={styles.beansNote}>
          <Icon name="truck" size={16} color={colors.gold} />
          <T variant="small" style={{ flex: 1, color: colors.creamSoft }}>
            Roasted to order. Coffee-bean orders can be picked up, delivered locally or shipped anywhere in the US.
          </T>
        </Animated.View>
      )}
    </View>
  );
}

function GroupTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.groupTitle}>
      <T variant="heading">{title}</T>
      <Text style={[styles.hint, hint === 'Required' && { color: colors.gold, borderColor: 'rgba(212,163,115,0.35)' }]}>{hint}</Text>
    </View>
  );
}

/** Segmented size control with a sliding gold thumb. */
function SizeSelector({ sizes, value, onChange }: { sizes: Product['sizes']; value: string | null; onChange: (s: string) => void }) {
  const [w, setW] = useState(0);
  const segment = sizes.length ? (w - 8) / sizes.length : 0;
  const index = Math.max(0, sizes.findIndex((s) => s.name === value));
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withSpring(index * segment, springs.snappy);
  }, [index, segment, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: segment }));

  if (sizes.length > 4) {
    return (
      <View style={styles.chips}>
        {sizes.map((s) => (
          <Chip key={s.name} label={s.name} sub={`$${s.price.toFixed(2)}`} selected={s.name === value} onPress={() => onChange(s.name)} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.segment} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && <Animated.View style={[styles.segmentThumb, thumb]} />}
      {sizes.map((s) => {
        const on = s.name === value;
        return (
          <Text
            key={s.name}
            onPress={() => {
              haptic.tap();
              onChange(s.name);
            }}
            style={[styles.segmentItem, on && { color: colors.espresso }]}>
            {s.name}
            {'\n'}
            <Text style={[styles.segmentPrice, on && { color: 'rgba(18,10,6,0.7)' }]}>${s.price.toFixed(2)}</Text>
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tempToggle: { flexDirection: 'row', gap: 10, marginTop: space.xl },
  tempOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(245,237,227,0.04)',
  },
  tempHot: { borderColor: colors.gold, backgroundColor: 'rgba(212,163,115,0.14)' },
  tempIced: { borderColor: colors.info, backgroundColor: 'rgba(157,184,232,0.12)' },
  tempText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.creamMuted },
  group: { marginTop: space.xxl },
  groupTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  hint: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.creamMuted,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(245,237,227,0.04)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  segmentThumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.md, backgroundColor: colors.gold },
  segmentItem: { flex: 1, textAlign: 'center', paddingVertical: 10, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.cream },
  segmentPrice: { fontFamily: fonts.medium, fontSize: 12, color: colors.creamMuted },
  beansNote: {
    flexDirection: 'row',
    gap: 10,
    marginTop: space.xxl,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: 'rgba(212,163,115,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(212,163,115,0.2)',
  },
});
