// Tour orchestration (#113): start/exit, the pre-tour UI snapshot/restore,
// per-guide setup actions, and the first-visit auto-start effect.
//
// Extracted from App.tsx. The tour's own open/guide/step state lives in
// useTour (a plain state bag); this hook spans the OTHER domains a guide
// needs to stage (input mode, export/harmony/hardware/saved/viz panels,
// compare mode, CVD simulation), which is why the orchestration was long
// stuck in App.tsx. Panel
// setters arrive via params; compare state flows through the Zustand-backed
// usePaletteState(). Owns only the pre-tour snapshot ref.
import { useEffect, useRef } from 'react';
import { usePaletteState } from './usePaletteState';

interface UseTourOrchestrationParams {
  // Input mode tab + panel-layout setters the guides stage.
  mode: string;
  setMode: (v: string) => void;
  exportOpen: boolean;
  setExportOpen: (v: boolean) => void;
  hwPickerOpen: boolean;
  setHwPickerOpen: (v: boolean) => void;
  harmonyOpen: boolean;
  setHarmonyOpen: (v: boolean) => void;
  savedOpen: boolean;
  setSavedOpen: (v: boolean) => void;
  sbsOpen: boolean;
  setSbsOpen: (v: boolean) => void;
  cvdMode: string;
  setCvdMode: (v: string) => void;
  // useTour() state (App.tsx destructures the hook and passes through).
  tourGuideId: string | null;
  setTourGuideId: (v: string | null) => void;
  setTourOpen: (v: boolean) => void;
  setTourStep: (v: number) => void;
  setLauncherOpen: (v: boolean) => void;
}

// The pre-tour UI snapshot restored on exit. compareMode is store-backed;
// the rest are App-level panel/input state.
type TourSnapshot = {
  mode: string;
  exportOpen: boolean;
  hwPickerOpen: boolean;
  compareMode: boolean;
  harmonyOpen: boolean;
  savedOpen: boolean;
  sbsOpen: boolean;
  cvdMode: string;
};

export function useTourOrchestration(p: UseTourOrchestrationParams) {
  const {
    mode, setMode, exportOpen, setExportOpen, hwPickerOpen, setHwPickerOpen,
    harmonyOpen, setHarmonyOpen,
    savedOpen, setSavedOpen, sbsOpen, setSbsOpen, cvdMode, setCvdMode,
    tourGuideId, setTourGuideId, setTourOpen, setTourStep, setLauncherOpen,
  } = p;
  const { compareMode, setCompareMode, setCompareAnchor, setCompareResult } = usePaletteState();

  const tourSnapshot = useRef<TourSnapshot | null>(null);

  function handleTourMarkSeen() {
    localStorage.setItem('pixel-pal-tour-seen', '1');
  }

  const SETUP_SETTERS: Record<string, (v: boolean) => void> = {
    export: setExportOpen,
    harmony: setHarmonyOpen,
    saved: setSavedOpen,
    viz: setSbsOpen,
  };

  const runTourSetup = (setupId: string) => {
    const setter = SETUP_SETTERS[setupId];
    if (setter) setter(true);
  };

  const snapshotTourState = () => {
    tourSnapshot.current = {
      mode, exportOpen, hwPickerOpen, compareMode, harmonyOpen,
      savedOpen, sbsOpen, cvdMode,
    };
  };

  const restoreTourState = () => {
    const s = tourSnapshot.current;
    if (!s) return;
    setMode(s.mode);
    setExportOpen(s.exportOpen);
    setHwPickerOpen(s.hwPickerOpen);
    setCompareMode(s.compareMode);
    if (!s.compareMode) { setCompareAnchor(null); setCompareResult(null); }
    setHarmonyOpen(s.harmonyOpen);
    setSavedOpen(s.savedOpen);
    setSbsOpen(s.sbsOpen);
    setCvdMode(s.cvdMode);
    tourSnapshot.current = null;
  };

  const startTour = (id: string) => {
    if (!tourSnapshot.current) snapshotTourState();
    setLauncherOpen(false);
    setTourGuideId(id);
    setTourStep(0);
    setTourOpen(true);
  };

  const exitTour = () => {
    if (tourGuideId === 'onboarding') handleTourMarkSeen();
    setTourOpen(false);
    setTourGuideId(null);
    setTourStep(0);
    restoreTourState();
  };

  // First-visit auto-start: open the onboarding guide once, shortly after
  // mount, until the user finishes/dismisses it (pixel-pal-tour-seen).
  useEffect(() => {
    if (!localStorage.getItem('pixel-pal-tour-seen')) {
      setTimeout(() => { startTour('onboarding'); }, 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { startTour, exitTour, runTourSetup };
}
