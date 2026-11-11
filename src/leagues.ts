export interface League {
  id: string
  name: string
  /** ESPN path segment, e.g. "basketball/nba" */
  path: string
  sport: 'basketball' | 'football'
  /** Regulation periods (quarters, or halves for men's college basketball) */
  periods: number
  periodPrefix: 'Q' | 'H'
  /** Personal fouls that disqualify a player (basketball only) */
  foulLimit?: number
  /** Extra scoreboard query params (e.g. to include all Division I games, not just the Top 25) */
  params?: Record<string, string>
}

export const LEAGUES: League[] = [
  { id: 'nba', name: 'NBA', path: 'basketball/nba', sport: 'basketball', periods: 4, periodPrefix: 'Q', foulLimit: 6 },
  { id: 'nfl', name: 'NFL', path: 'football/nfl', sport: 'football', periods: 4, periodPrefix: 'Q' },
  {
    id: 'ncaaf', name: 'NCAA Football', path: 'football/college-football', sport: 'football',
    periods: 4, periodPrefix: 'Q', params: { groups: '80', limit: '300' },
  },
  {
    id: 'ncaam', name: 'NCAA Men’s BB', path: 'basketball/mens-college-basketball', sport: 'basketball',
    periods: 2, periodPrefix: 'H', foulLimit: 5, params: { groups: '50', limit: '400' },
  },
  {
    id: 'ncaaw', name: 'NCAA Women’s BB', path: 'basketball/womens-college-basketball', sport: 'basketball',
    periods: 4, periodPrefix: 'Q', foulLimit: 5, params: { groups: '50', limit: '400' },
  },
  { id: 'wnba', name: 'WNBA', path: 'basketball/wnba', sport: 'basketball', periods: 4, periodPrefix: 'Q', foulLimit: 6 },
]

export function periodLabel(league: League, index: number): string {
  if (index < league.periods) return `${league.periodPrefix}${index + 1}`
  const ot = index - league.periods + 1
  return ot === 1 ? 'OT' : `${ot}OT`
}
