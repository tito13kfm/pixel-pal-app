import { useState, useEffect } from 'react';
import { loadAIConfigAsync } from '../lib/ai';

/**
 * AI-assist REQUEST/UI state: the prompt input, in-flight/error flags, the
 * settings-panel toggle, and whether a provider is configured. The AI
 * RESULTS (color names + reasoning) are document state and live in
 * App.tsx/usePaletteState (they participate in undo/redo), NOT here. The
 * generate handlers also live in App.tsx (wiring layer) since they write
 * those results.
 */
export function useAIAssist() {
  const [aiInput, setAiInput] = useState('a holographic jellyfish');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | undefined>(undefined);

  // Check whether an AI provider is configured, once on mount.
  useEffect(() => {
    loadAIConfigAsync().then(({ config }) => {
      setAiConfigured(config !== null);
    });
  }, []);

  return { aiInput, setAiInput, aiLoading, setAiLoading, aiError, setAiError, showAISettings, setShowAISettings, aiConfigured, setAiConfigured };
}
