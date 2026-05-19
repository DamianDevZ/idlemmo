'use client';

import { useState } from 'react';

interface ItemSpriteProps {
  /** Supabase storage public URL for the item's icon, or null for fallback. */
  imageUrl?: string | null;
  /** Inventory tier (1-based). When provided, overlays the matching tier frame. */
  tier?: number | null;
  /**
   * URL for the recipe scroll background image. Rendered behind the item icon
   * (unlike tier frames which render on top). Used for recipe scroll items.
   */
  scrollBgUrl?: string | null;
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
export function ItemSprite({ imageUrl, tier, scrollBgUrl, size = 56, className = '', fallback }: ItemSpriteProps) {
  const [frameError, setFrameError] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const frameUrl =
    !frameError && tier && tier > 0 && supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/icons/tier-frames/t${tier}.png`
      : null;

  // Nothing to render if there's no visual content at all.
  if (!imageUrl && !frameUrl && !scrollBgUrl) return <>{fallback}</>;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* Layer 1: scroll background — sits behind the item icon, for recipe items */}
      {scrollBgUrl && (
        <img
          src={scrollBgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
      )}
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
        // Layer 3: tier frame overlay — pointer-events-none so it doesn't block clicks
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
