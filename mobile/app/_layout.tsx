import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

export default function Root() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0f1115' }}>
      <QueryClientProvider client={qc}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
