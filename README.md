# ProManage

A cross‑platform project manager for creative folders on NAS or Git. Runs as a web/desktop app (Expo + Tauri) with a Next.js backend.

[ProManage.to](https://promanage.to "ProManage — Project Storage & Portfolio Updates")

## Status

Stable for day‑to‑day development and testing on Windows:
- Tauri desktop window opens and loads the Expo frontend.
- Directory picker works (Tauri native); web fallback works on Chromium.
- Backend APIs (auth, projects, refresh, upload, settings) function as expected.

## Quick start (Desktop)

Run the desktop app with Tauri (starts backend and frontend):

```cmd
cd ProManage\ProManageFR
npm install
npm run tauri:dev
```

If you see “connection refused,” confirm ports 3000 (backend) and 19006 (frontend) are free and that your firewall allows local loopback. On Windows, prefer 127.0.0.1 hosts (already set).

## Stack

- Frontend: Expo (SDK 54), Expo Router 6, React 19, React Native Paper
- Desktop: Tauri v2 (dialog plugin for native folder selection)
- Backend: Next.js App Router (Node runtime), JSON store, JWT auth

## Features

- Account auth: register, login, me (JWT)
- Projects: create/edit/delete with storage connection (NAS or Git)
- Import: single or batch import from NAS/Git
	- Ensures project subfolders exist: `photos/`, `videos/`, `models/`
	- Reads `desc.txt` (main text + #tags) on refresh
- Media upload on Save:
	- Web: multipart/form‑data to backend
	- Desktop (Tauri): backend copies native files from local paths
- Browse dialogs:
	- NAS/Git path → directory picker (folder‑only)
	- Media upload → file picker (multi‑select)
	- Tauri uses native dialogs; web falls back to Chromium directory input
- Project cards: expand/collapse to show content summary
- Per‑project Refresh to rescan folder contents and update media
- Settings: default connection type and saved credentials (encrypted at rest)

## Prerequisites

- Node.js LTS and npm
- Rust toolchain and Tauri CLI (installed via the app’s devDependencies)
- Windows (for Tauri on Windows): Visual Studio Build Tools 2022 with “Desktop development with C++”
	- Includes: MSVC v143, Windows 10/11 SDK, C++ CMake tools
	- Set Rust to MSVC toolchain:
		```cmd
		rustup toolchain install stable-x86_64-pc-windows-msvc
		rustup default stable-x86_64-pc-windows-msvc
		rustup target add x86_64-pc-windows-msvc
		```

## Development

Primary (Desktop via Tauri):

```cmd
cd ProManage\ProManageFR
npm install
npm run tauri:dev
```

- Starts backend (Next.js) on port 3000 and Expo Web on port 19006.
- Tauri opens a desktop window pointing to the Expo dev server.
	- If you see “connection refused”, ensure Expo is running on 127.0.0.1 and not blocked by firewall.

Alternative (Web only):

```cmd
cd ProManage\backend
npm install
npm run dev

cd ..\ProManageFR
npm install
expo start --web --port 19006
```

Open http://localhost:19006.

## Environment

- Frontend: `EXPO_PUBLIC_API_BASE` (defaults to `http://localhost:3000`)
- For firewall/loopback edge cases on Windows, prefer 127.0.0.1:
	- `ProManageFR/.env`: `EXPO_PUBLIC_API_BASE=http://127.0.0.1:3000`
- Backend: defaults to port `3000`

## Build (Desktop)

```cmd
cd ProManage\ProManageFR
npm run tauri:build
```

## API overview (backend)

- `POST /api/auth/register` | `POST /api/auth/login` | `GET /api/auth/me`
- `GET /api/projects` | `POST /api/projects` | `DELETE /api/projects`
	- `POST /api/projects` also ensures `photos/`, `videos/`, `models/` exist for imports
- `POST /api/projects/refresh` → rescans desc.txt and media subfolders
- `POST /api/projects/upload` →
	- multipart/form‑data (web) with fields: `id`, `type`, `file`(s)
	- JSON (desktop): `{ id, type, sources: string[] }` to copy files
- `GET/POST /api/settings` → user settings (password stored encrypted)

## Notes on folder selection

- Tauri desktop uses native OS dialogs and returns absolute paths.
- Web browsers can’t return absolute filesystem paths; the directory picker provides folder names and relative entries.

## Troubleshooting

- Linker `link.exe` not found (Windows/Tauri):
	- Install Visual Studio Build Tools 2022 → Desktop development with C++ (MSVC v143 + Windows SDK)
	- Switch Rust to MSVC toolchain (see Prerequisites)
	- Verify: `where link` and `rustc -vV` shows `x86_64-pc-windows-msvc`
- Expo dev port busy (19006): change the port or stop existing Expo instances.
- Plugin version mismatch: keep `tauri-plugin-dialog` crate and `@tauri-apps/plugin-dialog` on the same 2.x minor (e.g. 2.4).
- Expo/Metro ENOENT watch errors under `src-tauri/target`: we exclude those paths in `ProManageFR/metro.config.js`. If you still see it, stop all processes, delete `ProManageFR/.expo` and restart `npm run tauri:dev`.

---

Maintained in `frontend/ProManageFR` (Expo/Tauri) and `backend/` (Next.js). See `ProManageFR/components/ProjectPortal.tsx` for the folder picker and upload wiring.
