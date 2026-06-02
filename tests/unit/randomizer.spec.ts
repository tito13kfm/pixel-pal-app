import { describe, it, expect } from 'vitest';
import { pickRandom, buildRandomDescription, buildRandomHex } from '../../src/lib/randomizer';

describe('pickRandom', () => {
  it('returns the sole element of a one-item array', () => {
    expect(pickRandom(['only'])).toBe('only');
  });
  it('always returns a member of the array', () => {
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(pickRandom(arr));
  });
});

describe('buildRandomHex', () => {
  it('returns a valid #rrggbb string', () => {
    for (let i = 0; i < 50; i++) expect(buildRandomHex()).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('buildRandomDescription', () => {
  it('returns a non-empty string', () => {
    for (let i = 0; i < 50; i++) expect(buildRandomDescription().length).toBeGreaterThan(0);
  });
});
