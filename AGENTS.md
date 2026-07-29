# Telega — Telegram client (Electron + React + TDLib)

## Architecture

- **Two processes**: main (Node/CommonJS, `src/main/`) and renderer (React/Vite/ESM, `src/renderer/`)
- **Entrypoints**: `src/main/index.ts` (main), `src/renderer/renderer.tsx` (renderer)
- **Preload** (`src/main/preload.ts`) bridges IPC to `window.tdlib` — all renderer TDLib calls go through `ipcRenderer.invoke`
- All TDLib updates flow: `main` `client.on('update')` → IPC `tdlib-update` → renderer `handleUpdate` (single `useCallback(fn, [])`)
- State updates use functional updaters (`prev => ...`) throughout — never stale closures

## Commands

| Command | Action |
|---|---|
| `npm run dev` | Concurrent: `tsc -w` (main) + `vite` dev server (renderer, port 5173) |
| `npm run build` | `build:main` then `build:renderer` (order matters — main first) |
| `npm run start:dev` | Full build then `electron . --dev` (loads from vite dev server) |
| `npm run start` | `electron .` (production — loads from `dist/renderer/index.html`) |
| `npm run lint` | ESLint on `src/**/*.{ts,tsx}` |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run format` | Prettier on `src/**/*.{ts,tsx,json,md}` |
| `npm run test` | Vitest with jsdom |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run build:main` | `tsc -p tsconfig.main.json` (CommonJS to `dist/main/`) |
| `npm run build:renderer` | `vite build` (root `src/renderer/`, output `dist/renderer/`) |
| `npm run pack` | electron-builder --dir (package to dir) |
| `npm run dist` | electron-builder (full installer) |

## Setup

- Requires `.env` with `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` (copy `.env.example`)
- TDLib native binary auto-downloaded by `prebuilt-tdlib` on `npm install`
- Windows paths: use `toFileUrl()` — prepends `file:///` and normalizes backslashes

## CI / GitHub Actions

- Workflow: `.github/workflows/build.yml`
- **check** → lint + test (ubuntu)
- **build** → `npm run dist` on ubuntu/windows/macos (matrix); main process only, renderer skipped
- **release** → auto-creates tag `v{pkg.version}-build.{run_number}` and release on push to main/master
- On retry, `gh release upload --clobber` overwrites existing assets (release already exists)
- Ubuntu 24.04 (Noble) renames libs: `libasound2t64`, `libgtk-3-0t64` (not `libasound2`, `libgtk-3-0`)
- `electron` must be in `devDependencies`, not `dependencies` (electron-builder requirement)

## TDLib Quirks

- **User photos**: field is `profile_photo` (NOT `photo` — `photo` is for chats)
- `getMe` may return `profile_photo: null` — photo arrives later via `updateUser`
- **Message senders**: groups use `user_id` (`messageSenderUser`), channels use `chat_id` (`messageSenderChat`) — check `senderIsChat` before calling `getUser`
- **Photos in messages**: `messagePhoto` has `photo.sizes[]` — use largest size's `photo.id` for `downloadFile`
- **Forward info**: in `msg.forward_info.origin` — types: `messageOriginUser`, `messageOriginHiddenUser`, `messageOriginChat`, `messageOriginChannel`
- **Reply send**: use `reply_to: { _: 'inputMessageReplyToMessage', message_id }` (NOT `inputMessageReplyTo`)
- **getChatHistory** may return `total_count: 1` on first call if not synced — retry up to 5× with 1s delay
- **updateChatLastMessage** may have `last_message: null` if no messages yet
- **downloadFile** response for already-cached files includes the path immediately — process it right away (don't wait for `updateFile`)
- **`getUser` with a chat ID** errors "Invalid user identifier" — check `senderIsChat` first

## Key Conventions

- React without JSX: uses `createElement` throughout (intentional, not a config issue)
- `handleUpdate` uses `useCallback(fn, [])` with `selectedChatIdRef = useRef(selectedChatId)` for current values
- Chat ID stored on every `Message` (`chatId` field). Messages filtered as `messages.filter(m => m.chatId === selectedChatId)` to prevent cross-chat contamination from async updateNewMessage races
- `updateNewMessage` deduplicates: `setMessages(prev => prev.some(m => m.id === fm.id) ? prev : [...prev, fm])`
- Scroll-to-bottom on chat open: `setTimeout(() => { el.scrollTop = el.scrollHeight }, 0)` after `setMessages(msgs)` — fires after React commits all batched state updates
- `scrollToBottom` for new messages: checks `nearBottom` (distance < 150px), sets `el.scrollTop = el.scrollHeight` (instant, no smooth animation)
- Renderer stores a `users` cache (`Record<number, {firstName, lastName}>`) populated from `updateUser`
- Message `contentType`: `'text'`, `'photo'`, or the TDLib message type sans `message` prefix (e.g. `messageVideo` → `'video'`)
- All IPC handlers in main process log via `logger.tdlib.*`
- CSS: `.chat-area { min-width: 0; overflow: hidden }` to prevent wide messages from breaking layout
- Infinite scroll: `loadOlderMessages()` on `scrollTop <= 50`; scroll position preserved with `el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop`
- Text link entities extracted from `formattedText.entities` — rendered via `renderText()` which wraps URLs/emails/phones in `<a>` with `shell.openExternal`

## Tests & Tooling

- Vitest with jsdom; use `jsdom@^25.0.0` (v30 breaks with undici)
- `formatTime` uses `hour12: false` and fixed `'en-US'` locale — CI runs in en-US, 12-hour format fails test regex
- ESLint config avoids `eslint-plugin-react-refresh` (not in deps, not needed — project uses `createElement`)
- Test files: `src/**/*.test.ts` or `src/**/*.test.tsx`
- Setup: `src/renderer/test/setup.ts` mocks `window.tdlib` and `window.ipcRenderer`
- Only renderer utility functions have tests; no component or main process tests

## Windows Build Notes

- On stock Windows (no Developer Mode), `electron-builder --dir` / `npm run dist` fails while extracting `winCodeSign` — its 7z archive contains macOS symlinks that 7-Zip can't create without symlink privileges
- Fixes: run terminal **as Administrator**, or enable **Developer Mode** (Settings → Privacy & security → For developers), or delete the cached archive and use a non-Windows CI
- `npm run start:dev` (run from source) never needs electron-builder — usable on any platform
