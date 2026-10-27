import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Chip, Field, Notice, T } from '@/components/ui';
import { errorMessage, post } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import type { Ticket } from '@/lib/types';
import { space } from '@/theme';

export default function NewTicketScreen() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Ticket['priority']>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await post<{ ticket: Ticket; message: string }>('/tickets', { subject, message, priority });
      haptic.success();
      toast.success(r.message);
      router.replace(`/support/${r.ticket.id}`);
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageScreen title="New ticket" contentStyle={{ maxWidth: 640 }}>
      <Animated.View entering={FadeInDown} style={{ gap: 12 }}>
        <Field label="Subject" icon="tag" value={subject} onChangeText={setSubject} maxLength={255} />
        <Field label="How can we help?" value={message} onChangeText={setMessage} multiline maxLength={5000} />
        <T variant="overline" style={{ marginTop: space.md }}>Priority</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['low', 'medium', 'high'] as const).map((p) => (
            <Chip key={p} label={p[0].toUpperCase() + p.slice(1)} selected={priority === p} onPress={() => setPriority(p)} style={{ flex: 1 }} />
          ))}
        </View>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button title="Send ticket" icon="send" loading={busy} onPress={submit} style={{ marginTop: space.md }} />
      </Animated.View>
    </PageScreen>
  );
}
