import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Steam } from '@/components/brand';
import { PageScreen } from '@/components/layout';
import { Button, Icon, Notice, PressableScale, Skeleton, T } from '@/components/ui';
import { errorMessage, get } from '@/lib/api';
import { shortDate, TICKET_COLOR } from '@/lib/format';
import type { Ticket } from '@/lib/types';
import { useAuth } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

export default function SupportScreen() {
  const user = useAuth((s) => s.user);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        router.replace('/auth/sign-in');
        return;
      }
      get<{ tickets: Ticket[] }>('/tickets')
        .then((r) => setTickets(r.tickets))
        .catch((e) => setError(errorMessage(e)));
    }, [user]),
  );

  return (
    <PageScreen title="Support" right={<Button title="New" icon="plus" size="md" onPress={() => router.push('/support/new')} style={{ paddingHorizontal: 16 }} />}>
      <T variant="body" style={{ marginBottom: space.xl }}>Questions about an order, feedback or a special request? Open a ticket and our team will reply here.</T>
      {error && <Notice tone="danger">{error}</Notice>}
      {tickets === null && !error ? (
        <View style={{ gap: 12 }}>
          {[0, 1].map((i) => <Skeleton key={i} style={{ height: 96 }} />)}
        </View>
      ) : tickets?.length === 0 ? (
        <View style={styles.empty}>
          <Steam width={56} height={48} />
          <T variant="heading">No tickets yet</T>
          <Button title="Open a ticket" icon="message-circle" size="md" onPress={() => router.push('/support/new')} style={{ paddingHorizontal: 26 }} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {tickets?.map((t, i) => (
            <Animated.View key={t.id} entering={FadeInDown.delay(i * 60)}>
              <PressableScale onPress={() => router.push(`/support/${t.id}`)} style={styles.card} scaleTo={0.98}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={styles.subject} numberOfLines={1}>{t.subject}</Text>
                  <Text style={[styles.status, { color: TICKET_COLOR[t.status], borderColor: TICKET_COLOR[t.status] }]}>{t.status.replace('_', ' ')}</Text>
                </View>
                <T variant="small" numberOfLines={2}>{t.message}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="hash" size={12} color={colors.creamFaint} />
                  <T variant="small" style={{ color: colors.creamFaint }}>{t.ticket_number} · {shortDate(t.created_at)}</T>
                  {t.admin_response && <Text style={styles.replied}>Replied</Text>}
                </View>
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 },
  subject: { flex: 1, fontFamily: fonts.displaySemi, fontSize: 17, color: colors.cream },
  status: { fontFamily: fonts.semibold, fontSize: 11, textTransform: 'capitalize', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  replied: { marginLeft: 'auto', fontFamily: fonts.semibold, fontSize: 12, color: colors.success },
});
