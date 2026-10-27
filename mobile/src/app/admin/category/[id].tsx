import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { backTo, confirmAction, FormSection, SwitchRow, useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Card, Field, Notice, Skeleton, T } from '@/components/ui';
import type { AdminCategory } from '@/lib/admin';
import { del, errorMessage, get, post, put } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useCatalog } from '@/store';
import { space } from '@/theme';

export default function AdminCategoryScreen() {
  const staff = useStaffOnly();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const reloadMenu = useCatalog((s) => s.load);

  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [active, setActive] = useState(true);
  const [seasonal, setSeasonal] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    if (!staff) return;
    get<{ categories: AdminCategory[] }>('/admin/categories')
      .then((r) => {
        if (isNew) {
          setSortOrder(String(Math.max(0, ...r.categories.map((c) => c.sort_order)) + 1));
          return;
        }
        const c = r.categories.find((x) => x.id === Number(id));
        if (!c) throw new Error('Category not found.');
        setName(c.name);
        setDescription(c.description ?? '');
        setSortOrder(String(c.sort_order));
        setActive(c.is_active);
        setSeasonal(!!(c.season_start && c.season_end));
        setStart(c.season_start ?? '');
        setEnd(c.season_end ?? '');
        setCount(c.product_count);
        setLoaded(true);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [staff, isNew, id]);

  const save = async () => {
    setBusy('save');
    try {
      const body = { name, description, sort_order: sortOrder || 0, is_active: active, season_start: seasonal ? start : null, season_end: seasonal ? end : null };
      const r = isNew ? await post<{ message: string }>('/admin/categories', body) : await put<{ message: string }>(`/admin/categories/${id}`, body);
      haptic.success();
      toast.success(r.message);
      reloadMenu(true);
      backTo('/admin/categories');
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    confirmAction('Delete this category?', 'This cannot be undone.', 'Delete', async () => {
      setBusy('delete');
      try {
        const r = await del<{ message: string }>(`/admin/categories/${id}`);
        toast.success(r.message);
        reloadMenu(true);
        backTo('/admin/categories');
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setBusy(null);
      }
    });

  return (
    <PageScreen
      title={isNew ? 'New category' : name || 'Category'}
      contentStyle={{ maxWidth: 680 }}
      footer={loaded ? <Button title={isNew ? 'Create category' : 'Save changes'} icon="check" loading={busy === 'save'} onPress={save} /> : undefined}>
      {error && <Notice tone="danger">{error}</Notice>}
      {!loaded ? (
        !error && <Skeleton style={{ height: 260 }} />
      ) : (
        <Animated.View entering={FadeInDown}>
          <View style={{ gap: 10 }}>
            <Field label="Name" icon="grid" value={name} onChangeText={setName} maxLength={255} />
            <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline />
            <Field label="Position on the menu (1 = first)" icon="hash" value={sortOrder} onChangeText={(v) => setSortOrder(v.replace(/[^\d-]/g, ''))} keyboardType="number-pad" />
          </View>

          <FormSection title="Visibility">
            <Card style={{ paddingVertical: 4 }}>
              <SwitchRow label="Show on the menu" value={active} onChange={setActive} />
              <SwitchRow label="Seasonal" sub="Only shown between two dates each year" value={seasonal} onChange={setSeasonal} border />
            </Card>
            {seasonal && (
              <Animated.View entering={FadeInDown} exiting={FadeOut} style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Field label="Starts (MM-DD)" value={start} onChangeText={(v) => setStart(v.slice(0, 5))} containerStyle={{ flex: 1 }} />
                <Field label="Ends (MM-DD)" value={end} onChangeText={(v) => setEnd(v.slice(0, 5))} containerStyle={{ flex: 1 }} />
              </Animated.View>
            )}
            {seasonal && <T variant="small" style={{ marginTop: 8 }}>A window like 11-23 → 01-31 runs over the new year.</T>}
          </FormSection>

          {!isNew && (
            <FormSection title="Danger zone" hint={count ? `It has ${count} item${count > 1 ? 's' : ''} — move or delete them first, or switch the category off.` : undefined}>
              <Button title="Delete category" icon="trash-2" variant="dark" disabled={count > 0} loading={busy === 'delete'} onPress={remove} style={{ marginTop: space.xs }} />
            </FormSection>
          )}
        </Animated.View>
      )}
    </PageScreen>
  );
}
