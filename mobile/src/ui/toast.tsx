import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { theme } from './theme';

interface ToastState { msg: string | null; kind: 'info' | 'success' | 'error'; id: number; show: (msg: string, kind?: 'info' | 'success' | 'error') => void }
export const useToast = create<ToastState>((set) => ({ msg: null, kind: 'info', id: 0, show: (msg, kind = 'info') => set((s) => ({ msg, kind, id: s.id + 1 })) }));
export const toast = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => useToast.getState().show(msg, kind);

export function ToastHost() {
  const { msg, kind, id } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => useToast.setState({ msg: null }), 2600);
    return () => clearTimeout(t);
  }, [id, msg]);
  if (!msg) return null;
  return (
    <Animated.View key={id} entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(180)} pointerEvents="none"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 999, backgroundColor: kind === 'error' ? theme.red : kind === 'success' ? theme.green : theme.card2, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{msg}</Text>
    </Animated.View>
  );
}
