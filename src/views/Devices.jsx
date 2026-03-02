import { pct, fmtTime, StatusPill } from "../utils/format.jsx";

export default function Devices({ devices, loading, search, setSearch, statusFilter, setStatusFilter, selectedIds, onToggleSelect, onToggleSelectAll, onAdd, onEdit, onRemove, onBlock, onResetTime, onAddTime, onBulkAction }) {
    const q = search.toLowerCase();
    const filtered = devices.filter(d => {
        const matchSearch = !q || [d.name, d.mac, d.owner].some(v => v.toLowerCase().includes(q));
        const matchStatus = statusFilter === "all" || d.status === statusFilter || (statusFilter === "expired" && d.usedMinutes >= d.allocatedMinutes);
        return matchSearch && matchStatus;
    });

    const STATUS_PILLS = [["all", "ALL", "#0066ff"], ["connected", "CONN", "#00e5a0"], ["disconnected", "DISC", "#778ca3"], ["blocked", "BLOCK", "#ff4757"], ["expired", "EXPD", "#ffb300"]];
    const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: "#fff" }}>Managed Devices</h2>
                <button className="btn btn-primary" onClick={onAdd}>＋ Add Device</button>
            </div>

            {/* Search + filter */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <input className="input" placeholder="Search name, MAC, owner..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
                <div style={{ display: "flex", gap: 6 }}>
                    {STATUS_PILLS.map(([s, label, col]) => (
                        <button key={s} className="btn" onClick={() => setStatusFilter(s)}
                            style={{ padding: "6px 10px", fontSize: 9, background: statusFilter === s ? col : "#1a2a45", color: statusFilter === s ? "#0a0e1a" : "#8099bf" }}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div style={{ background: "#0d1a30", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "#8099bf" }}>{selectedIds.size} selected</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn" onClick={() => onBulkAction("block")} style={{ background: "rgba(255,71,87,0.15)", color: "#ff4757", fontSize: 10 }}>⊗ Block</button>
                    <button className="btn" onClick={() => onBulkAction("unblock")} style={{ background: "rgba(0,229,160,0.15)", color: "#00e5a0", fontSize: 10 }}>✓ Unblock</button>
                    <button className="btn" onClick={() => onBulkAction("reset_time")} style={{ background: "#1a2a45", color: "#8099bf", fontSize: 10 }}>↺ Reset Time</button>
                    <button className="btn" onClick={() => onBulkAction("remove")} style={{ background: "rgba(255,71,87,0.1)", color: "#ff4757", fontSize: 10 }}>✕ Remove</button>
                    <button className="btn" onClick={() => onToggleSelectAll()} style={{ background: "none", color: "#4a6080", fontSize: 10, padding: "4px 8px" }}>Clear</button>
                </div>
            )}

            {/* Table */}
            <div className="card">
                <div style={{ display: "grid", gridTemplateColumns: "36px 2fr 1.7fr 1.1fr 1.6fr 0.8fr 190px", gap: 8, padding: "10px 16px", borderBottom: "1px solid #1a2a45", fontSize: 9, color: "#4a6080", letterSpacing: 2, alignItems: "center" }}>
                    <input type="checkbox" onChange={onToggleSelectAll} checked={allSelected} style={{ accentColor: "#00e5a0", cursor: "pointer" }} />
                    <span>DEVICE / OWNER</span><span>MAC ADDRESS</span><span>STATUS</span><span>TIME USAGE</span><span>ADDED</span><span style={{ textAlign: "right" }}>ACTIONS</span>
                </div>

                {loading && <div style={{ padding: 40, textAlign: "center", color: "#4a6080" }}><span className="spin" style={{ marginRight: 6 }}>⟳</span>Loading...</div>}
                {!loading && filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#4a6080", fontSize: 12 }}>No devices{(search || statusFilter !== "all") ? " match your filter" : " — click Add Device to get started"}</div>}

                {!loading && filtered.map(d => {
                    const p = pct(d);
                    const bar = p >= 100 ? "#ff4757" : p >= 80 ? "#ffb300" : "#00e5a0";
                    return (
                        <div key={d.id} className="device-row" style={{ background: selectedIds.has(d.id) ? "rgba(0,102,255,0.04)" : undefined }}>
                            <div style={{ display: "grid", gridTemplateColumns: "36px 2fr 1.7fr 1.1fr 1.6fr 0.8fr 190px", gap: 8, alignItems: "center" }}>
                                <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => onToggleSelect(d.id)} style={{ accentColor: "#00e5a0", cursor: "pointer" }} />
                                <div>
                                    <div style={{ fontSize: 13, color: "#e0e6f0", fontWeight: 700 }}>{d.name}</div>
                                    <div style={{ fontSize: 11, color: "#4a6080", marginTop: 2 }}>{d.owner}</div>
                                    {d.ipAddress && <div style={{ fontSize: 10, color: "#2a4060", marginTop: 1 }}>{d.ipAddress}</div>}
                                </div>
                                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, color: "#8099bf", letterSpacing: 1 }}>{d.mac}</div>
                                <div><StatusPill status={d.status} /></div>
                                <div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a6080", marginBottom: 4 }}>
                                        <span>{fmtTime(d.usedMinutes)} / {fmtTime(d.allocatedMinutes)}</span>
                                        <span style={{ color: bar }}>{p}%</span>
                                    </div>
                                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${p}%`, background: bar }} /></div>
                                </div>
                                <div style={{ fontSize: 10, color: "#4a6080" }}>{d.addedAt}</div>
                                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                    <button className="btn btn-icon" title="Reset time" onClick={() => onResetTime(d.id)} style={{ fontSize: 13 }}>↺</button>
                                    <button className="btn btn-icon" title="Add time" onClick={() => onAddTime(d)} style={{ color: "#ffb300", fontSize: 10 }}>+⏱</button>
                                    <button className="btn btn-icon" title="Edit" onClick={() => onEdit(d)} style={{ fontSize: 13 }}>✎</button>
                                    <button className="btn" title={d.status === "blocked" ? "Unblock" : "Block"} onClick={() => onBlock(d)}
                                        style={{ background: d.status === "blocked" ? "rgba(0,229,160,0.15)" : "rgba(255,71,87,0.15)", color: d.status === "blocked" ? "#00e5a0" : "#ff4757", padding: "6px 8px", fontSize: 13 }}>
                                        {d.status === "blocked" ? "✓" : "⊗"}
                                    </button>
                                    <button className="btn" title="Remove" onClick={() => onRemove(d.id, d.name)} style={{ background: "rgba(255,71,87,0.08)", color: "#ff4757", padding: "6px 8px", fontSize: 13 }}>✕</button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "#4a6080" }}>
                {filtered.length} of {devices.length} device{devices.length !== 1 ? "s" : ""}{statusFilter !== "all" ? ` — ${statusFilter}` : ""}
            </div>
        </div>
    );
}
