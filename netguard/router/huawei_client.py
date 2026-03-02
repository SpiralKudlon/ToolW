"""
Huawei ONT Router Client
Supports: HG8145V5, EG8145V5 (Safaricom Home Fibre routers)
Admin panel: http://192.168.100.1

The Huawei ONT uses an XML-based HTTP API with session cookies and CSRF tokens.
Endpoints used:
  GET  /api/webserver/SesTokInfo      → get session token
  POST /api/user/login                → authenticate
  GET  /api/wlan/host-list            → connected devices
  GET  /api/security/mac-filter       → current MAC filter list
  POST /api/security/mac-filter       → update MAC filter list
  GET  /api/monitoring/status         → router status
"""

import hashlib
import base64
import re
import time
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


@dataclass
class RouterDevice:
    hostname: str
    mac: str
    ip: str
    interface: str  # "wifi" or "ethernet"
    connected: bool = True


@dataclass
class MacFilterEntry:
    mac: str
    name: str = ""
    filter_type: str = "whitelist"  # "whitelist" or "blacklist"


@dataclass
class RouterConfig:
    host: str = "192.168.100.1"
    username: str = "root"
    password: str = ""
    timeout: int = 10
    verify_ssl: bool = False


class HuaweiRouterError(Exception):
    pass


class HuaweiAuthError(HuaweiRouterError):
    pass


class HuaweiRouterClient:
    """
    Client for Huawei ONT routers used by Safaricom Home Fibre.

    Authentication flow:
    1. GET /api/webserver/SesTokInfo  → returns SessionID + TokInfo (CSRF)
    2. POST /api/user/login with hashed password + tokens
    3. Subsequent requests use session cookie + __RequestVerificationToken header
    """

    MAC_FILTER_OFF = "0"
    MAC_FILTER_WHITELIST = "1"  # Only listed MACs allowed
    MAC_FILTER_BLACKLIST = "2"  # Listed MACs blocked

    def __init__(self, config: RouterConfig):
        self.config = config
        self.base_url = f"http://{config.host}"
        self._session = requests.Session()
        self._session.verify = config.verify_ssl
        self._csrf_token: Optional[str] = None
        self._logged_in = False

        # Retry strategy for flaky router responses
        retry = Retry(total=3, backoff_factor=0.5,
                      status_forcelist=[500, 502, 503, 504])
        adapter = HTTPAdapter(max_retries=retry)
        self._session.mount("http://", adapter)

    # ─── Auth ───────────────────────────────────────────────────────────────

    def _get_session_token(self) -> tuple[str, str]:
        """Fetch SessionID and RequestVerificationToken from router."""
        url = f"{self.base_url}/api/webserver/SesTokInfo"
        resp = self._session.get(url, timeout=self.config.timeout)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        ses_info = root.findtext("SesInfo") or ""
        tok_info = root.findtext("TokInfo") or ""
        if not ses_info or not tok_info:
            raise HuaweiAuthError("Could not get session/token info from router")
        return ses_info, tok_info

    def _hash_password(self, password: str, username: str, tok_info: str) -> str:
        """
        Huawei uses a double SHA-256 hash for login:
        hash1 = sha256(password)
        hash2 = base64( sha256(username + base64(hash1) + tok_info) )
        """
        h1 = hashlib.sha256(password.encode("utf-8")).hexdigest()
        h1_b64 = base64.b64encode(h1.encode("utf-8")).decode("utf-8")
        h2_input = username + h1_b64 + tok_info
        h2 = hashlib.sha256(h2_input.encode("utf-8")).hexdigest()
        return base64.b64encode(h2.encode("utf-8")).decode("utf-8")

    def login(self) -> bool:
        """Authenticate with the router. Returns True on success."""
        try:
            ses_info, tok_info = self._get_session_token()

            # Set session cookie
            self._session.cookies.set(
                "SessionID",
                ses_info.replace("SessionID=", ""),
                domain=self.config.host
            )
            self._csrf_token = tok_info

            hashed_pw = self._hash_password(
                self.config.password,
                self.config.username,
                tok_info
            )

            xml_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<request>
  <Username>{self.config.username}</Username>
  <Password>{hashed_pw}</Password>
  <password_type>4</password_type>
</request>"""

            resp = self._post("/api/user/login", xml_body)
            root = ET.fromstring(resp)

            # Check for error response
            if root.tag == "error":
                code = root.findtext("code", "")
                raise HuaweiAuthError(f"Login failed with error code: {code}")

            self._logged_in = True
            logger.info("Successfully logged into router %s", self.config.host)
            return True

        except (requests.RequestException, ET.ParseError) as e:
            raise HuaweiAuthError(f"Login failed: {str(e)}") from e

    def logout(self):
        """Logout from router session."""
        if self._logged_in:
            try:
                xml_body = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><request><Logout>1</Logout></request>"
                self._post("/api/user/logout", xml_body)
            except Exception:
                pass
            finally:
                self._logged_in = False
                self._csrf_token = None

    def __enter__(self):
        self.login()
        return self

    def __exit__(self, *args):
        self.logout()

    # ─── HTTP helpers ────────────────────────────────────────────────────────

    def _get(self, path: str) -> str:
        headers = {}
        if self._csrf_token:
            headers["__RequestVerificationToken"] = self._csrf_token
        url = f"{self.base_url}{path}"
        resp = self._session.get(url, headers=headers, timeout=self.config.timeout)
        resp.raise_for_status()
        # Refresh CSRF token from response header if provided
        new_tok = resp.headers.get("__RequestVerificationTokenone", "")
        if new_tok:
            self._csrf_token = new_tok
        return resp.text

    def _post(self, path: str, xml_body: str) -> str:
        headers = {
            "Content-Type": "application/xml",
        }
        if self._csrf_token:
            headers["__RequestVerificationToken"] = self._csrf_token
        url = f"{self.base_url}{path}"
        resp = self._session.post(
            url, data=xml_body.encode("utf-8"),
            headers=headers, timeout=self.config.timeout
        )
        resp.raise_for_status()
        new_tok = resp.headers.get("__RequestVerificationTokenone", "")
        if new_tok:
            self._csrf_token = new_tok
        return resp.text

    def _check_response(self, xml_text: str, action: str = "operation"):
        """Raise if router returned an error response."""
        try:
            root = ET.fromstring(xml_text)
            if root.tag == "error":
                code = root.findtext("code", "unknown")
                msg = root.findtext("message", "")
                raise HuaweiRouterError(f"{action} failed — error code {code}: {msg}")
        except ET.ParseError:
            pass  # Some endpoints return non-XML on success

    # ─── Device Discovery ────────────────────────────────────────────────────

    def get_connected_devices(self) -> list[RouterDevice]:
        """Returns all currently connected devices (Wi-Fi + LAN)."""
        if not self._logged_in:
            raise HuaweiRouterError("Not logged in")

        devices = []

        # Try WLAN host list first (connected wifi clients)
        try:
            xml = self._get("/api/wlan/host-list")
            root = ET.fromstring(xml)
            for host in root.findall(".//Host"):
                mac = host.findtext("MacAddress", "").upper()
                ip = host.findtext("IpAddress", "")
                hostname = host.findtext("HostName", "") or host.findtext("Name", "")
                if mac:
                    devices.append(RouterDevice(
                        hostname=hostname,
                        mac=mac,
                        ip=ip,
                        interface="wifi"
                    ))
        except Exception as e:
            logger.warning("Failed to get WLAN host list: %s", e)

        # Also try LAN host info for wired + all clients
        try:
            xml = self._get("/api/lan/HostInfo")
            root = ET.fromstring(xml)
            existing_macs = {d.mac for d in devices}
            for host in root.findall(".//Hosts"):
                mac = host.findtext("MacAddress", "").upper()
                if mac and mac not in existing_macs:
                    ip = host.findtext("IpAddress", "")
                    hostname = host.findtext("HostName", "")
                    devices.append(RouterDevice(
                        hostname=hostname,
                        mac=mac,
                        ip=ip,
                        interface="ethernet"
                    ))
                    existing_macs.add(mac)
        except Exception as e:
            logger.warning("Failed to get LAN host info: %s", e)

        return devices

    # ─── MAC Filtering ───────────────────────────────────────────────────────

    def get_mac_filter(self) -> dict:
        """
        Returns current MAC filter config:
        {
            "mode": "off" | "whitelist" | "blacklist",
            "entries": [{"mac": "AA:BB:CC:DD:EE:FF", "name": "..."}]
        }
        """
        if not self._logged_in:
            raise HuaweiRouterError("Not logged in")

        xml = self._get("/api/security/mac-filter")
        root = ET.fromstring(xml)

        mode_code = root.findtext("FilterAction", self.MAC_FILTER_OFF)
        mode_map = {
            self.MAC_FILTER_OFF: "off",
            self.MAC_FILTER_WHITELIST: "whitelist",
            self.MAC_FILTER_BLACKLIST: "blacklist",
        }
        mode = mode_map.get(mode_code, "off")

        entries = []
        for item in root.findall(".//MacFilterEntry"):
            mac = item.findtext("MacAddress", "").upper()
            name = item.findtext("DevName", "") or item.findtext("Name", "")
            if mac:
                entries.append({"mac": mac, "name": name})

        return {"mode": mode, "entries": entries}

    def set_mac_filter_whitelist(self, allowed_macs: list[dict]) -> bool:
        """
        Enable whitelist mode — ONLY the listed MACs can connect.

        allowed_macs: list of {"mac": "AA:BB:CC:DD:EE:FF", "name": "Device Name"}
        """
        return self._set_mac_filter(self.MAC_FILTER_WHITELIST, allowed_macs)

    def set_mac_filter_blacklist(self, blocked_macs: list[dict]) -> bool:
        """
        Enable blacklist mode — listed MACs are blocked, all others allowed.
        """
        return self._set_mac_filter(self.MAC_FILTER_BLACKLIST, blocked_macs)

    def disable_mac_filter(self) -> bool:
        """Turn off MAC filtering entirely."""
        return self._set_mac_filter(self.MAC_FILTER_OFF, [])

    def add_to_whitelist(self, mac: str, name: str = "") -> bool:
        """Add a single MAC to the existing whitelist."""
        current = self.get_mac_filter()
        entries = current["entries"]
        mac = mac.upper()

        # Don't add duplicates
        if any(e["mac"] == mac for e in entries):
            logger.info("MAC %s already in whitelist", mac)
            return True

        entries.append({"mac": mac, "name": name})
        return self.set_mac_filter_whitelist(entries)

    def remove_from_whitelist(self, mac: str) -> bool:
        """Remove a single MAC from the whitelist."""
        current = self.get_mac_filter()
        mac = mac.upper()
        entries = [e for e in current["entries"] if e["mac"] != mac]
        return self._set_mac_filter(self.MAC_FILTER_WHITELIST, entries)

    def block_device(self, mac: str, name: str = "") -> bool:
        """
        Add a device to blacklist (if in blacklist mode) or remove from whitelist.
        For whitelist mode (recommended), this removes the MAC from the allowed list.
        """
        current = self.get_mac_filter()
        if current["mode"] == "whitelist":
            return self.remove_from_whitelist(mac)
        else:
            # Switch to blacklist and add
            entries = current["entries"]
            mac = mac.upper()
            if not any(e["mac"] == mac for e in entries):
                entries.append({"mac": mac, "name": name})
            return self.set_mac_filter_blacklist(entries)

    def _set_mac_filter(self, filter_action: str, mac_list: list[dict]) -> bool:
        """Internal: write MAC filter settings to router."""
        if not self._logged_in:
            raise HuaweiRouterError("Not logged in")

        entries_xml = ""
        for i, entry in enumerate(mac_list):
            mac = entry.get("mac", "").upper()
            name = entry.get("name", f"Device{i+1}")
            # Sanitize name - router may reject special chars
            name = re.sub(r'[^a-zA-Z0-9_\- ]', '', name)[:32]
            entries_xml += f"""
    <MacFilterEntry>
      <Index>{i}</Index>
      <MacAddress>{mac}</MacAddress>
      <DevName>{name}</DevName>
    </MacFilterEntry>"""

        total = len(mac_list)
        xml_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<request>
  <FilterAction>{filter_action}</FilterAction>
  <MacFilterNum>{total}</MacFilterNum>
  <MacFilterEntryList>{entries_xml}
  </MacFilterEntryList>
</request>"""

        resp = self._post("/api/security/mac-filter", xml_body)
        self._check_response(resp, "set_mac_filter")
        logger.info(
            "MAC filter updated: mode=%s, %d entries",
            {self.MAC_FILTER_OFF: "off", self.MAC_FILTER_WHITELIST: "whitelist",
             self.MAC_FILTER_BLACKLIST: "blacklist"}.get(filter_action),
            total
        )
        return True

    # ─── Router Status ───────────────────────────────────────────────────────

    def get_router_status(self) -> dict:
        """Get basic router status info."""
        if not self._logged_in:
            raise HuaweiRouterError("Not logged in")
        try:
            xml = self._get("/api/monitoring/status")
            root = ET.fromstring(xml)
            return {
                "connection_status": root.findtext("ConnectionStatus"),
                "wan_ip": root.findtext("WanIPAddress"),
                "signal_strength": root.findtext("SignalIcon"),
                "network_type": root.findtext("CurrentNetworkType"),
            }
        except Exception as e:
            logger.warning("Could not get router status: %s", e)
            return {}
