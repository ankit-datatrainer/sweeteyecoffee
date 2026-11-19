import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { PageScreen } from '@/components/layout';
import { ExtraSections, RichText } from '@/components/page-content';
import { Button, Notice, T } from '@/components/ui';
import { errorMessage, get } from '@/lib/api';
import type { PageContent } from '@/lib/types';
import { space } from '@/theme';

export default function LegalScreen() {
  const { page = 'privacy' } = useLocalSearchParams<{ page: string }>();
  const [loaded, setLoaded] = useState<{ name: string; content: PageContent } | null>(null);
  const [problem, setProblem] = useState<{ name: string; attempt: number; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const content = loaded?.name === page ? loaded.content : null;
  const error = problem?.name === page && problem.attempt === attempt ? problem.message : null;

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setProblem(null);
    get<{ page: PageContent }>(`/pages/${encodeURIComponent(page)}`, { signal: controller.signal })
      .then(({ page: content }) => { if (!controller.signal.aborted) setLoaded({ name: page, content }); })
      .catch((e) => { if (!controller.signal.aborted) setProblem({ name: page, attempt, message: errorMessage(e) }); });
    return () => controller.abort();
  }, [page, attempt]));

  const text = (key: string) => String(content?.fields[key] ?? '');
  const titles = { privacy: 'Privacy policy', terms: 'Terms & Conditions', refund: 'Refund policy' };
  return (
    <PageScreen title={text('hero.title') || titles[page as keyof typeof titles] || 'Policies'} contentStyle={{ maxWidth: 760 }}>
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
      {content ? (
        <View style={{ gap: 18 }}>
          <T variant="body">{text('hero.subtitle')}</T>
          <T variant="small">Last updated: {text('body.updated')}</T>
          <RichText text={text('body.text')} />
          {page === 'privacy' && <Button title="Request account deletion" variant="outline" onPress={() => router.push('/delete-account')} />}
          <ExtraSections sections={content.sections} />
        </View>
      ) : error ? (
        <View style={{ gap: 12 }}>
          <Notice tone="danger">{error}</Notice>
          <Button title="Try again" variant="outline" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      ) : (
        <Notice>Loading page content…</Notice>
      )}
    </PageScreen>
  );
}
