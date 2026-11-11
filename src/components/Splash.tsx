import { useEffect, useState } from 'react'

const HOLD_MS = 1500 // fully visible while the mark draws itself
const FADE_MS = 350 // must match the .splash.leaving transition in styles.css

/**
 * Brief welcome screen shown once per launch: the Trace mark draws itself, then
 * the screen fades away to the scoreboard loading underneath. A tap skips it.
 */
export function Splash() {
  const [phase, setPhase] = useState<'showing' | 'leaving' | 'gone'>('showing')

  useEffect(() => {
    if (phase === 'gone') return
    const timer = setTimeout(() => setPhase(phase === 'showing' ? 'leaving' : 'gone'), phase === 'showing' ? HOLD_MS : FADE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  if (phase === 'gone') return null

  return (
    <div className={`splash${phase === 'leaving' ? ' leaving' : ''}`} onClick={() => setPhase('leaving')} role="presentation">
      <svg className="splash-mark" viewBox="0 0 100 100" aria-hidden="true">
        {/* pathLength lets the stroke be "drawn" with a 0-to-1 dash offset, whatever its real length */}
        <path d="M14 56 H33 L43 27 L56 78 L65 56 H80" pathLength={1} />
        <circle cx="80" cy="56" r="7" />
      </svg>
      <h1 className="splash-name">Trace</h1>
      <p className="splash-tag">Live scores and stats</p>
    </div>
  )
}
