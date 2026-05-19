'use client';

import { useState, useTransition } from 'react';
import { updateSkill } from './actions';

type Skill = {
  id: string;
  name: string;
  display_name: string;
  description: string;
  primary_attribute: string;
  skill_categories: { name: string; display_name: string } | null;
};

const ATTR_EMOJI: Record<string, string> = {
  vigor: '❤️', endurance: '🛡️', strength: '💪', dexterity: '🏃',
  intelligence: '🧠', faith: '✨', arcane: '🔮',
};

export function SkillsAdminClient({ initial }: { initial: Skill[] }) {
  const [skills, setSkills] = useState<Skill[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { display_name: string; description: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(skill: Skill) {
    setEditing(skill.id);
    setDrafts(prev => ({
      ...prev,
      [skill.id]: { display_name: skill.display_name, description: skill.description },
    }));
    setError(null);
    setSaved(null);
  }

  function cancelEdit() {
    setEditing(null);
    setError(null);
  }

  function handleSave(skill: Skill) {
    const d = drafts[skill.id];
    if (!d) return;
    setError(null);
    startTransition(async () => {
      const result = await updateSkill(skill.id, d.display_name, d.description);
      if (!result.ok) { setError(result.error ?? 'Save failed'); return; }
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, ...d } : s));
      setEditing(null);
      setSaved(skill.id);
      setTimeout(() => setSaved(null), 2000);
    });
  }

  // Group by category
  const byCategory = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    const cat = s.skill_categories?.display_name ?? 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {Object.entries(byCategory).map(([catName, catSkills]) => (
        <div key={catName} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{catName}</p>
          </div>

          <div className="divide-y divide-border">
            {catSkills.map(skill => {
              const isEditing = editing === skill.id;
              const d = drafts[skill.id] ?? { display_name: skill.display_name, description: skill.description };

              return (
                <div key={skill.id} className="px-5 py-4 space-y-3">
                  {isEditing ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{ATTR_EMOJI[skill.primary_attribute] ?? '⚙️'}</span>
                        <span className="text-xs font-mono text-muted-foreground">{skill.name}</span>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Display Name</span>
                        <input
                          value={d.display_name}
                          onChange={e => setDrafts(prev => ({ ...prev, [skill.id]: { ...d, display_name: e.target.value } }))}
                          className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</span>
                        <textarea
                          value={d.description}
                          rows={2}
                          onChange={e => setDrafts(prev => ({ ...prev, [skill.id]: { ...d, description: e.target.value } }))}
                          className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSave(skill)}
                          disabled={isPending}
                          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {isPending ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-body transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">{ATTR_EMOJI[skill.primary_attribute] ?? '⚙️'}</span>
                          <span className="text-sm font-semibold text-body">
                            {skill.display_name}
                            {saved === skill.id && <span className="ml-2 text-xs text-green-500">✓ saved</span>}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-6 truncate">{skill.description || <em>No description</em>}</p>
                        <p className="text-[10px] font-mono text-muted-foreground/50 pl-6">{skill.name}</p>
                      </div>
                      <button
                        onClick={() => startEdit(skill)}
                        className="shrink-0 px-2.5 py-1 text-xs text-muted-foreground border border-border rounded hover:text-body hover:border-border/80 transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
