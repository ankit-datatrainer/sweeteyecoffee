import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius, space, springs } from '@/theme';

// ── Typography ──────────────────────────────────────────────────────────────

const variants = StyleSheet.create({
  hero: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50, color: colors.cream, letterSpacing: -0.5, fontVariant: ['lining-nums'] },
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.cream, letterSpacing: -0.3, fontVariant: ['lining-nums'] },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.cream, fontVariant: ['lining-nums'] },
  heading: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 26, color: colors.cream, fontVariant: ['lining-nums'] },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.cream },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.creamSoft },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.cream },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.creamMuted },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.cream },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 2.2, color: colors.gold, textTransform: 'uppercase' },
  price: { fontFamily: fonts.bold, fontSize: 16, color: colors.goldLight },
  italic: { fontFamily: fonts.displayItalic, fontSize: 18, lineHeight: 24, color: colors.goldLight },
});

export type TVariant = keyof typeof variants;

export function T({ variant = 'body', style, ...props }: TextProps & { variant?: TVariant }) {
  return <Text {...props} style={[variants[variant], style]} />;
}

export const Icon = ({ name, size = 20, color = colors.cream, style }: {
  name: ComponentProps<typeof Feather>['name'];
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) => <Feather name={name} size={size} color={color} style={style} />;

// ── Press feedback ──────────────────────────────────────────────────────────

type ScaleProps = PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; children?: ReactNode; haptics?: boolean };

/** Pressable that springs down on touch — the base for every tappable surface. */
export function PressableScale({ style, scaleTo = 0.96, onPressIn, onPressOut, onPress, haptics = true, children, ...rest }: ScaleProps) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, scaleTo]) }],
    opacity: interpolate(pressed.value, [0, 1], [1, 0.9]),
  }));
  // One element (no wrapper) so flex / height / margins behave exactly like a View.
  return (
    <AnimatedPressable
      {...rest}
      style={[style, animated]}
      onPressIn={(e) => {
        pressed.set(withSpring(1, springs.snappy));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(withSpring(0, springs.bouncy));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic.tap();
        onPress?.(e);
      }}>
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Buttons ─────────────────────────────────────────────────────────────────

type ButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: ComponentProps<typeof Feather>['name'];
  variant?: 'gold' | 'outline' | 'ghost' | 'dark';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
  right?: ReactNode;
};

/** Gold call-to-action with a slow light sweep across it. */
export function Button({ title, onPress, icon, variant = 'gold', loading, disabled, style, size = 'lg', right }: ButtonProps) {
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (variant !== 'gold') return;
    sweep.value = withRepeat(withSequence(withDelay(1800, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) })), withTiming(0, { duration: 0 })), -1);
  }, [variant, sweep]);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-160, 420]) }, { rotate: '18deg' }],
  }));

  const height = size === 'lg' ? 58 : 46;
  const fg = variant === 'gold' ? colors.espresso : colors.cream;
  const off = disabled || loading;

  return (
    <PressableScale
      onPress={off ? undefined : onPress}
      disabled={off}
      style={[
        styles.button,
        { height, opacity: disabled ? 0.45 : 1 },
        variant === 'outline' && styles.buttonOutline,
        variant === 'dark' && styles.buttonDark,
        variant === 'ghost' && styles.buttonGhost,
        style,
      ]}>
      {variant === 'gold' && (
        <>
          <LinearGradient colors={[colors.goldLight, colors.gold, colors.goldDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Animated.View pointerEvents="none" style={[styles.sweep, sweepStyle]}>
            <LinearGradient colors={['transparent', 'rgba(255,255,255,0.45)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </>
      )}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <Text numberOfLines={1} style={[styles.buttonText, { color: fg, fontSize: size === 'lg' ? 16 : 14, flexShrink: 1 }]}>{title}</Text>
          {right}
        </View>
      )}
    </PressableScale>
  );
}

export function IconButton({ name, onPress, badge, style, size = 44, color = colors.cream }: {
  name: ComponentProps<typeof Feather>['name'];
  onPress?: () => void;
  badge?: number;
  style?: StyleProp<ViewStyle>;
  size?: number;
  color?: string;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.88} style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Icon name={name} size={size * 0.42} color={color} />
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </PressableScale>
  );
}

// ── Chips & pills ───────────────────────────────────────────────────────────

export function Chip({ label, selected, onPress, sub, disabled, style }: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  sub?: string | null;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(selected ? 1 : 0, springs.snappy);
  }, [selected, on]);
  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], ['rgba(245,237,227,0.04)', 'rgba(212,163,115,0.16)']),
    borderColor: interpolateColor(on.value, [0, 1], [colors.line, colors.gold]),
  }));
  return (
    <PressableScale onPress={disabled ? undefined : onPress} style={[{ opacity: disabled ? 0.4 : 1 }, style]} scaleTo={0.94}>
      <Animated.View style={[styles.chip, animated]}>
        <Text style={[styles.chipText, selected && { color: colors.goldLight }]}>{label}</Text>
        {!!sub && <Text style={[styles.chipSub, selected && { color: colors.gold }]}>{sub}</Text>}
      </Animated.View>
    </PressableScale>
  );
}

/** Open / closed pill with a breathing status dot. */
export function StatusDot({ open }: { open: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.6, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 2.6]) }],
  }));
  const color = open ? colors.success : colors.danger;
  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dot, { backgroundColor: color }, ring]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

// ── Inputs ──────────────────────────────────────────────────────────────────

type FieldProps = TextInputProps & { label: string; icon?: ComponentProps<typeof Feather>['name']; error?: string | null; containerStyle?: StyleProp<ViewStyle> };

/** Text field with a floating label and a gold focus glow. */
export const Field = forwardRef<TextInputInstance, FieldProps>(function Field({ label, icon, error, containerStyle, style, onFocus, onBlur, value, multiline, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const lifted = useSharedValue(value ? 1 : 0);
  const focus = useSharedValue(0);

  useEffect(() => {
    lifted.value = withTiming(focused || !!value ? 1 : 0, { duration: 180 });
    focus.value = withTiming(focused ? 1 : 0, { duration: 200 });
  }, [focused, value, lifted, focus]);

  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(lifted.value, [0, 1], [0, -11]) }, { scale: interpolate(lifted.value, [0, 1], [1, 0.78]) }],
  }));
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: error ? colors.danger : interpolateColor(focus.value, [0, 1], [colors.line, colors.gold]),
    backgroundColor: interpolateColor(focus.value, [0, 1], ['rgba(245,237,227,0.035)', 'rgba(212,163,115,0.07)']),
  }));

  return (
    <View style={containerStyle}>
      <Animated.View style={[styles.field, multiline && { minHeight: 112, alignItems: 'flex-start', paddingTop: 10 }, boxStyle]}>
        {icon && <Icon name={icon} size={17} color={focused ? colors.gold : colors.creamMuted} style={{ marginRight: 10, marginTop: multiline ? 14 : 0 }} />}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Animated.Text pointerEvents="none" style={[styles.fieldLabel, multiline && { top: 14 }, labelStyle]} numberOfLines={1}>
            {label}
          </Animated.Text>
          <TextInput
            ref={ref}
            {...props}
            value={value}
            multiline={multiline}
            placeholderTextColor={colors.creamFaint}
            selectionColor={colors.gold}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[styles.fieldInput, multiline && { minHeight: 84, textAlignVertical: 'top', paddingTop: 22 }, style]}
          />
        </View>
      </Animated.View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
});

// ── Feedback ────────────────────────────────────────────────────────────────

/** Shimmering placeholder block. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [t]);
  const animated = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0, 1], [0.35, 0.75]) }));
  return <Animated.View style={[{ backgroundColor: colors.surfaceHigh, borderRadius: radius.md }, style, animated]} />;
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'danger' | 'success' | 'gold'; children: ReactNode; icon?: ComponentProps<typeof Feather>['name'] }) {
  const palette = {
    info: [colors.info, 'rgba(157,184,232,0.1)'],
    danger: [colors.danger, colors.dangerBg],
    success: [colors.success, colors.successBg],
    gold: [colors.gold, 'rgba(212,163,115,0.1)'],
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette[1], borderColor: `${palette[0]}40` }]}>
      <Icon name={icon ?? (tone === 'danger' ? 'alert-circle' : tone === 'success' ? 'check-circle' : 'info')} size={16} color={palette[0]} />
      <Text style={[styles.noticeText, { color: palette[0] }]}>{children}</Text>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong }, style]} />;
}

export function SectionTitle({ overline, title, action, onAction, style }: {
  overline?: string;
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <View style={{ flex: 1 }}>
        {overline && <T variant="overline" style={{ marginBottom: 6 }}>{overline}</T>}
        <T variant="title">{title}</T>
      </View>
      {action && (
        <PressableScale onPress={onAction} style={styles.sectionAction}>
          <T variant="smallStrong" style={{ color: colors.gold }}>{action}</T>
          <Icon name="arrow-right" size={14} color={colors.gold} />
        </PressableScale>
      )}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  buttonOutline: { borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: 'rgba(245,237,227,0.03)' },
  buttonDark: { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.line },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { fontFamily: fonts.semibold, letterSpacing: 0.3 },
  sweep: { position: 'absolute', top: -20, bottom: -20, width: 70 },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,12,8,0.55)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.espresso },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.creamSoft },
  chipSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.creamMuted },
  dotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  field: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldLabel: {
    position: 'absolute',
    left: 0,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.creamMuted,
    transformOrigin: 'left center',
  },
  fieldInput: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.cream,
    paddingTop: 16,
    paddingBottom: 4,
    minHeight: 50,
    outlineStyle: 'none' as any,
  },
  fieldError: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.danger, marginTop: 6, marginLeft: 4 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  noticeText: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19 },
  sectionTitle: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.lg },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
});
