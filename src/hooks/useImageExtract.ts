import { useState } from 'react';

/**
 * Image-extract panel state: the uploaded image, requested color count,
 * load/error flags, drag + eyedropper UI, zoom, natural dimensions, and the
 * hovered eyedropper color. The upload/extract/eyedropper HANDLERS and the
 * mode-scoped paste effect live in App.tsx (wiring layer) because they write
 * document state (baseColors) and read the input `mode`.
 */
export function useImageExtract() {
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageColorCount, setImageColorCount] = useState(4);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [eyedropperActive, setEyedropperActive] = useState(false);
  // Image zoom for eyedropper precision. Integer multipliers ONLY because we
  // use image-rendering: pixelated to display at the scaled size. The
  // underlying image data is never resampled, so no new colors are invented.
  // The eyedropper math already maps mouse coords back to naturalWidth /
  // naturalHeight via getBoundingClientRect, so zoom changes display only.
  // Note: 1x means CSS max-h-48 (192px) applies; >1x removes the cap and
  // explicitly sets width=naturalWidth*zoom so the scroll container can size
  // correctly.
  const [imageZoom, setImageZoom] = useState(1);
  // naturalWidth/Height of the loaded image. Captured in the img's onLoad
  // and used to compute display width when zoom > 1. Stored in state rather
  // than a ref because we need re-renders to pick up the new value when the
  // user uploads a different image. Defaults to 0 so the conditional in the
  // img style waits until the image actually loads.
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [hoveredColor, setHoveredColor] = useState(null);
  return {
    imageDataUrl, setImageDataUrl, imageColorCount, setImageColorCount,
    imageLoading, setImageLoading, imageError, setImageError,
    isDragging, setIsDragging, eyedropperActive, setEyedropperActive,
    imageZoom, setImageZoom, imageNaturalSize, setImageNaturalSize,
    hoveredColor, setHoveredColor,
  };
}
