#!/usr/bin/env python3
"""NewsEdition Reel generator (photo with credit, original music, soft sound effects).

Usage: python3 -I make_reel.py spec.json out.mp4 [voice.mp3]

spec.json keys:
  pillar, headline, points (list, max 3), source, date, handle
  photo         optional: path to a JPEG (about 1080x640) of the article's credited cover photo
  photo_credit  required when photo is given: the credit as plain text, e.g. "Cover image: courtesy The Indian Express."
  seed          optional int: picks the tempo and chords of the music bed (default: from the date text)

Output: 1080x1920 H.264 MP4 (14 s, longer when a voice track is given) with an AAC track.
The music is synthesised here (no sample, no licence question); it is ducked under a voice track.
Without numpy the Reel is made with a silent track.

Copy of the script the daily Reel task uses (project doc claude/make_reel.py), with a font fallback so it
also runs on a GitHub Actions runner.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 1080, 1920, 24, 14
RED, NAVY, WHITE, GREY = (204, 0, 1), (15, 23, 42), (255, 255, 255), (148, 163, 184)
FONT_DIRS = ("/usr/share/fonts/opentype/inter/", "/usr/share/fonts/truetype/inter/")
FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def pick_font(name):
    for d in FONT_DIRS:
        if os.path.exists(d + name):
            return d + name
    return FALLBACK


F_XB, F_SB, F_MD = pick_font("Inter-ExtraBold.otf"), pick_font("Inter-SemiBold.otf"), pick_font("Inter-Medium.otf")
MARGIN = 70
TEXT_W = W - 2 * MARGIN
PHOTO_Y, PHOTO_H = 240, 640
SR = 44100


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap(draw, text, fnt, width):
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def short_credit(probe, credit):
    """'Cover image: courtesy X.' -> 'Photo: courtesy X' (max 2 lines of 26 px in 960 px), else a short form."""
    text = credit.strip()
    if text.lower().startswith("cover image:"):
        text = "Photo:" + text[len("cover image:"):]
    text = text.rstrip(". ").strip()
    f = font(F_MD, 26)
    lines = wrap(probe, text, f, 940)
    if len(lines) <= 2:
        return lines
    if "wikimedia" in text.lower():
        return ["Photo: via Wikimedia Commons (credit in the caption)"]
    return ["Photo credit in the caption"]


def build(spec):
    probe = ImageDraw.Draw(Image.new("RGB", (W, H)))
    layers = []  # (image, start_sec)
    has_photo = bool(spec.get("photo"))
    if has_photo and not spec.get("photo_credit"):
        sys.exit("LAYOUT ERROR: a photo needs photo_credit. No credit, no photo.")

    # Static background + top brand band
    base = Image.new("RGBA", (W, H), NAVY + (255,))
    d = ImageDraw.Draw(base)
    d.rectangle([0, 100, W, 230], fill=RED)
    logo = Image.new("RGBA", (104, 104), RED + (255,))
    ld = ImageDraw.Draw(logo)
    lf = font(F_XB, 54)
    bx = ld.textbbox((0, 0), "NE", font=lf)
    ld.text(((104 - (bx[2] - bx[0])) / 2 - bx[0], (104 - (bx[3] - bx[1])) / 2 - bx[1]), "NE", font=lf, fill=WHITE)
    base.paste(logo, (MARGIN, 113))
    d.rectangle([MARGIN - 4, 109, MARGIN + 107, 220], outline=WHITE, width=4)
    d.text((MARGIN + 132, 138), "NewsEdition", font=font(F_XB, 54), fill=WHITE)
    date_font = font(F_MD, 32)
    dw = d.textlength(spec["date"], font=date_font)
    d.text((W - MARGIN - dw, 152), spec["date"], font=date_font, fill=WHITE)

    photo_frames = None
    photo_overlay = None
    if has_photo:
        img = Image.open(spec["photo"]).convert("RGB")
        # cover-fit to 1080x640
        scale = max(W / img.width, PHOTO_H / img.height)
        img = img.resize((max(W, round(img.width * scale)), max(PHOTO_H, round(img.height * scale))), Image.LANCZOS)
        left, top = (img.width - W) // 2, (img.height - PHOTO_H) // 2
        photo_frames = img.crop((left, top, left + W, top + PHOTO_H))
        # credit chip on the photo
        cl = layer()
        cd = ImageDraw.Draw(cl)
        cf = font(F_MD, 26)
        clines = short_credit(probe, spec["photo_credit"])
        cw = max(cd.textlength(t, font=cf) for t in clines)
        ch = 14 + 34 * len(clines)
        y0 = PHOTO_Y + PHOTO_H - ch - 18
        cd.rounded_rectangle([MARGIN - 20, y0, MARGIN + cw + 20, y0 + ch], radius=10, fill=(0, 0, 0, 170))
        for i, t in enumerate(clines):
            cd.text((MARGIN, y0 + 9 + 34 * i), t, font=cf, fill=WHITE)
        photo_overlay = cl
        y = PHOTO_Y + PHOTO_H + 26
        hsize, hstep, pstep_start = 66, 80, 3.2
        chip_y = y
        y += 74 + 22
    else:
        y = 330
        hsize, hstep, pstep_start = 80, 100, 3.0
        chip_y = y
        y += 74 + 46

    # Pillar chip
    chip = layer()
    cd = ImageDraw.Draw(chip)
    pf = font(F_XB, 34)
    pw = cd.textlength(spec["pillar"].upper(), font=pf)
    cd.rounded_rectangle([MARGIN, chip_y, MARGIN + pw + 56, chip_y + 64], radius=12, fill=RED)
    cd.text((MARGIN + 28, chip_y + 11), spec["pillar"].upper(), font=pf, fill=WHITE)
    layers.append((chip, 0.2))

    # Headline
    hl = layer()
    hd = ImageDraw.Draw(hl)
    hf = font(F_XB, hsize)
    lines = wrap(probe, spec["headline"], hf, TEXT_W)
    if len(lines) > 3:
        sys.exit("LAYOUT ERROR: headline needs %d lines (max 3). Shorten it to about 55 characters." % len(lines))
    for ln in lines:
        hd.text((MARGIN, y), ln, font=hf, fill=WHITE)
        y += hstep
    layers.append((hl, 0.5))
    y += 18

    # Key points, revealed one by one
    pfs = 40 if has_photo else 48
    pstep = 50 if has_photo else 64
    pfnt = font(F_MD, pfs)
    start = pstep_start
    for pt in spec["points"][:3]:
        pl = layer()
        pd = ImageDraw.Draw(pl)
        plines = wrap(probe, pt, pfnt, TEXT_W - 60)
        if len(plines) > 2:
            sys.exit("LAYOUT ERROR: a key point needs %d lines (max 2). Shorten it to about 70 characters: %s" % (len(plines), pt))
        pd.rectangle([MARGIN, y + 12, MARGIN + 20, y + 30], fill=RED)
        yy = y
        for ln in plines:
            pd.text((MARGIN + 46, yy), ln, font=pfnt, fill=WHITE)
            yy += pstep
        y = yy + (16 if has_photo else 34)
        layers.append((pl, start))
        start += 2.4

    limit = 1555 if has_photo else 1360
    if y > limit:
        sys.exit("LAYOUT ERROR: text runs into the source line (%d > %d). Shorten the headline or points." % (y, limit))

    # Source line
    src_font = font(F_MD, 32 if has_photo else 38)
    src_text = "Source: " + spec["source"]
    if d.textlength(src_text, font=src_font) > W - 2 * MARGIN:
        sys.exit("LAYOUT ERROR: source line is too long. Shorten it to about 45 characters.")
    sl = layer()
    sd = ImageDraw.Draw(sl)
    sy = 1572 if has_photo else 1395
    sd.rectangle([MARGIN, sy - 14, W - MARGIN, sy - 11], fill=GREY)
    sd.text((MARGIN, sy), src_text, font=src_font, fill=GREY)
    layers.append((sl, 10.4))

    # CTA bar
    cl2 = layer()
    cd2 = ImageDraw.Draw(cl2)
    if has_photo:
        cd2.rectangle([0, 1640, W, 1740], fill=RED)
        cd2.text((MARGIN, 1664), "Roz ki khabar  |  Follow " + spec["handle"], font=font(F_XB, 44), fill=WHITE)
    else:
        cd2.rectangle([0, 1480, W, 1650], fill=RED)
        cd2.text((MARGIN, 1507), "Roz 60 second mein khabar", font=font(F_XB, 52), fill=WHITE)
        cd2.text((MARGIN, 1578), "Follow " + spec["handle"], font=font(F_SB, 42), fill=WHITE)
    layers.append((cl2, 11.0))

    reveal_times = [0.5] + [pstep_start + 2.4 * i for i in range(min(3, len(spec["points"])))] + [11.0]
    return base, layers, photo_frames, photo_overlay, reveal_times


# ── audio ────────────────────────────────────────────────────────────────────

def synth_audio(np, dur, seed, reveal_times):
    """Original music bed (pad, bass, soft pluck, light pulse) plus a quiet whoosh at each reveal. Returns float32 stereo."""
    rng = np.random.RandomState(seed)
    n = int((dur + 0.3) * SR)
    t = np.arange(n) / SR
    bpm = [92, 100, 108][seed % 3]
    beat = 60.0 / bpm
    progs = [
        [(57, (0, 3, 7)), (53, (0, 4, 7)), (48, (0, 4, 7)), (55, (0, 4, 7))],   # Am F C G
        [(52, (0, 3, 7)), (48, (0, 4, 7)), (55, (0, 4, 7)), (50, (0, 3, 7))],   # Em C G Dm
        [(50, (0, 3, 7)), (46, (0, 4, 7)), (53, (0, 4, 7)), (48, (0, 4, 7))],   # Dm Bb F C
    ]
    prog = progs[(seed // 3) % len(progs)]

    def hz(m):
        return 440.0 * 2 ** ((m - 69) / 12.0)

    out = np.zeros(n, dtype=np.float64)
    bar = beat * 4
    # pad: sustained triads, slow attack and release, two detuned voices
    for ci in range(int(dur / bar) + 2):
        root, shape = prog[ci % len(prog)]
        t0 = ci * bar
        if t0 >= dur + 0.3:
            break
        seg = (t >= t0) & (t < t0 + bar + 0.4)
        lt = t[seg] - t0
        env = np.minimum(lt / 0.5, 1.0) * np.clip(1.0 - (lt - bar) / 0.4, 0.0, 1.0)
        tone = np.zeros(lt.shape)
        for iv in shape:
            f = hz(root + 12 + iv)
            tone += np.sin(2 * np.pi * f * lt) + 0.6 * np.sin(2 * np.pi * f * 1.004 * lt) + 0.25 * np.sin(2 * np.pi * f * 2 * lt)
        out[seg] += 0.07 * env * tone
    # bass on beats 1 and 3, short pluck of a sine
    for b in range(int(dur / beat) + 1):
        if b % 2 != 0:
            continue
        bt = b * beat
        root = prog[(b // 4) % len(prog)][0] - 12
        seg = (t >= bt) & (t < bt + beat * 1.8)
        lt = t[seg] - bt
        out[seg] += 0.30 * np.exp(-lt * 3.2) * np.sin(2 * np.pi * hz(root) * lt)
    # arpeggio: eighth notes, soft decaying triangle-ish tone
    for e in range(int(dur / (beat / 2)) + 1):
        et = e * beat / 2
        root, shape = prog[(e // 8) % len(prog)]
        note = root + 12 + shape[e % 3] + (12 if (e // 3) % 2 else 0)
        seg = (t >= et) & (t < et + 0.5)
        lt = t[seg] - et
        ph = 2 * np.pi * hz(note) * lt
        out[seg] += 0.09 * np.exp(-lt * 7.0) * (np.sin(ph) + 0.3 * np.sin(2 * ph))
    # light kick on every beat, soft hat on the off-beats
    for b in range(int(dur / beat) + 1):
        bt = b * beat
        seg = (t >= bt) & (t < bt + 0.25)
        lt = t[seg] - bt
        out[seg] += 0.22 * np.exp(-lt * 16) * np.sin(2 * np.pi * (48 + 80 * np.exp(-lt * 25)) * lt)
        ht = bt + beat / 2
        seg = (t >= ht) & (t < ht + 0.06)
        lt = t[seg] - ht
        noise = rng.randn(seg.sum())
        noise = noise - np.concatenate(([0.0], noise[:-1])) * 0.95  # crude high-pass
        out[seg] += 0.025 * np.exp(-lt * 70) * noise
    # fades
    out *= np.clip(t / 0.25, 0.0, 1.0) * np.clip((dur + 0.3 - t) / 1.2, 0.0, 1.0)
    peak = float(np.max(np.abs(out))) or 1.0
    music = out / peak * 0.8

    # whoosh at each reveal: noise rising through a one-pole low-pass, fast fade
    fx = np.zeros(n)
    for rt in reveal_times:
        seg = (t >= rt - 0.12) & (t < rt + 0.28)
        lt = t[seg] - (rt - 0.12)
        k = seg.sum()
        noise = rng.randn(k)
        cutoff = 0.04 + 0.5 * (lt / 0.4)
        y = np.zeros(k)
        acc = 0.0
        for i in range(k):
            acc += cutoff[i] * (noise[i] - acc)
            y[i] = acc
        env = np.sin(np.pi * np.clip(lt / 0.4, 0, 1)) ** 2
        fx[seg] += 0.35 * env * y
    fpk = float(np.max(np.abs(fx))) or 1.0
    fx = fx / fpk * 0.22
    mix = music + fx
    stereo = np.stack([mix, np.roll(mix, int(0.0007 * SR))], axis=1)  # tiny width
    return stereo.astype(np.float32)


def write_wav(np, path, data):
    import wave
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    spec_path, out = sys.argv[1], sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else None
    spec = json.load(open(spec_path, encoding="utf-8"))
    base, layers, photo, overlay, reveal = build(spec)
    fade, rise = 0.45, 28

    dur = DUR
    if voice:
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice],
                               capture_output=True, text=True)
        vlen = float(probe.stdout.strip() or 0)
        dur = max(DUR, min(24, int(vlen + 2.2)))

    wav = out + ".music.wav"
    have_audio = False
    try:
        import numpy as np
        seed = int(spec.get("seed", sum(ord(c) for c in spec["date"])))
        write_wav(np, wav, synth_audio(np, dur, seed, reveal))
        have_audio = True
    except ImportError:
        pass

    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if have_audio:
        cmd += ["-i", wav]
        if voice:
            cmd += ["-i", voice]
            # music under the voice (side-chain duck), then one loudness target
            flt = ("[1:a]volume=0.55[m];[2:a]adelay=600|600,apad,asplit=2[v][vs];"
                   "[m][vs]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md];"
                   "[md][v]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9,aresample=44100[a]")
        else:
            flt = "[1:a]loudnorm=I=-17:TP=-1.5:LRA=9,aresample=44100[a]"
        cmd += ["-filter_complex", flt, "-map", "0:v", "-map", "[a]"]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
    cmd += ["-t", str(dur), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "2M", "-bufsize", "4M",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    cur = base.copy()
    done = [False] * len(layers)
    nframes = FPS * dur
    for i in range(nframes):
        t = i / FPS
        frame = cur.copy()
        if photo is not None:
            z = 1.0 + 0.09 * (t / dur)  # slow push-in
            bw, bh = W / z, PHOTO_H / z
            x0, y0 = (W - bw) / 2, (PHOTO_H - bh) / 2
            pf = photo.resize((W, PHOTO_H), Image.BILINEAR, box=(x0, y0, x0 + bw, y0 + bh))
            if t < 0.4:
                pf = Image.blend(Image.new("RGB", (W, PHOTO_H), NAVY), pf, t / 0.4)
            frame.paste(pf, (0, PHOTO_Y))
            if overlay is not None and t >= 0.4:
                op = min(1.0, (t - 0.4) / 0.45)
                if op >= 1.0:
                    frame.alpha_composite(overlay)
                else:
                    ov = overlay.copy()
                    ov.putalpha(ov.getchannel("A").point(lambda v, op=op: int(v * op)))
                    frame.alpha_composite(ov)
        for k, (img, st) in enumerate(layers):
            if done[k] or t < st:
                continue
            p = min(1.0, (t - st) / fade)
            if p >= 1.0:
                cur.alpha_composite(img)
                frame.alpha_composite(img)
                done[k] = True
                continue
            e = 1 - (1 - p) ** 3
            tmp = img.copy()
            tmp.putalpha(tmp.getchannel("A").point(lambda v, e=e: int(v * e)))
            shifted = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            shifted.paste(tmp, (0, int((1 - e) * rise)))
            frame.alpha_composite(shifted)
        fd = ImageDraw.Draw(frame)
        fd.rectangle([0, 230, int(W * t / dur), 237], fill=WHITE)
        ff.stdin.write(frame.convert("RGB").tobytes())
    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg failed")
    try:
        os.remove(wav)
    except OSError:
        pass


if __name__ == "__main__":
    main()
