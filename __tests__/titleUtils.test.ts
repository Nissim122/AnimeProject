import { describe, it, expect } from 'vitest'
import { cleanSeriesTitle } from '@/lib/titleUtils'

describe('cleanSeriesTitle', () => {
  it('strips ordinal "2nd Season" suffix', () => {
    expect(cleanSeriesTitle('Attack on Titan 2nd Season')).toBe('Attack on Titan')
  })

  it('strips ordinal "1st Season" suffix', () => {
    expect(cleanSeriesTitle('Re:Zero 1st Season')).toBe('Re:Zero')
  })

  it('strips ordinal "3rd Season" suffix', () => {
    expect(cleanSeriesTitle('Re:Zero 3rd Season')).toBe('Re:Zero')
  })

  it('strips ordinal "4th Season" suffix with trailing content', () => {
    expect(cleanSeriesTitle('Re:Zero 4th Season Part 1')).toBe('Re:Zero')
  })

  it('strips "Final Season" suffix', () => {
    expect(cleanSeriesTitle('Attack on Titan Final Season')).toBe('Attack on Titan')
  })

  it('strips "Season 2" suffix', () => {
    expect(cleanSeriesTitle('My Hero Academia Season 2')).toBe('My Hero Academia')
  })

  it('strips "Season 2: subtitle" suffix', () => {
    expect(cleanSeriesTitle('Overlord Season 2: Dark Hero')).toBe('Overlord')
  })

  it('strips bare "Season" suffix', () => {
    expect(cleanSeriesTitle('Demon Slayer Season')).toBe('Demon Slayer')
  })

  it('strips "Part 2" suffix alone', () => {
    expect(cleanSeriesTitle('My Hero Academia Part 2')).toBe('My Hero Academia')
  })

  it('strips "Part 2" after removing ordinal season first', () => {
    // regex 1 removes " 4th Season Part 1" because it has (.*)?$ which eats everything
    expect(cleanSeriesTitle('Re:Zero 4th Season Part 1')).toBe('Re:Zero')
  })

  it('leaves a plain title unchanged', () => {
    expect(cleanSeriesTitle('Naruto')).toBe('Naruto')
  })

  it('leaves a title with a colon unchanged', () => {
    expect(cleanSeriesTitle('Sword Art Online: Alicization')).toBe(
      'Sword Art Online: Alicization'
    )
  })

  it('is case insensitive for "season"', () => {
    expect(cleanSeriesTitle('Anime season 3')).toBe('Anime')
  })

  it('is case insensitive for "FINAL SEASON"', () => {
    expect(cleanSeriesTitle('Attack on Titan FINAL SEASON')).toBe('Attack on Titan')
  })

  it('trims surrounding whitespace', () => {
    expect(cleanSeriesTitle('  Naruto  ')).toBe('Naruto')
  })

  it('handles multiple spaces before Season', () => {
    expect(cleanSeriesTitle('Anime  Season 2')).toBe('Anime')
  })
})
