"""
NetGuard API — FastAPI backend for WiFi MAC Access Control
Compatible with Safaricom Home Fibre routers (Huawei HG8145V5 / EG8145V5)

Run:
  pip install fastapi uvicorn pydantic requests
  python -m uvicorn netguard.main:app --host 0.0.0.0 --port 8000 --reload
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from .api import device_store as store
from .api.router_sync import RouterSync
from .models.schemas import (
    DeviceCreate, DeviceUpdate, ActionResponse, BulkActionRequest,
    RouterConfigUpdate, normalize_mac
)
from .router.huawei_client import HuaweiRouterClient, RouterConfig, HuaweiRouterError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# ─── Background sync ─────────────────────────────────────────────────────────

_sync = RouterSync(router_config_fn=store.get_config, poll_interval=60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _sync.start()
    yield
    _sync.stop()


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="NetGuard — WiFi MAC Access Control",
    description="Backend API for managing MAC-based WiFi access on Safaricom/Huawei routers",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production to your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _router_client() -> HuaweiRouterClient:
    """Create a connected router client using stored config."""
    cfg = store.get_config()
    if not cfg.get("password"):
        raise HTTPException(
            status_code=503,
            detail="Router password not configured. POST /config first."
        )
    return HuaweiRouterClient(RouterConfig(
        host=cfg.get("host", "192.168.100.1"),
        username=cfg.get("username", "root"),
        password=cfg["password"],
    ))


# ─── Devices ─────────────────────────────────────────────────────────────────

@app.get("/devices", summary="List all registered devices")
def list_devices(
    status: Optional[str] = Query(None, description="Filter: connected|disconnected|blocked|expired"),
    search: Optional[str] = Query(None, description="Search name, mac, or owner")
):
    devices = store.list_devices()
    if status:
        devices = [d for d in devices if d["status"] == status]
    if search:
        s = search.lower()
        devices = [d for d in devices if
                   s in d["name"].lower() or
                   s in d["mac"].lower() or
                   s in d["owner"].lower()]
    return {"devices": devices, "total": len(devices)}


@app.post("/devices", status_code=201, summary="Register a new device")
def register_device(body: DeviceCreate):
    """
    Register a device's MAC address in the system.
    The device will be added to the router's MAC whitelist on next sync.
    """
    try:
        device = store.create_device(
            name=body.name,
            mac=body.mac,
            owner=body.owner,
            allocated_minutes=body.allocated_minutes,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    # Immediately push whitelist to router
    try:
        with _router_client() as client:
            whitelist = store.get_whitelisted_macs()
            client.set_mac_filter_whitelist(whitelist)
    except HTTPException:
        pass  # No config yet — sync will handle it later
    except HuaweiRouterError as e:
        logger.warning("Could not push whitelist after device add: %s", e)

    return {"device": device, "message": "Device registered successfully"}


@app.get("/devices/{device_id}", summary="Get a device by ID")
def get_device(device_id: str):
    device = store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@app.patch("/devices/{device_id}", summary="Update device settings")
def update_device(device_id: str, body: DeviceUpdate):
    device = store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    updates = body.model_dump(exclude_none=True)
    updated = store.update_device(device_id, updates)
    return {"device": updated, "message": "Device updated"}


@app.delete("/devices/{device_id}", summary="Remove a device")
def remove_device(device_id: str):
    """Removes device from registry AND from router whitelist."""
    device = store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    mac = device["mac"]
    store.delete_device(device_id)

    # Remove from router whitelist
    try:
        with _router_client() as client:
            client.remove_from_whitelist(mac)
    except (HTTPException, HuaweiRouterError) as e:
        logger.warning("Could not remove %s from router whitelist: %s", mac, e)

    return ActionResponse(success=True, message=f"Device {device['name']} removed")


# ─── Time Management ─────────────────────────────────────────────────────────

@app.post("/devices/{device_id}/reset-time", summary="Reset usage time for a device")
def reset_time(device_id: str):
    device = store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    updated = store.reset_device_time(device_id)

    # If it was blocked due to expiry, re-add to whitelist
    was_expired = device["status"] in ("expired", "blocked") and \
                  device["used_minutes"] >= device["allocated_minutes"]

    if was_expired:
        store.update_device(device_id, {"status": "disconnected"})
        try:
            with _router_client() as client:
                whitelist = store.get_whitelisted_macs()
                client.set_mac_filter_whitelist(whitelist)
        except (HTTPException, HuaweiRouterError) as e:
            logger.warning("Could not update whitelist after time reset: %s", e)

    return {"device": updated, "message": "Time reset successfully"}


@app.post("/devices/{device_id}/add-time", summary="Add extra minutes to a device")
def add_time(device_id: str, minutes: int = Query(..., gt=0, le=1440)):
    device = store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    new_alloc = device["allocated_minutes"] + minutes
    updated = store.update_device(device_id, {"allocated_minutes": new_alloc})
    return {"device": updated, "message": f"Added {minutes} minutes"}


# ─── Block / Unblock ─────────────────────────────────────────────────────────

@app.post("/devices/{device_id}/block", summary="Block a device immediately")
def block_device(device_id: str):
    device = store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    store.update_device(device_id, {"status": "blocked"})

    try:
        with _router_client() as client:
            # Remove from whitelist = blocked
            whitelist = store.get_whitelisted_macs()
            client.set_mac_filter_whitelist(whitelist)
    except (HTTPException, HuaweiRouterError) as e:
        logger.warning("Router block failed for %s: %s", device["mac"], e)
        return ActionResponse(
            success=True,
            message="Blocked in registry (router update pending next sync)",
        )

    return ActionResponse(success=True, message=f"{device['name']} has been blocked")


@app.post("/devices/{device_id}/unblock", summary="Unblock a device")
def unblock_device(device_id: str):
    device = store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Can only unblock if time remains
    if device["used_minutes"] >= device["allocated_minutes"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot unblock: device time is expired. Reset time first."
        )

    store.update_device(device_id, {"status": "disconnected"})

    try:
        with _router_client() as client:
            whitelist = store.get_whitelisted_macs()
            client.set_mac_filter_whitelist(whitelist)
    except (HTTPException, HuaweiRouterError) as e:
        logger.warning("Router unblock failed for %s: %s", device["mac"], e)
        return ActionResponse(
            success=True,
            message="Unblocked in registry (router update pending next sync)",
        )

    return ActionResponse(success=True, message=f"{device['name']} has been unblocked")


@app.post("/devices/bulk-action", summary="Perform bulk actions on multiple devices")
def bulk_action(body: BulkActionRequest):
    results = []
    for device_id in body.device_ids:
        try:
            if body.action == "block":
                block_device(device_id)
                results.append({"id": device_id, "success": True})
            elif body.action == "unblock":
                unblock_device(device_id)
                results.append({"id": device_id, "success": True})
            elif body.action == "reset_time":
                reset_time(device_id)
                results.append({"id": device_id, "success": True})
            elif body.action == "remove":
                remove_device(device_id)
                results.append({"id": device_id, "success": True})
            else:
                results.append({"id": device_id, "success": False, "error": "Unknown action"})
        except HTTPException as e:
            results.append({"id": device_id, "success": False, "error": e.detail})

    return {"results": results, "total": len(results)}


# ─── Router Management ───────────────────────────────────────────────────────

@app.get("/router/status", summary="Get router connection status")
def router_status():
    """Check router connectivity and current MAC filter state."""
    try:
        with _router_client() as client:
            mac_filter = client.get_mac_filter()
            router_status = client.get_router_status()
            connected = client.get_connected_devices()
            return {
                "reachable": True,
                "mac_filter": mac_filter,
                "router": router_status,
                "connected_devices": len(connected),
            }
    except HTTPException:
        return {"reachable": False, "error": "Router not configured"}
    except HuaweiRouterError as e:
        return {"reachable": False, "error": str(e)}


@app.post("/router/sync", summary="Force an immediate sync with the router")
def force_sync():
    """Manually trigger a sync cycle (push whitelist, update device states)."""
    result = _sync.force_sync()
    return {"sync_result": result}


@app.get("/router/connected", summary="Get devices currently connected to router")
def get_connected_devices():
    """Live list of devices connected to the router right now."""
    try:
        with _router_client() as client:
            devices = client.get_connected_devices()
            return {
                "connected": [
                    {"mac": d.mac, "ip": d.ip, "hostname": d.hostname,
                     "interface": d.interface}
                    for d in devices
                ],
                "total": len(devices)
            }
    except HuaweiRouterError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/router/push-whitelist", summary="Push current whitelist to router immediately")
def push_whitelist():
    """Force-push the MAC whitelist to the router."""
    try:
        with _router_client() as client:
            whitelist = store.get_whitelisted_macs()
            client.set_mac_filter_whitelist(whitelist)
            return ActionResponse(
                success=True,
                message=f"Whitelist pushed: {len(whitelist)} devices allowed",
                data={"whitelist": whitelist}
            )
    except HuaweiRouterError as e:
        raise HTTPException(status_code=503, detail=f"Router error: {str(e)}")


@app.post("/router/disable-filter", summary="Disable MAC filtering (allow all)")
def disable_filter():
    """Temporarily disable MAC filtering on the router."""
    try:
        with _router_client() as client:
            client.disable_mac_filter()
            return ActionResponse(success=True, message="MAC filtering disabled")
    except HuaweiRouterError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ─── Configuration ───────────────────────────────────────────────────────────

@app.get("/config", summary="Get current router configuration")
def get_config():
    cfg = store.get_config()
    # Never expose password in response
    safe = {k: v for k, v in cfg.items() if k != "password"}
    safe["password_set"] = bool(cfg.get("password"))
    return safe


@app.post("/config", summary="Set router credentials")
def set_config(body: RouterConfigUpdate):
    """
    Configure router connection details.
    Required before any router operations will work.
    """
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided")

    store.update_config(updates)

    # Test connection
    try:
        with _router_client() as client:
            status = client.get_router_status()
            return ActionResponse(
                success=True,
                message="Router configuration saved and connection verified",
                data={"router_status": status}
            )
    except HuaweiRouterError as e:
        return ActionResponse(
            success=True,
            message=f"Configuration saved (connection test failed: {e})",
        )


# ─── Sync Status ─────────────────────────────────────────────────────────────

@app.get("/sync/status", summary="Get background sync status")
def sync_status():
    return _sync.status


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/health")
def health():
    devices = store.list_devices()
    return {
        "status": "ok",
        "registered_devices": len(devices),
        "connected": sum(1 for d in devices if d["status"] == "connected"),
        "blocked": sum(1 for d in devices if d["status"] == "blocked"),
        "sync": _sync.status,
    }
