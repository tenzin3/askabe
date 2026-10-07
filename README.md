# AnswerMe: Ask Mr. Lincoln

An animated Abraham Lincoln who answers your questions **only with words he actually spoke or wrote**, each shown with its date, place and source.

- **Avatar:** an original SVG portrait that blinks, sways and moves its mouth while speaking.
- **Voice:** the browser's built-in text-to-speech (Web Speech API). Voice input works in Chrome, Edge and Safari.
- **Search:** runs entirely in the browser (BM25 keyword ranking with topic tags and synonyms). No server, no API keys, no cost.
- **Honesty rules:** the quotation is always verbatim. The italic lead-in ("At Gettysburg, on November 19, 1863, I said:") is written by the app. If nothing matches, Lincoln says he has nothing on record rather than inventing an answer.

## Run it locally

Browsers block `fetch` from `file://`, so serve the folder:

```bash
cd answerme
python3 -m http.server 8000
# open http://localhost:8000
```

Tip: `http://localhost:8000/?q=What is democracy?` asks a question on load.

## Deploy for free (GitHub Pages)

1. Push this folder to a GitHub repo (branch `main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` deploys via `.github/workflows/pages.yml`. The site appears at `https://<you>.github.io/<repo>/`.

## The quotes

`data/lincoln.json` holds 53 hand-picked passages from Lincoln's speeches, letters and messages (1832–1865), from *The Collected Works of Abraham Lincoln* (public domain). Each entry has:

| field | meaning |
|---|---|
| `text` | the verbatim quotation |
| `work`, `kind` | e.g. "Gettysburg Address", `speech` / `letter` / `debate` / `message` / `writing` / `proclamation` |
| `date`, `date_precision` | ISO date; `approximate` for undated notes |
| `place` | where it was said or written |
| `intro` | the app's lead-in line (not a quotation) |
| `topics` | tags that help search match everyday questions |
| `note` | optional historical context |

The set intentionally includes uncomfortable passages (such as the 1858 Charleston debate remarks on race) alongside his later views, so the record is not sanitized.

Commonly shared lines with no reliable source, such as "You can fool all the people some of the time…" and "Don't believe everything you read on the internet", are left out on purpose.

### Add more quotes from Wikiquote

```bash
pip install requests beautifulsoup4
python scripts/collect_wikiquote.py --page Abraham_Lincoln --out data/wikiquote_lincoln.json
```

Or run the **Collect Wikiquote quotes** workflow from the repo's Actions tab, and it commits the file for you. The app automatically merges `data/wikiquote_lincoln.json` if it exists, skips duplicates, and credits Wikiquote (CC BY-SA 4.0). The collector skips the "Disputed", "Misattributed" and "Quotes about" sections.

## Project layout

```
index.html                 page + inline SVG portrait
css/style.css              styles (light and dark)
js/app.js                  question → answer flow, transcript, mic
js/search.js               in-browser BM25 search
js/avatar.js               blinking, swaying, lip movement
js/voice.js                text-to-speech with chunking
data/lincoln.json          curated quotes
scripts/collect_wikiquote.py
.github/workflows/         Pages deploy + quote collection
```

## Ideas for next steps

- Swap BM25 for semantic search with [transformers.js](https://huggingface.co/docs/transformers.js) embeddings, which needs no server.
- Add more figures (Mark Twain, Frederick Douglass, Benjamin Franklin) with the same data format.
- Add a "quote check" mode: paste a quote, and see whether it's in the sourced record.
