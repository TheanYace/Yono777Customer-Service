**Purpose**: Short, actionable guidance for AI coding agents working in this repo.

- **Repository type**: Node.js Express server + static frontend (no DB).
- **Run (dev)**: `npm run dev` (uses `nodemon`).
- **Run (prod)**: `npm start`.

**Big Picture**:

- The backend is a single-process Express app implemented in `server.js` that:
  - serves static files from `public/` (the chat UI)
  - exposes API endpoints (e.g. `POST /api/chat`, `POST /api/upload-receipt`)
  - contains the AI agent logic (language detection, intent classification, response templates)
  - integrates with Telegram using `node-telegram-bot-api` (push notifications to a group)
- The frontend lives in `public/` (see `public/index.html` and `public/script.js`) and posts user messages to the backend.

**Important files to inspect/modify**:

- `server.js`: All core agent code lives here — `LanguageDetector`, `MultilingualResponses`, `Yono777SupportAgent`, routing, multer upload handling, and Telegram integration.
- `public/script.js`: client-side code that calls `POST /api/chat` and updates the chat UI.
- `README.md`: contains setup notes and expected API endpoints and env vars.
- `package.json`: scripts (`start`, `dev`) and dependencies.

**Project-specific patterns & conventions**:

- Single-file service: prefer editing `server.js` for behavior changes (intent rules, templates, Telegram logic). There is no database; conversational state is stored in in-memory Maps — restarting the server clears state.
- Language & intent rules are explicit arrays and regex tests inside `server.js` (no ML models). To add intents or languages, update the `keywords` objects and `MultilingualResponses.responses` in `server.js`.
- File uploads use `multer` with `memoryStorage`; uploads are forwarded to Telegram directly — do not assume files are written to disk.
- Telegram initialization is gated by environment variables. `server.js` falls back to placeholder tokens (`YOUR_TELEGRAM_BOT_TOKEN`) and logs warnings when not configured; update `.env` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_GROUP_ID` to enable notifications.

**Developer workflows (quick reference)**:

- Install: `npm install`
- Dev (auto-reload): `npm run dev`
- Start: `npm start`
- Debug: run `npm run dev` and watch `console.log` output in the terminal. Search `console.log`/`console.warn` in `server.js` for useful instrumentation points.

**How to safely change agent behavior** (concrete examples):

- Add a new deposit keyword (example): open `server.js`, find `depositKeywords` inside `class Yono777SupportAgent` and add the new token to each language array. Keep word-boundary patterning consistent (use plain words, not loose substrings).

- Edit a response template (example): modify `MultilingualResponses.responses.english.deposit.fail` in `server.js` to change the English deposit-failure text. Follow existing structure: `responses[language][category][subcategory]`.

**Integration notes / gotchas**:

- Persistence: all per-user maps (conversationHistory, depositProblems, etc.) are in-memory. If you need persistence, add a DB and migrate state consciously.
- Security: sensitive tokens come from `.env`. Never hard-code production tokens. The repo currently uses in-memory uploads — consider disk storage or cloud storage for larger files.
- Telegram: the bot is created with `polling: false` (push-only). If you need inbound Telegram handling, adjust initialization and consider webhook configurations.

**Testing & verification**:

- Manual verify: start the server, open `public/index.html`, submit sample messages and watch server logs for classification and Telegram calls.
- To test Telegram flow, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_GROUP_ID` in `.env` and re-run the server.

**When in doubt**:

- Inspect `server.js` for the exact behavior — it contains the canonical rules and messages; prefer editing there over creating parallel logic elsewhere.

Please review this draft for missing details or other patterns you'd like included.
