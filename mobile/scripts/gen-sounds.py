"""Synthesises every game sound as a small 16-bit mono WAV (no external assets, no licences).
Run: python scripts/gen-sounds.py"""
import math, os, random, struct, wave

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')
os.makedirs(OUT, exist_ok=True)
random.seed(7)

def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    data = b''.join(struct.pack('<h', int(max(-1, min(1, s / peak * 0.85)) * 32767)) for s in samples)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data)

def tone(freq, dur, vol=1.0, decay=6.0, f2=None, wave_type='sine'):
    n = int(SR * dur); out = []
    for i in range(n):
        t = i / SR
        f = freq if f2 is None else freq + (f2 - freq) * (i / n)
        ph = 2 * math.pi * f * t
        s = math.sin(ph) if wave_type == 'sine' else (1 if math.sin(ph) > 0 else -1) * 0.4
        out.append(s * vol * math.exp(-decay * t / dur) * min(1, i / 60))
    return out

def noise(dur, vol=1.0, decay=20.0):
    n = int(SR * dur)
    return [(random.random() * 2 - 1) * vol * math.exp(-decay * i / n) for i in range(n)]

def mix(*tracks):
    n = max(len(t) for t in tracks)
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(n)]

def seq(*parts, gap=0.0):
    out = []
    for p in parts:
        out += p + [0.0] * int(SR * gap)
    return out

write('click', mix(tone(1400, 0.05, 1, 9), noise(0.01, 0.2)))
write('shot', mix(tone(170, 0.18, 1, 7, f2=55), noise(0.06, 0.5, 30)))
write('hit', mix(tone(2400, 0.045, 0.8, 10), tone(1500, 0.05, 0.5, 12), noise(0.02, 0.3, 40)))
write('wall', mix(tone(700, 0.05, 0.8, 10, f2=450), noise(0.015, 0.2, 30)))
write('pocket', mix(tone(900, 0.22, 0.7, 5, f2=260), tone(140, 0.18, 0.9, 8), noise(0.04, 0.3, 30)))
write('queen', seq(tone(660, 0.12, 0.8, 4), tone(830, 0.12, 0.8, 4), tone(990, 0.28, 0.9, 3.5)))
write('foul', seq(tone(300, 0.14, 0.9, 3, wave_type='sq'), tone(210, 0.28, 0.9, 3, wave_type='sq')))
write('win', seq(*[tone(f, 0.16, 0.8, 3) for f in (523, 659, 784)], mix(tone(1047, 0.5, 0.9, 3), tone(784, 0.5, 0.5, 3), tone(659, 0.5, 0.5, 3))))
write('loss', seq(tone(392, 0.2, 0.8, 3), tone(349, 0.2, 0.8, 3), tone(311, 0.2, 0.8, 3), tone(262, 0.5, 0.9, 2.5)))
write('countdown', tone(880, 0.14, 0.9, 5))
write('go', mix(tone(1320, 0.3, 0.9, 4), tone(660, 0.3, 0.6, 4)))
write('notification', seq(tone(988, 0.1, 0.8, 4), tone(1319, 0.22, 0.8, 4)))
write('reward', seq(*[tone(f, 0.08, 0.7, 4) for f in (784, 988, 1175, 1568)]))

# calm 8-second looping background music: slow pentatonic arpeggio over a soft pad
BPM, notes = 90, [262, 294, 330, 392, 440, 392, 330, 294]
beat = 60 / BPM
music = [0.0] * int(SR * beat * len(notes))
for i, f in enumerate(notes):
    start = int(SR * beat * i)
    for j, s in enumerate(tone(f, beat * 1.6, 0.35, 3.5)):
        if start + j < len(music): music[start + j] += s
    for j, s in enumerate(tone(f / 2, beat, 0.22, 2.5)):
        if start + j < len(music): music[start + j] += s
write('music', music)
print('sounds written to', os.path.abspath(OUT))
