try { require("dotenv").config(); } catch (e) { /* dotenv optional — fine if not installed */ }
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const { initialState, legalMoves, applyMove, toSAN, gameStatus } = require("./src/engine.js");
const { requestMove } = require("./src/moveRequest.js");
const { PROVIDERS } = require("./src/providers.js");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// In-memory game store. Fine for a local single-user tool; nothing here needs
// to survive a server restart, and API keys never leave this process.
const games = new Map();

function publicProviderList() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    label: p.label,
    needsBaseUrl: id === "custom",
    defaultBaseUrl: p.baseUrl || null,
  }));
}

app.get("/api/providers", (req, res) => {
  res.json({ providers: publicProviderList() });
});

app.post("/api/games", (req, res) => {
  const { white, black } = req.body || {};
  if (!white || !black) {
    return res.status(400).json({ error: "Both white and black player configs are required." });
  }
  for (const [label, cfg] of [["white", white], ["black", black]]) {
    if (!cfg.providerId || !PROVIDERS[cfg.providerId]) {
      return res.status(400).json({ error: `${label}: unknown or missing providerId` });
    }
    if (!cfg.apiKey) {
      return res.status(400).json({ error: `${label}: apiKey is required` });
    }
    if (!cfg.model) {
      return res.status(400).json({ error: `${label}: model is required` });
    }
    if (cfg.providerId === "custom" && !cfg.baseUrl) {
      return res.status(400).json({ error: `${label}: baseUrl is required for a custom provider` });
    }
  }

  const id = crypto.randomUUID();
  games.set(id, {
    id,
    state: initialState(),
    players: { w: white, b: black },
    log: [],
    createdAt: Date.now(),
  });
  res.json({ id, state: publicState(games.get(id)) });
});

function publicState(game) {
  const status = gameStatus(game.state);
  return {
    board: game.state.board,
    turn: game.state.turn,
    history: game.state.history.map(h => ({
      from: h.from, to: h.to, piece: h.piece, captured: h.captured, promo: h.promo,
      castle: h.castle, enPassant: h.enPassant,
    })),
    status,
    log: game.log,
    players: {
      w: { providerId: game.players.w.providerId, model: game.players.w.model, persona: game.players.w.persona },
      b: { providerId: game.players.b.providerId, model: game.players.b.model, persona: game.players.b.persona },
    },
  };
}

app.get("/api/games/:id", (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "Game not found" });
  res.json(publicState(game));
});

app.post("/api/games/:id/step", async (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "Game not found" });

  const status = gameStatus(game.state);
  if (status.over) return res.json({ ...publicState(game), noop: true });

  const color = game.state.turn;
  const moves = legalMoves(game.state, color);
  if (moves.length === 0) return res.json({ ...publicState(game), noop: true });

  try {
    const { move, comment } = await requestMove(game.state, color, moves, game.players[color]);
    const san = toSAN(game.state, move, moves);
    game.state = applyMove(game.state, move);
    game.log.push({
      color,
      moveSan: san,
      comment,
      moveNum: game.state.fullmove,
      providerId: game.players[color].providerId,
      model: game.players[color].model,
    });
    res.json(publicState(game));
  } catch (e) {
    res.status(502).json({ error: e.message || "Model call failed", ...publicState(game) });
  }
});

app.post("/api/games/:id/reset", (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "Game not found" });
  game.state = initialState();
  game.log = [];
  res.json(publicState(game));
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`\nAI Chess Battle running at http://localhost:${PORT}\n`);
});
