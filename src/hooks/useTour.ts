import { useState } from 'react';

/**
 * Tour UI state: which guide is open, current step, and the help-launcher
 * toggle. Pure UI state — the tour's snapshot/restore/start/exit orchestration
 * lives in App.tsx because it spans multiple other domains (mode, panels,
 * AI settings, compare). Those functions call these setters via App.tsx's
 * destructured bindings.
 */
export function useTour() {
  const [tourOpen, setTourOpen] = useState(false);
  const [tourGuideId, setTourGuideId] = useState(null);
  const [tourStep, setTourStep] = useState(0);
  const [launcherOpen, setLauncherOpen] = useState(false);
  return { tourOpen, setTourOpen, tourGuideId, setTourGuideId, tourStep, setTourStep, launcherOpen, setLauncherOpen };
}
