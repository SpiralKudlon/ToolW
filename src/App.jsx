import { useState, useEffect, useCallback, useRef } from "react";
import { api, norm } from "./utils/api.js";
import Sidebar from "./components/Sidebar.jsx";
import Modals from "./components/Modals.jsx";
import Dashboard from "./views/Dashboard.jsx";
import Devices from "./views/Devices.jsx";
import RouterView from "./views/Router.jsx";
import Unknown from "./views/Unknown.jsx";
import "./index.css";

export default function App() {
    // Navigation
    const [view, setView] = useState("dashboard");

    // Core data
    const [devices, setDevices] = useState([]);
    const [unknownDevices, setUnknown] = useState([]);
    const [routerStatus, setRouterStatus] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [configData, setConfigData] = useState({});

    // UI
    const [loading, setLoading] = useState(true);
    const [notification, setNote] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setFilter] = useState("all");
    const [selectedIds, setSelected] = useState(new Set());

    // Modal
    const [modalType, setModal] = useState(null);
    const [modalData, setModalData] = useState(null);
    const [deviceForm, setDeviceForm] = useState({ name: "", mac: "", owner: "", allocatedMinutes: 60 });
    const [editId, setEditId] = useState(null);
    const [addTimeVal, setAddTimeVal] = useState(60);
    const [confirmPayload, setConfirm] = useState(null);

    const devicesRef = useRef([]);
    useEffect(() => { devicesRef.current = devices; }, [devices]);

    const notify = (msg, type = "success") => {
        setNote({ msg, type });
        setTimeout(() => setNote(null), 3500);
    };
    const closeModal = () => setModal(null);

    // ─── Fetch ─────────────────────────────────────────────────────────────────
    const fetchDevices = useCallback(async (silent = false) => {
        try {
            const d = await api("/devices");
            setDevices(d.devices.map(norm));
        } catch (e) { if (!silent) notify("API unreachable: " + e.message, "error"); }
        finally { setLoading(false); }
    }, []);

    const fetchRouterStatus = useCallback(async () => {
        try {
            const s = await api("/router/status");
            setRouterStatus(s);
            if (s.reachable) {
                const c = await api("/router/connected");
                const reg = new Set(devicesRef.current.map(d => d.mac.toUpperCase()));
                setUnknown(c.connected.filter(x => !reg.has(x.mac.toUpperCase())));
            } else setUnknown([]);
        } catch { setRouterStatus({ reachable: false, error: "Could not reach API" }); }
    }, []);

    const fetchSyncStatus = useCallback(async () => {
        try { setSyncStatus(await api("/sync/status")); } catch { }
    }, []);

    const fetchConfig = useCallback(async () => {
        try { setConfigData(await api("/config")); } catch { }
    }, []);

    useEffect(() => {
        fetchDevices(); fetchRouterStatus(); fetchSyncStatus(); fetchConfig();
        const t1 = setInterval(() => fetchDevices(true), 30000);
        const t2 = setInterval(fetchRouterStatus, 60000);
        const t3 = setInterval(fetchSyncStatus, 15000);
        return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
    }, [fetchDevices, fetchRouterStatus, fetchSyncStatus, fetchConfig]);

    // ─── Device actions ────────────────────────────────────────────────────────
    const openAdd = () => { setDeviceForm({ name: "", mac: "", owner: "", allocatedMinutes: 60 }); setEditId(null); setModal("device"); };
    const openEdit = (d) => { setDeviceForm({ name: d.name, mac: d.mac, owner: d.owner, allocatedMinutes: d.allocatedMinutes }); setEditId(d.id); setModal("device"); };

    const saveDevice = async () => {
        try {
            if (editId) {
                const r = await api(`/devices/${editId}`, { method: "PATCH", body: JSON.stringify({ name: deviceForm.name, owner: deviceForm.owner, allocated_minutes: parseInt(deviceForm.allocatedMinutes) || 60 }) });
                setDevices(prev => prev.map(d => d.id === editId ? norm(r.device) : d));
                notify("Device updated");
            } else {
                const r = await api("/devices", { method: "POST", body: JSON.stringify({ name: deviceForm.name, mac: deviceForm.mac, owner: deviceForm.owner, allocated_minutes: parseInt(deviceForm.allocatedMinutes) || 60 }) });
                setDevices(prev => [...prev, norm(r.device)]);
                notify("Device registered");
            }
            closeModal();
        } catch (e) { notify(e.message, "error"); }
    };

    const removeDevice = (id, name) => {
        setConfirm({ label: `Remove "${name}" from the whitelist?`, sublabel: "The device will also be removed from the router.", action: async () => { await api(`/devices/${id}`, { method: "DELETE" }); setDevices(p => p.filter(d => d.id !== id)); notify("Device removed"); } });
        setModal("confirm");
    };

    const toggleBlock = async (device) => {
        try {
            const r = await api(`/devices/${device.id}/${device.status === "blocked" ? "unblock" : "block"}`, { method: "POST" });
            notify(r.message); fetchDevices(true);
        } catch (e) { notify(e.message, "error"); }
    };

    const resetTime = async (id) => {
        try {
            const r = await api(`/devices/${id}/reset-time`, { method: "POST" });
            setDevices(p => p.map(d => d.id === id ? norm(r.device) : d)); notify("Time reset");
        } catch (e) { notify(e.message, "error"); }
    };

    const openAddTime = (device) => { setModalData(device); setAddTimeVal(60); setModal("addTime"); };
    const doAddTime = async () => {
        try {
            const r = await api(`/devices/${modalData.id}/add-time?minutes=${addTimeVal}`, { method: "POST" });
            setDevices(p => p.map(d => d.id === modalData.id ? norm(r.device) : d));
            notify(`Added ${addTimeVal}m to ${modalData.name}`); closeModal();
        } catch (e) { notify(e.message, "error"); }
    };

    // ─── Bulk actions ──────────────────────────────────────────────────────────
    const doBulkAction = (action) => {
        const ids = [...selectedIds];
        const labels = { block: "Block", unblock: "Unblock", reset_time: "Reset time for", remove: "Remove" };
        setConfirm({
            label: `${labels[action]} ${ids.length} device(s)?`,
            sublabel: action === "remove" ? "Removed devices will be taken off the router whitelist." : null,
            danger: action === "remove",
            action: async () => {
                await api("/devices/bulk-action", { method: "POST", body: JSON.stringify({ device_ids: ids, action }) });
                setSelected(new Set()); await fetchDevices(true); notify(`Bulk ${action} applied`);
            },
        });
        setModal("confirm");
    };

    const toggleSelect = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleSelectAll = () => {
        const filtered = devices.filter(d => !search || [d.name, d.mac, d.owner].some(v => v.toLowerCase().includes(search.toLowerCase())));
        setSelected(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(d => d.id)));
    };

    // ─── Router actions ────────────────────────────────────────────────────────
    const saveConfig = async (form) => {
        try {
            const updates = Object.fromEntries(Object.entries(form).filter(([, v]) => v));
            const r = await api("/config", { method: "POST", body: JSON.stringify(updates) });
            if (r.success) { fetchRouterStatus(); fetchConfig(); notify("Router configuration saved"); }
            return { success: r.success, message: r.message };
        } catch (e) { return { success: false, message: e.message }; }
    };

    const forceSync = async () => {
        setSyncing(true);
        try {
            const r = await api("/router/sync", { method: "POST" });
            const s = r.sync_result;
            notify(s.skipped ? `Sync skipped: ${s.reason}` : `Sync done — ${s.connected} connected, ${s.expired_blocked} blocked`);
            fetchSyncStatus(); fetchDevices(true); fetchRouterStatus();
        } catch (e) { notify(e.message, "error"); } finally { setSyncing(false); }
    };

    const pushWhitelist = async () => {
        try { const r = await api("/router/push-whitelist", { method: "POST" }); notify(r.message); }
        catch (e) { notify(e.message, "error"); }
    };

    const disableFilter = () => {
        setConfirm({
            label: "Disable MAC filtering?", sublabel: "⚠ ALL devices — including unknown ones — will be able to connect.", danger: true,
            action: async () => { await api("/router/disable-filter", { method: "POST" }); notify("MAC filter disabled"); fetchRouterStatus(); }
        });
        setModal("confirm");
    };

    const whitelistUnknown = (mac) => { setView("devices"); setDeviceForm({ name: "", mac, owner: "", allocatedMinutes: 60 }); setEditId(null); setModal("device"); };

    const navigate = (v, filter) => { setView(v); if (filter) setFilter(filter); };

    const routerOnline = routerStatus?.reachable;

    const VIEWS = { dashboard: Dashboard, devices: Devices, router: RouterView, unknown: Unknown };
    const viewProps = {
        dashboard: { devices, routerStatus, syncStatus, loading, onSync: forceSync, onPushWhitelist: pushWhitelist, onDisableFilter: disableFilter, onNavigate: navigate, syncing },
        devices: { devices, loading, search, setSearch, statusFilter, setStatusFilter: setFilter, selectedIds, onToggleSelect: toggleSelect, onToggleSelectAll: toggleSelectAll, onAdd: openAdd, onEdit: openEdit, onRemove: removeDevice, onBlock: toggleBlock, onResetTime: resetTime, onAddTime: openAddTime, onBulkAction: doBulkAction },
        router: { routerStatus, syncStatus, configData, onSaveConfig: saveConfig, onSync: forceSync, onPushWhitelist: pushWhitelist, onDisableFilter: disableFilter, syncing },
        unknown: { unknownDevices, routerOnline, onWhitelist: whitelistUnknown, onRefresh: fetchRouterStatus },
    };

    const ActiveView = VIEWS[view];

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            <Sidebar view={view} setView={setView} routerOnline={routerOnline} deviceCount={devices.length} unknownCount={unknownDevices.length} />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                {/* Toast */}
                {notification && (
                    <div className="toast" style={{ background: notification.type === "error" ? "#1a080f" : "#081a12", border: `1px solid ${notification.type === "error" ? "#ff4757" : "#00e5a0"}`, color: notification.type === "error" ? "#ff4757" : "#00e5a0" }}>
                        {notification.type === "error" ? "✗" : "✓"} {notification.msg}
                    </div>
                )}

                <main style={{ flex: 1, padding: "28px 36px", overflowY: "auto" }}>
                    <ActiveView {...viewProps[view]} />
                </main>
            </div>

            <Modals type={modalType} data={modalData} onClose={closeModal} onSaveDevice={saveDevice} onAddTime={doAddTime} onConfirm={async () => { closeModal(); try { await confirmPayload.action(); } catch (e) { notify(e.message, "error"); } }} deviceForm={deviceForm} setDeviceForm={setDeviceForm} editId={editId} addTimeVal={addTimeVal} setAddTimeVal={setAddTimeVal} confirmPayload={confirmPayload} />
        </div>
    );
}