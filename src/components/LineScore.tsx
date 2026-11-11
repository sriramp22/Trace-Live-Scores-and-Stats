import type { Game, TeamLine } from '../api'
import { periodLabel, type League } from '../leagues'

function TeamCell({ team, hasBall }: { team: TeamLine; hasBall: boolean }) {
  return (
    <th scope="row" className="ls-team">
      {team.logo ? <img src={team.logo} alt="" loading="lazy" /> : <span className="logo-gap" />}
      <span className="ls-name">
        {team.rank !== null && <span className="rank">{team.rank}</span>}
        <span className="abbr">{team.abbr || team.name}</span>
        <span className="full">{team.name}</span>
        {hasBall && <span className="ball" title="Possession" aria-label="has possession" />}
      </span>
      {team.record && <span className="record">{team.record}</span>}
    </th>
  )
}

/**
 * Period-by-period table for both teams, plus a combined row: the two teams'
 * points added together for each period and for the game.
 */
export function LineScore({ game, league, large = false }: { game: Game; league: League; large?: boolean }) {
  const { away, home } = game
  const started = game.state !== 'pre'
  const cols = started ? Math.max(league.periods, away.periods.length, home.periods.length) : 0
  const idx = Array.from({ length: cols }, (_, i) => i)
  const cell = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v)
  const combined = (i: number) => {
    const a = away.periods[i]
    const h = home.periods[i]
    return a == null && h == null ? null : (a ?? 0) + (h ?? 0)
  }
  const total = started ? (away.score ?? 0) + (home.score ?? 0) : null
  const done = game.state === 'post'

  const row = (team: TeamLine, other: TeamLine) => (
    <tr className={done && !team.winner && other.winner ? 'lost' : undefined}>
      <TeamCell team={team} hasBall={game.situation?.possessionTeamId === team.id} />
      {idx.map((i) => (
        <td key={i}>{cell(team.periods[i])}</td>
      ))}
      <td className="ls-total">{started ? cell(team.score) : ''}</td>
    </tr>
  )

  return (
    <table className={`linescore${large ? ' large' : ''}`}>
      <thead>
        <tr>
          <th />
          {idx.map((i) => (
            <th key={i} scope="col">{periodLabel(league, i)}</th>
          ))}
          <th scope="col" className="ls-total">{started ? 'T' : ''}</th>
        </tr>
      </thead>
      <tbody>
        {row(away, home)}
        {row(home, away)}
      </tbody>
      {started && (
        <tfoot>
          <tr>
            <th scope="row" className="ls-team combined-label">
              Combined
              {game.overUnder !== null && <span className="record">O/U {game.overUnder}</span>}
            </th>
            {idx.map((i) => (
              <td key={i}>{cell(combined(i))}</td>
            ))}
            <td className="ls-total">{total}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}
