# Of Oil and Iron — Rules Master

A local web app that turns your PC's Gemma model into a voice-driven rules master for *Of Oil and Iron*, accessible from your phone's browser.

## Prerequisites

- [Ollama](https://ollama.com) **0.31.1 or newer** installed and running (older versions do not support the `gemma4` model architecture and will fail with `unknown model architecture: 'gemma4'`)
- A Gemma 4 12B model pulled. This project defaults to `hf.co/mradermacher/gemma-4-12B-it-heretic_decensored-GGUF:Q4_K_M`. Override with the `MODEL` env var to use a different tag.
- Node.js 18+ (needed for built-in `fetch` and web streams)

## Setup

The UI is a React app built with Vite (`client/`); the server is Express (`server/`). For production, build the client once and start the server — Express serves the built assets from `client/dist`:

```bash
npm install
npm run build   # emits client/dist
npm start       # Express serves client/dist on :8000
```

The server listens on `0.0.0.0:8000` by default and loads the ruleset (`rules.md`) into memory at startup.

### Development

For hot-reloading UI work, run both dev servers together:

```bash
npm run dev     # Express (API/WS) on :8000 + Vite (UI, HMR) on :5173
```

Open `http://localhost:5173` — Vite proxies `/api`, `/ws`, and `/shared` to Express. Rebuild (`npm run build`) before using `npm start` to serve the latest UI in production.

Tests: `npm test` runs the client suite (Vitest) and the server/shared suite (`node --test`).

## Usage

- **On the PC:** open `http://localhost:8000` — full voice input/output works here since `localhost` counts as a secure context.
- **On the phone, text-only:** open `http://<PC-LAN-IP>:8000` (find your PC's LAN IP with `ipconfig`). Chat works fine over plain HTTP.
- **On the phone, with voice:** the mic requires a secure (HTTPS) origin. Plain `http://192.168.x.x` will not allow microphone access. Use one of:
  - **Cloudflare Tunnel:** `cloudflared tunnel --url http://localhost:8000`, then open the `https://...trycloudflare.com` URL it prints on your phone.
  - **Tailscale Serve:** `tailscale serve https / http://localhost:8000`, then open the HTTPS URL Tailscale gives you.
  - A self-signed cert also works but will show a certificate warning on mobile.

## Configuration (env vars)

| Variable       | Default                                                      |
|----------------|---------------------------------------------------------------|
| `MODEL`        | `hf.co/mradermacher/gemma-4-12B-it-heretic_decensored-GGUF:Q4_K_M` |
| `OLLAMA_URL`   | `http://localhost:11434`                                      |
| `NUM_CTX`      | `32768`                                                        |
| `RULEBOOK_MD`  | `rules.md`                                                    |
| `PORT`         | `8000`                                                         |

Example:

```bash
PORT=3000 NUM_CTX=16384 npm start
```

## Rig condition tracker

Tap **🛠 Rigs** in the bottom command bar to slide up a live tracker of your
squadron's condition. Each Rig gets its **own full-screen Control Terminal** and
you **swipe left/right** between them (pager dots and ‹ › buttons below, arrow
keys on desktop). Each terminal shows the four rulebook components — **Hull, Arms,
Legs, Engine** — as Structure Point (SP) bars, an overall status line, and the
Engine's **heat**. A destroyed Rig gets a stamped `DESTROYED` overlay. Defaults
are filled from the weight class (Hull 6/7, Arms & Legs 5/6, Engine 4/5 for
Light/Medium). Swipe past the last Rig to the **add-Rig
screen**; a newly added Rig auto-swipes into view. The deck shows your Rigs first,
then enemy Rigs, based on the side you claimed in the room.

You can drive it two ways:

- **By hand:** add a Rig with the name, class, owner side, and one Long Range /
  one Melee weapon, then use the `−`/`＋` buttons on each component (and the 🔥
  buttons for heat).
- **By voice/text through Gemma:** just narrate what happens — *"the Stalker
  takes 3 damage to its hull"*, *"add a medium rig called Warden"*, *"vent the
  engine"*. The model answers normally **and** emits a hidden command that
  updates the tracker. Because the command is stripped before display, TTS reads
  only the spoken sentence — never the command.

Rules faithfully applied: a component at 0 SP is **catastrophic**; further damage
**destroys** it; the Rig is destroyed when its Hull or Engine is destroyed or all
four components hit 0; and a catastrophic Engine's heat can't be cooled below 3.
Battle state lives on the server in `data/rooms.json`, so a refresh or server
restart keeps the shared room state.

Under the hood the browser keeps only your room identity in `localStorage`, polls
`GET /api/game/<room>` every 3 seconds, and sends changes as commands. The server
injects the current battle state plus the command protocol into the system prompt
so Gemma always knows each component's current SP, heat, owner, and weapons.

### Multiplayer rooms

Two players share a battle by entering the same room code on the join screen and
picking opposite sides. Every manual tap and every hidden Gemma tracker tag is
sent to the server as a command, so clients converge on the same authoritative
state without overwriting each other.

Setting up a squadron by voice can pile up a long conversation that gets re-sent
(and re-tokenised) on every request. Tap **🧹 Clear** to wipe the conversation
history and free that context back up — **your tracked Rigs are kept**, since
their state lives in the room, not the chat. Handy right after you've dictated
the squadron.

## Reasoning toggle

The default model reasons before answering. The **🧠 Reason** button in the bottom command bar controls this:

- **On** (default): the model's reasoning streams live into a collapsible "Reasoning" block that auto-collapses once the final answer starts. Slower, but you can see how it reached the answer.
- **Off**: reasoning is suppressed (`think: false` is sent to Ollama) for faster, answer-only replies.

Text-to-speech only ever reads the final answer aloud — never the reasoning.

## Notes

- Ollama is never exposed to the network — the Node backend is the only thing your phone talks to, and it calls Ollama on `localhost` server-side. No CORS configuration needed.
- Conversation history lives in the browser and is re-sent with every request; there is no database.
- `num_ctx` is set explicitly on every request — without it Ollama silently truncates context and the model "forgets" the rulebook.
- Speech recognition (`SpeechRecognition`/`webkitSpeechRecognition`) works well on Chrome desktop and Chrome/Android. iOS Safari support is partial and can be flaky.
- The interface is mobile-first — styled as a handheld "Rig Control Terminal". Every control lives in the bottom command dock (not a top header), so nothing is pushed out of reach when the on-screen keyboard opens (`interactive-widget=resizes-content` plus a `visualViewport` height sync keep the dock above the keyboard). On desktop it renders as a centred phone-width column.
- The UI loads two web fonts (Chakra Petch + JetBrains Mono) from Google Fonts. If the device is offline they degrade gracefully to condensed system / monospace fallbacks — nothing breaks.
