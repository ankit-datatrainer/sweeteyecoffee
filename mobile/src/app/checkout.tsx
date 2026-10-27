import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Photo } from '@/components/photo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming, interpolateColor } from 'react-native-reanimated';
import { PageScreen } from '@/components/layout';
import { Totals } from '@/components/order-bits';
import { RollingPrice } from '@/components/product';
import { PAY_LABEL, PayOptions, availablePayMethods, type PayMethod } from '@/components/pay-options';
import { SquareCard, type SquareCardHandle } from '@/components/square-card';
import { toast } from '@/components/toast';
import { Button, Card, Field, Icon, Notice, PressableScale, T } from '@/components/ui';
import { ApiError, errorMessage, post } from '@/lib/api';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { Order, Quote } from '@/lib/types';
import { useAuth, useCart, useCatalog, useGuestOrders } from '@/store';
import { colors, fonts, radius, space } from '@/theme';

type Method = 'in_store' | 'curbside' | 'delivery';
type Placed = { order: Order; order_token: string; payment_required: boolean };
type Pending = { id: number; token: string; order_number: string };

const PENDING_KEY = 'sweet-eye-stripe-pending';
/** Web leaves the app for Stripe's page; the order it was paying for waits here until it comes back. */
const pendingStripe = {
  save: (p: Pending) => {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    } catch {}
  },
  take: (): Pending | null => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
};

export default function CheckoutScreen() {
  const { lines, couponCode, clear } = useCart();
  const user = useAuth((s) => s.user);
  const store = useCatalog((s) => s.store);
  const rememberGuest = useGuestOrders((s) => s.remember);
  const card = useRef<SquareCardHandle>(null);
  const returned = useLocalSearchParams<{ stripe?: string; order?: string }>();

  const [chosenMethod, setMethod] = useState<Method>('in_store');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [vehicle, setVehicle] = useState('');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: 'TN', zip: '' });
  const [shippingOption, setShippingOption] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [chosenPay, setPay] = useState<PayMethod>('card');

  // Fall back to in-store when the chosen option isn't offered for this bag.
  const method: Method =
    (chosenMethod === 'delivery' && quote && !quote.can_deliver) || (chosenMethod === 'curbside' && quote && !quote.curbside_enabled)
      ? 'in_store'
      : chosenMethod;
  const addressComplete = address.line1.trim() && address.city.trim() && /^[A-Za-z]{2}$/.test(address.state) && /^\d{5}$/.test(address.zip);
  const quoteBody = useMemo(
    () => ({
      items: lines,
      coupon_code: couponCode,
      ...(method === 'delivery' && addressComplete ? { pickup_method: 'delivery', address, shipping_option: shippingOption ?? undefined } : {}),
    }),
    [lines, couponCode, method, addressComplete, address, shippingOption],
  );

  useEffect(() => {
    if (!lines.length) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      post<Quote>('/checkout/quote', quoteBody, { signal: controller.signal })
        .then((q) => {
          setQuote(q);
          setQuoteError(null);
          if (q.delivery_options && !q.delivery_options.some((o) => o.code === shippingOption)) setShippingOption(q.delivery_options[0]?.code ?? null);
        })
        .catch((e) => (e as Error).name !== 'AbortError' && setQuoteError(errorMessage(e)));
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [quoteBody, lines.length, shippingOption]);

  const live = store?.payments.mode === 'live';
  const total = quote?.total ?? 0;
  const cardOn = live && !!store?.payments.square;
  const payMethods = live ? availablePayMethods(cardOn, store?.payments.stripe_methods) : [];
  const pay: PayMethod = payMethods.includes(chosenPay) ? chosenPay : (payMethods[0] ?? 'card');
  const canPay = !live || total <= 0 || payMethods.includes(pay);
  const viaStripe = live && pay !== 'card';

  const finished = (placed: Pending) => {
    if (!user) rememberGuest(placed);
    haptic.success();
    clear();
    router.replace({ pathname: '/order/[id]', params: { id: String(placed.id), placed: '1' } });
  };

  // Web: back from Stripe's page (?stripe=paid|cancelled|failed&order=ID).
  useEffect(() => {
    if (Platform.OS !== 'web' || !returned.stripe) return;
    const pending = pendingStripe.take();
    if (!pending || String(pending.id) !== returned.order) return;
    if (returned.stripe === 'paid') return finished(pending);
    const headers = { 'X-Order-Token': pending.token };
    post<{ status: string }>(`/orders/${pending.id}/stripe/check`, {}, { headers })
      .then((r) => {
        if (r.status === 'paid') return finished(pending);
        post(`/orders/${pending.id}/cancel-unpaid`, {}, { headers }).catch(() => {});
        const message = returned.stripe === 'cancelled' ? 'Payment cancelled — your bag is still here.' : 'The payment did not go through. Please try again.';
        toast.error(message);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned.stripe, returned.order]);

  /** Apple Pay / Google Pay / Cash App Pay / Amazon Pay on Stripe's secure page, opened on the chosen method. */
  const payWithStripe = async (placed: Placed, method: PayMethod) => {
    const headers = { 'X-Order-Token': placed.order_token };
    const returnUrl = Platform.OS === 'web'
      ? `${window.location.origin}/checkout?order=${placed.order.id}`
      : Linking.createURL('checkout', { queryParams: { order: String(placed.order.id) } });
    const { url } = await post<{ url: string }>(`/orders/${placed.order.id}/stripe`, { return_url: returnUrl, method }, { headers });
    if (Platform.OS === 'web') {
      pendingStripe.save({ id: placed.order.id, token: placed.order_token, order_number: placed.order.order_number });
      window.location.assign(url);
      return 'redirected' as const;
    }
    await WebBrowser.openAuthSessionAsync(url, returnUrl);
    const { status } = await post<{ status: string }>(`/orders/${placed.order.id}/stripe/check`, {}, { headers });
    if (status === 'paid') return 'paid' as const;
    throw new Error(status === 'processing' ? 'Your payment is still processing. Please check your orders in a minute.' : 'Payment was not completed — your bag is still here.');
  };

  const place = async () => {
    setFormError(null);
    if (!user && !name.trim()) return fail('Please enter your full name so we can prepare your order.');
    if ((!user || method === 'delivery') && !phone.trim()) return fail('Please enter your phone number so we can reach you about your order.');
    if (method === 'curbside' && !vehicle.trim()) return fail('Please describe your vehicle so we can find you at the curb.');
    if (method === 'delivery' && !addressComplete) return fail('Please complete your delivery address.');

    setPlacing(true);
    let placed: Placed | null = null;
    try {
      // Tokenize first so a card typo never creates an order.
      const sourceId = live && total > 0 && pay === 'card' ? await card.current?.tokenize() : undefined;

      placed = await post<Placed>('/checkout', {
        items: lines,
        coupon_code: couponCode,
        pickup_method: method,
        name,
        phone,
        vehicle_details: method === 'curbside' ? vehicle : undefined,
        address: method === 'delivery' ? address : undefined,
        shipping_option: method === 'delivery' ? shippingOption : undefined,
        notes,
      });

      if (placed.payment_required && viaStripe) {
        if ((await payWithStripe(placed, pay)) === 'redirected') return;
      } else if (placed.payment_required) {
        await post(`/orders/${placed.order.id}/pay`, { source_id: sourceId }, { headers: { 'X-Order-Token': placed.order_token } });
      }

      finished({ id: placed.order.id, token: placed.order_token, order_number: placed.order.order_number });
    } catch (e) {
      // Payment failed after the order was saved: remove the unpaid order so the bag can be retried.
      if (placed?.payment_required) {
        post(`/orders/${placed.order.id}/cancel-unpaid`, {}, { headers: { 'X-Order-Token': placed.order_token } }).catch(() => {});
      }
      haptic.error();
      const message = errorMessage(e);
      setFormError(message);
      toast.error(message);
      if (e instanceof ApiError && e.status === 422 && /cart|menu|unavailable/i.test(message)) router.navigate('/bag');
    } finally {
      setPlacing(false);
    }
  };

  function fail(message: string) {
    haptic.error();
    setFormError(message);
    toast.error(message);
  }

  if (!lines.length) {
    return (
      <PageScreen title="Checkout">
        <T variant="body">Your bag is empty.</T>
        <Button title="Browse the menu" onPress={() => router.replace('/menu')} style={{ marginTop: space.lg }} />
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title="Checkout"
      footer={
        <Button
          title={!live || total <= 0 ? 'Place order' : viaStripe ? `Pay with ${PAY_LABEL[pay]}` : 'Pay & place order'}
          icon="lock"
          loading={placing}
          disabled={!quote || !canPay}
          onPress={place}
          right={quote ? <RollingPrice value={total} style={styles.payPrice} /> : undefined}
        />
      }>
      {/* 1 · Fulfilment */}
      <Step n={1} title="How would you like it?" />
      <View style={styles.methods}>
        <MethodCard icon="home" title="In-store pickup" sub="Collect at the counter" selected={method === 'in_store'} onPress={() => setMethod('in_store')} />
        <MethodCard
          icon="navigation"
          title="Curbside"
          sub={quote && !quote.curbside_enabled ? 'Paused right now' : 'We bring it to your car'}
          disabled={!!quote && !quote.curbside_enabled}
          selected={method === 'curbside'}
          onPress={() => setMethod('curbside')}
        />
        <MethodCard
          icon="truck"
          title="Delivery"
          sub={quote && !quote.can_deliver ? 'Coffee beans only' : 'Local or US shipping'}
          disabled={!!quote && !quote.can_deliver}
          selected={method === 'delivery'}
          onPress={() => setMethod('delivery')}
        />
      </View>

      {method === 'in_store' && store && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.pickupInfo}>
          <Icon name="map-pin" size={15} color={colors.gold} />
          <T variant="small" style={{ flex: 1 }}>{store.address} · {store.status.label}{store.status.detail ? ` · ${store.status.detail}` : ''}</T>
        </Animated.View>
      )}
      {method === 'curbside' && (
        <Animated.View entering={FadeInDown} exiting={FadeOut} style={{ marginTop: space.md }}>
          <Field label="Your vehicle (e.g. Black Honda Civic)" icon="truck" value={vehicle} onChangeText={setVehicle} maxLength={150} />
        </Animated.View>
      )}
      {method === 'delivery' && (
        <Animated.View entering={FadeInDown} exiting={FadeOut} layout={LinearTransition} style={{ gap: 10, marginTop: space.md }}>
          <Field label="Street address" icon="map-pin" value={address.line1} onChangeText={(v) => setAddress({ ...address, line1: v })} autoComplete="street-address" />
          <Field label="Apt, suite (optional)" value={address.line2} onChangeText={(v) => setAddress({ ...address, line2: v })} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="City" value={address.city} onChangeText={(v) => setAddress({ ...address, city: v })} containerStyle={{ flex: 1.4 }} />
            <Field label="State" value={address.state} onChangeText={(v) => setAddress({ ...address, state: v.toUpperCase().slice(0, 2) })} autoCapitalize="characters" containerStyle={{ flex: 0.7 }} />
            <Field label="ZIP" value={address.zip} onChangeText={(v) => setAddress({ ...address, zip: v.replace(/\D/g, '').slice(0, 5) })} keyboardType="number-pad" containerStyle={{ flex: 0.9 }} />
          </View>
          {quote?.delivery_options ? (
            <View style={{ gap: 8 }}>
              {quote.delivery_options.map((o) => (
                <PressableScale key={o.code} onPress={() => setShippingOption(o.code)} style={[styles.shipOption, shippingOption === o.code && styles.shipOptionOn]}>
                  <Icon name={shippingOption === o.code ? 'check-circle' : 'circle'} size={18} color={shippingOption === o.code ? colors.gold : colors.creamMuted} />
                  <Text style={styles.shipName}>{o.name}</Text>
                  <Text style={styles.shipPrice}>{money(o.price)}</Text>
                </PressableScale>
              ))}
            </View>
          ) : (
            <T variant="small">Enter your full address to see delivery options.</T>
          )}
        </Animated.View>
      )}

      {/* 2 · Details */}
      <Step n={2} title="Your details" />
      {user ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">{user.name}</T>
            <T variant="small">{user.email}</T>
          </View>
        </Card>
      ) : (
        <View style={{ gap: 10, marginBottom: 10 }}>
          <PressableScale onPress={() => router.push('/auth/sign-in')} style={styles.signInHint}>
            <Icon name="user" size={15} color={colors.gold} />
            <Text style={styles.signInText}>Have an account? <Text style={{ color: colors.gold }}>Sign in</Text> to track orders anywhere.</Text>
          </PressableScale>
          <Field label="Full name" icon="user" value={name} onChangeText={setName} autoComplete="name" />
        </View>
      )}
      <Field label={user && method !== 'delivery' ? 'Phone (optional)' : 'Phone'} icon="phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Field label="Notes for the barista (optional)" icon="edit-3" value={notes} onChangeText={setNotes} multiline maxLength={1000} containerStyle={{ marginTop: 10 }} />

      {/* 3 · Payment */}
      <Step n={3} title="Payment" />
      {total <= 0 && quote ? (
        <Notice tone="success" icon="gift">Your order is fully covered — no payment needed.</Notice>
      ) : live && payMethods.length ? (
        <View style={{ gap: 12 }}>
          <PayOptions methods={payMethods} value={pay} onChange={setPay} />
          {pay === 'card' && store?.payments.square ? (
            <Animated.View entering={FadeIn} key="card">
              <Card>
                <View style={styles.cardHead}>
                  <Icon name="credit-card" size={16} color={colors.gold} />
                  <T variant="smallStrong">Credit / debit card</T>
                  <Text style={styles.secure}>Secured by Square</Text>
                </View>
                <SquareCard ref={card} applicationId={store.payments.square.application_id} locationId={store.payments.square.location_id} environment={store.payments.square.environment} />
              </Card>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn} key={pay}>
              <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Icon name="shield" size={18} color={colors.gold} />
                <T variant="small" style={{ flex: 1 }}>
                  {pay === 'cashapp'
                    ? 'Tap “Pay with Cash App Pay” and approve the payment in your Cash App (or scan the QR code), then you’ll come straight back here.'
                    : pay === 'amazon_pay'
                      ? 'Tap “Pay with Amazon Pay”, sign in to Amazon and confirm, then you’ll come straight back here.'
                      : `Tap “Pay with ${PAY_LABEL[pay]}” and confirm with the ${PAY_LABEL[pay]} button on the secure Stripe page, then you’ll come straight back here.`}
                </T>
              </Card>
            </Animated.View>
          )}
        </View>
      ) : live ? (
        <Notice tone="danger" icon="alert-circle">
          Card payments are unavailable right now. Please call the shop to place your order.
        </Notice>
      ) : (
        <Notice tone="gold" icon="shield">
          Test mode — orders go straight to the shop’s database and no card is charged. Switch the API to PAYMENTS_MODE=live to take real card payments through Square.
        </Notice>
      )}

      {/* Summary */}
      <Step n={4} title="Summary" />
      <Card>
        <View style={{ gap: 12, marginBottom: space.lg }}>
          {lines.map((l) => (
            <View key={l.key} style={styles.summaryLine}>
              <Photo eager uri={l.image} width={160} style={styles.summaryImage} />
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryName} numberOfLines={1}>{l.quantity} × {l.name}</Text>
                {!!(l.size_name || l.modifiers_label) && <T variant="small" numberOfLines={1}>{[l.size_name, l.modifiers_label].filter(Boolean).join(' · ')}</T>}
              </View>
              <Text style={styles.summaryPrice}>{money(l.unit_price * l.quantity)}</Text>
            </View>
          ))}
        </View>
        {quote ? (
          <Animated.View layout={LinearTransition}>
            <Totals
              rows={[
                { label: 'Subtotal', value: quote.subtotal },
                ...(quote.discount ? [{ label: `Discount${quote.coupon ? ` (${quote.coupon.code})` : ''}`, value: quote.discount, tone: 'discount' as const }] : []),
                { label: 'Tax', value: quote.tax },
                ...(quote.delivery ? [{ label: quote.delivery.service, value: quote.delivery.fee }] : []),
                { label: 'Total', value: quote.total, tone: 'total' },
              ]}
            />
          </Animated.View>
        ) : (
          <T variant="small">{quoteError ?? 'Calculating…'}</T>
        )}
      </Card>
      {!!formError && (
        <Animated.View entering={FadeInDown} style={{ marginTop: space.lg }}>
          <Notice tone="danger">{formError}</Notice>
        </Animated.View>
      )}
    </PageScreen>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <T variant="heading">{title}</T>
    </View>
  );
}

function MethodCard({ icon, title, sub, selected, disabled, onPress }: {
  icon: 'home' | 'navigation' | 'truck';
  title: string;
  sub: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected, on]);
  const style = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [colors.line, colors.gold]),
    backgroundColor: interpolateColor(on.value, [0, 1], ['rgba(245,237,227,0.03)', 'rgba(212,163,115,0.12)']),
  }));
  return (
    <PressableScale onPress={disabled ? undefined : onPress} style={[{ flex: 1, opacity: disabled ? 0.4 : 1 }]} scaleTo={0.95}>
      <Animated.View style={[styles.method, style]}>
        <Icon name={icon} size={20} color={selected ? colors.gold : colors.creamSoft} />
        <Text style={[styles.methodTitle, selected && { color: colors.cream }]}>{title}</Text>
        <Text style={styles.methodSub}>{sub}</Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.xxl, marginBottom: space.md },
  stepNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: fonts.bold, fontSize: 13, color: colors.gold },
  methods: { flexDirection: 'row', gap: 10 },
  method: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 6, minHeight: 116 },
  methodTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.creamSoft },
  methodSub: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 15, color: colors.creamMuted },
  pickupInfo: { flexDirection: 'row', gap: 8, marginTop: space.md, alignItems: 'flex-start' },
  shipOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  shipOptionOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,163,115,0.1)' },
  shipName: { flex: 1, fontFamily: fonts.semibold, fontSize: 14.5, color: colors.cream },
  shipPrice: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.goldLight },
  signInHint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(212,163,115,0.07)' },
  signInText: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, color: colors.creamSoft },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(212,163,115,0.15)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display, fontSize: 20, color: colors.gold },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  secure: { marginLeft: 'auto', fontFamily: fonts.medium, fontSize: 11.5, color: colors.creamMuted },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryImage: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.surfaceHigh },
  summaryName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  summaryPrice: { fontFamily: fonts.semibold, fontSize: 14, color: colors.creamSoft },
  payPrice: { fontFamily: fonts.bold, fontSize: 16, color: colors.espresso, marginLeft: 4 },
});
