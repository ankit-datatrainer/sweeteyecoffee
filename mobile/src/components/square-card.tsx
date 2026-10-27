import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, radius } from '@/theme';
import { T } from './ui';

// react-native-webview's class typings don't line up with React 19.3's yet.
const WebView = RNWebView as unknown as React.ComponentType<any>;

export type SquareCardHandle = { tokenize: () => Promise<string> };
type Props = { applicationId: string; locationId: string; environment: 'production' | 'sandbox' };

/** The same Square Web Payments card form the website uses, inside a WebView. */
export const SquareCard = forwardRef<SquareCardHandle, Props>(function SquareCard({ applicationId, locationId, environment }, ref) {
  const web = useRef<{ injectJavaScript: (js: string) => void }>(null);
  const pending = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    tokenize: () =>
      new Promise<string>((resolve, reject) => {
        if (!ready) return reject(new Error('The card form is still loading.'));
        pending.current = { resolve, reject };
        web.current?.injectJavaScript('window.tokenize(); true;');
      }),
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data);
    if (msg.type === 'ready') setReady(true);
    if (msg.type === 'error') setError(msg.message);
    if (msg.type === 'token') pending.current?.resolve(msg.token);
    if (msg.type === 'tokenError') pending.current?.reject(new Error(msg.message));
    if (msg.type === 'token' || msg.type === 'tokenError') pending.current = null;
  };

  const sdk = environment === 'production' ? 'https://web.squarecdn.com/v1/square.js' : 'https://sandbox.web.squarecdn.com/v1/square.js';
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;background:transparent}#card{min-height:90px}</style>
<script src="${sdk}"></script></head><body><div id="card"></div><script>
const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
let card;
(async () => {
  try {
    const payments = Square.payments(${JSON.stringify(applicationId)}, ${JSON.stringify(locationId)});
    card = await payments.card({ style: {
      '.input-container': { borderColor: '#4a3426', borderRadius: '14px' },
      '.input-container.is-focus': { borderColor: '#D4A373' },
      input: { backgroundColor: '#1B110C', color: '#F5EDE3', fontSize: '16px' },
      'input::placeholder': { color: '#8a7a6c' },
    }});
    await card.attach('#card');
    post({ type: 'ready' });
  } catch (e) { post({ type: 'error', message: e.message || 'Card form failed to load.' }); }
})();
window.tokenize = async () => {
  try {
    const r = await card.tokenize();
    if (r.status === 'OK') post({ type: 'token', token: r.token });
    else post({ type: 'tokenError', message: (r.errors && r.errors[0] && r.errors[0].message) || 'Please check your card details.' });
  } catch (e) { post({ type: 'tokenError', message: e.message || 'Please check your card details.' }); }
};
</script></body></html>`;

  return (
    <View style={styles.wrap}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://sweeteyecoffee.com' }}
        onMessage={onMessage}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
      />
      {!ready && !error && <ActivityIndicator color={colors.gold} style={StyleSheet.absoluteFill} />}
      {error && <T variant="small" style={{ color: colors.danger, padding: 8 }}>{error}</T>}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { minHeight: 110, borderRadius: radius.md, overflow: 'hidden' },
  web: { height: 110, backgroundColor: 'transparent' },
});
