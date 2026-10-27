import { LinearGradient } from 'expo-linear-gradient';
import { Photo } from '@/components/photo';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BrandMark } from '@/components/brand';
import { PageScreen } from '@/components/layout';
import { Button, Icon, T } from '@/components/ui';
import { useCatalog } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

const NO_PHOTOS: string[] = [];

export default function AboutScreen() {
  const gallery = useCatalog((s) => s.store?.gallery ?? NO_PHOTOS);
  const photo = (name: string) => gallery.find((g) => g.includes(name)) ?? gallery[0];

  return (
    <PageScreen title="Our Story" contentStyle={{ maxWidth: 760 }}>
      <Animated.View entering={FadeInDown} style={styles.hero}>
        <Photo eager uri={photo('IMG_1801')} width={1080} style={StyleSheet.absoluteFill} transition={400} />
        <LinearGradient colors={['transparent', 'rgba(14,8,6,0.95)']} style={StyleSheet.absoluteFill} />
        <View style={styles.heroText}>
          <T variant="overline">About Sweet Eye Coffee</T>
          <Text style={styles.heroTitle}>Imported globally,{'\n'}<Text style={{ fontFamily: fonts.displayBoldItalic, color: colors.gold }}>roasted locally.</Text></Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100)} style={styles.block}>
        <T variant="overline">Who we are</T>
        <T variant="title" style={styles.blockTitle}>Exceptional coffee starts with exceptional quality</T>
        <T variant="body" style={styles.p}>
          We pride ourselves on providing only quality, specialty coffees. As coffee enthusiasts, we decided we had let too many years pass drinking ordinary coffee.
        </T>
        <T variant="body" style={styles.p}>
          Unlike most coffees you find in big-box stores, Sweet Eye Coffee was founded with freshness and quality at its foundation. Every batch is carefully selected and roasted to order.
        </T>
        <T variant="body" style={styles.p}>
          Coffee beans are seeds from coffee cherries grown all over the world. Climate, altitude and harvesting shape each origin’s flavor — and we import only Grade A specialty beans, inspected for defects before roasting.
        </T>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160)} style={styles.quoteCard}>
        <BrandMark size={58} />
        <Text style={styles.quote}>“There are no shortcuts around quality.”</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200)} style={styles.block}>
        <T variant="overline">Our process</T>
        <T variant="title" style={styles.blockTitle}>Roasted to order</T>
        <T variant="body" style={styles.p}>
          Mass-market coffee is roasted months — sometimes years — before it reaches you. Sweet Eye roasts each batch only after you order, for maximum freshness and vibrant flavor. With every roast and grind available, you’ll find a coffee you call yours.
        </T>
        <Photo eager uri={photo('IMG_1917')} width={1080} style={styles.inline} transition={400} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(240)} style={styles.block}>
        <T variant="overline">Our values</T>
        <T variant="title" style={styles.blockTitle}>What sets us apart</T>
        {[
          ['globe', 'Globally sourced', 'Premium, specialty-grade beans from the ripest cherries across the world’s finest regions.'],
          ['sun', 'Locally roasted', 'Small-batch roasted fresh to order, never sitting on shelves for months.'],
          ['award', 'Quality inspected', 'Only Grade A specialty beans make the cut — every bean inspected before roasting.'],
        ].map(([icon, title, body]) => (
          <View key={title} style={styles.value}>
            <View style={styles.valueIcon}>
              <Icon name={icon as 'globe'} size={18} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="subheading">{title}</T>
              <T variant="small" style={{ marginTop: 3 }}>{body}</T>
            </View>
          </View>
        ))}
      </Animated.View>

      <Button title="Explore our coffee beans" icon="arrow-right" onPress={() => router.navigate({ pathname: '/menu', params: { category: 'coffee-beans' } })} style={{ marginTop: space.xxl }} />
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 340, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface },
  heroText: { position: 'absolute', left: 22, right: 22, bottom: 22, gap: 8 },
  heroTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.cream },
  block: { marginTop: space.xxxl },
  blockTitle: { marginTop: 8, marginBottom: space.md },
  p: { marginBottom: space.md },
  quoteCard: {
    marginTop: space.xxxl,
    alignItems: 'center',
    gap: 14,
    padding: space.xxl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  quote: { fontFamily: fonts.displayBoldItalic, fontSize: 24, lineHeight: 31, color: colors.cream, textAlign: 'center' },
  inline: { height: 260, borderRadius: radius.lg, marginTop: space.md, backgroundColor: colors.surface },
  value: { flexDirection: 'row', gap: 14, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line },
  valueIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(212,163,115,0.1)', alignItems: 'center', justifyContent: 'center' },
});
