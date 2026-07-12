import { useMemo, useState } from 'react'

export function useLocalReaction(key: string) {
  const storageKey = `tjyzphysics:liked:${key}`
  const initial = useMemo(() => {
    try { return localStorage.getItem(storageKey) === 'true' } catch { return false }
  }, [storageKey])
  const [liked, setLiked] = useState(initial)
  const toggle = () => {
    const next = !liked
    setLiked(next)
    try { localStorage.setItem(storageKey, String(next)) } catch { /* private storage */ }
  }
  return { liked, toggle }
}
