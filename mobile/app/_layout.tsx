import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bindMusicToSettings, initAudio } from '../src/audio/sounds';
import { attachMatchListeners } from '../src/game/matchStore';
import { useSkiaReady } from '../src/game/skiaReady';
import { getInstallId } from '../src/api/device';
import { loadLang } from '../src/i18n';
import { syncOfflineMatches } from '../src/offline/queue';
import { registerForPush } from '../src/push';
import { useAuth } from '../src/store/auth';
import { useConfig } from '../src/store/config';
import { AdHost, NotificationHost } from '../src/ui/hosts';
import { ToastHost } from '../src/ui/toast';
import { theme } from '../src/ui/theme';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000, refetchOnReconnect: true } } });

export default function Root() {
  const status = useAuth((s) => s.status);
  const segments = useSegments();
  const brand = useConfig((s) => s.config.branding);
  const skiaReady = useSkiaReady();

  useEffect(() => {
    void (async () => { await loadLang(); await getInstallId(); await initAudio(); await useAuth.getState().bootstrap(); })();
    void useConfig.getState().load();
    return bindMusicToSettings();
  }, []);

  // everything that needs a signed-in user
  useEffect(() => {
    if (status !== 'signedIn') return;
    attachMatchListeners();
    void registerForPush();
    void syncOfflineMatches();
    void useConfig.getState().load();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { void useAuth.getState().refreshMe(); void syncOfflineMatches(); } });
    return () => sub.remove();
  }, [status]);

  // route guard
  useEffect(() => {
    if (status === 'loading') return;
    const inAuth = segments[0] === '(auth)';
    if (status === 'signedOut' && !inAuth) router.replace('/login');
    else if (status === 'signedIn' && inAuth) router.replace('/');
  }, [status, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={qc}>
          <StatusBar style="light" />
          {skiaReady && <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: theme.bg } }}>
            <Stack.Screen name="online" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="game" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="matchmaking" options={{ animation: 'fade', gestureEnabled: false }} />
          </Stack>}
          <NotificationHost />
          <AdHost />
          <ToastHost />
          {status === 'loading' && (
            <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Text style={{ fontSize: 64 }}>🎯</Text>
              <Text style={{ color: brand.primaryColor, fontSize: 28, fontWeight: '900' }}>{brand.name}</Text>
              <Text style={{ color: theme.muted }}>{brand.tagline}</Text>
            </View>
          )}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
