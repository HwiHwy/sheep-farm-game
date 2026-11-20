# Máy Gắp Thú Bông 3D — V12

A Three.js + Vite arcade claw-machine game, adapted from the Sheep Farm participant game.

## How to play

1. Enter participant names (up to 24); each name becomes a colorful plush toy inside the transparent machine.
2. Press **TẠO THÚ BÔNG** to fill/reset the cabinet.
3. Press **GẮP THÚ** to start one automatic crane cycle. The crane moves above a random remaining plush, lowers, closes its claw, lifts the plush, carries it to the prize outlet, and releases it into the collection tray.
4. A popup announces the participant name after the toy reaches the tray.
5. Repeat until the cabinet is empty, or press **BẮT ĐẦU LẠI** to reset the same participant list.

## Assets

- Optional plush model: `public/models/sheep22.glb` (copied from your previous project). If absent, the game uses a built-in toy sheep model.
- Optional sounds: copy `farm-background.mp3`, `button-click.mp3`, and `popup-chime.mp3` into `public/audio/`.
- The wolf model is no longer used in this version.

## Run locally (Windows)

```powershell
npm.cmd install
npm.cmd run dev
```

## Build

```powershell
npm.cmd run build
```

## GitHub Pages

`vite.config.js` is configured for the repository path `/sheep-farm-game/`. The included GitHub Actions workflow builds `dist/` and deploys it to GitHub Pages after every push to `main`. Keep your repository's Pages source set to **GitHub Actions**.
