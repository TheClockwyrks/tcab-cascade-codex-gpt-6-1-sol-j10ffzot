import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine, UpdateApi } from "@clockwyrks/simple-2d";
import { game, BACKGROUND, initialState } from "./game";
import type { CascadeState, CascadeDebugApi, Suit } from "./game";
import * as C from "./constants";
import { rows, pileRect } from "./layout";
const engines: Engine<CascadeState, CascadeDebugApi>[] = [];
afterEach(() => {
  engines.forEach((e) => e.destroy());
  engines.length = 0;
});
async function harness(step = 1000 / 60) {
  const events = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.STAGE_W, C.STAGE_H) as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const d = engine.debug;
  const add = (
    kind: "stock" | "waste" | "tableau" | "foundation",
    index: number,
    suit: Suit,
    rank: number,
    up = true,
  ) => engine.apply((s) => d.addCard(s, kind, index, suit, rank, up));
  const key = (code: string, type = "keydown") => {
    const event = new Event(type);
    Object.assign(event, { code, repeat: false });
    events.dispatchEvent(event);
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    device = "mouse",
    primary = true,
  ) => {
    const event = new Event(`pointer${type}`);
    Object.assign(event, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: device,
      isPrimary: primary,
      button: 0,
      buttons: type === "up" ? 0 : 1,
    });
    events.dispatchEvent(event);
  };
  return { e: engine, d, add, key, pointer };
}
describe("deck and stock", () => {
  it("starts with the complete, empty title state and pure diagnostics", async () => {
    const { e, d } = await harness();
    expect(e.state).toEqual(initialState());
    const before = JSON.stringify(e.state);
    expect(d.snapshot(e.state).dealMode).toBe(C.DEAL_MODE);
    expect(e.diagnostics()).toHaveLength(18);
    expect(JSON.stringify(e.state)).toBe(before);
  });
  it("deals 52 unique identities and pairs, seven correctly faced columns and 24 stock cards", async () => {
    const { e, d } = await harness();
    const original = e.state;
    e.apply(d.deal);
    expect(original.stock).toHaveLength(0);
    expect(e.state.screen).toBe("title");
    const cards = [...e.state.stock, ...e.state.tableau.flat()];
    expect(cards).toHaveLength(C.DECK_SIZE);
    expect(new Set(cards.map((c) => c.id)).size).toBe(C.DECK_SIZE);
    expect(new Set(cards.map((c) => `${c.suit}:${c.rank}`)).size).toBe(
      C.DECK_SIZE,
    );
    e.state.tableau.forEach((p, i) => {
      expect(p).toHaveLength(i + 1);
      expect(p.map((c) => c.faceUp)).toEqual(
        Array.from({ length: i + 1 }, (_, j) => i === j),
      );
    });
    expect(e.state.stock).toHaveLength(C.DEAL_STOCK_CARDS);
    expect(e.state.stock.every((c) => !c.faceUp)).toBe(true);
  });
  it("turns in top-first order, retains set history and recycles with stable identities", async () => {
    const { e, d, add } = await harness();
    for (let r = 1; r <= 5; r++) add("stock", 0, "hearts", r, false);
    const ids = e.state.stock.map((c) => c.id);
    e.apply(d.turnStock);
    expect(e.state.waste.map((c) => c.rank)).toEqual([5, 4, 3]);
    expect(e.state.wasteSets).toEqual([3]);
    e.apply(d.turnStock);
    expect(e.state.waste.map((c) => c.rank)).toEqual([5, 4, 3, 2, 1]);
    expect(e.state.wasteSets).toEqual([3, 2]);
    e.apply(d.turnStock);
    expect(e.state.stock.map((c) => c.id)).toEqual(ids);
    expect(e.state.stock.every((c) => !c.faceUp)).toBe(true);
    expect(e.state.wasteSets).toEqual([]);
    e.apply(d.turnStock);
    expect(e.state.waste.map((c) => c.rank)).toEqual([5, 4, 3]);
  });
  it("plays only the top visible waste card and falls back to the previous surviving set", async () => {
    const { e, d, add } = await harness();
    add("waste", 0, "spades", 1);
    add("waste", 0, "hearts", 1);
    add("waste", 0, "diamonds", 1);
    expect(d.move(e.state, "waste", 0, 2, "foundation", 0)[1]).toBe(false);
    e.apply((s) => d.addWasteSet(s, 2));
    e.apply((s) => d.addWasteSet(s, 1));
    expect(d.move(e.state, "waste", 0, 0, "foundation", 0)[1]).toBe(false);
    e.apply((s) => d.autoMove(s, "waste", 0)[0]);
    expect(e.state.wasteSets).toEqual([2]);
    expect(d.snapshot(e.state).wasteVisibleCount).toBe(2);
    e.apply((s) => d.autoMove(s, "waste", 0)[0]);
    expect(e.state.wasteSets).toEqual([1]);
    e.apply((s) => d.autoMove(s, "waste", 0)[0]);
    expect(e.state.wasteSets).toEqual([]);
  });
  it("does nothing on an entirely empty stock turn", async () => {
    const { e, d } = await harness();
    expect(d.turnStock(e.state)).toEqual(e.state);
  });
});
describe("move rules", () => {
  it("accepts descending alternating runs, flips only the exposed card, and preserves the input", async () => {
    const { e, d, add } = await harness();
    add("tableau", 0, "spades", 8, false);
    add("tableau", 0, "clubs", 7, false);
    add("tableau", 0, "hearts", 6);
    add("tableau", 0, "clubs", 5);
    add("tableau", 1, "spades", 7);
    const old = e.state;
    const [next, ok] = d.move(old, "tableau", 0, 2, "tableau", 1);
    expect(ok).toBe(true);
    expect(next.tableau[1].map((c) => c.rank)).toEqual([7, 6, 5]);
    expect(next.tableau[0].map((c) => c.faceUp)).toEqual([false, true]);
    expect(old.tableau[0].map((c) => c.faceUp)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
  it("refuses malformed, face-down and same-color runs and non-Kings in empty columns", async () => {
    const { e, d, add } = await harness();
    add("tableau", 0, "hearts", 6);
    add("tableau", 0, "diamonds", 5);
    add("tableau", 1, "spades", 7);
    add("tableau", 2, "clubs", 8, false);
    for (const [fi, row, ti] of [
      [0, 0, 1],
      [0, 1, 3],
      [2, 0, 1],
    ])
      expect(d.move(e.state, "tableau", fi, row, "tableau", ti)).toEqual([
        e.state,
        false,
      ]);
    expect(d.move(e.state, "tableau", 0, 0, "stock", 0)[1]).toBe(false);
    expect(d.move(e.state, "tableau", 0, 0, "waste", 0)[1]).toBe(false);
  });
  it("allows a King-led run in an empty column and supports the auto-flip gate", async () => {
    const { e, d, add } = await harness();
    add("tableau", 0, "hearts", 2, false);
    add("tableau", 0, "clubs", 13);
    add("tableau", 0, "hearts", 12);
    e.apply((s) => d.setAutoFlip(s, false));
    e.apply((s) => d.move(s, "tableau", 0, 1, "tableau", 1)[0]);
    expect(e.state.tableau[0][0].faceUp).toBe(false);
    expect(e.state.tableau[1]).toHaveLength(2);
  });
  it("starts any suit on any foundation, builds by suit, rejects runs and allows a card back to a column", async () => {
    const { e, d, add } = await harness();
    add("tableau", 0, "hearts", 1);
    add("tableau", 1, "hearts", 2);
    add("tableau", 2, "diamonds", 2);
    e.apply((s) => d.move(s, "tableau", 0, 0, "foundation", 3)[0]);
    expect(e.state.foundations[3][0].suit).toBe("hearts");
    expect(d.move(e.state, "tableau", 2, 0, "foundation", 3)[1]).toBe(false);
    e.apply((s) => d.autoMove(s, "tableau", 1)[0]);
    expect(e.state.foundations[3]).toHaveLength(2);
    add("tableau", 4, "spades", 3);
    expect(d.move(e.state, "foundation", 3, 0, "tableau", 4)[1]).toBe(false);
    e.apply((s) => d.move(s, "foundation", 3, 1, "tableau", 4)[0]);
    expect(e.state.tableau[4].map((c) => c.rank)).toEqual([3, 2]);
    expect(d.autoMove(e.state, "foundation", 3)[1]).toBe(false);
    expect(d.autoMove(e.state, "tableau", 6)[1]).toBe(false);
  });
});
describe("pointer and menus", () => {
  it("immediately lifts, retains the grab offset and set memory, and restores a click without flipping", async () => {
    const { e, d, add } = await harness();
    e.apply((s) => d.setScreen(s, "playing"));
    add("waste", 0, "hearts", 1);
    e.apply((s) => d.addWasteSet(s, 1));
    e.apply((s) => d.pointerDown(s, C.WASTE_X + 14, C.TOP_ROW_Y + 19));
    expect(e.state.drag?.x).toBe(C.WASTE_X);
    expect(e.state.waste).toHaveLength(0);
    expect(e.state.wasteSets).toEqual([1]);
    e.apply((s) => d.pointerMove(s, C.WASTE_X + 17, C.TOP_ROW_Y + 21));
    expect(e.state.drag?.x).toBe(C.WASTE_X + 3);
    e.apply((s) => d.pointerUp(s, C.WASTE_X + 17, C.TOP_ROW_Y + 21));
    expect(e.state.drag).toBeNull();
    expect(e.state.waste).toHaveLength(1);
    expect(e.state.wasteSets).toEqual([1]);
  });
  it("drops using the leading card center, highlights a legal target and flips only after acceptance", async () => {
    const { e, d, add } = await harness();
    e.apply((s) => d.setScreen(s, "playing"));
    add("tableau", 0, "clubs", 9, false);
    add("tableau", 0, "hearts", 6);
    add("tableau", 1, "clubs", 7);
    e.apply((s) =>
      d.pointerDown(
        s,
        C.COLUMN_X[0] + 10,
        C.TABLEAU_Y + C.FACE_DOWN_OFFSET + 10,
      ),
    );
    expect(e.state.tableau[0][0].faceUp).toBe(false);
    e.apply((s) => d.pointerMove(s, C.COLUMN_X[1] + 10, C.TABLEAU_Y + 10));
    expect(d.snapshot(e.state).dropTarget).toEqual({
      pile: "tableau",
      index: 1,
    });
    e.apply((s) => d.pointerUp(s, C.COLUMN_X[1] + 10, C.TABLEAU_Y + 10));
    expect(e.state.tableau[1]).toHaveLength(2);
    expect(e.state.tableau[0][0].faceUp).toBe(true);
  });
  it("rejects a dragged run without flipping, and refuses to lift a face-down card or a rear waste card", async () => {
    const { e, d, add } = await harness();
    e.apply((s) => d.setScreen(s, "playing"));
    add("tableau", 0, "spades", 7, false);
    add("tableau", 0, "hearts", 6);
    e.apply((s) => d.pointerDown(s, C.COLUMN_X[0] + 10, C.TABLEAU_Y + 10));
    expect(e.state.drag).toBeNull();
    e.apply((s) => d.pointerDown(s, C.COLUMN_X[0] + 10, C.TABLEAU_Y + 34));
    e.apply((s) => d.pointerUp(s, 30, 30));
    expect(e.state.tableau[0]).toHaveLength(2);
    expect(e.state.tableau[0][0].faceUp).toBe(false);
    for (const suit of C.SUITS.slice(0, 3)) add("waste", 0, suit, 1);
    e.apply((s) => d.addWasteSet(s, 3));
    e.apply((s) => d.pointerDown(s, C.WASTE_X + 10, C.TOP_ROW_Y + 20));
    expect(e.state.drag).toBeNull();
  });
  it("returns a foundation card offered to another foundation, matching the direct move rule", async () => {
    const { e, d, add } = await harness();
    e.apply((s) => d.setScreen(s, "playing"));
    add("foundation", 0, "hearts", 1);
    e.apply((s) => d.pointerDown(s, C.FOUNDATION_X[0] + 10, C.TOP_ROW_Y + 10));
    e.apply((s) => d.pointerMove(s, C.FOUNDATION_X[1] + 10, C.TOP_ROW_Y + 10));
    expect(d.snapshot(e.state).dropTarget).toBeNull();
    e.apply((s) => d.pointerUp(s, C.FOUNDATION_X[1] + 10, C.TOP_ROW_Y + 10));
    expect(e.state.foundations[0]).toHaveLength(1);
    expect(e.state.foundations[1]).toHaveLength(0);
  });
  it("double-clicks the lowest playable card home without lifting; an overdue press lifts instead", async () => {
    const { e, d, add } = await harness();
    e.apply((s) => d.setScreen(s, "playing"));
    add("tableau", 0, "hearts", 1);
    const x = C.COLUMN_X[0] + 20,
      y = C.TABLEAU_Y + 20;
    e.apply((s) => d.pointerDown(s, x, y));
    e.apply((s) => d.pointerUp(s, x, y));
    e.apply((s) => d.pointerDown(s, x, y));
    expect(e.state.foundations[0]).toHaveLength(1);
    expect(e.state.drag).toBeNull();
    e.apply((s) => d.pointerUp(s, x, y));
    add("tableau", 0, "clubs", 1);
    await e.advance(20);
    e.apply((s) => d.pointerDown(s, x, y));
    expect(e.state.drag).not.toBeNull();
  });
  it("answers ordered down/up samples inside one frame, including touch, and ignores secondary contacts", async () => {
    const { e, key, pointer } = await harness();
    key("Enter");
    await e.advance(1);
    key("Enter", "keyup");
    const before = e.state.stock.length;
    pointer("down", C.STOCK_X + 20, C.TOP_ROW_Y + 20, "touch");
    pointer("up", C.STOCK_X + 20, C.TOP_ROW_Y + 20, "touch");
    await e.advance(1);
    expect(e.state.stock).toHaveLength(before - C.TURN_COUNT);
    pointer("down", C.STOCK_X + 20, C.TOP_ROW_Y + 20, "touch", false);
    pointer("up", C.STOCK_X + 20, C.TOP_ROW_Y + 20, "touch", false);
    await e.advance(1);
    expect(e.state.stock).toHaveLength(before - C.TURN_COUNT);
  });
  it("wraps selection, prioritizes movement edges, remembers title selection and toggles runtime mute", async () => {
    const { e, d, key } = await harness();
    key("ArrowUp");
    key("ArrowDown");
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    for (const code of ["ArrowUp", "ArrowDown", "Enter"]) key(code, "keyup");
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    expect(e.state.titleIndex).toBe(1);
    key("Enter", "keyup");
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    e.apply((s) => d.setMenuIndex(s, 0));
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    expect(e.state.menuIndex).toBe(0);
    const rect = d.menuItemRect(e.state, 2)!;
    e.apply((s) => d.pointerDown(s, rect.x + 10, rect.y + 10));
    e.apply((s) => d.pointerUp(s, rect.x + 10, rect.y + 10));
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    const menu = d.menuItemRect(e.state, 1)!;
    e.apply((s) => d.pointerDown(s, menu.x + 10, menu.y + 10));
    e.apply((s) => d.pointerUp(s, menu.x + 10, menu.y + 10));
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(0);
  });
  it("toggles SOUND through an immediate debug gesture before the first frame", async () => {
    const { e, d } = await harness();
    e.apply((s) => d.setScreen(s, "playing"));
    const r = d.menuItemRect(e.state, 2)!;
    e.apply((s) => d.pointerDown(s, r.x + 10, r.y + 10));
    e.apply((s) => d.pointerUp(s, r.x + 10, r.y + 10));
    expect(e.state.muted).toBe(true);
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    e.apply(d.reset);
    expect(e.state.muted).toBe(true);
  });
  it("does not activate a control when press and release land in different regions", async () => {
    const { e, d } = await harness();
    const r0 = d.menuItemRect(e.state, 0)!,
      r1 = d.menuItemRect(e.state, 1)!;
    e.apply((s) => d.pointerDown(s, r0.x + 5, r0.y + 5));
    e.apply((s) => d.pointerUp(s, r1.x + 5, r1.y + 5));
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
  });
});
describe("cascade, gates and debugging", () => {
  it("wins on the final accepted move and launches Kings cyclically without motion on launch frames", async () => {
    const { e, d, add } = await harness(180);
    e.apply((s) => d.setScreen(s, "playing"));
    C.SUITS.forEach((suit, i) => {
      for (let r = 1; r <= C.RANK_MAX - (i === 3 ? 1 : 0); r++)
        add("foundation", i, suit, r);
    });
    add("tableau", 0, "clubs", 13);
    e.apply((s) => d.autoMove(s, "tableau", 0)[0]);
    expect(e.state.screen).toBe("won");
    expect(e.state.launchClock).toBe(C.LAUNCH_INTERVAL);
    await e.advance(1);
    expect(e.state.launched).toBe(2);
    expect(e.state.flyers.map((f) => [f.suit, f.rank, f.y])).toEqual([
      ["spades", 13, C.TOP_ROW_Y],
      ["hearts", 13, C.TOP_ROW_Y],
    ]);
    await e.advance(1);
    expect(e.state.flyers[2].suit).toBe("diamonds");
    expect(e.state.flyers[0].y).toBeGreaterThan(C.TOP_ROW_Y);
    expect(e.state.trailStamps).toBe(2);
    await e.advance(200);
    expect(e.state.launched).toBe(C.DECK_SIZE);
    expect(e.state.flyers).toHaveLength(0);
    expect(e.state.cascadeDone).toBe(true);
    e.apply((s) => d.pointerDown(s, 100, 100));
    expect(e.state.screen).toBe("playing");
    expect(e.state.trailStamps).toBe(0);
    expect(e.state.stock).toHaveLength(C.DEAL_STOCK_CARDS);
  });
  it("honors win detection without suppressing moves", async () => {
    const { e, d, add } = await harness();
    e.apply((s) => d.setScreen(s, "playing"));
    e.apply((s) => d.setWinDetect(s, false));
    C.SUITS.forEach((suit, i) => {
      for (let r = 1; r <= C.RANK_MAX; r++) add("foundation", i, suit, r);
    });
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    e.apply((s) => d.setWinDetect(s, true));
    await e.advance(1);
    expect(e.state.screen).toBe("won");
  });
  it("integrates a flyer in the specified order, bounces without losing horizontal speed and paints before retirement", async () => {
    const { e, d } = await harness(100);
    e.apply((s) => d.addFlyer(s, "hearts", 5, 1270, C.FLOOR_Y - 1, 200, 100));
    await e.advance(1);
    expect(e.state.flyers).toHaveLength(0);
    expect(e.state.trailStamps).toBe(1);
    expect(e.state.cascadeDone).toBe(false);
    e.apply((s) => d.addFlyer(s, "spades", 2, 500, C.FLOOR_Y - 1, 300, 100));
    await e.advance(1);
    expect(e.state.flyers[0]).toMatchObject({
      x: 530,
      y: C.FLOOR_Y,
      vx: 300,
      vy: -(100 + C.GRAVITY * 0.1) * C.BOUNCE_DAMP,
    });
  });
  it("separately gates launches and painting while existing flyers keep moving", async () => {
    const { e, d, add } = await harness(100);
    add("foundation", 0, "spades", 13);
    e.apply((s) => d.setScreen(s, "won"));
    e.apply((s) => d.setLaunching(s, false));
    e.apply((s) => d.setLaunchClock(s, 1));
    e.apply((s) => d.addFlyer(s, "hearts", 2, 500, 100, 200, 0));
    e.apply((s) => d.setTrailPainting(s, false));
    await e.advance(1);
    expect(e.state.launchClock).toBe(1);
    expect(e.state.foundations[0]).toHaveLength(1);
    expect(e.state.flyers[0].x).toBe(520);
    expect(e.state.trailStamps).toBe(0);
    e.apply((s) => d.setTrailPainting(s, true));
    await e.advance(1);
    expect(e.state.trailStamps).toBe(1);
    e.apply(d.clearTrail);
    expect(e.state.trailStamps).toBe(0);
    expect(e.state.flyers).toHaveLength(1);
  });
  it("advances time and horizontal distance equally with large, small and irregular deltas without rendering", async () => {
    const { e, d } = await harness();
    let start = d.addFlyer(initialState(), "spades", 1, 400, 100, 10, -100);
    const api: UpdateApi = {
      input: {
        value: () => 0,
        pressed: () => false,
        pointer: () => ({
          x: 0,
          y: 0,
          down: false,
          device: "mouse",
          buttons: [],
        }),
        pointerPressed: () => false,
        pointerReleased: () => false,
        pointerSamples: () => [],
        pointerContacts: () => [],
        wheel: () => ({ x: 0, y: 0 }),
      },
      audio: {
        play: () => {},
        loop: () => {},
        stop: () => {},
        looping: () => false,
        setMuted: () => {},
        muted: () => false,
      },
      frame: () => ({ count: 0, timeMs: 0, lastDeltaMs: 0 }),
      viewport: () => ({
        width: C.STAGE_W,
        height: C.STAGE_H,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      }),
    };
    start = { ...start, trailPainting: false };
    const one = game.update(start, api, 1);
    let sixty = start;
    for (let i = 0; i < 60; i++) sixty = game.update(sixty, api, 1 / 60);
    let irregular = start;
    for (const dt of [0.03, 0.17, 0.2, 0.4, 0.2])
      irregular = game.update(irregular, api, dt);
    for (const state of [one, sixty, irregular]) {
      expect(state.simTime).toBeCloseTo(1, 10);
      expect(state.flyers[0].x).toBeCloseTo(410, 10);
    }
    expect(e.state.simTime).toBe(0);
  });
  it("reconciles without advancing and fails loudly on invalid addresses or absent identities", async () => {
    const { e, d, add } = await harness();
    add("waste", 0, "hearts", 1);
    e.apply((s) => d.addWasteSet(s, 1));
    e.apply((s) => d.addFlyer(s, "clubs", 1, -200, 12, 100, 100));
    const before = d.snapshot(e.state);
    e.apply(d.reconcile);
    e.apply(d.reconcile);
    expect(d.snapshot(e.state)).toEqual(before);
    expect(e.state.flyers[0].x).toBe(-200);
    expect(() => d.clearPile(e.state, "tableau", 7)).toThrow();
    expect(() => d.addWasteSet(e.state, 1.5)).toThrow();
    expect(() => d.removeCard(e.state, 999)).toThrow();
    expect(() => d.removeFlyer(e.state, 999)).toThrow();
    expect(() => d.move(e.state, "waste", 0, 99, "tableau", 1)).toThrow();
    expect(() => d.addCard(e.state, "stock", 0, "spades", 14, false)).toThrow();
  });
  it("removes waste cards from the newest nonempty set even after zero-count poses", async () => {
    const { e, d, add } = await harness();
    add("waste", 0, "hearts", 1);
    e.apply((s) => d.addWasteSet(s, 1));
    e.apply((s) => d.addWasteSet(s, 0));
    const id = e.state.waste[0].id;
    e.apply((s) => d.removeCard(s, id));
    expect(e.state.wasteSets).toEqual([0]);
    expect(d.snapshot(e.state).wasteVisibleCount).toBe(0);
  });
  it("poses and removes entities individually, clears exactly the requested resources, and resets every declared field", async () => {
    const { e, d, add } = await harness();
    add("waste", 0, "diamonds", 3);
    e.apply((s) => d.addWasteSet(s, 1));
    const id = e.state.waste[0].id;
    e.apply((s) => d.setCardFaceUp(s, id, false));
    expect(e.state.waste[0].faceUp).toBe(false);
    e.apply((s) => d.removeCard(s, id));
    expect(e.state.wasteSets).toEqual([]);
    e.apply((s) => d.addFlyer(s, "clubs", 4, 20, 30, 40, 50));
    const fid = e.state.flyers[0].id;
    e.apply((s) => d.setFlyerPosition(s, fid, 60, 70));
    e.apply((s) => d.setFlyerVelocity(s, fid, 80, 90));
    expect(e.state.flyers[0]).toMatchObject({ x: 60, y: 70, vx: 80, vy: 90 });
    add("stock", 0, "spades", 4, false);
    e.apply(d.clearTable);
    expect(e.state.flyers).toHaveLength(1);
    e.apply((s) => d.removeFlyer(s, fid));
    e.apply(d.clearFlyers);
    e.apply(d.clearWasteSets);
    e.apply((s) => d.setTitleIndex(s, 1));
    e.apply((s) => d.setScreen(s, "won"));
    expect(d.menuItemRect(e.state, 0)).toBeNull();
    expect(d.menuItemRect(e.state, -1)).toBeNull();
    e.apply(d.reset);
    expect(e.state).toEqual(initialState());
  });
  it("draws independent, balanced launch speeds in the specified range", async () => {
    const { e, d } = await harness();
    const samples = Array.from({ length: 4000 }, () => d.drawLaunchVx(e.state));
    expect(
      samples.every(
        (v) => Math.abs(v) >= C.LAUNCH_VX_MIN && Math.abs(v) <= C.LAUNCH_VX_MAX,
      ),
    ).toBe(true);
    expect(
      samples.filter((v) => v > 0).length / samples.length,
    ).toBeGreaterThan(0.45);
    expect(samples.filter((v) => v > 0).length / samples.length).toBeLessThan(
      0.55,
    );
    expect(
      samples.reduce((a, b) => a + Math.abs(b), 0) / samples.length,
    ).toBeCloseTo(300, -1);
  });
  it("compresses face-up gaps uniformly, preserves face-down gaps and restores natural spacing", () => {
    const cards = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      suit: "spades" as const,
      rank: 1,
      faceUp: i >= 3,
    }));
    const ys = rows(cards);
    expect(ys[1] - ys[0]).toBe(C.FACE_DOWN_OFFSET);
    expect(ys[14] + C.CARD_H).toBeCloseTo(C.COLUMN_BOTTOM_LIMIT);
    expect(ys[5] - ys[4]).toBeCloseTo(ys[14] - ys[13]);
    expect(rows(cards.slice(0, 5))[4] - rows(cards.slice(0, 5))[3]).toBe(
      C.FACE_UP_OFFSET,
    );
    const long = rows([...cards, ...cards, ...cards]);
    expect(long[44] - long[43]).toBe(C.FACE_UP_OFFSET_MIN);
    expect(pileRect(initialState(), "tableau", 0).h).toBe(C.CARD_H);
  });
  it("emits each cue at most once per update while multiple stock turns still happen", async () => {
    const { e, key, pointer } = await harness();
    const cues: string[] = [];
    e.events.on("cue:played", (v) => cues.push(v.cue));
    key("Enter");
    await e.advance(1);
    expect(cues).toEqual([C.CUES.deal]);
    cues.length = 0;
    for (let i = 0; i < 2; i++) {
      pointer("down", C.STOCK_X + 20, C.TOP_ROW_Y + 20);
      pointer("up", C.STOCK_X + 20, C.TOP_ROW_Y + 20);
    }
    await e.advance(1);
    expect(e.state.waste).toHaveLength(6);
    expect(cues).toEqual([C.CUES.turn]);
  });
});
