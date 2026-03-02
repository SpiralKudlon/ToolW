import { timeAgo } from "../utils/format.jsx";

export default function Dashboard({ devices, routerStatus, syncStatus, loading, onSync, onPushWhitelist, onDisableFilter, onNavigate, syncing }) {
    const rs = routerStatus;
    const router = rs?.router || {};
    const mf = rs?.mac_filter || {};
    const online = rs?.reachable;

    const stats = [
        { label: "REGISTERED", value: devices.length, color: "#0088ff", icon: "◈", filter: "all" },
        { label: "CONNECTED", value: devices.filter(d => d.status === "connected").length, color: "#00e5a0", icon: "◉", filter: "connected" },
        { label: "BLOCKED", value: devices.filter(d => d.status === "blocked").length, color: "#ff4757", icon: "⊗", filter: "blocked" },
        { label: "TIME EXPIRED", value: devices.filter(d => d.usedMinutes >= d.allocatedMinutes).length, color: "#ffb300", icon: "⏱", filter: "expired" },
    ];

    return (
        <div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 24 }}>Dashboard</h2>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
                {stats.map(s => (
                    <div key={s.label} className="card" style={{ padding: 20, cursor: "pointer", overflow: "hidden" }} onClick={() => onNavigate("devices", s.filter)}>
                        <div style={{ position: "absolute", right: 14, top: 14, fontSize: 28, color: s.color, opacity: 0.1 }}>{s.icon}</div>
                        <div style={{ fontSize: 34, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: s.color }}>
                            {loading ? <span className="spin" style={{ fontSize: 20 }}>⟳</span> : s.value}
                        </div>
                        <div style={{ fontSize: 9, color: "#4a6080", letterSpacing: 2, marginTop: 6 }}>{s.label}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {/* Router status */}
                <div className="card" style={{ padding: 22 }}>
                    <div className="section-label">ROUTER STATUS</div>
                    <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, color: online ? "#00e5a0" : "#ff4757", background: online ? "rgba(0,229,160,0.1)" : "rgba(255,71,87,0.1)" }}>
                            {online ? "● ONLINE" : "○ OFFLINE"}
                        </span>
                    </div>
                    {online ? (
                        <table className="stat-table">
                            <tbody>
                                {[["WAN IP", router.wan_ip], ["Network", router.network_type], ["Signal", router.signal_strength != null ? `${router.signal_strength}/5` : null],
                                ["MAC Filter", mf.mode?.toUpperCase()], ["Allowed MACs", mf.entries?.length], ["Connected", rs?.connected_devices]]
                                    .filter(([, v]) => v != null).map(([k, v]) => (
                                        <tr key={k}><td>{k}</td><td>{v}</td></tr>
                                    ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ color: "#4a6080", fontSize: 12 }}>
                            {rs?.error || "Configure router credentials to enable sync."}<br />
                            <button className="btn btn-secondary" onClick={() => onNavigate("router")} style={{ marginTop: 12, fontSize: 10 }}>⚙ Configure Router</button>
                        </div>
                    )}
                </div>

                {/* Sync status */}
                <div className="card" style={{ padding: 22 }}>
                    <div className="section-label">BACKGROUND SYNC</div>
                    <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, color: syncStatus?.running ? "#00e5a0" : "#778ca3", background: syncStatus?.running ? "rgba(0,229,160,0.1)" : "rgba(119,140,163,0.1)" }}>
                            {syncStatus?.running ? "● RUNNING" : "○ IDLE"}
                        </span>
                    </div>
                    <table className="stat-table">
                        <tbody>
                            {[["Last Sync", syncStatus ? timeAgo(syncStatus.last_sync) : "—"], ["Total Syncs", syncStatus?.sync_count ?? "—"],
                            ["Poll Interval", syncStatus ? `${syncStatus.poll_interval}s` : "—"], ["Last Error", syncStatus?.last_error || "None"]]
                                .map(([k, v]) => (
                                    <tr key={k}><td>{k}</td>
                                        <td style={{ color: k === "Last Error" && syncStatus?.last_error ? "#ff4757" : "#e0e6f0" }}>{v}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick actions */}
            <div className="card" style={{ padding: 22 }}>
                <div className="section-label">QUICK ACTIONS</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button className="btn btn-primary" onClick={onSync} disabled={syncing || !online}>
                        <span className={syncing ? "spin" : ""}>⟳</span>{syncing ? "Syncing..." : "Force Sync"}
                    </button>
                    <button className="btn btn-secondary" onClick={onPushWhitelist} disabled={!online}>↑ Push Whitelist</button>
                    <button className="btn btn-danger-outline" onClick={onDisableFilter} disabled={!online}>⊘ Disable MAC Filter</button>
                    <button className="btn btn-secondary" onClick={() => onNavigate("devices")}>◈ Manage Devices</button>
                    <button className="btn btn-secondary" onClick={() => onNavigate("router")}>⚙ Router Config</button>
                </div>
            </div>
        </div>
    );
}
