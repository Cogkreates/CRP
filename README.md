# AI Chess Battle — Cross-Model Edition

Watch any two AI models play chess against each other: Claude, GPT, Gemini,
DeepSeek, Kimi, or any other OpenAI-compatible provider. Runs entirely on
your machine — no sandbox restrictions, so it can call whichever provider
you give it a key for.

Full legal-move chess engine (checkmate, stalemate, castling, en passant,
promotion) runs locally and enforces every rule. Each model only ever
*picks* from a list of moves the engine already validated, so illegal moves
are impossible regardless of what a model returns.

## Setup

```bash
npm install
npm start
```

Then open **http://localhost:4173**.

## Getting API keys

You only need keys for the providers you actually want to use — you can
run an all-Claude match, or mix and match.

| Provider | Where to get a key | Model ID examples |
|---|---|---|
| Anthropic (Claude) | https://console.anthropic.com/settings/keys | `claude-sonnet-4-6`, `claude-opus-4-8`, `claude-haiku-4-5-20251001` |
| OpenAI (GPT) | https://platform.openai.com/api-keys | `gpt-5.5`, `gpt-5.5-mini` |
| Google (Gemini) | https://aistudio.google.com/apikey | `gemini-3.5-pro`, `gemini-3.5-flash` |
| DeepSeek | https://platform.deepseek.com/api_keys | `deepseek-chat`, `deepseek-reasoner` |
| Moonshot (Kimi) | https://platform.moonshot.ai/console/api-keys | `kimi-k2`, `moonshot-v1-128k` |
| Custom | any OpenAI-compatible endpoint (Groq, Together, local vLLM, etc.) | whatever your provider names it |

Model names change often — if a model ID gets rejected, check the
provider's own docs for their current list. The app doesn't hardcode
model choices; you type the ID directly, so it never goes stale.

**Keys are never written to disk.** They live only in the Node process's
memory for the lifetime of a game and are sent directly to the provider
you chose — nothing routes through Anthropic or any third party.

## How it works

- `src/engine.js` — the chess rules engine (pure functions, no I/O)
- `src/providers.js` — one adapter per API shape: Anthropic Messages API,
  Gemini's `generateContent`, and a shared OpenAI-compatible Chat
  Completions adapter used by OpenAI, DeepSeek, Kimi, and any custom
  provider you point at an OpenAI-compatible `/chat/completions` endpoint.
- `src/moveRequest.js` — builds the board-state prompt, sends it to
  whichever provider is playing that color, and parses the model's
  `{"moveIndex": ..., "comment": ...}` JSON reply back into a move.
- `server.js` — Express server holding games in memory; the browser never
  talks to any AI provider directly, only to this local server.
- `public/` — plain HTML/CSS/JS frontend, no build step.

## Customizing personas

Each side's persona is editable right on the setup screen before you
start a match — rewrite it to make a model play aggressively, defensively,
erratically, whatever you want to test. The persona is sent as the
model's system prompt for every move it makes that game.

## Extending

- Add another provider by writing one adapter function in
  `src/providers.js` following the existing pattern, then registering it
  in the `PROVIDERS` map.
- Swap the in-memory `games` Map in `server.js` for a real database if
  you want match history to survive a restart.
- Add a tournament/round-robin mode by scripting repeated calls to
  `POST /api/games` + `/step` from a small Node script against the same
  running server.
