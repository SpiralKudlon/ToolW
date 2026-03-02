"""
RouterSync: background task that periodically syncs device state with the router.
- Polls connected devices every 60s
- Increments used_minutes for connected devices each cycle
- Pushes MAC whitelist when changes are detected
- Blocks devices whose time has expired
"""

import logging
import threading
import time
from typing import Optional

from .device_store import (
    sync_connected_devices, get_expired_devices,
    get_whitelisted_macs, update_device, list_devices, add_usage_time
)
from ..router.huawei_client import HuaweiRouterClient, RouterConfig, HuaweiRouterError

logger = logging.getLogger(__name__)


class RouterSync:
    def __init__(self, router_config_fn, poll_interval: int = 60):
        """
        router_config_fn: callable that returns current RouterConfig dict
        poll_interval: seconds between sync cycles
        """
        self._get_config = router_config_fn
        self.poll_interval = poll_interval
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._last_sync: Optional[float] = None
        self._last_error: Optional[str] = None
        self._sync_count = 0

    def start(self):
        """Start the background sync thread."""
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="RouterSync"
        )
        self._thread.start()
        logger.info("RouterSync started (interval=%ds)", self.poll_interval)

    def stop(self):
        """Stop the background sync thread."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("RouterSync stopped")

    def force_sync(self) -> dict:
        """Trigger an immediate sync and return result."""
        return self._do_sync()

    @property
    def status(self) -> dict:
        return {
            "running": self._thread.is_alive() if self._thread else False,
            "last_sync": self._last_sync,
            "last_error": self._last_error,
            "sync_count": self._sync_count,
            "poll_interval": self.poll_interval,
        }

    def _run(self):
        while not self._stop_event.is_set():
            try:
                self._do_sync()
            except Exception as e:
                self._last_error = str(e)
                logger.error("RouterSync error: %s", e)
            self._stop_event.wait(timeout=self.poll_interval)

    def _do_sync(self) -> dict:
        """Core sync logic: connect to router, update state, push whitelist."""
        cfg = self._get_config()
        if not cfg.get("password"):
            logger.debug("Router password not configured, skipping sync")
            return {"skipped": True, "reason": "no_password"}

        router_config = RouterConfig(
            host=cfg.get("host", "192.168.100.1"),
            username=cfg.get("username", "root"),
            password=cfg["password"],
        )

        result = {
            "synced": False,
            "connected": 0,
            "expired_blocked": 0,
            "whitelist_pushed": False,
            "time_ticked": 0,
        }

        try:
            with HuaweiRouterClient(router_config) as client:
                # 1. Get currently connected devices
                router_devices = client.get_connected_devices()
                result["connected"] = len(router_devices)

                # 2. Sync status in our DB
                router_device_dicts = [
                    {"mac": d.mac, "ip": d.ip, "hostname": d.hostname}
                    for d in router_devices
                ]
                synced_devices = sync_connected_devices(router_device_dicts)

                # 3. Tick usage time for every currently-connected device
                tick_minutes = self.poll_interval // 60 or 1
                connected_ids = [
                    dev["id"] for dev in synced_devices
                    if dev["status"] == "connected"
                ]
                for dev_id in connected_ids:
                    add_usage_time(dev_id, tick_minutes)
                result["time_ticked"] = len(connected_ids)

                # 4. Block expired devices
                expired = get_expired_devices()
                if expired:
                    for dev in expired:
                        logger.info(
                            "Blocking expired device: %s (%s)", dev["name"], dev["mac"]
                        )
                        update_device(dev["id"], {"status": "blocked"})

                    # Push updated whitelist (without expired devices)
                    whitelist = get_whitelisted_macs()
                    client.set_mac_filter_whitelist(whitelist)
                    result["expired_blocked"] = len(expired)
                    result["whitelist_pushed"] = True

                result["synced"] = True
                self._last_error = None

        except HuaweiRouterError as e:
            self._last_error = str(e)
            logger.warning("Router sync failed: %s", e)
            result["error"] = str(e)

        self._last_sync = time.time()
        self._sync_count += 1
        return result
