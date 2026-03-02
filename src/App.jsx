import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "/api";

// ─── API helper ────────────────────────────────────────────────────────────────
const api = async (path, options = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
};

// Normalize backend snake_case → camelCase for display
const norm = (d) => ({
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

export default function WiFiManager() {
    const [devices, setDevices] = useState([]);
    const [tab, setTab] = useState("devices");
    const [showModal, setShowModal] = useState(false);
    const [editDevice, setEditDevice] = useState(null); // UUID string or null
    const [search, setSearch] = useState("");
    const [form, setForm] = useState({ name: "", mac: "", owner: "", allocatedMinutes: 60 });
    const [notification, setNotification] = useState(null);
    const [loading, setLoading] = useState(true);
    const [routerOnline, setRouterOnline] = useState(false);
    const [unknownDevices, setUnknownDevices] = useState([]);

    // Ref so fetchRouterStatus can read current devices without a stale closure
    const devicesRef = useRef([]);
    useEffect(() => { devicesRef.current = devices; }, [devices]);

    const notify = (msg, type = "success") => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 3500);
    };

    // ─── Data fetching ─────────────────────────────────────────────────────────
    const fetchDevices = useCallback(async (silent = false) => {
        try {
            const data = await api("/devices");
            setDevices(data.devices.map(norm));
        } catch (e) {
            if (!silent) notify("Could not reach API: " + e.message, "error");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchRouterStatus = useCallback(async () => {
        try {
            const status = await api("/router/status");
            setRouterOnline(status.reachable);
            if (status.reachable) {
                const connData = await api("/router/connected");
                const registered = new Set(devicesRef.current.map(d => d.mac.toUpperCase()));
                setUnknownDevices(connData.connected.filter(c => !registered.has(c.mac.toUpperCase())));
            } else {
                setUnknownDevices([]);
            }
        } catch {
            setRouterOnline(false);
        }
    }, []);

    // Initial load + 30s polling for devices
    useEffect(() => {
        fetchDevices();
        const t = setInterval(() => fetchDevices(true), 30000);
        return () => clearInterval(t);
    }, [fetchDevices]);

    // Initial load + 60s polling for router status
    useEffect(() => {
        fetchRouterStatus();
        const t = setInterval(fetchRouterStatus, 60000);
        return () => clearInterval(t);
    }, [fetchRouterStatus]);

    // ─── Modal helpers ─────────────────────────────────────────────────────────
    const openAdd = () => {
        setForm({ name: "", mac: "", owner: "", allocatedMinutes: 60 });
        setEditDevice(null);
        setShowModal(true);
    };

    const openEdit = (d) => {
        setForm({ name: d.name, mac: d.mac, owner: d.owner, allocatedMinutes: d.allocatedMinutes });
        setEditDevice(d.id);
        setShowModal(true);
    };

    // ─── CRUD actions ──────────────────────────────────────────────────────────
    const saveDevice = async () => {
        try {
            if (editDevice) {
                // PATCH — MAC not editable
                const data = await api(`/devices/${editDevice}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        name: form.name,
                        owner: form.owner,
                        allocated_minutes: parseInt(form.allocatedMinutes) || 60,
                    }),
                });
                setDevices(prev => prev.map(d => d.id === editDevice ? norm(data.device) : d));
                notify("Device updated successfully");
            } else {
                // POST — new device
                const data = await api("/devices", {
                    method: "POST",
                    body: JSON.stringify({
                        name: form.name,
                        mac: form.mac,
                        owner: form.owner,
                        allocated_minutes: parseInt(form.allocatedMinutes) || 60,
                    }),
                });
                setDevices(prev => [...prev, norm(data.device)]);
                notify("Device registered successfully");
            }
            setShowModal(false);
        } catch (e) {
            notify(e.message, "error");
        }
    };

    const removeDevice = async (id) => {
        try {
            await api(`/devices/${id}`, { method: "DELETE" });
            setDevices(prev => prev.filter(d => d.id !== id));
            notify("Device removed");
        } catch (e) {
            notify(e.message, "error");
        }
    };

    const toggleBlock = async (device) => {
        const endpoint = device.status === "blocked" ? "unblock" : "block";
        try {
            const data = await api(`/devices/${device.id}/${endpoint}`, { method: "POST" });
            notify(data.message);
            fetchDevices(true); // refresh list
        } catch (e) {
            notify(e.message, "error");
        }
    };

    const resetTime = async (id) => {
        try {
            const data = await api(`/devices/${id}/reset-time`, { method: "POST" });
            setDevices(prev => prev.map(d => d.id === id ? norm(data.device) : d));
            notify("Time reset");
        } catch (e) {
            notify(e.message, "error");
        }
    };

    // Pre-fill modal MAC from an unknown-device row
    const whitelistUnknown = (mac) => {
        setTab("devices");
        setForm({ name: "", mac, owner: "", allocatedMinutes: 60 });
        setEditDevice(null);
        setShowModal(true);
    };

    // ─── Derived state ─────────────────────────────────────────────────────────
    const filtered = devices.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.mac.toLowerCase().includes(search.toLowerCase()) ||
        d.owner.toLowerCase().includes(search.toLowerCase())
    );

    const stats = {
        total: devices.length,
        connected: devices.filter(d => d.status === "connected").length,
        blocked: devices.filter(d => d.status === "blocked").length,
        timeExpired: devices.filter(d => d.usedMinutes >= d.allocatedMinutes).length,
    };

    const statusColor = (s) => ({ connected: "#00e5a0", blocked: "#ff4757", disconnected: "#778ca3", expired: "#ffb300" }[s] || "#778ca3");
    const statusBg = (s) => ({ connected: "rgba(0,229,160,0.12)", blocked: "rgba(255,71,87,0.12)", disconnected: "rgba(119,140,163,0.12)", expired: "rgba(255,179,0,0.12)" }[s]);
    const pct = (d) => d.allocatedMinutes === 0 ? 100 : Math.min(100, Math.round((d.usedMinutes / d.allocatedMinutes) * 100));
    const fmtTime = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

    return (
        <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e0e6f0", fontFamily: "'Courier New', monospace" }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@600;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0e1a; } ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }
        .btn { border: none; cursor: pointer; border-radius: 4px; font-family: 'Space Mono', monospace; font-size: 12px; transition: all 0.15s; }
        .btn:hover { filter: brightness(1.2); transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; filter: none; }
        .card { background: #0f1628; border: 1px solid #1a2a45; border-radius: 8px; }
        .tab-btn { background: none; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 12px; padding: 10px 20px; color: #4a6080; transition: all 0.2s; border-bottom: 2px solid transparent; letter-spacing: 1px; }
        .tab-btn.active { color: #00e5a0; border-bottom-color: #00e5a0; }
        .tab-btn:hover:not(.active) { color: #8099bf; }
        .input { background: #0a0e1a; border: 1px solid #1e3a5f; border-radius: 4px; color: #e0e6f0; padding: 10px 12px; font-family: 'Space Mono', monospace; font-size: 12px; width: 100%; outline: none; transition: border-color 0.2s; }
        .input:focus { border-color: #00e5a0; }
        .input[readonly] { opacity: 0.5; cursor: not-allowed; }
        .progress-bar { height: 4px; background: #1a2a45; border-radius: 2px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
        .device-row { border-bottom: 1px solid #0f1a2e; padding: 16px; transition: background 0.15s; }
        .device-row:hover { background: #0f1a2e; }
        .device-row:last-child { border-bottom: none; }
        .notification { position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 6px; font-size: 12px; font-family: 'Space Mono', monospace; z-index: 9999; animation: slideIn 0.3s ease; }
        @keyframes slideIn { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: translateX(0); } }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
        .blink { animation: blink 1.2s infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .spin { display: inline-block; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

            {notification && (
                <div className="notification" style={{ background: notification.type === "error" ? "#2a0f15" : "#0f2a1e", border: `1px solid ${notification.type === "error" ? "#ff4757" : "#00e5a0"}`, color: notification.type === "error" ? "#ff4757" : "#00e5a0" }}>
                    {notification.type === "error" ? "✗" : "✓"} {notification.msg}
                </div>
            )}

            {/* Header */}
            <div style={{ borderBottom: "1px solid #1a2a45", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #00e5a0, #0066ff)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⊛</div>
                    <div>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: 2, color: "#fff" }}>NETGUARD</div>
                        <div style={{ fontSize: 10, color: "#4a6080", letterSpacing: 3 }}>MAC ACCESS CONTROL SYSTEM</div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className={routerOnline ? "blink" : ""} style={{ width: 8, height: 8, borderRadius: "50%", background: routerOnline ? "#00e5a0" : "#ff4757" }}></div>
                    <span style={{ fontSize: 11, color: routerOnline ? "#00e5a0" : "#ff4757", letterSpacing: 2 }}>
                        {routerOnline ? "ROUTER ONLINE" : "ROUTER OFFLINE"}
                    </span>
                </div>
            </div>

            <div style={{ padding: "24px 32px" }}>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
                    {[
                        { label: "REGISTERED", value: stats.total, color: "#0088ff", icon: "◈" },
                        { label: "CONNECTED", value: stats.connected, color: "#00e5a0", icon: "◉" },
                        { label: "BLOCKED", value: stats.blocked, color: "#ff4757", icon: "⊗" },
                        { label: "TIME EXPIRED", value: stats.timeExpired, color: "#ffb300", icon: "⏱" },
                    ].map(s => (
                        <div key={s.label} className="card" style={{ padding: "20px", position: "relative", overflow: "hidden" }}>
                            <div style={{ position: "absolute", right: 16, top: 16, fontSize: 24, color: s.color, opacity: 0.15 }}>{s.icon}</div>
                            <div style={{ fontSize: 32, fontWeight: 700, color: s.color, fontFamily: "'Syne', sans-serif" }}>
                                {loading ? <span className="spin" style={{ fontSize: 20 }}>⟳</span> : s.value}
                            </div>
                            <div style={{ fontSize: 10, color: "#4a6080", letterSpacing: 2, marginTop: 4 }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div style={{ borderBottom: "1px solid #1a2a45", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex" }}>
                        {[
                            ["devices", "MANAGED DEVICES"],
                            ["unknown", `UNKNOWN DEVICES${unknownDevices.length ? ` (${unknownDevices.length})` : ""}`],
                        ].map(([key, label]) => (
                            <button key={key} className={`tab-btn ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</button>
                        ))}
                    </div>
                    {!routerOnline && (
                        <span style={{ fontSize: 10, color: "#4a6080", letterSpacing: 1 }}>
                            ⚠ No router — configure via <code style={{ color: "#8099bf" }}>POST /config</code>
                        </span>
                    )}
                </div>

                {/* ── Managed Devices Tab ─────────────────────────────────────────────── */}
                {tab === "devices" && (
                    <>
                        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                            <input className="input" placeholder="Search by name, MAC, or owner..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
                            <button className="btn" onClick={openAdd} style={{ background: "#00e5a0", color: "#0a0e1a", padding: "10px 20px", fontWeight: 700, letterSpacing: 1 }}>+ ADD DEVICE</button>
                        </div>

                        <div className="card">
                            {/* Table header */}
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.8fr 1.5fr 1.5fr 1fr 140px", gap: 8, padding: "12px 16px", borderBottom: "1px solid #1a2a45", fontSize: 10, color: "#4a6080", letterSpacing: 2 }}>
                                <span>DEVICE / OWNER</span><span>MAC ADDRESS</span><span>STATUS</span><span>TIME USAGE</span><span>ADDED</span><span style={{ textAlign: "right" }}>ACTIONS</span>
                            </div>

                            {loading && (
                                <div style={{ padding: 40, textAlign: "center", color: "#4a6080", fontSize: 12 }}>
                                    <span className="spin" style={{ marginRight: 8 }}>⟳</span> Connecting to API...
                                </div>
                            )}
                            {!loading && filtered.length === 0 && (
                                <div style={{ padding: 40, textAlign: "center", color: "#4a6080", fontSize: 12 }}>No devices found</div>
                            )}
                            {!loading && filtered.map(d => (
                                <div key={d.id} className="device-row">
                                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1.8fr 1.5fr 1.5fr 1fr 140px", gap: 8, alignItems: "center" }}>
                                        <div>
                                            <div style={{ fontSize: 13, color: "#e0e6f0", fontWeight: 700 }}>{d.name}</div>
                                            <div style={{ fontSize: 11, color: "#4a6080", marginTop: 2 }}>{d.owner}</div>
                                        </div>
                                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#8099bf", letterSpacing: 1 }}>{d.mac}</div>
                                        <div>
                                            <span style={{ background: statusBg(d.status), color: statusColor(d.status), padding: "3px 10px", borderRadius: 20, fontSize: 10, letterSpacing: 1, fontWeight: 700 }}>
                                                {d.status === "connected" && "● "}{d.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a6080", marginBottom: 5 }}>
                                                <span>{fmtTime(d.usedMinutes)} / {fmtTime(d.allocatedMinutes)}</span>
                                                <span style={{ color: pct(d) >= 100 ? "#ff4757" : pct(d) >= 80 ? "#ffb300" : "#00e5a0" }}>{pct(d)}%</span>
                                            </div>
                                            <div className="progress-bar">
                                                <div className="progress-fill" style={{ width: `${pct(d)}%`, background: pct(d) >= 100 ? "#ff4757" : pct(d) >= 80 ? "#ffb300" : "#00e5a0" }}></div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 11, color: "#4a6080" }}>{d.addedAt}</div>
                                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                            <button className="btn" onClick={() => resetTime(d.id)} title="Reset time" style={{ background: "#1a2a45", color: "#8099bf", padding: "6px 8px" }}>↺</button>
                                            <button className="btn" onClick={() => openEdit(d)} style={{ background: "#1a2a45", color: "#8099bf", padding: "6px 8px" }}>✎</button>
                                            <button className="btn" onClick={() => toggleBlock(d)} style={{ background: d.status === "blocked" ? "rgba(0,229,160,0.15)" : "rgba(255,71,87,0.15)", color: d.status === "blocked" ? "#00e5a0" : "#ff4757", padding: "6px 8px" }}>
                                                {d.status === "blocked" ? "✓" : "⊗"}
                                            </button>
                                            <button className="btn" onClick={() => removeDevice(d.id)} style={{ background: "rgba(255,71,87,0.1)", color: "#ff4757", padding: "6px 8px" }}>✕</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* ── Unknown Devices Tab ──────────────────────────────────────────────── */}
                {tab === "unknown" && (
                    <div className="card">
                        <div style={{ padding: 20, borderBottom: "1px solid #1a2a45" }}>
                            <div style={{ fontSize: 12, color: "#ff4757", letterSpacing: 2 }}>⊗ UNKNOWN CONNECTED DEVICES</div>
                            <div style={{ fontSize: 11, color: "#4a6080", marginTop: 4 }}>
                                {routerOnline
                                    ? "Devices connected to the router that are not in the whitelist"
                                    : "Router offline — configure credentials to detect unknown devices"}
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 160px", gap: 8, padding: "12px 20px", borderBottom: "1px solid #1a2a45", fontSize: 10, color: "#4a6080", letterSpacing: 2 }}>
                            <span>MAC ADDRESS</span><span>IP / HOSTNAME</span><span>INTERFACE</span><span style={{ textAlign: "right" }}>ACTION</span>
                        </div>
                        {unknownDevices.length === 0 && (
                            <div style={{ padding: 40, textAlign: "center", color: "#4a6080", fontSize: 12 }}>
                                {routerOnline ? "No unknown devices currently connected" : "Router offline"}
                            </div>
                        )}
                        {unknownDevices.map((a) => (
                            <div key={a.mac} className="device-row">
                                <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 160px", gap: 8, alignItems: "center" }}>
                                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: "#ff4757" }}>{a.mac}</div>
                                    <div style={{ fontSize: 12, color: "#4a6080" }}>
                                        {a.ip || "—"}{a.hostname ? ` (${a.hostname})` : ""}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#8099bf", textTransform: "uppercase", letterSpacing: 1 }}>{a.interface || "—"}</div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                        <button className="btn" onClick={() => whitelistUnknown(a.mac)} style={{ background: "rgba(0,229,160,0.15)", color: "#00e5a0", padding: "6px 12px", fontSize: 11 }}>+ WHITELIST</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
            {showModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="card" style={{ width: 480, padding: 32 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                            <div>
                                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: "#fff" }}>
                                    {editDevice ? "EDIT DEVICE" : "REGISTER DEVICE"}
                                </div>
                                <div style={{ fontSize: 10, color: "#4a6080", letterSpacing: 2, marginTop: 2 }}>Whitelist a MAC address</div>
                            </div>
                            <button className="btn" onClick={() => setShowModal(false)} style={{ background: "none", color: "#4a6080", fontSize: 18, padding: 4 }}>✕</button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {[
                                ["Device Name", "name", "text", "e.g. John's Laptop"],
                                ["MAC Address", "mac", "text", "AA:BB:CC:DD:EE:FF"],
                                ["Owner Name", "owner", "text", "e.g. John Doe"],
                            ].map(([label, key, type, placeholder]) => (
                                <div key={key}>
                                    <div style={{ fontSize: 10, color: "#4a6080", letterSpacing: 2, marginBottom: 6 }}>
                                        {label}{key === "mac" && editDevice && <span style={{ color: "#ff4757", marginLeft: 8 }}>LOCKED</span>}
                                    </div>
                                    <input
                                        className="input"
                                        type={type}
                                        placeholder={placeholder}
                                        value={form[key]}
                                        readOnly={key === "mac" && !!editDevice}
                                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                    />
                                </div>
                            ))}
                            <div>
                                <div style={{ fontSize: 10, color: "#4a6080", letterSpacing: 2, marginBottom: 6 }}>ALLOCATED TIME (MINUTES)</div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {[30, 60, 120, 180, 240, 480].map(m => (
                                        <button key={m} className="btn" onClick={() => setForm(f => ({ ...f, allocatedMinutes: m }))}
                                            style={{ background: form.allocatedMinutes === m ? "#00e5a0" : "#1a2a45", color: form.allocatedMinutes === m ? "#0a0e1a" : "#8099bf", padding: "7px 14px" }}>
                                            {fmtTime(m)}
                                        </button>
                                    ))}
                                </div>
                                <input className="input" type="number" min="1" value={form.allocatedMinutes}
                                    onChange={e => setForm(f => ({ ...f, allocatedMinutes: parseInt(e.target.value) || 60 }))}
                                    style={{ marginTop: 8 }} placeholder="Or enter custom minutes" />
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
                            <button className="btn" onClick={() => setShowModal(false)} style={{ flex: 1, background: "#1a2a45", color: "#8099bf", padding: 12 }}>CANCEL</button>
                            <button className="btn" onClick={saveDevice} style={{ flex: 2, background: "#00e5a0", color: "#0a0e1a", padding: 12, fontWeight: 700, letterSpacing: 1 }}>
                                {editDevice ? "SAVE CHANGES" : "REGISTER DEVICE"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}