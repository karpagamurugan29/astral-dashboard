import { useEffect, useState } from 'react'

// A ticking value kept inside a small leaf, so a live clock re-renders only itself —
// never the page or widget around it.
//   <Live>{(now) => clock(start, now)}</Live>          every second
//   <Live every={60000}>{(now) => …}</Live>           every minute
export const useNow = (on = true, ms = 1000) => {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!on) return undefined
        setNow(Date.now())
        const t = setInterval(() => setNow(Date.now()), ms)
        return () => clearInterval(t)
    }, [on, ms])
    return now
}
export const Live = ({ every = 1000, on = true, children }) => children(useNow(on, every))
