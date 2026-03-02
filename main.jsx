import { useState, useEffect } from "react";

const initialDevices = [
  { id: 1, name: "John's Laptop", mac: "AA:BB:CC:DD:EE:01", owner: "John Doe", allocatedMinutes: 120, usedMinutes: 45, status: "connected", addedAt: "2026-03-01" },
  { id: 2, name: "Jane's Phone", mac: "AA:BB:CC:DD:EE:02", owner: "Jane Smith", allocatedMinutes: 60, usedMinutes: 60, status: "blocked", addedAt: "2026-03-01" },
  { id: 3, name: "Guest iPad", mac: "AA:BB:CC:DD:EE:03", owner: "Guest", allocatedMinutes: 30, usedMinutes: 10, status: "disconnected", addedAt: "2026-03-02" },
];

const blockedAttempts = [
  { mac: "FF:EE:DD:CC:BB:01", timestamp: "2026-03-02 14:32:11", attempts: 3 },
  { mac: "FF:EE:DD:CC:BB:02", timestamp: "2026-03-02 09:15:44", attempts: 1 },
];

export default function WiFiManager() {
  const [devices, setDevices] = useState(initialDevices);
  const [tab, setTab] = useState("devices");
  const [showModal, setShowModal] = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", mac: "", owner: "", allocatedMinutes: 60 });
  const [notification, setNotification] = useState(null);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

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

  const saveDevice = () => {
    const macPattern = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
    if (!macPattern.test(form.mac)) { notify("Invalid MAC address format", "error"); return; }
    if (!form.name || !form.owner) { notify("All fields required", "error"); return; }

    if (editDevice) {
      setDevices(prev => prev.map(d => d.id === editDevice ? { ...d, ...form } : d));
      notify("Device updated successfully");
    } else {
      if (devices.find(d => d.mac.toLowerCase() === form.mac.toLowerCase())) {
        notify("MAC address already registered", "error"); return;
      }
      setDevices(prev => [...prev, {
        id: Date.now(), ...form, usedMinutes: 0,
        status: "disconnected", addedAt: new Date().toISOString().split("T")[0]
      }]);
      notify("Device registered successfully");
    }
    setShowModal(false);
  };

  const removeDevice = (id) => {
    setDevices(prev => prev.filter(d => d.id !== id));
    notify("Device removed");
  };

  const toggleBlock = (id) => {
    setDevices(prev => prev.map(d => {
      if (d.id !== id) return d;
      const newStatus = d.status === "blocked" ? "disconnected" : "blocked";
      return { ...d, status: newStatus };
    }));
  };

  const resetTime = (id) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, usedMinutes: 0, status: d.status === "blocked" && d.usedMinutes >= d.allocatedMinutes ? "disconnected" : d.status } : d));
    notify("Time reset");
  };

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

  const statusColor = (s) => ({ connected: "#00e5a0", blocked: "#ff4757", disconnected: "#778ca3" }[s] || "#778ca3");
  const statusBg = (s) => ({ connected: "rgba(0,229,160,0.12)", blocked: "rgba(255,71,87,0.12)", disconnected: "rgba(119,140,163,0.12)" }[s]);

  const pct = (d) => Math.min(100, Math.round((d.usedMinutes / d.allocatedMinutes) * 100));
  const fmtTime = (m) => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e0e6f0", fontFamily: "'Courier New', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@600;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0e1a; } ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }
        .btn { border: none; cursor: pointer; border-radius: 4px; font-family: 'Space Mono', monospace; font-size: 12px; transition: all 0.15s; }
        .btn:hover { filter: brightness(1.2); transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }
        .card { background: #0f1628; border: 1px solid #1a2a45; border-radius: 8px; }
        .tab-btn { background: none; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 12px; padding: 10px 20px; color: #4a6080; transition: all 0.2s; border-bottom: 2px solid transparent; letter-spacing: 1px; }
        .tab-btn.active { color: #00e5a0; border-bottom-color: #00e5a0; }
        .tab-btn:hover:not(.active) { color: #8099bf; }
        .input { background: #0a0e1a; border: 1px solid #1e3a5f; border-radius: 4px; color: #e0e6f0; padding: 10px 12px; font-family: 'Space Mono', monospace; font-size: 12px; width: 100%; outline: none; transition: border-color 0.2s; }
        .input:focus { border-color: #00e5a0; }
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
          <div className="blink" style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e5a0" }}></div>
          <span style={{ fontSize: 11, color: "#00e5a0", letterSpacing: 2 }}>NETWORK ONLINE</span>
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
              <div style={{ fontSize: 32, fontWeight: 700, color: s.color, fontFamily: "'Syne', sans-serif" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#4a6080", letterSpacing: 2, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: "1px solid #1a2a45", marginBottom: 24, display: "flex", gap: 0 }}>
          {[["devices", "MANAGED DEVICES"], ["blocked", "BLOCKED ATTEMPTS"]].map(([key, label]) => (
            <button key={key} className={`tab-btn ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

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
              {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#4a6080", fontSize: 12 }}>No devices found</div>}
              {filtered.map(d => (
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
                      <button className="btn" onClick={() => toggleBlock(d.id)} style={{ background: d.status === "blocked" ? "rgba(0,229,160,0.15)" : "rgba(255,71,87,0.15)", color: d.status === "blocked" ? "#00e5a0" : "#ff4757", padding: "6px 8px" }}>
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

        {tab === "blocked" && (
          <div className="card">
            <div style={{ padding: 20, borderBottom: "1px solid #1a2a45" }}>
              <div style={{ fontSize: 12, color: "#ff4757", letterSpacing: 2 }}>⊗ UNAUTHORIZED ACCESS ATTEMPTS</div>
              <div style={{ fontSize: 11, color: "#4a6080", marginTop: 4 }}>Devices that attempted to connect but are not in the whitelist</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 160px", gap: 8, padding: "12px 20px", borderBottom: "1px solid #1a2a45", fontSize: 10, color: "#4a6080", letterSpacing: 2 }}>
              <span>UNKNOWN MAC</span><span>LAST ATTEMPT</span><span>ATTEMPTS</span><span style={{ textAlign: "right" }}>ACTION</span>
            </div>
            {blockedAttempts.map((a, i) => (
              <div key={i} className="device-row">
                <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 160px", gap: 8, alignItems: "center", padding: "0" }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: "#ff4757" }}>{a.mac}</div>
                  <div style={{ fontSize: 12, color: "#4a6080" }}>{a.timestamp}</div>
                  <div style={{ fontSize: 12, color: "#ffb300", fontWeight: 700 }}>{a.attempts}x</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => { setForm({ name: "", mac: a.mac, owner: "", allocatedMinutes: 60 }); setEditDevice(null); setShowModal(true); }} style={{ background: "rgba(0,229,160,0.15)", color: "#00e5a0", padding: "6px 12px", fontSize: 11 }}>+ WHITELIST</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="card" style={{ width: 480, padding: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: "#fff" }}>{editDevice ? "EDIT DEVICE" : "REGISTER DEVICE"}</div>
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
                  <div style={{ fontSize: 10, color: "#4a6080", letterSpacing: 2, marginBottom: 6 }}>{label}</div>
                  <input className="input" type={type} placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
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
                <input className="input" type="number" min="1" value={form.allocatedMinutes} onChange={e => setForm(f => ({ ...f, allocatedMinutes: parseInt(e.target.value) || 60 }))} style={{ marginTop: 8 }} placeholder="Or enter custom minutes" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              <button className="btn" onClick={() => setShowModal(false)} style={{ flex: 1, background: "#1a2a45", color: "#8099bf", padding: 12 }}>CANCEL</button>
              <button className="btn" onClick={saveDevice} style={{ flex: 2, background: "#00e5a0", color: "#0a0e1a", padding: 12, fontWeight: 700, letterSpacing: 1 }}>{editDevice ? "SAVE CHANGES" : "REGISTER DEVICE"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}