'use client';

import { useRef, useState, useTransition } from 'react';
import { saveAppSetting } from '@/features/admin/settings-actions';
import { uploadRecipeScrollBg } from '@/features/admin/tier-scaling-actions';
import Image from 'next/image';

export function RecipeSettingsSection({
  initialSuffix,
  initialScrollBgUrl,
}: {
  initialSuffix: string;
  initialScrollBgUrl: string | null;
}) {
  const [suffix, setSuffix] = useState(initialSuffix);
  const [scrollBgUrl, setScrollBgUrl] = useState<string | null>(initialScrollBgUrl);
  const [savingText, setSavingText] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleSaveSuffix() {
    if (!suffix.trim()) return;
    setSavingText(true);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveAppSetting('recipe_suffix', suffix.trim());
      setSavingText(false);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    setError(null);
    const fd = new FormData();
    fd.append('scroll', file);
    startTransition(async () => {
      try {
        const url = await uploadRecipeScrollBg(fd);
        setScrollBgUrl(`${url}?t=${Date.now()}`);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploadingBg(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Recipe suffix */}
      <div className="space-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Recipe Item Suffix
          </span>
          <p className="text-xs text-muted-foreground">
            This word is appended to the item name when a recipe scroll is auto-created.
            E.g. item &quot;Cloth&quot; + suffix &quot;Scroll&quot; → &quot;Cloth Scroll&quot;.
          </p>
          <div className="flex gap-2 max-w-xs">
            <input
              type="text"
              value={suffix}
              onChange={e => setSuffix(e.target.value)}
              className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-body outline-none focus:ring-1 focus:ring-primary"
              placeholder="Scroll"
            />
            <button
              type="button"
              onClick={handleSaveSuffix}
              disabled={savingText || !suffix.trim()}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingText ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </label>
      </div>

      {/* Scroll background image */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recipe Scroll Background
        </span>
        <p className="text-xs text-muted-foreground">
          Single background image shown behind the item icon on recipe scroll items.
          Works the same way as tier frames but sits <em>behind</em> the icon instead of on top.
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingBg}
            title="Upload scroll background"
            className="group relative w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-card transition-colors overflow-hidden disabled:opacity-50"
          >
            {uploadingBg ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <span className="text-xs text-muted-foreground">…</span>
              </div>
            ) : scrollBgUrl ? (
              <>
                <Image
                  src={scrollBgUrl}
                  alt="Recipe scroll background"
                  fill
                  sizes="80px"
                  className="object-contain p-1"
                  unoptimized
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-[10px] text-white font-medium">Replace</span>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <span className="text-lg text-muted-foreground/40">+</span>
              </div>
            )}
          </button>
          <p className="text-xs text-muted-foreground">
            {scrollBgUrl ? 'Click to replace the current background.' : 'No background uploaded yet.'}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          className="hidden"
          onChange={handleFileChange}
        />
        <p className="text-xs text-muted-foreground">
          Square images work best (e.g. 64×64 or 128×128 px).
        </p>
      </div>
    </div>
  );
}
