export default function Unknown({ unknownDevices, routerOnline, onWhitelist, onRefresh }) {
    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: "#fff" }}>Unknown Devices</h2>
                    <div style={{ fontSize: 12, color: "#4a6080", marginTop: 4 }}>Devices connected to the router that are not in the whitelist</div>
                </div>
                <button className="btn btn-secondary" onClick={onRefresh} disabled={!routerOnline}>↺ Refresh</button>
            </div>

            {unknownDevices.length > 0 && (
                <div style={{ background: "rgba(255,71,87,0.06)", border: "1px solid rgba(255,71,87,0.2)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 11, color: "#ff4757" }}>
                    ⚠ {unknownDevices.length} unknown device{unknownDevices.length !== 1 ? "s" : ""} connected — they are currently blocked by whitelist filtering but could connect if filtering is disabled
                </div>
            )}

            <div className="card">
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 160px", gap: 8, padding: "10px 16px", borderBottom: "1px solid #1a2a45", fontSize: 9, color: "#4a6080", letterSpacing: 2 }}>
                    <span>MAC ADDRESS</span><span>IP ADDRESS</span><span>HOSTNAME</span><span>INTERFACE</span><span style={{ textAlign: "right" }}>ACTION</span>
                </div>

                {!routerOnline && (
                    <div style={{ padding: 48, textAlign: "center", color: "#4a6080", fontSize: 12 }}>
                        ⚠ Router offline — configure credentials in the Router tab to detect unknown devices
                    </div>
                )}
                {routerOnline && unknownDevices.length === 0 && (
                    <div style={{ padding: 48, textAlign: "center", color: "#00e5a0", fontSize: 12 }}>
                        ✓ All connected devices are registered in the whitelist
                    </div>
                )}
                {unknownDevices.map(a => (
                    <div key={a.mac} className="device-row">
                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 160px", gap: 8, alignItems: "center" }}>
                            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, color: "#ff4757", fontWeight: 700 }}>{a.mac}</div>
                            <div style={{ fontSize: 12, color: "#8099bf" }}>{a.ip || "—"}</div>
                            <div style={{ fontSize: 12, color: "#4a6080" }}>{a.hostname || "—"}</div>
                            <div style={{ fontSize: 11, color: "#8099bf", textTransform: "uppercase", letterSpacing: 1 }}>{a.interface || "—"}</div>
                            <div style={{ textAlign: "right" }}>
                                <button className="btn" onClick={() => onWhitelist(a.mac)} style={{ background: "rgba(0,229,160,0.15)", color: "#00e5a0", padding: "6px 12px", fontSize: 10 }}>+ WHITELIST</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
