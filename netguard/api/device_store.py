"""
In-memory + JSON-file device store with time tracking.
Persists to devices.json in the working directory.
"""

import json
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from threading import Lock

logger = logging.getLogger(__name__)

DATA_FILE = Path("devices.json")
_lock = Lock()


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _load() -> dict:
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text())
        except Exception:
            pass
    return {"devices": {}, "config": {
        "host": "192.168.100.1",
        "username": "root",
        "password": "",
        "filter_mode": "whitelist"
    }}


def _save(data: dict):
    DATA_FILE.write_text(json.dumps(data, indent=2))


# ─── Device CRUD ─────────────────────────────────────────────────────────────

def list_devices() -> list[dict]:
    data = _load()
    return list(data["devices"].values())


def get_device(device_id: str) -> Optional[dict]:
    data = _load()
    return data["devices"].get(device_id)


def get_device_by_mac(mac: str) -> Optional[dict]:
    mac = mac.upper()
    for d in list_devices():
        if d["mac"].upper() == mac:
            return d
    return None


def create_device(name: str, mac: str, owner: str, allocated_minutes: int) -> dict:
    with _lock:
        data = _load()
        mac = mac.upper()

        # Check duplicate MAC
        for d in data["devices"].values():
            if d["mac"].upper() == mac:
                raise ValueError(f"MAC address {mac} is already registered")

        device_id = str(uuid.uuid4())
        device = {
            "id": device_id,
            "name": name,
            "mac": mac,
            "owner": owner,
            "allocated_minutes": allocated_minutes,
            "used_minutes": 0,
            "status": "disconnected",
            "added_at": _now_iso(),
            "last_seen": None,
            "ip_address": None,
        }
        data["devices"][device_id] = device
        _save(data)
        return device


def update_device(device_id: str, updates: dict) -> Optional[dict]:
    with _lock:
        data = _load()
        if device_id not in data["devices"]:
            return None
        allowed = {"name", "owner", "allocated_minutes", "status",
                   "used_minutes", "last_seen", "ip_address"}
        for k, v in updates.items():
            if k in allowed and v is not None:
                data["devices"][device_id][k] = v
        _save(data)
        return data["devices"][device_id]


def delete_device(device_id: str) -> bool:
    with _lock:
        data = _load()
        if device_id not in data["devices"]:
            return False
        del data["devices"][device_id]
        _save(data)
        return True


def reset_device_time(device_id: str) -> Optional[dict]:
    return update_device(device_id, {"used_minutes": 0})


def add_usage_time(device_id: str, minutes: int) -> Optional[dict]:
    with _lock:
        data = _load()
        if device_id not in data["devices"]:
            return None
        dev = data["devices"][device_id]
        dev["used_minutes"] = min(
            dev["used_minutes"] + minutes,
            dev["allocated_minutes"]
        )
        # Auto-block when time expires
        if dev["used_minutes"] >= dev["allocated_minutes"] and dev["status"] == "connected":
            dev["status"] = "expired"
            logger.info("Device %s (%s) time expired - marking for block", dev["name"], dev["mac"])
        _save(data)
        return dev


# ─── Config ──────────────────────────────────────────────────────────────────

def get_config() -> dict:
    return _load().get("config", {})


def update_config(updates: dict) -> dict:
    with _lock:
        data = _load()
        data["config"].update(updates)
        _save(data)
        return data["config"]


# ─── Sync helpers ────────────────────────────────────────────────────────────

def sync_connected_devices(router_devices: list[dict]):
    """
    Reconcile router-reported connected devices with our registry.
    Updates IP addresses, last_seen, and connection status.
    """
    with _lock:
        data = _load()
        router_macs = {d["mac"].upper(): d for d in router_devices}
        changed = False

        for dev_id, dev in data["devices"].items():
            mac = dev["mac"].upper()
            if mac in router_macs:
                router_dev = router_macs[mac]
                if dev["status"] not in ("blocked", "expired"):
                    dev["status"] = "connected"
                dev["last_seen"] = _now_iso()
                dev["ip_address"] = router_dev.get("ip", dev.get("ip_address"))
                changed = True
            else:
                if dev["status"] == "connected":
                    dev["status"] = "disconnected"
                    changed = True

        if changed:
            _save(data)

    return list(data["devices"].values())


def get_expired_devices() -> list[dict]:
    """Return devices whose time is up and are still not blocked on router."""
    return [d for d in list_devices()
            if d["used_minutes"] >= d["allocated_minutes"]
            and d["status"] in ("connected", "expired")]


def get_whitelisted_macs() -> list[dict]:
    """Return all non-blocked devices as MAC filter entries."""
    return [
        {"mac": d["mac"], "name": d["name"]}
        for d in list_devices()
        if d["status"] not in ("blocked",)
        and d["used_minutes"] < d["allocated_minutes"]
    ]
