import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon, PressableScale } from '@/components/ui';
import { colors, fonts, radius } from '@/theme';

export type PayMethod = 'card' | 'apple_pay' | 'google_pay' | 'cashapp' | 'amazon_pay';

export const PAY_LABEL: Record<PayMethod, string> = {
  card: 'Card',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  cashapp: 'Cash App Pay',
  amazon_pay: 'Amazon Pay',
};

const WALLET_ORDER: PayMethod[] = ['apple_pay', 'google_pay', 'cashapp', 'amazon_pay'];

/**
 * The ways to pay this device can actually use: Square card form, plus the
 * Stripe methods switched on for the shop. Apple Pay needs an Apple device's
 * browser and Google Pay an Android one, so each is hidden on the other phone.
 */
export function availablePayMethods(cardOn: boolean, stripeMethods: string[] = []): PayMethod[] {
  const wallets = WALLET_ORDER.filter(
    (m) => stripeMethods.includes(m) && !(m === 'apple_pay' && Platform.OS === 'android') && !(m === 'google_pay' && Platform.OS === 'ios'),
  );
  return [...(cardOn ? (['card'] as PayMethod[]) : []), ...wallets];
}

/** Brand mark for each option, on its brand's own colour plate. */
function Logo({ method }: { method: PayMethod }) {
  switch (method) {
    case 'card':
      return (
        <View style={[styles.plate, styles.cardPlate]}>
          <FontAwesome6 name="cc-visa" brand size={24} color="#1A1F71" />
          <FontAwesome6 name="cc-mastercard" brand size={24} color="#EB001B" />
          <FontAwesome6 name="cc-amex" brand size={24} color="#2E77BC" />
        </View>
      );
    case 'apple_pay':
      return (
        <View style={[styles.plate, { backgroundColor: '#000' }]}>
          <FontAwesome6 name="apple-pay" brand size={34} color="#fff" />
        </View>
      );
    case 'google_pay':
      return (
        <View style={[styles.plate, { backgroundColor: '#fff' }]}>
          <FontAwesome6 name="google-pay" brand size={34} color="#3C4043" />
        </View>
      );
    case 'cashapp':
      return (
        <View style={[styles.plate, { backgroundColor: '#00D64F' }]}>
          <View style={styles.cashMark}>
            <Text style={styles.cashDollar}>$</Text>
          </View>
          <Text style={styles.cashWord}>Cash App</Text>
        </View>
      );
    case 'amazon_pay':
      return (
        <View style={[styles.plate, { backgroundColor: '#232F3E' }]}>
          <FontAwesome6 name="amazon-pay" brand size={34} color="#fff" />
        </View>
      );
  }
}

const SUB: Record<PayMethod, string> = {
  card: 'Visa · Mastercard · Amex',
  apple_pay: 'Face ID / Touch ID',
  google_pay: 'Fast checkout',
  cashapp: 'Pay from your Cash App',
  amazon_pay: 'Use your Amazon account',
};

function Option({ method, selected, onPress, wide }: { method: PayMethod; selected: boolean; onPress: () => void; wide: boolean }) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(selected ? 1 : 0, { duration: 200 }));
  }, [selected, on]);
  const frame = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.get(), [0, 1], [colors.line, colors.gold]),
    backgroundColor: interpolateColor(on.get(), [0, 1], ['rgba(245,237,227,0.03)', 'rgba(212,163,115,0.12)']),
  }));

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      style={wide ? styles.full : styles.half}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Pay with ${PAY_LABEL[method]}`}>
      <Animated.View style={[styles.option, wide && styles.optionWide, frame]}>
        <Logo method={method} />
        <View style={wide ? { flex: 1 } : undefined}>
          <Text style={[styles.label, selected && { color: colors.cream }]}>{method === 'card' ? 'Credit / debit card' : PAY_LABEL[method]}</Text>
          <Text style={styles.sub} numberOfLines={1}>{SUB[method]}</Text>
        </View>
        <View style={[styles.radio, wide && styles.radioInline, selected && styles.radioOn]}>
          {selected && (
            <Animated.View entering={ZoomIn.duration(180)}>
              <Icon name="check" size={12} color={colors.espresso} />
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </PressableScale>
  );
}

/** Every way to pay, up front with its logo. Card first (full width), then the wallets in a grid. */
export function PayOptions({ methods, value, onChange }: { methods: PayMethod[]; value: PayMethod; onChange: (m: PayMethod) => void }) {
  const { width } = useWindowDimensions();
  const wallets = methods.filter((m) => m !== 'card');
  // Phones: two wallets per row; tablets / desktop: all in one row.
  const perRow = width >= 720 ? Math.max(wallets.length, 1) : 2;
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {methods.includes('card') && <Option method="card" wide selected={value === 'card'} onPress={() => onChange('card')} />}
      <View style={styles.grid}>
        {wallets.map((m, i) => (
          <View key={m} style={{ width: wallets.length % 2 === 1 && i === wallets.length - 1 && perRow === 2 ? '100%' : `${100 / perRow}%`, padding: 5 }}>
            <Option method={m} wide={false} selected={value === m} onPress={() => onChange(m)} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  full: { width: '100%' },
  half: { flex: 1 },
  option: { borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 10, minHeight: 112 },
  optionWide: { flexDirection: 'row', alignItems: 'center', minHeight: 0, gap: 14 },
  plate: { height: 40, minWidth: 72, alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  cardPlate: { backgroundColor: '#fff', gap: 5, paddingHorizontal: 8 },
  cashMark: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cashDollar: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 18, color: '#00D64F' },
  cashWord: { fontFamily: fonts.bold, fontSize: 13, color: '#fff' },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.creamSoft },
  sub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.creamMuted, marginTop: 2 },
  radio: { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioInline: { position: 'relative', top: 0, right: 0 },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
