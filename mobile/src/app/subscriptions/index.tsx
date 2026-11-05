import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { OptionsForm, useCustomizer } from '@/components/customize';
import { PageScreen } from '@/components/layout';
import { Photo } from '@/components/photo';
import { Stepper } from '@/components/product';
import { SwitchRow } from '@/components/admin';
import { Button, Card, Chip, Field, Notice, Skeleton, T } from '@/components/ui';
import { errorMessage, get, post } from '@/lib/api';
import { money } from '@/lib/format';
import { billingReturnUrl, openBilling, useSubscriptionDraft } from '@/lib/subscriptions';
import type { CoffeeSubscription, Product, SubscriptionQuote } from '@/lib/types';
import { useAuth } from '@/store';
import { colors, radius, space } from '@/theme';

type Catalog = {
  enabled: boolean;
  billing_ready: boolean;
  test_mode: boolean;
  products: Product[];
  plans: { id: string; label: string; discount: number; pitch: string }[];
};
export default function SubscriptionsScreen() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [subscriptions, setSubscriptions] = useState<CoffeeSubscription[]>([]);
  const [error, setError] = useState<string | null>(null);
  const user = useAuth((s) => s.user);
  const draft = useSubscriptionDraft((s) => s.draft);
  const setDraft = useSubscriptionDraft((s) => s.set);
  const load = useCallback(async () => {
    try {
      const c = await get<Catalog>('/subscriptions/catalog');
      setCatalog(c);
      if (user) setSubscriptions((await get<{ subscriptions: CoffeeSubscription[] }>('/subscriptions')).subscriptions);
      else setSubscriptions([]);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [user]);
  useFocusEffect(
    useCallback(() => {
      load();
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') load();
      });
      return () => listener.remove();
    }, [load]),
  );
  const selected = catalog?.products.find((p) => p.id === draft.product_id) ?? catalog?.products[0];
  return (
    <PageScreen title="Coffee subscriptions" contentStyle={{ maxWidth: 760 }}>
      <T variant="overline">Fresh coffee, on your schedule</T>
      <T variant="title" style={{ marginVertical: 12 }}>
        Your favorite beans. Delivered regularly.
      </T>
      <T variant="body">
        One payment and one delivery per cycle. Every plan renews automatically until canceled. Discounts apply to
        beans; tax and delivery are added.
      </T>
      {error && <Notice tone="danger">{error}</Notice>}
      {!catalog ? (
        <Skeleton style={{ height: 260, marginTop: 20 }} />
      ) : !catalog.enabled ? (
        <Notice>Subscriptions are currently unavailable.</Notice>
      ) : (
        <>
          {!catalog.billing_ready && (
            <Notice>
              Explore plans and preview your price. Subscription payments will open once the shop finishes billing
              setup.
            </Notice>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: space.xl }}>
            {catalog.products.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                selected={p.id === selected?.id}
                onPress={() => setDraft({ ...draft, product_id: p.id, size: p.sizes[0]?.name, modifiers: [] })}
              />
            ))}
          </View>
          {selected ? (
            <Builder key={selected.id} product={selected} catalog={catalog} />
          ) : (
            <Notice>No coffee beans are available for subscription right now.</Notice>
          )}
        </>
      )}
      {!!subscriptions.length && (
        <View style={{ gap: 12, marginTop: space.xxl }}>
          <T variant="title">Your subscriptions</T>
          {subscriptions.map((s) => (
            <Card key={s.id} style={{ gap: 8 }}>
              <T variant="heading">
                {s.selection.quantity} × {s.selection.name} · {s.selection.size}
              </T>
              <T variant="body">
                {s.selection.interval} · {money(s.total_cents / 100)} per cycle
              </T>
              <T variant="small">
                {s.cancel_at_period_end ? 'Future renewals canceled' : s.status.replace(/_/g, ' ')}
                {s.selection.test_mode ? ' · TEST' : ''}
              </T>
              <Button
                title="Manage subscription"
                variant="outline"
                size="md"
                onPress={() => router.push(`/subscriptions/${s.id}`)}
              />
            </Card>
          ))}
        </View>
      )}
    </PageScreen>
  );
}
function Builder({ product, catalog }: { product: Product; catalog: Catalog }) {
  const draft = useSubscriptionDraft((s) => s.draft);
  const setDraft = useSubscriptionDraft((s) => s.set);
  const user = useAuth((s) => s.user);
  const c = useCustomizer(product, { size: draft.size, quantity: draft.quantity, modifiers: draft.modifiers });
  const [plan, setPlan] = useState(draft.plan ?? 'two_months');
  const [address, setAddress] = useState({
    line1: draft.line1 ?? '',
    line2: draft.line2 ?? '',
    city: draft.city ?? '',
    state: draft.state ?? '',
    zip: draft.zip ?? '',
    phone: draft.phone ?? user?.phone ?? '',
  });
  const [accepted, setAccepted] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<{ key: string; value: SubscriptionQuote } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const modifiers = Object.values(c.selected)
    .flat()
    .sort((a, b) => a - b);
  const body = { product_id: product.id, size: c.size, quantity: c.quantity, modifiers, plan, ...address };
  const serialized = JSON.stringify(body);
  const quote = quoted?.key === serialized ? quoted.value : null;
  const error = failure?.key === serialized ? failure.message : null;
  const consentKey = `${user?.id ?? 'guest'}|${serialized}|${quote?.total_cents ?? ''}`;
  const consent = accepted === consentKey;
  useEffect(() => {
    setDraft(JSON.parse(serialized));
  }, [serialized, setDraft]);
  useEffect(() => {
    const data = JSON.parse(serialized);
    if (!data.line1 || !data.city || !/^[A-Z]{2}$/.test(data.state) || !/^\d{5}$/.test(data.zip) || !data.phone) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      post<SubscriptionQuote>('/subscriptions/quote', data, { signal: controller.signal })
        .then((q) => {
          if (active) {
            setQuoted({ key: serialized, value: q });
            setFailure(null);
          }
        })
        .catch((e) => {
          if (active) setFailure({ key: serialized, message: errorMessage(e) });
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [serialized]);
  const start = async () => {
    if (!user) {
      setAccepted(null);
      router.push('/auth/sign-in');
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const result = await post<{ subscription: CoffeeSubscription; url: string | null }>('/subscriptions', {
        ...body,
        renewal_consent: consent,
        expected_total_cents: quote?.total_cents,
        return_url: billingReturnUrl(),
      });
      if (result.url) await openBilling(result.url);
      router.push(`/subscriptions/${result.subscription.id}`);
    } catch (e) {
      setFailure({ key: serialized, message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <Photo
        uri={c.image}
        width={1440}
        contentFit="contain"
        style={{ height: 260, borderRadius: radius.lg, backgroundColor: colors.surface }}
      />
      <T variant="title">{product.name}</T>
      <OptionsForm product={product} c={c} showSubscription={false} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T variant="heading">Bags per delivery</T>
        <Stepper value={c.quantity} onChange={c.setQuantity} min={1} max={20} compact />
      </View>
      <T variant="heading">Choose your schedule</T>
      {catalog.plans.map((p) => (
        <Card key={p.id} style={{ gap: 6, borderColor: plan === p.id ? colors.gold : colors.line }}>
          <Button
            title={`${p.label} · ${p.discount}% off beans`}
            variant={plan === p.id ? 'gold' : 'outline'}
            onPress={() => setPlan(p.id)}
          />
          <T variant="small">{p.pitch}</T>
          <T variant="small">One charge and one delivery {p.label.toLowerCase()}. Renews until canceled.</T>
        </Card>
      ))}
      <T variant="heading">US delivery address</T>
      {(['line1', 'line2', 'city', 'state', 'zip', 'phone'] as const).map((key) => (
        <Field
          key={key}
          label={
            {
              line1: 'Street address',
              line2: 'Apartment / suite (optional)',
              city: 'City',
              state: 'State (2 letters)',
              zip: 'ZIP code',
              phone: 'Delivery phone',
            }[key]
          }
          value={address[key]}
          onChangeText={(v) => setAddress((a) => ({ ...a, [key]: key === 'state' ? v.toUpperCase() : v }))}
          maxLength={key === 'state' ? 2 : key === 'zip' ? 5 : key === 'phone' ? 20 : key === 'city' ? 30 : 35}
          keyboardType={key === 'zip' ? 'number-pad' : key === 'phone' ? 'phone-pad' : 'default'}
        />
      ))}
      {quote ? (
        <Card style={{ gap: 10 }}>
          <T variant="heading">Every cycle · {quote.interval}</T>
          {[
            ['Beans', quote.subtotal_cents],
            [`Savings (${quote.discount_percent}%)`, -quote.discount_cents],
            ['Tax', quote.tax_cents],
            [quote.shipping_service, quote.shipping_cents],
            ['Recurring total', quote.total_cents],
          ].map(([label, cents]) => (
            <View key={String(label)} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <T variant="body">{String(label)}</T>
              <T variant="bodyStrong">{money(Number(cents) / 100)}</T>
            </View>
          ))}
          {catalog.test_mode && catalog.billing_ready && (
            <Notice>Test billing · no live charge. Test orders must not be fulfilled.</Notice>
          )}
        </Card>
      ) : (
        <Notice>Enter your delivery details to calculate the full recurring price.</Notice>
      )}
      <T variant="small">
        No coupon stacking or mid-cycle plan changes. Contact the shop for product or address changes. Cancel future
        renewals from your account; paid deliveries still ship.
      </T>
      {user && (
        <SwitchRow
          label="I authorize automatic renewal"
          sub={
            quote
              ? `Charge ${money(quote.total_cents / 100)} ${quote.interval.toLowerCase()} and ship this selection each cycle until I cancel.`
              : 'Review your recurring price before continuing.'
          }
          value={consent}
          onChange={(on) => setAccepted(on ? consentKey : null)}
        />
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button
        title={user ? 'Continue to secure subscription checkout' : 'Sign in to subscribe'}
        disabled={user ? !quote || !consent || !catalog.billing_ready : false}
        loading={busy}
        onPress={start}
      />
    </View>
  );
}
