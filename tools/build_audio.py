#!/usr/bin/env python3
"""Record one short clip for every Mandarin syllable the app can show.

Usage: python3 tools/build_audio.py TTS_DIR

TTS_DIR holds the open voice model and vocoder:
    matcha-icefall-zh-baker/   from github.com/k2-fsa/sherpa-onnx/releases (tts-models)
    voc.onnx                   vocos-22khz-univ.onnx from the same place (vocoder-models)
Needs: pip install sherpa-onnx soundfile, and ffmpeg.

Writes data/audio/NN.json: syllable (ma1, ma2 ...) -> base64 MP3. The clips are spoken once
here and stored; the app plays them back and never calls a speech service.
Run after tools/build_data.py.
"""
import base64, json, os, shutil, subprocess, sys, tempfile, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARDS = 32
TONES = {"̄": 1, "́": 2, "̌": 3, "̀": 4}


def numbered(py):
    """ēn -> en1, nǚ -> nv3, de -> de5"""
    d = unicodedata.normalize("NFD", py.lower().strip())
    tone, out = 5, ""
    for ch in d:
        if ch in TONES:
            tone = TONES[ch]
        elif ch == "̈":
            out = out[:-1] + "v"
        elif ch.isalpha():
            out += ch
    return out + str(tone) if out else ""


def shard(key):
    return sum(ord(ch) for ch in key) % SHARDS


def main():
    tts_dir = sys.argv[1]
    model = os.path.join(tts_dir, "matcha-icefall-zh-baker")
    first, by = {}, {}
    for line in open(os.path.join(model, "lexicon.txt"), encoding="utf-8"):
        p = line.split()
        if len(p) == 2 and len(p[0]) == 1 and p[0] not in first:
            first[p[0]] = p[1]
            by.setdefault(p[1] if p[1][-1].isdigit() else p[1] + "5", p[0])   # the voice writes neutral tone bare

    core = json.load(open(os.path.join(ROOT, "data", "core.json"), encoding="utf-8"))
    dic = json.load(open(os.path.join(ROOT, "data", "dict.json"), encoding="utf-8"))
    need = set()
    for rec in dic.values():
        for py in rec[0].split(", "):
            need.add(numbered(py))
    for e in core["chars"].values():
        need.update(numbered(p) for p in [e["py"]] + e.get("also", []))
    for e in core["elements"]:
        need.add(numbered(e["py"]))
    for r in core["readings"].values():
        if r.get("py"):
            need.add(numbered(r["py"]))
    for page in core["pages"]:
        for ln in page["lines"]:
            need.update(numbered(p) for p in ln["py"].split())
    for w in core["words"]:
        need.update(numbered(p) for p in w.get("syl", []))
    need.discard("")

    import sherpa_onnx, soundfile as sf
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(
            acoustic_model=os.path.join(model, "model-steps-3.onnx"), vocoder=os.path.join(tts_dir, "voc.onnx"),
            lexicon=os.path.join(model, "lexicon.txt"), tokens=os.path.join(model, "tokens.txt"),
            dict_dir=os.path.join(model, "dict")),
        num_threads=4)))
    out = [dict() for _ in range(SHARDS)]
    missing = []
    tmp = tempfile.mkdtemp()
    for i, key in enumerate(sorted(need)):
        ch = by.get(key)
        if not ch:
            missing.append(key)
            continue
        a = tts.generate(ch, sid=0, speed=1.0)
        wav, mp3 = os.path.join(tmp, "a.wav"), os.path.join(tmp, "a.mp3")
        sf.write(wav, a.samples, a.sample_rate)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", "adelay=80:all=1,apad=pad_dur=0.12",
                        "-ac", "1", "-ar", "22050", "-c:a", "libmp3lame", "-b:a", "32k", mp3], check=True)
        out[shard(key)][key] = base64.b64encode(open(mp3, "rb").read()).decode()
        if i % 200 == 0:
            print(i, "of", len(need), flush=True)
    shutil.rmtree(tmp)
    adir = os.path.join(ROOT, "data", "audio")
    shutil.rmtree(adir, ignore_errors=True)
    os.makedirs(adir)
    total = 0
    for i, s in enumerate(out):
        p = os.path.join(adir, f"{i:02x}.json")
        json.dump(s, open(p, "w", encoding="utf-8"), separators=(",", ":"))
        total += os.path.getsize(p)
    print(f"{sum(len(s) for s in out)} clips in {SHARDS} files, {total // 1024} KB")
    print("no clip for:", " ".join(missing) or "none")


if __name__ == "__main__":
    main()
