import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { GoldSwitch, useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Card, Field, Notice, Skeleton, T } from '@/components/ui';
import type { AdminOptionGroup } from '@/lib/admin';
import { errorMessage, get, post, put } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useCatalog } from '@/store';
import { colors, fonts, space } from '@/theme';

type Row = { id: number; name: string; price: string; large_price: string; is_active: boolean };
type Group = Omit<AdminOptionGroup, 'options'> & { options: Row[] };

const toRows = (groups: AdminOptionGroup[]): Group[] =>
  groups.map((g) => ({
    ...g,
    options: g.options.map((o) => ({ id: o.id, name: o.name, price: o.price.toFixed(2), large_price: o.large_price === null ? '' : o.large_price.toFixed(2), is_active: o.is_active })),
  }));

export default function AdminOptionsScreen() {
  const staff = useStaffOnly();
  const reloadMenu = useCatalog((s) => s.load);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      get<{ groups: AdminOptionGroup[] }>('/admin/modifier-groups')
        .then((r) => setGroups(toRows(r.groups)))
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    if (staff) load();
  }, [staff, load]);

  const update = (groupId: number, optionId: number, patch: Partial<Row>) =>
    setGroups((all) => all?.map((g) => (g.id === groupId ? { ...g, options: g.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) } : g)) ?? null);

  return (
    <PageScreen title="Drink options">
      <T variant="body" style={{ marginBottom: space.lg }}>
        Prices are added to the drink. “Large price” replaces the price on a Large (e.g. Iced is free on a Medium but +$0.50 on a Large).
      </T>
      {error && <Notice tone="danger">{error}</Notice>}
      {!groups ? (
        <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 160 }} />)}</View>
      ) : (
        <View style={{ gap: space.xl }}>
          {groups.map((g, i) => (
            <Animated.View key={g.id} entering={FadeInDown.delay(Math.min(i, 6) * 60)}>
              <GroupCard
                group={g}
                onChange={(optionId, patch) => update(g.id, optionId, patch)}
                onSaved={() => {
                  reloadMenu(true);
                  load();
                }}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </PageScreen>
  );
}

function GroupCard({ group, onChange, onSaved }: { group: Group; onChange: (optionId: number, patch: Partial<Row>) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [adding, setAdding] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await put<{ message: string }>('/admin/modifiers', { options: group.options.map((o) => ({ ...o, large_price: o.large_price || null })) });
      haptic.success();
      toast.success(`${group.name}: ${r.message.toLowerCase()}`);
      onSaved();
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    setAdding(true);
    try {
      const r = await post<{ message: string }>(`/admin/modifier-groups/${group.id}/options`, { name: newName, price: newPrice || 0 });
      haptic.success();
      toast.success(r.message);
      setNewName('');
      setNewPrice('');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <T variant="heading">{group.name}</T>
          <T variant="small">
            {group.is_required ? 'Required · ' : ''}
            {group.selection === 'single' ? 'Pick one' : 'Pick any'} · on {group.product_count} item{group.product_count === 1 ? '' : 's'}
          </T>
        </View>
        <Button title="Save" icon="check" size="md" variant="dark" loading={saving} onPress={save} style={{ paddingHorizontal: 14, height: 38 }} />
      </View>
      {group.options.map((o) => (
        <Animated.View key={o.id} layout={LinearTransition} style={[styles.option, !o.is_active && { opacity: 0.55 }]}>
          <View style={styles.row}>
            <Field label="Option" value={o.name} onChangeText={(v) => onChange(o.id, { name: v })} containerStyle={{ flex: 1 }} maxLength={60} />
            <View style={{ alignItems: 'center', width: 52 }}>
              <GoldSwitch value={o.is_active} onValueChange={(v) => onChange(o.id, { is_active: v })} />
              <Text style={styles.tiny}>{o.is_active ? 'On' : 'Off'}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Field label="Price $" value={o.price} onChangeText={(v) => onChange(o.id, { price: v })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
            <Field label="On a Large $" value={o.large_price} onChangeText={(v) => onChange(o.id, { large_price: v })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
          </View>
        </Animated.View>
      ))}
      <View style={[styles.option, styles.addRow]}>
        <Field label="New option name" value={newName} onChangeText={setNewName} maxLength={60} />
        <View style={styles.row}>
          <Field label="Price $" value={newPrice} onChangeText={setNewPrice} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
          <Button title="Add option" icon="plus" size="md" loading={adding} disabled={!newName.trim()} onPress={add} style={{ flex: 1, height: 58 }} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  option: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderColor: colors.line },
  addRow: { borderColor: colors.lineStrong },
  tiny: { fontFamily: fonts.medium, fontSize: 10, color: colors.creamMuted },
});
