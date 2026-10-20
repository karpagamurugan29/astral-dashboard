import React, { useEffect, useRef, useState } from 'react'

// Lightweight animated number — no dependency, just requestAnimationFrame.
export const CountUp = ({ value, duration = 700 }) => {
    const [display, setDisplay] = useState(0)
    const fromRef = useRef(0)

    useEffect(() => {
        const target = Number(value) || 0
        const from = fromRef.current
        const start = performance.now()

        let raf
        const tick = (now) => {
            const progress = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplay(Math.round(from + (target - from) * eased))
            if (progress < 1) {
                raf = requestAnimationFrame(tick)
            } else {
                fromRef.current = target
            }
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    return <span className="kpi-value">{display}</span>
}
