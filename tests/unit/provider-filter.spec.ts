import { describe, it, expect } from 'vitest'
import { getProviderPresets, DROPPED_WEB_PROVIDERS, PROVIDER_PRESETS } from '../../src/lib/ai'

describe('getProviderPresets', () => {
  it('returns full PROVIDER_PRESETS in desktop mode', () => {
    const presets = getProviderPresets(false)
    expect(Object.keys(presets)).toEqual(Object.keys(PROVIDER_PRESETS))
    expect(presets.anthropic).toBeDefined()
    expect(presets.ollama).toBeDefined()
  })

  it('drops anthropic and ollama in web mode', () => {
    const presets = getProviderPresets(true)
    expect(presets.anthropic).toBeUndefined()
    expect(presets.ollama).toBeUndefined()
  })

  it('keeps openai, xai, google, openrouter, custom in web mode', () => {
    const presets = getProviderPresets(true)
    expect(presets.openai).toBeDefined()
    expect(presets.xai).toBeDefined()
    expect(presets.google).toBeDefined()
    expect(presets.openrouter).toBeDefined()
    expect(presets.custom).toBeDefined()
  })

  it('DROPPED_WEB_PROVIDERS lists exactly anthropic and ollama', () => {
    expect([...DROPPED_WEB_PROVIDERS].sort()).toEqual(['anthropic', 'ollama'])
  })
})
