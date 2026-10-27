import { router, useLocalSearchParams } from 'expo-router';
import { Photo } from '@/components/photo';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { backTo, confirmAction, FormSection, GoldSwitch, pickPhoto, SwitchRow, useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Field, Icon, Notice, PressableScale, Skeleton, T } from '@/components/ui';
import { del, errorMessage, get, post, put } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useCatalog } from '@/store';
import { colors, fonts, radius } from '@/theme';

type Form = {
  product: null | {
    id: number;
    category_id: number;
    name: string;
    description: string | null;
    price: number;
    image: string | null;
    iced_image: string | null;
    is_available: boolean;
    is_sold_out: boolean;
    is_featured: boolean;
    sizes: { name: string; price: number; is_available: boolean; image: string | null }[];
    group_ids: number[];
  };
  categories: { id: number; name: string; is_active: boolean }[];
  groups: { id: number; name: string; selection: 'single' | 'multiple'; is_required: boolean; options: string | null }[];
};

type SizeRow = { key: string; name: string; price: string; is_available: boolean; image: string | null };
type PhotoState = { preview: string | null; upload: string | null; remove?: boolean };

let rowKey = 0;
const sizeRow = (s?: Partial<SizeRow>): SizeRow => ({ key: `s${rowKey++}`, name: '', price: '', is_available: true, image: null, ...s });

export default function AdminProductScreen() {
  const staff = useStaffOnly();
  const params = useLocalSearchParams<{ id: string; category?: string }>();
  const isNew = params.id === 'new';
  const reloadMenu = useCatalog((s) => s.load);

  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(params.category ? Number(params.category) : null);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState(true);
  const [soldOut, setSoldOut] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [photo, setPhoto] = useState<PhotoState>({ preview: null, upload: null });
  const [iced, setIced] = useState<PhotoState>({ preview: null, upload: null });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!staff) return;
    get<Form>(`/admin/products/form${isNew ? '' : `?id=${params.id}`}`)
      .then((f) => {
        setForm(f);
        const p = f.product;
        if (!p) return;
        setName(p.name);
        setCategoryId(p.category_id);
        setPrice(p.price.toFixed(2));
        setDescription(p.description ?? '');
        setAvailable(p.is_available);
        setSoldOut(p.is_sold_out);
        setFeatured(p.is_featured);
        setSizes(p.sizes.map((s) => sizeRow({ name: s.name, price: s.price.toFixed(2), is_available: s.is_available, image: s.image })));
        setGroupIds(p.group_ids);
        setPhoto({ preview: p.image, upload: null });
        setIced({ preview: p.iced_image, upload: null });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [staff, isNew, params.id]);

  const choose = async (slot: 'image' | 'iced') => {
    try {
      const picked = await pickPhoto();
      if (!picked) return;
      (slot === 'image' ? setPhoto : setIced)({ preview: picked.uri, upload: picked.data });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name,
        category_id: categoryId,
        price,
        description,
        is_available: available,
        is_sold_out: soldOut,
        is_featured: featured,
        sizes: sizes.filter((s) => s.name.trim()).map((s) => ({ name: s.name, price: s.price, is_available: s.is_available })),
        group_ids: groupIds,
      };
      const r = isNew ? await post<{ id: number; message: string }>('/admin/products', body) : await put<{ id: number; message: string }>(`/admin/products/${params.id}`, body);

      // Photos need the product to exist first, so they go up after the save.
      if (photo.upload) await post(`/admin/products/${r.id}/photo`, { slot: 'image', data: photo.upload });
      if (iced.upload) await post(`/admin/products/${r.id}/photo`, { slot: 'iced_image', data: iced.upload });
      else if (iced.remove) await post(`/admin/products/${r.id}/photo`, { slot: 'iced_image', remove: true });

      haptic.success();
      toast.success(r.message);
      reloadMenu(true);
      if (isNew) router.replace({ pathname: '/admin/product/[id]', params: { id: String(r.id) } });
      else {
        setPhoto((p) => ({ ...p, upload: null }));
        setIced((p) => ({ ...p, upload: null, remove: false }));
      }
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    confirmAction('Delete this product?', 'Items that customers have ordered are hidden from the menu instead, so past orders stay intact.', 'Delete', async () => {
      setDeleting(true);
      try {
        const r = await del<{ message: string }>(`/admin/products/${params.id}`);
        toast.success(r.message);
        reloadMenu(true);
        backTo('/admin/products');
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setDeleting(false);
      }
    });

  if (!form) {
    return (
      <PageScreen title={isNew ? 'New product' : 'Edit product'}>
        {error ? <Notice tone="danger">{error}</Notice> : <Skeleton style={{ height: 320 }} />}
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title={isNew ? 'New product' : name || 'Edit product'}
      contentStyle={{ maxWidth: 760 }}
      footer={<Button title={isNew ? 'Create product' : 'Save changes'} icon="check" loading={saving} onPress={save} />}>
      <Animated.View entering={FadeInDown} style={styles.photos}>
        <PhotoCard label="Photo" uri={photo.preview} onPick={() => choose('image')} />
        <PhotoCard
          label="Iced photo"
          hint="Shown when a customer picks Iced"
          uri={iced.remove ? null : iced.preview}
          onPick={() => choose('iced')}
          onRemove={iced.preview && !iced.remove ? () => setIced({ preview: iced.preview, upload: null, remove: true }) : undefined}
        />
      </Animated.View>

      <FormSection title="Details">
        <View style={{ gap: 10 }}>
          <Field label="Name" icon="coffee" value={name} onChangeText={setName} maxLength={255} />
          <Field label="Price ($)" icon="dollar-sign" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          <Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={5000} />
        </View>
      </FormSection>

      <FormSection title="Category">
        <View style={styles.chips}>
          {form.categories.map((c) => (
            <Chip key={c.id} label={c.name} sub={c.is_active ? null : 'off'} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </View>
      </FormSection>

      <FormSection title="On the menu">
        <Card style={{ paddingVertical: 4 }}>
          <SwitchRow label="Show on the menu" sub="Off hides it everywhere" value={available} onChange={setAvailable} />
          <SwitchRow label="Sold out" sub="Listed, but can’t be ordered" value={soldOut} onChange={setSoldOut} tone="danger" border />
          <SwitchRow label="Featured" sub="Appears in Featured Favorites" value={featured} onChange={setFeatured} border />
        </Card>
      </FormSection>

      <FormSection
        title="Sizes & styles"
        hint="Leave empty if it has a single price. Each size or colour replaces the base price."
        right={<Button title="Add" icon="plus" size="md" variant="dark" onPress={() => setSizes((s) => [...s, sizeRow()])} style={{ paddingHorizontal: 14, height: 38 }} />}>
        <View style={{ gap: 10 }}>
          {sizes.map((s, i) => (
            <Animated.View key={s.key} layout={LinearTransition} entering={FadeInDown} exiting={FadeOut} style={styles.sizeRow}>
              {s.image ? <Photo eager uri={s.image} width={160} style={styles.sizeImage} /> : null}
              <Field label="Size / style" value={s.name} onChangeText={(v) => setSizes((all) => all.map((x, j) => (j === i ? { ...x, name: v } : x)))} containerStyle={{ flex: 1.4 }} />
              <Field label="Price" value={s.price} onChangeText={(v) => setSizes((all) => all.map((x, j) => (j === i ? { ...x, price: v } : x)))} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
              <View style={{ alignItems: 'center' }}>
                <GoldSwitch value={s.is_available} onValueChange={(v) => setSizes((all) => all.map((x, j) => (j === i ? { ...x, is_available: v } : x)))} />
                <Text style={styles.tiny}>{s.is_available ? 'On' : 'Off'}</Text>
              </View>
              <PressableScale onPress={() => setSizes((all) => all.filter((_, j) => j !== i))} scaleTo={0.85} style={styles.removeSize}>
                <Icon name="x" size={16} color={colors.creamMuted} />
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      </FormSection>

      <FormSection title="Drink options" hint="Choices customers see on this item.">
        <View style={{ gap: 8 }}>
          {form.groups.map((g) => {
            const on = groupIds.includes(g.id);
            return (
              <PressableScale
                key={g.id}
                onPress={() => setGroupIds((ids) => (on ? ids.filter((x) => x !== g.id) : [...ids, g.id]))}
                scaleTo={0.98}
                style={[styles.group, on && styles.groupOn]}>
                <Icon name={on ? 'check-square' : 'square'} size={18} color={on ? colors.gold : colors.creamMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.groupName, on && { color: colors.cream }]}>
                    {g.name}
                    <Text style={styles.groupMeta}>  {g.is_required ? 'required · ' : ''}{g.selection === 'single' ? 'pick one' : 'pick any'}</Text>
                  </Text>
                  {!!g.options && <T variant="small" numberOfLines={1}>{g.options}</T>}
                </View>
              </PressableScale>
            );
          })}
        </View>
      </FormSection>

      {!isNew && (
        <FormSection title="Danger zone">
          <Button title="Delete product" icon="trash-2" variant="dark" loading={deleting} onPress={remove} />
        </FormSection>
      )}
    </PageScreen>
  );
}

function PhotoCard({ label, hint, uri, onPick, onRemove }: { label: string; hint?: string; uri: string | null; onPick: () => void; onRemove?: () => void }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <PressableScale onPress={onPick} scaleTo={0.97} style={styles.photo}>
        {uri ? (
          <Photo eager uri={uri} width={540} style={StyleSheet.absoluteFill} transition={250} />
        ) : (
          <View style={styles.photoEmpty}>
            <Icon name="image" size={26} color={colors.creamMuted} />
            <T variant="small">Add photo</T>
          </View>
        )}
        <View style={styles.photoBadge}>
          <Icon name="camera" size={13} color={colors.espresso} />
          <Text style={styles.photoBadgeText}>{uri ? 'Change' : 'Upload'}</Text>
        </View>
      </PressableScale>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <T variant="smallStrong">{label}</T>
          {!!hint && <T variant="small" style={{ fontSize: 11.5 }}>{hint}</T>}
        </View>
        {onRemove && (
          <Text onPress={onRemove} style={styles.removeText}>
            Remove
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photos: { flexDirection: 'row', gap: 14 },
  photo: { aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.line },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  photoBadgeText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.espresso },
  removeText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sizeImage: { width: 40, height: 40, borderRadius: 10 },
  tiny: { fontFamily: fonts.medium, fontSize: 10, color: colors.creamMuted },
  removeSize: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,237,227,0.05)' },
  group: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  groupOn: { borderColor: 'rgba(212,163,115,0.5)', backgroundColor: 'rgba(212,163,115,0.08)' },
  groupName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.creamSoft },
  groupMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.creamMuted },
});
