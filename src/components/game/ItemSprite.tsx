'use client';

import { useState } from 'react';

interface ItemSpriteProps {
  /** Supabase storage public URL for the item's icon, or null for fallback. */
  imageUrl?: string | null;
  /** Inventory tier (1-based). When provided, overlays the matching tier frame. */
  tier?: number | null;
  /** Container size in px — both width and height. Defaults to 56. */
  size?: number;
  className?: string;
  /** Rendered when imageUrl is absent, e.g. an emoji or static <Image>. */
  fallback?: React.ReactNode;
}

/**
 * Renders an item icon from Supabase storage with an optional tier frame overlay.
 * Falls back to `fallback` (emoji / static icon) when imageUrl is null.
 * Silently hides the frame if the PNG hasn't been uploaded yet (HTTP 404).
 */
export function ItemSprite({ imageUrl, tier, size = 56, className = '', fallback }: ItemSpriteProps) {
  const [frameError, setFrameError] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const frameUrl =
    !frameError && tier && tier > 0 && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/icons/tier-frames/t${tier}.png`
      : null;

  // Nothing to render if both imageUrl and frameUrl are absent.
  if (!imageUrl && !frameUrl) return <>{fallback}</>;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain p-[10%]"
        />
      ) : (
        fallback && (
          <div className="absolute inset-0 flex items-center justify-center">
            {fallback}
          </div>
        )
      )}
      {frameUrl && (
        // Overlay tier frame — pointer-events-none so it doesn't block clicks
        <img
          src={frameUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          onError={() => setFrameError(true)}
        />
      )}
    </div>
  );
}
