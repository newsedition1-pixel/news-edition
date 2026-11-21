#!/usr/bin/env python3
"""Daily X video: ask the site for today's story, render the video, upload it.

Runs inside the x-video GitHub Actions workflow. The run proves its identity with GitHub's OIDC token
(no secret to store). Nothing is posted unless the site answers with a story and accepts the MP4.
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

SITE = os.environ.get("SITE_URL", "https://newsedition.in").rstrip("/")
ENDPOINT = SITE + "/api/social/x-video"
HERE = os.path.dirname(os.path.abspath(__file__))


def oidc_token():
    base = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    sep = "&" if "?" in base else "?"
    req = urllib.request.Request(base + sep + "audience=" + urllib.parse.quote("https://newsedition.in", safe=""),
                                 headers={"Authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["value"]


def main():
    token = oidc_token()
    req = urllib.request.Request(ENDPOINT, headers={"Authorization": "Bearer " + token})
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
    spec_path = os.path.join(work, "spec.json")
    json.dump(spec, open(spec_path, "w", encoding="utf-8"), ensure_ascii=False)
    out = os.path.join(work, "video.mp4")
    subprocess.run([sys.executable, "-I", os.path.join(HERE, "make_reel.py"), spec_path, out], check=True)
    size = os.path.getsize(out)
    print("Rendered", size, "bytes")
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
