import type { Game, TeamLine } from '../api'
import type { League } from '../leagues'

type Halves = [first: number | null, second: number | null]

/** Regulation points per half. A half is null until one of its periods has a score; overtime is excluded. */
function teamHalves(team: TeamLine, league: League): Halves {
  const half = league.periods / 2
  const sum = (from: number, to: number) => {
    const played = team.periods.slice(from, to).filter((v): v is number => v !== null)
    return played.length > 0 ? played.reduce((a, b) => a + b, 0) : null
  }
  return [sum(0, half), sum(half, league.periods)]
}

const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0))
const show = (v: number | null) => (v === null ? '–' : v)

/**
 * First-half and second-half totals. Compact form (game cards) shows the two
 * teams combined; detailed form (game page) also breaks it down per team.
 * Leagues that already play in halves get this from the line score itself.
 */
export function HalfTotals({ game, league, detailed = false }: { game: Game; league: League; detailed?: boolean }) {
  if (game.state === 'pre' || league.periods < 4) return null
  const away = teamHalves(game.away, league)
  const home = teamHalves(game.home, league)
  const combined: Halves = [add(away[0], home[0]), add(away[1], home[1])]

  if (!detailed) {
    return (
      <div className="halves">
        <span>1st half <b>{show(combined[0])}</b></span>
        <span>2nd half <b>{show(combined[1])}</b></span>
      </div>
    )
  }

  const rows: [label: string, halves: Halves, className?: string][] = [
    [game.away.abbr || game.away.name, away],
    [game.home.abbr || game.home.name, home],
    ['Combined', combined, 'combined'],
  ]
  return (
    <table className="halves-table">
      <thead>
        <tr>
          <th scope="col">Half totals</th>
          <th scope="col">1st half</th>
          <th scope="col">2nd half</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, halves, className]) => (
          <tr key={label} className={className}>
            <th scope="row">{label}</th>
            <td>{show(halves[0])}</td>
            <td>{show(halves[1])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
