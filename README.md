# Character Alchemy 煉字

Take the characters of 瑤池金母消愆解罪報恩功德懺 apart, see what each part brings, and put
the parts together again. It grew out of hand-copying the text: the question is no longer
only how a character is written, but what it is made of and why.

- **Text** – pages 1 to 8, line by line. Tap any character to take it apart.
- **A character taken apart** – the character drawn with each part in its own colour, where
  each part sits, which part gives the meaning and which only the sound, a way to read the
  picture, a Theosophical lens, the same parts arranged another way (忘 and 忙), and what
  happens when one part is changed (恩, 惡, 慈, 悲 all keep the heart underneath).
- **Parts** – about a hundred basic shapes. Each opens its family, grouped by where the shape
  sits: 心 underneath, 忄 at the left, inside, hidden one level down.
- **Combine** – choose two or three parts and see every character they make, arrangement by
  arrangement, including the arrangements that have no character.
- **Practise writing** – write the character stroke by stroke, over its outline or from
  memory. Each stroke is checked for place, direction and order, and the page says whether
  the whole character was written correctly. A free-hand pad is there too.
- **Hear it** – every character, word and line has recorded sound, stored with the app.
- **Ask Claude** – for what the page cannot know: what a missing arrangement would mean,
  whether a rare variant exists, a deeper reading.

279 characters from the text, 66 more chosen for a Theosophical reader, and about 7,000
Traditional characters behind them for the families and combinations.

## Two ways to open it

**Inside Claude.** The page is published as a Claude artifact. There, *Ask Claude* answers on
the page, using the viewer's own Claude account after asking permission once.

**From GitHub Pages**, as an app on a phone:

1. On GitHub, open **Settings → Pages**. Under *Build and deployment* choose **Deploy from a
   branch**, pick the branch that holds these files and the **/ (root)** folder, then save.
2. After a minute the app is live at `https://<your-user>.github.io/chinese-character-practice/`.
3. On an iPhone, open that address in Safari and tap **Share → Add to Home Screen**.

This copy has no connection to Claude, so *Ask Claude* becomes *Copy for Claude*: it copies
the question, with the facts from the card, ready to paste into a Claude chat.

## Does it need AI to run?

No. Taking characters apart, the families, the combinations, the writing check and the sound
are all plain JavaScript working on files in this repository. They work offline once the app
is on the Home Screen. Only the *Ask Claude* box involves AI, and only in the copy opened
inside Claude.

## No keys, no accounts

Nothing in this repository is secret and nothing needs to be. The app makes no network
calls except to load its own files and the web fonts. It does not hold an API key: inside
Claude the platform lends the page the viewer's own session, and outside Claude the page
does not call Claude at all. Notes you keep are saved in the browser on your device.

## What is hand-written and what is not

| File | What it holds |
| --- | --- |
| `content/text.json` | The text: lines, pinyin, translations, and each character's reading and meaning as used in the study book. Made by `tools/extract_text.py` from the book's page notes. |
| `content/readings.json` | Hand-written: how a character was formed (where the dictionary is thin or wrong), a way to read it, a Theosophical lens. |
| `content/elements.json` | Hand-written: the basic shapes, their variant forms, what each pictures. |
| `content/words.json` | Hand-written: Theosophical vocabulary. |
| `content/recipes.json`, `content/themes.json` | Starting points for *Combine*; the groups under *Beyond the text*. |
| `data/` | Built from the above plus Make Me a Hanzi (and the voice model for `data/audio/`). Do not edit by hand. |

The notes headed *A way to read it* and *Theosophical lens* are aids to memory and
contemplation. They are kept apart from *How it was formed* on purpose: most characters join
a part that gives the meaning with a part that only gives the sound, and a good picture is
not the same thing as a history.

## Adding to it

- A new page of the text: put the study book's `page-N.md` notes in a folder and run
  `python3 tools/extract_text.py NOTES_DIR BOOK_JSON`.
- A new reading: add the character to `content/readings.json`.
- Then rebuild the data: `python3 tools/build_data.py` (downloads Make Me a Hanzi once into
  `tools/.cache/`, which is not committed).
- Sound for a new syllable: `python3 tools/build_audio.py TTS_DIR` (the script's header says
  which open voice model to download; it runs on your own machine).
- To refresh the copy inside Claude: `python3 tools/build_artifact.py OUT_DIR`, then publish
  `OUT_DIR/index.html` with the files under `OUT_DIR/data/`.
- Change `VERSION` in `sw.js` whenever a file changes, so installed copies update.

To run locally: `python3 -m http.server` in this folder, then open `http://localhost:8000`.

Plain HTML, CSS and JavaScript; no build step for the app itself, and one small library kept in the repository.

| File | Purpose |
| --- | --- |
| `js/data.js` | Loads the dictionary, takes characters apart, finds families and combinations |
| `js/glyph.js` | Draws a character from its stroke outlines, one colour per part |
| `js/pad.js` | Free-hand pad |
| `js/sound.js` | Plays the recorded syllables |
| `js/vendor/hanzi-writer.min.js` | Checks each written stroke (Hanzi Writer 3.5.0) |
| `js/ask.js` | Ask Claude, or copy the question; notes kept on the device |
| `js/app.js` | Screens |
| `sw.js` | Offline cache for the GitHub Pages copy |

## Sources and licences

- Decompositions, formation notes and definitions: `dictionary.txt` from
  [Make Me a Hanzi](https://github.com/skishore/makemeahanzi), derived from Unihan and cjklib,
  under the GNU Lesser General Public License v3 or later.
- Stroke outlines: `graphics.txt` from the same project, derived from the Arphic PL KaitiM GB
  and Arphic PL UKai fonts, under the Arphic Public License.
- `data/dict.json` and `data/strokes/` are reduced copies of those two files and remain under
  those licences. Stroke order follows the mainland standard; a few characters differ under
  Taiwan's Ministry of Education standard.
- Stroke checking: [Hanzi Writer](https://github.com/chanind/hanzi-writer) by David Chanin,
  MIT licence (copy in `js/vendor/`).
- Sound: `data/audio/` was generated once with the open `matcha-icefall-zh-baker` voice from
  the sherpa-onnx project. That voice was trained on a Data Baker recording released for
  **non-commercial use only**, so keep the clips to personal study and do not sell anything
  that includes them.
- Which characters count as common Traditional characters is taken from the Big5 level-1 set.
