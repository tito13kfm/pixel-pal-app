import { useState, useMemo } from 'react';
import { DEFAULT_SPRITE_LIBRARY } from '../lib/constants';

/**
 * Sprite preview state: the selected built-in/custom sprite key, the custom
 * sprite library, and the importer panel's draft/drag fields. `spriteLibrary`
 * merges built-ins with custom imports. The import/drag/remove HANDLERS live
 * in App.tsx (wiring layer) because some reach into the export-feedback domain.
 *
 * None of these are persisted and none are part of a palette's identity. The
 * custom sprites and the selected key DO get serialized into a saved palette
 * payload (read back by the palette-load handler in App.tsx), but the importer
 * draft/drag fields (text/name/error/dragging) are purely ephemeral UI.
 */
export function useSpriteImport() {
  const [spriteKey, setSpriteKey] = useState('vase');
  const [customSprites, setCustomSprites] = useState({});
  const [showSpriteImporter, setShowSpriteImporter] = useState(false);
  const [spriteImportText, setSpriteImportText] = useState('');
  const [spriteImportName, setSpriteImportName] = useState('');
  const [spriteImportError, setSpriteImportError] = useState('');
  const [spriteDragging, setSpriteDragging] = useState(false);

  const spriteLibrary = useMemo(() => ({ ...DEFAULT_SPRITE_LIBRARY, ...customSprites }), [customSprites]);

  return {
    spriteKey, setSpriteKey, customSprites, setCustomSprites,
    showSpriteImporter, setShowSpriteImporter,
    spriteImportText, setSpriteImportText,
    spriteImportName, setSpriteImportName,
    spriteImportError, setSpriteImportError,
    spriteDragging, setSpriteDragging,
    spriteLibrary,
  };
}
