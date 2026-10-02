'use client';
import { CrudPage } from '@/components/CrudPage';

export default function Achievements() {
  return (
    <CrudPage title="Achievements" subtitle="Unlocked automatically when a player reaches the target; the reward is paid once" path="achievements" module="achievements"
      fields={[
        { key: 'id', label: 'ID (e.g. WIN_STREAK_5)', type: 'text', required: true, readOnlyOnEdit: true },
        { key: 'title', label: 'Title', type: 'text', required: true },
        { key: 'metric', label: 'Metric', type: 'select', options: ['wins_total', 'matches_total', 'win_streak', 'perfect_game', 'queen_covers_total'] },
        { key: 'target', label: 'Target', type: 'number', required: true, default: 1 },
        { key: 'rewardCoins', label: 'Reward coins', type: 'number', default: 0 },
        { key: 'active', label: 'Active', type: 'boolean' },
      ]}
      columns={[{ key: 'id', header: 'ID' }, { key: 'title', header: 'Title' }, { key: 'metric', header: 'Metric' }, { key: 'target', header: 'Target' }, { key: 'rewardCoins', header: 'Reward' }]} />
  );
}
