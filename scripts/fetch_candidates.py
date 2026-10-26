#!/usr/bin/env python3
"""Gather candidate passages for the daily media-quote review.

Reads the BBC Business RSS feed, the Economist section feeds and the think-tank feeds, fetches the BBC and
think-tank article bodies, and writes data/candidates.json: one entry per article with title, URL, date, source
and paragraphs. Press items are kept for --days (default 14); think-tank items for --tt-days (default 60),
since analysis is published less often and dates more slowly.
CNBC's feeds and article pages refuse automated readers from cloud addresses; the daily job adds
CNBC items through the news reader on the owner's computer (see the job prompt) and appends them
to the same file before the review step.

Usage:  python scripts/fetch_candidates.py [--days 14] [--tt-days 60] [--out data/candidates.json]
"""
import argparse, datetime as dt, email.utils, html, json, re, sys, time, urllib.request
from pathlib import Path

UA = {"User-Agent": "Mozilla/5.0 (compatible; operative-data-board/1.0)"}
FEEDS = {
    "BBC Business": ["https://feeds.bbci.co.uk/news/business/rss.xml"],
    "The Economist": [
        "https://www.economist.com/finance-and-economics/rss.xml",
        "https://www.economist.com/britain/rss.xml",
        "https://www.economist.com/leaders/rss.xml",
        "https://www.economist.com/business/rss.xml",
        "https://www.economist.com/middle-east-and-africa/rss.xml",
        "https://www.economist.com/international/rss.xml",
    ],
    # think tanks: full article text is readable, so whole paragraphs can be quoted
    "NIESR": ["https://niesr.ac.uk/feed"],
    "Resolution Foundation": ["https://www.resolutionfoundation.org/feed/"],
    "Institute for Government": ["https://www.instituteforgovernment.org.uk/rss.xml"],
    "LSE British Politics and Policy": ["https://blogs.lse.ac.uk/politicsandpolicy/feed/"],
    "Oxford Economics": ["https://www.oxfordeconomics.com/feed/"],
    "Bruegel": ["https://www.bruegel.org/rss.xml"],
    "Tax Foundation": ["https://taxfoundation.org/feed/"],
}
PRESS = {"BBC Business", "CNBC Economy", "The Economist"}
# Any article matching none of these terms is dropped before review (saves the reviewer's time).
TOPIC = re.compile(r"inflation|price|gdp|econom|growth|recession|unemploy|jobs|labour|labor|wage|pay\b|earnings|population|migration|bank of england|bank rate|interest rate|mpc|gilt|bond|yield|borrow|budget|chancellor|healey|obr|deficit|debt|tax|oil|brent|crude|gas\b|lng|energy|opec|hormuz|iran|gulf|saudi|houthi|ecb|lagarde|euro zone|eurozone|\bfed\b|federal reserve|fomc|warsh|treasury|productiv|\bai\b|food|wheat|fertili|commodit|tariff|trade|china shock|section 232|section 301", re.I)

def get(url, tries=3, timeout=40):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                print("fetch failed", url, e, file=sys.stderr); return ""
            time.sleep(3 * (i + 1))

def clean(s):
    return html.unescape(re.sub(r"<!\[CDATA\[|\]\]>|<[^>]+>", "", s or "")).strip()

def parse_feed(xml):
    for it in re.findall(r"<item>(.*?)</item>", xml, re.S):
        title = clean((re.search(r"<title>(.*?)</title>", it, re.S) or [None, ""])[1])
        link = (re.search(r"<link>(.*?)</link>", it, re.S) or re.search(r"<guid[^>]*>(.*?)</guid>", it) or [None, ""])[1].strip().split("?")[0]
        pub = re.search(r"<pubDate>(.*?)</pubDate>", it)
        date = email.utils.parsedate_to_datetime(pub.group(1)).astimezone(dt.timezone.utc) if pub else None
        desc = clean((re.search(r"<description>(.*?)</description>", it, re.S) or [None, ""])[1])
        yield {"title": title, "url": link, "date": date.strftime("%Y-%m-%d") if date else "", "standfirst": desc, "_dt": date}

def bbc_paragraphs(url):
    s = get(url)
    s = re.sub(r"</?(a|span|strong|em|b|i|u|sup|sub)\b[^>]*>", "", s)   # inline tags carry no whitespace
    ps = re.findall(r'<p class="[^"]*Paragraph[^"]*"[^>]*>(.*?)</p>', s, re.S)
    out = [re.sub(r", external\b", "", clean(p)) for p in ps]   # drop the BBC's hidden "external link" label
    return [p for p in out if p and not p.startswith("Copyright ©")]

def generic_paragraphs(url):
    """Paragraphs of a think-tank article: every <p> of 60+ characters outside script/style/nav/footer blocks."""
    s = get(url)
    s = re.sub(r"<(script|style|nav|footer|header|aside)\b.*?</\1>", " ", s, flags=re.S | re.I)
    s = re.sub(r"</?(a|span|strong|em|b|i|u|sup|sub)\b[^>]*>", "", s)
    ps = [clean(p) for p in re.findall(r"<p\b[^>]*>(.*?)</p>", s, re.S)]
    return [re.sub(r"\s+", " ", p) for p in ps if len(p) >= 60]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--days", type=int, default=14); ap.add_argument("--tt-days", type=int, default=60); ap.add_argument("--out", default="data/candidates.json")
    a = ap.parse_args()
    now = dt.datetime.now(dt.timezone.utc)
    cutoffs = {src: now - dt.timedelta(days=a.days if src in PRESS else a.tt_days) for src in FEEDS}
    seen, out = set(), []
    for source, urls in FEEDS.items():
        for fu in urls:
            xml = get(fu)
            for item in parse_feed(xml):
                if not item["url"] or item["url"] in seen: continue
                if item["_dt"] and item["_dt"] < cutoffs[source]: continue
                if not TOPIC.search(item["title"] + " " + item["standfirst"]): continue
                seen.add(item["url"])
                entry = {"source": source, "title": item["title"], "url": item["url"], "date": item["date"], "standfirst": item["standfirst"]}
                if source == "BBC Business":
                    entry["paragraphs"] = bbc_paragraphs(item["url"]); time.sleep(0.5)
                    entry["text_access"] = "full article text"
                elif source == "The Economist":
                    entry["paragraphs"] = []
                    entry["text_access"] = "feed headline and standfirst only (site refuses automated readers)"
                else:
                    entry["paragraphs"] = generic_paragraphs(item["url"]); time.sleep(0.5)
                    entry["text_access"] = "full article text"
                out.append(entry)
    out.sort(key=lambda e: e["date"], reverse=True)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump({"generated_at": now.strftime("%Y-%m-%dT%H:%MZ"), "window_days": {"press": a.days, "think_tanks": a.tt_days}, "articles": out}, open(a.out, "w"), ensure_ascii=False, indent=1)
    print(f"wrote {a.out}: {len(out)} candidate articles ({sum(1 for e in out if e['paragraphs'])} with full text)")

if __name__ == "__main__":
    main()
