import { WORD_POOL } from './constants';
import { hslToHex } from './color';

export const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const buildRandomDescription = (): string => {
  const patterns = [
    () => `${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => pickRandom(WORD_POOL.scenes),
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.scenes)}`,
  ];
  return pickRandom(patterns)();
};

export const buildRandomHex = (): string => {
  const hue = Math.floor(Math.random() * 360);
  const sat = 55 + Math.floor(Math.random() * 40);
  const light = 35 + Math.floor(Math.random() * 25);
  return hslToHex({ h: hue, s: sat, l: light });
};
