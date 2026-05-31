import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Import after env setup ────────────────────
import { isHebrew, translateHebrewToEnglish, translateToHebrew, hebrewToKeywords } from '@/lib/translate'

// Helper: build a fake successful translate response
function translateResponse(text: string) {
  return {
    ok: true as const,
    json: async () => [[[text, 'original', null]]],
  }
}

describe('isHebrew', () => {
  it('returns true for a Hebrew string', () => {
    expect(isHebrew('שלום')).toBe(true)
  })

  it('returns true when Hebrew chars are mixed with Latin', () => {
    expect(isHebrew('נארוטו Naruto')).toBe(true)
  })

  it('returns false for a pure English string', () => {
    expect(isHebrew('Naruto')).toBe(false)
  })

  it('returns false for digits and punctuation only', () => {
    expect(isHebrew('12345!@#')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isHebrew('')).toBe(false)
  })
})

describe('translateHebrewToEnglish', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the translated English text', async () => {
    mockFetch.mockResolvedValue(translateResponse('Naruto'))
    const result = await translateHebrewToEnglish('נארוטו')
    expect(result).toBe('Naruto')
  })

  it('joins multiple chunks into one string', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [[['Attack on ', 'חלק1', null], ['Titan', 'חלק2', null]]],
    })
    const result = await translateHebrewToEnglish('התקפה על הטיטאן')
    expect(result).toBe('Attack on Titan')
  })

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 })
    await expect(translateHebrewToEnglish('נארוטו')).rejects.toThrow('Translate API error 429')
  })

  it('URL-encodes the query string', async () => {
    mockFetch.mockResolvedValue(translateResponse('hello'))
    await translateHebrewToEnglish('שלום עולם')
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain(encodeURIComponent('שלום עולם'))
  })

  it('uses sl=he and tl=en', async () => {
    mockFetch.mockResolvedValue(translateResponse('x'))
    await translateHebrewToEnglish('x')
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('sl=he')
    expect(calledUrl).toContain('tl=en')
  })
})

describe('translateToHebrew', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the Hebrew translation', async () => {
    mockFetch.mockResolvedValue(translateResponse('נארוטו'))
    const result = await translateToHebrew('Naruto')
    expect(result).toBe('נארוטו')
  })

  it('returns the original text when the response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const result = await translateToHebrew('Naruto')
    expect(result).toBe('Naruto')
  })

  it('uses sl=auto and tl=he', async () => {
    mockFetch.mockResolvedValue(translateResponse('x'))
    await translateToHebrew('hello')
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('sl=auto')
    expect(calledUrl).toContain('tl=he')
  })
})

describe('hebrewToKeywords', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns translated keywords for each Hebrew word', async () => {
    mockFetch
      .mockResolvedValueOnce(translateResponse('sword'))
      .mockResolvedValueOnce(translateResponse('art'))
    const result = await hebrewToKeywords('חרב אמנות')
    expect(result).toContain('sword')
    expect(result).toContain('art')
  })

  it('filters out English stop words', async () => {
    // single-char words are filtered before translation, so fake a multi-char word
    // that translates to a stop word
    mockFetch.mockResolvedValue(translateResponse('the'))
    const result = await hebrewToKeywords('בבבב') // 4-char word → 'the' → stop word
    expect(result).not.toContain('the')
    expect(result).toEqual([])
  })

  it('filters out translated words with length <= 2', async () => {
    mockFetch.mockResolvedValue(translateResponse('hi'))
    const result = await hebrewToKeywords('ממ') // 2-char word, but 'hi' has length 2 → filtered
    expect(result).toEqual([])
  })

  it('deduplicates identical translations', async () => {
    // Two Hebrew words that both translate to 'naruto'
    mockFetch.mockResolvedValue(translateResponse('naruto'))
    const result = await hebrewToKeywords('נארוטו נארוטו2')
    expect(result).toEqual(['naruto'])
  })

  it('skips single-character Hebrew words before translation', async () => {
    // 'ה' is one char — filtered before calling fetch
    await hebrewToKeywords('ה')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns empty array when all translations fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const result = await hebrewToKeywords('נארוטו')
    expect(result).toEqual([])
  })

  it('lowercases and strips non-alphabetic chars from translations', async () => {
    mockFetch.mockResolvedValue(translateResponse('SWORD'))
    const result = await hebrewToKeywords('חרב')
    expect(result).toContain('sword')
  })

  it('handles multi-word translation chunks by splitting on spaces', async () => {
    // A single word translates to two words: 'attack titan'
    mockFetch.mockResolvedValue(translateResponse('attack titan'))
    const result = await hebrewToKeywords('טיטאן')
    expect(result).toContain('attack')
    expect(result).toContain('titan')
  })
})
