import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const RAYS = [-150, -120, -90, -60, -30].map((deg) => {
  const r = (deg * Math.PI) / 180;
  const [x1, y1, x2, y2] = [60 + Math.cos(r) * 37, 58 + Math.sin(r) * 37, 60 + Math.cos(r) * 47, 58 + Math.sin(r) * 47];
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
});

/**
 * The Sweet Eye mark — a coffee bean opening like an eye under a rising sun —
 * drawn stroke by stroke. `animate` replays the draw-in.
 */
export function BrandMark({ size = 120, animate = true, color = colors.gold, delay = 0 }: {
  size?: number;
  animate?: boolean;
  color?: string;
  delay?: number;
}) {
  const draw = useSharedValue(animate ? 0 : 1);
  const rays = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    draw.value = withDelay(delay, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }));
    rays.value = withDelay(delay + 650, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [animate, delay, draw, rays]);

  const beanProps = useAnimatedProps(() => ({ strokeDashoffset: 170 * (1 - draw.value) }));
  const curveProps = useAnimatedProps(() => ({ strokeDashoffset: 80 * (1 - draw.value) }));
  const rayProps = useAnimatedProps(() => ({ strokeDashoffset: 12 * (1 - rays.value), opacity: rays.value }));

  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 120 102">
      {RAYS.map((d) => (
        <AnimatedPath key={d} d={d} stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeDasharray="12" animatedProps={rayProps} />
      ))}
      <AnimatedEllipse cx={60} cy={66} rx={29} ry={21} stroke={color} strokeWidth={3.6} fill="none" strokeDasharray="170" animatedProps={beanProps} />
      <AnimatedPath
        d="M 32 64 C 46 54, 58 76, 74 66 S 86 58, 89 62"
        stroke={color}
        strokeWidth={3.4}
        strokeLinecap="round"
        fill="none"
        strokeDasharray="80"
        animatedProps={curveProps}
      />
    </Svg>
  );
}

/** The real logo wordmark, tinted for dark backgrounds. */
export function Wordmark({ width = 180, color = colors.cream, style }: { width?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Image source={require('@/assets/images/logo.png')} style={{ width, height: width / 2 }} tintColor={color} contentFit="contain" />
    </View>
  );
}

/** Three wisps of steam drifting up forever. */
export function Steam({ width = 70, height = 70, color = colors.creamFaint }: { width?: number; height?: number; color?: string }) {
  return (
    <View style={{ width, height, flexDirection: 'row', justifyContent: 'center', gap: width * 0.12 }}>
      {[0, 1, 2].map((i) => (
        <Wisp key={i} delay={i * 520} height={height} color={color} />
      ))}
    </View>
  );
}

function Wisp({ delay, height, color }: { delay: number; height: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1));
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.25, 0.75, 1], [0, 0.9, 0.5, 0]),
    transform: [{ translateY: interpolate(t.value, [0, 1], [height * 0.35, -height * 0.25]) }, { scaleY: interpolate(t.value, [0, 1], [0.8, 1.15]) }],
  }));
  return (
    <Animated.View style={style}>
      <Svg width={14} height={height} viewBox="0 0 14 60">
        <Path d="M7 58 C 1 46, 13 38, 7 28 S 1 12, 7 2" stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

/** Slow-drifting golden light behind content — gives screens depth. */
export function AmbientGlow({ style, intensity = 1 }: { style?: StyleProp<ViewStyle>; intensity?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);
  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(t.value, [0, 1], [-30, 40]) }, { translateY: interpolate(t.value, [0, 1], [0, 50]) }, { scale: interpolate(t.value, [0, 1], [1, 1.15]) }],
  }));
  const b = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(t.value, [0, 1], [30, -50]) }, { translateY: interpolate(t.value, [0, 1], [40, -20]) }],
  }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      <Animated.View style={[styles.orb, { top: -140, right: -160, opacity: 0.55 * intensity }, a]}>
        <Orb color={colors.gold} />
      </Animated.View>
      <Animated.View style={[styles.orb, { top: 320, left: -220, opacity: 0.35 * intensity }, b]}>
        <Orb color={colors.brownLight} />
      </Animated.View>
    </View>
  );
}

function Orb({ color }: { color: string }) {
  return (
    <Svg width={460} height={460}>
      <Defs>
        <RadialGradient id={`g${color}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.55} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.14} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={230} cy={230} r={230} fill={`url(#g${color})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute', width: 460, height: 460 },
});
