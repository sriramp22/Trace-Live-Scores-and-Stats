import { useEffect, useMemo, useState } from 'react'
import { fetchScoreboard, type Game } from './api'
import { LEAGUES } from './leagues'
import { usePolling } from './usePolling'
import { GameCard } from './components/GameCard'
import { GameDetail } from './components/GameDetail'
import { Splash } from './components/Splash'

type Filter = 'all' | 'in' | 'pre' | 'post'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'Live' },
  { id: 'pre', label: 'Upcoming' },
  { id: 'post', label: 'Final' },
]

// Routes: #/<league> and #/<league>/<eventId>
function readRoute() {
  const [, leagueId, eventId] = window.location.hash.split('/')
  const league = LEAGUES.find((l) => l.id === leagueId) ?? LEAGUES[0]
  return { league, eventId: eventId || null }
}

const toParam = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

// <input type="date"> speaks YYYY-MM-DD in local time
const toInputValue = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Returns null (the current slate) when the field is cleared or unparseable. */
function fromInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

function shiftDay(d: Date | null, days: number): Date {
  const next = new Date(d ?? new Date())
  next.setDate(next.getDate() + days)
  return next
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  // null = the feed's default slate (today; the current week for football)
  const [date, setDate] = useState<Date | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const { league, eventId } = route
  const dateParam = date ? toParam(date) : null

  const board = usePolling(
    (signal) => fetchScoreboard(league, dateParam, signal),
    `${league.id}:${dateParam ?? 'default'}`,
    (games) => (games?.some((g) => g.state === 'in') ? 10_000 : 60_000),
  )

  const games = board.data ?? []
  const liveCount = games.filter((g) => g.state === 'in').length
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const order: Record<Game['state'], number> = { in: 0, pre: 1, post: 2 }
    return games
      .filter((g) => filter === 'all' || g.state === filter)
      .filter((g) => !q || [g.away, g.home].some((t) => `${t.name} ${t.abbr}`.toLowerCase().includes(q)))
      .map((g, i) => ({ g, i }))
      .sort((a, b) => order[a.g.state] - order[b.g.state] || a.i - b.i)
      .map((x) => x.g)
  }, [games, filter, query])

  const dateLabel = date
    ? date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : league.sport === 'football'
      ? 'This week'
      : 'Today'

  return (
    <div className="app">
      <Splash />
      <header className="topbar">
        <a className="brand" href={`#/${league.id}`}>Trace</a>
        <nav className="leagues" aria-label="Leagues">
          {LEAGUES.map((l) => (
            <a key={l.id} href={`#/${l.id}`} className={l.id === league.id ? 'active' : undefined}>
              {l.name}
            </a>
          ))}
        </nav>
      </header>

      <main>
        {eventId ? (
          <GameDetail key={`${league.id}:${eventId}`} league={league} eventId={eventId} backHref={`#/${league.id}`} />
        ) : (
          <>
            <div className="toolbar">
              <div className="date-nav">
                <button onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">‹</button>
                {/* The native date input sits invisibly over the label, so a tap opens the
                    system calendar (the iOS date wheel/calendar on iPhone). */}
                <label className="date-label">
                  {dateLabel} <span aria-hidden="true" className="caret">▾</span>
                  <input
                    type="date"
                    aria-label="Choose a date"
                    value={toInputValue(date ?? new Date())}
                    onChange={(e) => setDate(fromInputValue(e.target.value))}
                    onClick={(e) => {
                      // Desktop browsers only open the calendar from the tiny icon unless asked to.
                      try {
                        e.currentTarget.showPicker()
                      } catch {
                        /* not supported or already open: the native tap behaviour still applies */
                      }
                    }}
                  />
                </label>
                <button onClick={() => setDate(shiftDay(date, 1))} aria-label="Next day">›</button>
              </div>
              {date && (
                <button className="today" onClick={() => setDate(null)}>
                  {league.sport === 'football' ? 'This week' : 'Today'}
                </button>
              )}
              <div className="filters" role="group" aria-label="Filter games">
                {FILTERS.map((f) => (
                  <button key={f.id} className={f.id === filter ? 'active' : undefined} onClick={() => setFilter(f.id)}>
                    {f.label}
                    {f.id === 'in' && liveCount > 0 && <span className="count">{liveCount}</span>}
                  </button>
                ))}
              </div>
              <input
                type="search"
                placeholder="Find a team"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find a team"
              />
              <span className="updated">
                {board.updatedAt &&
                  `Updated ${new Date(board.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`}
              </span>
            </div>

            {board.error && <p className="notice error">Couldn’t refresh scores ({board.error}). Retrying…</p>}
            {board.loading && <p className="notice">Loading {league.name} scores…</p>}
            {!board.loading && board.data && visible.length === 0 && (
              <p className="notice">
                {games.length === 0
                  ? `No ${league.name} games on this date. Use the arrows to check another day.`
                  : 'No games match that filter.'}
              </p>
            )}

            <div className="grid">
              {visible.map((g) => (
                <GameCard key={g.id} game={g} league={league} href={`#/${league.id}/${g.id}`} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
