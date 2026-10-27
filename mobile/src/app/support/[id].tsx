import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { Card, Icon, Notice, Skeleton, T } from '@/components/ui';
import { errorMessage, get } from '@/lib/api';
import { dateTime, TICKET_COLOR } from '@/lib/format';
import type { Ticket } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<{ ticket: Ticket }>(`/tickets/${id}`)
      .then((r) => setTicket(r.ticket))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  return (
    <PageScreen title={ticket?.subject ?? 'Ticket'} contentStyle={{ maxWidth: 720 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!ticket ? (
        !error && <Skeleton style={{ height: 200 }} />
      ) : (
        <View style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[styles.status, { color: TICKET_COLOR[ticket.status], borderColor: TICKET_COLOR[ticket.status] }]}>{ticket.status.replace('_', ' ')}</Text>
            <T variant="small">{ticket.ticket_number} · {ticket.priority} priority</T>
          </View>
          <Animated.View entering={FadeInDown}>
            <Card style={{ gap: 8 }}>
              <T variant="smallStrong">You · {dateTime(ticket.created_at)}</T>
              <T variant="body">{ticket.message}</T>
            </Card>
          </Animated.View>
          {ticket.admin_response ? (
            <Animated.View entering={FadeInDown.delay(120)}>
              <Card style={{ gap: 8, borderColor: 'rgba(212,163,115,0.35)', backgroundColor: 'rgba(212,163,115,0.07)', marginLeft: 24 }}>
                <T variant="smallStrong" style={{ color: colors.goldLight }}>Sweet Eye team · {dateTime(ticket.responded_at)}</T>
                <T variant="body">{ticket.admin_response}</T>
              </Card>
            </Animated.View>
          ) : (
            <View style={styles.waiting}>
              <Icon name="clock" size={15} color={colors.creamMuted} />
              <T variant="small">Our team will reply here soon — usually within a day.</T>
            </View>
          )}
        </View>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  status: { fontFamily: fonts.semibold, fontSize: 12, textTransform: 'capitalize', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: space.lg },
});
