# منصتك · Manasetak — 15s motion-graphics promo

A 15-second, 1080p60 Arabic (RTL) promo for [Manasetak](https://manasetak.com/en). It has an original synthesized soundtrack with sound design locked to the picture.

**Final video:** [`output/manasetak-promo.mp4`](output/manasetak-promo.mp4)

## Storyboard

| Time | Scene | On screen |
|---|---|---|
| 0.0 – 2.5s | **Hook** | «منصة تعليمية كاملة بضغطة زر واحدة». A cursor clicks «أنشئ منصتك» and the button bursts open into the next scene. |
| 2.5 – 5.0s | **Your platform, live** | A browser flies in and types `abdullah.manasetak.com` (the custom subdomain). The teacher dashboard builds itself: stats count up, courses drop in, notifications pop. «منصتك جاهزة في دقائق». |
| 5.0 – 11.0s | **Six features, one per beat** | 01 upload lectures · 02 exams and pass conditions · 03 content protection · 04 accurate analytics · 05 automatic scheduling · 06 supervisors and permissions. Each one has its own animated UI. |
| 11.0 – 13.0s | **Every grade** | A glowing path runs through prep 1 → secondary 3, and each node plays a rising note. |
| 13.0 – 15.0s | **End card** | Logo, «منصة واحدة لكل احتياجاتك التعليمية», and the CTA «أنشئ منصتك الآن» with manasetak.com. The cursor comes back and clicks the CTA. |

Scene cuts land on a 120 BPM grid (one beat = 0.5s), so the music and picture hit together.

## How it's built

- `src/index.html`, `src/styles.css`, `src/timeline.js`: the whole film. It is a DOM/SVG/canvas scene graph where **every frame is a pure function of `t`** (`render(t)`), so rendering is frame-exact and deterministic.
- `src/brand.js`: **the single place for brand colors.** Change the hex values there and rebuild.
- `scripts/render.mjs`: drives headless Chromium frame by frame and pipes the frames into ffmpeg (H.264, CRF 15, yuv420p, AAC 256k).
- `audio/soundtrack.py`: a fully synthesized score (pads, arpeggios, bass, drums) plus sound design: whooshes, typing clicks, UI pops, chimes and impacts. The hit points come from `output/cues.json`, which the page exports from the same constants that drive the animation.

## Build

```bash
npm install
pip install numpy scipy imageio-ffmpeg   # imageio-ffmpeg provides an ffmpeg binary with libx264
npm run build                            # cues -> soundtrack.wav -> manasetak-promo.mp4
```

Other commands:

- `npm run preview`: opens a live, looping preview in the browser. Space pauses and the arrow keys scrub.
- `npm run stills`: renders key frames to `output/stills/`.
- `node scripts/render.mjs --fps 30`: renders a faster draft.
- Open `src/index.html?t=7.5` to freeze on any moment.

## Before publishing

- **Brand colors:** manasetak.com wasn't reachable from the build environment, so the palette in `src/brand.js` is a placeholder (a deep-navy, electric-blue and amber edtech palette). Paste in the site's exact hex codes, then run `npm run build`.
- **Logo:** the end-card mark (`#logo-glyph` in `src/index.html`) and the «منصتك» wordmark are stand-ins. Replace the SVG symbol with the official logo.
- **Demo data:** the numbers in the dashboard, the names and the course titles are illustrative UI content, not real metrics.
