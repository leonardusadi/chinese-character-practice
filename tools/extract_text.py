#!/usr/bin/env python3
"""Pull the vocabulary out of the study book's page notes.

Usage: python3 tools/extract_text.py NOTES_DIR [BOOK_JSON]

NOTES_DIR holds the study book's master notes (page-1.md, page-2.md, ...).
BOOK_JSON is the book's book.json, whose "meanings" fill any gap.
Writes content/text.json: every line of the text with its pinyin, every
character with the reading and meaning used in the text and the page it first
appears on, the "Words worth remembering" and the "Shapes to slow down on".
"""
import json, os, re, sys, unicodedata

HAN = "[\u3400-\u9fff]"
TONE_CH = "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ"
SYL = re.compile(rf"[a-zA-Zü]*?[{TONE_CH}][aeiouü]*(?:ng|n|r)?(?![aeiouü{TONE_CH}])|[a-zA-Zü]+")


def split_py(line):
    out = []
    for w in re.sub(r"[.,;:!?。，、“”\"'()’]", " ", line).split():
        out += SYL.findall(w) if len(re.findall(f"[{TONE_CH}]", w)) > 1 else [w]
    return [unicodedata.normalize("NFC", w.lower()) for w in out]


def short(m):
    m = m.replace("*", "").strip()
    if m.startswith("("):
        m = m.strip("() ")
    m = re.sub(r"\([^)]*\)", "", m)
    m = re.split(r"[,;]", m)[0].strip()
    m = re.sub(r"^(to|the) ", "", m)
    return " ".join(m.split()[:4])


def gloss_entries(md):
    """'X *py* meaning' entries separated by ' / ', and | X | py | meaning | rows."""
    out = {}
    for ch, m in re.findall(rf"(?m)(?:^|/ )({HAN}) \*[^*]+\* ([^/\n]+?)(?= /|$)", md):
        out.setdefault(ch, m.replace("*", "").strip())
    for ch, m in re.findall(rf"(?m)^\| ({HAN}) \| [^|]+ \| ([^|]+) \|", md):
        out.setdefault(ch, m.replace("*", "").strip())
    return out


def main():
    notes_dir = sys.argv[1]
    book = json.load(open(sys.argv[2], encoding="utf-8")) if len(sys.argv) > 2 else {}
    book_mean = book.get("meanings", {})
    pages, chars, words, shapes = [], {}, [], {}
    files = sorted((f for f in os.listdir(notes_dir) if re.match(r"page-\d+\.md$", f)),
                   key=lambda f: int(re.findall(r"\d+", f)[0]))
    for f in files:
        raw = open(os.path.join(notes_dir, f), encoding="utf-8").read()
        meta = {}
        fm = re.match(r"---\n(.*?)\n---\n", raw, re.S)
        if fm:
            for line in fm.group(1).splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            raw = raw[fm.end():]
        n = int(meta["page"])
        fm_mean = {k.strip(): v.strip() for k, v in
                   (x.split("=", 1) for x in meta.get("meanings", "").split(";") if "=" in x)}
        page_gloss = gloss_entries(raw)
        lines, seen = [], set()
        for sec in re.split(r"(?m)^(?=## )", raw)[1:]:
            head = sec.splitlines()[0][3:].strip()
            m = re.search(rf"\*\*({HAN}[^*]*)\*\*\n\*([^*\n]+)\*", sec)
            if m:
                zh, pys = m.group(1), split_py(m.group(2))
                han = [c for c in zh if re.match(HAN, c)]
                if len(han) != len(pys):
                    sys.exit(f"page {n} '{head}': {len(han)} characters, {len(pys)} syllables")
                local = gloss_entries(sec)
                for c, p in zip(han, pys):
                    g = local.get(c) or page_gloss.get(c) or fm_mean.get(c) or book_mean.get(c, "")
                    e = chars.setdefault(c, {"py": p, "page": n, "gloss": "", "long": ""})
                    if g and not e["gloss"]:
                        e["gloss"], e["long"] = short(g), g
                    if p != e["py"] and p not in e.setdefault("also", []):
                        e["also"].append(p)
                if zh not in seen:
                    seen.add(zh)
                    tr = [t.strip() for t in re.findall(r"(?m)^\*\*Line \d:\*\* (.+)$", sec)]
                    if not tr:
                        tr = [t.strip() for t in re.findall(r"(?m)^\*\*Sense:\*\* \*?(.+?)\*?$", sec)]
                    if not tr:
                        tr = [t.strip("* ") for t in re.findall(r"(?m)^\*([A-Z][^*\n]{20,})\*$", sec)][:1]
                    lines.append({"head": re.sub(r"\*", "", head), "zh": zh, "py": " ".join(pys), "tr": tr})
            elif head.startswith("Words worth remembering"):
                for term, py, why in re.findall(r"(?m)^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$", sec):
                    if re.search(HAN, term):
                        words.append({"w": term.strip(), "py": py.strip(), "en": why.replace("*", "").strip(), "page": n})
            elif head.startswith("Shapes to slow down on"):
                for item in re.findall(r"(?m)^- (.+)$", sec):
                    lead = re.match(r"\*\*([^*]+)\*\*", item)
                    if not lead:
                        continue
                    note = re.sub(r"\*", "", item).strip()
                    for c in re.findall(HAN, lead.group(1)):
                        shapes.setdefault(c, []).append({"page": n, "note": note})
        pages.append({"n": n, "subtitle": re.sub(r"^Page \d+ · ", "", meta.get("subtitle", "")), "lines": lines})
    for c, e in chars.items():
        if not e["gloss"] and c in book_mean:
            e["gloss"] = e["long"] = book_mean[c]
    out = {"title": book.get("title", ""), "pages": pages, "chars": chars, "words": words, "shapes": shapes}
    dest = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content", "text.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    missing = [c for c, e in chars.items() if not e["gloss"]]
    print(f"{len(pages)} pages, {sum(len(p['lines']) for p in pages)} lines, {len(chars)} characters, "
          f"{len(words)} words, {len(shapes)} shape notes; no meaning: {''.join(missing) or 'none'}")


if __name__ == "__main__":
    main()
