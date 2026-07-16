import { useState, useMemo } from 'react';
import type { DragEvent } from 'react';
import { DEFAULT_SPRITE_LIBRARY } from '../lib/constants';
import { parsePiskelC } from '../lib/palette-import';

/**
 * Sprite preview state + import handlers: the selected built-in/custom sprite
 * key, the custom sprite library, the importer panel's draft/drag fields, and
 * the import/drag/remove/copy-source handlers (#113). `spriteLibrary` merges
 * built-ins with custom imports. The handlers originally stayed in App.tsx
 * because they reach into the export-feedback domain; setExportFeedback now
 * arrives as a param (same binding pattern as useRampEditing).
 *
 * None of these are persisted and none are part of a palette's identity. The
 * custom sprites and the selected key DO get serialized into a saved palette
 * payload (read back by useSavedPalettesActions' palette-load handler), but
 * the importer draft/drag fields (text/name/error/dragging) are purely
 * ephemeral UI.
 */

// Custom sprite entries share the built-in sprite shape: a name, a pattern
// of digit-rows, and the shade count the pattern indexes into.
type SpriteEntry = { name: string; pattern: string[]; numShades: number };

interface UseSpriteImportParams {
  setExportFeedback: (v: string) => void;
}

export function useSpriteImport({ setExportFeedback }: UseSpriteImportParams) {
  const [spriteKey, setSpriteKey] = useState('vase');
  const [customSprites, setCustomSprites] = useState<Record<string, SpriteEntry>>({});
  const [showSpriteImporter, setShowSpriteImporter] = useState(false);
  const [spriteImportText, setSpriteImportText] = useState('');
  const [spriteImportName, setSpriteImportName] = useState('');
  const [spriteImportError, setSpriteImportError] = useState('');
  const [spriteDragging, setSpriteDragging] = useState(false);

  const spriteLibrary: Record<string, SpriteEntry> = useMemo(() => ({ ...DEFAULT_SPRITE_LIBRARY, ...customSprites }), [customSprites]);

  const handleSpriteFile = (file: File | null) => {
    if (!file) return;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    if (!spriteImportName.trim()) setSpriteImportName(baseName);
    const reader = new FileReader();
    reader.onload = (e) => { setSpriteImportText(e.target?.result as string); setSpriteImportError(''); };
    reader.onerror = () => setSpriteImportError('Failed to read file');
    reader.readAsText(file);
  };

  const handleSpriteDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setSpriteDragging(true); };
  const handleSpriteDragLeave = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setSpriteDragging(false); };
  const handleSpriteDrop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setSpriteDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleSpriteFile(file);
  };

  const importSprite = () => {
    setSpriteImportError('');
    if (!spriteImportName.trim()) { setSpriteImportError('Please give your sprite a name'); return; }
    const parsed = parsePiskelC(spriteImportText);
    if (!parsed) { setSpriteImportError('Could not parse. Paste the full C array text'); return; }
    const key = spriteImportName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if ((DEFAULT_SPRITE_LIBRARY as Record<string, unknown>)[key]) { setSpriteImportError('Name conflicts with built-in sprite'); return; }
    setCustomSprites(prev => ({
      ...prev,
      [key]: { name: spriteImportName.trim(), pattern: parsed.pattern, numShades: parsed.numShades }
    }));
    setSpriteKey(key);
    setSpriteImportText(''); setSpriteImportName('');
    setShowSpriteImporter(false);
    setExportFeedback(`Imported ${parsed.width}×${parsed.height}, ${parsed.numShades} shades`);
    setTimeout(() => setExportFeedback(''), 3000);
  };

  const removeCustomSprite = (key: string) => {
    setCustomSprites(prev => { const n = { ...prev }; delete n[key]; return n; });
    if (spriteKey === key) setSpriteKey('vase');
  };

  const copySpriteSource = (key: string) => {
    const sprite = spriteLibrary[key];
    if (!sprite || !sprite.pattern) return;
    const width = sprite.pattern[0].length;
    const height = sprite.pattern.length;
    const lines: string[] = [];
    lines.push('=== PIXEL.PAL SPRITE EXPORT ===');
    lines.push(`name: ${sprite.name}`);
    lines.push(`size: ${width}x${height}`);
    lines.push(`shades: ${sprite.numShades}`);
    lines.push('pattern:');
    sprite.pattern.forEach(row => lines.push(row));
    lines.push('=== END SPRITE ===');
    const text = lines.join('\n');
    const tryCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setExportFeedback('Sprite source copied!');
      } catch {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setExportFeedback('Sprite source copied!');
        } catch {
          setExportFeedback('Copy failed: check console');
          console.log(text);
        }
      }
      setTimeout(() => setExportFeedback(''), 2500);
    };
    tryCopy();
  };

  return {
    spriteKey, setSpriteKey, customSprites, setCustomSprites,
    showSpriteImporter, setShowSpriteImporter,
    spriteImportText, setSpriteImportText,
    spriteImportName, setSpriteImportName,
    spriteImportError, setSpriteImportError,
    spriteDragging, setSpriteDragging,
    spriteLibrary,
    handleSpriteFile, handleSpriteDragOver, handleSpriteDragLeave, handleSpriteDrop,
    importSprite, removeCustomSprite, copySpriteSource,
  };
}
