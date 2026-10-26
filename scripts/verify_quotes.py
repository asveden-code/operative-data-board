#!/usr/bin/env python3
"""Verify quotes.json and (re)build each quote's text-fragment link.

For every quote: the article page is fetched (BBC and the think tanks) and each quoted paragraph must appear
in it, allowing for whitespace differences and the BBC's hidden "external link" labels; CNBC and Economist
entries are headline + standfirst and are checked against the current feed data held in data/candidates.json,
since those sites refuse automated readers. Quotes that fail are
removed and reported. Links use the W3C text fragment syntax: #:~:text=<start>[,<end>].

Usage:  python scripts/verify_quotes.py quotes.json data/candidates.json
"""
import json, re, sys, urllib.parse, urllib.request, html, time

def enc(s):  # percent-encode, including the characters that carry meaning inside a text directive
    return urllib.parse.quote(s, safe="").replace("-", "%2D").replace(",", "%2C").replace("&", "%26")
def fragment(url, text):
    t = text.strip()
    if len(t) <= 160: return f"{url}#:~:text={enc(t)}"
    w = t.split(" "); return f"{url}#:~:text={enc(' '.join(w[:7]))},{enc(' '.join(w[-7:]))}"
def norm(s): return re.sub(r"\s+", " ", re.sub(r", external\b", "", html.unescape(s))).strip()  # BBC's hidden "external link" label is not visible text
def page_text(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; operative-data-board/1.0)"}), timeout=40) as r:
            s = r.read().decode("utf-8", "replace")
    except Exception as e:
        return None
    s = re.sub(r"</?(a|span|strong|em|b|i|u|sup|sub)\b[^>]*>", "", s)   # inline tags: no whitespace inserted
    return norm(re.sub(r"<[^>]+>", " ", s))

FEED_ONLY = {"CNBC Economy", "The Economist"}   # sites that refuse automated readers: headline + standfirst only

def main(qpath, cpath):
    q = json.load(open(qpath)); cands = json.load(open(cpath))["articles"] if cpath else []
    cands_by_url = {c["url"]: c for c in cands}
    cache, removed, kept = {}, [], 0
    for ind, items in q["quotes"].items():
        good = []
        for it in items:
            pieces = [norm(p) for p in (it.get("pieces") or it["quote"].split(" […] "))]   # each paragraph is checked on its own (sub-headings may sit between them)
            ok = False
            if it["source"] not in FEED_ONLY:
                if it["url"] not in cache: cache[it["url"]] = page_text(it["url"]); time.sleep(0.4)
                txt = cache[it["url"]]
                ok = txt is not None and all(p in txt for p in pieces)
                it["verified"] = "page text" if ok else "failed"
            else:
                c = cands_by_url.get(it["url"])
                ok = c is not None and norm(it.get("headline","")) == norm(c["title"]) and norm(it.get("standfirst","")) == norm(c["standfirst"])
                it["verified"] = "publisher feed" if ok else "failed"
            if ok:
                if it["source"] in FEED_ONLY: it["link"] = fragment(it["url"], it["headline"])
                elif len(pieces) == 1: it["link"] = fragment(it["url"], pieces[0])
                else:  # range from the start of the first paragraph to the end of the last
                    w0, w1 = pieces[0].split(" "), pieces[-1].split(" ")
                    it["link"] = f"{it['url']}#:~:text={enc(' '.join(w0[:7]))},{enc(' '.join(w1[-7:]))}"
                good.append(it); kept += 1
            else:
                removed.append((ind, it["source"], it["title"][:60]))
        good.sort(key=lambda x: (x.get("tag") is not None, x["date"]), reverse=True)   # exceptional developments first, then newest
        q["quotes"][ind] = good[:7]
    json.dump(q, open(qpath, "w"), ensure_ascii=False, indent=1)
    print(f"kept {kept}, removed {len(removed)}")
    for r in removed: print("  removed:", r)
    return 0 if not removed else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
