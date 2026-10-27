import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FormSection, SwitchRow, useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Card, Field, Notice, Skeleton, T } from '@/components/ui';
import type { ShopSettings } from '@/lib/admin';
import { errorMessage, get, put } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useCatalog } from '@/store';
import { space } from '@/theme';

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

  const apply = (s: ShopSettings) => {
    setSettings(s);
    setTax(String(s.tax_rate));
    setLocalFee(s.local_delivery_fee.toFixed(2));
    setStandard(s.standard_shipping_rate.toFixed(2));
    setZips(s.local_delivery_zips.join(', '));
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

  return (
    <PageScreen title="Shop settings" contentStyle={{ maxWidth: 680 }}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!settings ? (
        !error && <Skeleton style={{ height: 320 }} />
      ) : (
        <Animated.View entering={FadeInDown}>
          <T variant="body">These apply to the app and the website alike — they live in the shop’s database.</T>

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
