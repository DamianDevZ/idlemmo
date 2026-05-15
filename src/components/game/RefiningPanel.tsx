'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  REFINED_RESOURCES,
  RAW_RESOURCES,
  TIER_REQ_SKILL,
  TIER_COLORS,
  TIER_BORDER,
} from '@/config/crafting.config';
import AllocatePointButton from '@/components/game/AllocatePointButton';

/** Maps each refined resource key to its icon image path. */
const REFINE_ICON: Record<string, string> = {
  planks:    '/icons/resources/refined/planks.png',
  cut_stone: '/icons/resources/refined/stone_blocks.png',
  ingots:    '/icons/resources/refined/metal_blocks.png',
  leather:   '/icons/resources/refined/leather.png',
  cloth:     '/icons/resources/refined/cloth.png',
};

/** Maps each raw resource key to its icon image path. */
const RAW_ICON: Record<string, string> = {
  wood:  '/icons/resources/raw/logs.png',
  stone: '/icons/resources/raw/stone.png',
  metal: '/icons/resources/raw/metal.png',
  hide:  '/icons/resources/raw/hide.png',
  fiber: '/icons/resources/raw/fiber.png',
};

interface AllocProps {
  characterId: string;
  categoryId: string;
  skillId: string;
  cost: number;
  canAllocate: boolean;
}

interface Props {
  skillLevels: Record<string, number>;
  allocBySkill: Record<string, AllocProps>;
}

export default function RefiningPanel({ skillLevels, allocBySkill }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = REFINED_RESOURCES.find(r => r.key === selectedKey);
  const rawRes   = selected ? RAW_RESOURCES.find(r => r.key === selected.rawKey) : null;
  const level    = selected ? (skillLevels[selected.skillName] ?? 0) : 0;
  const ap       = selected ? allocBySkill[selected.skillName] : undefined;

  return (
    <div className="space-y-4">
      {/* ── Resource-type picker cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-2">
        {REFINED_RESOURCES.map(ref => {
          const iconPath = REFINE_ICON[ref.key];
          const lvl      = skillLevels[ref.skillName] ?? 0;
          const active   = selectedKey === ref.key;
          return (
            <button
              key={ref.key}
              onClick={() => setSelectedKey(active ? null : ref.key)}
              className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl border text-center transition-colors ${
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              {iconPath ? (
                <Image src={iconPath} alt={ref.label} width={36} height={36} className="object-contain" />
              ) : (
                <span className="text-3xl">{ref.icon}</span>
              )}
              <span className={`text-xs font-semibold leading-tight ${active ? 'text-primary' : 'text-foreground'}`}>
                {ref.label}
              </span>
              <span className={`text-base font-bold tabular-nums ${active ? 'text-primary' : 'text-primary'}`}>
                {lvl}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tier detail (shown when a resource type is selected) ────────────── */}
      {selected && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {REFINE_ICON[selected.key] && (
                <Image
                  src={REFINE_ICON[selected.key]}
                  alt={selected.label}
                  width={28}
                  height={28}
                  className="object-contain"
                />
              )}
              <div>
                <p className="font-semibold text-sm">{selected.label}</p>
                {rawRes && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {RAW_ICON[rawRes.key] && (
                      <Image src={RAW_ICON[rawRes.key]} alt={rawRes.label} width={12} height={12} className="object-contain" />
                    )}
                    {rawRes.label} → {selected.label}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-primary font-bold text-lg tabular-nums">{level}</span>
              {ap && <AllocatePointButton {...ap} />}
            </div>
          </div>

          {/* Tier grid */}
          <div className="grid grid-cols-5 gap-1.5">
            {selected.tierNames.map((name, i) => {
              const locked    = level < TIER_REQ_SKILL[i];
              const rawName   = rawRes?.tierNames[i] ?? '?';
              const rawNeeded = selected.rawPerUnit[i];
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-lg border text-center ${
                    locked ? 'border-border opacity-40' : TIER_BORDER[i]
                  }`}
                >
                  {locked ? (
                    <span className="text-base">🔒</span>
                  ) : REFINE_ICON[selected.key] ? (
                    <Image
                      src={REFINE_ICON[selected.key]}
                      alt={name}
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-base">{selected.icon}</span>
                  )}
                  <span className={`text-[10px] font-bold mt-0.5 ${locked ? 'text-muted-foreground' : TIER_COLORS[i]}`}>
                    T{i + 1}
                  </span>
                  <span className={`text-[8px] leading-tight text-center ${locked ? 'text-muted-foreground' : TIER_COLORS[i]}`}>
                    {name}
                  </span>
                  {!locked && (
                    <span className="text-[7px] text-muted-foreground/70">
                      {rawNeeded}× {rawName.split(' ')[0]}
                    </span>
                  )}
                  {locked && (
                    <span className="text-[8px] text-muted-foreground/60">Lv {TIER_REQ_SKILL[i]}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
