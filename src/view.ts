import * as C from "./constants";
import type { CardState, CascadeState, FlyerState, Suit } from "./game";
import { color, menuRect, pileRect, rows, target } from "./layout";
export const TABLE_COLOR = "#103d36";
const INK = "#193f38",
  GOLD = "#d6b77b",
  IVORY = "#fbf7ed";
const symbols: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};
const rankText = (rank: number): string =>
  rank === C.RANK_MIN
    ? "A"
    : rank === 11
      ? "J"
      : rank === 12
        ? "Q"
        : rank === C.RANK_MAX
          ? "K"
          : String(rank);
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  fill = IVORY,
  font = "sans-serif",
  align: CanvasTextAlign = "left",
): void {
  ctx.fillStyle = fill;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 8,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
export function drawCard(
  ctx: CanvasRenderingContext2D,
  c: CardState,
  x: number,
  y: number,
  lifted = false,
): void {
  ctx.save();
  ctx.shadowColor = "#001c1a80";
  ctx.shadowBlur = lifted ? 20 : 4;
  ctx.shadowOffsetY = lifted ? 9 : 2;
  rounded(ctx, x, y, C.CARD_W, C.CARD_H, 7);
  ctx.fillStyle = c.faceUp ? IVORY : "#285f5b";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.faceUp ? "#d8d1bd" : "#b4c9b6";
  ctx.stroke();
  if (!c.faceUp) {
    rounded(ctx, x + 6, y + 6, C.CARD_W - 12, C.CARD_H - 12, 4);
    ctx.strokeStyle = "#b4c9b680";
    ctx.stroke();
    ctx.save();
    rounded(ctx, x + 9, y + 9, C.CARD_W - 18, C.CARD_H - 18, 2);
    ctx.clip();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "#9fc1ae55";
    for (let d = -C.CARD_H; d < C.CARD_W + C.CARD_H; d += 12) {
      ctx.beginPath();
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d + C.CARD_H, y + C.CARD_H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d - C.CARD_H, y + C.CARD_H);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(x + 50, y + 47);
    ctx.lineTo(x + 69, y + 70);
    ctx.lineTo(x + 50, y + 93);
    ctx.lineTo(x + 31, y + 70);
    ctx.closePath();
    ctx.fillStyle = "#285f5b";
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    text(ctx, "C", x + 50, y + 71, 22, GOLD, "Georgia", "center");
  } else {
    const ink = color(c) === "red" ? "#b54842" : "#243a37",
      symbol = symbols[c.suit];
    text(ctx, rankText(c.rank), x + 10, y + 18, 22, ink, "Georgia");
    text(
      ctx,
      symbol,
      x + (c.rank === 10 ? 39 : 30),
      y + 18,
      19,
      ink,
      "Georgia",
    );
    ctx.save();
    ctx.translate(x + C.CARD_W, y + C.CARD_H);
    ctx.rotate(Math.PI);
    text(ctx, rankText(c.rank), 10, 18, 22, ink, "Georgia");
    text(ctx, symbol, c.rank === 10 ? 39 : 30, 18, 19, ink, "Georgia");
    ctx.restore();
    if (c.rank > 10) {
      ctx.strokeStyle = "#d5cbb5";
      ctx.lineWidth = 1;
      rounded(ctx, x + 24, y + 37, 52, 66, 18);
      ctx.stroke();
      text(ctx, rankText(c.rank), x + 50, y + 61, 30, ink, "Georgia", "center");
      text(ctx, symbol, x + 50, y + 87, 24, ink, "Georgia", "center");
    } else if (c.rank === C.RANK_MIN)
      text(ctx, symbol, x + 50, y + 72, 54, ink, "Georgia", "center");
    else {
      const pairRows =
        c.rank <= 5
          ? [43, 97]
          : c.rank <= 8
            ? [40, 70, 100]
            : [38, 59, 81, 102];
      const pips: [number, number][] =
        c.rank <= 3
          ? (c.rank === 2 ? [43, 97] : [40, 70, 100]).map((py) => [50, py])
          : pairRows.flatMap(
              (py) =>
                [
                  [32, py],
                  [68, py],
                ] as [number, number][],
            );
      if (c.rank === 5 || c.rank === 9) pips.push([50, 70]);
      if (c.rank === 7) pips.push([50, 55]);
      if (c.rank === 8 || c.rank === 10) pips.push([50, 53], [50, 87]);
      for (const [px, py] of pips)
        text(
          ctx,
          symbol,
          x + px,
          y + py,
          c.rank >= 9 ? 19 : 23,
          ink,
          "Georgia",
          "center",
        );
    }
  }
  ctx.restore();
}
export function makeTrail() {
  const canvas =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (canvas) {
    canvas.width = C.STAGE_W;
    canvas.height = C.STAGE_H;
  }
  const ctx = canvas?.getContext("2d") ?? null;
  return {
    clear(): void {
      ctx?.clearRect(0, 0, C.STAGE_W, C.STAGE_H);
    },
    stamp(f: FlyerState): void {
      if (ctx) drawCard(ctx, { ...f, faceUp: true }, f.x, f.y);
    },
    draw(dest: CanvasRenderingContext2D): void {
      if (canvas) dest.drawImage(canvas, 0, 0);
    },
  };
}
function felt(ctx: CanvasRenderingContext2D): void {
  const wash = ctx.createRadialGradient(650, 280, 70, 640, 360, 790);
  wash.addColorStop(0, "#1b5145");
  wash.addColorStop(1, TABLE_COLOR);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#c1ddba05";
  ctx.lineWidth = 1;
  for (let y = 0; y < C.STAGE_H; y += 7) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(C.STAGE_W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#d6b77b22";
  ctx.strokeRect(24, 20, C.STAGE_W - 48, C.STAGE_H - 40);
}
function slot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  highlight = false,
  h = C.CARD_H,
): void {
  ctx.save();
  rounded(ctx, x, y, C.CARD_W, h, 7);
  ctx.fillStyle = highlight ? "#d6b77b33" : "#062c2b24";
  ctx.fill();
  ctx.strokeStyle = highlight ? "#f6d593" : "#abc6b33b";
  ctx.lineWidth = highlight ? 2 : 1;
  ctx.setLineDash(highlight ? [] : [4, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  text(
    ctx,
    label,
    x + C.CARD_W / 2,
    y + C.CARD_H / 2,
    28,
    highlight ? GOLD : "#a1beb16b",
    "Georgia",
    "center",
  );
  ctx.restore();
}
function button(
  ctx: CanvasRenderingContext2D,
  s: CascadeState,
  index: number,
  label: string,
): void {
  const r = menuRect(s, index);
  if (!r) return;
  const selected = s.menuIndex === index;
  if (s.screen === "playing") {
    if (selected) {
      ctx.fillStyle = "#d6b77b18";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = GOLD;
      ctx.fillRect(r.x, r.y, r.w, 2);
    }
    text(
      ctx,
      label,
      r.x + r.w / 2,
      r.y + r.h / 2,
      12,
      selected ? "#f3d49e" : "#b9ccc0",
      "sans-serif",
      "center",
    );
    if (index === 2) {
      ctx.fillStyle = s.muted ? "#667b72" : GOLD;
      ctx.beginPath();
      ctx.arc(r.x + 112, r.y + r.h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    rounded(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.fillStyle = selected ? GOLD : "#d6b77b08";
    ctx.fill();
    ctx.strokeStyle = selected ? GOLD : "#d6b77b65";
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, label, r.x + 24, r.y + r.h / 2, 15, selected ? INK : "#e9dfc6");
    text(
      ctx,
      "→",
      r.x + r.w - 27,
      r.y + r.h / 2,
      21,
      selected ? INK : GOLD,
      "Georgia",
      "center",
    );
  }
}
function title(ctx: CanvasRenderingContext2D, s: CascadeState): void {
  text(ctx, "A LITTLE ORDER. A BEAUTIFUL FALL.", 160, 145, 12, GOLD);
  text(ctx, C.TITLE_TEXT, 154, 231, 92, IVORY, "Georgia");
  text(ctx, C.TAGLINE_TEXT, 160, 308, 17, "#afc3b4");
  ctx.fillStyle = GOLD;
  ctx.fillRect(160, 349, 54, 2);
  C.TITLE_ITEMS.forEach((label, i) => button(ctx, s, i, label));
  text(ctx, C.DEAL_MODE_LABEL, 160, 566, 12, GOLD);
  text(
    ctx,
    "Take your time. Make your way.",
    160,
    602,
    17,
    "#a1b9a9",
    "Georgia",
  );
  ctx.save();
  ctx.translate(855, 315);
  ctx.rotate(-0.2);
  drawCard(
    ctx,
    { id: 0, suit: "spades", rank: C.RANK_MAX, faceUp: false },
    -125,
    -155,
  );
  ctx.restore();
  ctx.save();
  ctx.translate(867, 329);
  ctx.rotate(0.12);
  drawCard(ctx, { id: 0, suit: "hearts", rank: 12, faceUp: true }, -39, -128);
  ctx.restore();
  ctx.save();
  ctx.translate(938, 378);
  ctx.rotate(0.3);
  drawCard(
    ctx,
    { id: 0, suit: "spades", rank: C.RANK_MIN, faceUp: true },
    -36,
    -105,
  );
  ctx.restore();
  ctx.strokeStyle = "#d6b77b40";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(875, 347, 216, 0.22, Math.PI * 1.42);
  ctx.stroke();
  text(ctx, "01 / PATIENCE", 826, 589, 12, GOLD);
  text(
    ctx,
    "Built up. Let loose.",
    852,
    622,
    20,
    "#b5c9b7",
    "Georgia",
    "center",
  );
}
function howto(ctx: CanvasRenderingContext2D, s: CascadeState): void {
  text(ctx, "THE ART OF PATIENCE", 160, 108, 12, GOLD);
  text(ctx, "How to play", 156, 171, 54, IVORY, "Georgia");
  const entries = [
    [
      "01",
      "BUILD A HOME",
      "Build four foundations from ACE to KING, one suit in each.",
    ],
    [
      "02",
      "MAKE ROOM",
      "Stack columns downward in alternating colors. Only a KING fills an empty column.",
    ],
    [
      "03",
      "TURN THE STOCK",
      "Turn the STOCK to reveal three cards. Play the front card; recycle when it runs out.",
    ],
    [
      "04",
      "FOLLOW YOUR HAND",
      "Drag a card or a face-up run. DOUBLE-CLICK an exposed card to send it home.",
    ],
  ];
  entries.forEach(([n, heading, body], i) => {
    const y = 265 + i * 75;
    text(ctx, n, 160, y, 20, GOLD, "Georgia");
    text(ctx, heading, 212, y - 9, 13, GOLD);
    text(ctx, body, 212, y + 16, 17, "#d3dfcf");
  });
  button(ctx, s, 0, C.HOWTO_BACK_LABEL);
}
export function renderTable(
  s: CascadeState,
  ctx: CanvasRenderingContext2D,
  trail: { draw(ctx: CanvasRenderingContext2D): void },
): void {
  ctx.save();
  felt(ctx);
  if (s.screen === "title") {
    title(ctx, s);
    ctx.restore();
    return;
  }
  if (s.screen === "howto") {
    howto(ctx, s);
    ctx.restore();
    return;
  }
  text(ctx, C.TITLE_TEXT, 57, 67, 20, GOLD, "Georgia");
  text(ctx, "PATIENCE", 58, 92, 9, "#a0b7a5");
  text(ctx, "BUILD", 1110, 67, 10, GOLD);
  text(ctx, "A → K", 1110, 91, 18, "#a0b7a5", "Georgia");
  trail.draw(ctx);
  if (s.screen === "playing") {
    slot(ctx, C.STOCK_X, C.TOP_ROW_Y, "↻");
    if (s.stock.length)
      drawCard(ctx, s.stock[s.stock.length - 1], C.STOCK_X, C.TOP_ROW_Y);
    const visible = s.wasteSets[s.wasteSets.length - 1] ?? 0;
    slot(ctx, C.WASTE_X, C.TOP_ROW_Y, "");
    if (visible && s.waste.length) {
      // A card in hand still belongs to its set until its drop is accepted.
      const held = s.drag?.fromPile === "waste" ? 1 : 0;
      const count = Math.min(s.waste.length, Math.max(0, visible - held));
      const hidden = s.waste.length - count;
      if (hidden) drawCard(ctx, s.waste[hidden - 1], C.WASTE_X, C.TOP_ROW_Y);
      s.waste
        .slice(-count || s.waste.length)
        .forEach((c, i) =>
          drawCard(ctx, c, C.WASTE_X + i * C.WASTE_FAN, C.TOP_ROW_Y),
        );
    }
    s.tableau.forEach((cards, i) => {
      slot(ctx, C.COLUMN_X[i], C.TABLEAU_Y, "K");
      const ys = rows(cards);
      cards.forEach((c, j) => drawCard(ctx, c, C.COLUMN_X[i], ys[j]));
    });
  }
  s.foundations.forEach((cards, i) => {
    slot(ctx, C.FOUNDATION_X[i], C.TOP_ROW_Y, "A");
    if (cards.length)
      drawCard(ctx, cards[cards.length - 1], C.FOUNDATION_X[i], C.TOP_ROW_Y);
  });
  if (s.screen === "playing") {
    const t = target(s);
    if (t) {
      const r = pileRect(s, t.pile, t.index);
      slot(ctx, r.x, r.y, "", true, r.h);
    }
    if (s.drag)
      s.drag.cards.forEach((c, i) =>
        drawCard(ctx, c, s.drag!.x, s.drag!.y + i * C.FACE_UP_OFFSET, true),
      );
    ctx.fillStyle = "#092e2b";
    ctx.fillRect(0, C.HUD_Y, C.STAGE_W, C.HUD_H);
    ctx.fillStyle = "#d6b77b3b";
    ctx.fillRect(0, C.HUD_Y, C.STAGE_W, 1);
    C.HUD_ITEMS.forEach((label, i) => button(ctx, s, i, label));
    text(
      ctx,
      C.DEAL_MODE_LABEL,
      1056,
      C.HUD_Y + C.HUD_H / 2,
      11,
      GOLD,
      "sans-serif",
      "right",
    );
  }
  s.flyers.forEach((f) => drawCard(ctx, { ...f, faceUp: true }, f.x, f.y));
  if (s.screen === "won" && s.cascadeDone) {
    ctx.fillStyle = "#0b302bea";
    rounded(ctx, 405, 263, 470, 184, 8);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    text(ctx, C.WIN_TEXT, 640, 331, 58, IVORY, "Georgia", "center");
    text(
      ctx,
      "A beautiful finish. Tap anywhere to begin again.",
      640,
      399,
      16,
      GOLD,
      "sans-serif",
      "center",
    );
  }
  ctx.restore();
}
