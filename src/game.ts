import type {
  Game,
  InitApi,
  UpdateApi,
  RenderApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { renderTable, makeTrail, TABLE_COLOR } from "./view";

export type Screen = "title" | "howto" | "playing" | "won";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type PileKind = "stock" | "waste" | "foundation" | "tableau";

export interface CardState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly faceUp: boolean;
}

export interface DragState {
  readonly cards: readonly CardState[];
  readonly fromPile: "waste" | "foundation" | "tableau";
  readonly fromIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface DropTargetState {
  readonly pile: "foundation" | "tableau";
  readonly index: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}

export interface PressState {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

export interface FlyerState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface CascadeState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly titleIndex: number;

  readonly stock: readonly CardState[];
  readonly waste: readonly CardState[];
  readonly wasteSets: readonly number[];
  readonly foundations: readonly (readonly CardState[])[];
  readonly tableau: readonly (readonly CardState[])[];

  readonly drag: DragState | null;
  readonly dropTarget: DropTargetState | null;
  readonly pointer: PointerState;
  readonly lastPress: PressState | null;

  readonly autoFlip: boolean;
  readonly winDetect: boolean;
  readonly launching: boolean;
  readonly trailPainting: boolean;

  readonly launchClock: number;
  readonly launched: number;
  readonly flyers: readonly FlyerState[];
  readonly cascadeDone: boolean;
  readonly trailStamps: number;

  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}

export const BACKGROUND = TABLE_COLOR;
type State = DeepReadonly<CascadeState>;
type Effects = Set<C.CueName>;
const cue = (e: Effects | undefined, name: C.CueName): void => {
  e?.add(name);
};
const emptyPiles = (count: number): CardState[][] =>
  Array.from({ length: count }, () => []);
export function initialState(muted = false): CascadeState {
  return {
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    stock: [],
    waste: [],
    wasteSets: [],
    foundations: emptyPiles(C.FOUNDATION_COUNT),
    tableau: emptyPiles(C.TABLEAU_COLUMNS),
    drag: null,
    dropTarget: null,
    pointer: { x: 0, y: 0, down: false },
    lastPress: null,
    autoFlip: true,
    winDetect: true,
    launching: true,
    trailPainting: true,
    launchClock: 0,
    launched: 0,
    flyers: [],
    cascadeDone: false,
    trailStamps: 0,
    nextId: 1,
    simTime: 0,
    muted,
  };
}
import {
  accepts,
  contains,
  menuRect,
  pileRect,
  rows,
  target,
  color,
} from "./layout";
function pile(s: State, kind: PileKind, index: number): readonly CardState[] {
  const count =
    kind === "foundation"
      ? C.FOUNDATION_COUNT
      : kind === "tableau"
        ? C.TABLEAU_COLUMNS
        : 1;
  if (
    !["stock", "waste", "foundation", "tableau"].includes(kind) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= count
  )
    throw new RangeError("Invalid pile");
  return kind === "foundation"
    ? s.foundations[index]
    : kind === "tableau"
      ? s.tableau[index]
      : s[kind];
}
function put(
  s: State,
  kind: PileKind,
  index: number,
  cards: readonly CardState[],
): CascadeState {
  pile(s, kind, index);
  if (kind === "foundation" || kind === "tableau")
    return {
      ...s,
      [kind === "foundation" ? "foundations" : "tableau"]: s[
        kind === "foundation" ? "foundations" : "tableau"
      ].map((p, i) => (i === index ? cards : p)),
    };
  return { ...s, [kind]: cards };
}
function wasteRemoved(s: State): CascadeState {
  const sets = [...s.wasteSets];
  for (let i = sets.length - 1; i >= 0; i--) {
    if (sets[i] > 0) {
      sets[i]--;
      if (!sets[i]) sets.splice(i, 1);
      break;
    }
  }
  return { ...s, wasteSets: sets };
}
function checkWin(s: State, e?: Effects): CascadeState {
  if (
    s.winDetect &&
    s.foundations.every(
      (p) =>
        p.length === C.RANK_MAX &&
        p.every(
          (c, i) =>
            c.faceUp && c.rank === i + C.RANK_MIN && c.suit === p[0].suit,
        ),
    ) &&
    new Set(s.foundations.map((p) => p[0].suit)).size === C.FOUNDATION_COUNT
  ) {
    cue(e, C.CUES.win);
    return {
      ...s,
      screen: "won",
      stock: [],
      waste: [],
      wasteSets: [],
      tableau: emptyPiles(C.TABLEAU_COLUMNS),
      drag: null,
      dropTarget: null,
      launchClock: C.LAUNCH_INTERVAL,
      launched: 0,
      flyers: [],
      cascadeDone: false,
    };
  }
  return s;
}
function finish(
  s: State,
  from: PileKind,
  index: number,
  to: PileKind,
  e?: Effects,
): CascadeState {
  let next: CascadeState = s;
  if (from === "waste") next = wasteRemoved(next);
  if (from === "tableau" && next.autoFlip) {
    const cards = pile(next, from, index),
      top = cards[cards.length - 1];
    if (top && !top.faceUp) {
      next = put(next, from, index, [
        ...cards.slice(0, -1),
        { ...top, faceUp: true },
      ]);
      cue(e, C.CUES.flip);
    }
  }
  if (to === "foundation") cue(e, C.CUES.home);
  return checkWin(next, e);
}
function move(
  s: State,
  from: PileKind,
  fi: number,
  row: number,
  to: PileKind,
  ti: number,
  e?: Effects,
): [CascadeState, boolean] {
  const source = pile(s, from, fi);
  pile(s, to, ti);
  if (!Number.isInteger(row) || row < 0 || row >= source.length)
    throw new RangeError("Invalid card row");
  if (
    from === "stock" ||
    (from === to && fi === ti) ||
    (from !== "tableau" && row !== source.length - 1) ||
    (from === "waste" && !s.wasteSets.length) ||
    (from === "foundation" && to !== "tableau")
  )
    return [s, false];
  const run = source.slice(row);
  if (!accepts(s, run, to, ti)) return [s, false];
  const next = put(put(s, from, fi, source.slice(0, row)), to, ti, [
    ...pile(s, to, ti),
    ...run,
  ]);
  cue(e, C.CUES.drop);
  return [finish(next, from, fi, to, e), true];
}
function autoMove(
  s: State,
  from: PileKind,
  index: number,
  e?: Effects,
): [CascadeState, boolean] {
  const cards = pile(s, from, index),
    top = cards[cards.length - 1];
  if (
    (from !== "tableau" && from !== "waste") ||
    !top?.faceUp ||
    (from === "waste" && !s.wasteSets.length)
  )
    return [s, false];
  for (let i = 0; i < C.FOUNDATION_COUNT; i++)
    if (accepts(s, [top], "foundation", i)) {
      const next = put(
        put(s, from, index, cards.slice(0, -1)),
        "foundation",
        i,
        [...s.foundations[i], top],
      );
      return [finish(next, from, index, "foundation", e), true];
    }
  return [s, false];
}
function turnStock(s: State, e?: Effects): CascadeState {
  if (s.stock.length) {
    const count = Math.min(C.TURN_COUNT, s.stock.length);
    cue(e, C.CUES.turn);
    return {
      ...s,
      stock: s.stock.slice(0, -count),
      waste: [
        ...s.waste,
        ...s.stock
          .slice(-count)
          .reverse()
          .map((c) => ({ ...c, faceUp: true })),
      ],
      wasteSets: [...s.wasteSets, count],
    };
  }
  if (s.waste.length) {
    cue(e, C.CUES.recycle);
    return {
      ...s,
      stock: [...s.waste].reverse().map((c) => ({ ...c, faceUp: false })),
      waste: [],
      wasteSets: [],
    };
  }
  return s;
}
interface Trail {
  clear(): void;
  stamp(f: FlyerState): void;
  draw(ctx: CanvasRenderingContext2D): void;
}
function deal(s: State, trail: Trail, e?: Effects): CascadeState {
  const deck: CardState[] = C.SUITS.flatMap((suit) =>
    Array.from({ length: C.RANK_MAX - C.RANK_MIN + 1 }, (_, i) => ({
      id: s.nextId + C.SUITS.indexOf(suit) * C.RANK_MAX + i,
      suit,
      rank: i + C.RANK_MIN,
      faceUp: false,
    })),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  let offset = 0;
  const tableau = Array.from({ length: C.TABLEAU_COLUMNS }, (_, i) => {
    const cards = deck
      .slice(offset, offset + i + 1)
      .map((c, j) => ({ ...c, faceUp: j === i }));
    offset += i + 1;
    return cards;
  });
  trail.clear();
  cue(e, C.CUES.deal);
  return {
    ...s,
    tableau,
    stock: deck.slice(
      C.DEAL_TABLEAU_CARDS,
      C.DEAL_TABLEAU_CARDS + C.DEAL_STOCK_CARDS,
    ),
    waste: [],
    wasteSets: [],
    foundations: emptyPiles(C.FOUNDATION_COUNT),
    launched: 0,
    trailStamps: 0,
    nextId: s.nextId + C.DECK_SIZE,
  };
}
function start(s: State, trail: Trail, e?: Effects): CascadeState {
  return {
    ...deal(s, trail, e),
    screen: "playing",
    menuIndex: 0,
    drag: null,
    dropTarget: null,
    flyers: [],
    launchClock: 0,
    cascadeDone: false,
  };
}
function activate(
  s: State,
  trail: Trail,
  toggle: (s: State) => boolean,
  e?: Effects,
): CascadeState {
  if (s.screen === "title") {
    const next = { ...s, titleIndex: s.menuIndex, menuIndex: 0 };
    return s.menuIndex === 0
      ? start(next, trail, e)
      : { ...next, screen: "howto" };
  }
  if (s.screen === "howto" || (s.screen === "playing" && s.menuIndex === 1))
    return { ...s, screen: "title", menuIndex: s.titleIndex };
  if (s.screen === "playing" && s.menuIndex === 0) return start(s, trail, e);
  if (s.screen === "playing" && s.menuIndex === 2)
    return { ...s, muted: toggle(s) };
  return s;
}
function hover(s: State, x: number, y: number): CascadeState {
  const count =
    s.screen === "title"
      ? C.TITLE_ITEMS.length
      : s.screen === "playing"
        ? C.HUD_ITEMS.length
        : s.screen === "howto"
          ? 1
          : 0;
  for (let i = 0; i < count; i++) {
    const rect = menuRect(s, i);
    if (rect && contains(rect, x, y)) return { ...s, menuIndex: i };
  }
  return s;
}
interface Hit {
  kind: "tableau" | "waste" | "foundation";
  index: number;
  row: number;
  x: number;
  y: number;
}
function hit(s: State, x: number, y: number): Hit | null {
  for (let index = 0; index < C.TABLEAU_COLUMNS; index++) {
    const cards = s.tableau[index],
      ys = rows(cards);
    for (let row = cards.length - 1; row >= 0; row--)
      if (
        contains(
          { x: C.COLUMN_X[index], y: ys[row], w: C.CARD_W, h: C.CARD_H },
          x,
          y,
        )
      )
        return cards[row].faceUp
          ? { kind: "tableau", index, row, x: C.COLUMN_X[index], y: ys[row] }
          : null;
  }
  const visible = s.wasteSets[s.wasteSets.length - 1] ?? 0;
  if (visible && s.waste.length) {
    const wx = C.WASTE_X + (visible - 1) * C.WASTE_FAN;
    if (
      contains({ x: wx, y: C.TOP_ROW_Y, w: C.CARD_W, h: C.CARD_H }, x, y) &&
      s.waste[s.waste.length - 1].faceUp
    )
      return {
        kind: "waste",
        index: 0,
        row: s.waste.length - 1,
        x: wx,
        y: C.TOP_ROW_Y,
      };
  }
  for (let index = 0; index < C.FOUNDATION_COUNT; index++)
    if (
      s.foundations[index].length &&
      contains(pileRect(s, "foundation", index), x, y) &&
      s.foundations[index][s.foundations[index].length - 1].faceUp
    )
      return {
        kind: "foundation",
        index,
        row: s.foundations[index].length - 1,
        x: C.FOUNDATION_X[index],
        y: C.TOP_ROW_Y,
      };
  return null;
}
function returnHand(s: State): CascadeState {
  if (!s.drag) return s;
  const d = s.drag;
  return {
    ...put(s, d.fromPile, d.fromIndex, [
      ...pile(s, d.fromPile, d.fromIndex),
      ...d.cards,
    ]),
    drag: null,
    dropTarget: null,
  };
}
function pointer(
  s: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  trail: Trail,
  toggle: (s: State) => boolean,
  e?: Effects,
): CascadeState {
  let next: CascadeState = hover(s, x, y);
  if (next.drag)
    next = {
      ...next,
      drag: {
        ...next.drag,
        x: next.drag.x + x - s.pointer.x,
        y: next.drag.y + y - s.pointer.y,
      },
    };
  next = {
    ...next,
    pointer: {
      x,
      y,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  next = { ...next, dropTarget: target(next) };
  if (type === "move") return next;
  if (type === "down") {
    const previous = s.lastPress;
    next = { ...next, lastPress: { x, y, at: s.simTime } };
    if (s.screen === "won")
      return { ...start(next, trail, e), pointer: { x, y, down: false } };
    if (s.screen !== "playing") return next;
    const card = hit(next, x, y);
    if (!card) return next;
    const source = pile(next, card.kind, card.index);
    if (
      card.kind !== "foundation" &&
      card.row === source.length - 1 &&
      previous &&
      s.simTime - previous.at <= C.DOUBLE_CLICK_WINDOW &&
      Math.hypot(x - previous.x, y - previous.y) <= C.DOUBLE_CLICK_SLOP
    )
      return {
        ...autoMove(next, card.kind, card.index, e)[0],
        pointer: { x, y, down: false },
      };
    cue(e, C.CUES.lift);
    next = {
      ...put(next, card.kind, card.index, source.slice(0, card.row)),
      drag: {
        cards: source.slice(card.row),
        fromPile: card.kind,
        fromIndex: card.index,
        x: card.x,
        y: card.y,
      },
    };
    return { ...next, dropTarget: target(next) };
  }
  if (!s.pointer.down || !s.lastPress) return next;
  const press = s.lastPress;
  if (s.screen === "playing") {
    if (Math.hypot(x - press.x, y - press.y) <= C.DRAG_THRESHOLD) {
      next = returnHand(next);
      if (contains(pileRect(next, "stock", 0), press.x, press.y))
        next = turnStock(next, e);
    } else if (next.drag) {
      const d = next.drag,
        t = target(next);
      if (t) {
        next = {
          ...put(next, t.pile, t.index, [
            ...pile(next, t.pile, t.index),
            ...d.cards,
          ]),
          drag: null,
          dropTarget: null,
        };
        cue(e, C.CUES.drop);
        next = finish(next, d.fromPile, d.fromIndex, t.pile, e);
      } else {
        cue(e, C.CUES.reject);
        next = returnHand(next);
      }
    }
  }
  for (let i = 0; i < C.HUD_ITEMS.length; i++) {
    const rect = menuRect(next, i);
    if (rect && contains(rect, press.x, press.y) && contains(rect, x, y))
      return activate({ ...next, menuIndex: i }, trail, toggle, e);
  }
  return next;
}
export function drawLaunchVx(): number {
  const magnitude =
    C.LAUNCH_VX_MIN + Math.random() * (C.LAUNCH_VX_MAX - C.LAUNCH_VX_MIN);
  return magnitude * (Math.random() < 0.5 ? -1 : 1);
}
function cascade(s: State, dt: number, trail: Trail, e: Effects): CascadeState {
  let stamps = s.trailStamps;
  const flyers = s.flyers
    .map((f) => {
      let vy = f.vy + C.GRAVITY * dt,
        y = f.y + vy * dt;
      if (y >= C.FLOOR_Y && vy > 0) {
        vy = -vy * C.BOUNCE_DAMP;
        y = C.FLOOR_Y;
      }
      const next = { ...f, x: f.x + f.vx * dt, y, vy };
      if (s.trailPainting) {
        trail.stamp(next);
        stamps++;
      }
      return next;
    })
    .filter((f) => !(f.x + C.CARD_W < 0 || f.x > C.STAGE_W));
  let next: CascadeState = { ...s, flyers, trailStamps: stamps };
  if (s.screen === "won" && s.launching) {
    let clock = s.launchClock + dt,
      launched = s.launched;
    let foundations = s.foundations;
    while (
      clock + 1e-12 >= C.LAUNCH_INTERVAL &&
      launched < C.DECK_SIZE &&
      foundations.some((p) => p.length)
    ) {
      let index = launched % C.FOUNDATION_COUNT;
      while (!foundations[index].length)
        index = (index + 1) % C.FOUNDATION_COUNT;
      const cards = foundations[index],
        card = cards[cards.length - 1];
      flyers.push({
        id: card.id,
        suit: card.suit,
        rank: card.rank,
        x: C.FOUNDATION_X[index],
        y: C.TOP_ROW_Y,
        vx: drawLaunchVx(),
        vy: C.LAUNCH_VY,
      });
      foundations = foundations.map((p, i) =>
        i === index ? p.slice(0, -1) : p,
      );
      clock -= C.LAUNCH_INTERVAL;
      launched++;
      cue(e, C.CUES.launch);
    }
    next = { ...next, flyers, foundations, launchClock: clock, launched };
  }
  if (next.launched === C.DECK_SIZE && !next.flyers.length)
    next = { ...next, cascadeDone: true };
  return next;
}
function requireWhole(n: number, min = 0): void {
  if (!Number.isInteger(n) || n < min)
    throw new RangeError("Expected a whole number");
}
function requireCard(suit: Suit, rank: number): void {
  if (
    !C.SUITS.includes(suit) ||
    !Number.isInteger(rank) ||
    rank < C.RANK_MIN ||
    rank > C.RANK_MAX
  )
    throw new RangeError("Invalid card");
}
function locate(s: State, id: number): [PileKind, number, number] {
  for (const kind of ["stock", "waste", "foundation", "tableau"] as const) {
    const count =
      kind === "foundation"
        ? C.FOUNDATION_COUNT
        : kind === "tableau"
          ? C.TABLEAU_COLUMNS
          : 1;
    for (let i = 0; i < count; i++) {
      const row = pile(s, kind, i).findIndex((c) => c.id === id);
      if (row >= 0) return [kind, i, row];
    }
  }
  throw new RangeError("Unknown card id");
}
function flyerEdit(
  s: State,
  id: number,
  edit: (f: FlyerState) => FlyerState | null,
): CascadeState {
  if (!s.flyers.some((f) => f.id === id))
    throw new RangeError("Unknown flyer id");
  return {
    ...s,
    flyers: s.flyers.flatMap((f) => {
      const next = f.id === id ? edit(f) : f;
      return next ? [next] : [];
    }),
  };
}
function buildDebug(trail: Trail, toggle: (s: State) => boolean) {
  const cardRead = (c: CardState) => ({ ...c, color: color(c) });
  return {
    version: C.CASCADE_DEBUG_VERSION,
    reset(s: State): CascadeState {
      trail.clear();
      return initialState(s.muted);
    },
    snapshot(s: State) {
      const { nextId: _nextId, ...fields } = s;
      return {
        ...fields,
        version: C.CASCADE_DEBUG_VERSION,
        dealMode: C.DEAL_MODE,
        turnCount: C.TURN_COUNT,
        dealModeLabel: C.DEAL_MODE_LABEL,
        stock: s.stock.map(cardRead),
        waste: s.waste.map(cardRead),
        foundations: s.foundations.map((p) => p.map(cardRead)),
        tableau: s.tableau.map((p) => p.map(cardRead)),
        wasteSets: [...s.wasteSets],
        wasteVisibleCount: s.wasteSets[s.wasteSets.length - 1] ?? 0,
        drag: s.drag ? { ...s.drag, cards: s.drag.cards.map(cardRead) } : null,
        dropTarget: target(s),
        pointer: { ...s.pointer },
        lastPress: s.lastPress ? { ...s.lastPress } : null,
        flyers: s.flyers.map((f) => ({ ...f })),
      };
    },
    reconcile: (s: State): CascadeState => ({ ...s, dropTarget: target(s) }),
    menuItemRect: menuRect,
    setScreen(s: State, screen: Screen): CascadeState {
      if (!["title", "howto", "playing", "won"].includes(screen))
        throw new RangeError("Invalid screen");
      return { ...s, screen };
    },
    setMenuIndex(s: State, menuIndex: number): CascadeState {
      requireWhole(menuIndex);
      return { ...s, menuIndex };
    },
    setTitleIndex(s: State, titleIndex: number): CascadeState {
      requireWhole(titleIndex);
      return { ...s, titleIndex };
    },
    addCard(
      s: State,
      kind: PileKind,
      index: number,
      suit: Suit,
      rank: number,
      faceUp: boolean,
    ): CascadeState {
      requireCard(suit, rank);
      return {
        ...put(s, kind, index, [
          ...pile(s, kind, index),
          { id: s.nextId, suit, rank, faceUp },
        ]),
        nextId: s.nextId + 1,
      };
    },
    removeCard(s: State, id: number): CascadeState {
      const [kind, index, row] = locate(s, id);
      const next = put(
        s,
        kind,
        index,
        pile(s, kind, index).filter((_, i) => i !== row),
      );
      return kind === "waste" ? wasteRemoved(next) : next;
    },
    setCardFaceUp(s: State, id: number, faceUp: boolean): CascadeState {
      const [kind, index] = locate(s, id);
      return put(
        s,
        kind,
        index,
        pile(s, kind, index).map((c) => (c.id === id ? { ...c, faceUp } : c)),
      );
    },
    clearPile(s: State, kind: PileKind, index: number): CascadeState {
      const next = put(s, kind, index, []);
      return kind === "waste" ? { ...next, wasteSets: [] } : next;
    },
    clearTable: (s: State): CascadeState => ({
      ...s,
      stock: [],
      waste: [],
      wasteSets: [],
      foundations: emptyPiles(C.FOUNDATION_COUNT),
      tableau: emptyPiles(C.TABLEAU_COLUMNS),
      drag: null,
      dropTarget: null,
    }),
    addWasteSet(s: State, count: number): CascadeState {
      requireWhole(count);
      return { ...s, wasteSets: [...s.wasteSets, count] };
    },
    clearWasteSets: (s: State): CascadeState => ({ ...s, wasteSets: [] }),
    deal: (s: State): CascadeState => deal(s, trail),
    turnStock: (s: State): CascadeState => turnStock(s),
    move: (
      s: State,
      fromPile: PileKind,
      fromIndex: number,
      fromRow: number,
      toPile: PileKind,
      toIndex: number,
    ): [CascadeState, boolean] =>
      move(s, fromPile, fromIndex, fromRow, toPile, toIndex),
    autoMove: (
      s: State,
      pile: PileKind,
      index: number,
    ): [CascadeState, boolean] => autoMove(s, pile, index),
    pointerDown: (s: State, x: number, y: number): CascadeState =>
      pointer(s, "down", x, y, trail, toggle),
    pointerMove: (s: State, x: number, y: number): CascadeState =>
      pointer(s, "move", x, y, trail, toggle),
    pointerUp: (s: State, x: number, y: number): CascadeState =>
      pointer(s, "up", x, y, trail, toggle),
    setAutoFlip: (s: State, autoFlip: boolean): CascadeState => ({
      ...s,
      autoFlip,
    }),
    setWinDetect: (s: State, winDetect: boolean): CascadeState => ({
      ...s,
      winDetect,
    }),
    setLaunching: (s: State, launching: boolean): CascadeState => ({
      ...s,
      launching,
    }),
    setTrailPainting: (s: State, trailPainting: boolean): CascadeState => ({
      ...s,
      trailPainting,
    }),
    addFlyer(
      s: State,
      suit: Suit,
      rank: number,
      x: number,
      y: number,
      vx: number,
      vy: number,
    ): CascadeState {
      requireCard(suit, rank);
      return {
        ...s,
        nextId: s.nextId + 1,
        flyers: [...s.flyers, { id: s.nextId, suit, rank, x, y, vx, vy }],
      };
    },
    setFlyerPosition: (
      s: State,
      id: number,
      x: number,
      y: number,
    ): CascadeState => flyerEdit(s, id, (f) => ({ ...f, x, y })),
    setFlyerVelocity: (
      s: State,
      id: number,
      vx: number,
      vy: number,
    ): CascadeState => flyerEdit(s, id, (f) => ({ ...f, vx, vy })),
    removeFlyer: (s: State, id: number): CascadeState =>
      flyerEdit(s, id, () => null),
    clearFlyers: (s: State): CascadeState => ({ ...s, flyers: [] }),
    setLaunchClock: (s: State, launchClock: number): CascadeState => ({
      ...s,
      launchClock,
    }),
    clearTrail(s: State): CascadeState {
      trail.clear();
      return { ...s, trailStamps: 0 };
    },
    drawLaunchVx: (_s: State): number => drawLaunchVx(),
  };
}
export type CascadeDebugApi = ReturnType<typeof buildDebug>;
// Only drawing resources and a reference to the engine audio bus live outside state.
let trail: Trail = makeTrail();
let audio: UpdateApi["audio"] | null = null;
const toggle = (s: State): boolean => {
  if (!audio) return !s.muted;
  audio.setMuted(!audio.muted());
  return audio.muted();
};
export const game: Game<CascadeState, CascadeDebugApi> = {
  initialize(api: InitApi<CascadeState>): [CascadeState, CascadeDebugApi] {
    trail = makeTrail();
    audio = null;
    for (const [name, keys] of Object.entries(C.MENU_BINDINGS))
      api.input.register(name, { keys: [...keys] });
    Object.values(C.CUES).forEach((name, i) =>
      api.audio.define(name, {
        wave: i % 2 ? "sine" : "triangle",
        freq: 180 + i * 65,
        freqTo: 260 + i * 80,
        gain: 0.055,
        durationMs: 65 + i * 12,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("deal mode", () => C.DEAL_MODE);
    api.diagnostics.register("stock", (s) => s.stock.length);
    api.diagnostics.register("waste", (s) => s.waste.length);
    for (let i = 0; i < C.FOUNDATION_COUNT; i++)
      api.diagnostics.register(
        `foundation ${i}`,
        (s) => s.foundations[i].length,
      );
    for (let i = 0; i < C.TABLEAU_COLUMNS; i++)
      api.diagnostics.register(`column ${i}`, (s) => s.tableau[i].length);
    api.diagnostics.register("hand", (s) =>
      s.drag ? `${s.drag.cards.length} cards` : "none",
    );
    api.diagnostics.register("launched", (s) => s.launched);
    api.diagnostics.register("in flight", (s) => s.flyers.length);
    return [initialState(), buildDebug(trail, toggle)];
  },
  update(s: State, api: UpdateApi, dt: number): CascadeState {
    // A debug gesture can toggle SOUND before the engine's first frame.
    if (!audio && s.muted) api.audio.setMuted(true);
    audio = api.audio;
    const effects: Effects = new Set();
    let next: CascadeState = s;
    const up = api.input.pressed(C.MENU_UP),
      down = api.input.pressed(C.MENU_DOWN),
      confirm = api.input.pressed(C.MENU_CONFIRM),
      back = api.input.pressed(C.MENU_BACK);
    if (next.screen !== "won") {
      if (next.screen === "howto") {
        next = { ...next, menuIndex: 0 };
        if (confirm || back) next = activate(next, trail, toggle, effects);
      } else {
        const count =
          next.screen === "title" ? C.TITLE_ITEMS.length : C.HUD_ITEMS.length;
        if (up || down)
          next = {
            ...next,
            menuIndex: (next.menuIndex + (up ? count - 1 : 1)) % count,
          };
        else if (confirm) next = activate(next, trail, toggle, effects);
      }
    }
    for (const sample of api.input.pointerSamples())
      if (
        sample.primary &&
        (sample.type === "move" || sample.button === "primary")
      )
        next = pointer(
          next,
          sample.type,
          sample.x,
          sample.y,
          trail,
          toggle,
          effects,
        );
    if (next.screen === "playing") next = checkWin(next, effects);
    next = cascade(next, dt, trail, effects);
    for (const name of effects) api.audio.play(name);
    return { ...next, simTime: s.simTime + dt, muted: api.audio.muted() };
  },
  render(s: State, api: RenderApi): void {
    renderTable(s, api.ctx, trail);
  },
};
