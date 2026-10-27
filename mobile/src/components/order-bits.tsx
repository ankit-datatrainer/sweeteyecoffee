import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { money, STATUS_COLOR, STATUS_LABEL } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { colors, fonts, radius, springs } from '@/theme';
import { Steam } from './brand';
import { Icon, T } from './ui';

export function StatusPill({ status }: { status: OrderStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1F`, borderColor: `${color}55` }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

/** Line items + totals block shared by the bag, checkout and order screens. */
export function Totals({ rows }: { rows: { label: string; value: number; tone?: 'discount' | 'total' }[] }) {
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => (
        <View key={r.label} style={[styles.totalRow, r.tone === 'total' && styles.totalRowFinal]}>
          <Text style={[styles.totalLabel, r.tone === 'total' && styles.totalLabelFinal]}>{r.label}</Text>
          <Text
            style={[
              styles.totalValue,
              r.tone === 'discount' && { color: colors.success },
              r.tone === 'total' && styles.totalValueFinal,
            ]}>
            {r.tone === 'discount' ? `−${money(r.value)}` : money(r.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const orderTotals = (o: Order) => [
  { label: 'Subtotal', value: o.subtotal },
  ...(o.discount_amount > 0 ? [{ label: `Discount${o.coupon_code ? ` (${o.coupon_code})` : ''}`, value: o.discount_amount, tone: 'discount' as const }] : []),
  { label: 'Tax', value: o.tax },
  ...(o.delivery_fee > 0 ? [{ label: o.shipping_service ?? 'Delivery', value: o.delivery_fee }] : []),
  { label: 'Total', value: o.total_amount, tone: 'total' as const },
];

/** Steps for this order's journey, and how far along it is. */
export function orderSteps(o: Order) {
  const delivery = o.type === 'delivery';
  const steps: { key: OrderStatus; label: string; icon: 'check' | 'coffee' | 'shopping-bag' | 'truck' | 'home' | 'package' }[] = delivery
    ? [
        { key: 'confirmed', label: 'Confirmed', icon: 'check' },
        { key: 'preparing', label: 'Roasting', icon: 'coffee' },
        { key: 'ready', label: 'Packed', icon: 'package' },
        { key: 'out_for_delivery', label: 'On the way', icon: 'truck' },
        { key: 'delivered', label: 'Delivered', icon: 'home' },
      ]
    : [
        { key: 'confirmed', label: 'Confirmed', icon: 'check' },
        { key: 'preparing', label: 'Preparing', icon: 'coffee' },
        { key: 'ready', label: 'Ready', icon: 'shopping-bag' },
        { key: 'delivered', label: 'Picked up', icon: 'home' },
      ];
  const order: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
  const rank = order.indexOf(o.status);
  const current = steps.reduce((acc, s, i) => (order.indexOf(s.key) <= rank ? i : acc), -1);
  return { steps, current };
}

/** Vertical timeline whose gold line fills to the current step. */
export function Timeline({ order }: { order: Order }) {
  const { steps, current } = orderSteps(order);
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(300, withTiming(steps.length > 1 ? Math.max(0, current) / (steps.length - 1) : 0, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [current, steps.length, fill]);
  const lineStyle = useAnimatedStyle(() => ({ height: `${fill.value * 100}%` }));

  if (order.status === 'cancelled') {
    return (
      <View style={styles.cancelled}>
        <Icon name="x-circle" size={20} color={colors.danger} />
        <T variant="bodyStrong" style={{ color: colors.danger }}>This order was cancelled.</T>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      <View style={styles.track}>
        <Animated.View style={[styles.trackFill, lineStyle]} />
      </View>
      {steps.map((s, i) => {
        const done = i <= current;
        const now = i === current;
        return (
          <View key={s.key} style={styles.step}>
            <StepDot done={done} now={now} icon={s.icon} delay={300 + i * 180} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepLabel, done && { color: colors.cream }]}>{s.label}</Text>
              {now && <Text style={styles.stepNow}>{stepHint(order, s.key)}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function stepHint(o: Order, key: OrderStatus) {
  if (key === 'confirmed') return 'We’ve got your order — it’s next in line.';
  if (key === 'preparing') return o.type === 'delivery' ? 'Your beans are being roasted fresh.' : 'Our baristas are crafting it now.';
  if (key === 'ready') return o.type === 'delivery' ? 'Packed and waiting for the courier.' : o.pickup_method === 'curbside' ? 'Ready! Tap “I’m here” when you park.' : 'Ready at the counter — come on in!';
  if (key === 'out_for_delivery') return 'On its way to you.';
  return 'Enjoy! Thanks for choosing Sweet Eye.';
}

function StepDot({ done, now, icon, delay }: { done: boolean; now: boolean; icon: 'check' | 'coffee' | 'shopping-bag' | 'truck' | 'home' | 'package'; delay: number }) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withDelay(delay, withSpring(1, springs.bouncy));
  }, [delay, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(s.value, [0, 1], [0.4, 1]) }], opacity: s.value }));
  return (
    <Animated.View style={[styles.dot, done && styles.dotDone, now && styles.dotNow, style]}>
      <Icon name={icon} size={14} color={done ? colors.espresso : colors.creamFaint} />
    </Animated.View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Celebration check: the ring draws, the tick snaps in, steam rises. */
export function SuccessBadge({ size = 120 }: { size?: number }) {
  const ring = useSharedValue(0);
  const tick = useSharedValue(0);
  const pop = useSharedValue(0);
  useEffect(() => {
    ring.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });
    tick.value = withDelay(550, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
    pop.value = withDelay(500, withSpring(1, springs.bouncy));
  }, [ring, tick, pop]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: 302 * (1 - ring.value) }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: 60 * (1 - tick.value) }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(pop.value, [0, 1], [0.85, 1]) }] }));

  return (
    <Animated.View style={[{ alignItems: 'center' }, popStyle]}>
      <View style={{ position: 'absolute', top: -46 }}>
        <Steam width={64} height={50} color={colors.goldGlow} />
      </View>
      <Svg width={size} height={size} viewBox="0 0 110 110">
        <Circle cx={55} cy={55} r={48} stroke="rgba(212,163,115,0.15)" strokeWidth={6} fill="rgba(212,163,115,0.06)" />
        {/* Full circle drawn clockwise from 12 o'clock (no SVG transform, which web rejects). */}
        <AnimatedPath d="M 55 7 A 48 48 0 1 1 54.99 7" stroke={colors.gold} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray="302" animatedProps={ringProps} />
        <AnimatedPath d="M 34 57 L 49 71 L 77 41" stroke={colors.goldLight} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="60" animatedProps={tickProps} />
      </Svg>
    </Animated.View>
  );
}

/** Coffee beans bursting outward — plays once. */
export function BeanBurst({ count = 18 }: { count?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }).map((_, i) => (
        <Bean key={i} angle={(i / count) * Math.PI * 2 + (i % 2 ? 0.2 : 0)} distance={110 + (i % 4) * 34} delay={450 + (i % 5) * 40} />
      ))}
    </View>
  );
}

function Bean({ angle, distance, delay }: { angle: number; distance: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.8, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: Math.cos(angle) * distance * t.value },
      { translateY: Math.sin(angle) * distance * t.value + 60 * t.value * t.value },
      { rotate: `${t.value * 540 + angle * 60}deg` },
      { scale: interpolate(t.value, [0, 0.3, 1], [0.3, 1, 0.7]) },
    ],
  }));
  return (
    <Animated.View style={[styles.bean, style]}>
      <Svg width={14} height={18} viewBox="0 0 14 18">
        <Path d="M7 1 C 13 1, 13 17, 7 17 C 1 17, 1 1, 7 1 Z" fill={angle % 1 > 0.5 ? colors.gold : colors.brownLight} />
        <Path d="M7 2 C 5 7, 9 11, 7 16" stroke={colors.espresso} strokeWidth={1.2} fill="none" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalRowFinal: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, marginTop: 4 },
  totalLabel: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.creamSoft },
  totalLabelFinal: { fontFamily: fonts.displaySemi, fontSize: 19, color: colors.cream },
  totalValue: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.cream },
  totalValueFinal: { fontFamily: fonts.display, fontSize: 22, color: colors.goldLight , fontVariant: ['lining-nums'] },
  timeline: { paddingLeft: 2 },
  track: { position: 'absolute', left: 18, top: 18, bottom: 18, width: 2, backgroundColor: colors.line, borderRadius: 1, overflow: 'hidden' },
  trackFill: { width: '100%', backgroundColor: colors.gold },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58 },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.gold, borderColor: colors.gold },
  dotNow: { shadowColor: colors.gold, shadowOpacity: 0.7, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  stepLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.creamFaint },
  stepNow: { fontFamily: fonts.body, fontSize: 13, color: colors.goldLight, marginTop: 2 },
  cancelled: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  bean: { position: 'absolute', left: '50%', top: 150, marginLeft: -7 },
});
