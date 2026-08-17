const FILES = "abcdefgh";
const PIECE_UNICODE = {
  K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658", P: "\u2659",
  k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F",
};
const DEFAULT_PERSONAS = {
  w: "You are a bold, attacking chess player. You favor piece activity, tactics, and king-side pressure over material caution. Explain your reasoning in one punchy sentence, like a confident grandmaster narrating their own move.",
  b: "You are a patient, positional chess player. You favor pawn structure, prophylaxis, and long-term strategic advantages over short-term tactics. Explain your reasoning in one calm sentence, like a methodical strategist.",
};

let providers = [];
let gameId = null;
let running = false;
let pollDelay = 900;
let lastState = null;

const $ = (id) => document.getElementById(id);

async function init() {
  try {
    const res = await fetch("/api/providers");
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    providers = data.providers;
    fillProviderSelect($("w-provider"));
    fillProviderSelect($("b-provider"));
    $("w-provider").value = "anthropic";
    $("b-provider").value = "openai";
    $("w-persona").value = DEFAULT_PERSONAS.w;
    $("b-persona").value = DEFAULT_PERSONAS.b;
    onProviderChange("w");
    onProviderChange("b");
  } catch (e) {
    // If this fails, wire up nothing below fails silently — show it instead,
    // and let the retry button re-run init() rather than leaving a dead page.
    showSetupError(
      "Could not load providers from the local server (" + e.message + "). " +
      "Make sure the server is running (npm start) and this page was loaded from http://localhost:4173 — " +
      "then click Retry."
    );
    const retryBtn = document.createElement("button");
    retryBtn.textContent = "Retry";
    retryBtn.className = "btn-ghost";
    retryBtn.style.marginLeft = "10px";
    retryBtn.addEventListener("click", () => { location.reload(); });
    $("setup-error").appendChild(retryBtn);
    return; // don't attach listeners against a half-populated page
  }

  $("w-provider").addEventListener("change", () => onProviderChange("w"));
  $("b-provider").addEventListener("change", () => onProviderChange("b"));
  $("start-match-btn").addEventListener("click", startMatch);
  $("toggle-run-btn").addEventListener("click", toggleRun);
  $("new-setup-btn").addEventListener("click", backToSetup);
  $("speed-slider").addEventListener("input", (e) => {
    pollDelay = Number(e.target.value);
    $("speed-val").textContent = (pollDelay / 1000).toFixed(1) + "s";
  });
}

function fillProviderSelect(sel) {
  sel.innerHTML = providers.map(p => `<option value="${p.id}">${p.label}</option>`).join("");
}

function onProviderChange(side) {
  const providerId = $(`${side}-provider`).value;
  const provider = providers.find(p => p.id === providerId);
  const row = $(`${side}-baseurl-row`);
  const input = $(`${side}-baseurl`);
  if (provider.needsBaseUrl) {
    row.style.display = "flex";
    input.value = "";
  } else if (provider.defaultBaseUrl) {
    row.style.display = "none";
  } else {
    row.style.display = "none";
  }
}

function readPlayerConfig(side) {
  const providerId = $(`${side}-provider`).value;
  const provider = providers.find(p => p.id === providerId);
  return {
    providerId,
    model: $(`${side}-model`).value.trim(),
    apiKey: $(`${side}-key`).value.trim(),
    baseUrl: provider.needsBaseUrl ? $(`${side}-baseurl`).value.trim() : undefined,
    persona: $(`${side}-persona`).value.trim(),
  };
}

async function startMatch() {
  $("setup-error").style.display = "none";
  const white = readPlayerConfig("w");
  const black = readPlayerConfig("b");

  if (!white.model || !black.model) {
    return showSetupError("Both sides need a model ID (e.g. gpt-5.5, gemini-3.5-pro, deepseek-chat, claude-sonnet-4-6).");
  }
  if (!white.apiKey || !black.apiKey) {
    return showSetupError("Both sides need an API key.");
  }

  try {
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ white, black }),
    });
    const data = await res.json();
    if (!res.ok) return showSetupError(data.error || "Could not start match.");
    gameId = data.id;
    lastState = data.state;
    enterGameScreen(white, black);
  } catch (e) {
    showSetupError("Could not reach the local server: " + e.message);
  }
}

function showSetupError(msg) {
  const box = $("setup-error");
  box.textContent = msg;
  box.style.display = "block";
}

function enterGameScreen(white, black) {
  $("setup-screen").style.display = "none";
  $("game-screen").style.display = "flex";
  $("w-model-tag").textContent = labelFor(white.providerId) + " · " + white.model;
  $("b-model-tag").textContent = labelFor(black.providerId) + " · " + black.model;
  $("w-persona-display").textContent = white.persona;
  $("b-persona-display").textContent = black.persona;
  renderState(lastState);
}

function labelFor(providerId) {
  return providers.find(p => p.id === providerId)?.label || providerId;
}

function backToSetup() {
  running = false;
  $("toggle-run-btn").textContent = "Start";
  gameId = null;
  $("game-screen").style.display = "none";
  $("setup-screen").style.display = "flex";
}

function toggleRun() {
  running = !running;
  $("toggle-run-btn").textContent = running ? "Pause" : "Resume";
  $("toggle-run-btn").className = running ? "btn btn-stop" : "btn btn-play";
  if (running) loop();
}

async function loop() {
  while (running) {
    if (lastState && lastState.status.over) {
      running = false;
      $("toggle-run-btn").textContent = "Rematch";
      $("toggle-run-btn").className = "btn btn-play";
      break;
    }
    const color = lastState.turn;
    setThinking(color, true);
    $("game-error").style.display = "none";
    try {
      const res = await fetch(`/api/games/${gameId}/step`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showGameError(data.error || "Move request failed.");
        running = false;
        $("toggle-run-btn").textContent = "Resume";
        $("toggle-run-btn").className = "btn btn-play";
        setThinking(color, false);
        return;
      }
      lastState = data;
      setThinking(color, false);
      renderState(lastState);
    } catch (e) {
      showGameError("Lost connection to local server: " + e.message);
      running = false;
      setThinking(color, false);
      return;
    }
    await new Promise(r => setTimeout(r, pollDelay));
  }
}

function showGameError(msg) {
  const box = $("game-error");
  box.textContent = msg;
  box.style.display = "block";
}

function setThinking(color, on) {
  $(`${color}-thinking`).style.display = on ? "inline" : "none";
}

function renderState(state) {
  renderBoard(state);
  renderPlayerBars(state);
  renderTicker(state);
  renderPgn(state);
  renderOverlay(state);

  $("player-bar-w").className = "player-bar" + (state.turn === "w" && !state.status.over ? " active-w" : "");
  $("player-bar-b").className = "player-bar" + (state.turn === "b" && !state.status.over ? " active-b" : "");
}

function renderBoard(state) {
  const board = state.board;
  const lastMove = state.history[state.history.length - 1];
  const checkColor = state.status.check ? state.turn : null;
  let kingPos = null;
  if (checkColor) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.toLowerCase() === "k" && (p === p.toUpperCase()) === (checkColor === "w")) kingPos = { r, c };
    }
  }

  const el = $("board");
  el.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const dark = (r + c) % 2 === 1;
      const sq = document.createElement("div");
      let cls = "square " + (dark ? "dark" : "light");
      const isLastFrom = lastMove && lastMove.from.r === r && lastMove.from.c === c;
      const isLastTo = lastMove && lastMove.to.r === r && lastMove.to.c === c;
      const isKingCheck = kingPos && kingPos.r === r && kingPos.c === c;
      if (isKingCheck) cls = "square check";
      else if (isLastFrom || isLastTo) cls = "square " + (dark ? "last-dark" : "last-light");
      sq.className = cls;

      if (c === 0) {
        const rank = document.createElement("span");
        rank.className = "coord-rank";
        rank.textContent = 8 - r;
        sq.appendChild(rank);
      }
      if (r === 7) {
        const file = document.createElement("span");
        file.className = "coord-file";
        file.textContent = FILES[c];
        sq.appendChild(file);
      }
      const piece = board[r][c];
      if (piece) {
        const span = document.createElement("span");
        const isWhite = piece === piece.toUpperCase();
        span.className = "piece " + (isWhite ? "white-piece" : "black-piece");
        span.textContent = PIECE_UNICODE[piece];
        sq.appendChild(span);
      }
      el.appendChild(sq);
    }
  }
}

function capturedFor(state, color) {
  const startCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const oppIsWhite = color === "b";
  const current = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  state.board.flat().forEach(p => {
    if (!p) return;
    const isWhite = p === p.toUpperCase();
    if (isWhite === oppIsWhite && p.toLowerCase() !== "k") current[p.toLowerCase()]++;
  });
  const captured = [];
  Object.keys(startCounts).forEach(type => {
    const missing = startCounts[type] - current[type];
    for (let i = 0; i < missing; i++) captured.push(type);
  });
  return captured;
}

function renderPlayerBars(state) {
  ["w", "b"].forEach(color => {
    const captured = capturedFor(state, color);
    const el = $(`${color}-captured`);
    el.innerHTML = captured.map(t => {
      const glyph = PIECE_UNICODE[color === "w" ? t.toUpperCase() : t];
      const textColor = color === "w" ? "#151312" : "#f4f1ea";
      return `<span style="color:${textColor}">${glyph}</span>`;
    }).join("");
  });
}

function renderTicker(state) {
  const el = $("ticker");
  if (state.log.length === 0) {
    el.innerHTML = `<div class="ticker-empty">Press Start to let the two models begin.</div>`;
    return;
  }
  el.innerHTML = state.log.map(entry => {
    const dotColor = entry.color === "w" ? "var(--amber)" : "var(--teal)";
    const colorName = entry.color === "w" ? "White" : "Black";
    const modelLabel = labelFor(entry.providerId) + " · " + entry.model;
    return `
      <div class="ticker-entry">
        <div class="ticker-dot" style="background:${dotColor}"></div>
        <div class="ticker-body">
          <div class="ticker-meta">
            <span class="ticker-san">${escapeHtml(entry.moveSan)}</span>
            <span class="ticker-color">${colorName} · ${escapeHtml(modelLabel)} · move ${entry.moveNum}</span>
          </div>
          ${entry.comment ? `<div class="ticker-text">${escapeHtml(entry.comment)}</div>` : ""}
        </div>
      </div>`;
  }).join("");
  el.scrollTop = el.scrollHeight;
}

function renderPgn(state) {
  const pairs = [];
  for (let i = 0; i < state.log.length; i += 2) {
    pairs.push({ w: state.log[i]?.moveSan || "", b: state.log[i + 1]?.moveSan || "" });
  }
  $("pgn-scroll").innerHTML = pairs.map((p, i) => `
    <div class="pgn-row">
      <span class="pgn-num">${i + 1}.</span>
      <span class="pgn-move">${escapeHtml(p.w)}</span>
      <span class="pgn-move">${escapeHtml(p.b)}</span>
    </div>`).join("");
}

function renderOverlay(state) {
  const overlay = $("overlay");
  if (state.status.over) {
    overlay.style.display = "flex";
    $("overlay-result").textContent = state.status.result;
    $("overlay-reason").textContent = "by " + state.status.reason;
  } else {
    overlay.style.display = "none";
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

init();
