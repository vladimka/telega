# Telega

Telegram client built with Electron, TypeScript, React, and TDLib.

## Prerequisites

- Node.js 20+
- [TDLib](https://github.com/tdlib/td) native binary (auto-downloaded via `prebuilt-tdlib` on `npm install`)

## Setup

```bash
git clone <repo>
cd telega
npm install
cp .env.example .env
```

Edit `.env` with your Telegram API credentials from https://my.telegram.org/apps:

```
TELEGRAM_API_ID=12345
TELEGRAM_API_HASH=your_hash_here
```

## Development

```bash
npm run dev          # watch mode: tsc + vite dev server
npm run start:dev    # full build + electron with dev server
```

Open http://localhost:5173 in Electron (auto-opened in dev mode with DevTools).

## Build & Run

```bash
npm run build        # main (CJS) then renderer (Vite)
npm run start        # production — loads from dist/renderer/index.html
```

## Scripts

| Command | Action |
|---|---|
| `npm run lint` | ESLint on `src/` |
| `npm run format` | Prettier on `src/` |
| `npm run test` | Vitest (jsdom) |
| `npm run test:watch` | Vitest watch |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run pack` | Electron-builder (dir) |
| `npm run dist` | Electron-builder (installer) |

## Architecture

- `src/main/` — main process (CommonJS, Node.js)
  - `index.ts` — entrypoint, TDLib client, IPC handlers
  - `preload.ts` — contextBridge to `window.tdlib`
  - `logger.ts` — file + console logger
- `src/renderer/` — renderer (ESM, React 18, Vite)
  - `renderer.tsx` — root component, all UI logic
  - `styles.css` — all styles
  - `utils/tdlib.ts` — utility functions and `TDLibAPI` type
  - `test/setup.ts` — vitest mock setup
- `index.html` loads `renderer.tsx` as module entry
- No JSX — uses `createElement` throughout

## Platform Notes

- **Windows**: Use `toFileUrl()` helper to convert local paths to `file:///` format
- TDLib on macOS may require `TDLIB_PATH` in `.env` if the auto-downloaded binary is not found
