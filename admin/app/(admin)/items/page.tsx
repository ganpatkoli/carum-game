'use client';
import { CrudPage } from '@/components/CrudPage';
import { Badge } from '@/components/ui';

export default function Items() {
  return (
    <CrudPage title="Inventory items" subtitle="Strikers, boards, avatars, frames, effects and emotes. Price 0 = free for everyone." path="items" module="inventory"
      fields={[
        { key: 'id', label: 'ID (e.g. striker_gold)', type: 'text', required: true, readOnlyOnEdit: true },
        { key: 'category', label: 'Category', type: 'select', options: ['STRIKER', 'BOARD', 'AVATAR', 'FRAME', 'EFFECT', 'EMOTE'] },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'price', label: 'Price (coins)', type: 'number', required: true, default: 0 },
        { key: 'rarity', label: 'Rarity', type: 'select', options: ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] },
        { key: 'meta', label: 'Meta (striker colour / board theme)', type: 'json', default: {} },
        { key: 'active', label: 'Active', type: 'boolean' },
      ]}
      columns={[{ key: 'id', header: 'ID' }, { key: 'category', header: 'Category', render: (r) => <Badge tone="blue">{r.category}</Badge> }, { key: 'name', header: 'Name' }, { key: 'price', header: 'Price' }, { key: 'rarity', header: 'Rarity' }]} />
  );
}
