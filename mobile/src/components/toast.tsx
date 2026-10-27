import { BlurView } from 'expo-blur';
import { Photo } from './photo';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, fonts, radius } from '@/theme';
import { Icon } from './ui';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info'; image?: string | null };

const useToastStore = create<{ toast: Toast | null; show: (t: Omit<Toast, 'id'>) => void; hide: () => void }>((set) => ({
  toast: null,
  show: (t) => set({ toast: { ...t, id: Date.now() } }),
  hide: () => set({ toast: null }),
}));

export const toast = {
  success: (message: string, image?: string | null) => useToastStore.getState().show({ message, tone: 'success', image }),
  error: (message: string) => useToastStore.getState().show({ message, tone: 'error' }),
  info: (message: string) => useToastStore.getState().show({ message, tone: 'info' }),
};

/** Glass notification that drops in from the top. */
export function ToastHost() {
  const { toast: current, hide } = useToastStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(hide, current.tone === 'error' ? 4200 : 2600);
    return () => clearTimeout(timer);
  }, [current, hide]);

  if (!current) return null;
  const accent = current.tone === 'error' ? colors.danger : current.tone === 'success' ? colors.success : colors.gold;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <Animated.View
        key={current.id}
        entering={SlideInUp.springify().damping(16)}
        exiting={FadeOutUp.duration(220)}
        style={[styles.wrap, { top: insets.top + 8 }]}>
        <BlurView intensity={50} tint="dark" style={styles.toast}>
          {current.image ? (
            <Photo eager uri={current.image} width={160} style={styles.thumb} />
          ) : (
            <View style={[styles.iconWrap, { backgroundColor: `${accent}22` }]}>
              <Icon name={current.tone === 'error' ? 'alert-circle' : current.tone === 'success' ? 'check' : 'info'} size={16} color={accent} />
            </View>
          )}
          <Text style={styles.text} numberOfLines={2}>{current.message}</Text>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingRight: 18,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(27,17,12,0.72)',
    maxWidth: 520,
  },
  thumb: { width: 34, height: 34, borderRadius: 17 },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream, flexShrink: 1 },
});
