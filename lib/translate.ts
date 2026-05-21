const HEBREW_RE = /[֐-׿יִ-ﭏ]/

const EN_STOP_WORDS = new Set([
  'a','an','the','in','on','at','of','to','for','is','are','was','were',
  'be','been','being','and','or','but','with','by','from','that','this',
  'which','what','how','its','it','i','my','me','we','our','us','he','she',
  'his','her','they','their','them','s','d','t','re','ll','ve','m',
])

export function isHebrew(text: string): boolean {
  return HEBREW_RE.test(text)
}

async function gtx(text: string): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=he&tl=en&dt=t&q=${encodeURIComponent(text)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Translate API error ${res.status}`)
  const json = await res.json()
  return (json[0] as Array<[string]>)
    .map((chunk) => chunk[0])
    .join('')
    .trim()
}

export async function translateHebrewToEnglish(text: string): Promise<string> {
  return gtx(text)
}

/** Translate each Hebrew word individually and return unique content keywords. */
export async function hebrewToKeywords(text: string): Promise<string[]> {
  const heWords = text.split(/\s+/).filter((w) => w.length > 1)
  const translations = await Promise.all(heWords.map((w) => gtx(w).catch(() => '')))

  const seen = new Set<string>()
  const keywords: string[] = []

  for (const t of translations) {
    for (const word of t.split(/\s+/)) {
      const lower = word.toLowerCase().replace(/[^a-z]/g, '')
      if (lower.length > 2 && !EN_STOP_WORDS.has(lower) && !seen.has(lower)) {
        seen.add(lower)
        keywords.push(lower)
      }
    }
  }

  return keywords
}
