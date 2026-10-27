import { Image, type ImageContentFit } from 'expo-image';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { sized } from '@/lib/api';
import { colors } from '@/theme';
import { Icon } from './ui';

/**
 * Every menu / café photo in the app. Asks the API for a copy sized for where
 * it's shown (`width` in pixels), caches it, and shows a branded placeholder
 * instead of an empty box when a photo is missing or fails to load.
 */
export function Photo({ uri, width = 540, style, contentFit = 'cover', transition = 300, iconSize = 22, eager = false }: {
  uri: string | null | undefined;
  width?: number;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
  iconSize?: number;
  /** Web only: load now instead of when scrolled near (photos on short, showcase screens). */
  eager?: boolean;
}) {
  const src = sized(uri, width);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <View testID="photo-placeholder" style={[style, styles.placeholder]}>
        <Icon name="coffee" size={iconSize} color={colors.goldDeep} />
      </View>
    );
  }

  return (
    <Image
      source={src}
      recyclingKey={src}
      style={style as ComponentProps<typeof Image>['style']}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailedSrc(src)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
