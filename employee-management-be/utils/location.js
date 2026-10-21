// Location helpers for check-in/out and audit timers.

const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

// Validated { latitude, longitude, accuracy } from a request body, or null when missing/invalid.
export const parseLocation = (body = {}) => {
    const latitude = num(body.latitude);
    const longitude = num(body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    const accuracy = num(body.accuracy);
    return {
        latitude,
        longitude,
        accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : undefined,
    };
};

export const LOCATION_REQUIRED =
    "Location is required. Allow location access for this site in your browser and try again.";

// Reverse-geocode to a readable address via OpenStreetMap Nominatim. Best-effort: returns ""
// on any failure or after 5s, and caches by ~10 m grid so repeat check-ins from the same
// office don't hit the service again.
const cache = new Map();
export const reverseGeocode = async (latitude, longitude) => {
    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    if (cache.has(key)) return cache.get(key);
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&namedetails=0&lat=${latitude}&lon=${longitude}`,
            { headers: { "User-Agent": "Astral-Consulting-HRMS/1.0", "Accept-Language": "en" }, signal: ctrl.signal }
        );
        clearTimeout(timer);
        if (!res.ok) return "";
        const data = await res.json();
        const address = data?.display_name || "";
        if (address) {
            if (cache.size > 2000) cache.clear();
            cache.set(key, address);
        }
        return address;
    } catch {
        return "";
    }
};

// Fill in a missing address after the response has gone out, so geocoding never slows the action.
export const fillAddressLater = (location, save) => {
    if (!location || location.address) return;
    reverseGeocode(location.latitude, location.longitude)
        .then((address) => address && save(address))
        .catch(() => {});
};
