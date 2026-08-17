const { toSAN, boardToText, sq } = require("./engine.js");
const { callModel } = require("./providers.js");

function pieceFullName(type) {
  return { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[type.toLowerCase()];
}

function sanFromHistoryEntry(h) {
  if (h.castle === "K") return "O-O";
  if (h.castle === "Q") return "O-O-O";
  const type = h.piece.toLowerCase();
  const destSq = sq(h.to.r, h.to.c);
  const capture = h.captured || h.enPassant;
  if (type === "p") {
    let s = capture ? "abcdefgh"[h.from.c] + "x" + destSq : destSq;
    if (h.promo) s += "=Q";
    return s;
  }
  return pieceFullName(type) + (capture ? "x" : "") + destSq;
}

function buildPrompts(state, color, moves, persona) {
  const moveList = moves.map((m, i) => `${i}: ${toSAN(state, m, moves)}`);
  const boardText = boardToText(state.board);
  const historyText = state.history.length
    ? state.history.map((h, i) => {
        const num = Math.floor(i / 2) + 1;
        const prefix = i % 2 === 0 ? `${num}.` : "";
        return `${prefix}${sanFromHistoryEntry(h)}`;
      }).join(" ")
    : "(none yet — opening move)";
  const colorName = color === "w" ? "White" : "Black";

  const systemPrompt = `${persona}

You are playing as ${colorName} in a live chess game against another AI model. Respond ONLY with valid JSON, no markdown code fences, no preamble, no text before or after. The JSON must have exactly this shape:
{"moveIndex": <integer index of your chosen move from the numbered list>, "comment": "<one short sentence explaining your move, in character>"}

Pick the single best legal move by its index. Never invent a move outside the provided numbered list.`;

  const userPrompt = `Current board (${colorName} to move):
${boardText}

Move history so far: ${historyText}

Legal moves available to you (choose by index):
${moveList.join("\n")}

Respond with JSON only.`;

  return { systemPrompt, userPrompt };
}

function extractJson(text) {
  let clean = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(clean);
  } catch (e) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not find valid JSON in model response: " + text.slice(0, 200));
  }
}

// playerConfig: { providerId, apiKey, model, baseUrl?, persona }
async function requestMove(state, color, moves, playerConfig) {
  const { systemPrompt, userPrompt } = buildPrompts(state, color, moves, playerConfig.persona);
  const { text } = await callModel(
    playerConfig.providerId,
    { apiKey: playerConfig.apiKey, model: playerConfig.model, baseUrl: playerConfig.baseUrl },
    systemPrompt,
    userPrompt
  );
  const parsed = extractJson(text);
  let idx = parsed.moveIndex;
  if (typeof idx !== "number" || idx < 0 || idx >= moves.length || !Number.isInteger(idx)) {
    // fall back to a random legal move rather than crash the match on a malformed index
    idx = Math.floor(Math.random() * moves.length);
    parsed.comment = (parsed.comment || "") + " (index invalid — fell back to a random legal move)";
  }
  return { move: moves[idx], comment: parsed.comment || "", rawText: text };
}

module.exports = { requestMove, buildPrompts, extractJson, sanFromHistoryEntry };
