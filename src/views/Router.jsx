import { useState, useEffect } from "react";
import { timeAgo } from "../utils/format.jsx";

export default function RouterView({ routerStatus, syncStatus, configData, onSaveConfig, onSync, onPushWhitelist, onDisableFilter, syncing }) {
    const [form, setForm] = useState({ host: "192.168.100.1", username: "root", password: "" });
    const [showPass, setShowPass] = useState(false);
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (configData) setForm(f => ({ host: configData.host || f.host, username: configData.username || f.username, password: "" }));
    }, [configData]);

    const handleSave = async () => {
        setTesting(true); setResult(null);
        const r = await onSaveConfig(form);
        setResult(r); setTesting(false);
    };

    const online = routerStatus?.reachable;
    const router = routerStatus?.router || {};
    const mf = routerStatus?.mac_filter || {};

    return (
        <div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 24 }}>Router Management</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                {/* Config form */}
                <div className="card" style={{ padding: 26 }}>
                    <div className="section-label">ROUTER CREDENTIALS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {[["Host / IP", "host", "text", "192.168.100.1"], ["Username", "username", "text", "root"]].map(([label, key, type, ph]) => (
                            <div key={key}>
                                <div style={{ fontSize: 10, color: "#4a6080", marginBottom: 6 }}>{label}</div>
                                <input className="input" type={type} placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                            </div>
                        ))}
                        <div>
                            <div style={{ fontSize: 10, color: "#4a6080", marginBottom: 6 }}>Password {configData?.password_set && <span style={{ color: "#00e5a0", marginLeft: 6, fontSize: 9, letterSpacing: 1 }}>✓ SET</span>}</div>
                            <div style={{ position: "relative" }}>
                                <input className="input" type={showPass ? "text" : "password"} placeholder="Router admin password" value={form.password}
                                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={{ paddingRight: 42 }} />
                                <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#4a6080", cursor: "pointer", fontSize: 14 }}>
                                    {showPass ? "◑" : "◎"}
                                </button>
                            </div>
                            <div style={{ fontSize: 10, color: "#4a6080", marginTop: 6 }}>Default: usually <code style={{ color: "#8099bf" }}>adminHW</code> (printed on router sticker)</div>
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={handleSave} disabled={testing} style={{ marginTop: 20, width: "100%", padding: 12 }}>
                        {testing ? <><span className="spin">⟳</span> Testing connection...</> : "💾 Save & Test Connection"}
                    </button>
                    {result && (
                        <div style={{
                            marginTop: 12, padding: 12, borderRadius: 6, fontSize: 11, lineHeight: 1.5,
                            background: result.success ? "rgba(0,229,160,0.07)" : "rgba(255,71,87,0.07)",
                            border: `1px solid ${result.success ? "#00e5a0" : "#ff4757"}`,
                            color: result.success ? "#00e5a0" : "#ff4757"
                        }}>
                            {result.success ? "✓" : "✗"} {result.message}
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Manual controls */}
                    <div className="card" style={{ padding: 26 }}>
                        <div className="section-label">MANUAL CONTROLS</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {[
                                { label: "⟳ Force Sync", sub: "Poll devices, tick time, block expired accounts", onClick: onSync, disabled: syncing || !online, cls: "btn-primary", spin: syncing },
                                { label: "↑ Push Whitelist", sub: "Immediately push all allowed MACs to the router", onClick: onPushWhitelist, disabled: !online, cls: "btn-secondary" },
                                { label: "⊘ Disable MAC Filter", sub: "⚠ Allows ALL devices to connect — use with caution", onClick: onDisableFilter, disabled: !online, cls: "btn-danger-outline" },
                            ].map(({ label, sub, onClick, disabled, cls, spin }) => (
                                <div key={label}>
                                    <button className={`btn ${cls}`} onClick={onClick} disabled={disabled} style={{ width: "100%", padding: 10 }}>
                                        {spin ? <><span className="spin">⟳</span> Syncing...</> : label}
                                    </button>
                                    <div style={{ fontSize: 10, color: "#4a6080", marginTop: 5 }}>{sub}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live status */}
                    <div className="card" style={{ padding: 26 }}>
                        <div className="section-label">LIVE STATUS</div>
                        <div style={{ marginBottom: 14 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, color: online ? "#00e5a0" : "#ff4757", background: online ? "rgba(0,229,160,0.1)" : "rgba(255,71,87,0.1)" }}>
                                {online ? "● ONLINE" : "○ OFFLINE"}
                            </span>
                        </div>
                        <table className="stat-table">
                            <tbody>
                                {[["WAN IP", router.wan_ip], ["Network Type", router.network_type],
                                ["Signal", router.signal_strength != null ? `${router.signal_strength}/5` : null],
                                ["Filter Mode", mf.mode], ["Whitelist Size", mf.entries?.length],
                                ["Connected Devices", routerStatus?.connected_devices],
                                ["Sync Running", syncStatus?.running != null ? (syncStatus.running ? "Yes" : "No") : null],
                                ["Last Sync", syncStatus ? timeAgo(syncStatus.last_sync) : null],
                                ["Total Syncs", syncStatus?.sync_count],
                                ["Last Error", syncStatus?.last_error]].filter(([, v]) => v != null).map(([k, v]) => (
                                    <tr key={k}><td>{k}</td>
                                        <td style={{ color: k === "Last Error" ? "#ff4757" : "#e0e6f0" }}>{String(v)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!online && <div style={{ color: "#4a6080", fontSize: 11, marginTop: 10 }}>{routerStatus?.error || "Configure credentials above to connect."}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
