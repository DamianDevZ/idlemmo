'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadTierFrame } from '@/features/admin/tier-scaling-actions';
import Image from 'next/image';

export function TierFramesSection({
  maxTier,
  frameUrls: initial,
}: {
  maxTier: number;
  frameUrls: Record<number, string>;
}) {
  const [frameUrls, setFrameUrls] = useState<Record<number, string>>(initial);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const tierNums = Array.from({ length: maxTier }, (_, i) => i + 1);

  function handleClick(tier: number) {
    inputRefs.current[tier]?.click();
  }

  function handleFileChange(tier: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(tier);
    setError(null);

    const fd = new FormData();
    fd.append('frame', file);

    startTransition(async () => {
      try {
        const url = await uploadTierFrame(tier, fd);
        // Bust cache by appending a timestamp
        setFrameUrls(prev => ({ ...prev, [tier]: `${url}?t=${Date.now()}` }));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(null);
        // Reset input so same file can be re-uploaded if needed
        if (inputRefs.current[tier]) inputRefs.current[tier]!.value = '';
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
        {tierNums.map(t => {
          const url = frameUrls[t];
          const isLoading = uploading === t;

          return (
            <div key={t} className="space-y-1.5">
              <button
                type="button"
                onClick={() => handleClick(t)}
                disabled={isLoading}
                title={`Upload T${t} frame`}
                className="group relative w-full aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-card transition-colors overflow-hidden disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <span className="text-xs text-muted-foreground">…</span>
                  </div>
                ) : url ? (
                  <>
                    <Image
                      src={url}
                      alt={`T${t} frame`}
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

              <p className="text-center text-[10px] text-muted-foreground font-medium">T{t}</p>

              {/* Hidden file input */}
              <input
                ref={el => { inputRefs.current[t] = el; }}
                type="file"
                accept="image/png,image/webp,image/jpeg"
                className="hidden"
                onChange={e => handleFileChange(t, e)}
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Click any slot to upload or replace its frame. Square images work best (e.g. 64×64 or 128×128 px).
      </p>
    </div>
  );
}
