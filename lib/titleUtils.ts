export function cleanSeriesTitle(title: string): string {
  return title
    .replace(/\s+\d+(?:st|nd|rd|th)\s+Season(?:.*)?$/i, '')
    .replace(/\s+(?:Final\s+)?Season(?:\s+\d+)?(?:\s*:.*)?$/i, '')
    .replace(/\s+Part\s+\d+$/i, '')
    .trim()
}
