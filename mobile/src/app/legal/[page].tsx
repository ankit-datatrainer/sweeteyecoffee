import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { PageScreen } from '@/components/layout';
import { ExtraSections, RichText } from '@/components/page-content';
import { Button, Notice, T } from '@/components/ui';
import { usePage } from '@/lib/pages';
import { space } from '@/theme';

export default function LegalScreen() {
  const { page = 'privacy' } = useLocalSearchParams<{ page: string }>();
  const c = usePage(page);
  return (
    <PageScreen title={c.text('hero.title', 'Policies')} contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: space.xl }}>
        {(['privacy', 'terms', 'refund'] as const).map((p) => (
          <Button
            key={p}
            title={{ privacy: 'Privacy', terms: 'Terms', refund: 'Refunds' }[p]}
            variant={p === page ? 'gold' : 'outline'}
            size="md"
            onPress={() => router.replace(`/legal/${p}`)}
          />
        ))}
      </View>
      {c.page ? (
        <View style={{ gap: 18 }}>
          <T variant="body">{c.text('hero.subtitle')}</T>
          <T variant="small">Last updated: {c.text('body.updated')}</T>
          <RichText text={c.text('body.text')} />
          {page === 'privacy' && <Button title="Request account deletion" variant="outline" onPress={() => router.push('/delete-account')} />}
          <ExtraSections sections={c.sections} />
        </View>
      ) : (
        <Notice>Loading page content…</Notice>
      )}
    </PageScreen>
  );
}
