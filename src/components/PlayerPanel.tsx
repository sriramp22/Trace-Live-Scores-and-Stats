import { useEffect } from 'react'
import { fetchPlayerSeason, type SeasonCategory, type TeamBox } from '../api'
import type { League } from '../leagues'
import { usePolling } from '../usePolling'

export interface PanelPlayer {
  id: string
  name: string
  jersey: string
  position: string
}

// Box-score column -> season column(s), where the two feeds name a stat differently.
const ALIASES: Record<string, string[]> = {
  OREB: ['OR'],
  DREB: ['DR'],
  SACKS: ['SACK'],
  LONG: ['LNG'],
  'C/ATT': ['CMP', 'ATT'],
}
// Box-score group -> season category, where they differ.
const CATEGORY_FOR_GROUP: Record<string, string> = { interceptions: 'defensive' }
// Stats that are already rates or maximums, so dividing by games played is meaningless.
const NOT_COUNTS = new Set(['GP', 'GS', 'AVG', 'LNG', 'LONG', 'RTG', 'QBR', 'CMP%', 'FG%', 'PCT'])

function seasonValue(label: string, cat: SeasonCategory | undefined): string | null {
  if (!cat) return null
  const parts = (ALIASES[label] ?? [label]).map((name) => {
    const i = cat.labels.indexOf(name)
    return i >= 0 ? cat.stats[i] : undefined
  })
  return parts.every((v) => v !== undefined && v !== '') ? parts.join('/') : null
}

function perGame(label: string, total: string | null, gamesPlayed: number): string | null {
  if (!total || !(gamesPlayed > 0) || NOT_COUNTS.has(label) || !/^-?[\d,]+(\.\d+)?$/.test(total)) return null
  return (Number(total.replace(/,/g, '')) / gamesPlayed).toFixed(1)
}

/** Season-only tables, for a player with no line in this game (before tip-off, or not playing). */
function SeasonOnly({ categories, basketball }: { categories: SeasonCategory[]; basketball: boolean }) {
  // Basketball: the per-game averages. Football: every category from the current season
  // (older categories, like a quarterback's defensive line from years ago, are dropped).
  const latest = categories.map((c) => c.season).sort().pop()
  const shown = basketball
    ? categories.filter((c) => c.key === 'averages')
    : categories.filter((c) => c.season === latest)
  if (shown.length === 0) return <p className="notice">No season stats yet for this player.</p>

  return (
    <>
      {shown.map((cat) => {
        const gp = Number(seasonValue('GP', cat))
        const showPerGame = !basketball && gp > 0
        return (
          <table className="player-stats season-only" key={cat.key}>
            <thead>
              <tr>
                <th scope="col">{basketball ? 'Stat' : cat.title}</th>
                <th scope="col">{cat.season} {basketball ? 'avg' : 'total'}</th>
                {showPerGame && <th scope="col">Per game</th>}
              </tr>
            </thead>
            <tbody>
              {cat.labels.map((label, i) => (
                <tr key={i} className={label === 'PF' ? 'pf-row' : undefined}>
                  <th scope="row">{label}</th>
                  <td>{cat.stats[i] || '–'}</td>
                  {showPerGame && <td>{perGame(label, cat.stats[i], gp) ?? '–'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )
      })}
    </>
  )
}

/**
 * Sheet for one player. If they have a line in this game it is shown beside their
 * season numbers, read from the live box score on every render so it keeps updating
 * (fouls included) while the sheet is open. Otherwise the season numbers stand alone.
 */
export function PlayerPanel({
  league, player, teamName, box, live, onClose,
}: {
  league: League
  player: PanelPlayer
  teamName: string
  box?: TeamBox
  live: boolean
  onClose: () => void
}) {
  const season = usePolling(
    (signal) => fetchPlayerSeason(league, player.id, signal),
    `${league.id}:${player.id}`,
    () => 10 * 60_000,
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // A football player can appear in several groups (passing and rushing, say).
  const entries = (box?.groups ?? []).flatMap((group) => {
    const row = group.rows.find((r) => r.id === player.id && !r.dnpReason)
    return row ? [{ group, row }] : []
  })
  const basketball = league.sport === 'basketball'

  const pfIndex = basketball && entries[0] ? entries[0].group.labels.indexOf('PF') : -1
  const fouls = pfIndex >= 0 ? Number(entries[0].row.stats[pfIndex]) : NaN
  const limit = league.foulLimit ?? 0
  const foulClass = !Number.isFinite(fouls) || !limit
    ? ''
    : fouls >= limit ? 'foul-out' : fouls >= limit - 1 ? 'foul-danger' : fouls >= limit - 2 ? 'foul-warn' : ''

  const categoryFor = (groupKey: string) =>
    season.data?.find((c) => c.key === (basketball ? 'averages' : CATEGORY_FOR_GROUP[groupKey] ?? groupKey))

  const averages = basketball ? categoryFor('') : undefined
  const extras = averages && entries.length > 0
    ? [['GP', 'games'], ['FG%', 'FG%'], ['3P%', '3P%'], ['FT%', 'FT%']]
        .map(([label, text]) => [seasonValue(label, averages), text])
        .filter(([value]) => value !== null)
        .map(([value, text]) => `${value} ${text}`)
    : []

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={`${player.name} stats`} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <h2>{player.name}</h2>
            <p className="sheet-sub">
              {[player.jersey && `#${player.jersey}`, player.position, teamName].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {Number.isFinite(fouls) && (
          <p className={`foul-banner ${foulClass}`}>
            <span>{live ? 'Fouls so far this game' : 'Fouls this game'}</span>
            <b>{fouls}{limit > 0 && <small> of {limit}</small>}</b>
          </p>
        )}

        {season.loading && <p className="notice">Loading season stats…</p>}
        {season.error && !season.data && <p className="notice">Season stats aren’t available for this player right now.</p>}

        {entries.length === 0 && season.data && <SeasonOnly categories={season.data} basketball={basketball} />}

        {entries.map(({ group, row }, gi) => {
          const cat = categoryFor(group.key)
          const gp = Number(seasonValue('GP', cat))
          const showPerGame = !basketball && gp > 0
          return (
            <table className="player-stats" key={gi}>
              <thead>
                <tr>
                  <th scope="col">{basketball ? 'Stat' : group.title}</th>
                  <th scope="col">{live ? 'Live' : 'This game'}</th>
                  <th scope="col">{cat?.season ? `${cat.season} ` : 'Season '}{basketball ? 'avg' : 'total'}</th>
                  {showPerGame && <th scope="col">Per game</th>}
                </tr>
              </thead>
              <tbody>
                {group.labels.map((label, i) => {
                  const seasonStat = seasonValue(label, cat)
                  return (
                    <tr key={i} className={i === pfIndex ? 'pf-row' : undefined}>
                      <th scope="row">{label}</th>
                      <td className={i === pfIndex ? foulClass : undefined}>{row.stats[i] ?? '–'}</td>
                      <td>{seasonStat ?? '–'}</td>
                      {showPerGame && <td>{perGame(label, seasonStat, gp) ?? '–'}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })}

        {extras.length > 0 && <p className="sheet-foot">{averages?.season} season: {extras.join(' · ')}</p>}
      </section>
    </div>
  )
}
