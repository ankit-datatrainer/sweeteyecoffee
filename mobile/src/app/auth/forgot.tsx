import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Field, Notice, T } from '@/components/ui';
import { errorMessage, post } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import type { User } from '@/lib/types';
import { useAuth } from '@/store';
import { space } from '@/theme';

export default function ForgotScreen() {
  const signIn = useAuth((s) => s.signIn);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await post<{ message: string }>('/auth/forgot', { email });
      setInfo(r.message);
      setStep('code');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await post<{ token: string; user: User }>('/auth/reset', { email, code, password });
      await signIn(r.token, r.user);
      haptic.success();
      toast.success('Password updated — you’re signed in.');
      router.dismissTo('/account');
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageScreen title="Reset password" contentStyle={{ maxWidth: 520 }}>
        {step === 'email' ? (
          <Animated.View entering={FadeInDown} style={{ gap: 12 }}>
            <T variant="body" style={{ marginBottom: space.md }}>Enter your account email and we’ll send you a 6-digit code.</T>
            <Field label="Email" icon="mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={sendCode} />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button title="Send code" icon="send" loading={busy} onPress={sendCode} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInRight.springify().damping(18)} style={{ gap: 12 }}>
            {info && <Notice tone="success">{info}</Notice>}
            <Field label="6-digit code" icon="hash" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" />
            <Field label="New password (8+ characters)" icon="lock" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" onSubmitEditing={reset} />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button title="Set new password" icon="check" loading={busy} onPress={reset} />
            <Button title="Send a new code" variant="ghost" size="md" onPress={() => setStep('email')} />
          </Animated.View>
        )}
      </PageScreen>
    </KeyboardAvoidingView>
  );
}
