import { router } from 'expo-router';
import { Photo } from '@/components/photo';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { AmbientGlow, Steam } from '@/components/brand';
import { Contained, TAB_BAR_SPACE } from '@/components/layout';
import { Totals } from '@/components/order-bits';
import { Stepper } from '@/components/product';
import { toast } from '@/components/toast';
import { Button, Card, Field, Icon, PressableScale, T } from '@/components/ui';
import { errorMessage, post } from '@/lib/api';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { Quote } from '@/lib/types';
import { cartCount, cartSubtotal, useCart, useCatalog } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

export default function BagScreen() {
  const insets = useSafeAreaInsets();
  const { lines, setQuantity, remove, couponCode, setCoupon } = useCart();
  const taxRate = useCatalog((s) => s.store?.tax_rate ?? 0.0975);
  const [serverQuote, setQuote] = useState<Quote | null>(null);
  const [code, setCode] = useState(couponCode ?? '');
  const [applying, setApplying] = useState(false);
  const count = cartCount(lines);

  // Server-side totals (tax, coupon) whenever the bag changes.
  useEffect(() => {
    if (!lines.length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      post<Quote>('/checkout/quote', { items: lines, coupon_code: couponCode }, { signal: controller.signal })
        .then((q) => {
          setQuote(q);
          if (couponCode && !q.coupon) {
            setCoupon(null);
            toast.error(q.coupon_message ?? 'That coupon no longer applies.');
          }
        })
        .catch((e) => {
          if ((e as Error).name === 'AbortError') return;
          // An item may have sold out since it was added — show why.
          toast.error(errorMessage(e));
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lines, couponCode, setCoupon]);

  const applyCoupon = async () => {
    if (!code.trim()) return;
    setApplying(true);
    try {
      const r = await post<{ coupon: { code: string; label: string }; message: string }>('/coupon/apply', { coupon_code: code, items: lines });
      setCoupon(r.coupon.code);
      haptic.success();
      toast.success(`${r.coupon.label} applied`);
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const quote = lines.length ? serverQuote : null;
  const subtotal = quote?.subtotal ?? cartSubtotal(lines);
  const tax = quote?.tax ?? Math.round(subtotal * taxRate * 100) / 100;

  if (!lines.length) {
    return (
      <View style={[styles.screen, styles.emptyWrap, { paddingTop: insets.top }]}>
        <AmbientGlow intensity={0.8} />
        <Animated.View entering={FadeInDown.springify().damping(16)} style={{ alignItems: 'center' }}>
          <View style={{ marginBottom: -12 }}>
            <Steam width={70} height={64} color={colors.goldGlow} />
          </View>
          <CupIllustration />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(120)} style={{ alignItems: 'center', gap: 8, paddingHorizontal: space.xxl }}>
          <T variant="title">Your bag is empty</T>
          <T variant="body" style={{ textAlign: 'center' }}>Something warm is waiting. Browse the menu and treat yourself.</T>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(220)}>
          <Button title="Browse the menu" icon="coffee" onPress={() => router.navigate('/menu')} style={{ marginTop: space.xl, paddingHorizontal: 36 }} />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AmbientGlow intensity={0.5} />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: TAB_BAR_SPACE + insets.bottom + 90 }}>
        <Contained style={{ paddingHorizontal: space.xl }}>
          <T variant="overline">Your order</T>
          <View style={styles.titleRow}>
            <T variant="display">Your Bag</T>
            <Text style={styles.count}>{count} {count === 1 ? 'item' : 'items'}</Text>
          </View>

          <View style={{ gap: 12, marginTop: space.lg }}>
            {lines.map((l, i) => (
              <Animated.View key={l.key} entering={FadeInDown.delay(i * 50)} exiting={FadeOutLeft.duration(250)} layout={LinearTransition.springify().damping(18)}>
                <View style={styles.line}>
                  <PressableScale onPress={() => router.push(`/product/${l.product_id}`)} scaleTo={0.95}>
                    <Photo eager uri={l.image} width={320} style={styles.lineImage} transition={200} />
                  </PressableScale>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Text style={styles.lineName} numberOfLines={2}>{l.name}</Text>
                      <PressableScale
                        onPress={() => {
                          haptic.light();
                          remove(l.key);
                        }}
                        scaleTo={0.8}
                        style={{ padding: 2 }}>
                        <Icon name="x" size={16} color={colors.creamMuted} />
                      </PressableScale>
                    </View>
                    {!!(l.size_name || l.modifiers_label) && (
                      <Text style={styles.lineMeta} numberOfLines={2}>{[l.size_name, l.modifiers_label].filter(Boolean).join(' · ')}</Text>
                    )}
                    <View style={styles.lineFoot}>
                      <Text style={styles.linePrice}>{money(l.unit_price * l.quantity)}</Text>
                      <Stepper compact removable value={l.quantity} onChange={(v) => setQuantity(l.key, v)} />
                    </View>
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>

          <Animated.View layout={LinearTransition} style={{ marginTop: space.xl }}>
            {couponCode && quote?.coupon ? (
              <View style={styles.couponApplied}>
                <Icon name="tag" size={16} color={colors.success} />
                <Text style={styles.couponText}>{quote.coupon.code} · {quote.coupon.label}</Text>
                <PressableScale
                  onPress={() => {
                    setCoupon(null);
                    setCode('');
                  }}>
                  <Text style={styles.couponRemove}>Remove</Text>
                </PressableScale>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Field label="Coupon code" icon="tag" value={code} onChangeText={setCode} autoCapitalize="characters" containerStyle={{ flex: 1 }} onSubmitEditing={applyCoupon} returnKeyType="done" />
                <Button title="Apply" variant="dark" size="md" loading={applying} onPress={applyCoupon} style={{ height: 58, borderRadius: radius.md }} />
              </View>
            )}
          </Animated.View>

          <Animated.View layout={LinearTransition}>
            <Card style={{ marginTop: space.lg }}>
              <Totals
                rows={[
                  { label: 'Subtotal', value: subtotal },
                  ...(quote?.discount ? [{ label: 'Discount', value: quote.discount, tone: 'discount' as const }] : []),
                  { label: `Tax (${((quote?.tax_rate ?? taxRate) * 100).toFixed(2).replace(/\.?0+$/, '')}%)`, value: tax },
                  { label: 'Total', value: quote?.total ?? subtotal + tax, tone: 'total' },
                ]}
              />
            </Card>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(300)} style={styles.reassure}>
            <Icon name="shield" size={14} color={colors.creamMuted} />
            <T variant="small">Prices are confirmed by the shop at checkout.</T>
          </Animated.View>
        </Contained>
      </Animated.ScrollView>

      <View style={[styles.checkoutBar, { bottom: insets.bottom + 92 }]}>
        <Contained style={{ paddingHorizontal: space.xl }}>
          <Button
            title="Checkout"
            icon="lock"
            onPress={() => router.push('/checkout')}
            right={<Text style={styles.checkoutPrice}>· {money(quote?.total ?? subtotal + tax)}</Text>}
          />
        </Contained>
      </View>
    </View>
  );
}

function CupIllustration() {
  return (
    <Svg width={150} height={110} viewBox="0 0 150 110">
      <Path d="M30 20 H110 V58 C110 82 92 98 70 98 C48 98 30 82 30 58 Z" fill="#24170F" stroke={colors.gold} strokeWidth={3} />
      <Path d="M110 34 C130 34 134 64 110 66" fill="none" stroke={colors.gold} strokeWidth={3} strokeLinecap="round" />
      <Path d="M18 104 H122" stroke={colors.goldDeep} strokeWidth={3} strokeLinecap="round" />
      <Path d="M44 34 C58 28 80 40 96 32" stroke="rgba(212,163,115,0.5)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingBottom: TAB_BAR_SPACE },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 },
  count: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
  line: {
    flexDirection: 'row',
    gap: 14,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  lineImage: { width: 86, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  lineName: { flex: 1, fontFamily: fonts.displaySemi, fontSize: 16.5, lineHeight: 21, color: colors.cream },
  lineMeta: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.creamMuted },
  lineFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 },
  linePrice: { fontFamily: fonts.bold, fontSize: 16, color: colors.goldLight },
  couponApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: 'rgba(143,199,155,0.35)',
  },
  couponText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.success },
  couponRemove: { fontFamily: fonts.semibold, fontSize: 13, color: colors.creamMuted },
  reassure: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: space.lg },
  checkoutBar: { position: 'absolute', left: 0, right: 0 },
  checkoutPrice: { fontFamily: fonts.bold, fontSize: 16, color: colors.espresso },
});
