import { describe, it, expect } from 'vitest'
import { migrateStaleProvider } from '../../src/lib/ai'
import type { AIConfig } from '../../src/lib/palette'

describe('migrateStaleProvider', () => {
  const baseConfig: AIConfig = {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: 'sk-ant-test',
    model: 'claude-sonnet-4-6',
  }

  it('passes through in desktop mode regardless of provider', () => {
    const result = migrateStaleProvider(baseConfig, false)
    expect(result.config).toEqual(baseConfig)
    expect(result.migrated).toBe(false)
  })

  it('resets anthropic provider to openai in web mode', () => {
    const result = migrateStaleProvider(baseConfig, true)
    expect(result.config.provider).toBe('openai')
    expect(result.migrated).toBe(true)
  })

  it('resets ollama provider to openai in web mode', () => {
    const result = migrateStaleProvider({ ...baseConfig, provider: 'ollama' }, true)
    expect(result.config.provider).toBe('openai')
    expect(result.migrated).toBe(true)
  })

  it('preserves apiKey when migrating', () => {
    const result = migrateStaleProvider(baseConfig, true)
    expect(result.config.apiKey).toBe('sk-ant-test')
  })

  it('updates baseUrl and model to openai defaults when migrating', () => {
    const result = migrateStaleProvider(baseConfig, true)
    expect(result.config.baseUrl).toBe('https://api.openai.com/v1')
    expect(result.config.model).toBe('gpt-4o-mini')
  })

  it('leaves valid web provider unchanged', () => {
    const okConfig: AIConfig = { ...baseConfig, provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
    const result = migrateStaleProvider(okConfig, true)
    expect(result.config).toEqual(okConfig)
    expect(result.migrated).toBe(false)
  })

  it('returns migrated=false when config is null', () => {
    const result = migrateStaleProvider(null, true)
    expect(result.config).toBeNull()
    expect(result.migrated).toBe(false)
  })
})
