// Ask the browser for the user's current position. Resolves { latitude, longitude, accuracy, device };
// rejects with an Error whose message is ready to show the user.
export const getCurrentLocation = () => new Promise((resolve, reject) => {
  if (!window.isSecureContext) {
    reject(new Error("Location needs a secure (https) connection. Open the app over https and try again."));
    return;
  }
  if (!navigator.geolocation) {
    reject(new Error("This browser can't share your location. Use an up-to-date Chrome, Edge, Safari or Firefox."));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy),
      device: navigator.userAgent.slice(0, 180),
    }),
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new Error("Location permission is required. Click the lock / location icon in your browser's address bar, allow location for this site, then try again."));
      } else if (err.code === err.TIMEOUT) {
        reject(new Error("Finding your location took too long. Check that location (GPS) is switched on and try again."));
      } else {
        reject(new Error("Your location could not be found. Switch on location (GPS) on your device and try again."));
      }
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
  );
});

export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
