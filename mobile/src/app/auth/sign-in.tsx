import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BrandMark } from '@/components/brand';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Field, Notice, T } from '@/components/ui';
import { errorMessage, post } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import type { User } from '@/lib/types';
import { useAuth } from '@/store';
import { colors, fonts, space } from '@/theme';

export default function SignInScreen() {
  const signIn = useAuth((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await post<{ token: string; user: User }>('/auth/login', { email, password });
      await signIn(r.token, r.user);
      haptic.success();
      toast.success(`Welcome back, ${r.user.name.split(' ')[0]}!`);
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
      <PageScreen title="Sign in" contentStyle={{ maxWidth: 520 }}>
        <Animated.View entering={FadeInDown} style={styles.mark}>
          <BrandMark size={74} />
          <T variant="body" style={{ textAlign: 'center' }}>Welcome back. Your usual is one tap away.</T>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(100)} style={{ gap: 12 }}>
          <Field label="Email" icon="mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <Field label="Password" icon="lock" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
          <Text style={styles.forgot} onPress={() => router.push('/auth/forgot')}>Forgot your password?</Text>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button title="Sign in" icon="log-in" loading={busy} onPress={submit} style={{ marginTop: space.sm }} />
        </Animated.View>
        <View style={styles.switch}>
          <T variant="small">New to Sweet Eye?</T>
          <Text style={styles.link} onPress={() => router.replace('/auth/register')}>Create an account</Text>
        </View>
      </PageScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', gap: 10, marginBottom: space.xxl },
  forgot: { alignSelf: 'flex-end', fontFamily: fonts.semibold, fontSize: 13, color: colors.gold, paddingVertical: 4 },
  switch: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.xxl },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold },
});
