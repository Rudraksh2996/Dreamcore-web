# Dreamcore — Wander Freely

An atmospheric first-person browser world connecting the Tidal Passage, Sky Garden and Stillwater Hall. Walk through either doorway in either direction, reopen it from either side, and return along the same route. Door state remains shared across both rooms.

## Run locally

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite. `npm run build` creates `dist/` for the existing static/Vercel deployment. `npm run preview` serves that production build.

## Controls

- WASD or arrow keys: move. Shift: run.
- Mouse: look; drag on the scene if browser mouse capture is unavailable.
- E: open or close the door you are looking at. Step away from the threshold before closing it.
- Escape: pause. Use Return to the dream to continue.
- Touch: left half moves, right half looks; tap the door prompt to interact.
- The pause screen offers sound controls and Ultra HD / Balanced graphics. Both presets adapt resolution to measured performance and viewport pixel budgets. A Pause button also opens these settings on touchscreens.

Walking, running and wading speeds are increased by 30% to 4.16, 6.76 and 2.21 units/second respectively. Collision substeps keep movement consistent across frame rates.

## World and graphics

All three scenes share a continuous coordinate system, real doorway openings and one collision controller. Crossing changes the active room without teleporting the camera. Open neighboring rooms stay visible through their doorways; closed distant rooms can unmount.

Ultra HD uses up to 2x device pixel ratio, multisampling and ambient occlusion. Rendering is capped by viewport pixel budget (4 million pixels on desktop Ultra HD, 2 million on Balanced; lower budgets for touch devices), with additional reductions when frame rate drops. Portrait and ultrawide views adjust camera framing; menus support small phones, short landscape screens and display safe areas. Both presets include physically based ceramic tiles with relief maps, local environment lighting, filmic tone mapping, bloom, animated water with Fresnel reflections and a detailed cloud panorama. Instanced grass has separate attributes per chunk and animated wind.

The corridor window sky and garden mural share `public/sky-garden-clouds.png` from one cached texture. Environment assets are bundled locally; see `public/ASSET-NOTES.md` for provenance and the image-generation prompt. The existing background audio is retained.

## Validation

```sh
npm test
npm run build
```

The tests exercise repeated travel in both directions, closed doors, side walls, room limits, world transforms, threshold hysteresis and a continuous round trip.

Development-only inspection URLs (not enabled in production):

- `/?scene=meadow`: garden entrance, looking inward.
- `/?scene=meadow&cam=back`: garden entrance, looking back toward the corridor.
- `/?scene=meadow&cam=exit`: garden exit, looking toward the poolroom.
- `/?scene=poolroom&cam=back`: poolroom entrance, looking back toward the garden.
- `/?scene=corridor&cam=exit`: corridor end near the garden.
- Add `&controls=touch` to inspect touch controls on a desktop browser.

Browser QA: verified corridor/garden and garden/poolroom travel in both directions; E-key and touch-prompt opening; desktop mouse-capture fallback; 390 x 844 mobile layout. Physical-device touch/GPU performance still depends on the device and should be checked on target hardware.
