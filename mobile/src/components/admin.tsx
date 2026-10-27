import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Alert, Platform, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@/store';
import { colors, fonts, radius } from '@/theme';
import { Icon, PressableScale, T } from './ui';

/** Send anyone who isn't staff back to their account page. */
export function useStaffOnly() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  useEffect(() => {
    if (ready && !user?.is_admin) router.replace('/account');
  }, [ready, user]);
  return !!user?.is_admin;
}

/** Go back, or to `fallback` when the screen was opened directly (e.g. a web link). */
export const backTo = (fallback: '/admin/products' | '/admin/categories' | '/admin/coupons') =>
  router.canGoBack() ? router.back() : router.replace(fallback);

/** Native confirm dialog, or the browser's on web. */
export function confirmAction(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Pick a photo from the library as a data URI ready for upload, or null if cancelled. */
export async function pickPhoto(): Promise<{ uri: string; data: string } | null> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Allow photo access in Settings to change product photos.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.82, base64: true });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.base64 && !asset?.uri.startsWith('data:')) return null;
  const data = asset.uri.startsWith('data:') ? asset.uri : `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
  return { uri: asset.uri, data };
}

// react-native-web colours the "on" thumb with its own prop.
const webThumb = { activeThumbColor: colors.cream } as object;

export function GoldSwitch({ value, onValueChange, tone = 'gold' }: { value: boolean; onValueChange: (v: boolean) => void; tone?: 'gold' | 'danger' }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: tone === 'danger' ? colors.danger : colors.gold, false: colors.surfaceHigh }}
      thumbColor={colors.cream}
      {...webThumb}
    />
  );
}

/** A labelled on/off row inside a card. */
export function SwitchRow({ label, sub, value, onChange, tone, border }: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  tone?: 'gold' | 'danger';
  border?: boolean;
}) {
  return (
    <View style={[styles.switchRow, border && styles.border]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        {!!sub && <T variant="small">{sub}</T>}
      </View>
      <GoldSwitch value={value} onValueChange={onChange} tone={tone} />
    </View>
  );
}

/** Square-ish tile used on the staff dashboard's "Manage" grid. */
export function ManageTile({ icon, label, sub, onPress, style }: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  sub: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.95} style={[styles.tile, style]}>
      <View style={styles.tileIcon}>
        <Icon name={icon} size={18} color={colors.gold} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.tileSub} numberOfLines={2}>{sub}</Text>
    </PressableScale>
  );
}

/** Small status badge (Off, Sold out, Seasonal…). */
export function Badge({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'gold' | 'danger' | 'success' | 'info' }) {
  const color = { muted: colors.creamMuted, gold: colors.gold, danger: colors.danger, success: colors.success, info: colors.info }[tone];
  return <Text style={[styles.badge, { color, borderColor: `${color}66` }]}>{text}</Text>;
}

export function FormSection({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <T variant="overline">{title}</T>
          {!!hint && <T variant="small" style={{ marginTop: 4 }}>{hint}</T>}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  border: { borderTopWidth: 1, borderColor: colors.line },
  switchLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 150,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  tileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(212,163,115,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tileLabel: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.cream },
  tileSub: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 15, color: colors.creamMuted },
  badge: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    letterSpacing: 0.4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  section: { marginTop: 28 },
});
