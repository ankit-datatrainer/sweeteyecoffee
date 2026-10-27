import { router } from 'expo-router';
import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { Product } from '@/lib/types';
import { useQuickAdd } from '@/store/quick-add';
import { colors, fonts, radius, space } from '@/theme';
import { OptionsForm, useCustomizer } from './customize';
import { Photo } from './photo';
import { RollingPrice, Stepper } from './product';
import { Button, Icon, PressableScale, T } from './ui';

/** Mounted once at the root; renders the sheet over every screen. */
export function QuickAddHost() {
  const product = useQuickAdd((s) => s.product);
  const close = useQuickAdd((s) => s.close);
  return (
    <Modal visible={!!product} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      {product && <Sheet key={product.id} product={product} onClosed={close} />}
    </Modal>
  );
}

function Sheet({ product, onClosed }: { product: Product; onClosed: () => void }) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const c = useCustomizer(product);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withSpring(1, { damping: 22, stiffness: 190, mass: 0.9 }));
  }, [progress]);

  /** Slide down, then unmount. */
  const dismiss = (after?: () => void) => {
    progress.set(
      withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) }, (done) => {
        if (!done) return;
        scheduleOnRN(onClosed);
        if (after) scheduleOnRN(after);
      }),
    );
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(progress.value, [0, 1], [height, 0]) }] }));

  const add = async () => {
    if (await c.add()) dismiss();
  };

  const hasOptions = product.sizes.length > 0 || product.groups.length > 0;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View style={[styles.sheet, { maxHeight: height * 0.88, width: Math.min(width, 640), paddingBottom: insets.bottom + 14 }, sheet]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Photo eager uri={c.image} width={320} style={styles.photo} transition={250} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="overline">{product.category_name}</T>
            <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
            <RollingPrice value={c.unitPrice} style={styles.price} />
          </View>
          <PressableScale onPress={() => dismiss()} scaleTo={0.85} style={styles.close} accessibilityLabel="Close">
            <Icon name="x" size={18} color={colors.creamSoft} />
          </PressableScale>
        </View>

        <PressableScale
          onPress={() => dismiss(() => router.push(`/product/${product.id}`))}
          scaleTo={0.98}
          haptics={false}
          style={styles.details}>
          <Icon name="info" size={14} color={colors.gold} />
          <Text style={styles.detailsText}>View full details</Text>
          <Icon name="chevron-right" size={14} color={colors.gold} />
        </PressableScale>

        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.lg }} showsVerticalScrollIndicator={false}>
          {!!product.description && <T variant="small" style={{ marginTop: space.sm }}>{product.description}</T>}
          {hasOptions ? (
            <OptionsForm product={product} c={c} animate={false} />
          ) : (
            <T variant="small" style={{ marginTop: space.md, color: colors.creamFaint }}>No options to choose — just pick how many.</T>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Stepper value={c.quantity} onChange={c.setQuantity} min={1} compact />
          <Button
            title={product.orderable ? 'Add to bag' : 'Unavailable'}
            loading={c.adding}
            disabled={!product.orderable}
            onPress={add}
            style={{ flex: 1 }}
            right={product.orderable ? <RollingPrice value={c.unitPrice * c.quantity} style={styles.footerPrice} /> : undefined}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(5,2,1,0.72)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    backgroundColor: colors.bgSoft,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.lineStrong,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginTop: 10, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.xl, paddingTop: space.sm },
  photo: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  name: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, color: colors.cream },
  price: { fontFamily: fonts.bold, fontSize: 16, color: colors.goldLight },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,237,227,0.07)', alignSelf: 'flex-start' },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginLeft: space.xl,
    marginTop: space.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,163,115,0.3)',
  },
  detailsText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.goldLight },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.xl,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  footerPrice: { fontFamily: fonts.bold, fontSize: 15, color: colors.espresso, marginLeft: 6 },
});
