import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { PageSection } from '@/lib/types';
import { openPageLink, usePage } from '@/lib/pages';
import { colors, fonts, radius, space } from '@/theme';
import { Photo } from './photo';
import { Button, Card, T } from './ui';

function InlineText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && /^(https?:\/\/|\/(?!\/))/.test(link[2]))
      return (
        <Text key={i} style={{ color: colors.gold }} onPress={() => openPageLink(link[2])}>
          {link[1]}
        </Text>
      );
    return (
      <Text key={i} style={part.startsWith('**') ? { fontFamily: fonts.bold } : undefined}>
        {part.startsWith('**') ? part.slice(2, -2) : part}
      </Text>
    );
  });
}
export function RichText({ text }: { text: string }) {
  return (
    <View style={{ gap: 14 }}>
      {text
        .replace(/\r\n/g, '\n')
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((p, i) => {
          const heading = p.match(/^#{1,3}\s+(.+)$/);
          return (
            <T key={i} variant={heading ? 'heading' : 'body'}>
              <InlineText text={heading?.[1] ?? p.replace(/^[-*] /gm, '• ')} />
            </T>
          );
        })}
    </View>
  );
}
export function PageHero({ page }: { page: string }) {
  const c = usePage(page);
  return (
    <View style={styles.hero}>
      <Photo eager uri={c.image('hero.background')} width={1440} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(14,8,6,0.3)', 'rgba(14,8,6,0.95)']} style={StyleSheet.absoluteFill} />
      <View style={styles.heroText}>
        <T variant="overline">{c.text('hero.overline')}</T>
        <T variant="title">{c.text('hero.title', c.page?.title ?? '')}</T>
        {!!c.text('hero.subtitle') && <T variant="body">{c.text('hero.subtitle')}</T>}
      </View>
    </View>
  );
}
export function ExtraSections({ sections }: { sections: PageSection[] }) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ gap: space.xl, marginTop: sections.length ? space.xxl : 0 }}>
      {sections.map((s) => {
        const text = (key: string) => (typeof s.data[key] === 'string' ? (s.data[key] as string) : '');
        const images = Array.isArray(s.data.images) ? s.data.images : [];
        return (
          <Card
            key={s.id}
            style={{ gap: 12, ...(text('background') === 'dark' ? { backgroundColor: colors.bgSoft } : {}) }}
          >
            {!!text('overline') && <T variant="overline">{text('overline')}</T>}
            {!!text('heading') && (
              <T variant="title" style={text('align') === 'center' ? { textAlign: 'center' } : undefined}>
                {text('heading')}
              </T>
            )}
            <View
              style={{
                gap: 16,
                flexDirection:
                  s.type === 'text_image' && width > 760 ? (text('side') === 'left' ? 'row-reverse' : 'row') : 'column',
              }}
            >
              {!!text('body') && (
                <View style={{ flex: 1 }}>
                  <RichText text={text('body')} />
                </View>
              )}
              {!!text('image') && (
                <View style={{ flex: 1 }}>
                  <Photo
                    uri={text('image')}
                    width={1440}
                    style={{ width: '100%', height: 280, borderRadius: radius.lg }}
                    contentFit={s.type === 'image' ? 'contain' : 'cover'}
                  />
                </View>
              )}
            </View>
            {!!text('caption') && <T variant="small">{text('caption')}</T>}
            {images.map((p, i) => (
              <View key={`${p.src}-${i}`} style={{ gap: 6 }}>
                <Photo uri={p.url ?? p.src} width={1440} style={{ height: 280, borderRadius: radius.md }} />
                {!!p.caption && <T variant="small">{p.caption}</T>}
              </View>
            ))}
            {!!text('text') && <RichText text={text('text')} />}
            {!!text('button_label') && !!text('button_url') && (
              <Button title={text('button_label')} onPress={() => openPageLink(text('button_url'))} />
            )}
          </Card>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  hero: { height: 320, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface },
  heroText: { position: 'absolute', left: 22, right: 22, bottom: 22, gap: 8 },
});
