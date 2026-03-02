import { fmtTime, pct } from "../utils/format.jsx";

export default function Modals({ type, data, onClose, onSaveDevice, onAddTime, onConfirm, deviceForm, setDeviceForm, editId, addTimeVal, setAddTimeVal, confirmPayload }) {
    if (!type) return null;
    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>

            {/* ── Add / Edit Device ── */}
            {type === "device" && (
                <div className="card modal-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                        <div>
                            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#fff" }}>{editId ? "EDIT DEVICE" : "REGISTER DEVICE"}</div>
                            <div style={{ fontSize: 10, color: "#4a6080", letterSpacing: 2, marginTop: 3 }}>Whitelist a MAC address for WiFi access</div>
                        </div>
                        <button className="btn" onClick={onClose} style={{ background: "none", color: "#4a6080", fontSize: 20, padding: 4 }}>✕</button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {[["Device Name", "name", "text", "John's Laptop"], ["MAC Address", "mac", "text", "AA:BB:CC:DD:EE:FF"], ["Owner Name", "owner", "text", "John Doe"]].map(([label, key, type, ph]) => (
                            <div key={key}>
                                <div style={{ fontSize: 10, color: "#4a6080", marginBottom: 6 }}>
                                    {label}{key === "mac" && editId && <span style={{ color: "#ff4757", marginLeft: 8, fontSize: 9 }}>LOCKED</span>}
                                </div>
                                <input className="input" type={type} placeholder={ph} value={deviceForm[key] || ""} readOnly={key === "mac" && !!editId}
                                    onChange={e => setDeviceForm(f => ({ ...f, [key]: e.target.value }))} />
                            </div>
                        ))}
                        <div>
                            <div style={{ fontSize: 10, color: "#4a6080", marginBottom: 8 }}>ALLOCATED TIME</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                                {[30, 60, 120, 180, 240, 480].map(m => (
                                    <button key={m} className="btn" onClick={() => setDeviceForm(f => ({ ...f, allocatedMinutes: m }))}
                                        style={{ background: deviceForm.allocatedMinutes === m ? "#00e5a0" : "#1a2a45", color: deviceForm.allocatedMinutes === m ? "#0a0e1a" : "#8099bf", padding: "7px 12px" }}>
                                        {fmtTime(m)}
                                    </button>
                                ))}
                            </div>
                            <input className="input" type="number" min="1" value={deviceForm.allocatedMinutes || ""}
                                onChange={e => setDeviceForm(f => ({ ...f, allocatedMinutes: parseInt(e.target.value) || 60 }))} placeholder="Custom minutes" />
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                        <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1, padding: 12 }}>CANCEL</button>
                        <button className="btn btn-primary" onClick={onSaveDevice} style={{ flex: 2, padding: 12 }}>{editId ? "SAVE CHANGES" : "REGISTER DEVICE"}</button>
                    </div>
                </div>
            )}

            {/* ── Add Time ── */}
            {type === "addTime" && (
                <div className="card modal-card" style={{ width: 420 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                        <div>
                            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#fff" }}>ADD TIME</div>
                            <div style={{ fontSize: 11, color: "#4a6080", marginTop: 3 }}>{data?.name} — {data?.owner}</div>
                        </div>
                        <button className="btn" onClick={onClose} style={{ background: "none", color: "#4a6080", fontSize: 20, padding: 4 }}>✕</button>
                    </div>

                    <div style={{ background: "#080d18", borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 12 }}>
                        <div style={{ color: "#4a6080", marginBottom: 4, fontSize: 10 }}>CURRENT USAGE</div>
                        <div style={{ color: "#e0e6f0" }}>{fmtTime(data?.usedMinutes)} / {fmtTime(data?.allocatedMinutes)}
                            <span style={{ color: "#4a6080", marginLeft: 8 }}>({pct(data || { usedMinutes: 0, allocatedMinutes: 60 })}%)</span>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {[15, 30, 60, 120, 180, 480].map(m => (
                            <button key={m} className="btn" onClick={() => setAddTimeVal(m)}
                                style={{ background: addTimeVal === m ? "#ffb300" : "#1a2a45", color: addTimeVal === m ? "#0a0e1a" : "#8099bf", padding: "7px 12px" }}>
                                +{fmtTime(m)}
                            </button>
                        ))}
                    </div>
                    <input className="input" type="number" min="1" value={addTimeVal}
                        onChange={e => setAddTimeVal(parseInt(e.target.value) || 60)} placeholder="Custom minutes" style={{ marginBottom: 20 }} />

                    <div style={{ display: "flex", gap: 12 }}>
                        <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1, padding: 12 }}>CANCEL</button>
                        <button className="btn" onClick={onAddTime} style={{ flex: 2, background: "#ffb300", color: "#0a0e1a", padding: 12, fontWeight: 700 }}>ADD {fmtTime(addTimeVal)}</button>
                    </div>
                </div>
            )}

            {/* ── Confirm ── */}
            {type === "confirm" && (
                <div className="card modal-card" style={{ width: 420 }}>
                    <div style={{ marginBottom: 28 }}>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 10, color: confirmPayload?.danger ? "#ff4757" : "#fff" }}>
                            {confirmPayload?.danger ? "⚠ " : ""}Confirm Action
                        </div>
                        <div style={{ fontSize: 13, color: "#e0e6f0", lineHeight: 1.6 }}>{confirmPayload?.label}</div>
                        {confirmPayload?.sublabel && <div style={{ fontSize: 11, color: "#ff4757", marginTop: 10, lineHeight: 1.5 }}>{confirmPayload.sublabel}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                        <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1, padding: 12 }}>CANCEL</button>
                        <button className="btn" onClick={onConfirm}
                            style={{ flex: 1, background: confirmPayload?.danger ? "#ff4757" : "#00e5a0", color: "#0a0e1a", padding: 12, fontWeight: 700 }}>CONFIRM</button>
                    </div>
                </div>
            )}
        </div>
    );
}
