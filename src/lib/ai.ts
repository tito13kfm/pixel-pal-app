import OpenAI from 'openai'
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'
import type { AIConfig } from './palette'

export interface AIResponse {
  colors: string[]         // array of hex color strings (mapped from colors[].hex)
  names: string[]          // descriptive color names from AI (parallel to colors)
  description: string      // 2-3 sentence atmospheric description
  subject?: string         // short title of the invented subject (Surprise Me only)
}

export const PROVIDER_PRESETS: Record<string, { baseUrl: string; label: string; hint: string; modelExample: string; apiKeyExample: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    label: 'OpenAI',
    hint: 'Get a key at https://platform.openai.com/api-keys',
    modelExample: 'gpt-4o-mini',
    apiKeyExample: 'sk-proj-...',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    label: 'Anthropic (Claude)',
    hint: 'Get a key at https://console.anthropic.com/settings/keys — Claude models work with the OpenAI-compatible endpoint.',
    modelExample: 'claude-sonnet-4-6',
    apiKeyExample: 'sk-ant-api03-...',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    label: 'xAI (Grok)',
    hint: 'Get a key at https://console.x.ai',
    modelExample: 'grok-3-mini',
    apiKeyExample: 'xai-...',
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    label: 'Google (Gemini)',
    hint: 'Get a free key at https://aistudio.google.com/apikey — free tier available.',
    modelExample: 'gemini-3.1-flash-lite',
    apiKeyExample: 'AIzaSy...',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    label: 'OpenRouter',
    hint: 'Get a key at https://openrouter.ai/settings/keys — supports hundreds of models from one endpoint.',
    modelExample: 'anthropic/claude-sonnet-4-6',
    apiKeyExample: 'sk-or-v1-...',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    label: 'Ollama (local)',
    hint: 'Install Ollama at https://ollama.com — no API key needed, enter any string.',
    modelExample: 'llama3.2',
    apiKeyExample: 'ollama',
  },
  custom: {
    baseUrl: '',
    label: 'Custom',
    hint: 'Any OpenAI-compatible endpoint. Works with LM Studio, vLLM, and others.',
    modelExample: '',
    apiKeyExample: 'your-api-key',
  },
}

export const DROPPED_WEB_PROVIDERS = new Set(['anthropic', 'ollama'])

export function getProviderPresets(isWeb: boolean): typeof PROVIDER_PRESETS {
  if (!isWeb) return PROVIDER_PRESETS
  const out = {} as Record<string, typeof PROVIDER_PRESETS[keyof typeof PROVIDER_PRESETS]>
  for (const [key, val] of Object.entries(PROVIDER_PRESETS)) {
    if (!DROPPED_WEB_PROVIDERS.has(key)) out[key] = val
  }
  return out as typeof PROVIDER_PRESETS
}

export function migrateStaleProvider(
  config: AIConfig | null,
  isWeb: boolean,
): { config: AIConfig | null; migrated: boolean } {
  if (!config) return { config: null, migrated: false }
  if (!isWeb) return { config, migrated: false }
  if (!DROPPED_WEB_PROVIDERS.has(config.provider)) return { config, migrated: false }
  const fallback = PROVIDER_PRESETS.openai
  return {
    config: {
      provider: 'openai',
      baseUrl: fallback.baseUrl,
      model: fallback.modelExample,
      apiKey: config.apiKey,
    },
    migrated: true,
  }
}

const AI_CONFIG_KEY = 'ai:config'

export function loadAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AIConfig>
    if (!parsed.baseUrl || !parsed.apiKey || !parsed.model) return null
    return parsed as AIConfig
  } catch {
    return null
  }
}

export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config))
}

let _cachedConfig: AIConfig | null = null

export function getCachedAIConfig(): AIConfig | null {
  return _cachedConfig
}

export async function loadAIConfigAsync(): Promise<{ config: AIConfig | null; encrypted: boolean }> {
  if (!window.electronAPI) {
    const config = loadAIConfig()
    _cachedConfig = config
    return { config, encrypted: false }
  }
  const result = await window.electronAPI.getAIConfig()
  if (!result.config) {
    const legacy = loadAIConfig()
    if (legacy) {
      const saveResult = await window.electronAPI.setAIConfig(legacy)
      _cachedConfig = legacy
      if (saveResult.encrypted) localStorage.removeItem(AI_CONFIG_KEY)
      return { config: legacy, encrypted: saveResult.encrypted }
    }
  }
  _cachedConfig = result.config
  return result
}

export async function saveAIConfigAsync(config: AIConfig): Promise<{ encrypted: boolean }> {
  _cachedConfig = config
  if (window.electronAPI) {
    return window.electronAPI.setAIConfig(config)
  }
  saveAIConfig(config)
  return { encrypted: false }
}

let _tauriFetch: typeof globalThis.fetch | null = null
let _tauriFetchLoaded = false

async function loadTauriFetch(): Promise<typeof globalThis.fetch | null> {
  if (_tauriFetchLoaded) return _tauriFetch
  _tauriFetchLoaded = true
  if (!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    return null
  }
  try {
    const mod = await import('@tauri-apps/plugin-http')
    _tauriFetch = mod.fetch as unknown as typeof globalThis.fetch
    return _tauriFetch
  } catch (e) {
    console.warn('[ai] failed to load @tauri-apps/plugin-http:', e)
    return null
  }
}

// Public: call once during app boot so the dynamic import has time to
// resolve before the first AI call. No-op in plain browser.
export async function ensureTauriFetchLoaded(): Promise<void> {
  await loadTauriFetch()
}

export function createAIClient(config: AIConfig): OpenAI {
  // Note: fetch is resolved synchronously for compatibility with the OpenAI
  // SDK constructor. In Tauri windows, the import will have been kicked off
  // by `ensureTauriFetchLoaded()` during app boot (main.tsx); by the time
  // createAIClient is called from a user-initiated AI request, the cached
  // _tauriFetch is populated. In plain browser, _tauriFetch stays null and
  // OpenAI SDK falls back to globalThis.fetch.
  return new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
    fetch: _tauriFetch ?? undefined,
  })
}

export async function generatePaletteFromPrompt(
  client: OpenAI,
  model: string,
  prompt: string,
): Promise<AIResponse> {
  // System prompt matches the original artifact's expected JSON shape:
  // {"description": "...", "colors": [{"hex": "#xxxxxx", "name": "..."}]}
  // Confirmed by grepping pixel-pal.tsx response parsing at lines ~2036 and ~2106.
  const systemPrompt = `You are a pixel art color palette designer. Given a subject or theme, respond with a JSON object containing:
- "colors": array of 4-6 objects, each with "hex" (e.g. "#ff0080") and "name" (short color name)
- "description": a 2-3 sentence atmospheric description of the subject and color choices
- "subject": if you invented the subject yourself, a short 2-5 word title for it

Respond with valid JSON only. No markdown, no explanation outside the JSON.`

  // Note: Anthropic's OpenAI-compatible endpoint may not support response_format.
  // If the provider is Anthropic and response_format causes a 400, remove it and
  // rely on the system prompt instruction to return JSON.
  const requestParams: ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    max_tokens: 500,
    stream: false,
  }

  // Only add response_format for non-Anthropic providers
  // (Anthropic's compat layer rejects this parameter)
  if (!client.baseURL.includes('anthropic.com')) {
    requestParams.response_format = { type: 'json_object' }
  }

  const response = await client.chat.completions.create(requestParams)

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Empty response from AI provider')

  const parsed = JSON.parse(content)

  // Map colors[].hex and colors[].name to parallel flat arrays.
  // Actual pixel-pal.tsx response shape: {"description": "...", "colors": [{"hex": "#...", "name": "..."}]}
  const description = parsed.description ?? parsed.reasoning ?? ''
  let colors: string[] = []
  let names: string[] = []
  if (Array.isArray(parsed.colors)) {
    parsed.colors.forEach((c: { hex?: string; name?: string } | string) => {
      const hex = typeof c === 'string' ? c : (c.hex ?? '')
      const name = typeof c === 'string' ? '' : (c.name ?? '')
      if (hex) { colors.push(hex); names.push(name) }
    })
  } else if (Array.isArray(parsed.bases)) {
    // Fallback: some models may return "bases" instead
    colors = parsed.bases.filter((c: unknown) => typeof c === 'string')
    names = colors.map((_: string, i: number) => `Color ${i + 1}`)
  }

  if (colors.length === 0) throw new Error('AI response contained no base colors')

  const subject = typeof parsed.subject === 'string' ? parsed.subject : undefined
  return { colors, names, description, subject }
}
