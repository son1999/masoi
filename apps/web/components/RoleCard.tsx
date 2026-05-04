'use client';

import type { MyGameInfo, RoleId } from '@ma-soi/shared';

const ROLE_META: Record<RoleId, { name: string; emoji: string; color: string; desc: string }> = {
  villager: {
    name: 'Dân làng',
    emoji: '🧑‍🌾',
    color: 'text-emerald-300',
    desc: 'Bạn là dân làng. Tìm và treo cổ Sói.',
  },
  werewolf: {
    name: 'Sói',
    emoji: '🐺',
    color: 'text-rose-400',
    desc: 'Bạn là Sói. Mỗi đêm cùng đồng đội cắn 1 dân. Bạn nói chuyện với sói khác bằng voice trong pha đêm.',
  },
  seer: {
    name: 'Tiên tri',
    emoji: '🔮',
    color: 'text-sky-300',
    desc: 'Mỗi đêm soi vai 1 người.',
  },
  witch: {
    name: 'Phù thủy',
    emoji: '🧪',
    color: 'text-fuchsia-300',
    desc: 'Có 1 bình cứu + 1 bình độc, mỗi loại dùng 1 lần cả ván.',
  },
  guard: {
    name: 'Bảo vệ',
    emoji: '🛡️',
    color: 'text-amber-300',
    desc: 'Mỗi đêm bảo vệ 1 người khỏi sói. Không bảo vệ cùng người 2 đêm liên tiếp.',
  },
};

interface Props {
  info: MyGameInfo;
  fellowWolfNames?: string[];
}

export default function RoleCard({ info, fellowWolfNames }: Props) {
  const meta = ROLE_META[info.role];
  return (
    <div className="rounded-lg border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{meta.emoji}</span>
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">Vai của bạn</div>
          <div className={`text-lg font-bold ${meta.color}`}>{meta.name}</div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-300">{meta.desc}</p>
      {info.role === 'werewolf' && fellowWolfNames && fellowWolfNames.length > 1 && (
        <div className="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-xs">
          <div className="font-semibold text-rose-300">Đồng đội Sói:</div>
          <div className="text-rose-200">{fellowWolfNames.join(', ')}</div>
        </div>
      )}
      {info.role === 'witch' && info.witchPotions && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className={`rounded-md px-2 py-1 ${info.witchPotions.heal ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-500 line-through'}`}>
            🧪 Cứu
          </div>
          <div className={`rounded-md px-2 py-1 ${info.witchPotions.poison ? 'bg-rose-500/10 text-rose-300' : 'bg-neutral-800 text-neutral-500 line-through'}`}>
            ☠️ Độc
          </div>
        </div>
      )}
    </div>
  );
}
