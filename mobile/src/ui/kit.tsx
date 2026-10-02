import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../api/client';
import { play } from '../audio/sounds';
import { useT } from '../i18n';
import { AVATAR_BG, AVATARS, avatarIndex, theme } from './theme';
import { haptic } from './haptics';

export function Button({ title, onPress, kind = 'primary', loading, disabled, style, icon }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: string;
}) {
  const bg = kind === 'primary' ? theme.gold : kind === 'danger' ? theme.red : kind === 'secondary' ? theme.card2 : 'transparent';
  const fg = kind === 'primary' ? '#2b1a00' : theme.text;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={title} disabled={off}
      onPress={() => { play('click', 0.6); haptic('light'); onPress(); }}
      style={({ pressed }) => [{ backgroundColor: bg, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: off ? 0.5 : pressed ? 0.85 : 1, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: theme.border }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <>{icon ? <Text style={{ fontSize: 18, color: fg }}>{icon}</Text> : null}<Text style={{ color: fg, fontWeight: '800', fontSize: 16 }}>{title}</Text></>}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const base: ViewStyle = { backgroundColor: theme.card, borderRadius: theme.radius, padding: 16, borderWidth: 1, borderColor: theme.border };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable onPress={() => { play('click', 0.5); onPress(); }} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>{children}</Pressable>;
}

export function Input({ label, error, ...props }: TextInputProps & { label?: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: theme.muted, fontSize: 13 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel={label}
        {...props}
        style={[{ backgroundColor: theme.card2, color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, borderWidth: 1, borderColor: error ? theme.red : theme.border }, props.style]}
      />
      {error ? <Text style={{ color: theme.red, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

export function Avatar({ avatarId, imageUrl, size = 48, ring }: { avatarId?: string; imageUrl?: string | null; size?: number; ring?: string }) {
  const i = avatarIndex(avatarId);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_BG[i], alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 3 : 0, borderColor: ring, overflow: 'hidden' }}>
      {imageUrl ? <Image source={{ uri: imageUrl.startsWith('http') ? imageUrl : API_URL + imageUrl }} style={{ width: size, height: size }} /> : <Text style={{ fontSize: size * 0.55 }}>{AVATARS[i]}</Text>}
    </View>
  );
}

export function Pill({ children, color = theme.card2, textColor = theme.text }: { children: ReactNode; color?: string; textColor?: string }) {
  return <View style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: textColor, fontWeight: '700', fontSize: 12 }}>{children}</Text></View>;
}

export function Screen({ title, children, scroll = true, right, noBack, padded = true }: { title?: string; children: ReactNode; scroll?: boolean; right?: ReactNode; noBack?: boolean; padded?: boolean }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const body = scroll
    ? <ScrollView contentContainerStyle={{ padding: padded ? 16 : 0, gap: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={{ flex: 1, padding: padded ? 16 : 0 }}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      {title !== undefined && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          {!noBack && <Pressable accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={{ padding: 6 }}><Text style={{ color: theme.text, fontSize: 22 }}>‹</Text></Pressable>}
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1 }} numberOfLines={1}>{title}</Text>
          {right}
        </View>
      )}
      {body}
    </View>
  );
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.35);
  useEffect(() => { o.value = withRepeat(withSequence(withTiming(0.8, { duration: 700 }), withTiming(0.35, { duration: 700 })), -1); }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: theme.card2 }, a, style]} />;
}

export function SkeletonList({ rows = 5, height = 56 }: { rows?: number; height?: number }) {
  return <View style={{ gap: 10 }}>{Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={height} radius={14} />)}</View>;
}

export function Empty({ message, icon = '🪙' }: { message?: string; icon?: string }) {
  const t = useT();
  return <View style={{ padding: 32, alignItems: 'center', gap: 8 }}><Text style={{ fontSize: 36 }}>{icon}</Text><Text style={{ color: theme.muted, textAlign: 'center' }}>{message ?? t('state.empty')}</Text></View>;
}

export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const t = useT();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 32 }}>⚠️</Text>
      <Text style={{ color: theme.text, textAlign: 'center' }}>{message ?? t('state.error')}</Text>
      <Button title={t('state.retry')} onPress={onRetry} kind="secondary" />
    </View>
  );
}

/** Every API-backed screen goes through this: skeleton while loading, error + retry, empty state, then content. */
export function QueryView<T>({ query, children, isEmpty, emptyText, skeleton }: {
  query: { data: T | undefined; isLoading: boolean; isError: boolean; refetch: () => unknown };
  children: (data: T) => ReactNode; isEmpty?: (d: T) => boolean; emptyText?: string; skeleton?: ReactNode;
}) {
  if (query.isLoading) return <>{skeleton ?? <SkeletonList />}</>;
  if (query.isError || query.data === undefined) return <ErrorState onRetry={() => query.refetch()} />;
  if (isEmpty?.(query.data)) return <Empty message={emptyText} />;
  return <>{children(query.data)}</>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{children}</Text>{right}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => { play('click', 0.4); onChange(o.value); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: value === o.value ? theme.gold : theme.card2 }}>
          <Text style={{ color: value === o.value ? '#2b1a00' : theme.text, fontWeight: '700' }}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
