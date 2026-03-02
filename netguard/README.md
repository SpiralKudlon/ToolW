# NetGuard Backend — Safaricom Router WiFi Access Control

FastAPI backend that controls MAC address filtering on Safaricom Home Fibre routers
(Huawei HG8145V5 / EG8145V5 ONTs).

---

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the server
```bash
# From the parent directory of netguard/
python -m uvicorn netguard.main:app --host 0.0.0.0 --port 8000 --reload
```
API docs will be available at: **http://localhost:8000/docs**

### 3. Configure router credentials
```bash
curl -X POST http://localhost:8000/config \
  -H "Content-Type: application/json" \
  -d '{
    "host": "192.168.100.1",
    "username": "root",
    "password": "YOUR_ROUTER_PASSWORD"
  }'
```
> The router password is printed on the sticker on the bottom of your Safaricom router.
> Default is usually `adminHW` but may have been changed.

### 4. Register a device
```bash
curl -X POST http://localhost:8000/devices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Johns Laptop",
    "mac": "AA:BB:CC:DD:EE:FF",
    "owner": "John",
    "allocated_minutes": 120
  }'
```

### 5. Push whitelist to router
```bash
curl -X POST http://localhost:8000/router/push-whitelist
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    NetGuard Backend                      │
│                                                          │
│  ┌──────────┐   REST API   ┌─────────────────────────┐  │
│  │ Frontend │◄────────────►│    FastAPI (port 8000)  │  │
│  │  (.jsx)  │              │                         │  │
│  └──────────┘              │  ┌───────────────────┐  │  │
│                            │  │  Device Registry  │  │  │
│                            │  │  (devices.json)   │  │  │
│                            │  └────────┬──────────┘  │  │
│                            │           │              │  │
│                            │  ┌────────▼──────────┐  │  │
│                            │  │  RouterSync       │  │  │
│                            │  │  (every 60s)      │  │  │
│                            │  └────────┬──────────┘  │  │
│                            └───────────┼─────────────┘  │
└────────────────────────────────────────┼────────────────┘
                                         │  HTTP XML API
                          ┌──────────────▼──────────────┐
                          │   Huawei ONT Router          │
                          │   http://192.168.100.1       │
                          │                              │
                          │   MAC Whitelist Filter       │
                          │   (only listed MACs connect) │
                          └──────────────────────────────┘
```

### MAC Whitelist Enforcement
- **Whitelist mode** is used: ONLY registered devices with remaining time can connect.
- When a device's time expires → it is removed from the whitelist automatically.
- Unregistered MACs trying to connect are silently rejected by the router.
- The background sync runs every 60 seconds to enforce time limits.

---

## API Reference

### Devices
| Method | Path | Description |
|--------|------|-------------|
| GET | `/devices` | List all devices (filter by `?status=` or `?search=`) |
| POST | `/devices` | Register a new device |
| GET | `/devices/{id}` | Get device details |
| PATCH | `/devices/{id}` | Update name/owner/time |
| DELETE | `/devices/{id}` | Remove device + remove from whitelist |
| POST | `/devices/{id}/block` | Block immediately |
| POST | `/devices/{id}/unblock` | Unblock (if time remains) |
| POST | `/devices/{id}/reset-time` | Reset usage counter to 0 |
| POST | `/devices/{id}/add-time` | Add extra minutes |
| POST | `/devices/bulk-action` | Block/unblock/remove multiple |

### Router
| Method | Path | Description |
|--------|------|-------------|
| GET | `/router/status` | Router connectivity + filter state |
| GET | `/router/connected` | Live list of connected devices |
| POST | `/router/push-whitelist` | Force push whitelist to router |
| POST | `/router/sync` | Trigger immediate sync cycle |
| POST | `/router/disable-filter` | Turn off MAC filtering |

### Config
| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | View router config (password hidden) |
| POST | `/config` | Set router credentials |

---

## Connecting the Frontend

Update the `wifi-manager.jsx` React app to call this API instead of using local state.
The API base URL to use is: `http://localhost:8000`

For production deployment on a home server / Raspberry Pi:
```bash
# Install as a systemd service
sudo cp netguard.service /etc/systemd/system/
sudo systemctl enable netguard
sudo systemctl start netguard
```

---

## Supported Routers

| Model | Admin IP | Default Username | Notes |
|-------|----------|-----------------|-------|
| Huawei HG8145V5 (Safaricom) | 192.168.100.1 | root | Password on sticker |
| Huawei EG8145V5 | 192.168.18.1 | adminEp | Password on sticker |
| Huawei B525 (4G) | 192.168.8.1 | admin | |
| Huawei HG8546M | 192.168.100.1 | root | |

> **Note:** Safaricom locks some admin features on their customized firmware.
> If MAC filtering is not accessible via the web UI, it may still be accessible
> via the underlying XML API (which this backend uses directly).

---

## Security Notes

1. **Run on your local network only** — do not expose port 8000 to the internet.
2. **Use HTTPS in production** — add an nginx reverse proxy with a self-signed cert.
3. **MAC spoofing caveat** — MAC filtering stops casual users; a determined attacker
   can spoof a whitelisted MAC. Combine with WPA2/WPA3 for full security.
4. **Change default passwords** — always change your router's default password.
