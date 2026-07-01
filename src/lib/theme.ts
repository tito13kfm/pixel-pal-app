// src/lib/theme.ts
export type ThemeName = 'dark' | 'neutral' | 'light';

// Theme token map. Centralizes every theme-aware className and color
// value used by the chrome. The principle: section accent hues
// (cyan/pink/yellow/green/purple) stay recognizable across all three
// themes, but their lightness/saturation are adjusted so they remain
// legible against the corresponding background and don't vibrate.
//
// Color data (swatches, sprites, harmony swatches, mosaic, chromatic plot
// dots) is NEVER themed because those are the data being judged. Only
// chrome adapts.
//
// Each token returns a Tailwind className string or a raw CSS value. We
// use raw values for inline styles where we need rgba alpha or computed
// shadows that Tailwind can't easily express.
export interface ThemeTokens {
  pageBg: string;
  showVaporwave: boolean;
  crtIntensity: string;
  cardBgCyan: string;
  cardBgPink: string;
  cardBgPinkBright: string;
  cardBgYellow: string;
  cardBgGreen: string;
  cardBgViz: string;
  titleGlow: string;
  titleColor: string;
  subtitleColor: string;
  subtitleGlow: string;
  glowStrong: number;
  bodyText: string;
  mutedText: string;
  inputBg: string;
  inputTextCyan: string;
  inputTextPink: string;
  inputTextYellow: string;
  controlBtnDefault: string;
  controlBtnHover: string;
  controlPanelBg: string;
  controlPanelBorder: string;
  alertInfoBg: string;
  alertInfoText: string;
  alertInfoBorder: string;
  alertWarnBg: string;
  alertWarnText: string;
  alertWarnBorder: string;
  alertErrorBg: string;
  alertErrorText: string;
  alertErrorBorder: string;
  alertVisionBg: string;
  alertVisionText: string;
  alertVisionBorder: string;
  tipPanelBg: string;
  tipPanelBorder: string;
  tipPanelText: string;
  tipPanelStrong: string;
  panelBg: string;
  panelBorder: string;
  panelBgStrong: string;
  panelTextInactive: string;
  panelHoverBg: string;
  swatchHex: string;
  swatchLabel: string;
  colorNameText: string;
  vizRingStroke: string;
  vizSpokeStroke: string;
  vizAxisLabel: string;
  vizDataBorder: string;
  vignette: string;
}

export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
  dark: {
    pageBg: 'linear-gradient(180deg, #1a0033 0%, #2d0052 30%, #ff006e 100%)',
    showVaporwave: true,
    crtIntensity: 'rgba(0,0,0,0.15)',
    cardBgCyan: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(45, 0, 82, 0.85) 100%)',
    cardBgPink: 'linear-gradient(135deg, rgba(255, 0, 110, 0.3) 0%, rgba(45, 0, 82, 0.85) 100%)',
    cardBgPinkBright: 'linear-gradient(135deg, rgba(45, 0, 82, 0.85) 0%, rgba(255, 0, 110, 0.4) 100%)',
    cardBgYellow: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(80, 0, 120, 0.5) 100%)',
    cardBgGreen: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(0, 80, 80, 0.5) 100%)',
    cardBgViz: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(80, 0, 120, 0.5) 100%)',
    titleGlow: '3px 3px 0 #ff006e, 6px 6px 0 #00ffff, 9px 9px 20px rgba(255, 0, 255, 0.5)',
    titleColor: '#ffffff',
    subtitleColor: '#67e8f9',
    subtitleGlow: '0 0 8px #00ffff',
    glowStrong: 1.0,
    bodyText: 'text-cyan-200',
    mutedText: 'text-cyan-100/80',
    inputBg: 'bg-black/60',
    inputTextCyan: 'text-cyan-200',
    inputTextPink: 'text-pink-200',
    inputTextYellow: 'text-yellow-100',
    // Control button tokens (controlBtnDefault / controlBtnHover):
    // Tailwind className strings for the UNSELECTED state of segmented-
    // control buttons (Shades, Preview Sprite, Ramp Export style, etc).
    // Applied as `${t.controlBtnDefault} ${t.controlBtnHover}` together.
    // The SELECTED state is hardcoded `bg-cyan-300 text-purple-900
    // border-cyan-100` at every callsite and works across themes
    // unchanged. Earlier versions hardcoded `bg-purple-900/60 text-cyan-
    // 200 border-purple-700/50 hover:bg-purple-800/60`; this is fine on
    // dark but reads as dark-purple islands floating on gray / cream
    // backgrounds in Neutral and Light. Centralized here.
    controlBtnDefault: 'bg-purple-900/60 text-cyan-200 border-purple-700/50',
    controlBtnHover: 'hover:bg-purple-800/60',
    // controlPanelBg: backing for the container that wraps a group of
    // segmented control buttons (e.g. the small rounded box around the
    // Ramp Export Punchy/Balanced/Muted toggle). Same theme-adaptation
    // rationale as controlBtnDefault.
    controlPanelBg: 'bg-purple-900/40',
    controlPanelBorder: 'border-cyan-700/50',
    // Alert / info box tokens. The pre-token codebase used patterns
    // like `bg-cyan-900/20 text-cyan-200` for info boxes (computing,
    // confirm-required, etc), `bg-yellow-900/20 text-yellow-200` for
    // warnings, and `bg-pink-900/30 text-pink-100` / `bg-red-900/30
    // text-red-100` for vision text and errors. These dark-color-over-
    // dark-bg patterns produce <2:1 contrast on Light theme because the
    // alpha lets the cream pageBg show through; the dark text on the
    // resulting muddy-tan composite is unreadable. Tokens below give
    // each theme a readable equivalent: Dark keeps the original
    // dark-color-tint look, Neutral and Light flip to light tint with
    // dark text.
    alertInfoBg: 'bg-cyan-900/20',
    alertInfoText: 'text-cyan-200',
    alertInfoBorder: 'border-cyan-400/60',
    alertWarnBg: 'bg-yellow-900/20',
    alertWarnText: 'text-yellow-200',
    alertWarnBorder: 'border-yellow-400/60',
    alertErrorBg: 'bg-red-900/40',
    alertErrorText: 'text-pink-200',
    alertErrorBorder: 'border-red-500/50',
    alertVisionBg: 'bg-pink-900/30',
    alertVisionText: 'text-pink-100',
    alertVisionBorder: 'border-pink-500/50',
    tipPanelBg: 'rgba(0,0,0,0.5)',
    tipPanelBorder: 'rgba(0, 255, 255, 0.3)',
    tipPanelText: 'text-cyan-100',
    tipPanelStrong: 'text-pink-300',
    // panelBg / panelBorder: backing color for control-panel containers
    // (theme switcher, CVD selector, hardware lock bar, GPL style bar).
    // These were previously hardcoded as either inline rgba expressions
    // gated on `glowStrong > 0.5` or as Tailwind `bg-black/30` classes.
    // Centralized here so Light mode can have a SOLID backing (the Jazz
    // pattern would otherwise show through and clutter UI controls), and
    // Dark/Neutral retain their previous semi-transparent look.
    panelBg: 'rgba(0, 0, 0, 0.4)',
    panelBorder: 'rgba(0, 255, 255, 0.4)',
    // panelBgStrong: a slightly darker backing used by the hardware-lock
    // bar and the .gpl style bar (which used to be `bg-black/30`). Kept
    // distinct from `panelBg` so Dark and Neutral preserve their prior
    // visual contrast between the top-of-page selectors (theme + CVD)
    // and the bottom-of-page export bars (hardware lock + GPL style).
    // In Light, both `panelBg` and `panelBgStrong` are solid white since
    // any translucency lets the Jazz pattern bleed through UI controls.
    // These bars carry accent borders (`border-yellow-500/40` and
    // `border-cyan-500/40`) which are intentional vaporwave coloring;
    // they are NOT replaced by a panel token, just the backing color is.
    panelBgStrong: 'rgba(0, 0, 0, 0.3)',
    // Inactive panel-button text + hover. Used by the top-header theme
    // switcher and CVD selector. Per-theme so the inactive label stays
    // legible against panelBg (WCAG AA 3:1 for UI components).
    panelTextInactive: 'text-cyan-200',
    panelHoverBg: 'hover:bg-purple-800/60',
    // Swatch caption colors (hex code under each swatch, and the small
    // shade label like "outline" / "shadow"). These appear directly on
    // the page background between swatches, so they need explicit theme
    // colors rather than relying on the CSS injection hack.
    swatchHex: '#a5f3fc', // text-cyan-200
    swatchLabel: 'rgba(249, 168, 212, 0.9)', // text-pink-300/90
    // Color name under sprite previews (e.g. "COLOR 1") sits on the
    // sprite preview background, which is the brightest ramp shade at
    // 70% alpha. In dark mode that's a dark mix so light text reads; in
    // light/neutral it's a lighter mix so dark text reads better.
    colorNameText: '#a5f3fc', // text-cyan-200
    // Visualization chrome tokens. The chromatic plot, mosaic, lightness
    // distribution bar, and the small thumbnail strips on classic and
    // saved palettes all used hardcoded `rgba(255,255,255,0.x)` colors
    // for their background rings, hue spokes, axis labels, and data-cell
    // seam borders. On Light and Neutral themes those colors are
    // white-on-white-ish and effectively invisible. Centralized here so
    // each theme picks values that read against its own background.
    // section header buttons. The Tailwind `hover:bg-white/N` class is
    // theme-naive (white-on-light is invisible), so the callsites pick
    // `hover:bg-white/5` for dark and `hover:bg-black/5` for light/neutral
    // via the `glowStrong > 0.5` test, parallel to how other chrome
    // adapts.
    vizRingStroke: 'rgba(255,255,255,0.12)',
    vizSpokeStroke: 'rgba(255,255,255,0.08)',
    vizAxisLabel: 'rgba(255,255,255,0.55)',
    vizDataBorder: 'rgba(255,255,255,0.1)',
    // vignette: a CSS box-shadow value applied as `boxShadow` to the
    // root container. Dark mode already has the vaporwave grid and
    // CRT scanlines for depth, so no vignette is added on top of that.
    vignette: 'none',
  },
  neutral: {
    // Neutral theme design intent (2026-05-24 redesign):
    // The entire UI surface (page bg AND card backings) reads as ~18%
    // gray (Munsell N5, the photographer's middle-gray reference).
    // Cards distinguish from page only by their accent-colored borders,
    // not by value. This preserves the "neutral gray reference for
    // judging colors" property across the whole UI surface, not just
    // any one piece of it.
    //
    // Text on cards is LIGHT (off-white to white), giving the same
    // visual weight as text-cyan-200 on dark theme, just without
    // color. Section header ACCENT text uses LIGHT-tint variants of
    // each section color (pink-100, cyan-100, etc.) so headers pop on
    // the gray card while keeping section identity color. BORDERS on
    // section cards use DARK-tint variants of the same accents so the
    // card edge crisply outlines against the gray page. See
    // themedAccent vs themedAccentBorder.
    //
    // Previously this theme used dark text on gray, which read as
    // heavy and dark across the page. Inverting it gives the cards
    // the same visual rhythm as dark theme (light text on
    // medium-value surface) while preserving the neutral-gray
    // reference property.
    pageBg: '#777777',
    showVaporwave: false,
    crtIntensity: 'rgba(0,0,0,0.06)',
    // Cards are 18% gray. The gradient is a very subtle ~5% lightness
    // variance to give cards a slight 3D feel without disrupting the
    // gray-reference property. Midpoint is 18% gray (#777777).
    cardBgCyan: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
    cardBgPink: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
    cardBgPinkBright: 'linear-gradient(135deg, #7e7e7e 0%, #707070 100%)',
    cardBgYellow: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
    cardBgGreen: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
    cardBgViz: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
    titleGlow: '2px 2px 0 rgba(0,0,0,0.4), 4px 4px 12px rgba(0,0,0,0.3)',
    // Title and subtitle sit on the page bg (#5a5a5a). White/off-white
    // for legibility.
    titleColor: '#fafafa',
    subtitleColor: '#e4e4e7',
    subtitleGlow: 'none',
    glowStrong: 0.3,
    // Body text is white-ish on 18% gray cards. Same visual feel as
    // dark theme's text-cyan-200 on purple, just no color.
    bodyText: 'text-zinc-50',
    mutedText: 'text-zinc-200',
    inputBg: 'bg-black/40',
    inputTextCyan: 'text-zinc-50',
    inputTextPink: 'text-zinc-50',
    inputTextYellow: 'text-zinc-50',
    // Control button tokens. Updated for light-text-on-darker-control
    // pattern: the unselected button is darker than the card so it
    // reads as inset.
    controlBtnDefault: 'bg-zinc-800/50 text-zinc-50 border-zinc-700/60',
    controlBtnHover: 'hover:bg-zinc-800/70',
    controlPanelBg: 'bg-zinc-800/30',
    controlPanelBorder: 'border-zinc-700/60',
    // Alert tokens stay light-tint-with-dark-text since the alert backings
    // are intentionally tinted (info-cyan, warn-yellow, error-red, etc.)
    // and the tinted background reads more strongly than a gray one.
    alertInfoBg: 'bg-cyan-100/70',
    alertInfoText: 'text-cyan-900',
    alertInfoBorder: 'border-cyan-700/60',
    alertWarnBg: 'bg-yellow-100/70',
    alertWarnText: 'text-yellow-900',
    alertWarnBorder: 'border-yellow-700/60',
    alertErrorBg: 'bg-red-100/70',
    alertErrorText: 'text-red-900',
    alertErrorBorder: 'border-red-700/60',
    alertVisionBg: 'bg-pink-100/70',
    alertVisionText: 'text-pink-900',
    alertVisionBorder: 'border-pink-700/60',
    tipPanelBg: 'rgba(0, 0, 0, 0.5)',
    tipPanelBorder: 'rgba(0, 0, 0, 0.3)',
    tipPanelText: 'text-zinc-50',
    tipPanelStrong: 'text-zinc-100',
    // Panel tokens for control-panel containers (theme switcher, CVD,
    // hardware lock bar, GPL style bar). Darker than cards so they
    // read as inset bars.
    panelBg: 'rgba(0, 0, 0, 0.4)',
    panelBorder: 'rgba(0, 0, 0, 0.3)',
    panelBgStrong: 'rgba(0, 0, 0, 0.5)',
    // Inactive panel-button text + hover. panelBg here composites to a
    // dark grey (rgba(0,0,0,0.4) over the #707070 grey gradient) so a
    // dark text like zinc-700 was effectively invisible (ratio ~1.05).
    // Use light text to clear WCAG AA 3:1.
    panelTextInactive: 'text-zinc-100',
    panelHoverBg: 'hover:bg-zinc-700/60',
    // Swatch caption tokens: hex code and shade label under each
    // swatch sit on the card backing (~#777777 18% gray). Light
    // off-white for legibility, slightly less bright for the secondary
    // shade label.
    swatchHex: '#fafafa',
    swatchLabel: '#d4d4d8',
    // Color name (e.g. "COLOR 1") under sprite previews sits on
    // the brightest ramp shade at 70% alpha. Light text reads on
    // most palettes since the brightest shade is usually highlight-
    // bright. (Same constraint as dark theme; this token isn't
    // theme-conditional in practice but the value matches the
    // theme's "light text" intent.)
    colorNameText: '#fafafa',
    // Viz chrome tokens. Same approximate values as before but
    // re-tuned slightly for the darker (still gray) page bg and
    // light-on-gray card text. Light gray strokes against the
    // medium-gray cards.
    vizRingStroke: 'rgba(255,255,255,0.18)',
    vizSpokeStroke: 'rgba(255,255,255,0.12)',
    vizAxisLabel: 'rgba(255,255,255,0.65)',
    vizDataBorder: 'rgba(255,255,255,0.22)',
    // vignette: subtle inset shadow that darkens the edges of the root
    // container by ~10%. This is the Neutral mode "personality" touch:
    // adds depth and frame without introducing any color (Neutral is
    // the unbiased color-judgment mode, so anything that shifts
    // perceived hue or chroma is forbidden). The shadow is pure black
    // alpha and lives at the page edges only, well away from the
    // central palette region where color decisions get made.
    vignette: 'inset 0 0 120px 20px rgba(0, 0, 0, 0.2)',
  },
  light: {
    // Light mode page background: cream cup ground (#f4f1ea) with a
    // tiling SVG pattern in the 1992 Solo "Jazz" cup idiom: scattered
    // teal brush-stroke swooshes (the iconic mark) at varied rotations,
    // smaller magenta zigzag squiggles in the gaps, and confetti dots
    // in both colors. Marks near tile edges are duplicated on the
    // opposite edge so the pattern reads continuously across CSS
    // tile boundaries (no visible grid). Medium density: roughly 8
    // teal swooshes + 7 magenta squiggles + 14 confetti dots per
    // 240x240 tile, with the cream ground still reading as the
    // dominant value.
    //
    // Every card uses solid white-ish cardBg* gradients to wall the
    // pattern out, so color swatches always render on a flat backing
    // (see "Critical constraint" in the handoff item-G sketch).
    //
    // SVG is inline as a data URI (~5.3KB url-encoded). The earlier
    // version was ~2.1KB but read as random lines rather than the
    // intended Jazz cup; the larger size buys the recognizable
    // gesture vocabulary (curved brush swooshes vs straight zigzags)
    // and the edge-wrapping needed to hide the tile grid. No
    // architectural limit here, browsers handle data URIs of any
    // reasonable size; just heavier than the prior version.
    //
    // To edit: regenerate from gen_jazz.py (in /home/claude/work
    // during sessions, kept around as a tooling artifact). Single
    // quotes are SVG attribute quotes; the outer double quotes wrap
    // the url() arg; `#` must be encoded as `%23` since # ends a URL
    // fragment in CSS.
    pageBg: `#f4f1ea url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><path d='M131.9,133.2 Q142.5,115 153.1,125.4 Q163.7,135.8 174.2,117.6' stroke='%231fb5ab' stroke-width='4.7' stroke-linecap='round' fill='none' transform='rotate(69.5 153.1 125.4)'/><path d='M184,90.2 Q194.3,72.5 204.6,82.6 Q214.9,92.7 225.2,75' stroke='%231fb5ab' stroke-width='4.5' stroke-linecap='round' fill='none' transform='rotate(-39.2 204.6 82.6)'/><path d='M167.6,202.5 C179.9,219.9 192.3,199 204.6,216.4' stroke='%231fb5ab' stroke-width='4.4' stroke-linecap='round' fill='none' transform='rotate(-15 186.1 209.5)'/><path d='M49.3,6.2 C60.2,21.5 71.1,3.1 82.1,18.5' stroke='%231fb5ab' stroke-width='3.9' stroke-linecap='round' fill='none' transform='rotate(43.8 65.7 12.3)'/><path d='M49.3,246.2 C60.2,261.5 71.1,243.1 82.1,258.5' stroke='%231fb5ab' stroke-width='3.9' stroke-linecap='round' fill='none' transform='rotate(43.8 65.7 252.3)'/><path d='M94.5,65.9 C104.4,79.8 114.3,63.1 124.1,77' stroke='%231fb5ab' stroke-width='3.5' stroke-linecap='round' fill='none' transform='rotate(-11.2 109.3 71.4)'/><path d='M5,195.3 C14.2,208.3 23.4,192.8 32.6,205.7' stroke='%231fb5ab' stroke-width='3.3' stroke-linecap='round' fill='none' transform='rotate(27.1 18.8 200.5)'/><path d='M245,195.3 C254.2,208.3 263.4,192.8 272.6,205.7' stroke='%231fb5ab' stroke-width='3.3' stroke-linecap='round' fill='none' transform='rotate(27.1 258.8 200.5)'/><path d='M-38.5,6.2 C-27.7,21.3 -17,3.1 -6.2,18.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 -22.3 12.2)'/><path d='M201.5,6.2 C212.3,21.3 223,3.1 233.8,18.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 217.7 12.2)'/><path d='M-38.5,246.2 C-27.7,261.3 -17,243.1 -6.2,258.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 -22.3 252.2)'/><path d='M201.5,246.2 C212.3,261.3 223,243.1 233.8,258.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 217.7 252.2)'/><path d='M6,141.9 C16.8,157 27.5,138.8 38.2,153.9' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(16.9 22.1 147.9)'/><path d='M246,141.9 C256.8,157 267.5,138.8 278.2,153.9' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(16.9 262.1 147.9)'/><path d='M193.4,242.9 Q197.9,233.9 202.4,242.9 Q206.9,251.9 211.4,242.9' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(-42.1 202.4 242.9)'/><path d='M193.4,2.9 Q197.9,-6.1 202.4,2.9 Q206.9,11.9 211.4,2.9' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(-42.1 202.4 2.9)'/><path d='M158.6,50.7 Q162.4,43 166.3,50.7 Q170.1,58.4 173.9,50.7' stroke='%23d24d8e' stroke-width='1.7' stroke-linecap='round' fill='none' transform='rotate(-21.6 166.3 50.7)'/><path d='M136.7,175.3 Q140.7,167.3 144.7,175.3 Q148.8,183.4 152.8,175.3' stroke='%23d24d8e' stroke-width='1.8' stroke-linecap='round' fill='none' transform='rotate(40.9 144.7 175.3)'/><path d='M198,30.8 Q202.9,21.1 207.7,30.8 Q212.6,40.6 217.5,30.8' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(31.1 207.7 30.8)'/><path d='M12,107.5 Q16.4,98.7 20.8,107.5 Q25.2,116.3 29.6,107.5' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(57.4 20.8 107.5)'/><path d='M83.8,134.9 Q88.6,125.3 93.4,134.9 Q98.2,144.5 103,134.9' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(41.5 93.4 134.9)'/><path d='M48.1,206.4 Q53.1,196.5 58.1,206.4 Q63,216.3 68,206.4' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(66.8 58.1 206.4)'/><circle cx='80' cy='205.2' r='1.3' fill='%23d24d8e'/><circle cx='81.6' cy='210.7' r='1.3' fill='%23d24d8e'/><circle cx='49.1' cy='88.4' r='1.5' fill='%23d24d8e'/><circle cx='49.5' cy='85.8' r='1.3' fill='%23d24d8e'/><circle cx='204.1' cy='136.6' r='1.3' fill='%23d24d8e'/><circle cx='204.7' cy='137.5' r='1.1' fill='%23d24d8e'/><circle cx='121.6' cy='207' r='1.5' fill='%23d24d8e'/><circle cx='126.3' cy='205.6' r='1.5' fill='%23d24d8e'/><circle cx='126.8' cy='208.2' r='1.3' fill='%23d24d8e'/><circle cx='56.3' cy='124' r='1.6' fill='%23d24d8e'/><circle cx='55.5' cy='127' r='1.5' fill='%23d24d8e'/><circle cx='160.6' cy='29.9' r='1.6' fill='%23d24d8e'/><circle cx='159.4' cy='26' r='1.1' fill='%23d24d8e'/><circle cx='160.7' cy='28.8' r='1.5' fill='%23d24d8e'/><circle cx='50.4' cy='147.7' r='1' fill='%23d24d8e'/><circle cx='50.9' cy='143.3' r='1.4' fill='%23d24d8e'/><circle cx='51.9' cy='144.3' r='1.4' fill='%23d24d8e'/><circle cx='62.3' cy='55.8' r='1.5' fill='%23d24d8e'/><circle cx='67' cy='55' r='1.5' fill='%23d24d8e'/><circle cx='66.4' cy='52.5' r='1.1' fill='%23d24d8e'/><circle cx='147.6' cy='87.1' r='1.5' fill='%231fb5ab'/><circle cx='142.3' cy='204.4' r='1.6' fill='%231fb5ab'/><circle cx='40.6' cy='31' r='1.7' fill='%231fb5ab'/><circle cx='105.9' cy='215.3' r='1.8' fill='%231fb5ab'/><circle cx='89.2' cy='189.3' r='1.7' fill='%231fb5ab'/><circle cx='86.2' cy='227.7' r='2.1' fill='%231fb5ab'/></svg>") repeat`,
    showVaporwave: false,
    crtIntensity: 'rgba(0,0,0,0.04)',
    cardBgCyan: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
    cardBgPink: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
    cardBgPinkBright: 'linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%)',
    cardBgYellow: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
    cardBgGreen: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
    cardBgViz: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
    titleGlow: '2px 2px 0 rgba(0,0,0,0.15), 4px 4px 8px rgba(0,0,0,0.1)',
    titleColor: '#1a1a1a',
    subtitleColor: '#3a3a3a',
    subtitleGlow: 'none',
    glowStrong: 0.2,
    bodyText: 'text-zinc-800',
    mutedText: 'text-zinc-600',
    inputBg: 'bg-white',
    inputTextCyan: 'text-zinc-900',
    inputTextPink: 'text-zinc-900',
    inputTextYellow: 'text-zinc-900',
    // See dark theme for full reasoning. Light uses near-white default
    // with a darker hover so the button reads as an inset control on
    // the solid white card. Border is a 25% black to match panelBorder
    // for visual cohesion.
    controlBtnDefault: 'bg-zinc-100 text-zinc-900 border-zinc-300',
    controlBtnHover: 'hover:bg-zinc-200',
    controlPanelBg: 'bg-zinc-50',
    controlPanelBorder: 'border-zinc-300',
    // Alert tokens, light theme. Solid backings (no alpha) so the Jazz
    // pattern doesn't show through and muddy the alert text. See dark
    // theme for the rationale.
    alertInfoBg: 'bg-cyan-50',
    alertInfoText: 'text-cyan-900',
    alertInfoBorder: 'border-cyan-600',
    alertWarnBg: 'bg-yellow-50',
    alertWarnText: 'text-yellow-900',
    alertWarnBorder: 'border-yellow-600',
    alertErrorBg: 'bg-red-50',
    alertErrorText: 'text-red-900',
    alertErrorBorder: 'border-red-600',
    alertVisionBg: 'bg-pink-50',
    alertVisionText: 'text-pink-900',
    alertVisionBorder: 'border-pink-600',
    tipPanelBg: '#ffffff',
    tipPanelBorder: 'rgba(0, 0, 0, 0.2)',
    tipPanelText: 'text-zinc-800',
    tipPanelStrong: 'text-zinc-900',
    // See dark theme for what these are. Light mode REQUIRES solid
    // backings on control panels: the Jazz pattern in pageBg is dense
    // enough that any translucency on a control container lets the
    // pattern show through and visually clutters the UI controls. The
    // border is slightly darker than in Neutral because it sits on
    // solid white and needs more contrast to read as a panel edge.
    panelBg: '#ffffff',
    panelBorder: 'rgba(0, 0, 0, 0.25)',
    // In Light, both panel tokens are solid white (no translucency at
    // all). See dark theme for the broader rationale.
    panelBgStrong: '#ffffff',
    // panelBg is solid white here, so a dark zinc text is fine.
    panelTextInactive: 'text-zinc-700',
    panelHoverBg: 'hover:bg-zinc-200/60',
    swatchHex: '#262626',
    swatchLabel: '#525252',
    colorNameText: '#262626',
    // See dark theme for what these viz tokens are. Light mode pushes
    // the opacity slightly higher than Neutral because the cream-with-
    // Jazz-pattern background has busy chroma in it and the rings need
    // a touch more weight to read cleanly through the pattern noise.
    vizRingStroke: 'rgba(0,0,0,0.22)',
    vizSpokeStroke: 'rgba(0,0,0,0.15)',
    vizAxisLabel: 'rgba(0,0,0,0.6)',
    vizDataBorder: 'rgba(0,0,0,0.22)',
    // Light mode already gets the Jazz pattern in pageBg as its
    // personality, so no vignette is layered on top.
    vignette: 'none',
  },
};
