import { router } from 'expo-router';
import { View } from 'react-native';
import { PageScreen } from '@/components/layout';
import { ExtraSections, PageHero, RichText } from '@/components/page-content';
import { Photo } from '@/components/photo';
import { Button, T } from '@/components/ui';
import { usePage } from '@/lib/pages';
import { radius, space } from '@/theme';

export default function AboutScreen() {
  const c = usePage('about');
  return <PageScreen title={c.page?.title ?? 'Our story'} contentStyle={{ maxWidth: 760 }}>
    <PageHero page="about" />
    {['story', 'process', 'values'].filter(c.visible).map((section) => <View key={section} style={{ gap: 12, marginTop: space.xxl }}>
      <T variant="overline">{c.text(`${section}.overline`)}</T>
      <T variant="title">{c.text(`${section}.heading`)}</T>
      {!!c.text(`${section}.body`) && <RichText text={c.text(`${section}.body`)} />}
      {!!c.image(`${section}.image`) && <Photo eager uri={c.image(`${section}.image`)} width={1440} style={{ height: 280, borderRadius: radius.lg }} />}
      {section === 'values' && [1,2,3].map((i) => <View key={i} style={{ gap: 6, marginTop: 12 }}><T variant="heading">{c.text(`values.item${i}_title`)}</T><T variant="body">{c.text(`values.item${i}_text`)}</T></View>)}
    </View>)}
    <ExtraSections sections={c.sections} />
    <Button title="Explore our coffee beans" onPress={() => router.navigate({ pathname: '/menu', params: { category: 'coffee-beans' } })} style={{ marginTop: space.xxl }} />
  </PageScreen>;
}
