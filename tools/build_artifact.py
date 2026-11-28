#!/usr/bin/env python3
"""Make the copy of the app that runs inside Claude.

Usage: python3 tools/build_artifact.py OUT_DIR

Writes OUT_DIR/index.html (styles and scripts inlined, no document skeleton, as Claude's
artifact publisher expects) and copies data/ beside it. Inside Claude the page can ask
Claude a question on the viewer's own account; that permission is declared when the page
is published, never stored in this repository.
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
read = lambda p: open(os.path.join(ROOT, p), encoding="utf-8").read()

page = read("index.html")
body = re.search(r"<!--APP-->(.*)<!--/APP-->", page, re.S).group(1)
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com[^"]+)">', page).group(1)
scripts = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'\s*<script src="[^"]+"></script>', "", body)
js = ";\n".join(read(s).replace("</script", "<\\/script") for s in scripts)
html = f"""<title>Character Alchemy</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="{fonts}">
<style>
{read("css/app.css")}
</style>
{body.strip()}
<script>
{js}
</script>
"""
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
shutil.rmtree(os.path.join(out, "data"), ignore_errors=True)
shutil.copytree(os.path.join(ROOT, "data"), os.path.join(out, "data"))
print("wrote", os.path.join(out, "index.html"), len(html) // 1024, "KB, plus data/")
