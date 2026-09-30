"""Original 15s soundtrack + sound design for the Manasetak promo.

Everything is synthesized from scratch (no samples, no licensing concerns).
Hit points are read from output/cues.json, which the page exports from the
same constants that drive the animation, so audio and picture stay locked.

    python3 audio/soundtrack.py  ->  output/soundtrack.wav
"""
import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
cues = json.loads((ROOT / "output/cues.json").read_text())
DUR = cues["duration"]
N = int(SR * DUR)
BEAT = 60 / cues["bpm"]
rng = np.random.default_rng(3)

L = np.zeros(N)
R = np.zeros(N)
verb_send = np.zeros(N)
duck = np.ones(N)  # sidechain envelope driven by the kick


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100), "low", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR / 2 - 100)], "band", fs=SR, output="sos"), x)


def add(sig, t0, gain=1.0, pan=0.0, verb=0.0):
    i = int(t0 * SR)
    if i >= N:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[i : i + len(sig)] += sig * gain * gl * 1.414
    R[i : i + len(sig)] += sig * gain * gr * 1.414
    verb_send[i : i + len(sig)] += sig * gain * verb


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
# C major, uplifting: F | C | G | Am | F | G | (break) | C
PROG = [
    (0.0, 2.0, [53, 57, 60, 64]),      # Fmaj7  (intro, filtered)
    (2.0, 4.0, [48, 55, 60, 64, 67]),  # C
    (4.0, 6.0, [43, 55, 59, 62, 67]),  # G
    (6.0, 8.0, [45, 57, 60, 64, 69]),  # Am
    (8.0, 10.0, [41, 57, 60, 65, 69]), # F
    (10.0, 12.0, [43, 55, 59, 62, 67]),  # G
    (12.0, 13.0, [43, 55, 60, 62, 67]),  # Gsus4 (tension before logo)
    (13.0, 15.0, [36, 55, 60, 64, 67, 72]),  # C (resolve on the end card)
]


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
    cutoff = 700 if t0 < 2 else (1800 if t0 < 12 else 1300)
    if t0 >= 13:
        cutoff = 2400
    p = pad(notes, t0, t1, cutoff, 0.22)
    # slight stereo spread: different detune seeds per side
    add(p, t0, 0.9, -0.35, verb=0.35)
    add(pad(notes, t0, t1, cutoff, 0.22), t0, 0.9, 0.35, verb=0.35)

# intro swell: pad fades in from nothing
fade_in = int(1.2 * SR)
L[:fade_in] *= np.linspace(0, 1, fade_in) ** 2
R[:fade_in] *= np.linspace(0, 1, fade_in) ** 2


def pluck(f, dur=0.35, bright=4000):
    t = tt(dur)
    s = (2 * ((f * t) % 1) - 1) * 0.6 + np.sin(2 * np.pi * f * t) * 0.8
    s = lp(s, bright, 2)
    return s * env_ad(len(t), 0.002, 11)


# arpeggio: 8ths in the build, 16ths through the feature montage
for t0, t1, notes in PROG:
    if t0 < 2 or t0 >= 12:
        continue
    step = BEAT / 2 if t0 < 5 else BEAT / 4
    pitches = [m + 12 for m in notes[1:]]
    k = 0
    t = t0
    while t < t1 - 1e-6:
        m = pitches[[0, 1, 2, 3, 2, 1][k % 6] % len(pitches)]
        add(pluck(mtof(m), bright=3500 + 1500 * (k % 3)), t, 0.16, 0.5 if k % 2 else -0.5, verb=0.25)
        t += step
        k += 1

# end-card sparkle arpeggio (C major, rising)
for i, m in enumerate([72, 76, 79, 84, 88]):
    add(pluck(mtof(m), 0.6, 6000), 13.05 + i * 0.09, 0.15, (-0.6 + i * 0.3), verb=0.6)


# bass: pumping 8ths on the root
def bass_note(f, dur):
    t = tt(dur)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    e = np.minimum(1, t / 0.005) * np.exp(-t * 3)
    return lp(s * e, 900)


for t0, t1, notes in PROG:
    if t0 < 2 or (12 <= t0 < 13):
        continue
    f = mtof(notes[0] - 12 if notes[0] > 40 else notes[0])
    t = t0
    while t < t1 - 1e-6:
        add(bass_note(f, BEAT / 2), t, 0.34)
        t += BEAT / 2
add(bass_note(mtof(36 - 12) * 2, 2.0), 13.0, 0.5)


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


beat = 2.0
while beat < 12.0 - 1e-6:
    add(kick(), beat, 0.95)
    duck_at(beat)
    b = round((beat - 2.0) / BEAT)
    if beat >= 5.0 and b % 2 == 1:
        add(clap(), beat, 0.45, 0.1, verb=0.3)
    add(hat(open_=beat >= 5), beat + BEAT / 2, 0.22, 0.3)
    if beat >= 5.0 and beat < 11:
        for q in (0.25, 0.75):
            add(hat(), beat + BEAT * q, 0.12, -0.3)
    beat += BEAT
# fill into the grade-journey scene
for i in range(4):
    add(clap(), 10.75 + i * 0.0625, 0.18 + 0.06 * i, 0.0, verb=0.2)

# ---------------- sound design ----------------
def whoosh(dur=0.55, lo=300, hi=6000, rev=False):
    t = tt(dur)
    n = rng.standard_normal(len(t))
    x = t / dur
    if rev:
        x = x[::-1]
    out = np.zeros_like(t)
    seg = int(0.02 * SR)
    for i in range(0, len(t), seg):
        c = lo * (hi / lo) ** x[i]
        out[i : i + seg] = bp(n[i : i + seg + 2000], c * 0.7, c * 1.3, 1)[:seg][: len(out[i : i + seg])]
    e = np.sin(np.pi * np.minimum(1, t / dur)) ** 2
    return out * e


def riser(dur):
    t = tt(dur)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = int(0.02 * SR)
    for i in range(0, len(t), seg):
        c = 400 * (9000 / 400) ** (i / len(t))
        out[i : i + seg] = bp(n[i : i + seg + 2000], c * 0.8, c * 1.2, 1)[:seg][: len(out[i : i + seg])]
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * t / dur)) / SR) * 0.15
    return (out + tone) * (t / dur) ** 2


def impact():
    t = tt(1.8)
    f = 30 + 70 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    crack = lp(rng.standard_normal(len(t)), 4000) * np.exp(-t * 14) * 0.5
    return np.tanh((boom + crack) * 1.4)


def click():
    t = tt(0.05)
    return hp(rng.standard_normal(len(t)), 2000) * np.exp(-t * 250) + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 180) * 0.6


def pop(f=700):
    t = tt(0.12)
    fr = f * (1 + 1.2 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 35)


def tick(f=3200):
    t = tt(0.03)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 260)


def chime(notes, spacing=0.07):
    out = np.zeros(int(1.2 * SR))
    for i, m in enumerate(notes):
        t = tt(1.2 - i * spacing)
        f = mtof(m)
        s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.01 * f * t) + 0.12 * np.sin(2 * np.pi * 3.02 * f * t))
        s *= np.exp(-t * 4.5) * np.minimum(1, t / 0.003)
        o = int(i * spacing * SR)
        out[o : o + len(s)] += s
    return out * 0.5


def metal_lock():
    t = tt(0.25)
    s = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, d in ((1800, 40), (2750, 55), (4300, 70)))
    c = np.zeros(len(t))
    k = click()
    c[: len(k)] = k
    return s * 0.4 + c * 0.6


for a, b in cues["risers"]:
    add(riser(b - a), a, 0.35, 0.0, verb=0.3)
for w in cues["whooshes"]:
    add(whoosh(0.55), w - 0.15, 0.55, 0.0, verb=0.3)
for t0 in cues["impacts"]:
    add(impact(), t0, 0.75, 0.0, verb=0.5)
for t0 in cues["clicks"]:
    add(click(), t0, 0.5, 0.2)
for i, t0 in enumerate(cues["type"]):
    add(tick(2600 + (i % 3) * 400) + click()[: int(0.03 * SR)] * 0.3, t0, 0.18, -0.2 + 0.02 * i)
for i, t0 in enumerate(cues["pops"]):
    add(pop(600 + (i % 4) * 120), t0, 0.28, (-0.4 if i % 2 else 0.4), verb=0.15)
for i, t0 in enumerate(cues["words"]):
    add(whoosh(0.18, 2000, 9000), t0 - 0.03, 0.12, 0.3 if i % 2 else -0.3)
for i, t0 in enumerate(cues["feats"]):
    add(whoosh(0.4, 500, 7000), t0 - 0.2, 0.4, 0.0, verb=0.2)
    add(pop(900), t0 + 0.02, 0.22, 0.3)
add(chime([84, 88, 91]), cues["chimes"][0], 0.3, -0.2, verb=0.5)   # upload done
add(chime([79, 84, 88]), cues["chimes"][1], 0.3, 0.2, verb=0.5)    # correct answer
add(metal_lock(), cues["lock"][0], 0.45, 0.0, verb=0.3)
for i, t0 in enumerate(cues["ticks"]):
    add(tick(2000 + (i % 8) * 180), t0, 0.22, (-0.5 + (i % 5) * 0.25))
for t0 in cues["toggles"]:
    add(click(), t0, 0.22, 0.3)
# grade nodes play a rising C-major pentatonic line
for m, t0 in zip([72, 74, 76, 79, 81, 84], cues["nodes"]):
    add(chime([m], 0), t0, 0.32, 0.0, verb=0.5)
add(chime([96, 100], 0.05), cues["shine"], 0.18, 0.3, verb=0.7)  # logo shine


# ---------------- mix ----------------
def reverb(x, secs=1.6):
    t = tt(secs)
    ir = rng.standard_normal(len(t)) * np.exp(-t * 4.2)
    ir = lp(ir, 5000)
    ir[: int(0.012 * SR)] = 0
    y = fftconvolve(x, ir)[:N]
    return y / (np.max(np.abs(y)) + 1e-9)


wet = reverb(hp(verb_send, 200)) * 0.22 * np.max(np.abs(verb_send))
L2 = L * duck + wet
R2 = R * duck + np.roll(wet, int(0.013 * SR))

# master: gentle glue + fade tail
mix = np.stack([L2, R2])
mix = hp(mix, 25)
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.5) / np.tanh(1.5)
fo = int(0.45 * SR)
mix[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5
mix *= 0.89  # ~ -1 dBFS

out = ROOT / "output/soundtrack.wav"
pcm = (mix.T * 32767).astype(np.int16)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {out.relative_to(ROOT)}  ({DUR:.1f}s, {SR} Hz stereo)")
