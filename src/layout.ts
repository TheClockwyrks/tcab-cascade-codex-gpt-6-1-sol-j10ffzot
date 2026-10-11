import * as C from "./constants";
import type {
  CardState,
  CascadeState,
  DropTargetState,
  PileKind,
} from "./game";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
export function rows(cards: readonly CardState[]): number[] {
  const preceding = cards.slice(0, -1);
  const down = preceding.filter((c) => !c.faceUp).length;
  const up = preceding.length - down;
  const offset = up
    ? Math.max(
        C.FACE_UP_OFFSET_MIN,
        Math.min(
          C.FACE_UP_OFFSET,
          (C.COLUMN_BOTTOM_LIMIT -
            C.TABLEAU_Y -
            C.CARD_H -
            down * C.FACE_DOWN_OFFSET) /
            up,
        ),
      )
    : C.FACE_UP_OFFSET;
  let y = C.TABLEAU_Y;
  return cards.map((c) => {
    const current = y;
    y += c.faceUp ? offset : C.FACE_DOWN_OFFSET;
    return current;
  });
}
export function pileRect(s: CascadeState, pile: PileKind, index: number): Rect {
  let x: number,
    y = C.TOP_ROW_Y,
    h = C.CARD_H;
  if (pile === "stock") x = C.STOCK_X;
  else if (pile === "waste") x = C.WASTE_X;
  else if (pile === "foundation") x = C.FOUNDATION_X[index];
  else {
    x = C.COLUMN_X[index];
    y = C.TABLEAU_Y;
    const ys = rows(s.tableau[index]);
    h = (ys[ys.length - 1] ?? y) - y + C.CARD_H;
  }
  return { x, y, w: C.CARD_W, h };
}
export function menuRect(s: CascadeState, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (s.screen === "title" && index < C.TITLE_ITEMS.length)
    return { x: 160, y: 394 + index * 64, w: 330, h: 52 };
  if (s.screen === "howto" && index === 0)
    return { x: 160, y: 590, w: 220, h: 52 };
  if (s.screen === "playing" && index < C.HUD_ITEMS.length)
    return { x: 224 + index * 160, y: C.HUD_Y, w: 148, h: C.HUD_H };
  return null;
}
export const color = (c: Pick<CardState, "suit">): "red" | "black" =>
  c.suit === "hearts" || c.suit === "diamonds" ? "red" : "black";
export function validRun(cards: readonly CardState[]): boolean {
  return (
    cards.length > 0 &&
    cards.every(
      (c, i) =>
        c.faceUp &&
        (i === 0 ||
          (cards[i - 1].rank === c.rank + 1 &&
            color(cards[i - 1]) !== color(c))),
    )
  );
}
export function accepts(
  s: CascadeState,
  cards: readonly CardState[],
  pile: PileKind,
  index: number,
): boolean {
  if (!validRun(cards)) return false;
  const first = cards[0];
  if (pile === "foundation") {
    const top = s.foundations[index][s.foundations[index].length - 1];
    return (
      cards.length === 1 &&
      (!top
        ? first.rank === C.RANK_MIN
        : top.suit === first.suit &&
          first.rank === top.rank + 1 &&
          top.rank < C.RANK_MAX)
    );
  }
  if (pile === "tableau") {
    const top = s.tableau[index][s.tableau[index].length - 1];
    return !top
      ? first.rank === C.RANK_MAX
      : top.faceUp &&
          top.rank === first.rank + 1 &&
          color(top) !== color(first);
  }
  return false;
}
export function target(s: CascadeState): DropTargetState | null {
  if (!s.drag) return null;
  const x = s.drag.x + C.CARD_W / 2,
    y = s.drag.y + C.CARD_H / 2;
  for (const pile of ["foundation", "tableau"] as const) {
    if (pile === "foundation" && s.drag.fromPile === "foundation") continue;
    const count =
      pile === "foundation" ? C.FOUNDATION_COUNT : C.TABLEAU_COLUMNS;
    for (let index = 0; index < count; index++)
      if (
        !(pile === s.drag.fromPile && index === s.drag.fromIndex) &&
        contains(pileRect(s, pile, index), x, y) &&
        accepts(s, s.drag.cards, pile, index)
      )
        return { pile, index };
  }
  return null;
}
