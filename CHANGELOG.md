# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project tries its best to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Releases prior to 0.13.0 are recorded in
> [GitHub Releases](https://github.com/tito13kfm/pixel-pal-app/releases) only.
> A fuller backfill of earlier versions into this file is planned.

## [Unreleased]

## [0.13.0] - 2026-06-02

### Added
- **Adjacency matrix** view in Visualize & Compare: every palette color paired
  with every other. Toggle between a pair-split view and a ΔE_OK perceptual
  heatmap that surfaces clashing pairs and near-duplicate colors at a glance.
  Color set switches between all unique shades and ramp bases; hover (full-size)
  reads out the exact pair and ΔE.
- **Dither-blend preview** view: the 2-color optical mix of consecutive ramp
  shades, rendered at sprite scale, with a 2×2 checkerboard / 4×4 Bayer toggle —
  the "in-between" shade you get for free when dithering.
- PNG export for both new views, alongside the existing Mosaic and Lightness
  Distribution exports. Both views also render in the side-by-side compare slots.

[Unreleased]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.13.0...HEAD
[0.13.0]: https://github.com/tito13kfm/pixel-pal-app/releases/tag/v0.13.0
