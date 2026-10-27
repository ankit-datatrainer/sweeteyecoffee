import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Field, Notice, T } from '@/components/ui';
import { errorMessage, post } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import type { User } from '@/lib/types';
import { useAuth } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

/** 0–4: length, mixed case, digit, symbol. */
const strength = (p: string) => (p.length >= 8 ? 1 : 0) + (/[a-z]/.test(p) && /[A-Z]/.test(p) ? 1 : 0) + (/\d/.test(p) ? 1 : 0) + (/[^A-Za-z0-9]/.test(p) ? 1 : 0);

export default function RegisterScreen() {
  const signIn = useAuth((s) => s.signIn);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', password_confirmation: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const score = strength(form.password);

  const meter = useAnimatedStyle(() => ({
    transform: [{ scaleX: withTiming(Math.max(0.04, score / 4), { duration: 300 }) }],
    backgroundColor: score <= 1 ? colors.danger : score === 2 ? '#E8C77A' : colors.success,
  }));

  const submit = async () => {
    setError(null);
    if (form.password !== form.password_confirmation) return setError('The passwords do not match.');
    setBusy(true);
    try {
      const r = await post<{ token: string; user: User }>('/auth/register', form);
      await signIn(r.token, r.user);
      haptic.success();
      toast.success(`Welcome to Sweet Eye, ${r.user.name.split(' ')[0]}!`);
      if (router.canGoBack()) router.back();
      else router.replace('/account');
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageScreen title="Create account" contentStyle={{ maxWidth: 520 }}>
        <Animated.View entering={FadeInDown} style={{ gap: 12 }}>
          <T variant="body" style={{ marginBottom: space.md }}>Order ahead, track every cup and keep your details for one-tap checkout.</T>
          <Field label="Full name" icon="user" value={form.name} onChangeText={set('name')} autoComplete="name" />
          <Field label="Email" icon="mail" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Field label="Phone (optional)" icon="phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" />
          <Field label="Password (8+ characters)" icon="lock" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />
          {!!form.password && (
            <View style={styles.meterTrack}>
              <Animated.View style={[styles.meterFill, meter]} />
            </View>
          )}
          <Field label="Confirm password" icon="check" value={form.password_confirmation} onChangeText={set('password_confirmation')} secureTextEntry onSubmitEditing={submit} />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button title="Create account" icon="user-plus" loading={busy} onPress={submit} style={{ marginTop: space.sm }} />
        </Animated.View>
        <View style={styles.switch}>
          <T variant="small">Already have an account?</T>
          <Text style={styles.link} onPress={() => router.replace('/auth/sign-in')}>Sign in</Text>
        </View>
      </PageScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  meterTrack: { height: 4, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden', marginTop: -4 },
  meterFill: { height: '100%', width: '100%', borderRadius: radius.pill, transformOrigin: 'left center' },
  switch: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.xxl },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
});
