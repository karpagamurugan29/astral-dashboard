// Who is still active, remembered for a few seconds. The auth check runs on every request and the
// database is a long round trip away, so a short cache saves that trip on almost every call.
// It is cleared whenever an employee's status changes or an employee is removed (hooks in
// employeeModel.js), so offboarding or deactivating someone takes effect on their very next request
// in this server process; other server instances pick it up within TTL_MS.
const TTL_MS = 30000;
const cache = new Map();

export const clearAuthCache = () => cache.clear();

export const cachedStatus = async (id, load) => {
    const hit = cache.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit.status;
    const status = await load();
    cache.set(id, { status, expiresAt: Date.now() + TTL_MS });
    return status;
};
