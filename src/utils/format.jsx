export const STATUS_COLORS = {
    connected: "#00e5a0",
    blocked: "#ff4757",
    disconnected: "#778ca3",
    expired: "#ffb300",
};

export const STATUS_BG = {
    connected: "rgba(0,229,160,0.12)",
    blocked: "rgba(255,71,87,0.12)",
    disconnected: "rgba(119,140,163,0.12)",
    expired: "rgba(255,179,0,0.12)",
};

export const pct = (d) =>
    !d || d.allocatedMinutes === 0
        ? 100
        : Math.min(100, Math.round((d.usedMinutes / d.allocatedMinutes) * 100));

export const fmtTime = (m) => {
    if (m === null || m === undefined) return "—";
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export const timeAgo = (ts) => {
    if (!ts) return "never";
    const s = Math.floor(Date.now() / 1000 - ts);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
};

export function StatusPill({ status }) {
    return (
        <span style={{
            background: STATUS_BG[status] || STATUS_BG.disconnected,
            color: STATUS_COLORS[status] || STATUS_COLORS.disconnected,
            padding: "3px 10px", borderRadius: 20,
            fontSize: 9, letterSpacing: 1, fontWeight: 700, whiteSpace: "nowrap",
        }}>
            {status === "connected" && "● "}{(status || "unknown").toUpperCase()}
        </span>
    );
}
