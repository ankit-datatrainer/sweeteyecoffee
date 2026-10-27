import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { cartCount, useCart } from '@/store';
import { colors, fonts, springs } from '@/theme';

const TABS: Record<string, { label: string; icon: ComponentProps<typeof Feather>['name'] }> = {
  index: { label: 'Home', icon: 'home' },
  menu: { label: 'Menu', icon: 'coffee' },
  bag: { label: 'Bag', icon: 'shopping-bag' },
  orders: { label: 'Orders', icon: 'clock' },
  account: { label: 'Account', icon: 'user' },
};

/** Floating frosted-glass tab bar with a gliding gold highlight. */
export function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const routes = state.routes.filter((r) => TABS[r.name]);
  const activeIndex = Math.max(0, routes.findIndex((r) => r.key === state.routes[state.index]?.key));
  const [width, setWidth] = useState(0);
  const tabWidth = routes.length ? width / routes.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(activeIndex * tabWidth, springs.snappy);
  }, [activeIndex, tabWidth, x]);

  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: tabWidth }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 12)}>
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
        {width > 0 && (
          <Animated.View style={[styles.highlightTrack, highlight]}>
            <View style={styles.highlight} />
          </Animated.View>
        )}
        {routes.map((route, i) => (
          <TabItem
            key={route.key}
            name={route.name}
            focused={i === activeIndex}
            onPress={() => {
              haptic.tap();
              navigateToTab(route.key);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function TabItem({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const tab = TABS[name];
  const on = useSharedValue(focused ? 1 : 0);
  const count = useCart((s) => cartCount(s.lines));
  const bump = useSharedValue(1);

  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, { duration: 260 });
  }, [focused, on]);

  useEffect(() => {
    if (name === 'bag' && count > 0) bump.value = withSequence(withSpring(1.45, springs.bouncy), withSpring(1, springs.bouncy));
  }, [count, name, bump]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(on.value, [0, 1], [0, -2]) }, { scale: interpolate(on.value, [0, 1], [1, 1.08]) }] }));
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [colors.creamMuted, colors.goldLight]) }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  return (
    <Pressable onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tab.label}>
      <Animated.View style={iconStyle}>
        <Feather name={tab.icon} size={21} color={focused ? colors.goldLight : colors.creamMuted} />
        {name === 'bag' && count > 0 && (
          <Animated.View style={[styles.badge, badgeStyle]}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </Animated.View>
        )}
      </Animated.View>
      <Animated.Text style={[styles.label, labelStyle]}>{tab.label}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 520,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(231,195,158,0.16)',
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  tint: { backgroundColor: 'rgba(20,12,8,0.68)' },
  highlightTrack: { position: 'absolute', left: 6, top: 7, bottom: 7, paddingHorizontal: 4 },
  highlight: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: 'rgba(212,163,115,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(212,163,115,0.28)',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 },
  label: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.3 },
  badge: {
    position: 'absolute',
    top: -7,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1a110c',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9.5, color: colors.espresso },
});
