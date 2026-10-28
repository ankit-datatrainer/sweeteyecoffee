import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FormSection, SwitchRow, useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Card, Field, Notice, Skeleton, T } from '@/components/ui';
import type { ShopSettings } from '@/lib/admin';
import { errorMessage, get, put } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useCatalog } from '@/store';
import { colors, fonts, space } from '@/theme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "19:30" → "7:30 PM" */
const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "7:30 pm", "730pm", "7pm", "19:30" → "19:30"; null when it isn't a time. */
function to24h(text: string): string | null {
  const m = text.trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (min > 59 || h > 23 || (ap && (h < 1 || h > 12))) return null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

type HoursRow = { day: number; open: string; close: string; closed: boolean };

export default function AdminSettingsScreen() {
  const staff = useStaffOnly();
  const reloadShop = useCatalog((s) => s.load);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tax, setTax] = useState('');
  const [localFee, setLocalFee] = useState('');
  const [standard, setStandard] = useState('');
  const [zips, setZips] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [hours, setHours] = useState<HoursRow[]>([]);

  const apply = (s: ShopSettings) => {
    setSettings(s);
    setTax(String(s.tax_rate));
    setLocalFee(s.local_delivery_fee.toFixed(2));
    setStandard(s.standard_shipping_rate.toFixed(2));
    setZips(s.local_delivery_zips.join(', '));
    setHours(s.store_hours.map((h) => ({ ...h, open: to12h(h.open), close: to12h(h.close) })));
  };

  useEffect(() => {
    if (!staff) return;
    get<{ settings: ShopSettings }>('/admin/settings')
      .then((r) => apply(r.settings))
      .catch((e) => setError(errorMessage(e)));
  }, [staff]);

  const save = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      const r = await put<{ settings: ShopSettings }>('/admin/settings', body);
      apply(r.settings);
      reloadShop(true);
      haptic.success();
      toast.success(done);
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const setDay = (day: number, patch: Partial<HoursRow>) => setHours((rows) => rows.map((r) => (r.day === day ? { ...r, ...patch } : r)));

  const saveHours = () => {
    const rows = [];
    for (const r of hours) {
      if (r.closed) {
        rows.push({ day: r.day, closed: true, open: '09:00', close: '17:00' });
        continue;
      }
      const open = to24h(r.open);
      const close = to24h(r.close);
      if (!open || !close) return toast.error(`${DAYS[r.day]}: please enter times like 7:30 AM.`);
      rows.push({ day: r.day, closed: false, open, close });
    }
    save('hours', { store_hours: rows }, 'Opening hours saved.');
  };

  return (
    <PageScreen title="Shop settings" contentStyle={{ maxWidth: 680 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!settings ? (
        !error && <Skeleton style={{ height: 320 }} />
      ) : (
        <Animated.View entering={FadeInDown}>
          <T variant="body">These apply to the app and the website alike — they live in the shop’s database.</T>

          <FormSection title="Opening hours" hint="Shown on the home and contact pages, and used for the “Open now / Closed” badge. Type times like 7:30 AM or 10:30 PM.">
            <Card style={{ gap: 4 }}>
              {hours.map((h) => (
                <View key={h.day} style={{ gap: 8, paddingVertical: 8, borderBottomWidth: h.day === 6 ? 0 : 1, borderColor: colors.line }}>
                  <SwitchRow label={DAYS[h.day]} sub={h.closed ? 'Closed all day' : `${h.open} – ${h.close}`} value={!h.closed} onChange={(v) => setDay(h.day, { closed: !v })} />
                  {!h.closed && (
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <Field label="Opens" icon="sunrise" value={h.open} onChangeText={(v) => setDay(h.day, { open: v })} containerStyle={{ flex: 1 }} />
                      <Text style={{ fontFamily: fonts.medium, color: colors.creamMuted }}>to</Text>
                      <Field label="Closes" icon="sunset" value={h.close} onChangeText={(v) => setDay(h.day, { close: v })} containerStyle={{ flex: 1 }} />
                    </View>
                  )}
                </View>
              ))}
            </Card>
            <Button title="Save opening hours" icon="clock" loading={busy === 'hours'} onPress={saveHours} style={{ marginTop: space.md }} />
          </FormSection>

          <FormSection title="Sales tax" hint="Charged on items after any coupon. Delivery fees are not taxed.">
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Field label="Tax rate (%)" icon="percent" value={tax} onChangeText={setTax} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
              <Button title="Save" size="md" loading={busy === 'tax'} onPress={() => save('tax', { tax_rate: tax }, `Tax set to ${tax}%.`)} style={{ height: 58, paddingHorizontal: 22 }} />
            </View>
          </FormSection>

          <FormSection title="Curbside pickup" hint="Pause it when nobody can run orders out to cars.">
            <Card style={{ paddingVertical: 4 }}>
              <SwitchRow
                label={settings.curbside_enabled ? 'Curbside is on' : 'Curbside is paused'}
                sub={settings.curbside_enabled ? 'Customers can choose curbside at checkout' : 'Checkout offers in-store pickup only'}
                value={settings.curbside_enabled}
                onChange={(v) => save('curbside', { curbside_enabled: v }, v ? 'Curbside pickup is on.' : 'Curbside pickup is paused.')}
              />
            </Card>
          </FormSection>

          <FormSection title="Coffee-bean delivery" hint="Local ZIPs pay the local fee; everywhere else in the US pays standard shipping.">
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Local fee $" value={localFee} onChangeText={setLocalFee} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
                <Field label="US shipping $" value={standard} onChangeText={setStandard} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
              </View>
              <Field label="Local delivery ZIP codes" icon="map-pin" value={zips} onChangeText={setZips} multiline />
              <T variant="small">{zips.split(/[\s,;]+/).filter(Boolean).length} ZIP codes · separate with commas or spaces</T>
              <Button
                title="Save delivery settings"
                variant="outline"
                loading={busy === 'delivery'}
                onPress={() => save('delivery', { local_delivery_fee: localFee, standard_shipping_rate: standard, local_delivery_zips: zips }, 'Delivery settings saved.')}
                style={{ marginTop: space.xs }}
              />
            </View>
          </FormSection>
        </Animated.View>
      )}
    </PageScreen>
  );
}
