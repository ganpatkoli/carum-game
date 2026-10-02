'use client';
import { CrudPage } from '@/components/CrudPage';

export default function Missions() {
  return (
    <CrudPage title="Daily missions" subtitle="Progress updates automatically after every match; players claim the reward once per day" path="missions" module="missions"
      fields={[
        { key: 'id', label: 'ID (letters, numbers, _)', type: 'text', required: true, readOnlyOnEdit: true },
        { key: 'title', label: 'Title shown to players', type: 'text', required: true },
        { key: 'metric', label: 'Metric', type: 'select', options: ['matches_played', 'matches_won', 'coins_pocketed', 'friend_matches', 'queen_covers', 'fouls'] },
        { key: 'target', label: 'Target', type: 'number', required: true, default: 1 },
        { key: 'rewardCoins', label: 'Reward coins', type: 'number', required: true, default: 50 },
        { key: 'active', label: 'Active', type: 'boolean' },
      ]}
      columns={[{ key: 'id', header: 'ID' }, { key: 'title', header: 'Title' }, { key: 'metric', header: 'Metric' }, { key: 'target', header: 'Target' }, { key: 'rewardCoins', header: 'Reward' }]} />
  );
}
