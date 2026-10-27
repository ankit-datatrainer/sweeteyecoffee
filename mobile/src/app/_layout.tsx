import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display/400Regular';
import { PlayfairDisplay_400Regular_Italic } from '@expo-google-fonts/playfair-display/400Regular_Italic';
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display/600SemiBold';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display/700Bold_Italic';
import { useFonts } from 'expo-font';
import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { IntroOverlay } from '@/components/brand';
import { QuickAddHost } from '@/components/quick-add';
import { ToastHost } from '@/components/toast';
import { useAuth, useCatalog, useUi } from '@/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.cream, primary: colors.gold, border: colors.line },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [introDone, setIntroDone] = useState(false);
  const finishIntro = useCallback(() => {
    setIntroDone(true);
    useUi.getState().setIntroDone();
  }, []);

  useEffect(() => {
    useCatalog.getState().load();
    useAuth.getState().hydrate();
  }, []);

  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'ios_from_right',
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[id]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="order/[id]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="auth/sign-in" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="auth/register" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
        <QuickAddHost />
        <ToastHost />
        {!introDone && <IntroOverlay onDone={finishIntro} />}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
