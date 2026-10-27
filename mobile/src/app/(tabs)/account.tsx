import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientGlow, BrandMark } from '@/components/brand';
import { Contained, TAB_BAR_SPACE } from '@/components/layout';
import { CountUp } from '@/components/motion';
import { toast } from '@/components/toast';
import { Button, Icon, PressableScale, T } from '@/components/ui';
import { get } from '@/lib/api';
import { useAuth, useCatalog } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

type Item = { icon: ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; tone?: 'danger' | 'gold' };

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const store = useCatalog((s) => s.store);
  const [summary, setSummary] = useState<{ total_orders: number; total_spent: number; open_tickets: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (user) get<typeof summary>('/account/summary').then(setSummary).catch(() => {});
    }, [user]),
  );

  const explore: Item[] = [
    { icon: 'book-open', label: 'Our story', onPress: () => router.push('/about') },
    { icon: 'image', label: 'Gallery', onPress: () => router.push('/gallery') },
    { icon: 'mail', label: 'Contact us', onPress: () => router.push('/contact') },
    ...(store ? [{ icon: 'phone' as const, label: `Call ${store.phone_display}`, onPress: () => Linking.openURL(`tel:${store.phone}`) }] : []),
    { icon: 'file-text', label: 'Privacy, terms & refunds', onPress: () => Linking.openURL('https://sweeteyecoffee.com/privacy-policy') },
  ];

  return (
    <View style={styles.screen}>
      <AmbientGlow intensity={0.7} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: TAB_BAR_SPACE + insets.bottom }}>
        <Contained style={{ paddingHorizontal: space.xl }}>
          {user ? (
            <Animated.View entering={FadeInDown} style={styles.profile}>
              <View style={styles.avatarRing}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</Text>
                </View>
              </View>
              <T variant="title" style={{ marginTop: space.md }}>{user.name}</T>
              <T variant="small">{user.email}</T>
              {user.is_admin && (
                <View style={styles.staffBadge}>
                  <Icon name="star" size={11} color={colors.espresso} />
                  <Text style={styles.staffText}>{user.role === 'super_admin' ? 'Owner' : 'Staff'}</Text>
                </View>
              )}
              <View style={styles.stats}>
                <Stat value={summary?.total_orders ?? 0} label="Orders" />
                <Stat value={summary?.total_spent ?? 0} label="Spent" prefix="$" decimals={2} />
                <Stat value={summary?.open_tickets ?? 0} label="Open tickets" />
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown} style={styles.guest}>
              <BrandMark size={96} />
              <T variant="display" style={{ textAlign: 'center', marginTop: space.md }}>Welcome to{'\n'}Sweet Eye</T>
              <T variant="body" style={{ textAlign: 'center', marginTop: 8 }}>
                Sign in to track every order, save your details for faster checkout and reach our team in one tap.
              </T>
              <View style={{ alignSelf: 'stretch', gap: 10, marginTop: space.xl }}>
                <Button title="Sign in" icon="log-in" onPress={() => router.push('/auth/sign-in')} />
                <Button title="Create an account" variant="outline" onPress={() => router.push('/auth/register')} />
              </View>
            </Animated.View>
          )}

          {user && (
            <Section
              title="Account"
              items={[
                ...(user.is_admin ? [{ icon: 'grid' as const, label: 'Staff dashboard', onPress: () => router.push('/admin'), tone: 'gold' as const }] : []),
                { icon: 'user', label: 'Profile & password', onPress: () => router.push('/profile') },
                { icon: 'clock', label: 'Order history', onPress: () => router.navigate('/orders') },
                { icon: 'life-buoy', label: 'Support tickets', onPress: () => router.push('/support') },
              ]}
            />
          )}
          <Section title="Sweet Eye" items={explore} />
          {user && (
            <Section
              title=""
              items={[
                {
                  icon: 'log-out',
                  label: 'Sign out',
                  tone: 'danger',
                  onPress: async () => {
                    await signOut();
                    setSummary(null);
                    toast.info('You’re signed out.');
                  },
                },
              ]}
            />
          )}
          <T variant="small" style={{ textAlign: 'center', marginTop: space.xl, color: colors.creamFaint }}>Sweet Eye Coffee Roasters · v1.0</T>
        </Contained>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, prefix = '', decimals = 0 }: { value: number; label: string; prefix?: string; decimals?: number }) {
  return (
    <View style={styles.stat}>
      <View style={{ flexDirection: 'row' }}>
        {!!prefix && <Text style={styles.statValue}>{prefix}</Text>}
        <CountUp to={value} decimals={decimals} style={styles.statValue} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <Animated.View entering={FadeInDown.delay(120)} style={{ marginTop: space.xxl }}>
      {!!title && <T variant="overline" style={{ marginBottom: space.md }}>{title}</T>}
      <View style={styles.list}>
        {items.map((it, i) => (
          <PressableScale key={it.label} onPress={it.onPress} scaleTo={0.98} style={[styles.row, i > 0 && styles.rowBorder]}>
            <View style={[styles.rowIcon, it.tone === 'gold' && { backgroundColor: 'rgba(212,163,115,0.2)' }]}>
              <Icon name={it.icon} size={17} color={it.tone === 'danger' ? colors.danger : colors.gold} />
            </View>
            <Text style={[styles.rowLabel, it.tone === 'danger' && { color: colors.danger }, it.tone === 'gold' && { color: colors.goldLight }]}>{it.label}</Text>
            <Icon name="chevron-right" size={17} color={colors.creamFaint} />
          </PressableScale>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  profile: { alignItems: 'center', paddingTop: space.lg },
  avatarRing: { padding: 4, borderRadius: 60, borderWidth: 2, borderColor: colors.gold },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display, fontSize: 32, color: colors.goldLight },
  staffBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  staffText: { fontFamily: fonts.bold, fontSize: 11, color: colors.espresso, letterSpacing: 0.6 },
  stats: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: space.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 16,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: colors.goldLight , fontVariant: ['lining-nums'] },
  statLabel: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.creamMuted, marginTop: 2 },
  guest: { alignItems: 'center', paddingTop: space.xxl },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderColor: colors.line },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(212,163,115,0.1)', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.cream },
});
