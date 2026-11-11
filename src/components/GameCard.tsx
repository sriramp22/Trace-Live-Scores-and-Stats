import type { Game } from '../api'
import type { League } from '../leagues'
import { LineScore } from './LineScore'
import { HalfTotals } from './HalfTotals'

export function startTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function StatusPill({ game }: { game: Game }) {
  if (game.state === 'in') {
    return (
      <span className="status live">
        <span className="dot" />
        {game.statusText || 'Live'}
      </span>
    )
  }
  if (game.state === 'post') return <span className="status final">{game.statusText || 'Final'}</span>
  return <span className="status">{startTime(game.date) || game.statusText}</span>
}

export function GameCard({ game, league, href }: { game: Game; league: League; href: string }) {
  return (
    <a className={`card game-card ${game.state}`} href={href}>
      <div className="card-top">
        <StatusPill game={game} />
        <span className="meta">
          {game.state === 'pre' && game.overUnder !== null && `O/U ${game.overUnder}`}
          {game.state === 'pre' && game.overUnder !== null && game.broadcast && ' · '}
          {game.broadcast}
        </span>
      </div>
      <LineScore game={game} league={league} />
      <HalfTotals game={game} league={league} />
      {game.situation?.text && <div className="situation">{game.situation.text}</div>}
    </a>
  )
}
