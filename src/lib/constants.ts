import type { MoodPreset } from './mood';

// ---------- Sprite patterns ----------
// Sprites use a single `pattern` array. Bake your lighting into the pattern itself.
export const spriteVase = [
  '................................',
  '................................',
  '.........00000000000000.........',
  '.........00111111110000.........',
  '.........06011111100010.........',
  '..........066544443210..........',
  '...........0655443320...........',
  '...........0655443320...........',
  '..........066544443210..........',
  '........0065554444332200........',
  '......00665554444443332200......',
  '.....0666775544444433322110.....',
  '.....0667775544444433322110.....',
  '....066677555444444333322110....',
  '....066675555444444333322110....',
  '....066665555444444333322110....',
  '....066665555444444333322110....',
  '....066665555444444333322110....',
  '....066665555444444333322110....',
  '.....0666655544444433322110.....',
  '.....0666655544444433322110.....',
  '......06665554444443332210......',
  '.......066655444444332210.......',
  '........0665554444332210........',
  '.........06655444433210.........',
  '..........066544443210..........',
  '...........0655443320...........',
  '...........0655443320...........',
  '..........066544443210..........',
  '.........06655444433210.........',
  '.........00000000000000.........',
  '................................',
];

export const spriteWalkman = [
  '............0000000.............',
  '.........0007777777000..........',
  '........0077.......7700.........',
  '.......007...........700........',
  '.....0077.............7700......',
  '....007.................700.....',
  '....07...................70.....',
  '...07.....................70....',
  '...07.....................70....',
  '..05.......................50...',
  '..05.......................50...',
  '.005.......................500..',
  '.005.......................500..',
  '.01.........................10..',
  '001....00...000.000.00.00...100.',
  '001....001..00010001001001..100.',
  '01..00000000000000000000000.110.',
  '01..02222222233333333344440..10.',
  '01..02622222233333333346640..10.',
  '01..02622222333333333446640..10.',
  '0100026211111111111114466400010.',
  '0133026213130777031314466403310.',
  '0133026211010777010114466403310.',
  '0035026213130777031314444405300.',
  '.03502621111111111111444440530..',
  '.03502622222333336333444440530..',
  '.03302222226666666634444440330..',
  '.03302262223333336334444440330..',
  '.00002222223333333344444440000..',
  '...2000000000000000000000002222.',
  '....111111111111111111111111111.',
  '.......1111111111111111111111...',
];

export const spriteCassette = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..0001000000000000000000010000..',
  '..0222222222222222222222222220..',
  '..0222000000000000000000002220..',
  '..0220777777776666666666650220..',
  '..0207777007006000606000555020..',
  '..0206666666555555555554444020..',
  '..0206666000000000000004444020..',
  '..020606012210.....01110444020..',
  '..0205050202210...011010333020..',
  '..020555012210.....01110333020..',
  '..0205554000000000000003303020..',
  '..0203332222222222221111020020..',
  '..0203322222222222211111102020..',
  '..0200000000000000000000000020..',
  '..0222222222222222222222222220..',
  '..0000100001001000001001010000..',
  '..0001111111111111111111111000..',
  '..0001100111000000001110011000..',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

export const spriteDiamond = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..........000000000000..........',
  '..........000000000000..........',
  '........0011222222221100........',
  '........0011222222221100........',
  '......00223333333333442200......',
  '......00223333333333442200......',
  '....002244333333444444552200....',
  '....002244333333444444552200....',
  '....001133445544555555554400....',
  '....001133445544555555554400....',
  '....001111222233554444443300....',
  '....001111222233554444443300....',
  '......00111122334444554400......',
  '......00111122334444554400......',
  '........0011112233444400........',
  '........0011112233444400........',
  '..........001122333300..........',
  '..........001122333300..........',
  '............00112200............',
  '............00112200............',
  '..............0000..............',
  '..............0000..............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

export const DEFAULT_SPRITE_LIBRARY = {
  vase:     { name: 'Vase',     pattern: spriteVase,     numShades: 8 },
  walkman:  { name: 'Walkman',  pattern: spriteWalkman,  numShades: 8 },
  cassette: { name: 'Cassette', pattern: spriteCassette, numShades: 8 },
  diamond:  { name: 'Diamond',  pattern: spriteDiamond,  numShades: 6 },
};

// ---------- Classic palettes ----------
// Curated "inspired by" subsets of well-known pixel art palettes. Each entry
// picks 4-6 representative base colors from the canonical palette so that the
// ramp generator can build coherent ramps. These are NOT the literal
// palettes; an authentic DB16 has 16 colors but we use 6 mid-range hues that
// capture its character. The hex values themselves ARE drawn from the
// canonical palettes (sourced from lospec.com).
export const CLASSIC_PALETTES = [
  {
    id: 'db16',
    name: 'DawnBringer 16',
    tip: "Richard Fhager's beloved 16-color palette. Muted but vibrant earth tones with strong contrast. Great for fantasy and adventure.",
    // Source: https://lospec.com/palette-list/dawnbringer-16
    baseColors: ['#d04648', '#854c30', '#346524', '#597dce', '#d27d2c', '#6daa2c'],
    names: ['db16 red', 'db16 brown', 'db16 forest', 'db16 slate', 'db16 peach', 'db16 sage'],
  },
  {
    id: 'pico8',
    name: 'PICO-8',
    tip: 'The Lexaloffle fantasy console palette. Punchy, slightly-too-saturated, ready for chunky retro vibes.',
    // Source: https://lospec.com/palette-list/pico-8
    baseColors: ['#ff004d', '#ffa300', '#00e436', '#29adff', '#ff77a8', '#83769c'],
    names: ['pico red', 'pico orange', 'pico green', 'pico blue', 'pico pink', 'pico lavender'],
  },
  {
    id: 'sweetie16',
    name: 'Sweetie 16',
    tip: "GrafxKid's warm modern 16-color palette. Friendly, colorful, sits at the toy/storybook end of the spectrum.",
    // Source: https://lospec.com/palette-list/sweetie-16
    baseColors: ['#b13e53', '#ef7d57', '#a7f070', '#257179', '#3b5dc9', '#41a6f6'],
    names: ['sweetie salmon', 'sweetie peach', 'sweetie mint', 'sweetie teal', 'sweetie cobalt', 'sweetie sky'],
  },
  {
    id: 'gameboy',
    name: 'Game Boy',
    tip: 'The original DMG-01 four-shade green. Iconic, constrained, deeply nostalgic. Use when you want it to feel like 1989.',
    // Source: https://lospec.com/palette-list/nintendo-gameboy-bgb (the
    // four-shade green most pixel artists use as Game Boy reference)
    baseColors: ['#081820', '#346856', '#88c070', '#e0f8d0'],
    names: ['gb darkest', 'gb dark', 'gb light', 'gb lightest'],
  },
  {
    id: 'nes',
    name: 'Super Mario Bros (NES)',
    tip: 'Authentic NES hardware colors as used in Super Mario Bros 1-1. Mario red, the famous sky blue, pipe green, brick brown, coin gold. The 8-bit era distilled.',
    // Source: https://lospec.com/palette-list/nintendo-entertainment-system
    // Specific NES master palette indices used by SMB:
    //   $16 = Mario red (overalls/hat)
    //   $22 = SMB sky blue
    //   $1A = pipe green
    //   $17 = brick brown (also Mario's shirt, Goombas)
    //   $27 = coin gold
    baseColors: ['#a62721', '#8084fe', '#0c8500', '#864300', '#e19321'],
    names: ['mario red', 'smb sky', 'pipe green', 'brick brown', 'coin gold'],
  },
  {
    id: 'edg32',
    name: 'Endesga 32',
    tip: "Endesga's high-saturation modern game palette. Optimistic, vivid, sized for crisp pixel art.",
    // Source: https://lospec.com/palette-list/endesga-32
    baseColors: ['#a22633', '#f77622', '#feae34', '#3e8948', '#193c3e', '#124e89'],
    names: ['edg red', 'edg orange', 'edg gold', 'edg leaf', 'edg deep teal', 'edg cobalt'],
  },
  {
    id: 'cga',
    name: 'CGA (Mode 4)',
    tip: 'The eye-searing IBM CGA Mode 4 Palette 1, ca. 1981. Light cyan, light magenta, high-intensity white plus a near-black to round it out. The look of early DOS games like King\'s Quest and Maniac Mansion.',
    // Source: https://lospec.com/palette-list/color-graphics-adapter
    // High-intensity Mode 4 Palette 1 colors. The original 4-color set is
    // black/cyan/magenta/white. We use #262626 (L=14.9) instead of pure
    // black because L=0 collapses floorScale to 0 and every shade in the
    // ramp ends up #000000. #262626 reads as black to the eye but gives a
    // usable dark progression. Under Punchy 8-shade the ramp lands at
    // L=2.7 through L=89.8; under Balanced/Muted the spread is narrower.
    baseColors: ['#55ffff', '#ff55ff', '#ffffff', '#262626'],
    names: ['cga cyan', 'cga magenta', 'cga white', 'cga black'],
  },
];

// ---------- Hardware palettes for auto-quantize ----------
// These are the FULL hardware palettes (not the curated subsets in
// CLASSIC_PALETTES). Each entry's colors[] is the full set of legal hex
// values the hardware could display. The quantize function snaps any input
// hex to the nearest color in this list using HSL distance with lightness
// weighted 1.5x (lightness drift is more perceptually obvious than hue drift
// at small differences). Sources:
//   NES: NESdev wiki master palette (the 2C02 PPU palette, 54 unique colors
//     after removing the 2 black duplicates at $0D and $1D).
//   Game Boy DMG: the classic 4-shade green of the original 1989 hardware.
//   CGA: the full 16-color CGA palette (background + intensity bit).
//   EGA: the full 64-color 6-bit RGB master palette (2 bits per channel,
//     each channel value = bit_value * 85, giving levels 0x00, 0x55, 0xAA,
//     0xFF). EGA hardware could display 16 of these 64 at a time but the
//     full 64 is the legal hex set we snap against. The CGA 16-color set
//     is a strict subset of EGA 64.
//   Commodore 64: Pepto's canonical 16-color VIC-II palette (Philip
//     Timmermann's 2001 calculation, the de facto standard reference used
//     by VICE, most C64 art tools, and the Lemon64 community). The newer
//     Colodore revision exists but Pepto remains the most widely-used.
export const HARDWARE_PALETTES = [
  {
    id: 'nes',
    name: 'NES',
    description: 'Nintendo Entertainment System (2C02 PPU)',
    // Source: https://www.nesdev.org/wiki/PPU_palettes (Smooth FBX preset is
    // a commonly-cited modern reference; values rounded to 6-digit hex).
    colors: [
      '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400',
      '#503000', '#007800', '#006800', '#005800', '#004058', '#000000',
      '#bcbcbc', '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10',
      '#ac7c00', '#00b800', '#00a800', '#00a844', '#008888',
      '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8', '#f878f8', '#f85898', '#f87858', '#fca044',
      '#f8b800', '#b8f818', '#58d854', '#58f898', '#00e8d8', '#787878',
      '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8', '#f8b8f8', '#f8a4c0', '#f0d0b0', '#fce0a8',
      '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8', '#00fcfc', '#f8d8f8',
    ],
  },
  {
    id: 'gameboy',
    name: 'Game Boy',
    description: 'Original DMG four-shade green (1989)',
    // Source: lospec dmg-04 / common Game Boy reference. Real hardware
    // varied; this is the widely-used "BGB" reference set.
    colors: ['#081820', '#346856', '#88c070', '#e0f8d0'],
  },
  {
    id: 'cga16',
    name: 'CGA 16',
    description: 'Full IBM CGA 16-color palette (background + intensity)',
    // Source: https://en.wikipedia.org/wiki/Color_Graphics_Adapter
    colors: [
      '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
      '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff',
    ],
  },
  {
    id: 'ega64',
    name: 'EGA 64',
    description: 'Full IBM EGA 6-bit RGB master palette (64 colors)',
    // Source: https://moddingwiki.shikadi.net/wiki/EGA_Palette and
    // https://keyj.emphy.de/cga-ega-vga/. Each channel is 2 bits, with
    // level = bit_value * 85, giving {0x00, 0x55, 0xAA, 0xFF}. The 64
    // colors are every combination of those four levels across R, G, B.
    // EGA hardware could only display 16 at a time but artists target
    // the full 64 when designing palettes. Enumerated R-major then G-major
    // for readability; quantize doesn't care about order.
    colors: [
      '#000000', '#000055', '#0000aa', '#0000ff', '#005500', '#005555', '#0055aa', '#0055ff',
      '#00aa00', '#00aa55', '#00aaaa', '#00aaff', '#00ff00', '#00ff55', '#00ffaa', '#00ffff',
      '#550000', '#550055', '#5500aa', '#5500ff', '#555500', '#555555', '#5555aa', '#5555ff',
      '#55aa00', '#55aa55', '#55aaaa', '#55aaff', '#55ff00', '#55ff55', '#55ffaa', '#55ffff',
      '#aa0000', '#aa0055', '#aa00aa', '#aa00ff', '#aa5500', '#aa5555', '#aa55aa', '#aa55ff',
      '#aaaa00', '#aaaa55', '#aaaaaa', '#aaaaff', '#aaff00', '#aaff55', '#aaffaa', '#aaffff',
      '#ff0000', '#ff0055', '#ff00aa', '#ff00ff', '#ff5500', '#ff5555', '#ff55aa', '#ff55ff',
      '#ffaa00', '#ffaa55', '#ffaaaa', '#ffaaff', '#ffff00', '#ffff55', '#ffffaa', '#ffffff',
    ],
  },
  {
    id: 'c64',
    name: 'C64',
    description: 'Commodore 64 VIC-II 16-color palette (Pepto reference)',
    // Source: Philip "Pepto" Timmermann's 2001 calculation at
    // https://www.pepto.de/projects/colorvic/2001/, also cataloged at
    // http://fileformats.archiveteam.org/wiki/Commodore_64_color_palette.
    // Order: Black, White, Red, Cyan, Purple, Green, Blue, Yellow,
    // Orange, Brown, Light Red, Dark Grey, Medium Grey, Light Green,
    // Light Blue, Light Grey (matches C64 BASIC color codes 0-15).
    colors: [
      '#000000', '#ffffff', '#68372b', '#70a4b2', '#6f3d86', '#588d43', '#352879', '#b8c76f',
      '#6f4f25', '#433900', '#9a6759', '#444444', '#6c6c6c', '#9ad284', '#6c5eb5', '#959595',
    ],
  },
];

// ---------- Mood presets (#135) ----------
// Hand-authored genre/mood envelopes that bias the one-click generator and
// Harmonize toward a chosen feel. Curated data in the same spirit as
// HARDWARE_PALETTES: deterministic, no AI involvement. Envelopes are OKLCH
// (L 0-1, C 0-~0.32, H degrees; see src/lib/mood.ts for the clamp math).
// hueArcs are allowed hue ranges; start > end wraps through 360.
// OKLCH hue anchors for orientation: red ≈ 25°, orange ≈ 55°, yellow ≈ 100°,
// green ≈ 140°, cyan ≈ 195°, blue ≈ 264°, purple ≈ 300°, magenta ≈ 330°.
// Chroma values above the sRGB ceiling for a given hue/lightness are fine:
// everything is gamut-mapped ('auto', chroma-reducing) on the way out.
export const MOOD_PRESETS: MoodPreset[] = [
  {
    id: 'cozy-farm',
    name: 'Cozy Farm',
    tip: 'Sunlit hay, leaf, and soil warmth. Soft saturation, mid-to-light tones. For farming sims, bakeries, autumn villages.',
    hueArcs: [[30, 150]],          // warm red-orange through yellow to leaf green
    chroma: [0.04, 0.12],
    lightness: [0.45, 0.82],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    tip: 'Cyan, electric blue, purple, magenta, chroma pushed toward the gamut edge. For rain-slick megacity streets and arcade glow.',
    hueArcs: [[190, 350]],         // cyan → blue → purple → magenta
    chroma: [0.10, 0.32],
    lightness: [0.30, 0.80],
  },
  {
    id: 'gothic-horror',
    name: 'Gothic Horror',
    tip: 'Cold desaturated darks with a blood-red arc. Low chroma, low light. For crypts, manors, and things best left buried.',
    hueArcs: [[240, 320], [15, 40]], // blue-violet cold range + blood red
    chroma: [0.02, 0.08],
    lightness: [0.12, 0.50],
  },
  {
    id: 'desert',
    name: 'Sun-Bleached Desert',
    tip: 'Sand, terracotta, washed-out highs. Low chroma, high lightness. For dunes, canyons, and noon heat shimmer.',
    hueArcs: [[40, 95]],           // terracotta through sand
    chroma: [0.03, 0.11],
    lightness: [0.55, 0.90],
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    tip: 'Teal to indigo depth column. Mid chroma, dark-to-mid light. For reefs, trenches, and bioluminescent gloom.',
    hueArcs: [[180, 270]],         // teal → cyan → blue → indigo
    chroma: [0.05, 0.16],
    lightness: [0.20, 0.65],
  },
  {
    id: 'candy-pop',
    name: 'Candy Pop',
    tip: 'Any hue, bright and sweet. High chroma, high lightness. For toy shops, match-3 boards, and storybook skies.',
    hueArcs: [[0, 360]],           // full wheel
    chroma: [0.10, 0.22],
    lightness: [0.62, 0.88],
  },
];

// ---------- Randomizer pools ----------
export const WORD_POOL = {
  colorAdjectives: [
    'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'cyan', 'magenta',
    'neon', 'chrome', 'gold', 'silver', 'crimson', 'azure', 'violet', 'teal', 'amber',
    'jade', 'rose', 'cobalt', 'emerald', 'scarlet', 'indigo'
  ],
  qualityAdjectives: [
    'glitched', 'glowing', 'rusted', 'pristine', 'weathered', 'enchanted', 'frozen',
    'burning', 'mystical', 'retro', 'frosted', 'ancient', 'haunted', 'holographic',
    'digital', 'shimmering', 'distorted', 'vaporwave', 'synthwave', 'cursed', 'blessed',
    'abandoned', 'forgotten', 'ornate', 'primitive', 'twisted', 'gleaming', 'oxidized',
    'pearlescent', 'bioluminescent', 'sun-bleached', 'moss-covered', 'overgrown',
    'shattered', 'tarnished', 'polished'
  ],
  materials: [
    'wooden', 'stone', 'metal', 'iron', 'gold', 'silver', 'copper', 'crystal', 'cloth',
    'leather', 'chrome', 'neon', 'ceramic', 'brass', 'obsidian', 'jade', 'marble',
    'porcelain', 'bone', 'velvet', 'lacquered'
  ],
  nouns: [
    'apple', 'mushroom', 'flower', 'leaf', 'berry', 'pumpkin', 'gem', 'crystal', 'ruby',
    'emerald', 'sapphire', 'amethyst', 'diamond', 'sword', 'lantern', 'potion', 'fish',
    'cat', 'rabbit', 'rose', 'star', 'moon', 'cassette', 'floppy', 'palm', 'jellyfish',
    'hologram', 'salamander', 'beetle', 'kraken', 'owl', 'raven', 'koi', 'moth',
    'scorpion', 'octopus', 'fox', 'serpent', 'dragonfly', 'crow', 'wolf', 'fawn',
    'vial', 'scroll', 'compass', 'mask', 'dagger', 'banner', 'helm', 'brazier',
    'sextant', 'goblet', 'tome', 'rune', 'amulet', 'censer', 'orb', 'key'
  ],
  scenes: [
    'lighthouse at dusk', 'subway tunnel', "alchemist's bench", 'moss-covered shrine',
    'arcade cabinet', 'neon ramen stall', 'forgotten observatory', 'haunted greenhouse',
    'underwater cathedral', 'pixelated sunset over the ocean', 'rooftop antenna farm',
    'flooded library', 'pirate cove at midnight', 'cyberpunk noodle shop',
    'overgrown space station', 'witch\'s apothecary', 'desert oasis at twilight',
    'crystal cave entrance', 'abandoned theme park', 'dragon hoard chamber'
  ]
};
