const API_BASE = "/api";

export const api = async (path, options = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
};

export const norm = (d) => ({
    id: d.id,
    name: d.name,
    mac: d.mac,
    owner: d.owner,
    allocatedMinutes: d.allocated_minutes,
    usedMinutes: d.used_minutes,
    status: d.status,
    addedAt: d.added_at ? d.added_at.split("T")[0] : "",
    lastSeen: d.last_seen,
    ipAddress: d.ip_address,
});
