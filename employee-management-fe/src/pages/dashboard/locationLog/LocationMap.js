import React, { useEffect, useRef, useState } from 'react'

/* -------------------------------------------------------------------------- */
/*  Leaflet map of located events. Leaflet ships with the theme under         */
/*  public/assets/libs, so it's loaded on demand instead of bundled.          */
/* -------------------------------------------------------------------------- */

let leafletPromise = null
const loadLeaflet = () => {
    if (window.L) return Promise.resolve(window.L)
    if (!leafletPromise) {
        leafletPromise = new Promise((resolve, reject) => {
            const css = document.createElement('link')
            css.rel = 'stylesheet'
            css.href = '/assets/libs/leaflet/leaflet.css'
            document.head.appendChild(css)
            const js = document.createElement('script')
            js.src = '/assets/libs/leaflet/leaflet.js'
            js.onload = () => resolve(window.L)
            js.onerror = () => { leafletPromise = null; reject(new Error('Map failed to load')) }
            document.body.appendChild(js)
        })
    }
    return leafletPromise
}

const escape = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// points: [{ id, lat, lng, color, title, subtitle }]
export const LocationMap = ({ points, selectedId, onSelect }) => {
    const box = useRef(null)
    const map = useRef(null)
    const layer = useRef(null)
    const markers = useRef({})
    const [failed, setFailed] = useState(false)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let cancelled = false
        loadLeaflet().then((L) => {
            if (cancelled || !box.current || map.current) return
            map.current = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([20.59, 78.96], 4)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors',
            }).addTo(map.current)
            layer.current = L.layerGroup().addTo(map.current)
            setReady(true)
        }).catch(() => !cancelled && setFailed(true))
        return () => {
            cancelled = true
            if (map.current) { map.current.remove(); map.current = null }
        }
    }, [])

    // Redraw markers whenever the filtered set changes, and frame them all.
    useEffect(() => {
        const L = window.L
        if (!ready || !L) return
        layer.current.clearLayers()
        markers.current = {}
        points.forEach((p) => {
            const m = L.circleMarker([p.lat, p.lng], { radius: 8, weight: 3, color: '#fff', fillColor: p.color, fillOpacity: 1 })
                .bindPopup(`<b>${escape(p.title)}</b><br/><span style="color:#64748b">${escape(p.subtitle)}</span>`)
                .on('click', () => onSelect?.(p.id))
            m.addTo(layer.current)
            markers.current[p.id] = m
        })
        if (points.length === 1) map.current.setView([points[0].lat, points[0].lng], 16)
        else if (points.length > 1) map.current.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 16 })
        // Leaflet measures its box on creation; re-measure in case the layout shifted since.
        setTimeout(() => map.current?.invalidateSize(), 50)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, ready])

    // Fly to and highlight the selected event.
    useEffect(() => {
        if (!ready || !selectedId) return
        Object.entries(markers.current).forEach(([id, m]) => m.setStyle({ radius: id === selectedId ? 12 : 8 }))
        const m = markers.current[selectedId]
        if (m) {
            m.bringToFront()
            map.current.setView(m.getLatLng(), Math.max(map.current.getZoom(), 15), { animate: true })
            m.openPopup()
        }
    }, [selectedId, ready])

    if (failed) return <div className="ll-map ll-map-fail"><i className="mdi mdi-map-marker-off-outline"></i>The map could not be loaded.</div>
    return <div className="ll-map" ref={box} role="region" aria-label="Map of locations"></div>
}
