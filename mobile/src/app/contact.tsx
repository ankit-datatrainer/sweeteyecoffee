import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { SuccessBadge } from '@/components/order-bits';
import { Button, Card, Field, Icon, Notice, PressableScale, T } from '@/components/ui';
import { errorMessage, post } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useAuth, useCatalog } from '@/store';
import { colors, space } from '@/theme';

export default function ContactScreen() {
  const user = useAuth((s) => s.user);
  const store = useCatalog((s) => s.store);
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', message: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await post<{ message: string }>('/contact', form);
      haptic.success();
      setSent(r.message);
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageScreen title="Contact us" contentStyle={{ maxWidth: 720 }}>
      {store && (
        <Animated.View entering={FadeInDown} style={styles.quick}>
          {[
            { icon: 'phone' as const, label: store.phone_display, go: () => Linking.openURL(`tel:${store.phone}`) },
            { icon: 'mail' as const, label: 'Email us', go: () => Linking.openURL(`mailto:${store.email}`) },
            { icon: 'navigation' as const, label: 'Directions', go: () => Linking.openURL(store.directions_url) },
          ].map((q) => (
            <PressableScale key={q.icon} onPress={q.go} style={styles.quickCard}>
              <Icon name={q.icon} size={20} color={colors.gold} />
              <T variant="smallStrong" style={{ textAlign: 'center' }}>{q.label}</T>
            </PressableScale>
          ))}
        </Animated.View>
      )}

      {sent ? (
        <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center', gap: 14, paddingVertical: space.xxxl }}>
          <SuccessBadge size={96} />
          <T variant="title" style={{ textAlign: 'center' }}>Message sent</T>
          <T variant="body" style={{ textAlign: 'center' }}>{sent}</T>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(100)} style={{ gap: 12, marginTop: space.xl }}>
          <T variant="overline">Send a message</T>
          <Field label="Your name" icon="user" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <Field label="Email" icon="mail" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Phone (optional)" icon="phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
          <Field label="Message" value={form.message} onChangeText={(v) => setForm({ ...form, message: v })} multiline maxLength={5000} />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button title="Send message" icon="send" loading={busy} onPress={submit} />
        </Animated.View>
      )}

      {store && (
        <Card style={{ marginTop: space.xxl, gap: 8 }}>
          <T variant="heading">Opening hours</T>
          {store.hours.map((h) => (
            <View key={h.days} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T variant="body">{h.days}</T>
              <T variant="bodyStrong" style={{ color: colors.goldLight }}>{h.time}</T>
            </View>
          ))}
          <T variant="small" style={{ marginTop: 6 }}>{store.address}</T>
        </Card>
      )}
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: 10 },
  quickCard: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
