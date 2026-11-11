import { useCallback, useState } from 'react'
import { fetchRoster, fetchSummary, type GameSummary, type StatGroup, type TeamBox } from '../api'
import { periodLabel, type League } from '../leagues'
import { usePolling } from '../usePolling'
import { LineScore } from './LineScore'
import { HalfTotals } from './HalfTotals'
import { PlayerPanel, type PanelPlayer } from './PlayerPanel'
import { GameInjuries, Rosters, type TeamRosters } from './Rosters'

type SelectPlayer = (playerId: string) => void
import { StatusPill } from './GameCard'

function GroupTable({ group, league, live, onSelect }: { group: StatGroup; league: League; live: boolean; onSelect: SelectPlayer }) {
  const pfCol = league.foulLimit ? group.labels.indexOf('PF') : -1
  const played = group.rows.filter((r) => !r.dnpReason)
  const dnp = group.rows.filter((r) => r.dnpReason)
  // Basketball lists starters first, then the bench; football groups have no such split.
  const firstBench = league.sport === 'basketball' ? played.findIndex((r) => !r.starter) : -1

  const foulClass = (value: string) => {
    const pf = Number(value)
    if (!league.foulLimit || !Number.isFinite(pf)) return ''
    if (pf >= league.foulLimit) return 'foul-out'
    if (pf >= league.foulLimit - 1) return 'foul-danger'
    if (pf >= league.foulLimit - 2) return 'foul-warn'
    return ''
  }

  return (
    <div className="table-scroll">
      <table className="box">
        <thead>
          <tr>
            <th scope="col" className="player-col">{group.title || 'Players'}</th>
            {group.labels.map((l, i) => (
              <th key={i} scope="col" className={i === pfCol ? 'pf' : undefined}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {played.map((r, ri) => (
            <tr
              key={r.id || ri}
              className={`selectable${ri === firstBench && ri > 0 ? ' bench-start' : ''}`}
              onClick={() => onSelect(r.id)}
            >
              <th scope="row" className="player-col">
                {live && r.onCourt && <span className="dot on-court" title="On the floor" />}
                {/* A real button so the player can be opened from the keyboard too */}
                <button className="pname">{r.name}</button>
                <span className="pmeta">
                  {r.jersey && `#${r.jersey}`} {r.position}
                  {r.ejected && ' · ejected'}
                </span>
              </th>
              {group.labels.map((_, i) => (
                <td key={i} className={i === pfCol ? `pf ${foulClass(r.stats[i])}` : undefined}>
                  {r.stats[i] ?? '–'}
                </td>
              ))}
            </tr>
          ))}
          {dnp.map((r, ri) => (
            <tr key={`dnp-${r.id || ri}`} className="dnp">
              <th scope="row" className="player-col">
                <span className="pname">{r.name}</span>
              </th>
              <td colSpan={group.labels.length}>{r.dnpReason}</td>
            </tr>
          ))}
        </tbody>
        {group.totals.some(Boolean) && (
          <tfoot>
            <tr>
              <th scope="row" className="player-col">Team</th>
              {group.labels.map((_, i) => (
                <td key={i} className={i === pfCol ? 'pf' : undefined}>{group.totals[i] ?? ''}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function TeamBoxScore({ box, league, live, onSelect }: { box: TeamBox; league: League; live: boolean; onSelect: SelectPlayer }) {
  return (
    <section className="card">
      <h2 className="team-heading">
        {box.logo && <img src={box.logo} alt="" />}
        {box.name}
      </h2>
      {box.groups
        .filter((g) => g.rows.length > 0)
        .map((g, i) => (
          <GroupTable key={i} group={g} league={league} live={live} onSelect={onSelect} />
        ))}
    </section>
  )
}

function TeamComparison({ summary }: { summary: GameSummary }) {
  const [a, b] = summary.teamStats
  if (!a || !b || a.stats.length === 0) return null
  const bByLabel = new Map(b.stats.map((s) => [s.label, s.value]))
  return (
    <section className="card">
      <h2>Team stats</h2>
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">{a.abbr}</th>
            <th />
            <th scope="col">{b.abbr}</th>
          </tr>
        </thead>
        <tbody>
          {a.stats.map((s, i) => (
            <tr key={i} className={/foul|penalt/i.test(s.label) ? 'highlight' : undefined}>
              <td>{s.value}</td>
              <th scope="row">{s.label}</th>
              <td>{bByLabel.get(s.label) ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function GameDetail({ league, eventId, backHref }: { league: League; eventId: string; backHref: string }) {
  const { data, error, loading } = usePolling(
    (signal) => fetchSummary(league, eventId, signal),
    `${league.id}:${eventId}`,
    (d) => (d?.game.state === 'in' ? 8_000 : d?.game.state === 'pre' ? 60_000 : 120_000),
  )

  // Rosters change rarely, so they refresh far less often than the game itself.
  const teamIds = data ? [data.game.away.id, data.game.home.id].filter(Boolean) : []
  const rosterFeed = usePolling<TeamRosters>(
    async (signal) => {
      const lists = await Promise.all(teamIds.map((id) => fetchRoster(league, id, signal).catch(() => [])))
      return Object.fromEntries(teamIds.map((id, i) => [id, lists[i]]))
    },
    `${league.id}:${teamIds.join(',')}`,
    () => 5 * 60_000,
  )
  const rosters = rosterFeed.data ?? {}

  const [selected, setSelected] = useState<{ teamId: string; playerId: string } | null>(null)
  const closePanel = useCallback(() => setSelected(null), [])
  const selectedBox = selected ? data?.boxes.find((b) => b.teamId === selected.teamId) : undefined
  const selectedTeam = selected && data ? [data.game.away, data.game.home].find((t) => t.id === selected.teamId) : undefined
  // The player may come from the box score, the roster, or both.
  const selectedPlayer: PanelPlayer | undefined = selected
    ? selectedBox?.groups.flatMap((g) => g.rows).find((r) => r.id === selected.playerId) ??
      rosters[selected.teamId]?.find((p) => p.id === selected.playerId)
    : undefined

  return (
    <div className="detail">
      <a className="back" href={backHref}>← {league.name} scores</a>
      {loading && <p className="notice">Loading game…</p>}
      {error && <p className="notice error">Couldn’t refresh this game ({error}). Retrying…</p>}
      {data && (
        <>
          <section className="card hero">
            <div className="card-top">
              <StatusPill game={data.game} />
              <span className="meta">
                {[data.game.venue, data.game.broadcast, data.game.spread].filter(Boolean).join(' · ')}
              </span>
            </div>
            <LineScore game={data.game} league={league} large />
            <HalfTotals game={data.game} league={league} detailed />
            {data.game.situation?.text && <div className="situation">{data.game.situation.text}</div>}
            {data.game.situation?.lastPlay && <div className="last-play">{data.game.situation.lastPlay}</div>}
          </section>

          <GameInjuries summary={data} league={league} rosters={rosters} />

          {data.boxes.length === 0 ? (
            <p className="notice">
              {data.game.state === 'pre'
                ? 'Player stats will appear here once the game tips off.'
                : 'No player stats are available for this game.'}
            </p>
          ) : (
            <div className="boxes">
              {data.boxes.map((b) => (
                <TeamBoxScore
                  key={b.teamId}
                  box={b}
                  league={league}
                  live={data.game.state === 'in'}
                  onSelect={(playerId) => setSelected({ teamId: b.teamId, playerId })}
                />
              ))}
            </div>
          )}

          {teamIds.length > 0 && (
            <Rosters
              summary={data}
              league={league}
              rosters={rosters}
              onSelect={(teamId, playerId) => setSelected({ teamId, playerId })}
            />
          )}

          {selectedPlayer && (
            <PlayerPanel
              league={league}
              player={selectedPlayer}
              teamName={selectedBox?.name ?? selectedTeam?.name ?? ''}
              box={selectedBox}
              live={data.game.state === 'in'}
              onClose={closePanel}
            />
          )}

          <div className="two-col">
            <TeamComparison summary={data} />
            {data.plays.length > 0 && (
              <section className="card">
                <h2>{league.sport === 'football' ? 'Scoring plays' : 'Latest plays'}</h2>
                <ol className="plays">
                  {data.plays.map((p) => (
                    <li key={p.id} className={p.scoring ? 'scoring' : undefined}>
                      <span className="play-time">
                        {p.period > 0 && periodLabel(league, p.period - 1)} {p.clock}
                      </span>
                      <span className="play-text">{p.text}</span>
                      {p.awayScore !== null && p.homeScore !== null && (
                        <span className="play-score">{p.awayScore}–{p.homeScore}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}
