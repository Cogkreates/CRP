
/* ============================== CHESS ENGINE ============================== */
/* Minimal but complete legal-move chess engine: generation, check detection,
   checkmate/stalemate, castling, en passant, promotion. No external deps. */

const FILES = "abcdefgh";
const START_FEN_BOARD = [
  ["r","n","b","q","k","b","n","r"],
  ["p","p","p","p","p","p","p","p"],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ["P","P","P","P","P","P","P","P"],
  ["R","N","B","Q","K","B","N","R"],
];

function cloneBoard(b) { return b.map(row => row.slice()); }

function initialState() {
  return {
    board: cloneBoard(START_FEN_BOARD),
    turn: "w",
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null, // en passant target square {r,c} or null
    halfmove: 0,
    fullmove: 1,
    history: [], // list of {san, from, to, piece, captured, promo}
  };
}

function isWhite(p) { return p && p === p.toUpperCase(); }
function isBlack(p) { return p && p === p.toLowerCase(); }
function sameColor(a, b) { return a && b && (isWhite(a) === isWhite(b)); }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function sq(r, c) { return FILES[c] + (8 - r); }

const KNIGHT_D = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_D = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const BISHOP_D = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_D = [[-1,0],[1,0],[0,-1],[0,1]];

function findKing(board, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.toLowerCase() === "k" && (isWhite(p) === (color === "w"))) return { r, c };
  }
  return null;
}

function squareAttacked(board, r, c, byColor) {
  // pawns
  const dir = byColor === "w" ? 1 : -1; // attacker's pawn is "below" target if white attacking upward... compute reverse
  const pawnRows = byColor === "w" ? [r + 1] : [r - 1];
  for (const pr of pawnRows) {
    for (const dc of [-1, 1]) {
      const pc = c + dc;
      if (inBounds(pr, pc)) {
        const p = board[pr][pc];
        if (p && p.toLowerCase() === "p" && (isWhite(p) === (byColor === "w"))) return true;
      }
    }
  }
  // knights
  for (const [dr, dc] of KNIGHT_D) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.toLowerCase() === "n" && (isWhite(p) === (byColor === "w"))) return true;
    }
  }
  // king
  for (const [dr, dc] of KING_D) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.toLowerCase() === "k" && (isWhite(p) === (byColor === "w"))) return true;
    }
  }
  // sliding: bishop/queen diag
  for (const [dr, dc] of BISHOP_D) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if ((p.toLowerCase() === "b" || p.toLowerCase() === "q") && (isWhite(p) === (byColor === "w"))) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // sliding: rook/queen straight
  for (const [dr, dc] of ROOK_D) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if ((p.toLowerCase() === "r" || p.toLowerCase() === "q") && (isWhite(p) === (byColor === "w"))) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return false;
}

function inCheck(board, color) {
  const k = findKing(board, color);
  if (!k) return false;
  return squareAttacked(board, k.r, k.c, color === "w" ? "b" : "w");
}

// Generate pseudo-legal moves for a piece at (r,c)
function pieceMoves(state, r, c) {
  const { board, ep, castling } = state;
  const p = board[r][c];
  if (!p) return [];
  const color = isWhite(p) ? "w" : "b";
  const moves = [];
  const type = p.toLowerCase();

  if (type === "p") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    const promoRow = color === "w" ? 0 : 7;
    // forward
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({ r: r + dir, c, promo: r + dir === promoRow });
      if (r === startRow && !board[r + 2 * dir][c]) {
        moves.push({ r: r + 2 * dir, c, twoSquare: true });
      }
    }
    // captures
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (target && !sameColor(p, target)) {
          moves.push({ r: nr, c: nc, promo: nr === promoRow, capture: true });
        } else if (ep && ep.r === nr && ep.c === nc) {
          moves.push({ r: nr, c: nc, enPassant: true, capture: true });
        }
      }
    }
  } else if (type === "n") {
    for (const [dr, dc] of KNIGHT_D) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target || !sameColor(p, target)) moves.push({ r: nr, c: nc, capture: !!target });
      }
    }
  } else if (type === "k") {
    for (const [dr, dc] of KING_D) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target || !sameColor(p, target)) moves.push({ r: nr, c: nc, capture: !!target });
      }
    }
    // castling
    const homeRow = color === "w" ? 7 : 0;
    if (r === homeRow && c === 4 && !inCheck(board, color)) {
      const kSide = color === "w" ? castling.wK : castling.bK;
      const qSide = color === "w" ? castling.wQ : castling.bQ;
      const oppColor = color === "w" ? "b" : "w";
      if (kSide && !board[homeRow][5] && !board[homeRow][6] &&
          board[homeRow][7] && board[homeRow][7].toLowerCase() === "r" &&
          !squareAttacked(board, homeRow, 5, oppColor) && !squareAttacked(board, homeRow, 6, oppColor)) {
        moves.push({ r: homeRow, c: 6, castle: "K" });
      }
      if (qSide && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1] &&
          board[homeRow][0] && board[homeRow][0].toLowerCase() === "r" &&
          !squareAttacked(board, homeRow, 3, oppColor) && !squareAttacked(board, homeRow, 2, oppColor)) {
        moves.push({ r: homeRow, c: 2, castle: "Q" });
      }
    }
  } else {
    const dirs = type === "b" ? BISHOP_D : type === "r" ? ROOK_D : [...BISHOP_D, ...ROOK_D];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc });
        } else {
          if (!sameColor(p, target)) moves.push({ r: nr, c: nc, capture: true });
          break;
        }
        nr += dr; nc += dc;
      }
    }
  }
  return moves.map(m => ({ from: { r, c }, ...m }));
}

function applyMove(state, move) {
  const board = cloneBoard(state.board);
  const { from, r: tr, c: tc } = move;
  const piece = board[from.r][from.c];
  const color = isWhite(piece) ? "w" : "b";
  let captured = board[tr][tc];

  board[from.r][from.c] = null;

  if (move.enPassant) {
    captured = board[from.r][tc];
    board[from.r][tc] = null;
  }

  let placed = piece;
  if (move.promo) {
    placed = color === "w" ? (move.promoPiece || "Q") : (move.promoPiece || "q").toLowerCase();
  }
  board[tr][tc] = placed;

  let newCastling = { ...state.castling };
  if (move.castle === "K") {
    const homeRow = color === "w" ? 7 : 0;
    board[homeRow][5] = board[homeRow][7];
    board[homeRow][7] = null;
  } else if (move.castle === "Q") {
    const homeRow = color === "w" ? 7 : 0;
    board[homeRow][3] = board[homeRow][0];
    board[homeRow][0] = null;
  }

  // update castling rights
  if (piece.toLowerCase() === "k") {
    if (color === "w") { newCastling.wK = false; newCastling.wQ = false; }
    else { newCastling.bK = false; newCastling.bQ = false; }
  }
  const rookLoss = (r, c) => {
    if (r === 7 && c === 0) newCastling.wQ = false;
    if (r === 7 && c === 7) newCastling.wK = false;
    if (r === 0 && c === 0) newCastling.bQ = false;
    if (r === 0 && c === 7) newCastling.bK = false;
  };
  rookLoss(from.r, from.c);
  rookLoss(tr, tc);

  let newEp = null;
  if (move.twoSquare) {
    newEp = { r: (from.r + tr) / 2, c: from.c };
  }

  const newTurn = color === "w" ? "b" : "w";
  const isCapture = !!(captured || move.enPassant);
  const newHalfmove = (piece.toLowerCase() === "p" || isCapture) ? 0 : state.halfmove + 1;
  const newFullmove = color === "b" ? state.fullmove + 1 : state.fullmove;

  return {
    board,
    turn: newTurn,
    castling: newCastling,
    ep: newEp,
    halfmove: newHalfmove,
    fullmove: newFullmove,
    history: [...state.history, { from, to: { r: tr, c: tc }, piece, captured, promo: move.promo, castle: move.castle, enPassant: move.enPassant }],
  };
}

function legalMoves(state, color) {
  const { board } = state;
  const all = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && (isWhite(p) === (color === "w"))) {
        for (const m of pieceMoves(state, r, c)) {
          // simulate
          const next = applyMove(state, m);
          if (!inCheck(next.board, color)) {
            all.push(m);
          }
        }
      }
    }
  }
  return all;
}

function pieceName(type) {
  return { p: "", n: "N", b: "B", r: "R", q: "Q", k: "K" }[type.toLowerCase()];
}

function toSAN(state, move, legalForDisambig) {
  const piece = state.board[move.from.r][move.from.c];
  const type = piece.toLowerCase();
  if (move.castle === "K") return "O-O";
  if (move.castle === "Q") return "O-O-O";
  const destSq = sq(move.r, move.c);
  const capture = move.capture || move.enPassant;
  if (type === "p") {
    let s = capture ? FILES[move.from.c] + "x" + destSq : destSq;
    if (move.promo) s += "=" + (move.promoPiece || "Q");
    return s;
  }
  let name = pieceName(type);
  // disambiguation
  const others = (legalForDisambig || []).filter(m => {
    if (m === move) return false;
    const op = state.board[m.from.r][m.from.c];
    return op && op.toLowerCase() === type && m.r === move.r && m.c === move.c &&
      !(m.from.r === move.from.r && m.from.c === move.from.c);
  });
  let disambig = "";
  if (others.length) {
    const sameFile = others.some(m => m.from.c === move.from.c);
    const sameRank = others.some(m => m.from.r === move.from.r);
    if (!sameFile) disambig = FILES[move.from.c];
    else if (!sameRank) disambig = String(8 - move.from.r);
    else disambig = FILES[move.from.c] + String(8 - move.from.r);
  }
  return name + disambig + (capture ? "x" : "") + destSq;
}

function gameStatus(state) {
  const moves = legalMoves(state, state.turn);
  const check = inCheck(state.board, state.turn);
  if (moves.length === 0) {
    if (check) return { over: true, result: state.turn === "w" ? "0-1" : "1-0", reason: "checkmate" };
    return { over: true, result: "1/2-1/2", reason: "stalemate" };
  }
  if (state.halfmove >= 100) return { over: true, result: "1/2-1/2", reason: "fifty-move rule" };
  // insufficient material (very basic check)
  const pieces = state.board.flat().filter(Boolean);
  if (pieces.length <= 3) {
    const nonKings = pieces.filter(p => p.toLowerCase() !== "k");
    if (nonKings.length === 0 || (nonKings.length === 1 && ["n","b"].includes(nonKings[0].toLowerCase()))) {
      return { over: true, result: "1/2-1/2", reason: "insufficient material" };
    }
  }
  return { over: false, check };
}

function boardToText(board) {
  let s = "  a b c d e f g h\n";
  for (let r = 0; r < 8; r++) {
    s += (8 - r) + " ";
    for (let c = 0; c < 8; c++) {
      s += (board[r][c] || ".") + " ";
    }
    s += (8 - r) + "\n";
  }
  s += "  a b c d e f g h";
  return s;
}

module.exports = { initialState, legalMoves, applyMove, toSAN, gameStatus, inCheck, boardToText, findKing, FILES, sq, isWhite };
