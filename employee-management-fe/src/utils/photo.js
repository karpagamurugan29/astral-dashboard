import { API_URL } from './Constants'

// Uploaded photos are stored as "/photos/<id>" on the API; seed data points everyone at the same
// stock image, which counts as "no photo".
export const hasRealPhoto = (src) => !!src && !/avatar-\d+\.jpg$/.test(src)
export const photoSrc = (src) => (src && src.startsWith('/photos/') ? `${API_URL}${src}` : src)

// Crop the centre square and shrink it, so uploads stay small and every avatar is round-ready.
export const squarePhoto = (file, size = 480) => new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file?.type || '')) return reject(new Error('Use a JPG, PNG or WebP image.'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
        const side = Math.min(img.width, img.height)
        const out = Math.min(size, side)
        const c = document.createElement('canvas')
        c.width = out; c.height = out
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out)
        URL.revokeObjectURL(url)
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t read that image.'))), 'image/jpeg', 0.88)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn’t read that image.')) }
    img.src = url
})
