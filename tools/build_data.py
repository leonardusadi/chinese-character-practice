#!/usr/bin/env python3
"""Build the app's data files.

Usage: python3 tools/build_data.py

Reads   content/*.json                 (the text's vocabulary and the hand-written notes)
        tools/.cache/dictionary.txt    (Make Me a Hanzi; downloaded on first run)
        tools/.cache/graphics.txt
Writes  data/core.json                 everything hand-written, loaded first
        data/dict.json                 one record per character: reading, meaning, parts, origin
        data/strokes/NN.json           stroke outlines, each stroke tagged with the part it belongs to

Nothing here needs a key or an account. The two downloads are public files.
"""
import json, os, shutil, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
SRC = "https://raw.githubusercontent.com/skishore/makemeahanzi/master/"
OPS = "⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻"
SHARDS = 128


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.isfile(path):
        print("downloading", name)
        urllib.request.urlretrieve(SRC + name, path)
    return path


def big5_level(c):
    """1 = common Traditional character, 2 = less common, 0 = not a Traditional-set character."""
    try:
        b = c.encode("big5")
    except UnicodeEncodeError:
        return 0
    return 1 if 0xA4 <= b[0] <= 0xC6 else 2


def big5_order(c):
    try:
        return int.from_bytes(c.encode("big5"), "big")
    except UnicodeEncodeError:
        return 0x10000 + ord(c)


def load(name):
    return json.load(open(os.path.join(ROOT, "content", name), encoding="utf-8"))


def clean(s):
    return " ".join((s or "").replace("\xa0", " ").split())


def main():
    text = load("text.json")
    elements = load("elements.json")
    readings = load("readings.json")
    words = load("words.json")
    recipes = load("recipes.json")
    themes = load("themes.json")
    extra = load("extra_chars.json")

    mmah = {}
    for line in open(fetch("dictionary.txt"), encoding="utf-8"):
        d = json.loads(line)
        mmah[d["character"]] = d

    # ---- which characters the app knows about
    wanted = {c for c in mmah if big5_level(c)}
    wanted |= set(text["chars"]) | set(readings) | set(extra)
    for t in themes:
        wanted |= set(t["chars"])
    for e in elements:
        wanted |= set(e["forms"])
    for w in words:
        wanted |= {c for c in w["w"] if "㐀" <= c <= "鿿"}
    todo = list(wanted)
    while todo:                                   # every part of a wanted character is wanted too
        c = todo.pop()
        ids = extra[c][2] if c in extra else mmah.get(c, {}).get("decomposition", "")
        for x in ids:
            if x not in OPS and x != "？" and x not in wanted:
                wanted.add(x)
                todo.append(x)

    records, order = {}, {}
    for c in wanted:
        if c in extra:
            records[c] = extra[c]
            continue
        d = mmah.get(c)
        if not d:
            continue
        et = d.get("etymology") or {}
        kind = {"pictophonetic": "p", "ideographic": "i", "pictographic": "g"}.get(et.get("type"), "")
        if kind == "p":
            origin = "\t".join(["p", et.get("phonetic") or "", et.get("semantic") or "", clean(et.get("hint"))])
        elif kind:
            origin = kind + "\t" + clean(et.get("hint"))
        else:
            origin = ""
        ids = d["decomposition"]
        if ids == c or ids.startswith("？"):
            ids = ""
        records[c] = [", ".join(d["pinyin"][:2]), clean(d.get("definition"))[:90], ids, origin, big5_level(c)]
    missing = sorted(c for c in wanted if c not in records)

    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "dict.json"), "w", encoding="utf-8") as f:
        keys = sorted(records, key=big5_order)      # common characters first, simplest strokes first
        f.write("{\n")
        f.write(",\n".join(json.dumps(c, ensure_ascii=False) + ":" +
                           json.dumps(records[c], ensure_ascii=False, separators=(",", ":")) for c in keys))
        f.write("\n}\n")

    # ---- stroke outlines for the common characters, tagged by part
    need = {c for c in records if records[c][4] == 1} | set(text["chars"]) | set(readings)
    for t in themes:
        need |= set(t["chars"])
    for e in elements:
        need |= set(e["forms"])
    shards = [dict() for _ in range(SHARDS)]
    have = set()
    for line in open(fetch("graphics.txt"), encoding="utf-8"):
        g = json.loads(line)
        c = g["character"]
        if c not in need:
            continue
        m = mmah[c].get("matches") or []
        tags = " ".join("-" if p is None else ("".join(str(i) for i in p) or "-") for p in m)
        shards[ord(c) % SHARDS][c] = [g["strokes"], tags]
        have.add(c)
    sdir = os.path.join(ROOT, "data", "strokes")
    shutil.rmtree(sdir, ignore_errors=True)
    os.makedirs(sdir)
    total = 0
    for i, s in enumerate(shards):
        p = os.path.join(sdir, f"{i:02x}.json")
        json.dump(s, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        total += os.path.getsize(p)

    core = {
        "title": text["title"], "pages": text["pages"], "chars": text["chars"], "shapes": text["shapes"],
        "words": text["words"] + words, "elements": elements, "readings": readings,
        "recipes": recipes, "themes": themes, "shards": SHARDS,
    }
    json.dump(core, open(os.path.join(ROOT, "data", "core.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    kb = lambda p: os.path.getsize(os.path.join(ROOT, "data", p)) // 1024
    print(f"dict.json: {len(records)} characters, {kb('dict.json')} KB")
    print(f"core.json: {len(text['chars'])} text characters, {len(readings)} readings, "
          f"{len(elements)} elements, {len(core['words'])} words, {kb('core.json')} KB")
    print(f"strokes: {len(have)} characters in {SHARDS} files, {total // 1024} KB")
    print("no dictionary entry:", "".join(missing) or "none")
    print("no stroke outline:", "".join(sorted(c for c in need if c not in have)) or "none")
    bad = [c for c in list(readings) + [c for t in themes for c in t["chars"]] if c not in records]
    if bad:
        sys.exit("content refers to unknown characters: " + "".join(bad))


if __name__ == "__main__":
    main()
