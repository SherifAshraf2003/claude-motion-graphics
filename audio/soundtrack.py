"""Sound design (and an optional original score) for the Manasetak promo.

Everything is synthesized from scratch (no samples, no licensing concerns).
Hit points are read from output/cues.json, which the page exports from the
same constants that drive the animation, so audio and picture stay locked.

The default mix is sound design only, built to carry the film on its own:
  - a quiet atmosphere bed per scene, so there is never dead air
  - layered whooshes (air + body) that pan with the on-screen motion
  - pitched UI sounds that all sit in C major pentatonic, so the sequence of
    pops, blips and bells forms an implied melody without being music
  - a sonic logo on the end card (three stroke "shings" + a resolving bell)

    python3 audio/soundtrack.py            ->  output/soundtrack.wav (SFX only)
    python3 audio/soundtrack.py --music    ->  SFX + the optional score
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, stft, istft, lfilter

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
cues = json.loads((ROOT / "output/cues.json").read_text())
C = cues
DUR = cues["duration"]
N = int(SR * DUR)

# Musical structure follows the picture: the beat drops on the button click,
# and the tempo is chosen so exactly 8 bars fit between the click and the
# end-card logo hit (the 8th bar is the break before the logo).
DROP, LOGO = cues["drop"], cues["logo"]
BARS = 8
BAR = (LOGO - DROP) / BARS
BEAT = BAR / 4
BPM = 60 / BEAT
BREAK = LOGO - BAR
MONT0, MONT1 = cues["montage"]
BAND = cues["band"]
MUSIC = "--music" in sys.argv
rng = np.random.default_rng(3)

L = np.zeros(N)
R = np.zeros(N)
room_send = np.zeros(N)  # short room: UI sounds
hall_send = np.zeros(N)  # long hall: impacts, bells, big transitions
duck = np.ones(N)  # sidechain envelope driven by the kick (score only)
SECTION_GAIN = 1.0  # per-section trim applied inside add()/add_st()


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100), "low", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR / 2 - 100)], "band", fs=SR, output="sos"), x)


def add(sig, t0, gain=1.0, pan=0.0, verb=0.0, room=0.0):
    """Mix a mono signal in at t0 seconds. pan is -1..1, or (start, end) to sweep."""
    i = int(round(t0 * SR))
    if i >= N or len(sig) == 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i] * gain * SECTION_GAIN
    n = len(sig)
    p = np.linspace(pan[0], pan[1], n) if isinstance(pan, tuple) else pan
    th = (np.asarray(p) + 1) * np.pi / 4
    L[i : i + n] += sig * np.cos(th) * 1.414
    R[i : i + n] += sig * np.sin(th) * 1.414
    hall_send[i : i + n] += sig * verb
    room_send[i : i + n] += sig * room


def add_st(sl, sr, t0, gain=1.0, verb=0.0, room=0.0):
    """Mix a stereo pair in at t0 seconds."""
    i = int(round(t0 * SR))
    if i >= N:
        return
    n = min(len(sl), N - i)
    gain = gain * SECTION_GAIN
    L[i : i + n] += sl[:n] * gain
    R[i : i + n] += sr[:n] * gain
    hall_send[i : i + n] += (sl[:n] + sr[:n]) * 0.5 * gain * verb
    room_send[i : i + n] += (sl[:n] + sr[:n]) * 0.5 * gain * room


def tt(d):
    return np.arange(int(d * SR)) / SR


def env_ad(n, a, d_curve):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    return e * np.exp(-t * d_curve)


def saw(f, t, detune=0.0):
    ph = (f * (1 + detune)) * t + rng.random()
    return 2 * (ph % 1) - 1


# ---------------- music ----------------
# The score is optional: the default mix is sound effects only.
# Pass --music to include pads, arpeggios, bass and drums.
def build_music():
    # C major, uplifting: Fmaj7 intro | C G Am F C G F | Gsus4 break | C on the logo
    CHORDS = [
        [48, 55, 60, 64, 67],  # C
        [43, 55, 59, 62, 67],  # G
        [45, 57, 60, 64, 69],  # Am
        [41, 57, 60, 65, 69],  # F
        [48, 55, 60, 64, 67],  # C
        [43, 55, 59, 62, 67],  # G
        [41, 57, 60, 65, 69],  # F
        [43, 55, 60, 62, 67],  # Gsus4 (break: tension before the logo)
    ]
    PROG = [(0.0, DROP, [53, 57, 60, 64])]  # Fmaj7 intro, filtered
    PROG += [(DROP + i * BAR, DROP + (i + 1) * BAR, c) for i, c in enumerate(CHORDS)]
    PROG += [(LOGO, DUR, [36, 55, 60, 64, 67, 72])]  # C, resolve on the end card


    def pad(notes, t0, t1, cutoff, gain):
        d = t1 - t0 + 0.6
        t = tt(d)
        sig = np.zeros_like(t)
        for m in notes[1:]:
            f = mtof(m)
            for dt in (-0.004, 0.0, 0.005):
                sig += saw(f, t, dt)
        sig = lp(sig / (len(notes) * 3), cutoff, 2)
        n = len(t)
        a = int(0.25 * SR)
        e = np.ones(n)
        e[:a] = np.linspace(0, 1, a)
        rel = int(0.6 * SR)
        e[-rel:] *= np.linspace(1, 0, rel)
        return sig * e * gain


    for t0, t1, notes in PROG:
        cutoff = 700 if t0 < DROP else (1800 if t0 < BREAK - 1e-6 else 1300)
        if t0 >= LOGO - 1e-6:
            cutoff = 2400
        p = pad(notes, t0, t1, cutoff, 0.22)
        # slight stereo spread: different detune seeds per side
        add(p, t0, 0.9, -0.35, verb=0.35)
        add(pad(notes, t0, t1, cutoff, 0.22), t0, 0.9, 0.35, verb=0.35)

    # intro swell: pad fades in from nothing
    fade_in = int(0.6 * DROP * SR)
    L[:fade_in] *= np.linspace(0, 1, fade_in) ** 2
    R[:fade_in] *= np.linspace(0, 1, fade_in) ** 2


    def pluck(f, dur=0.35, bright=4000):
        t = tt(dur)
        s = (2 * ((f * t) % 1) - 1) * 0.6 + np.sin(2 * np.pi * f * t) * 0.8
        s = lp(s, bright, 2)
        return s * env_ad(len(t), 0.002, 11)


    # arpeggio: 8ths in the build, 16ths through the feature montage
    for t0, t1, notes in PROG:
        if t0 < DROP - 1e-6 or t0 >= BREAK - 1e-6:
            continue
        pitches = [m + 12 for m in notes[1:]]
        k = 0
        t = t0
        while t < t1 - 1e-6:
            m = pitches[[0, 1, 2, 3, 2, 1][k % 6] % len(pitches)]
            add(pluck(mtof(m), bright=3500 + 1500 * (k % 3)), t, 0.16, 0.5 if k % 2 else -0.5, verb=0.25)
            t += BEAT / 4 if MONT0 - 1e-6 <= t < MONT1 else BEAT / 2
            k += 1

    # end-card sparkle arpeggio (C major, rising)
    for i, m in enumerate([72, 76, 79, 84, 88]):
        add(pluck(mtof(m), 0.6, 6000), LOGO + 0.07 + i * 0.09, 0.15, (-0.6 + i * 0.3), verb=0.6)


    # bass: pumping 8ths on the root
    def bass_note(f, dur):
        t = tt(dur)
        s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
        e = np.minimum(1, t / 0.005) * np.exp(-t * 3)
        return lp(s * e, 900)


    for t0, t1, notes in PROG:
        if t0 < DROP - 1e-6 or BREAK - 1e-6 <= t0 < LOGO - 1e-6:
            continue
        f = mtof(notes[0] - 12 if notes[0] > 40 else notes[0])
        t = t0
        while t < t1 - 1e-6:
            add(bass_note(f, BEAT / 2), t, 0.34)
            t += BEAT / 2
    add(bass_note(mtof(36 - 12) * 2, 2.0), LOGO, 0.5)


    # ---------------- drums ----------------
    def kick():
        t = tt(0.45)
        f = 45 + 110 * np.exp(-t * 30)
        ph = 2 * np.pi * np.cumsum(f) / SR
        s = np.sin(ph) * np.exp(-t * 7)
        click = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 300) * 0.25
        return np.tanh((s + click) * 1.6)


    def clap():
        t = tt(0.3)
        n = bp(rng.standard_normal(len(t)), 900, 5000)
        e = np.zeros_like(t)
        for o in (0, 0.011, 0.022):
            e += (t >= o) * np.exp(-np.maximum(t - o, 0) * 60)
        e += np.exp(-t * 18) * 0.35
        return n * e * 0.6


    def hat(open_=False):
        t = tt(0.25 if open_ else 0.06)
        n = hp(rng.standard_normal(len(t)), 7500)
        return n * np.exp(-t * (18 if open_ else 90)) * 0.5


    def duck_at(t0, depth=0.55, rel=0.22):
        i = int(t0 * SR)
        t = tt(rel)
        d = 1 - depth * (1 - t / rel) ** 2
        j = min(N, i + len(t))
        duck[i:j] = np.minimum(duck[i:j], d[: j - i])


    beat = DROP
    b = 0
    while beat < BREAK - 1e-6:
        add(kick(), beat, 0.95)
        duck_at(beat)
        montage = MONT0 - 1e-6 <= beat < MONT1
        if beat >= MONT0 - 1e-6 and b % 2 == 1:
            add(clap(), beat, 0.45, 0.1, verb=0.3)
        add(hat(open_=beat >= MONT0 - 1e-6), beat + BEAT / 2, 0.22, 0.3)
        if montage:
            for q in (0.25, 0.75):
                add(hat(), beat + BEAT * q, 0.12, -0.3)
        beat += BEAT
        b += 1
    # fill into the grade-journey scene
    for i in range(4):
        add(clap(), BAND + i * 0.0625, 0.18 + 0.06 * i, 0.0, verb=0.2)


if MUSIC:
    build_music()


# ---------------- sound library ----------------
# Pitched sounds use C major pentatonic so everything agrees harmonically.
PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100]


def noise(n):
    return rng.standard_normal(n)


def pink(n):
    # Paul Kellet's pink-noise filter
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    y = lfilter(b, a, noise(n + 4000))[4000:]
    return y / (np.std(y) + 1e-12)


def unit(x):
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-12)


def fade(x, a=0.003, r=0.006):
    x = x.copy()
    na, nr = min(len(x), int(a * SR)), min(len(x), int(r * SR))
    if na:
        x[:na] *= np.linspace(0, 1, na)
    if nr:
        x[-nr:] *= np.linspace(1, 0, nr)
    return x


def swell(n, peak=0.6, a_pow=2.0, r_pow=1.6):
    x = np.linspace(0, 1, n)
    return np.where(x < peak, (x / peak) ** a_pow, np.clip(1 - (x - peak) / (1 - peak), 0, 1) ** r_pow)


def swept_noise(dur, f0, f1, bw=0.6, bw1=None, curve=None):
    """Noise through a smoothly moving band (log-frequency Gaussian, applied in
    the STFT domain so the sweep has no zipper artefacts). Unit RMS per frame."""
    n = int(dur * SR)
    f, tf, Z = stft(noise(n + 2048), fs=SR, nperseg=1024, noverlap=896)
    pos = np.clip(tf / dur, 0, 1)
    c = curve(pos) if curve else pos
    lc = np.log2(f0) + (np.log2(f1) - np.log2(f0)) * c
    bwv = bw if bw1 is None else bw + (bw1 - bw) * pos
    lf = np.log2(np.maximum(f, 20))[:, None]
    G = np.exp(-0.5 * ((lf - lc[None, :]) / bwv) ** 2)
    G /= np.sqrt(np.mean(G ** 2, axis=0, keepdims=True)) + 1e-12
    _, y = istft(Z * G, fs=SR, nperseg=1024, noverlap=896)
    return unit(y[:n])


def ease_io(x):
    return x * x * (3 - 2 * x)


def whoosh(dur=0.5, f0=400, f1=4500, peak=0.62, body=0.5, bw=0.55, tone=0.0):
    """Air whoosh: a moving noise band, a low 'body' layer, optional tonal swish."""
    n = int(dur * SR)
    e = swell(n, peak)
    out = swept_noise(dur, f0, f1, bw, curve=ease_io) * e * 0.5
    if body:
        out += unit(lp(noise(n), 260, 4)) * e ** 1.5 * body * 0.45
    if tone:
        t = np.arange(n) / SR
        fr = (f0 * 0.5) * ((f1 * 0.25) / (f0 * 0.5)) ** ease_io(np.linspace(0, 1, n))
        out += np.sin(2 * np.pi * np.cumsum(fr) / SR) * e ** 2 * tone * 0.3
    return fade(out, 0.004, 0.02)


def thump(f0=95, f1=48, dur=0.35, knock=0.15):
    """Soft low landing for big elements."""
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 25)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * np.minimum(1, t / 0.002)
    s += unit(lp(noise(len(t)), 900)) * np.exp(-t * 60) * knock
    return fade(s)


def ui_click(tone=2600, body=180, bright=1.0):
    """Short, tactile interface click (transient + damped tone + tiny body)."""
    t = tt(0.07)
    s = unit(hp(noise(len(t)), 1800)) * np.exp(-t * 700) * 0.45 * bright
    s += np.sin(2 * np.pi * tone * t) * np.exp(-t * 320) * 0.35
    s += np.sin(2 * np.pi * body * t) * np.exp(-t * 90) * 0.35
    return fade(s * np.minimum(1, t / 0.0004), 0.0004, 0.01)


def key():
    """A soft keyboard keystroke: 'down' thock then a quieter 'up' click."""
    t = tt(0.1)
    down = unit(bp(noise(len(t)), 900, 4500)) * np.exp(-t * 320) * 0.55
    down += np.sin(2 * np.pi * rng.uniform(230, 300) * t) * np.exp(-t * 75) * 0.45
    up = np.zeros_like(t)
    o = int(rng.uniform(0.03, 0.045) * SR)
    tu = t[: len(t) - o]
    up[o:] = unit(bp(noise(len(tu)), 2500, 7000)) * np.exp(-tu * 600) * 0.22
    return fade((down + up) * rng.uniform(0.75, 1.0), 0.0004, 0.01)


def toggle():
    """Switch flip: press then snap."""
    s = np.zeros(int(0.14 * SR))
    a = ui_click(1700, 140, 0.8)
    b = ui_click(3200, 230, 0.6) * 0.7
    s[: len(a)] += a
    o = int(0.055 * SR)
    s[o : o + len(b)] += b[: len(s) - o]
    return s


def pop(m, dur=0.18, bright=1.0):
    """Rounded 'bloop' with a quick upward glide, tuned to note m."""
    f = mtof(m)
    t = tt(dur)
    glide = f * (0.72 + 0.28 * (1 - np.exp(-t * 90)))
    ph = 2 * np.pi * np.cumsum(glide) / SR
    s = (np.sin(ph) + 0.22 * np.sin(2 * ph)) * np.minimum(1, t / 0.0015) * np.exp(-t * 26)
    s += unit(hp(noise(len(t)), 3000)) * np.exp(-t * 900) * 0.12 * bright
    return fade(lp(s, 7000))


def blip(m, dur=0.14):
    """Small glassy tick, tuned to note m."""
    f = mtof(m)
    t = tt(dur)
    s = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2.98 * f * t) * np.exp(-t * 60)
    return fade(s * np.minimum(1, t / 0.0005) * np.exp(-t * 38))


def bell(m, dur=1.6, bright=1.0):
    """Soft glass/mallet bell: inharmonic partials with a gentle beating."""
    f = mtof(m)
    t = tt(dur)
    parts = [(1.0, 1.0, 3.0), (2.0, 0.45, 4.5), (2.76, 0.28, 6.0), (4.07, 0.13 * bright, 8.0), (5.43, 0.06 * bright, 10.0)]
    s = sum(g * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, g, d in parts)
    s += 0.3 * np.sin(2 * np.pi * f * 1.0025 * t) * np.exp(-t * 3.0)
    return fade(s * np.minimum(1, t / 0.002) * 0.45, 0.002, 0.05)


def bells(notes, spacing=0.06, dur=1.6, bright=1.0):
    out = np.zeros(int((dur + spacing * len(notes)) * SR))
    for i, m in enumerate(notes):
        b = bell(m, dur, bright)
        o = int(i * spacing * SR)
        out[o : o + len(b)] += b
    return out


def riser(dur, f0=300, f1=7000):
    """Tension build: brightening noise with accelerating flutter + a rising tone."""
    n = int(dur * SR)
    x = np.linspace(0, 1, n)
    air = swept_noise(dur, f0, f1, bw=0.9, bw1=0.35, curve=lambda p: p ** 1.6)
    flutter = 1 - 0.35 * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(4 + 22 * x ** 2) / SR))
    tone = sum(np.sin(2 * np.pi * np.cumsum(f * 2 ** (3 * x ** 1.3)) / SR) * g for f, g in ((110, 0.12), (165, 0.07)))
    return fade((air * flutter * 0.6 + tone) * x ** 2.2, 0.01, 0.004)


def reverse_swell(dur=0.6):
    """Reversed reverb tail that 'sucks' into the next hit."""
    burst = unit(bp(noise(int(0.08 * SR)), 500, 9000)) * np.exp(-tt(0.08) * 40)
    y = fftconvolve(burst, IR_HALL[0])[::-1]
    y = unit(y[-int(dur * SR):])
    return fade(y * np.linspace(0, 1, len(y)) ** 1.5, 0.01, 0.003)


def impact(warm=False):
    """Layered cinematic hit: sub drop, punch, crack and a low boom."""
    t = tt(2.2)
    sub = np.sin(2 * np.pi * np.cumsum(33 + 27 * np.exp(-t * 2.5)) / SR) * np.exp(-t * 1.8)
    punch = np.sin(2 * np.pi * np.cumsum(55 + 85 * np.exp(-t * 30)) / SR) * np.exp(-t * 16) * 0.8
    crack = unit(hp(noise(len(t)), 1500)) * np.exp(-t * 55) * (0.18 if warm else 0.4)
    boom = unit(lp(noise(len(t)), 420)) * np.exp(-t * 4.5) * 0.5
    return fade(np.tanh(1.4 * (sub + punch + crack + boom)) * 0.8, 0.0005, 0.1)


def shimmer(dur=0.8, rate=70, lo=3000, hi=9000, rise=False):
    """Stereo sparkle: a cloud of tiny high blips over a faint airy band."""
    n = int(dur * SR)
    sl, sr = np.zeros(n), np.zeros(n)
    k = int(rate * dur)
    for _ in range(k):
        u = rng.random() ** (0.6 if rise else 1.4)
        o = int(u * (n - int(0.03 * SR)))
        g = rng.uniform(0.15, 0.6) * (1 - 0.6 * u if not rise else 0.4 + 0.6 * u)
        tt_ = tt(0.025)
        b = np.sin(2 * np.pi * rng.uniform(lo, hi) * tt_) * np.exp(-tt_ * 180) * g
        p = rng.uniform(-0.9, 0.9)
        sl[o : o + len(b)] += b * np.cos((p + 1) * np.pi / 4) * 1.4
        sr[o : o + len(b)] += b * np.sin((p + 1) * np.pi / 4) * 1.4
    air = swept_noise(dur, lo * 1.2, hi, bw=0.5) * swell(n, 0.25 if not rise else 0.85) * 0.15
    return fade(sl + air), fade(sr + air)


def fill_tone(dur, m0, m1):
    """Rising 'filling up' tone for progress bars and meters."""
    n = int(dur * SR)
    x = np.linspace(0, 1, n)
    f = mtof(m0) * (mtof(m1) / mtof(m0)) ** (x ** 1.2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = lp(np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph), 4000)
    e = np.minimum(1, x / 0.08) * np.minimum(1, (1 - x) / 0.06) * (0.6 + 0.4 * x)
    return fade(s * e)


def scan(dur):
    """Security scan: fluttering band noise over a slow falling tone."""
    n = int(dur * SR)
    x = np.linspace(0, 1, n)
    band = swept_noise(dur, 2600, 2200, bw=0.25) * (0.55 + 0.45 * np.sin(2 * np.pi * 28 * x * dur))
    f = 1600 * (700 / 1600) ** x
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.35
    return fade((band * 0.5 + tone) * swell(n, 0.3, 1.2, 1.2))


def data_texture(dur, rate=30, lo=3500, hi=7500):
    """Sparse random digital ticks: 'the system is busy' texture (stereo)."""
    n = int(dur * SR)
    sl, sr = np.zeros(n), np.zeros(n)
    for _ in range(int(rate * dur)):
        o = int(rng.random() * max(1, n - int(0.02 * SR)))
        tt_ = tt(0.015)
        b = np.sin(2 * np.pi * rng.uniform(lo, hi) * tt_) * np.exp(-tt_ * 300) * rng.uniform(0.2, 0.6)
        p = rng.uniform(-0.8, 0.8)
        sl[o : o + len(b)] += b * np.cos((p + 1) * np.pi / 4) * 1.4
        sr[o : o + len(b)] += b * np.sin((p + 1) * np.pi / 4) * 1.4
    return sl, sr


def bed(t0, t1, kind, xf=0.6):
    """Continuous atmosphere so no scene ever sits in dead air."""
    a, b = max(0.0, t0 - xf / 2), min(DUR, t1 + xf / 2)
    n = int((b - a) * SR)
    x = np.linspace(0, 1, n)
    chans = []
    for _ in range(2):  # decorrelated left/right for width
        pk = pink(n)
        if kind == "dark":
            dark, open_ = lp(hp(pk, 35), 260), lp(hp(pk, 35), 1400)
            s = dark * (1 - x ** 2) + open_ * x ** 2 * 0.7  # opens up toward the hit
            s = s * 0.9
        elif kind == "air":
            s = bp(pk, 900, 7000) * 0.35 + lp(hp(pk, 40), 300) * 0.5
        elif kind == "tech":
            s = bp(pk, 180, 1400) * 0.55 + bp(pk, 3000, 9000) * 0.12
        else:  # bright
            s = bp(pk, 1500, 9000) * 0.3 + lp(hp(pk, 40), 350) * 0.4
        drift = 1 + 0.15 * np.sin(2 * np.pi * (0.13 + 0.05 * rng.random()) * np.arange(n) / SR + rng.random() * 6)
        chans.append(s * drift)
    if kind in ("dark",):
        t = np.arange(n) / SR
        drone = (np.sin(2 * np.pi * 55 * t) + 0.3 * np.sin(2 * np.pi * 82.5 * t)) * 0.35 * (0.8 + 0.2 * np.sin(2 * np.pi * 0.2 * t))
        chans = [c + drone for c in chans]
    fi = np.minimum(1, (np.arange(n) / SR) / xf)
    fo = np.minimum(1, ((n - np.arange(n)) / SR) / xf)
    e = np.sin(fi * np.pi / 2) * np.sin(fo * np.pi / 2)
    add_st(chans[0] * e, chans[1] * e, a, BED_GAIN)


def pan_x(x):
    """Screen x (0..1920) -> stereo pan."""
    return float(np.clip((x - 960) / 960 * 0.85, -0.9, 0.9))


def span(v):
    return v[0], v[1] - v[0]


# ---------------- reverbs ----------------
def make_ir(secs, decay, lpf, pre):
    t = tt(secs)
    irs = []
    for _ in range(2):
        ir = lp(noise(len(t)), lpf) * np.exp(-t * decay)
        ir[: int(pre * SR)] = 0
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return irs


IR_ROOM = make_ir(0.5, 11, 7000, 0.004)
IR_HALL = make_ir(2.6, 2.4, 6000, 0.018)
BED_GAIN = 0.022


# ---------------- sound design ----------------

# beds
for a, b, kind in C["beds"]:
    bed(a, b, kind)

# ---- S1 hook ----
sl, sr = shimmer(0.7, 50, rise=False)
add_st(sl, sr, C["logoIntro"], 0.10, verb=0.4)
add(thump(80, 45, 0.5, 0.05), C["logoIntro"], 0.18)
for (a, b), g in zip(C["streaks"], (0.16, 0.12, 0.14)):
    add(whoosh(b - a, 1500, 7000, peak=0.5, body=0.0, bw=0.4), a, g, pan=(0.8, -0.8), verb=0.15)
for i, t0 in enumerate(C["hookWords"]):
    add(pop(PENTA[5 + i], 0.2), t0, 0.12, pan=0.3 - 0.12 * (i % 3), room=0.3)
a, d = span(C["underline"])
add(whoosh(d, 2000, 5500, peak=0.4, body=0.0, bw=0.35), a, 0.12, pan=(-0.45, -0.15), room=0.2)
add(pop(67, 0.25), C["button"], 0.28, room=0.3)
add(thump(110, 60, 0.3, 0.1), C["button"], 0.2)
a, d = span(C["cursorIn"])
add(whoosh(d, 900, 3000, peak=0.55, body=0.0, bw=0.5), a, 0.05, pan=(0.6, 0.05))
add(riser(C["click"] - 0.3, 250, 6500), 0.3, 0.28, verb=0.2)
add(reverse_swell(0.55), C["click"] - 0.55 + 0.08, 0.22)
add(ui_click(2600, 200), C["click"], 0.5, room=0.3)
# the burst into the dashboard
add(impact(), C["burst"][0], 0.55, verb=0.35)
a, d = span(C["burst"])
add(whoosh(d + 0.25, 250, 6000, peak=0.25, body=0.8, tone=0.5), a - 0.02, 0.45, verb=0.3)
sl, sr = shimmer(1.0, 80)
add_st(sl, sr, a, 0.18, verb=0.5)

# ---- S2 platform builds ----
a, d = span(C["browser"])
add(whoosh(min(d, 0.7), 220, 3200, peak=0.45, body=0.7, tone=0.3), a - 0.05, 0.3, pan=(-0.1, -0.3), verb=0.15)
add(thump(90, 50, 0.4), C["browserLand"], 0.3)
add(pop(79), C["eyebrow"], 0.14, pan=0.6, room=0.3)
add(whoosh(0.35, 1800, 6000, peak=0.35, body=0.0, bw=0.4), C["headline"] - 0.03, 0.08, pan=0.55)
for i, t0 in enumerate(C["sidebar"]):
    add(blip(PENTA[10 + i]), t0, 0.06, pan=-0.05, room=0.3)
for t0 in C["type"]:
    add(key(), t0, 0.16, pan=rng.uniform(-0.45, -0.25), room=0.25)
add(ui_click(3000, 220), C["urlOk"], 0.2, pan=-0.1)
add(bells([84, 91], 0.07, 1.1), C["urlOk"] + 0.02, 0.14, pan=-0.1, verb=0.3)
for i, t0 in enumerate(C["stats"]):
    add(pop(PENTA[7 + i]), t0, 0.16, pan=pan_x(830 - 290 * i), room=0.3)
for t0 in C["counters"]:
    add(blip(rng.choice([96, 98, 100]), 0.05), t0, 0.035, pan=rng.uniform(-0.6, -0.1))
for i, t0 in enumerate(C["courses"]):
    add(pop(PENTA[8 + i]), t0, 0.15, pan=pan_x(830 - 300 * i), room=0.3)
add(thump(70, 45, 0.3, 0.05), C["courses"][0], 0.1)
add(bells([84, 91], 0.09, 1.2), C["toasts"][0], 0.14, pan=-0.35, verb=0.3)
add(bells([86, 93], 0.09, 1.2), C["toasts"][1], 0.12, pan=0.12, verb=0.3)
sl, sr = data_texture(C["toasts"][1] - C["browserLand"], rate=18)
add_st(sl, sr, C["browserLand"], 0.05, room=0.3)
a, d = span(C["sheet"])
add(whoosh(d + 0.1, 180, 2600, peak=0.6, body=0.9, tone=0.4), a - 0.05, 0.42, pan=(0.0, 0.0), verb=0.2)
add(thump(85, 45, 0.45), C["sheet"][1], 0.3)

# ---- S3 features ----
# the montage is the longest stretch; lift it ~3 dB so the middle never sags
SECTION_GAIN = 1.4
for k, t0 in enumerate(C["feats"]):
    add(whoosh(0.42, 500, 5200, peak=0.6, body=0.45), t0 - 0.2, 0.28, pan=(-0.85, -0.35), verb=0.12)
    add(thump(100, 55, 0.3, 0.08), t0 + 0.12, 0.16, pan=-0.3)
    add(bell([76, 79, 81, 84, 86, 88][k], 1.4), t0 + 0.03, 0.13, pan=0.4, verb=0.35)  # rising marker line
    add(whoosh(0.3, 1800, 6000, peak=0.4, body=0.0, bw=0.4), t0 + 0.02, 0.06, pan=0.45)
for t0 in C["featExits"]:
    add(whoosh(0.3, 5000, 1500, peak=0.3, body=0.2, bw=0.5), t0, 0.1, pan=(0.2, -0.2))

# 01 upload
for i, (a, b) in enumerate(C["chips"]):
    add(whoosh(b - a, 800, 5000, peak=0.55, body=0.15, bw=0.45), a, 0.1, pan=(-0.95, -0.45))
    add(pop(PENTA[9 + i], 0.15), b - 0.06, 0.08, pan=-0.45, room=0.3)
a, d = span(C["upload"])
add(fill_tone(d, 72, 84), a, 0.07, pan=-0.45, room=0.3)
sl, sr = data_texture(d, rate=40)
add_st(sl, sr, a, 0.05)
add(ui_click(2400, 180), C["uploadDone"], 0.22, pan=-0.2)
add(bells([79, 84, 88], 0.06, 1.3), C["uploadDone"] + 0.01, 0.17, pan=-0.3, verb=0.35)

# 02 exams
for i, t0 in enumerate(C["options"]):
    add(blip([79, 81, 84, 86][i]), t0, 0.07, pan=-0.3, room=0.3)
add(ui_click(2200, 170), C["select"], 0.25, pan=-0.35)
add(bells([84, 88, 91], 0.05, 1.3), C["correct"], 0.16, pan=-0.3, verb=0.35)
a, d = span(C["ring"])
add(fill_tone(d, 76, 88), a, 0.06, pan=-0.75, room=0.3)

# 03 content protection
a, d = span(C["scan"])
add(scan(d), a, 0.1, pan=(-0.3, -0.5), room=0.3)
a, d = span(C["shield"])
add(whoosh(d + 0.1, 300, 2200, peak=0.8, body=0.3, bw=0.5, tone=0.4), a, 0.14, pan=-0.45, verb=0.2)
add(thump(160, 90, 0.2, 0.2), C["lock"], 0.3, pan=-0.45)
add(ui_click(1500, 120, 1.2), C["lock"], 0.35, pan=-0.45, room=0.4)
add(bell(96, 0.6, 1.4), C["lock"] + 0.01, 0.06, pan=-0.45, verb=0.3)
add(whoosh(0.5, 180, 900, peak=0.2, body=0.8, bw=0.6), C["pulse"], 0.2, pan=-0.45, verb=0.3)
sl, sr = shimmer(0.6, 45)
add_st(sl, sr, C["pulse"], 0.1, verb=0.4)

# 04 analytics
for i, t0 in enumerate(C["bars"]):
    add(blip(PENTA[5 + i]), t0, 0.1, pan=pan_x(270 + i * 76), room=0.3)
a, d = span(C["line"])
add(fill_tone(d, 79, 91), a, 0.045, pan=(-0.7, -0.25), room=0.3)
for i, t0 in enumerate(C["dots"]):
    add(blip(PENTA[10 + i], 0.08), t0, 0.04, pan=pan_x(270 + i * 76))

# 05 scheduling
add(toggle(), C["calSwitch"], 0.3, pan=-0.6, room=0.3)
for t0 in C["calChips"]:
    add(pop(int(rng.choice([79, 81, 84, 86, 88])), 0.14), t0, 0.08, pan=rng.uniform(-0.7, -0.2), room=0.3)

# 06 supervisors
for i, t0 in enumerate(C["rows"]):
    add(whoosh(0.25, 1200, 4000, peak=0.5, body=0.0, bw=0.4), t0, 0.06, pan=(-0.7, -0.35))
add(pop(84), C["addBtn"], 0.12, pan=-0.6, room=0.3)
for t0 in C["toggles"]:
    add(toggle(), t0, 0.26, pan=rng.uniform(-0.75, -0.55), room=0.3)

SECTION_GAIN = 1.0

# ---- brand-stroke wipe into the grades ----
a, d = span(C["wipe"])
for i, g in enumerate((0.36, 0.3, 0.36)):  # one layer per monogram stroke
    add(whoosh(d + 0.15, 250 + 150 * i, 4200 + 600 * i, peak=0.5, body=0.7, tone=0.25), a + i * 0.06, g, pan=(0.95, -0.95), verb=0.2)
add(thump(75, 40, 0.5, 0.1), a + d * 0.5, 0.28)

# ---- S4 grades ----
add(whoosh(0.35, 1800, 6000, peak=0.35, body=0.0, bw=0.4), C["gradesHead"] - 0.03, 0.08)
a, d = span(C["path"])
trail = whoosh(d, 500, 2600, peak=0.75, body=0.0, bw=0.45, tone=0.35)
add(trail, a, 0.12, pan=(0.9, -0.75), verb=0.3)
sl, sr = shimmer(d, 30, 4000, 10000)
add_st(sl, sr, a, 0.06, verb=0.4)
for m, t0, x in zip([72, 74, 76, 79, 81, 84], C["nodes"], (1640, 1370, 1100, 830, 560, 290)):
    add(bell(m, 1.5), t0, 0.2, pan=pan_x(x), verb=0.45)
    add(pop(m, 0.16), t0, 0.08, pan=pan_x(x), room=0.3)
a, d = span(C["fly"])
add(whoosh(d + 0.1, 400, 6500, peak=0.85, body=0.4, tone=0.3), a, 0.26, pan=(-0.7, 0.0), verb=0.2)
add(riser(C["logo"] - a, 400, 8000), a, 0.2, verb=0.2)
add(reverse_swell(0.6), C["logo"] - 0.6, 0.2)

# ---- S5 end card: sonic logo ----
a, d = span(C["reveal"])
add(whoosh(d + 0.3, 6000, 1200, peak=0.3, body=0.3, bw=0.6), a, 0.2, verb=0.3)
add(impact(warm=True), C["logo"], 0.42, verb=0.4)
for i, (t0, m) in enumerate(zip(C["strokes"], (79, 84, 88))):
    add(whoosh(0.25, 1500, 9000, peak=0.7, body=0.0, bw=0.35), t0 - 0.08, 0.1, pan=0.35 + 0.08 * i)
    add(bell(m, 1.8, 1.3), t0, 0.16, pan=0.3 + 0.1 * i, verb=0.45)
sl, sr = shimmer(0.8, 90, 4000, 11000, rise=False)
add_st(sl, sr, C["wordmark"], 0.14, verb=0.5)
add(whoosh(0.55, 2500, 8000, peak=0.35, body=0.0, bw=0.35), C["wordmark"], 0.1, pan=(0.35, -0.35))
add(bells([60, 67, 72, 76, 79, 86], 0.055, 2.4, 0.9), C["wordmark"] + 0.12, 0.13, verb=0.6)  # resolve
for i, (t0, x) in enumerate(zip(C["orbs"], (330, 1600, 200, 1730, 470, 1460))):
    add(pop(PENTA[10 + i], 0.14), t0, 0.07, pan=pan_x(x), room=0.3)
add(whoosh(0.35, 1800, 6000, peak=0.35, body=0.0, bw=0.4), C["tagline"] - 0.03, 0.08)
add(pop(79, 0.22), C["cta"], 0.22, room=0.3)
add(thump(110, 60, 0.3, 0.1), C["cta"], 0.14)
add(blip(91), C["url"], 0.06)
a, d = span(C["cursorOut"])
add(whoosh(d, 900, 3000, peak=0.55, body=0.0, bw=0.5), a, 0.05, pan=(0.6, 0.05))
add(ui_click(2600, 200), C["ctaClick"], 0.4, room=0.3)
add(bells([84, 88, 91], 0.05, 1.6), C["ctaClick"] + 0.02, 0.15, verb=0.45)
add(whoosh(0.5, 300, 1500, peak=0.15, body=0.5, bw=0.6), C["ctaClick"], 0.14, verb=0.3)


# ---------------- mix ----------------
def conv(x, ir):
    return fftconvolve(x, ir)[:N]


wetL = conv(hp(room_send, 150), IR_ROOM[0]) * 0.5 + conv(hp(hall_send, 150), IR_HALL[0]) * 0.6
wetR = conv(hp(room_send, 150), IR_ROOM[1]) * 0.5 + conv(hp(hall_send, 150), IR_HALL[1]) * 0.6
mix = np.stack([L * duck + wetL, R * duck + wetR])
mix = hp(mix, 25)

# gentle glue compression on the whole bus (2:1 above -18 dB re: peak)
lvl = np.sqrt(lfilter([1 - np.exp(-1 / (0.03 * SR))], [1, -np.exp(-1 / (0.03 * SR))], np.mean(mix ** 2, axis=0)) + 1e-12)
thr = np.max(lvl) * 10 ** (-18 / 20)
g = np.minimum(1, (thr / lvl) ** (1 - 1 / 2.0))
g = lfilter([1 - np.exp(-1 / (0.02 * SR))], [1, -np.exp(-1 / (0.02 * SR))], g)
mix = mix * g
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.2) / np.tanh(1.2)
fo = int(0.45 * SR)
mix[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5
mix *= 0.89  # ~ -1 dBFS; final loudness is set by the renderer (-16 LUFS)

out = ROOT / "output/soundtrack.wav"
pcm = (mix.T * 32767).astype(np.int16)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {out.relative_to(ROOT)}  ({DUR:.1f}s, {'music ' + format(BPM, '.1f') + ' BPM + ' if MUSIC else ''}SFX, {SR} Hz stereo)")
