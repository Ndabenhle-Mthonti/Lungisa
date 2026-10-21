import { useEffect, useRef, useState } from 'react'
import './usePullToRefresh.css'

const RELEASE_AT = 72

// Pull down from the top of the page to reload. A normal scroll is left alone.
export function usePullToRefresh(onRefresh) {
  const [label, setLabel] = useState('')
  const startY = useRef(null)
  const distance = useRef(0)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    function reset() {
      startY.current = null
      distance.current = 0
      setLabel('')
    }

    function onStart(event) {
      if (window.scrollY > 8 || event.touches.length !== 1) return
      startY.current = event.touches[0].clientY
      distance.current = 0
    }

    function onMove(event) {
      if (startY.current == null) return
      if (window.scrollY > 8) {
        reset()
        return
      }
      const delta = event.touches[0].clientY - startY.current
      if (delta < 12) return
      distance.current = delta
      setLabel(delta >= RELEASE_AT ? 'Release to refresh' : 'Pull to refresh')
    }

    function onEnd() {
      const shouldRefresh = distance.current >= RELEASE_AT
      reset()
      if (!shouldRefresh) return
      setLabel('Refreshing')
      Promise.resolve(onRefreshRef.current()).finally(() => setLabel(''))
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])

  return label
}
