import { useQuery } from '@tanstack/react-query';
import { FlatList, Text, View } from 'react-native';
import { api } from '../../src/api/client';
import { Empty, ErrorState, Loading } from '../../src/ui/States';
import { theme } from '../../src/ui/theme';

interface Row { rank: number; username: string; rating: number; wins: number; xp: number }

export default function Leaderboard() {
  const q = useQuery({ queryKey: ['leaderboard'], queryFn: () => api<Row[]>('/leaderboard') });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  return (
    <FlatList
      style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, gap: 8 }}
      data={q.data} keyExtractor={(r) => String(r.rank)} ListEmptyComponent={<Empty />}
      renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', backgroundColor: theme.card, padding: 14, borderRadius: 12, justifyContent: 'space-between' }}>
          <Text style={{ color: theme.gold, width: 32 }}>#{item.rank}</Text>
          <Text style={{ color: theme.text, flex: 1 }}>{item.username}</Text>
          <Text style={{ color: theme.muted }}>{item.rating} · {item.wins}W</Text>
        </View>
      )}
    />
  );
}
