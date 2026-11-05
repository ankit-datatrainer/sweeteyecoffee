import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { confirmAction, pickPhoto, SwitchRow } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { Photo } from '@/components/photo';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Field, Notice, Skeleton, T } from '@/components/ui';
import { API_URL, del, errorMessage, get, post, put } from '@/lib/api';
import type { GalleryPhoto, PageContent, PageSection } from '@/lib/types';
import { useAuth, useCatalog } from '@/store';

const LABELS: Record<string, string> = {
  text: 'Text',
  text_image: 'Text and photo',
  image: 'Photo',
  gallery: 'Photo gallery',
  cta: 'Button banner',
  overline: 'Small heading',
  heading: 'Heading',
  body: 'Page text',
  align: 'Text alignment',
  background: 'Background',
  side: 'Photo side',
  caption: 'Caption',
  button_label: 'Button text',
  button_url: 'Button link',
  image_path: 'Photo path or URL',
};
const EXTRA_FIELDS: Record<PageSection['type'], string[]> = {
  text: ['overline', 'heading', 'body', 'align', 'background'],
  text_image: ['overline', 'heading', 'body', 'side', 'background', 'image'],
  image: ['caption', 'background', 'image'],
  gallery: ['overline', 'heading', 'background', 'images'],
  cta: ['overline', 'heading', 'text', 'button_label', 'button_url', 'background'],
};
const preview = (value: string) =>
  /^https?:\/\//.test(value) ? value : `${API_URL}/images/${value.replace(/^\/?images\//, '')}`;
export default function PagesEditor() {
  const user = useAuth((s) => s.user),
    ready = useAuth((s) => s.ready);
  const [pages, setPages] = useState<Record<string, PageContent>>({});
  const [selected, setSelected] = useState('home');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const page = pages[selected];
  const load = async () => {
    try {
      setPages((await get<{ pages: Record<string, PageContent> }>('/admin/pages')).pages);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    if (!ready) return;
    if (user?.role !== 'super_admin') {
      router.replace('/account');
      return;
    }
    get<{ pages: Record<string, PageContent> }>('/admin/pages')
      .then((r) => setPages(r.pages))
      .catch((e) => setError(errorMessage(e)));
  }, [ready, user]);
  const update = (p: PageContent) => setPages((all) => ({ ...all, [selected]: p }));
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await useCatalog.getState().load(true);
      toast.success('Changes saved.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async () => {
    const photo = await pickPhoto(false);
    if (!photo) return null;
    return (await post<{ path: string }>(`/admin/pages/${selected}/photo`, { data: photo.data })).path;
  };
  if (user?.role !== 'super_admin') return null;
  return (
    <PageScreen title="Edit website & app pages" contentStyle={{ maxWidth: 820 }}>
      <T variant="body">
        Edit shared text, photos and galleries, hide sections, or add new content. Save changes to update the website
        and app.
      </T>
      <ScrollView horizontal contentContainerStyle={{ gap: 8, paddingVertical: 16 }}>
        {Object.entries(pages).map(([id, p]) => (
          <Chip key={id} label={p.title} selected={id === selected} onPress={() => setSelected(id)} />
        ))}
      </ScrollView>
      {error && <Notice tone="danger">{error}</Notice>}
      {!page ? (
        <Skeleton style={{ height: 300 }} />
      ) : (
        <View style={{ gap: 20 }}>
          {Object.entries(page.schema ?? {}).map(([section, def]) => (
            <Card key={section} style={{ gap: 12 }}>
              <T variant="heading">{def.label}</T>
              {def.hideable && (
                <SwitchRow
                  label="Show section"
                  value={!page.hidden.includes(section)}
                  onChange={(on) =>
                    update({
                      ...page,
                      hidden: on ? page.hidden.filter((x) => x !== section) : [...page.hidden, section],
                    })
                  }
                />
              )}
              {Object.entries(def.fields).map(([field, [type, label]]) => {
                const key = `${section}.${field}`;
                const value = page.fields[key];
                const change = (v: string | GalleryPhoto[]) =>
                  update({ ...page, fields: { ...page.fields, [key]: v } });
                return (
                  <ContentField
                    key={key}
                    type={type}
                    label={label}
                    value={value ?? ''}
                    onChange={change}
                    upload={upload}
                  />
                );
              })}
              <Button
                title="Restore this section"
                variant="outline"
                size="md"
                disabled={busy}
                onPress={() =>
                  confirmAction(
                    'Restore original content?',
                    'The saved text and photos for this section will be reset.',
                    'Restore',
                    () =>
                      run(async () => {
                        const r = await put<{ page: PageContent }>(`/admin/pages/${selected}`, { reset: [section] });
                        update(r.page);
                      }),
                  )
                }
              />
            </Card>
          ))}
          <Button
            title="Save page"
            loading={busy}
            onPress={() =>
              run(async () => {
                const r = await put<{ page: PageContent }>(`/admin/pages/${selected}`, {
                  fields: page.fields,
                  hidden: page.hidden,
                });
                update(r.page);
              })
            }
          />
          <T variant="title">Extra sections</T>
          {page.sections.map((section) => (
            <ExtraEditor key={section.id} section={section} page={selected} upload={upload} refresh={load} />
          ))}
          <T variant="heading">Add a section</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(EXTRA_FIELDS).map(([type, keys]) => (
              <Button
                key={type}
                title={LABELS[type]}
                variant="outline"
                size="md"
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    await post(`/admin/pages/${selected}/sections`, {
                      type,
                      data: Object.fromEntries(
                        keys.map((key) => [
                          key,
                          key === 'images'
                            ? []
                            : key === 'heading'
                              ? 'New heading'
                              : key === 'background'
                                ? 'white'
                                : '',
                        ]),
                      ),
                    });
                    await load();
                  })
                }
              />
            ))}
          </View>
        </View>
      )}
    </PageScreen>
  );
}
function ContentField({
  type,
  label,
  value,
  onChange,
  upload,
}: {
  type: string;
  label: string;
  value: string | GalleryPhoto[];
  onChange: (v: string | GalleryPhoto[]) => void;
  upload: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const addPhoto = async (done: (path: string) => void) => {
    setBusy(true);
    try {
      const path = await upload();
      if (path) done(path);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (type === 'gallery') {
    const photos = Array.isArray(value) ? value : [];
    const edit = (index: number, patch: Partial<GalleryPhoto>) =>
      onChange(photos.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    const move = (i: number, by: number) => {
      const copy = [...photos];
      if (!copy[i + by]) return;
      [copy[i], copy[i + by]] = [copy[i + by], copy[i]];
      onChange(copy);
    };
    return (
      <View style={{ gap: 12 }}>
        <T variant="subheading">{label}</T>
        {photos.map((p, i) => (
          <Card key={i} style={{ gap: 8 }}>
            {!!p.src && <Photo uri={preview(p.src)} width={800} style={{ height: 160 }} contentFit="contain" />}
            <Field label="Photo path or URL" value={p.src} onChangeText={(src) => edit(i, { src })} />
            <Field label="Caption" value={p.caption} onChangeText={(caption) => edit(i, { caption })} />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button title="Move up" variant="outline" size="md" onPress={() => move(i, -1)} />
              <Button title="Move down" variant="outline" size="md" onPress={() => move(i, 1)} />
              <Button
                title="Remove"
                variant="outline"
                size="md"
                onPress={() => onChange(photos.filter((_, index) => index !== i))}
              />
            </View>
          </Card>
        ))}
        <Button
          title="Upload gallery photo"
          loading={busy}
          variant="outline"
          onPress={() => addPhoto((src) => onChange([...photos, { src, caption: '' }]))}
        />
        <Button
          title="Add photo by URL"
          variant="outline"
          size="md"
          onPress={() => onChange([...photos, { src: '', caption: '' }])}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {type === 'image' && typeof value === 'string' && !!value && (
        <Photo uri={preview(value)} width={1080} style={{ height: 180 }} contentFit="contain" />
      )}
      <Field
        label={label}
        value={typeof value === 'string' ? value : ''}
        onChangeText={onChange}
        multiline={type === 'markdown' || type === 'textarea'}
        maxLength={30000}
      />
      {type === 'image' && (
        <Button title="Upload photo" variant="outline" size="md" loading={busy} onPress={() => addPhoto(onChange)} />
      )}
    </View>
  );
}
function ExtraEditor({
  section,
  page,
  upload,
  refresh,
}: {
  section: PageSection;
  page: string;
  upload: () => Promise<string | null>;
  refresh: () => Promise<void>;
}) {
  const [data, setData] = useState(section.data),
    [visible, setVisible] = useState(section.is_visible),
    [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      await useCatalog.getState().load(true);
      toast.success('Section updated.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 12 }}>
      <T variant="heading">{LABELS[section.type]}</T>
      <SwitchRow label="Show section" value={visible} onChange={setVisible} />
      {EXTRA_FIELDS[section.type].map((key) => (
        <ContentField
          key={key}
          type={key === 'images' ? 'gallery' : key === 'image' ? 'image' : key === 'body' ? 'markdown' : 'text'}
          label={LABELS[key] ?? 'Text'}
          value={data[key] ?? ''}
          onChange={(value) => setData({ ...data, [key]: value })}
          upload={upload}
        />
      ))}
      <Button
        title="Save section"
        loading={busy}
        onPress={() => run(() => put(`/admin/pages/${page}/sections/${section.id}`, { data, is_visible: visible }))}
      />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {['up', 'down'].map((direction) => (
          <Button
            key={direction}
            title={`Move ${direction}`}
            variant="outline"
            size="md"
            disabled={busy}
            onPress={() => run(() => post(`/admin/pages/${page}/sections/${section.id}/move`, { direction }))}
          />
        ))}
        <Button
          title="Delete section"
          variant="outline"
          size="md"
          disabled={busy}
          onPress={() =>
            confirmAction('Delete section?', 'This removes the extra section from the website and app.', 'Delete', () =>
              run(() => del(`/admin/pages/${page}/sections/${section.id}`)),
            )
          }
        />
      </View>
    </Card>
  );
}
