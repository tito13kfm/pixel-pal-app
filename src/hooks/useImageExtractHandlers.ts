// Stateful wrapper owning the From Image extraction handlers (#113).
//
// Extracted from App.tsx: upload/decode/extract (file picker, drag-drop,
// paste), the re-extract path for the color-count slider, and the
// eyedropper (pixel picking, hover preview, click-to-add-base).
//
// Document state (baseColors / aiColorNames / shuffleSeed) flows through
// the Zustand-backed usePaletteState() like useRampEditing does; the
// From Image panel state arrives from useImageExtract() via params, and
// the cross-domain callbacks (tagNextLabel, resetPaletteState,
// bumpShuffleSeed) are bound by App.tsx. Owns no state of its own.
import { useEffect } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import { usePaletteState } from './usePaletteState';
import { extractDominantColors } from '../lib/image-extract';
import { rgbToHex } from '../lib/color';

interface UseImageExtractHandlersParams {
  // Input mode tab ('color' | 'image'); gates drag-drop and paste.
  mode: string;

  // useImageExtract() state (App.tsx destructures the hook and passes through).
  imageDataUrl: string | null;
  setImageDataUrl: (v: string | null) => void;
  imageColorCount: number;
  setImageLoading: (v: boolean) => void;
  setImageError: (v: string) => void;
  setIsDragging: (v: boolean) => void;
  eyedropperActive: boolean;
  setImageZoom: (v: number) => void;
  setImageNaturalSize: (v: { width: number; height: number }) => void;
  setHoveredColor: (v: string | null) => void;

  // Cross-domain callbacks bound by App.tsx.
  tagNextLabel: (label: string) => void;
  resetPaletteState: () => void;
  bumpShuffleSeed: () => void;
}

export function useImageExtractHandlers(p: UseImageExtractHandlersParams) {
  const {
    mode, imageDataUrl, setImageDataUrl, imageColorCount,
    setImageLoading, setImageError, setIsDragging, eyedropperActive,
    setImageZoom, setImageNaturalSize, setHoveredColor,
    tagNextLabel, resetPaletteState, bumpShuffleSeed,
  } = p;
  const { baseColors, setBaseColors, setAiColorNames, setShuffleSeed } = usePaletteState();

  const handleImageUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setImageError('Please upload an image file'); return; }
    setImageLoading(true); setImageError(''); setAiColorNames([]);
    // Reset zoom and naturalSize so the new image starts at 1x and the
    // onLoad handler captures fresh dimensions.
    setImageZoom(1);
    setImageNaturalSize({ width: 0, height: 0 });
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImageDataUrl(dataUrl);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 150;
          const scale = img.width > maxDim || img.height > maxDim ? Math.min(maxDim / img.width, maxDim / img.height) : 1;
          const w = Math.max(1, Math.floor(img.width * scale));
          const h = Math.max(1, Math.floor(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          // A null context lands in the catch below, same net effect as the
          // TypeError the old untyped code would have thrown.
          if (!ctx) throw new Error('2d context unavailable');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const colors = extractDominantColors(imageData, imageColorCount);
          if (colors.length === 0) { setImageError('No colors found'); setImageLoading(false); return; }
          const finalColors = colors.slice(0, imageColorCount);
          tagNextLabel('Extract from image');
          setBaseColors(finalColors);
          setAiColorNames(finalColors.map((_, i) => `Color ${i + 1}`));
          resetPaletteState();
          setShuffleSeed(s => s + 1);
          setImageLoading(false);
        } catch (err) { setImageError('Failed: ' + (err as Error).message); setImageLoading(false); }
      };
      img.onerror = () => { setImageError('Failed to load'); setImageLoading(false); };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const reExtractFromImage = () => {
    if (!imageDataUrl) return;
    setImageLoading(true); setImageError('');
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 150;
        const scale = img.width > maxDim || img.height > maxDim ? Math.min(maxDim / img.width, maxDim / img.height) : 1;
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2d context unavailable');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const colors = extractDominantColors(imageData, imageColorCount);
        if (colors.length === 0) { setImageError('No colors found'); setImageLoading(false); return; }
        const finalColors = colors.slice(0, imageColorCount);
        tagNextLabel('Re-extract from image');
        setBaseColors(finalColors);
        setAiColorNames(finalColors.map((_, i) => `Color ${i + 1}`));
        resetPaletteState();
        setShuffleSeed(s => s + 1);
        setImageLoading(false);
      } catch (err) { setImageError('Failed: ' + (err as Error).message); setImageLoading(false); }
    };
    img.onerror = () => { setImageError('Failed to load'); setImageLoading(false); };
    img.src = imageDataUrl;
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); if (mode === 'image') setIsDragging(true); };
  const handleDragLeave = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (mode !== 'image') return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageUpload(file);
  };

  // Paste-to-upload: on the From Image tab, Ctrl/Cmd+V with an image on the
  // clipboard feeds the same upload path as the file picker.
  useEffect(() => {
    const pasteHandler = (e: ClipboardEvent) => {
      if (mode !== 'image') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { handleImageUpload(file); break; }
        }
      }
    };
    if (mode === 'image') {
      window.addEventListener('paste', pasteHandler);
      return () => window.removeEventListener('paste', pasteHandler);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [mode]);

  const getPixelColorFromImage = (event: MouseEvent<HTMLImageElement>) => {
    if (!imageDataUrl) return null;
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const naturalX = Math.floor((x / rect.width) * img.naturalWidth);
    const naturalY = Math.floor((y / rect.height) * img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    try {
      const data = ctx.getImageData(naturalX, naturalY, 1, 1).data;
      return { hex: rgbToHex(data[0], data[1], data[2]), alpha: data[3] };
    } catch { return null; }
  };

  const handleImageHover = (event: MouseEvent<HTMLImageElement>) => {
    if (!eyedropperActive) return;
    const result = getPixelColorFromImage(event);
    if (result && result.alpha > 0) setHoveredColor(result.hex);
  };

  const handleImageLeave = () => setHoveredColor(null);

  const handleImageClick = (event: MouseEvent<HTMLImageElement>) => {
    if (!eyedropperActive) return;
    const result = getPixelColorFromImage(event);
    if (!result || result.alpha < 128) return;
    if (!baseColors.some(h => h.toLowerCase() === result.hex.toLowerCase())) {
      tagNextLabel('Eyedropper add');
      setBaseColors(prev => [...prev, result.hex]);
      setAiColorNames(prev => {
        const padded = [...prev];
        while (padded.length < baseColors.length) padded.push('');
        padded.push('Eyedropper');
        return padded;
      });
      // Non-reset path: respect lockedRamps. New ramp (just appended) is
      // unlocked by default, so it'll receive the offset bump like any
      // other unlocked ramp.
      bumpShuffleSeed();
    }
  };

  return {
    handleImageUpload, reExtractFromImage,
    handleDragOver, handleDragLeave, handleDrop,
    handleImageHover, handleImageLeave, handleImageClick,
  };
}
