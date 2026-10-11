# Cascade

An unhurried game of Draw Three Klondike, played on deep green felt. Build the four foundations from Ace to King and watch all fifty-two cards spring into a bouncing, table-painting cascade.

## Run

```sh
npm ci
npm run dev
```

Open the address Vite prints. Everything runs in your browser, with no account, backend, or runtime downloads.

## Build

```sh
npm run build
```

Serve `dist/` from any static host, including a sub-path. `npm run preview` serves the production build locally.

## Controls

- Click or tap the stock to turn three cards. Only the frontmost waste card is playable. An empty stock recycles the waste; passes are unlimited.
- Drag a face-up card or a descending, alternating-color run onto another column. Only a King can fill an empty column.
- Drag single cards onto foundations, building each suit from Ace to King. Double-click or double-tap an exposed card to send it home.
- Use **NEW GAME**, **MENU**, and **SOUND** along the bottom. Menus also accept Up/Down or W/S and Enter/Space; Escape returns from the instructions.
- Press backtick to toggle the read-only diagnostics overlay.
- After winning, click or tap anywhere to deal again.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation and debug surface are implemented in `src/game.ts`, geometry in `src/layout.ts`, and canvas graphics in `src/view.ts`. Rule tests sit beside those sources. The `showcase/` directory contains a player description and captured gameplay.
