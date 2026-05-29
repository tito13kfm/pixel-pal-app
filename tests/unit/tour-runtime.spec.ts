import { describe, it, expect } from 'vitest'
import { cutoutRectFrom } from '../../src/lib/tour-runtime'

describe('cutoutRectFrom', () => {
  it('expands a target rect by padding on all sides', () => {
    const target = { left: 100, top: 50, width: 80, height: 30 } as DOMRect
    const r = cutoutRectFrom(target, 6)
    expect(r).toEqual({ x: 94, y: 44, width: 92, height: 42 })
  })

  it('clamps negative origin to 0', () => {
    const target = { left: 2, top: 1, width: 20, height: 20 } as DOMRect
    const r = cutoutRectFrom(target, 6)
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
  })
})
