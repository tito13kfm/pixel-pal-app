// ---------- AI Configuration ----------
// Defined here (shared type layer) since it lives in the data layer.
// The actual AI client code lives in src/lib/ai.ts.

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

// ---------- Palette payload types ----------
// Inferred from saveCurrentPalette / loadPalette in pixel-pal.tsx.
// Most fields are optional because loadPalette validates and defaults each one,
// tolerating payloads saved by older app versions that lack newer fields.

export interface SavedPalettePayload {
  name: string
  savedAt: number
  baseColors: string[]
  aiColorNames?: string[]
  aiReasoning?: string
  rampSize?: number
  gplStyle?: 'punchy' | 'balanced' | 'muted'
  vizStyle?: 'punchy' | 'balanced' | 'muted'
  spriteKey?: string
  shuffleSeed?: number
  customSprites?: Record<string, unknown>
  overrides?: Record<string, Record<string, { punchy?: string; balanced?: string; muted?: string }>>
  harmonyAnchor?: number
  rampSizeOverrides?: Record<string, number>
  rampSatOverrides?: Record<string, number>
  hiddenShades?: Record<string, number[]>
  rampShuffleOffsets?: Record<string, number>
  hardwareLock?: string | null
  hueShiftStrength?: number
  lockedRamps?: number[]
}

// The lightweight index record kept in memory for the saved-palettes list.
// Full payload is fetched lazily from storage when the user clicks Load.
export interface SavedPaletteIndexEntry {
  slug: string
  name: string
  savedAt: number
  baseColors: string[]
}

// ---------- Slug helper ----------
// Pure function, no component-state coupling. Extracted verbatim from
// pixel-pal.tsx saveCurrentPalette / slugify (line 3685).

export const slugify = (name: string): string => {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
};

// ---------- localStorage helpers ----------
// The artifact used window.storage (a custom artifact API). In standard
// browsers we use synchronous localStorage. These helpers mirror the
// palette storage conventions used in the component:
//   - Full payload at key "palettes:{slug}"
//   - No separate index; the list is rebuilt by scanning matching keys.

export const PALETTE_KEY_PREFIX = 'palettes:';

export const savePaletteToStorage = (slug: string, payload: SavedPalettePayload): void => {
  localStorage.setItem(`${PALETTE_KEY_PREFIX}${slug}`, JSON.stringify(payload));
};

export const loadPaletteFromStorage = (slug: string): SavedPalettePayload | null => {
  const raw = localStorage.getItem(`${PALETTE_KEY_PREFIX}${slug}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedPalettePayload;
  } catch {
    return null;
  }
};

export const deletePaletteFromStorage = (slug: string): void => {
  localStorage.removeItem(`${PALETTE_KEY_PREFIX}${slug}`);
};

export const listPaletteSlugs = (): string[] => {
  const slugs: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PALETTE_KEY_PREFIX)) {
      slugs.push(key.slice(PALETTE_KEY_PREFIX.length));
    }
  }
  return slugs;
};

export const loadAllPaletteIndexEntries = (): SavedPaletteIndexEntry[] => {
  const entries: SavedPaletteIndexEntry[] = [];
  for (const slug of listPaletteSlugs()) {
    const payload = loadPaletteFromStorage(slug);
    if (!payload || !Array.isArray(payload.baseColors)) continue;
    entries.push({
      slug,
      name: payload.name || '(unnamed)',
      savedAt: payload.savedAt || 0,
      baseColors: payload.baseColors,
    });
  }
  entries.sort((a, b) => b.savedAt - a.savedAt);
  return entries;
};
