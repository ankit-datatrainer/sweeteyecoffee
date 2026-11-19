import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Card, Field, T } from '@/components/ui';
import { errorMessage, patch, put } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import type { User } from '@/lib/types';
import { useAuth } from '@/store';
import { colors, space } from '@/theme';

export default function ProfileScreen() {
  const { user, ready, setUser, signIn } = useAuth();
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', address: user?.address ?? '' });
  const [pw, setPw] = useState({ current_password: '', password: '' });
  const [emailPw, setEmailPw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace('/auth/sign-in');
  }, [ready, user]);
  if (!user) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      haptic.success();
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = () =>
    run('profile', async () => {
      const emailChanged = form.email.trim().toLowerCase() !== user.email.toLowerCase();
      const r = await patch<{ user: User }>('/auth/me', emailChanged ? { ...form, current_password: emailPw } : form);
      setEmailPw('');
      setUser(r.user);
      toast.success('Profile saved.');
    });

  const changePassword = () =>
    run('password', async () => {
      // A new password signs out other devices; this one gets a fresh token.
      const r = await put<{ token?: string }>('/auth/password', pw);
      if (r.token) await signIn(r.token, user);
      setPw({ current_password: '', password: '' });
      toast.success('Password updated.');
    });

  return (
    <PageScreen title="Profile" contentStyle={{ maxWidth: 640 }}>
      <Animated.View entering={FadeInDown} style={{ gap: 12 }}>
        <T variant="overline">Your details</T>
        <Field label="Full name" icon="user" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
        <Field label="Email" icon="mail" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
        {form.email.trim().toLowerCase() !== user.email.toLowerCase() && (
          <Animated.View entering={FadeInDown}>
            <Field label="Current password (to change your email)" icon="lock" value={emailPw} onChangeText={setEmailPw} secureTextEntry />
          </Animated.View>
        )}
        <Field label="Phone" icon="phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
        <Field label="Address" icon="map-pin" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} multiline />
        <Button title="Save changes" icon="check" loading={busy === 'profile'} onPress={saveProfile} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100)} style={{ gap: 12, marginTop: space.xxxl }}>
        <T variant="overline">Change password</T>
        <Field label="Current password" icon="lock" value={pw.current_password} onChangeText={(v) => setPw({ ...pw, current_password: v })} secureTextEntry />
        <Field label="New password (8+ characters)" icon="key" value={pw.password} onChangeText={(v) => setPw({ ...pw, password: v })} secureTextEntry />
        <Button title="Update password" variant="outline" loading={busy === 'password'} onPress={changePassword} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200)} style={{ marginTop: space.xxxl }}>
        <Card style={{ gap: 12, borderColor: 'rgba(238,142,122,0.3)' }}>
          <T variant="heading" style={{ color: colors.danger }}>Delete account</T>
          <T variant="small">Request permanent deletion of your Sweet Eye Coffee account and associated personal data.</T>
          <Button title="Delete account" variant="dark" icon="trash-2" onPress={() => router.push('/delete-account')} />
        </Card>
      </Animated.View>
    </PageScreen>
  );
}
