# Daily media-quote review — job instructions

You are refreshing the "In the media and think tanks" blocks of the Operative Data and Prediction Markets board.
Work in the repository checkout. Steps:

1. `python scripts/fetch_candidates.py --days 14 --tt-days 60` → writes `data/candidates.json`:
   - BBC Business, with full article text (paragraphs);
   - The Economist, headline + standfirst only;
   - the think tanks, with full article text: NIESR, Resolution Foundation, Institute for Government, LSE British
     Politics and Policy, Oxford Economics, Bruegel, Tax Foundation. Bruegel's feed is sparse; also open
     https://www.bruegel.org/analysis and add any analysis piece from the last 60 days on bond yields, the ECB, energy
     or France's public finances by fetching its page and extracting its paragraphs the same way (the date is in the
     page header, not the listing — check it).
   If a news-reader tool on the owner's computer is available, also fetch CNBC's Economy (id 20910258), Energy
   (19836768) and Europe (19794221) RSS feeds through it and append each item to `data/candidates.json` as
   `{"source":"CNBC Economy","title","url","date","standfirst","paragraphs":[],"text_access":"feed headline and
   standfirst only"}`. Do not try to fetch CNBC or Economist article pages: both refuse automated readers, and
   circumventing that is out of bounds. The same applies to IFS, OBR, Chatham House and OIES pages, which refuse cloud
   readers; they are not in the perimeter for that reason.
2. Read `data/quotes.json` (yesterday's selection) and `data/candidates.json`. For each indicator key
   (gdp, unemp, pop, earn, boe, cpi, gilt, brent, gas, gulf, ecb, fed, ust, tfp, food, fiscal, tariff) decide the
   new set of at most seven passages. Judge each candidate on these things, in this order:
   - Relevance: does it substantially explain the current trend in this indicator, give an expectation or forecast
     for it, or signal a change in it or in a factor that could move it (a data release, a policy decision, a supply
     shock, a forecast revision)? Think-tank passages are wanted precisely for the explanation and the expectation:
     a paragraph that sets out the mechanism with numbers, or states what the institute expects and why. Colour,
     personalities and politics without an economic mechanism do not qualify; nor does a think tank's policy
     recommendation on its own ("the Chancellor should…") unless the same paragraph carries the analysis behind it.
   - Recency: prefer the newest passage when two say the same thing; drop press items older than 14 days and
     think-tank items older than 60 days, and drop a passage that newer data has overtaken (yesterday's release beats
     last week's preview of it; a forecast superseded by the same institute's newer forecast goes).
   - Self-containment and length: the passage must make sense with nothing around it. No opening "It", "This",
     "He" or "the cuts" whose referent is in an earlier sentence; include the preceding sentence instead. Quote
     whole paragraphs, not clipped sentences: the target is roughly 300–1,200 characters, with the concrete number,
     decision, mechanism or expectation inside the quote. Below about 200 characters a passage qualifies only if it
     is a complete, striking statement (a record, a decision). For BBC and the think tanks, quote contiguous
     paragraphs from the article body (a leading sentence may be trimmed if the rest still stands alone; two
     paragraphs with a sub-heading between them are acceptable, each is verified on its own). For CNBC and The
     Economist only the headline and standfirst are available: keep an item only if headline + standfirst together
     state something concrete (a number, a decision, a forecast, a named actor's warning); a bare opinion standfirst
     ("X should stop Y") does not qualify, and where a BBC or think-tank paragraph covers the same point at length,
     prefer it over the headline item.
   - Self-evident relation: the passage itself must make its bearing on the indicator obvious to a reader who sees
     nothing else: it names the series, the price, the policy or the mechanism. The page shows no commentary, so if
     the connection would need explaining, the passage does not qualify.
   - Exceptional developments first: give priority to passages reporting something unusual, disruptive, surprising or
     unexpected with importance for the indicator or the factors behind it — a release well away from consensus, a
     record or multi-year high/low, a policy turn, a supply shock, a military escalation, a forecast revision, a
     revision to the data itself, a stability warning. Label such a passage with a short "tag" (2–4 words, e.g.
     "Above forecast", "Record debt", "Escalation", "Policy turn", "Data revision", "Forecast above 5%"); leave
     "tag" null for passages that supply context or mechanism. Ordinary confirmation of an existing trend ranks below
     any exceptional item, however recent.
   Fewer, stronger passages beat seven weak ones; two is an acceptable set. Keep a passage from yesterday's set if
   nothing better has appeared. Order each set: tagged passages first, then by date, newest first. The same
   paragraph may serve two indicators when it bears on both (an energy-price paragraph under Brent and under CPI).
3. Write `data/quotes.json` in the same shape as before: `{"generated_at": ISO-UTC, "window_days": {"press": 14,
   "think_tanks": 60}, "sources": [...], "quotes": {key: [{source, title, url, date, quote, tag, verified, pieces?,
   headline?, standfirst?}]}}`. For BBC and think-tank entries set "pieces": the list of quoted paragraphs, each
   exactly as it appears in the article (for Bruegel, keep the footnote digits that sit glued to words in "pieces"
   and strip them from "quote"). For CNBC/Economist entries set headline and standfirst; quote is then
   "headline. standfirst". Source names must be exactly: "BBC Business", "CNBC Economy", "The Economist", "NIESR",
   "Resolution Foundation", "Institute for Government", "LSE British Politics and Policy", "Oxford Economics",
   "Bruegel", "Tax Foundation" (the page colours its chips by these names).
4. `python scripts/verify_quotes.py data/quotes.json data/candidates.json` — it checks every BBC and think-tank
   paragraph against the live page text and every CNBC/Economist quote against the feed standfirst, drops failures
   and rebuilds the `#:~:text=` links. If it removed anything, pick a replacement and run it again.
5. Commit `data/quotes.json` and `data/candidates.json` with the message `media: refresh quotes <date>` and push.
   GitHub Pages serves the new file; the page reads it on its next load.
Report in one paragraph: how many passages changed, which indicators have fewer than three, and anything that
could not be fetched.
