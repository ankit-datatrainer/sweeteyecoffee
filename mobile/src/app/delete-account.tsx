import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { PageScreen } from '@/components/layout';
import { Button, Card, Field, Notice, T } from '@/components/ui';
import { del, errorMessage } from '@/lib/api';
import { useAuth } from '@/store';

type DeletionResult = { status: 'deleted' | 'requested'; message: string; reference?: string };

export default function DeleteAccountScreen() {
  const { ready, user, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DeletionResult | null>(null);
  const submitting = useRef(false);

  const submit = async () => {
    if (submitting.current || !password) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await del<DeletionResult>('/auth/me', { password });
      setPassword('');
      setResult(response);
      if (response.status === 'deleted') await signOut();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const confirm = () => {
    const warning = 'This requests permanent deletion of your account and associated personal data.';
    if (Platform.OS === 'web') {
      if (window.confirm(warning)) void submit();
      return;
    }
    Alert.alert('Delete your account?', warning, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request deletion', style: 'destructive', onPress: () => void submit() },
    ]);
  };

  return (
    <PageScreen title="Delete your account" contentStyle={{ maxWidth: 640 }}>
      <Card style={{ gap: 14 }}>
        <T variant="heading">Sweet Eye Coffee</T>
        <T variant="body">Sign in to the account you want to delete, confirm your password, then request deletion here.</T>
        <T variant="body">This removes your account profile and associated personal data. Our team reviews requests involving orders, subscriptions or staff access before closing the account. Transaction records may be kept as needed to fulfill orders, resolve payment disputes or meet legal obligations.</T>
        {result ? (
          <Notice tone="success">{result.message}{result.reference ? ' Reference ' + result.reference + '.' : ''}</Notice>
        ) : ready && user ? (
          <View style={{ gap: 12 }}>
            <Field label="Current password" icon="lock" value={password} onChangeText={setPassword} secureTextEntry />
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button title="Request account deletion" variant="dark" icon="trash-2" disabled={!password || busy} loading={busy} onPress={confirm} />
          </View>
        ) : ready ? (
          <Button title="Sign in to request deletion" onPress={() => router.push({ pathname: '/auth/sign-in', params: { next: 'delete-account' } })} />
        ) : (
          <T variant="small">Checking your session…</T>
        )}
        <T variant="small">If you cannot access your account, email support@sweeteyecoffee.com from your account email and ask to delete your account and personal data.</T>
        <Button title="Email support" variant="outline" onPress={() => void Linking.openURL('mailto:support@sweeteyecoffee.com?subject=Sweet%20Eye%20Coffee%20account%20deletion')} />
        <Button title="Privacy policy" variant="outline" onPress={() => router.push('/legal/privacy')} />
      </Card>
    </PageScreen>
  );
}
