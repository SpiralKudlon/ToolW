# NetGuard — WiFi MAC Access Control

A full-stack web app for managing MAC-based WiFi access on **Safaricom Home Fibre routers** (Huawei HG8145V5 / EG8145V5).

- **Frontend** — React + Vite (port 5173)
- **Backend** — FastAPI + Python (port 8000)
- **Router Control** — Huawei ONT XML API (MAC whitelist enforcement)

```
Browser → Vite Dev Server → FastAPI → Huawei Router
 :5173         /api proxy      :8000    192.168.100.1
```

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- A Safaricom/Huawei ONT router on your local network

---

## Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd ToolW
```

### 2. Set up the Python backend

```bash
# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r netguard/requirements.txt
```

### 3. Set up the frontend

```bash
npm install
```

---

## Running the App

You need **two terminals** running simultaneously.

### Terminal 1 — Backend API

```bash
source venv/bin/activate
python -m uvicorn netguard.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs will be available at: **http://localhost:8000/docs**

### Terminal 2 — Frontend

```bash
npm run dev
```

Open the app at: **http://localhost:5173**

---

## First-Time Router Configuration

After starting both servers, configure your router credentials once:

```bash
curl -X POST http://localhost:8000/config \
  -H "Content-Type: application/json" \
  -d '{
    "host": "192.168.100.1",
    "username": "root",
    "password": "YOUR_ROUTER_PASSWORD"
  }'
```

> The password is printed on the sticker on the bottom of your router.
> Default is usually `adminHW` but may have been changed.

Once configured, push the whitelist to the router:

```bash
curl -X POST http://localhost:8000/router/push-whitelist
```

---

## Project Structure

```
ToolW/
├── src/
│   ├── App.jsx          # Main React UI component
│   └── main.jsx         # Vite entry point
├── netguard/            # FastAPI backend (Python package)
│   ├── main.py          # API routes & app lifecycle
│   ├── api/
│   │   ├── device_store.py   # JSON-file persistence + CRUD
│   │   └── router_sync.py    # Background sync thread (60s)
│   ├── models/
│   │   └── schemas.py        # Pydantic request/response models
│   ├── router/
│   │   └── huawei_client.py  # Huawei ONT XML API client
│   ├── requirements.txt
│   └── netguard.service      # systemd unit (for Raspberry Pi deploy)
├── index.html           # HTML entry point
├── vite.config.js       # Vite config + API proxy
├── package.json
└── .gitignore
```

---

## API Reference

### Devices
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/devices` | List all devices (`?status=`, `?search=`) |
| `POST` | `/devices` | Register a new device |
| `GET` | `/devices/{id}` | Get device details |
| `PATCH` | `/devices/{id}` | Update name / owner / allocated time |
| `DELETE` | `/devices/{id}` | Remove device + remove from whitelist |
| `POST` | `/devices/{id}/block` | Block immediately |
| `POST` | `/devices/{id}/unblock` | Unblock (requires time remaining) |
| `POST` | `/devices/{id}/reset-time` | Reset usage counter to 0 |
| `POST` | `/devices/{id}/add-time` | Add extra minutes |
| `POST` | `/devices/bulk-action` | Block / unblock / remove multiple |

### Router
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/router/status` | Connectivity + MAC filter state |
| `GET` | `/router/connected` | Live list of connected devices |
| `POST` | `/router/push-whitelist` | Force-push whitelist to router |
| `POST` | `/router/sync` | Trigger immediate sync cycle |
| `POST` | `/router/disable-filter` | Disable MAC filtering |

### Config & Status
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/config` | View router config (password hidden) |
| `POST` | `/config` | Set router credentials |
| `GET` | `/sync/status` | Background sync status |
| `GET` | `/health` | API health check |

---

## Running as a Service (Raspberry Pi / Home Server)

```bash
# Edit the service file to match your paths and username
nano netguard/netguard.service

# Install and enable
sudo cp netguard/netguard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable netguard
sudo systemctl start netguard
```

---

## Supported Routers

| Model | Admin IP | Default Username |
|-------|----------|-----------------|
| Huawei HG8145V5 (Safaricom) | 192.168.100.1 | root |
| Huawei EG8145V5 | 192.168.18.1 | adminEp |
| Huawei B525 (4G) | 192.168.8.1 | admin |
| Huawei HG8546M | 192.168.100.1 | root |

---

## Security Notes

1. **Local network only** — do not expose port 8000 to the internet
2. **MAC spoofing caveat** — MAC filtering stops casual users; combine with WPA2/WPA3 for full security
3. **Credentials** — `devices.json` (contains router password) is gitignored and never committed
4. **Production** — add an nginx reverse proxy with HTTPS if deploying on a home server
