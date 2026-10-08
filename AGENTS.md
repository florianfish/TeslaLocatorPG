# AGENTS.md - Developer & Agent Guidelines for TeslaLocatorPG 🚗📍

Welcome! This repository contains **TeslaLocatorPG**, a real-time Tesla vehicle tracking and telemetry dashboard integrated with **TeslaMate** via **MQTT**.

---

## 🎯 Architecture Overview

```
[TeslaMate / MQTT Broker] ──(MQTT)──> [server.ts (Express Proxy)] ──(SSE Stream)──> [React 19 / Leaflet Frontend]
                                           │                                                 │
                                     (Token Auth)                                   (Leaflet / Tailwind)
```

1. **Backend (`server.ts`)**:
   - **Express Application**: Runs on port `3000`. Serves both API endpoints and the frontend (via Vite middleware in development or static build in production).
   - **MQTT Client**: Connects to the configured broker (`MQTT_BROKER_URL`) with fallback reconnection logic. Listens to location (`teslamate/cars/1/location`) and telemetry topics (`speed`, `battery_level`, `state`, `odometer`, `outside_temp`, `shift_state`, `active_route`).
   - **SSE Real-time Stream (`/api/stream`)**: Pushes real-time updates and logs to connected frontend clients without full polling.
   - **Token Guard**: Validates request parameter `?token=...` against `process.env.SECURE_ACCESS_TOKEN`.

2. **Frontend (`src/`)**:
   - **React 19 + Vite**: Modern SPA layout.
   - **Leaflet (`leaflet`)**: Interactive map with custom car marker, smooth polyline tracking, and dark tile layers.
   - **Tailwind CSS v4 + Lucide Icons**: Premium glassmorphic UI overlay, telemetry gauges, connection status pill, and debug drawer.

---

## 🚀 Running & Developing

### Local Development (Recommended)
```bash
# 1. Install dependencies
npm install

# 2. Run dev server (Express + Vite Middleware with HMR)
npm run dev
```
- **URL**: `http://localhost:3000/?token=VOTRE_SECURE_ACCESS_TOKEN` (ou la valeur de `SECURE_ACCESS_TOKEN` dans `.env`).

### Build & Production
```bash
# Build frontend bundle & bundle server.ts -> dist/server.cjs
npm run build

# Start production server
npm start
```

### Docker
```bash
# Build & run local container
docker compose up --build -d

# Restart container (e.g., after editing .env)
docker compose restart
```

---

## 🔐 Security & Auth Rules

- All API endpoints requiring privacy (`/api/data`, `/api/stream`, `/api/test-publish`) **MUST** verify `req.query.token === SECURE_ACCESS_TOKEN`.
- `/api/config` returns `{ authorized: boolean }` to allow frontend verification without leaking secret contents.
- Read-only payloads (`user` token, share links) go through `restrictForRole` in `server.ts`: any new field sent by `/api/data` or `/api/stream` must be reviewed there.
- Do not log sensitive secrets (like passwords or full access tokens) to public output or client SSE payloads.

---

## 🛠 Code Conventions & Maintenance

1. **TypeScript Safety**:
   - Run `npm run lint` (`tsc --noEmit`) to verify type consistency before declaring feature completion.
   - Maintain data contracts defined in `src/types.ts`.

2. **UI & Design Aesthetics**:
   - Maintain the sleek dark mode aesthetic with glassmorphism (`backdrop-blur-md`, dark semi-transparent panels, neon accents).
   - Ensure Leaflet map instances are properly cleaned up on component unmount.

3. **MQTT & SSE Handling**:
   - Parsed coordinates must be validated within valid geographic bounds (`lat: [-90, 90]`, `lon: [-180, 180]`).
   - Keep rolling buffer size limit (e.g. max 50 recent message logs) to avoid memory leaks.
