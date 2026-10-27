import { useState } from 'react';
import { Photo } from '@/components/photo';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageScreen } from '@/components/layout';
import { IconButton, PressableScale, T } from '@/components/ui';
import { useCatalog } from '@/store';
import { colors, MAX_WIDTH, radius, space } from '@/theme';

const NO_PHOTOS: string[] = [];

export default function GalleryScreen() {
  const gallery = useCatalog((s) => s.store?.gallery ?? NO_PHOTOS);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(null);

  const inner = Math.min(width, MAX_WIDTH) - space.xl * 2;
  const columns = inner > 760 ? 3 : 2;
  const col = (inner - 12 * (columns - 1)) / columns;
  // Masonry: drop each photo into the shortest column.
  const stacks: { src: string; i: number; h: number }[][] = Array.from({ length: columns }, () => []);
  const heights = Array(columns).fill(0);
  gallery.forEach((src, i) => {
    const h = col * (i % 3 === 1 ? 1.45 : 0.9);
    const c = heights.indexOf(Math.min(...heights));
    stacks[c].push({ src, i, h });
    heights[c] += h + 12;
  });

  return (
    <PageScreen title="Gallery">
      <T variant="body" style={{ marginBottom: space.xl }}>Moments from the café — tap a photo to see it up close.</T>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {stacks.map((stack, c) => (
          <View key={c} style={{ width: col, gap: 12 }}>
            {stack.map((p) => (
              <Animated.View key={p.src} entering={FadeInDown.delay(p.i * 70).springify().damping(18)}>
                <PressableScale onPress={() => setOpen(p.i)} scaleTo={0.96} style={[styles.tile, { height: p.h }]}>
                  <Photo eager uri={p.src} width={540} style={StyleSheet.absoluteFill} transition={300} />
                </PressableScale>
              </Animated.View>
            ))}
          </View>
        ))}
      </View>

      <Modal visible={open !== null} transparent animationType="none" onRequestClose={() => setOpen(null)}>
        {open !== null && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.lightbox}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(null)} />
            <Animated.View entering={ZoomIn.springify().damping(16)} key={open}>
              <Photo eager uri={gallery[open]} width={1600} style={{ width: Math.min(width - 32, 900), height: Math.min(height * 0.72, 900) }} contentFit="contain" />
            </Animated.View>
            <View style={[styles.lightboxBar, { top: insets.top + 12 }]}>
              <IconButton name="x" onPress={() => setOpen(null)} />
            </View>
            <View style={[styles.lightboxNav, { bottom: insets.bottom + 30 }]}>
              <IconButton name="chevron-left" onPress={() => setOpen((open - 1 + gallery.length) % gallery.length)} />
              <T variant="smallStrong">{open + 1} / {gallery.length}</T>
              <IconButton name="chevron-right" onPress={() => setOpen((open + 1) % gallery.length)} />
            </View>
          </Animated.View>
        )}
      </Modal>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHigh },
  lightbox: { flex: 1, backgroundColor: 'rgba(8,4,2,0.96)', alignItems: 'center', justifyContent: 'center' },
  lightboxBar: { position: 'absolute', right: 16 },
  lightboxNav: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 24 },
});
