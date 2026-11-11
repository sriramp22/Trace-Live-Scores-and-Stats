// Data layer: fetches ESPN's public scoreboard/summary feeds and normalizes them
// into the small set of shapes the UI needs. ESPN's JSON is loosely structured
// and differs between the two endpoints, so all of that is contained here.
import type { League } from './leagues'

const BASE = 'https://site.api.espn.com/apis/site/v2/sports'

export type GameState = 'pre' | 'in' | 'post'

export interface TeamLine {
  id: string
  abbr: string
  name: string
  logo: string
  rank: number | null
  record: string
  score: number | null
  /** Points per period, in order; null where a period has no value yet */
  periods: (number | null)[]
  winner: boolean
}

export interface Game {
  id: string
  state: GameState
  /** e.g. "7:32 - 2nd", "Final/OT", "11/11 - 7:00 PM EST" */
  statusText: string
  date: string
  away: TeamLine
  home: TeamLine
  overUnder: number | null
  spread: string
  broadcast: string
  venue: string
  /** Football only: down & distance and which team has the ball */
  situation: { text: string; possessionTeamId: string | null; lastPlay: string } | null
}

export interface PlayerRow {
  id: string
  name: string
  jersey: string
  position: string
  starter: boolean
  onCourt: boolean
  ejected: boolean
  dnpReason: string | null
  stats: string[]
}

export interface StatGroup {
  /** Feed category, e.g. "passing"; empty for basketball, which has a single group */
  key: string
  title: string
  labels: string[]
  rows: PlayerRow[]
  totals: string[]
}

export interface TeamBox {
  teamId: string
  name: string
  logo: string
  groups: StatGroup[]
}

export interface TeamStats {
  teamId: string
  abbr: string
  stats: { label: string; value: string }[]
}

export interface Play {
  id: string
  text: string
  clock: string
  period: number
  awayScore: number | null
  homeScore: number | null
  scoring: boolean
}

export interface GameSummary {
  game: Game
  boxes: TeamBox[]
  teamStats: TeamStats[]
  plays: Play[]
  /** Both teams' injury reports */
  injuries: InjuryReport[]
  /** Players hurt during this game */
  gameInjuries: GameInjury[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normTeam(c: any): TeamLine {
  const t = c.team ?? {}
  const rank = num(c.curatedRank?.current ?? c.rank)
  return {
    id: String(t.id ?? c.id ?? ''),
    abbr: t.abbreviation ?? '',
    name: t.shortDisplayName ?? t.displayName ?? t.name ?? '',
    logo: t.logo ?? t.logos?.[0]?.href ?? '',
    rank: rank !== null && rank >= 1 && rank <= 25 ? rank : null,
    record: c.records?.[0]?.summary ?? c.record?.[0]?.summary ?? '',
    score: num(c.score),
    periods: (c.linescores ?? []).map((l: any) => num(l.value ?? l.displayValue)),
    winner: Boolean(c.winner),
  }
}

function normGame(id: string, comp: any, odds: any): Game {
  const competitors: any[] = comp.competitors ?? []
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[0] ?? {}
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[1] ?? {}
  const type = comp.status?.type ?? {}
  const state: GameState = type.state === 'in' || type.state === 'post' ? type.state : 'pre'
  const sit = comp.situation
  const b = comp.broadcasts?.[0]
  return {
    id,
    state,
    statusText: type.shortDetail ?? type.detail ?? type.description ?? '',
    date: comp.date ?? '',
    away: normTeam(away),
    home: normTeam(home),
    overUnder: num(odds?.overUnder),
    spread: odds?.details ?? '',
    broadcast: b?.names?.[0] ?? b?.media?.shortName ?? '',
    venue: comp.venue?.fullName ?? '',
    situation:
      sit && state === 'in'
        ? {
            text: sit.downDistanceText ?? sit.shortDownDistanceText ?? '',
            possessionTeamId: sit.possession ? String(sit.possession) : null,
            lastPlay: sit.lastPlay?.text ?? '',
          }
        : null,
  }
}

async function getJson(url: string, signal: AbortSignal): Promise<any> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Score feed returned ${res.status}`)
  return res.json()
}

/** `date` is YYYYMMDD; omit it for the feed's default (today, or the current week for football). */
export async function fetchScoreboard(league: League, date: string | null, signal: AbortSignal): Promise<Game[]> {
  const params = new URLSearchParams(league.params)
  if (date) params.set('dates', date)
  const qs = params.toString()
  const data = await getJson(`${BASE}/${league.path}/scoreboard${qs ? `?${qs}` : ''}`, signal)
  return (data.events ?? []).map((e: any) => {
    const comp = e.competitions?.[0] ?? {}
    return normGame(String(e.id), comp, comp.odds?.[0])
  })
}

export async function fetchSummary(league: League, eventId: string, signal: AbortSignal): Promise<GameSummary> {
  const s = await getJson(`${BASE}/${league.path}/summary?event=${encodeURIComponent(eventId)}`, signal)
  const comp = s.header?.competitions?.[0] ?? {}
  const game = normGame(eventId, { ...comp, venue: s.gameInfo?.venue, situation: s.situation ?? comp.situation }, s.pickcenter?.[0])

  const boxes: TeamBox[] = (s.boxscore?.players ?? []).map((p: any) => ({
    teamId: String(p.team?.id ?? ''),
    name: p.team?.displayName ?? p.team?.abbreviation ?? '',
    logo: p.team?.logo ?? '',
    groups: (p.statistics ?? []).map((st: any) => ({
      key: st.name ?? '',
      title: st.text ?? st.name ?? '',
      labels: st.labels ?? [],
      totals: st.totals ?? [],
      rows: (st.athletes ?? []).map((a: any) => ({
        id: String(a.athlete?.id ?? ''),
        name: a.athlete?.shortName ?? a.athlete?.displayName ?? '',
        jersey: a.athlete?.jersey ?? '',
        position: a.athlete?.position?.abbreviation ?? '',
        starter: Boolean(a.starter),
        onCourt: Boolean(a.active),
        ejected: Boolean(a.ejected),
        dnpReason: a.didNotPlay ? a.reason || 'Did not play' : null,
        stats: a.stats ?? [],
      })),
    })),
  }))

  const teamStats: TeamStats[] = (s.boxscore?.teams ?? []).map((t: any) => ({
    teamId: String(t.team?.id ?? ''),
    abbr: t.team?.abbreviation ?? '',
    stats: (t.statistics ?? []).map((x: any) => ({
      label: x.label ?? x.abbreviation ?? x.name ?? '',
      value: x.displayValue ?? '',
    })),
  }))

  // Basketball exposes every play; football exposes scoring plays at the top level.
  const rawPlays: any[] = s.plays ?? s.scoringPlays ?? []
  const plays: Play[] = rawPlays
    .slice(-40)
    .reverse()
    .map((p: any, i: number) => ({
      id: String(p.id ?? i),
      text: p.text ?? '',
      clock: p.clock?.displayValue ?? '',
      period: p.period?.number ?? 0,
      awayScore: num(p.awayScore),
      homeScore: num(p.homeScore),
      scoring: Boolean(p.scoringPlay ?? s.scoringPlays === rawPlays),
    }))

  const injuries = injuryReports(s)
  return { game, boxes, teamStats, plays, injuries, gameInjuries: findGameInjuries(s, game, boxes, injuries) }
}

export interface SeasonCategory {
  /** e.g. "averages" (basketball), "passing", "rushing" (football) */
  key: string
  title: string
  /** Season the numbers belong to, e.g. "2026-27" */
  season: string
  labels: string[]
  stats: string[]
}

/**
 * A player's most recent season line in each stat category. Basketball has an
 * "averages" category (per game); football categories are season totals.
 */
export async function fetchPlayerSeason(league: League, athleteId: string, signal: AbortSignal): Promise<SeasonCategory[]> {
  const s = await getJson(
    `https://site.api.espn.com/apis/common/v3/sports/${league.path}/athletes/${encodeURIComponent(athleteId)}/stats`,
    signal,
  )
  return (s.categories ?? []).flatMap((c: any) => {
    const rows: any[] = c.statistics ?? []
    const latest = rows[rows.length - 1]
    if (!latest) return []
    return [
      {
        key: c.name ?? '',
        title: c.displayName ?? c.name ?? '',
        season: latest.season?.displayName ?? '',
        labels: (c.labels ?? []).map((l: unknown) => String(l).trim()),
        stats: latest.stats ?? [],
      },
    ]
  })
}

/** An entry on a team's injury report (pre-existing or new). */
export interface InjuryReport {
  playerId: string
  name: string
  teamId: string
  /** e.g. "Out", "Day-To-Day", "Questionable", "Injured Reserve" */
  status: string
  /** e.g. "Calf Soreness"; empty when the feed gives none */
  detail: string
  date: string
}

/** A player hurt during this game, with the point in the game it happened or was reported. */
export interface GameInjury {
  key: string
  /** Name as the feed gives it; football plays use a short form like "D.Deablo" */
  playerName: string
  playerId: string | null
  teamId: string | null
  teamAbbr: string
  period: number
  clock: string
  note: string
  /** "play": named on the play itself (exact). "report": taken from the time an injury update was posted (approximate). */
  source: 'play' | 'report'
}

export interface RosterPlayer {
  id: string
  name: string
  jersey: string
  position: string
  /** Football roster section: offense, defense, specialTeam, injuredReserveOrOut, suspended, practiceSquad. Empty for basketball. */
  group: string
  injuryStatus: string | null
}

function injuryReports(s: any): InjuryReport[] {
  return (s.injuries ?? []).flatMap((t: any) =>
    (t.injuries ?? []).map((i: any) => ({
      playerId: String(i.athlete?.id ?? ''),
      name: i.athlete?.displayName ?? '',
      teamId: String(t.team?.id ?? ''),
      status: i.status ?? '',
      detail: [i.details?.type, i.details?.detail].filter((p) => p && p !== 'Not Specified').join(' '),
      date: i.date ?? '',
    })),
  )
}

// Football play text, e.g. "... for 14 yards (J.Bates). ATL-D.Deablo was injured during the play."
const INJURED_ON_PLAY = /\b([A-Z]{2,4})-([A-Z][A-Za-z.'\- ]*?) was injured during the play/g

function findGameInjuries(s: any, game: Game, boxes: TeamBox[], reports: InjuryReport[]): GameInjury[] {
  if (game.state === 'pre') return []
  const found: GameInjury[] = []

  // Football: the play-by-play names the injured player on the play where it happened.
  const drives: any[] = [...(s.drives?.previous ?? []), ...(s.drives?.current ? [s.drives.current] : [])]
  const teamIdByAbbr: Record<string, string> = { [game.away.abbr]: game.away.id, [game.home.abbr]: game.home.id }
  const seen = new Set<string>()
  for (const play of drives.flatMap((d) => d.plays ?? [])) {
    for (const m of String(play.text ?? '').matchAll(INJURED_ON_PLAY)) {
      const key = `${play.id}:${m[2]}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({
        key,
        playerName: m[2].trim(),
        playerId: null,
        teamId: teamIdByAbbr[m[1]] ?? null,
        teamAbbr: m[1],
        period: play.period?.number ?? 0,
        clock: play.clock?.displayValue ?? '',
        note: play.text ?? '',
        source: 'play',
      })
    }
  }

  // Basketball: plays carry no injury events, so use injury updates posted while the
  // game was being played, placed at the play that was happening at that moment.
  // Only players who actually appeared count, which excludes someone ruled out at tip-off.
  const timed = ((s.plays ?? []) as any[])
    .map((p) => ({ at: Date.parse(p.wallclock ?? ''), play: p }))
    .filter((x) => Number.isFinite(x.at))
  if (timed.length > 0) {
    const firstAt = timed[0].at
    const lastAt = timed[timed.length - 1].at
    const appeared = new Set(boxes.flatMap((b) => b.groups.flatMap((g) => g.rows.filter((r) => !r.dnpReason).map((r) => r.id))))
    const abbrByTeamId: Record<string, string> = { [game.away.id]: game.away.abbr, [game.home.id]: game.home.abbr }
    for (const r of reports) {
      const at = Date.parse(r.date)
      if (!(at > firstAt) || !appeared.has(r.playerId)) continue
      if (game.state === 'post' && at > lastAt + 30 * 60_000) continue
      const moment = [...timed].reverse().find((x) => x.at <= at)
      if (!moment) continue
      found.push({
        key: `report:${r.playerId}`,
        playerName: r.name,
        playerId: r.playerId,
        teamId: r.teamId,
        teamAbbr: abbrByTeamId[r.teamId] ?? '',
        period: moment.play.period?.number ?? 0,
        clock: moment.play.clock?.displayValue ?? '',
        note: [r.status, r.detail].filter(Boolean).join(' · '),
        source: 'report',
      })
    }
  }
  return found
}

/** Full team roster. Football rosters come grouped by unit; basketball rosters are a flat list. */
export async function fetchRoster(league: League, teamId: string, signal: AbortSignal): Promise<RosterPlayer[]> {
  const r = await getJson(`${BASE}/${league.path}/teams/${encodeURIComponent(teamId)}/roster`, signal)
  const athletes: any[] = r.athletes ?? []
  const groups = athletes.some((a) => Array.isArray(a?.items)) ? athletes : [{ position: '', items: athletes }]
  const seen = new Set<string>()
  return groups.flatMap((g) =>
    (g.items ?? []).flatMap((p: any) => {
      const id = String(p.id ?? '')
      if (!id || seen.has(id)) return []
      seen.add(id)
      return [
        {
          id,
          name: p.displayName ?? p.fullName ?? '',
          jersey: p.jersey ?? '',
          position: p.position?.abbreviation ?? '',
          group: g.position ?? '',
          injuryStatus: p.injuries?.[0]?.status ?? null,
        },
      ]
    }),
  )
}
