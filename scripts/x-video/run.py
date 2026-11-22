#!/usr/bin/env python3
"""Daily X video: ask the site for today's story, render the video, upload it.

Runs inside the x-video GitHub Actions workflow. The run proves its identity with GitHub's OIDC token
(no secret to store). Nothing is posted unless the site answers with a story and accepts the MP4.
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

SITE = os.environ.get("SITE_URL", "https://newsedition.in").rstrip("/")
ENDPOINT = SITE + "/api/social/x-video"
HERE = os.path.dirname(os.path.abspath(__file__))
# XVIDEO_TEST=1 (workflow started by hand with "test"): render the video, keep it as x-video-test.mp4 and post nothing.
TEST = os.environ.get("XVIDEO_TEST") == "1"
# The video grows to fit the voice (make_reel.py: up to 24 s); a longer narration is sped up a little, or dropped.
VOICE_MAX_S = 21.5


def oidc_token():
    base = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    sep = "&" if "?" in base else "?"
    req = urllib.request.Request(base + sep + "audience=" + urllib.parse.quote("https://newsedition.in", safe=""),
                                 headers={"Authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["value"]


def media_seconds(path):
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                           capture_output=True, text=True)
    try:
        return float(probe.stdout.strip())
    except ValueError:
        return 0.0


def fit_voice(path, work):
    """The narration as an MP3 that fits the video, or None (the video then has music only)."""
    secs = media_seconds(path)
    print("Voice:", round(secs, 1), "s")
    if secs < 2:
        print("The voice track is too short; music only.")
        return None
    if secs <= VOICE_MAX_S:
        return path
    tempo = secs / (VOICE_MAX_S - 0.5)
    if tempo > 1.25:
        print("The voice track is too long even sped up; music only.")
        return None
    fast = os.path.join(work, "voice-fast.mp3")
    done = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-filter:a", "atempo=%.3f" % tempo, fast])
    if done.returncode != 0:
        return None
    print("Voice sped up x%.2f to fit." % tempo)
    return fast


def cues(spec, voice_s):
    """When each point, the source line and the call to action appear, so that the text shows as it is spoken.

    The narrator reads the headline and the points in order, after a 0.6 s lead-in. Where each sentence starts is
    estimated from its share of the words (a pause counts as a little over one word).
    """
    parts = [spec["headline"]] + list(spec["points"][:3])
    weights = [len(t.split()) + 1.2 for t in parts]
    total = sum(weights)
    starts, run = [], 0.0
    for w in weights:
        starts.append(0.6 + voice_s * run / total)
        run += w
    pts = []
    for i in range(1, len(parts)):
        t = max(starts[i] - 0.25, (pts[-1] + 1.2) if pts else 2.8)  # the text shows just before it is read
        pts.append(round(t, 2))
    end = 0.6 + voice_s
    return {"points": pts, "source": round(max(pts[-1] + 1.5, end - 1.4), 2), "cta": round(max(pts[-1] + 2.2, end - 0.5), 2)}


def render(spec, work, out, voice):
    """Runs make_reel.py (isolated mode). A failed mix with the voice is retried without it: a video with music only beats none."""
    base = [sys.executable, "-I", os.path.join(HERE, "make_reel.py")]
    plain = os.path.join(work, "spec.json")
    json.dump(spec, open(plain, "w", encoding="utf-8"), ensure_ascii=False)
    if voice:
        timed = os.path.join(work, "spec-voice.json")
        json.dump({**spec, "timing": cues(spec, media_seconds(voice))}, open(timed, "w", encoding="utf-8"), ensure_ascii=False)
        print("Cues:", json.dumps(json.load(open(timed, encoding="utf-8"))["timing"]))
        if subprocess.run(base + [timed, out, voice]).returncode == 0:
            return True
        print("Rendering with the voice failed; trying without it.")
    return subprocess.run(base + [plain, out]).returncode == 0


def main():
    token = oidc_token()
    req = urllib.request.Request(ENDPOINT + ("?test=1" if TEST else ""), headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=120) as r:
        answer = json.load(r)
    if "skip" in answer:
        print("Nothing to post today:", answer["skip"])
        return 0
    cand = answer["candidate"]
    print("Story:", cand["slug"])
    work = tempfile.mkdtemp(prefix="xvideo-")
    photo = os.path.join(work, "photo.jpg")
    with urllib.request.urlopen(urllib.request.Request(cand["photoUrl"], headers={"User-Agent": "NewsEditionVideo/1.0"}), timeout=30) as r:
        data = r.read()
    if not data.startswith(b"\xff\xd8"):
        print("The cover is not a JPEG; no video today.")
        return 0
    open(photo, "wb").write(data)
    spec = dict(cand["spec"])
    spec["photo"] = photo
    spec["photo_credit"] = cand["photoCredit"]
    voice = None
    v = cand.get("voice") or {}
    if v.get("mp3Base64"):
        raw = os.path.join(work, "voice.mp3")
        open(raw, "wb").write(base64.b64decode(v["mp3Base64"]))
        voice = fit_voice(raw, work)
        print("Narration:", v.get("text", ""))
    else:
        print("No voice from the site; music only.")
    out = os.path.join(work, "video.mp4")
    if not render(spec, work, out, voice):
        print("The video could not be rendered.")
        return 1
    size = os.path.getsize(out)
    if voice and size > 4 * 1024 * 1024:
        # X takes the file only up to the site's 4 MB limit; the shorter music-only cut is smaller.
        print("The video with the voice is", size, "bytes; rendering the music-only cut instead.")
        voice = None
        if not render(spec, work, out, None):
            print("The video could not be rendered.")
            return 1
        size = os.path.getsize(out)
    print("Rendered", size, "bytes,", round(media_seconds(out), 1), "s, voice:", "yes" if voice else "no")
    if TEST:
        kept = os.path.join(os.getcwd(), "x-video-test.mp4")
        shutil.copyfile(out, kept)
        print("Test run: kept", kept, "and posted nothing.")
        return 0
    if size > 4 * 1024 * 1024:
        print("The video is larger than 4 MB; not uploaded.")
        return 1
    # curl builds the multipart body; the token is fetched again in case the first one has aged.
    result = subprocess.run(
        ["curl", "-sS", "--max-time", "120", "-w", "\n%{http_code}", "-H", "Authorization: Bearer " + oidc_token(),
         "-F", "slug=" + cand["slug"], "-F", "video=@" + out + ";type=video/mp4", ENDPOINT],
        capture_output=True, text=True)
    body, _, code = result.stdout.rpartition("\n")
    print(code, body)
    return 0 if code == "200" else 1


if __name__ == "__main__":
    sys.exit(main())
