import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Text, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

/** Scroll position of the nearest scroll view, for scroll-driven effects. */
export const ScrollYContext = createContext<SharedValue<number> | null>(null);

/**
 * Fades + lifts its children in as they scroll into view (and keeps the
 * motion tied to the scroll, so it reverses when you scroll back up).
 */
export function Reveal({ children, style, distance = 40, delay = 0 }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  distance?: number;
  delay?: number;
}) {
  const scrollY = useContext(ScrollYContext);
  const { height } = useWindowDimensions();
  const top = useSharedValue(-1);

  const animated = useAnimatedStyle(() => {
    if (!scrollY || top.value < 0) return { opacity: 1 };
    const start = top.value - height + 40 + delay;
    const progress = interpolate(scrollY.value, [start, start + 180], [0, 1], 'clamp');
    return {
      opacity: progress,
      transform: [{ translateY: (1 - progress) * distance }, { scale: 0.97 + progress * 0.03 }],
    };
  });

  return (
    <Animated.View
      style={[style, animated]}
      onLayout={(e) => {
        // Only the first layout matters; content above doesn't move after load.
        if (top.value < 0) top.value = e.nativeEvent.layout.y;
      }}>
      {children}
    </Animated.View>
  );
}

/** Counts up to `to` once mounted, e.g. 0 → 10K+. */
export function CountUp({ to, decimals = 0, suffix = '', duration = 1400, style, start = true }: {
  to: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  start?: boolean;
}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let frame = 0;
    const began = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(to * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, duration, start]);
  return <Text style={style}>{value.toFixed(decimals)}{suffix}</Text>;
}
