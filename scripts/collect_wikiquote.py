"""
Collect a person's quotes from English Wikiquote into the app's JSON format.

Keeps only quotes BY the person: skips "Quotes about", "Disputed",
"Misattributed", "See also", etc. Each quote's nested bullet on Wikiquote is
its source line (speech, letter, date), which we keep.

Usage:
    pip install requests beautifulsoup4
    python scripts/collect_wikiquote.py --page Abraham_Lincoln --out data/wikiquote_lincoln.json

The web app automatically merges data/wikiquote_lincoln.json (if present)
with the hand-checked data/lincoln.json. Wikiquote text is CC BY-SA 4.0.
"""

import argparse
import json
import re

import requests
from bs4 import BeautifulSoup

API = "https://en.wikiquote.org/w/api.php"
HEADERS = {"User-Agent": "AskAbe/0.1 (https://github.com/tenzin3/askabe; quote collector)"}

SKIP_SECTIONS = (
    "about", "misattributed", "disputed", "see also", "external links",
    "references", "sources", "attributed", "unsourced",
)
MAX_CHARS = 700  # skip very long excerpts; avatar answers should be speakable


def api_get(params):
    params = {**params, "format": "json", "formatversion": 2}
    r = requests.get(API, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def clean(text):
    text = re.sub(r"\[\d+\]", "", text)
    return " ".join(text.split())


def heading_info(el):
    if el.name in ("h2", "h3", "h4"):
        h = el
    elif el.name == "div" and "mw-heading" in (el.get("class") or []):
        h = el.find(["h2", "h3", "h4"])
        if h is None:
            return None
    else:
        return None
    return h.name, clean(h.get_text(" ", strip=True))


def find_year(*texts):
    for t in texts:
        if t:
            m = re.search(r"\b(1[5-9]\d\d|20\d\d)\b", t)
            if m:
                return int(m.group(1))
    return None


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower())[:40].strip("-")


def extract(html, page):
    root = BeautifulSoup(html, "html.parser").select_one(".mw-parser-output")
    h2 = h3 = None
    out = []
    for el in root.find_all(recursive=False):
        h = heading_info(el)
        if h:
            level, text = h
            if level == "h2":
                h2, h3 = text, None
            else:
                h3 = text
            continue
        if el.name != "ul" or h2 is None:
            continue
        sections = f"{h2} {h3 or ''}".lower()
        if any(s in sections for s in SKIP_SECTIONS):
            continue
        for li in el.find_all("li", recursive=False):
            nested = li.find("ul")
            source = None
            if nested:
                source = clean(nested.get_text(" ", strip=True)) or None
                nested.extract()
            text = clean(li.get_text(" ", strip=True))
            if not text or len(text) > MAX_CHARS:
                continue
            year = find_year(source, h3, h2)
            out.append({
                "id": f"wq-{len(out)}-{slug(text)}",
                "text": text,
                "work": source or (h3 or h2),
                "kind": "wikiquote",
                "date": f"{year}-01-01" if year else None,
                "date_precision": "year" if year else None,
                "place": None,
                "intro": None,
                "topics": [],
                "origin": f"https://en.wikiquote.org/wiki/{page}",
                "license": "CC BY-SA 4.0 (Wikiquote)",
            })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", default="Abraham_Lincoln")
    ap.add_argument("--out", default="data/wikiquote_lincoln.json")
    args = ap.parse_args()

    html = api_get({"action": "parse", "page": args.page, "prop": "text", "redirects": 1})["parse"]["text"]
    quotes = extract(html, args.page)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"source": f"https://en.wikiquote.org/wiki/{args.page}", "quotes": quotes},
                  f, ensure_ascii=False, indent=2)
    print(f"Saved {len(quotes)} quotes to {args.out}")


if __name__ == "__main__":
    main()
