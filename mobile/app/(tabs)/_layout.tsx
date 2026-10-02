import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useT, type Key } from '../../src/i18n';
import { theme } from '../../src/ui/theme';

const tabs: { name: string; key: Key; icon: string }[] = [
  { name: 'index', key: 'tab.home', icon: '🏠' },
  { name: 'play', key: 'tab.play', icon: '🎯' },
  { name: 'leaderboard', key: 'tab.leaderboard', icon: '🏆' },
  { name: 'rewards', key: 'tab.rewards', icon: '🎁' },
  { name: 'profile', key: 'tab.profile', icon: '👤' },
];

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border }, tabBarActiveTintColor: theme.gold, tabBarInactiveTintColor: theme.muted }}>
      {tabs.map((x) => <Tabs.Screen key={x.name} name={x.name} options={{ title: t(x.key), tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{x.icon}</Text> }} />)}
    </Tabs>
  );
}
