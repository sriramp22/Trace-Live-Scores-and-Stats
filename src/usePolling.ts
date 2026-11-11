import { useEffect, useRef, useState } from 'react'

export interface Polled<T> {
  data: T | null
  error: string | null
  loading: boolean
  updatedAt: number | null
}

/**
 * Fetches immediately, then re-fetches on an interval chosen from the latest
 * data (so live games can poll faster than idle slates). Restarts from scratch
 * when `key` changes, and backs off while the tab is hidden.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  key: string,
  intervalMs: (data: T | null) => number,
): Polled<T> {
  const [state, setState] = useState<Polled<T>>({ data: null, error: null, loading: true, updatedAt: null })
  const fetcherRef = useRef(fetcher)
  const intervalRef = useRef(intervalMs)
  fetcherRef.current = fetcher
  intervalRef.current = intervalMs

  useEffect(() => {
    const ctrl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let inFlight = false
    let latest: T | null = null
    setState({ data: null, error: null, loading: true, updatedAt: null })

    const tick = async () => {
      if (inFlight) return
      inFlight = true
      try {
        latest = await fetcherRef.current(ctrl.signal)
        if (ctrl.signal.aborted) return
        setState({ data: latest, error: null, loading: false, updatedAt: Date.now() })
      } catch (e) {
        if (ctrl.signal.aborted) return
        // Keep showing the last good data; surface the error alongside it.
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
      } finally {
        inFlight = false
        if (!ctrl.signal.aborted) {
          timer = setTimeout(tick, document.hidden ? 60_000 : intervalRef.current(latest))
        }
      }
    }

    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer)
        void tick()
      }
    }

    void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [key])

  return state
}
