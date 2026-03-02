const NAV = [
    { key: "dashboard", label: "DASHBOARD", icon: "⊞" },
    { key: "devices", label: "DEVICES", icon: "◈" },
    { key: "router", label: "ROUTER", icon: "⊕" },
    { key: "unknown", label: "UNKNOWN", icon: "⊗" },
];

export default function Sidebar({ view, setView, routerOnline, deviceCount, unknownCount }) {
    return (
        <aside className="sidebar">
            {/* Logo */}
            <div style={{ padding: "22px 20px", borderBottom: "1px solid #1a2a45" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#00e5a0,#0066ff)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>⊛</div>
                    <div>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: 2, color: "#fff" }}>NETGUARD</div>
                        <div style={{ fontSize: 8, color: "#4a6080", letterSpacing: 2 }}>MAC ACCESS CONTROL</div>
                    </div>
                </div>
            </div>

            {/* Nav */}
            <nav style={{ padding: "12px 0", flex: 1 }}>
                {NAV.map(({ key, label, icon }) => {
                    const badge = key === "devices" ? deviceCount : key === "unknown" ? unknownCount || null : null;
                    return (
                        <div key={key} className={`nav-item ${view === key ? "active" : ""}`} onClick={() => setView(key)}>
                            <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{icon}</span>
                            <span>{label}</span>
                            {badge != null && <span className="nav-badge">{badge}</span>}
                        </div>
                    );
                })}
            </nav>

            {/* Router status */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #1a2a45" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className={routerOnline ? "blink" : ""} style={{ width: 7, height: 7, borderRadius: "50%", background: routerOnline ? "#00e5a0" : "#ff4757", flexShrink: 0 }} />
                    <span style={{ fontSize: 9, color: routerOnline ? "#00e5a0" : "#ff4757", letterSpacing: 1.5 }}>
                        {routerOnline ? "ROUTER ONLINE" : "ROUTER OFFLINE"}
                    </span>
                </div>
            </div>
        </aside>
    );
}
