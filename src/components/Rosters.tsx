import type { GameInjury, GameSummary, RosterPlayer, TeamLine } from '../api'
import { periodLabel, type League } from '../leagues'

export type TeamRosters = Record<string, RosterPlayer[]>

type Tone = 'ok' | 'warn' | 'out' | 'injured'
interface Availability {
  active: boolean
  label: string
  tone: Tone
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)\.?$/i

/** Football plays name players like "D.Deablo"; match that to "Divine Deablo" on the team's roster. */
function matchesShortName(short: string, full: string): boolean {
  const dot = short.indexOf('.')
  if (dot < 1) return letters(short) === letters(full)
  const [first, ...rest] = full.replace(SUFFIX, '').trim().split(/\s+/)
  return (
    letters(short.slice(0, dot)) === letters(first).slice(0, dot) &&
    letters(short.slice(dot + 1).replace(SUFFIX, '')) === letters(rest.join(''))
  )
}

function rosterPlayerFor(injury: GameInjury, rosters: TeamRosters): RosterPlayer | undefined {
  const team = injury.teamId ? rosters[injury.teamId] ?? [] : []
  return injury.playerId
    ? team.find((p) => p.id === injury.playerId)
    : team.find((p) => matchesShortName(injury.playerName, p.name))
}

const when = (injury: GameInjury, league: League) =>
  [injury.period > 0 && periodLabel(league, injury.period - 1), injury.clock].filter(Boolean).join(' ')

/** Players hurt during this game, with the quarter and clock. */
export function GameInjuries({ summary, league, rosters }: { summary: GameSummary; league: League; rosters: TeamRosters }) {
  if (summary.gameInjuries.length === 0) return null
  return (
    <section className="card injuries-card">
      <h2>Injured this game</h2>
      <ul>
        {summary.gameInjuries.map((injury) => {
          const player = rosterPlayerFor(injury, rosters)
          return (
            <li key={injury.key}>
              <div className="inj-main">
                <span className="inj-name">
                  {player?.name ?? injury.playerName}
                  <span className="pmeta">{[player?.position, injury.teamAbbr].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="inj-when">
                  {injury.source === 'report' && <small>reported </small>}
                  {when(injury, league) || 'during game'}
                </span>
              </div>
              <p className="inj-note">{injury.note}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const RULED_OUT = /^(out|injured reserve|doubtful|suspen|physically unable|non-football)/i
const INACTIVE_GROUP: Record<string, string> = {
  injuredReserveOrOut: 'Injured reserve / out',
  suspended: 'Suspended',
  practiceSquad: 'Practice squad',
}

function TeamRoster({
  team, players, summary, league, onSelect,
}: {
  team: TeamLine
  players: RosterPlayer[]
  summary: GameSummary
  league: League
  onSelect: (playerId: string) => void
}) {
  const started = summary.game.state !== 'pre'
  const live = summary.game.state === 'in'
  const basketball = league.sport === 'basketball'
  const box = summary.boxes.find((b) => b.teamId === team.id)
  const boxRows = new Map((box?.groups ?? []).flatMap((g) => g.rows.map((r) => [r.id, r] as const)))
  const reports = new Map(summary.injuries.filter((i) => i.teamId === team.id).map((i) => [i.playerId, i]))
  const hurtToday = summary.gameInjuries.filter((i) => i.teamId === team.id)

  const availability = (p: RosterPlayer): Availability => {
    const hurt = hurtToday.find((i) => (i.playerId ? i.playerId === p.id : matchesShortName(i.playerName, p.name)))
    if (hurt) return { active: false, tone: 'injured', label: `Injured this game · ${when(hurt, league)}` }

    const row = boxRows.get(p.id)
    // The injury report is today's, not this game's. Anyone who took part in the game was
    // active for it, whatever the report says now.
    if (started && row && !row.dnpReason) {
      return { active: true, tone: 'ok', label: live && row.onCourt ? 'On the floor' : live ? '' : 'Played' }
    }

    const report = reports.get(p.id)
    const status = report?.status ?? p.injuryStatus
    const designation = status ? [status, report?.detail].filter(Boolean).join(' · ') : ''
    if (INACTIVE_GROUP[p.group]) return { active: false, tone: 'out', label: designation || INACTIVE_GROUP[p.group] }
    if (status && RULED_OUT.test(status)) return { active: false, tone: 'out', label: designation }

    if (row?.dnpReason) return { active: false, tone: 'out', label: `Did not play · ${row.dnpReason.toLowerCase()}` }
    // Basketball box scores list everyone in uniform, so absence means inactive.
    // Football box scores only list players who recorded a stat, so absence says nothing.
    if (basketball && started && box && !row) return { active: false, tone: 'out', label: 'Inactive' }

    if (designation) return { active: true, tone: 'warn', label: designation }
    if (live && row?.onCourt) return { active: true, tone: 'ok', label: 'On the floor' }
    return { active: true, tone: 'ok', label: '' }
  }

  const rated = players.map((p) => ({ p, a: availability(p) }))
  const inactive = rated.filter((x) => !x.a.active).sort((x, y) => Number(y.a.tone === 'injured') - Number(x.a.tone === 'injured'))
  const active = rated.filter((x) => x.a.active)

  const row = ({ p, a }: (typeof rated)[number]) => (
    <li key={p.id} className={`tone-${a.tone}`} onClick={() => onSelect(p.id)}>
      <span className="r-name">
        {/* A real button so the player can be opened from the keyboard too */}
        <button>{p.name}</button>
        <span className="pmeta">{[p.jersey && `#${p.jersey}`, p.position].filter(Boolean).join(' ')}</span>
      </span>
      {a.label && <span className="r-status">{a.label}</span>}
    </li>
  )

  return (
    <section className="card roster">
      <h2 className="team-heading">
        {team.logo && <img src={team.logo} alt="" />}
        {team.name} roster
      </h2>
      {players.length === 0 ? (
        <p className="notice">Roster isn’t available for this team.</p>
      ) : (
        <>
          <h3 className="r-head out">Inactive <span>{inactive.length}</span></h3>
          {inactive.length > 0 ? <ul className="r-list">{inactive.map(row)}</ul> : <p className="r-none">No one listed as out.</p>}
          {/* Football rosters run past 50 active players, so that list starts collapsed. */}
          <details open={basketball}>
            <summary className="r-head ok">Active <span>{active.length}</span></summary>
            <ul className="r-list">{active.map(row)}</ul>
          </details>
        </>
      )}
    </section>
  )
}

/** Both teams' full rosters, split into who is active and who is not. */
export function Rosters({
  summary, league, rosters, onSelect,
}: {
  summary: GameSummary
  league: League
  rosters: TeamRosters
  onSelect: (teamId: string, playerId: string) => void
}) {
  return (
    <div className="boxes">
      {[summary.game.away, summary.game.home].map((team) => (
        <TeamRoster
          key={team.id}
          team={team}
          players={rosters[team.id] ?? []}
          summary={summary}
          league={league}
          onSelect={(playerId) => onSelect(team.id, playerId)}
        />
      ))}
    </div>
  )
}
