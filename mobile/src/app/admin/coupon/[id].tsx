import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { backTo, confirmAction, FormSection, SwitchRow, useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Field, Notice, Skeleton, T } from '@/components/ui';
import type { AdminCategory, AdminCoupon } from '@/lib/admin';
import { del, errorMessage, get, post, put } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { space } from '@/theme';

const text = (v: number | null) => (v === null || v === undefined ? '' : String(v));
type CouponForm = { coupon: AdminCoupon | null; categories: Pick<AdminCategory, 'id' | 'name' | 'slug'>[] };

export default function AdminCouponScreen() {
  const staff = useStaffOnly();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [form, setForm] = useState<CouponForm | null>(null);
  const [exclusions, setExclusions] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usedCount, setUsedCount] = useState(0);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    if (!staff) return;
    let current = true;
    get<CouponForm>(`/admin/coupons/${id}`)
      .then((data) => {
        if (!current) return;
        setForm(data);
        const c = data.coupon;
        setExclusions(c?.excluded_category_ids?.filter((id) => data.categories.some((category) => category.id === id)) ?? null);
        if (!c) return;
        setCode(c.code);
        setType(c.type);
        setValue(text(c.value));
        setMinOrder(text(c.min_order_amount));
        setMaxDiscount(text(c.max_discount));
        setMaxUses(text(c.max_uses));
        setStartsAt(c.starts_at?.replace('T', ' ') ?? '');
        setExpiresAt(c.expires_at?.replace('T', ' ') ?? '');
        setActive(c.is_active);
        setUsedCount(c.used_count);
      })
      .catch((e) => { if (current) setError(errorMessage(e)); });
    return () => { current = false; };
  }, [staff, id]);

  const selected = exclusions ?? form?.categories.filter((category) => category.slug === 'coffee-beans').map((category) => category.id) ?? [];

  const save = async () => {
    setBusy('save');
    try {
      const body = {
        code,
        type,
        value,
        min_order_amount: minOrder || null,
        max_discount: type === 'percentage' ? maxDiscount || null : null,
        max_uses: maxUses || null,
        starts_at: startsAt || null,
        expires_at: expiresAt || null,
        is_active: active,
        excluded_category_ids: exclusions ?? undefined,
      };
      const r = isNew ? await post<{ message: string }>('/admin/coupons', body) : await put<{ message: string }>(`/admin/coupons/${id}`, body);
      haptic.success();
      toast.success(r.message);
      backTo('/admin/coupons');
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    confirmAction('Delete this coupon?', 'Past orders keep the code they used.', 'Delete', async () => {
      setBusy('delete');
      try {
        const r = await del<{ message: string }>(`/admin/coupons/${id}`);
        toast.success(r.message);
        backTo('/admin/coupons');
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setBusy(null);
      }
    });

  return (
    <PageScreen
      title={isNew ? 'New coupon' : code || 'Coupon'}
      contentStyle={{ maxWidth: 680 }}
      footer={staff && form ? <Button title={isNew ? 'Create coupon' : 'Save changes'} icon="check" loading={busy === 'save'} disabled={busy === 'delete'} onPress={save} /> : undefined}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!staff || !form ? (
        !error && <Skeleton style={{ height: 300 }} />
      ) : (
        <Animated.View entering={FadeInDown}>
          <Field label="Code (e.g. WELCOME10)" icon="tag" value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" maxLength={50} />

          <FormSection title="Discount">
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <Chip label="Percentage" selected={type === 'percentage'} onPress={() => setType('percentage')} style={{ flex: 1 }} />
              <Chip label="Fixed amount" selected={type === 'fixed'} onPress={() => setType('fixed')} style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label={type === 'percentage' ? 'Percent off' : 'Dollars off'} icon={type === 'percentage' ? 'percent' : 'dollar-sign'} value={value} onChangeText={setValue} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
              {type === 'percentage' && <Field label="Max discount $ (optional)" value={maxDiscount} onChangeText={setMaxDiscount} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />}
            </View>
          </FormSection>

          <FormSection title="Excluded categories" hint="Selected categories stay at full price. Accessories includes merchandise. Coupon minimums count eligible items only.">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {form.categories.map((category) => (
                <Chip key={category.id} label={category.name} selected={selected.includes(category.id)} onPress={() => {
                  setExclusions((current) => {
                    const ids = current ?? selected;
                    return ids.includes(category.id) ? ids.filter((id) => id !== category.id) : [...ids, category.id];
                  });
                }} />
              ))}
            </View>
          </FormSection>

          <FormSection title="Limits" hint="All optional.">
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Minimum order $" value={minOrder} onChangeText={setMinOrder} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
                <Field label="Max uses" value={maxUses} onChangeText={(v) => setMaxUses(v.replace(/\D/g, ''))} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
              </View>
              <Field label="Starts (YYYY-MM-DD HH:MM)" icon="calendar" value={startsAt} onChangeText={setStartsAt} maxLength={16} />
              <Field label="Expires (YYYY-MM-DD HH:MM)" icon="calendar" value={expiresAt} onChangeText={setExpiresAt} maxLength={16} />
              <T variant="small">Times are UTC, the same as the website’s admin used.</T>
            </View>
          </FormSection>

          <FormSection title="Status">
            <Card style={{ paddingVertical: 4 }}>
              <SwitchRow label="Active" sub={isNew ? undefined : `Used ${usedCount} time${usedCount === 1 ? '' : 's'}`} value={active} onChange={setActive} />
            </Card>
          </FormSection>

          {!isNew && (
            <FormSection title="Danger zone">
              <Button title="Delete coupon" icon="trash-2" variant="dark" loading={busy === 'delete'} onPress={remove} style={{ marginTop: space.xs }} />
            </FormSection>
          )}
        </Animated.View>
      )}
    </PageScreen>
  );
}
