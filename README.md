# منصتك · Manasetak — 23s motion-graphics promo

A 23-second, 1080p60 Arabic (RTL) promo for [Manasetak](https://manasetak.com/en). Its audio is synthesized sound design locked to the picture, built to carry the film without music. An optional original score can be switched back on.

**Final video:** [`output/manasetak-promo.mp4`](output/manasetak-promo.mp4)

## Storyboard

| Time | Scene | On screen |
|---|---|---|
| 0 – 3.5s | **Hook** | «منصة تعليمية كاملة بضغطة زر واحدة». A cursor clicks «أنشئ منصتك» and the button bursts open into the next scene. |
| 3.5 – 7.5s | **Your platform, live** | A browser flies in and types `abdullah.manasetak.com` (the custom subdomain). The teacher dashboard builds itself: stats count up, courses drop in, notifications pop. «منصتك جاهزة في دقائق». |
| 7.5 – 18s | **Six features, 1.75s each** | 01 upload lectures · 02 exams and pass conditions · 03 content protection · 04 accurate analytics · 05 automatic scheduling · 06 supervisors and permissions. Each one has its own animated UI. |
| 18 – 20.4s | **Every grade** | A glowing path runs through prep 1 → secondary 3, and each node plays a rising note. |
| 20.4 – 23.15s | **End card** | The official lockup assembles stroke by stroke, then «منصة واحدة لكل احتياجاتك التعليمية», and the CTA «أنشئ منصتك الآن» with manasetak.com. The cursor comes back and clicks the CTA. |

### Pacing

The choreography is written in "story time" (0–15s). The `PACE` table at the top of `src/timeline.js` maps story time to real time. It stretches the reading holds (headlines, the dashboard, each feature) and keeps the transitions close to 1x so they stay snappy. To make the whole video slower or faster, change the numbers in that table and run `npm run build`: the video length and the sound-effect timing both follow.

The optional score's tempo is also derived from the pacing: the beat drops on the button click, and exactly 8 bars fit between the click and the logo hit.

## How it's built

- `src/index.html`, `src/styles.css`, `src/timeline.js`: the whole film. It is a DOM/SVG/canvas scene graph where **every frame is a pure function of `t`** (`render(t)`), so rendering is frame-exact and deterministic.
- `src/brand.js`: the palette from the Manasetak Brand Guideline v1.0: Blue `#00A6F4`, Navy `#052F4A`, Purple `#AD46FF`, Orange `#FF6900`, their tints, and the `#F0F9FF` background. The guideline's Secondary Color page has its two hex labels swapped; the values here were read from the swatches themselves.
- `src/brand/logo.js` and `src/brand/logo-ar.svg`: the official Arabic lockup, extracted verbatim from the guideline's vector artwork, in its approved color variants (light, navy and blue backgrounds).
- `scripts/render.mjs`: drives headless Chromium frame by frame and pipes the frames into ffmpeg (H.264, CRF 15, yuv420p). The audio is loudness-normalized to -16 LUFS (true peak -1.5 dB) and encoded as AAC 256k.
- `audio/soundtrack.py`: synthesized sound design. Every hit point comes from `output/cues.json`, which the page exports from the same constants that drive the animation (about 60 event types). The mix is designed to stand on its own without music:
  - **Atmosphere beds:** each scene has a quiet bed (dark air under the hook, bright air on the dashboard, a subtle tech texture under the features), so there is never dead air.
  - **Layered transitions:** whooshes combine a smoothly swept noise band (filtered in the STFT domain, so there are no zipper artifacts) with a low body layer. They pan with the on-screen motion (right to left, matching the reading direction), and big elements land with a soft low thump.
  - **Musical interface sounds:** every pitched sound sits in C major pentatonic, so pops, blips and bells form an implied melody. The six feature bells climb a scale, and the school-year path plays a rising line.
  - **Foley-style detail:** keyboard typing, counter ticks, an upload fill tone, a security scan and lock clunk, and tactile toggle clicks.
  - **Sonic logo:** three stroke "shings" as the monogram assembles, a shimmer as the wordmark wipes in, and a resolving bell chord.
  - **Mix:** a shared room and hall reverb, gentle bus compression, and loudness normalization to -16 LUFS in the renderer.

  `python3 audio/soundtrack.py --music` adds the optional original score (pads, arpeggios, bass and drums).

## Build

```bash
npm install
pip install numpy scipy imageio-ffmpeg   # imageio-ffmpeg provides an ffmpeg binary with libx264
npm run build                            # cues -> soundtrack.wav -> manasetak-promo.mp4
```

Other commands:

- `npm run preview`: opens a live, looping preview in the browser. Space pauses and the arrow keys scrub.
- `npm run stills`: renders key frames to `output/stills/`.
- `npm run remux`: rebuilds only the audio and swaps it into the existing video in seconds, without re-rendering frames.
- `node scripts/render.mjs --fps 30`: renders a faster draft.
- Open `src/index.html?t=7.5` to freeze on any moment.

## Brand compliance

- **Typeface:** Zain only, in the guideline's weights (Light, Regular, Bold, Extra bold).
- **Logo:** official artwork only, in the approved variant for each background. It is never rotated, stretched or recolored, and it never gets a shadow, glow or outline (guideline p.9). The end card keeps the clear space (one monogram height) free of text.
- **Icons:** dual-color line icons in Blue and Navy on white tiles (guideline p.16).
- **Brand-stroke wipe:** the transition into the grades scene uses the monogram as a supergraphic, echoing the guideline cover.

## Before publishing

- **Demo data:** the numbers in the dashboard, the names and the course titles are illustrative UI content, not real metrics.
- **UI icons:** the icons are drawn in the guideline's dual-color line style, but they aren't the brand's own icon files. If you have the official icon set as SVG, it can be dropped into the `<symbol>` sprite in `src/index.html`.
