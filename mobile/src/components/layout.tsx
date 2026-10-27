import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, MAX_WIDTH, space } from '@/theme';
import { AmbientGlow } from './brand';
import { IconButton, T } from './ui';

/** Room to leave under scrolling content for the floating tab bar. */
export const TAB_BAR_SPACE = 110;

/** Centers content and caps its width on tablets / desktop browsers. */
export function Contained({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.contained, style]}>{children}</View>;
}

export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * Standard pushed screen: ambient background, a header that frosts over as
 * you scroll, and width-capped scrolling content.
 */
export function PageScreen({
  title,
  children,
  footer,
  right,
  glow = true,
  scrollProps,
  contentStyle,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  right?: ReactNode;
  glow?: boolean;
  scrollProps?: ScrollViewProps;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const headerBg = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, 40], [0, 1], 'clamp') }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [20, 60], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(y.value, [20, 60], [8, 0], 'clamp') }],
  }));

  return (
    <View style={styles.screen}>
      {glow && <AmbientGlow intensity={0.6} />}
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...scrollProps}
        contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: (footer ? 130 : 40) + insets.bottom }}>
        <Contained style={[{ paddingHorizontal: space.xl }, contentStyle]}>
          <T variant="display" style={{ marginBottom: space.xl }}>{title}</T>
          {children}
        </Contained>
      </Animated.ScrollView>

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, headerBg]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,8,6,0.94)', borderBottomWidth: 1, borderColor: colors.line }]} />
        </Animated.View>
        <Contained style={styles.headerRow}>
          <IconButton name="arrow-left" onPress={goBack} />
          <Animated.Text style={[styles.headerTitle, titleStyle]} numberOfLines={1}>{title}</Animated.Text>
          <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
        </Contained>
      </View>

      {footer && (
        <View style={styles.footer}>
          <StickyFooter>{footer}</StickyFooter>
        </View>
      )}
    </View>
  );
}

export function PlainScroll({ children, ...props }: ScrollViewProps & { children: ReactNode }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" {...props}>
      {children}
    </ScrollView>
  );
}

/** Frosted bar pinned to the bottom of a screen (checkout totals, add to bag…). */
export function StickyFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.footerInner}>
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,8,6,0.72)' }]} />
      <Contained style={{ paddingHorizontal: space.xl, paddingTop: 14, paddingBottom: insets.bottom + 14 }}>{children}</Contained>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  contained: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, gap: 12 },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 18, color: colors.cream, fontVariant: ['lining-nums'] },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footerInner: { overflow: 'hidden', borderTopWidth: 1, borderColor: colors.line },
});
