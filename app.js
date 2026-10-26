/* Macro Odds Board — application script.
   DATA (bundled above): SNAP = fallback fact-box series, CON = fallback contract prices, both from BUILT_AT.
   Everything live is fetched directly from the publisher in the browser:
     Polymarket (gamma-api), Manifold (api.manifold.markets), ONS, World Bank, BIS, NY Fed, ECB,
     US Treasury, OECD, Cleveland Fed, US Treasury Fiscal Data. Metaculus is embedded (no public API).
   Brent, TTF and the food index have no browser-accessible feed and are bundled (see footer). */

const REFRESH_MS = 60_000, DATA_MS = 30*60_000, EMBED_MS = 10*60_000;
const HORIZON_YEAR = 2027;
const two_years_ago = (()=>{ const d=new Date(); d.setDate(d.getDate()-740); return d.toISOString().slice(0,10); })();

/* ---------- fact boxes: definitions + fetchers ---------- */
const CAD = {A:"Annual · last 3 years", Q:"Quarterly · last 2 years", M:"Monthly · last 2 years", D:"Daily · last 2 years"};
const BOX = {
  gdp:   {name:"Real GDP growth", unit:"%", cad:"Q", n:8, note:"Change on the same quarter a year earlier, chained volume measure",
          src:"ONS, series IHYR", href:"https://www.ons.gov.uk/economy/grossdomesticproductgdp/timeseries/ihyr/pn2",
          fetch:()=>ons("/economy/grossdomesticproductgdp/timeseries/ihyr/pn2","quarters",8), snap:"gdp"},
  unemp: {name:"Unemployment rate", unit:"%", cad:"M", n:24, note:"16+, seasonally adjusted, rolling three months (dated by the final month)",
          src:"ONS, series MGSX", href:"https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms",
          fetch:()=>ons("/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms","months",24), snap:"unemp"},
  pop:   {name:"Population", unit:"m", cad:"A", n:3, note:"UK resident population, mid-year estimate", fmt:v=>(v/1e6).toFixed(2),
          src:"ONS, series UKPOP", href:"https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/timeseries/ukpop/pop",
          fetch:()=>ons("/peoplepopulationandcommunity/populationandmigration/populationestimates/timeseries/ukpop/pop","years",3), snap:"pop", yoy:true},
  earn:  {name:"Regular pay growth", unit:"%", cad:"M", n:24, note:"Average weekly earnings excluding bonuses, three-month average on a year earlier",
          src:"ONS, series KAI9", href:"https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kai9/lms",
          fetch:()=>ons("/employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kai9/lms","months",24), snap:"earn"},
  boe:   {name:"Bank Rate", unit:"%", cad:"D", n:9999, note:"Bank of England official Bank Rate, end of day", dec:2,
          src:"Bank of England via BIS policy-rate statistics", href:"https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate",
          fetch:()=>bis("GB"), snap:"boe"},
  cpi:   {name:"CPI inflation", unit:"%", cad:"M", n:24, note:"Consumer Prices Index, 12-month rate",
          src:"ONS, series D7G7", href:"https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23",
          fetch:()=>ons("/economy/inflationandpriceindices/timeseries/d7g7/mm23","months",24), snap:"cpi"},
  gilt:  {name:"10-year gilt yield", unit:"%", cad:"M", n:24, note:"Monthly average of daily benchmark yields (OECD long-term rate). 5- and 20-year gilts have no open feed; see Bank of England yield curves.", dec:2,
          src:"OECD via SDMX", href:"https://www.bankofengland.co.uk/statistics/yield-curves",
          fetch:()=>oecdGilt(), snap:"gilt10"},
  brent: {name:"Brent crude", unit:"$/bbl", cad:"M", n:24, note:"Monthly average spot price, IMF Primary Commodity Price System", dec:1,
          src:"IMF PCPS, POILBRE", href:"https://data.imf.org/en/datasets/IMF.RES:PCPS", fetch:()=>imf("POILBRE","USD"), snap:"brent"},
  ttf:   {name:"TTF gas (EU)", unit:"$/MMBtu", cad:"M", n:24, note:"Netherlands TTF, monthly average, IMF Primary Commodity Price System", dec:1,
          src:"IMF PCPS, PNGASEU", href:"https://data.imf.org/en/datasets/IMF.RES:PCPS", fetch:()=>imf("PNGASEU","USD"), snap:"ttf"},
  nbp:   {name:"NBP gas (GB)", unit:"p/therm", cad:"M", n:24, note:"Day-ahead contracts, monthly volume-weighted average, Ofgem analysis of broker data (published with a lag of about two months)", dec:1,
          src:"Ofgem wholesale market indicators", href:"https://www.ofgem.gov.uk/energy-data-and-research/data-portal/wholesale-market-indicators", fetch:()=>nbp(), snap:"nbp"},
  dfr:   {name:"ECB deposit facility rate", unit:"%", cad:"D", n:9999, note:"Key ECB rates, step series: deposit facility (shown), main refinancing and marginal lending in the table", dec:2,
          src:"ECB Data Portal, FM dataset", href:"https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html",
          fetch:()=>ecb(), snap:"dfr", extra:["mro","mlf"], extraNames:["Main refinancing","Marginal lending"]},
  fed:   {name:"Effective fed funds rate", unit:"%", cad:"D", n:9999, note:"Volume-weighted median of overnight fed funds transactions; target range midpoint in the table", dec:2,
          src:"Federal Reserve Bank of New York", href:"https://www.newyorkfed.org/markets/reference-rates/effr",
          fetch:()=>effr(), snap:"effr", extra:["fedtarget"], extraNames:["Target midpoint (BIS)"]},
  ust3m: {name:"US 3-month Treasury yield", unit:"%", cad:"D", n:9999, note:"Daily par yield curve, 3-month bill", dec:2,
          src:"US Treasury", href:"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve",
          fetch:()=>treasury("3m"), snap:"ust3m"},
  ust10y:{name:"US 10-year Treasury yield", unit:"%", cad:"D", n:9999, note:"Daily par yield curve, 10-year note", dec:2,
          src:"US Treasury", href:"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve",
          fetch:()=>treasury("10y"), snap:"ust10y"},
  prod:  {name:"UK output per hour worked", unit:"%", cad:"Q", n:8, note:"Whole-economy labour productivity, change on a year earlier (the closest regularly published UK proxy for TFP)",
          src:"ONS, series LZVD", href:"https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/labourproductivity/timeseries/lzvd/prdy",
          fetch:()=>ons("/employmentandlabourmarket/peopleinwork/labourproductivity/timeseries/lzvd/prdy","quarters",8), snap:"prod"},
  food:  {name:"World food price index", unit:"2016 = 100", cad:"M", n:24, note:"IMF food price index, Primary Commodity Price System", dec:1,
          src:"IMF PCPS, PFOOD", href:"https://data.imf.org/en/datasets/IMF.RES:PCPS", fetch:()=>imf("PFOOD","INDEX"), snap:"food"},
  psnb:  {name:"Public sector net borrowing", unit:"£bn", cad:"M", n:24, note:"Excluding public sector banks, not seasonally adjusted; positive = borrowing", fmt:v=>(v/1000).toFixed(1), sign:-1,
          src:"ONS, series J5II", href:"https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/j5ii/pusf",
          fetch:()=>ons("/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/j5ii/pusf","months",24), snap:"psnb"},
  debt:  {name:"Public sector net debt", unit:"% of GDP", cad:"M", n:24, note:"Excluding public sector banks",
          src:"ONS, series HF6X", href:"https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf",
          fetch:()=>ons("/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf","months",24), snap:"debt"},
  customs:{name:"US customs duties collected", unit:"$bn", cad:"M", n:24, note:"Gross monthly receipts from the Monthly Treasury Statement, the cash footprint of the tariff schedule", dec:1,
          src:"US Treasury Fiscal Data, MTS table 4", href:"https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/",
          fetch:()=>customs(), snap:"customs"},
};

/* --- fetchers (each returns {rows:[[period,value,...]], meta?}) --- */
async function getText(u, ms=25000, headers){ const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms); try{ const r=await fetch(u,{signal:c.signal, headers}); if(!r.ok) throw new Error(r.status); return await r.text(); } finally{ clearTimeout(t); } }
async function getJSON(u, ms=25000){ return JSON.parse(await getText(u,ms)); }
function csvParse(text){ // RFC4180-ish
  const rows=[]; let row=[], cell="", q=false;
  for(let i=0;i<text.length;i++){ const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=ch; }
    else if(ch==='"') q=true; else if(ch===','){ row.push(cell); cell=""; } else if(ch==='\n'){ row.push(cell); rows.push(row); row=[]; cell=""; } else if(ch!=='\r') cell+=ch; }
  if(cell!==""||row.length){ row.push(cell); rows.push(row); }
  const h=rows.shift(); return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));
}
async function ons(path, kind, n){
  const d = await getJSON(`https://www.ons.gov.uk${path}/data`);
  const rows = d[kind].filter(x=>x.value!==""&&x.value!=="-"&&!isNaN(+x.value)).map(x=>[x.date,+x.value]);
  return {rows:rows.slice(-n), meta:{title:d.description.title, release:d.description.releaseDate, next:d.description.nextRelease}};
}
async function wb(ind, country, n){
  const d = await getJSON(`https://api.worldbank.org/v2/country/${country}/indicator/${ind}?format=json&per_page=20&mrv=${n+1}`);
  return {rows:d[1].filter(x=>x.value!=null).map(x=>[x.date,x.value]).reverse()};
}
async function bis(area){
  const t = await getText(`https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.${area}?format=csv&startPeriod=${two_years_ago}`);
  return {rows:csvParse(t).map(r=>[r.TIME_PERIOD,+r.OBS_VALUE]).filter(r=>isFinite(r[1])).sort()};
}
async function effr(){
  const end=new Date().toISOString().slice(0,10);
  const d = await getJSON(`https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${two_years_ago}&endDate=${end}`);
  return {rows:d.refRates.map(x=>[x.effectiveDate,x.percentRate]).sort()};
}
async function ecb(){
  const out={};
  for(const [k,code] of [["dfr","DFR"],["mro","MRR_FR"],["mlf","MLFR"]]){
    const t = await getText(`https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.${code}.LEV?format=csvdata&lastNObservations=40`);
    out[k]=csvParse(t).map(r=>[r.TIME_PERIOD,+r.OBS_VALUE]).sort();
  }
  return {rows:out.dfr, extra:{mro:out.mro, mlf:out.mlf}};
}
async function treasury(which){
  const y=new Date().getFullYear(); const tag = which==="3m"?"BC_3MONTH":"BC_10YEAR"; const rows=[];
  for(const yr of [y-2,y-1,y]){
    const x = await getText(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${yr}`, 40000);
    const doc = new DOMParser().parseFromString(x,"application/xml");
    for(const p of doc.getElementsByTagNameNS("http://schemas.microsoft.com/ado/2007/08/dataservices/metadata","properties")){
      const dte=(p.getElementsByTagNameNS("http://schemas.microsoft.com/ado/2007/08/dataservices","NEW_DATE")[0]||{}).textContent||"";
      const v=(p.getElementsByTagNameNS("http://schemas.microsoft.com/ado/2007/08/dataservices",tag)[0]||{}).textContent;
      if(dte.slice(0,10)>=two_years_ago && v) rows.push([dte.slice(0,10),+v]);
    }
  }
  return {rows:rows.sort()};
}
async function oecdGilt(){
  const d = await getJSON(`https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/GBR.M.IRLT.PA.....?startPeriod=${two_years_ago.slice(0,7)}&format=jsondata`);
  const s=d.data.dataSets[0].series; const k=Object.keys(s)[0]; const obs=s[k].observations;
  const tdim=d.data.structure.dimensions.observation.find(x=>x.id==="TIME_PERIOD").values;
  return {rows:Object.entries(obs).map(([i,v])=>[tdim[+i].id,v[0]]).sort()};
}
async function imf(indicator, transform){
  const t = await getText(`https://api.imf.org/external/sdmx/2.1/data/IMF.RES,PCPS/G001.${indicator}.${transform}.M?startPeriod=${two_years_ago.slice(0,7)}`, 30000, {Accept:"application/vnd.sdmx.data+csv"});
  return {rows:csvParse(t).filter(r=>r.OBS_VALUE&&r.TIME_PERIOD).map(r=>[r.TIME_PERIOD.replace("-M","-"),+r.OBS_VALUE]).filter(r=>isFinite(r[1])).sort()};
}
async function nbp(){
  // Ofgem's "Gas prices: day-ahead contracts, monthly average (GB)" chart is hosted on everviz; its
  // inject script carries the chart's CSV, so the series updates whenever Ofgem updates the chart.
  const js = await getText("https://app.everviz.com/inject/YFsS4g98P", 30000);
  const m = js.match(/"data":\{"csv":"((?:[^"\\]|\\.)*)"/); if(!m) throw new Error("no csv");
  const csv = JSON.parse('"'+m[1]+'"');
  const rows = csv.trim().split("\n").slice(1).map(l=>l.split(",")).map(([d,v])=>{ const dd=d.replace(/"/g,""); const [mm,,yy]=dd.split("/"); return [`${yy}-${mm}`, +v]; }).filter(r=>isFinite(r[1])).sort();
  const asof = (js.match(/correct as of ([A-Za-z]+ \d{4})/)||[])[1];
  return {rows:rows.slice(-24), meta:{asof}};
}
async function customs(){
  const d = await getJSON("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_4?filter=classification_desc:eq:Customs%20Duties&sort=-record_date&page%5Bsize%5D=26&fields=record_date,current_month_gross_rcpt_amt", 45000);
  return {rows:d.data.filter(x=>x.current_month_gross_rcpt_amt&&x.current_month_gross_rcpt_amt!=="null").map(x=>[x.record_date.slice(0,7),+(x.current_month_gross_rcpt_amt/1e9).toFixed(2)]).sort().slice(-24)};
}

/* ---------- indicators and chapters ---------- */
const IND = {
  gdp:   {name:"Real GDP growth", k:"Output", boxes:["gdp"],
          contracts:[{pm:"uk-annual-gdp-growth-2026"},{mf:"Noit/will-the-uk-enter-a-technical-reces-ZdlApLdgUt"},{mc:{id:25918,title:"Will the UK achieve an average annual GDP growth rate of 2.5% over the current parliamentary term?",fc:"9%",n:17,closes:"2029-12-31"}}]},
  unemp: {name:"Unemployment rate", k:"Labour market", boxes:["unemp"], contracts:[{mf:"WillSLsN/uk-unemployment-rate-in-q4-2026-per"}]},
  pop:   {name:"Population", k:"Demography", boxes:["pop"], contracts:[{mf:"SpaceKebab/will-the-uk-population-exceed-70-mi"},{mf:"LukeShadwell/uk-imposes-net-migration-cap-below"}]},
  earn:  {name:"Average earnings growth", k:"Pay", boxes:["earn"], contracts:[]},
  boe:   {name:"Bank of England Bank Rate", k:"Policy rate", boxes:["boe"],
          contracts:[{mf:"JZB/what-will-be-the-bank-of-england-in"},{mf:"JZB/what-will-be-the-bank-of-england-in-tCupEh8PNN"},{mf:"JZB/what-will-be-the-bank-of-england-in-6tglN868lZ"},{mc:{id:40585,title:"When will the UK interest rate be 2% or lower?",fc:"3 Jul 2028",sub:"community median date (Feb 2027 – Oct 2029 range)",n:6,closes:"2029-09-01"}}]},
  cpi:   {name:"CPI inflation", k:"Prices", boxes:["cpi"], contracts:[{pm:"uk-annual-inflation-in-2026"}]},
  gilt:  {name:"Gilt yields", k:"Cost of money", boxes:["gilt"],
          contracts:[{mc:{id:12731,title:"Will the United Kingdom's long-term credit rating be downgraded below an A grade by 1 January 2030?",fc:"12%",n:28,closes:"2030-01-01"}}]},
  brent: {name:"Brent oil price", k:"Energy", boxes:["brent"],
          contracts:[{pm:"crude-oil-all-time-high-by"},{mf:"cash/will-the-price-of-oil-reach-150-bef"},{mf:"Plant/what-will-be-the-highest-price-of-c"},{mf:"GuyCohen/will-brent-crude-close-above-100bar"},{mc:{id:43038,title:"What will be the closing price of Crude Oil WTI (USD per barrel) on December 31, 2026?",fc:"$94.5",sub:"community median",n:20,closes:"2026-12-31"}},{mf:"SpeaksForTrees/will-global-peak-oil-production-occ-Asz2nCS9Zc"},{mf:"SpeaksForTrees/will-global-peak-oil-production-occ-5971ee18d3d2"}]},
  gas:   {name:"Wholesale gas: NBP (GB) and TTF (EU)", k:"Energy", boxes:["nbp","ttf"], contracts:[]},
  gulf:  {name:"Gulf energy, trade and security", k:"Geopolitics", boxes:["brent"],
          contracts:[{pm:"strait-of-hormuz-traffic-returns-to-normal-by-december-31"},{pm:"which-month-will-strait-of-hormuz-traffic-return-to-normal-20260702155718114"},{pm:"us-iran-hormuz-agreement-byptptpt-20260803235957575"},{mc:{id:42728,title:"When will traffic through the Strait of Hormuz return to normal levels?",fc:"after 1 Jan 2027",sub:"community median date",closes:"2027-01-01"}},{mf:"BillClintonBubba/strait-of-hormuz-traffic-returns-to-SnI8p88l8U"},{pm:"will-the-iranian-regime-fall-by-the-end-of-2027"},{mc:{id:30337,title:"Will the United States and Iran sign a new agreement restricting Iran's nuclear program before 2029?",fc:"50%",n:97,closes:"2028-12-31"}},{mc:{id:5253,title:"Will Iran possess a nuclear weapon before 2030?",fc:"5%",n:711,closes:"2029-12-31"}},{mc:{id:44237,title:"Will a newly constructed oil or gas pipeline intended to bypass the Strait of Hormuz become fully operational before January 1, 2031?",fc:"80%",closes:"2030-12-31"}}]},
  ecb:   {name:"Key ECB interest rates", k:"Euro area", boxes:["dfr"],
          contracts:[{pm:"ecb-interest-rates-december-2026"},{mf:"Odoacre/will-the-ecb-adjust-the-2-long-run"}]},
  fed:   {name:"Fed funds rate", k:"United States", boxes:["fed"],
          contracts:[{pm:"fed-decision-in-december-20260729232808632"},{pm:"what-will-the-fed-rate-be-at-the-end-of-2026"},{pm:"what-will-the-fed-rate-be-at-the-end-of-2027"},{pm:"fed-rate-cut-by-629"},{mc:{id:11125,title:"What will the US effective fed funds rate be in the following years?",fc:"3.15% in 2030",sub:"community median; 3.98% in 2050",n:32,closes:"2050-12-31"}},{mc:{id:10463,title:"After 2022, when is the next time the US policy rate will reach the zero lower bound?",fc:"Jan 2029",sub:"community median date",closes:"2049-12-31"}}]},
  ust:   {name:"US Treasury yields: 3-month and 10-year", k:"United States", boxes:["ust3m","ust10y"],
          contracts:[{pm:"how-high-will-10-year-treasury-yield-go-before-2027"},{pm:"how-low-will-10-year-treasury-yield-get-before-2027"},{mf:"SuperTaxGenius/10-year-treasury-yield-at-45-on-123-pQ5S25Lhlq"},{mf:"SamuelKnoche/us-10-year-tips-yield-exceeds-4-bef"},{mf:"SamuelKnoche/will-30year-treasury-yields-go-abov-ClCshyEucC"},{mc:{id:43529,title:"Will the U.S. 10-year Treasury yield exceed 7% for at least 30 consecutive days before 2030?",fc:"56%",n:12,closes:"2029-12-31"}},{mc:{id:43322,title:"What will the average interest rate on the US federal government's total debt be at the end of these fiscal years?",fc:"3.68% for FY2028",sub:"community median; 4.17% for FY2026",closes:"2028-09-30"}},{mf:"jack/will-10year-treasury-yields-in-2032"}]},
  tfp:   {name:"Total factor productivity (UK and global)", k:"Supply side", boxes:["prod"], contracts:[]},
  food:  {name:"Food commodity prices", k:"Supply side", boxes:["food"], contracts:[]},
  fiscal:{name:"UK fiscal stance and budget deficit", k:"Public finances", boxes:["psnb","debt"],
          contracts:[{mc:{id:12731,title:"Will the United Kingdom's long-term credit rating be downgraded below an A grade by 1 January 2030?",fc:"12%",n:28,closes:"2030-01-01"}}]},
  tariff:{name:"US tariff rates and trade wars", k:"Trade", boxes:["customs"],
          contracts:[{mc:{id:44883,title:"Will a Section 301 overcapacity determination result in new US tariffs or trade measures targeting China before 2027?",fc:"66%",closes:"2026-12-31"}}]},
};
const CHAPTERS = [
  {id:"growth", num:"I", hue:"var(--growth)", title:"Key indicators for economic growth in the UK", inds:["gdp","unemp","pop","earn","boe"]},
  {id:"inflation", num:"II", hue:"var(--inflation)", title:"Key indicators for inflation and price stability in the UK", inds:["cpi","earn","unemp","boe"]},
  {id:"money", num:"III", hue:"var(--money)", title:"Monetary policy stance and the cost of money in the UK", inds:["boe","gilt","cpi"]},
  {id:"energy", num:"IV", hue:"var(--energy)", title:"Energy prices and the Gulf", inds:["brent","gas","gulf"]},
  {id:"global", num:"V", hue:"var(--global)", title:"Global monetary conditions", inds:["ecb","fed","ust"]},
  {id:"supply", num:"VI", hue:"var(--supply)", title:"Supply side, public finances and trade policy", inds:["tfp","food","fiscal","tariff"]},
];

/* ---------- state ---------- */
const state = {pm:{}, mf:{}, src:{pm:"snapshot",mf:"snapshot"}, data:{}, dataSrc:{}, lastKey:"", quotes:null};
const dark = document.documentElement.dataset.theme === "dark" || (matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light");
const esc = s => String(s??"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pct = p => (p*100 >= 99.5 ? ">99" : p*100 < 0.5 ? "<1" : Math.round(p*100)) + "%";
const fmtVol = v => v>=1e6 ? "$"+(v/1e6).toFixed(1)+"m" : v>=1000 ? "$"+Math.round(v/1000)+"k" : "$"+Math.round(v);
const MON = {JAN:"Jan",FEB:"Feb",MAR:"Mar",APR:"Apr",MAY:"May",JUN:"Jun",JUL:"Jul",AUG:"Aug",SEP:"Sep",OCT:"Oct",NOV:"Nov",DEC:"Dec"};
function fmtPeriod(p){ // "2026 SEP" | "2026 Q2" | "2026" | "2026-09" | "2026-09-16"
  if(/^\d{4} [A-Z]{3}$/.test(p)) return MON[p.slice(5)]+" "+p.slice(0,4);
  if(/^\d{4} Q\d$/.test(p)) return p.slice(5)+" "+p.slice(0,4);
  if(/^\d{4}-\d{2}$/.test(p)){ const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return M[+p.slice(5,7)-1]+" "+p.slice(0,4); }
  if(/^\d{4}-\d{2}-\d{2}$/.test(p)){ const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return (+p.slice(8,10))+" "+M[+p.slice(5,7)-1]+" "+p.slice(0,4); }
  return p;
}
const fmtDay = d => { if(!d) return "—"; const x=new Date(d); return isNaN(x)?d:x.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); };

/* ---------- fact box rendering ---------- */
function spark(rows, col, hue){
  const vals=rows.map(r=>r[col]); if(vals.length<2) return "";
  const W=300,H=56,P=4; const mn=Math.min(...vals), mx=Math.max(...vals); const span=(mx-mn)||1;
  const x=i=>P+(W-2*P)*i/(vals.length-1), y=v=>H-P-(H-2*P)*(v-mn)/span;
  const d=vals.map((v,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1)).join(" ");
  const area=d+` L${x(vals.length-1).toFixed(1)} ${H-P} L${x(0).toFixed(1)} ${H-P} Z`;
  const last=vals[vals.length-1];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${area}" fill="${hue}" opacity=".10"/><path d="${d}" fill="none" stroke="${hue}" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${x(vals.length-1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="2.6" fill="${hue}"/></svg>`;
}
function fmtVal(b, v){ if(v==null||isNaN(v)) return "—"; if(b.fmt) return b.fmt(v); const d=b.dec??1; return (+v).toFixed(d); }
function factBox(key, hue){
  const b=BOX[key]; const live=state.data[key]; const snap=SNAP[b.snap];
  const d = live || (snap ? {rows:snap.rows, extra: b.extra ? Object.fromEntries(b.extra.map(k=>[k,SNAP[k]?.rows||[]])) : undefined} : null);
  const srcTag = b.image ? "" : b.bundled ? `<span class="snap">bundled · as of ${BUILT_AT}</span>` : live ? `<span class="live">live · ${state.dataSrc[key]}</span>` : `<span class="snap">publisher unreachable · snapshot ${BUILT_AT}</span>`;
  if(b.image){
    return `<div class="fact" style="--hue:${hue}"><div class="fh"><span class="fname">${esc(b.name)}</span><span class="cad">Monthly · Ofgem chart</span></div>
      <a href="${b.href}" target="_blank" rel="noopener"><img src="${b.image}" alt="Ofgem chart: monthly average day-ahead gas prices, Great Britain" loading="lazy"></a>
      <div class="delta">${esc(b.note)}</div><div class="src"><span>Source: <a href="${b.href}" target="_blank" rel="noopener">${esc(b.src)}</a></span></div></div>`;
  }
  if(!d || !d.rows || !d.rows.length) return `<div class="fact" style="--hue:${hue}"><div class="fh"><span class="fname">${esc(b.name)}</span></div><div class="delta">No data available.</div></div>`;
  const col=b.col||1; const rows=d.rows; const last=rows[rows.length-1]; const prev=rows[rows.length-2];
  const yearAgo = (()=>{ if(b.cad==="M") return rows[rows.length-13]; if(b.cad==="Q") return rows[rows.length-5]; if(b.cad==="A") return prev; if(b.cad==="D"){ const t=last[0].slice(0,4)-1+last[0].slice(4); let best=null; for(const r of rows){ if(r[0]<=t) best=r; } return best; } })();
  const sign=b.sign||1;
  let headline = fmtVal(b,last[col]*sign);
  let deltaHtml="";
  if(b.yoy && prev){ const g=(last[col]/prev[col]-1)*100; headline = fmtVal(b,last[col]); deltaHtml=`<b class="${g>=0?"up":"down"}">${g>=0?"+":""}${g.toFixed(2)}%</b> on ${esc(prev[0])}`; }
  else if(yearAgo && yearAgo!==last){ const diff=(last[col]-yearAgo[col])*sign; const unit=b.unit==="%"||b.unit==="% of GDP"?" pt":""; deltaHtml=`<b class="${diff>=0?"up":"down"}">${diff>=0?"+":""}${fmtVal(b,diff)}${unit}</b> vs ${fmtPeriod(yearAgo[0])}${prev&&prev!==yearAgo?` · prev ${fmtVal(b,prev[col]*sign)}`:""}`; }
  // compact value grid: annual 3, quarterly 8; monthly/daily use sparkline + table
  let grid="";
  if(b.cad==="A"||b.cad==="Q"){
    const show = b.yoy ? rows.slice(1).map((r,i)=>[r[0], ((r[col]/rows[i][col]-1)*100).toFixed(2)+"%"]) : rows.map(r=>[r[0], fmtVal(b,r[col]*sign)]);
    grid=`<div class="mini">${show.map(([p,v])=>`<span><i>${esc(fmtPeriod(p))}</i>${esc(v)}</span>`).join("")}</div>`;
  }
  const extraRows = (b.extra||[]).map((k,i)=>{ const er=(d.extra&&d.extra[k])||SNAP[k]?.rows||[]; const l=er[er.length-1]; return l?`<span><i>${esc(b.extraNames[i])}</i>${fmtVal(b,l[1])}${b.unit==="%"?"%":""} <i>${esc(fmtPeriod(l[0]))}</i></span>`:""; }).join("");
  const extraCols = (b.extraCols||[]).map(([c,nm])=>`<span><i>${esc(nm)}</i>${fmtVal(b,last[c])}%</span>`).join("");
  const table = `<details><summary>All ${rows.length} values</summary><div class="tbl"><table>${[...rows].reverse().map(r=>`<tr><td>${esc(fmtPeriod(r[0]))}</td>${(b.extraCols||[]).map(([c])=>`<td>${fmtVal(b,r[c])}</td>`).join("")}<td>${fmtVal(b,r[col]*sign)}</td></tr>`).join("")}</table></div></details>`;
  return `<div class="fact" style="--hue:${hue}">
    <div class="fh"><span class="fname">${esc(b.name)}</span><span class="cad">${CAD[b.cad]}</span></div>
    <div class="v">${headline}<small>${b.unit?esc(b.unit)+" · ":""}${esc(fmtPeriod(last[0]))}</small></div>
    ${deltaHtml?`<div class="delta">${deltaHtml}</div>`:""}
    ${spark(rows,col,hue)}<div class="axis"><span>${esc(fmtPeriod(rows[0][0]))}</span><span>${esc(fmtPeriod(last[0]))}</span></div>
    ${grid}${(extraRows||extraCols)?`<div class="mini ex">${extraRows}${extraCols}</div>`:""}
    ${table}
    <div class="delta" style="color:var(--ink-3)">${esc(b.note)}</div>
    <div class="src"><span>Source: <a href="${b.href}" target="_blank" rel="noopener">${esc(b.src)}</a></span>${srcTag}${d.meta&&d.meta.next&&new Date(d.meta.next)>new Date()?`<span>Next release ${esc(d.meta.next)}</span>`:""}</div></div>`;
}

/* ---------- contracts: live refresh ---------- */
const prettyPM = l => l.replace(/ bps (de|in)crease/, (m,d)=> d==="de"?" bp cut":" bp hike");
const PM_SLUGS = [...new Set(Object.values(IND).flatMap(d=>d.contracts.filter(c=>c.pm).map(c=>c.pm)))];
const MF_SLUGS = [...new Set(Object.values(IND).flatMap(d=>d.contracts.filter(c=>c.mf).map(c=>c.mf)))];
async function loadPolymarket(){
  const res = await Promise.allSettled(PM_SLUGS.map(async slug=>{
    const ev=(await getJSON(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`))[0]; if(!ev) throw new Error("gone");
    const ms=(ev.markets||[]).filter(m=>!m.closed&&m.outcomePrices);
    const rows=ms.map(m=>[prettyPM(m.groupItemTitle||m.question), +JSON.parse(m.outcomePrices)[0], m.slug]);
    const binary=ms.length===1; const lead=rows.reduce((b,r,i)=>r[1]>rows[b][1]?i:b,0);
    return [slug,{title:ev.title, ends:(ev.endDate||"").slice(0,10), vol:+ev.volume||0, closed:!!ev.closed||!rows.length, binary, embed:rows.length?rows[lead][2]:slug, embedLabel: binary?ev.title:(rows[lead]||[""])[0], rows: binary?[["Yes",rows[0][1]]]:rows.map(r=>[r[0],r[1]])}];
  }));
  const ok=res.filter(r=>r.status==="fulfilled"); if(!ok.length) throw new Error("polymarket unreachable");
  for(const r of ok) state.pm[r.value[0]]=r.value[1];
  return ok.length;
}
async function loadManifold(){
  const res = await Promise.allSettled(MF_SLUGS.map(async slug=>{
    const m=await getJSON(`https://api.manifold.markets/v0/slug/${slug.split("/")[1]}`);
    const d={title:m.question, closes:new Date(m.closeTime).toISOString().slice(0,10), liq:+m.totalLiquidity||0, type:m.outcomeType, resolved:!!m.isResolved||m.closeTime<Date.now()};
    if(m.outcomeType==="BINARY") d.p=m.probability; else if(m.answers) d.rows=m.answers.map(a=>[a.text,a.probability]).slice(0,14);
    return [slug,d];
  }));
  const ok=res.filter(r=>r.status==="fulfilled"); if(!ok.length) throw new Error("manifold unreachable");
  for(const r of ok) state.mf[r.value[0]]=r.value[1];
  return ok.length;
}
const pmData = slug => state.pm[slug] || CON.pm[slug];
const mfData = slug => state.mf[slug] || CON.mf[slug];

/* ---------- market cards ---------- */
function bars(rows){
  const lead=rows.reduce((b,r,i)=>r[1]>rows[b][1]?i:b,0);
  return `<div class="odds">${rows.map((r,i)=>`<div class="row${i===lead?" lead":""}"><span class="lbl" title="${esc(r[0])}">${esc(r[0])}</span><span class="bar"><i style="width:${Math.max(1,r[1]*100)}%"></i></span><span class="pct">${pct(r[1])}</span></div>`).join("")}</div>`;
}
const big = (p,t) => `<div class="big"><span class="p">${esc(p)}</span><span class="t">${esc(t)}</span></div>`;
const embed = (label, src, h, open) => `<details class="embed"${open?" open":""}><summary>${esc(label)}</summary><iframe loading="lazy" title="${esc(label)}" data-src="${esc(src)}" src="${esc(src)}" height="${h}" referrerpolicy="no-referrer-when-downgrade"></iframe></details>`;
function cardPM(slug){
  const d=pmData(slug); if(!d||d.closed) return null;
  const url="https://polymarket.com/event/"+slug, src=`https://embed.polymarket.com/market.html?market=${encodeURIComponent(d.embed)}&features=volume&theme=${dark?"dark":"light"}`;
  return {when:d.ends, title:d.title, html:`<article class="mk" data-key="pm:${esc(slug)}" style="--pc:var(--pm)">
    <div class="mk-top"><span class="chip">Polymarket</span><div class="mk-q"><a href="${url}" target="_blank" rel="noopener">${esc(d.title)}</a></div></div>
    <div class="mk-meta"><span>Volume ${fmtVol(d.vol)}</span><span>Resolves ${fmtDay(d.ends)}</span>${state.src.pm==="live"?"":`<span class="snap">snapshot ${BUILT_AT}</span>`}</div>
    ${d.binary ? big(pct(d.rows[0][1]),"chance of Yes") : bars(d.rows)}
    ${embed("Embedded market: "+d.embedLabel, src, 300)}
    <div class="mk-foot"><a href="${url}" target="_blank" rel="noopener">Open on Polymarket ↗</a></div></article>`};
}
function cardMF(slug){
  const d=mfData(slug); if(!d||d.resolved) return null;
  const url="https://manifold.markets/"+slug, src="https://manifold.markets/embed/"+slug;
  const body = d.p!=null ? big(pct(d.p),"chance of Yes") : d.rows ? bars(d.rows) : `<div class="big"><span class="t">Distribution shown in the embed below</span></div>`;
  return {when:d.closes, title:d.title, html:`<article class="mk" data-key="mf:${esc(slug)}" style="--pc:var(--mf)">
    <div class="mk-top"><span class="chip">Manifold</span><div class="mk-q"><a href="${url}" target="_blank" rel="noopener">${esc(d.title)}</a></div></div>
    <div class="mk-meta"><span>Play-money market</span><span>Closes ${fmtDay(d.closes)}</span>${state.src.mf==="live"?"":`<span class="snap">snapshot ${BUILT_AT}</span>`}</div>
    ${body}${embed("Embedded market", src, d.rows?420:320)}
    <div class="mk-foot"><a href="${url}" target="_blank" rel="noopener">Open on Manifold ↗</a></div></article>`};
}
function cardMC(q){
  const url=`https://www.metaculus.com/questions/${q.id}/`;
  return {when:q.closes||"", title:q.title, html:`<article class="mk" data-key="mc:${q.id}" style="--pc:var(--mc)">
    <div class="mk-top"><span class="chip">Metaculus</span><div class="mk-q"><a href="${url}" target="_blank" rel="noopener">${esc(q.title)}</a></div></div>
    <div class="mk-meta"><span>Forecasting community, not a market</span>${q.closes?`<span>Resolves by ${fmtDay(q.closes)}</span>`:""}${q.n?`<span>${q.n} forecasters</span>`:""}</div>
    ${big(q.fc, (q.sub||"community forecast")+` at ${BUILT_AT}; the embedded chart is live`)}
    ${embed("Embedded forecast chart", `https://www.metaculus.com/questions/embed/${q.id}/`, 420)}
    <div class="mk-foot"><a href="${url}" target="_blank" rel="noopener">Open on Metaculus ↗</a></div></article>`};
}
function periodYear(title, when){ const ys=[...String(title||"").matchAll(/\b(20[2-9]\d)\b/g)].map(m=>+m[1]); if(ys.length) return Math.max(...ys); return when ? +when.slice(0,4) : NaN; }
function marketsFor(ind){
  const cards = IND[ind].contracts.map(c=> c.pm ? cardPM(c.pm) : c.mf ? cardMF(c.mf) : cardMC(c.mc)).filter(Boolean);
  cards.forEach(c=>{ c.year=periodYear(c.title,c.when); });
  cards.sort((a,b)=>(a.year-b.year)||(a.when<b.when?-1:1));
  return cards.map(c=>c.html).join("");
}
const SRC_CLASS={"BBC Business":"bbc","CNBC Economy":"cnbc","The Economist":"econ","NIESR":"tt","Resolution Foundation":"tt","Institute for Government":"tt","LSE British Politics and Policy":"tt","Oxford Economics":"tt","Bruegel":"tt","Tax Foundation":"tt"};
function quotesFor(ind){
  const qs = ((state.quotes&&state.quotes.quotes)||QUOTES.quotes)[ind] || [];
  if(!qs.length) return `<div class="qnone">No recent passage from the press or the think tanks followed here met the bar for this indicator.</div>`;
  return `<div class="quotes">${qs.map(q=>{
    const body = q.headline ? esc(q.standfirst) : esc(q.quote);
    return `<article class="qt">
    <div class="qm"><span class="chip ${SRC_CLASS[q.source]||""}">${esc(q.source)}</span><span>${esc(fmtDay(q.date))}</span><span class="vf">${q.verified==="page text"?"quoted from the article body · verified":"headline and standfirst from the publisher's feed"}</span></div>
    <div class="qh"><span class="qh-l">Article's title:</span> <a href="${esc(q.link)}" target="_blank" rel="noopener">${esc(q.headline||q.title)}</a></div>
    <blockquote>${body}</blockquote>
    <div class="qf"><a href="${esc(q.link)}" target="_blank" rel="noopener">Open at this passage ↗</a></div></article>`;}).join("")}</div>`;
}
function indicator(key, chap, n){
  const d=IND[key]; const mk=marketsFor(key);
  return `<section class="ind" id="${chap.id}-${key}" style="--hue:${chap.hue}">
    <div class="ind-head"><div class="k">${chap.num}.${n} · ${esc(d.k)}</div><h3>${esc(d.name)}</h3></div>
    <div class="blk">Operative data</div>
    <div class="facts">${d.boxes.map(b=>factBox(b,chap.hue)).join("")}</div>
    ${mk?`<div class="blk">Prediction markets</div><div class="markets">${mk}</div>`:""}
    <div class="blk">In the media and think tanks</div>
    ${quotesFor(key)}
  </section>`;
}
function keyOf(){ return JSON.stringify([Object.entries(state.pm).map(([k,v])=>k+v.closed+v.rows.length), Object.entries(state.mf).map(([k,v])=>k+v.resolved), state.src, Object.keys(state.data)]); }
function renderAll(){
  const open=new Set([...document.querySelectorAll("details.embed[open] iframe")].map(f=>f.dataset.src));
  const y=scrollY;
  document.getElementById("main").innerHTML = CHAPTERS.map(c=>`<section class="chapter" id="${c.id}" style="--hue:${c.hue}">
      <div class="chapter-head"><div class="num">${c.num}</div><div><h2>${esc(c.title)}</h2></div></div>
      ${c.inds.map((k,i)=>indicator(k,c,i+1)).join("")}</section>`).join("");
  document.querySelectorAll("details.embed").forEach(d=>{ if(open.has(d.querySelector("iframe").dataset.src)) d.open=true; });
  scrollTo(0,y); state.lastKey=keyOf();
}
function patchPrices(){
  for(const [slug,d] of Object.entries(state.pm)) document.querySelectorAll(`[data-key="pm:${CSS.escape(slug)}"]`).forEach(card=>patchCard(card,d.rows,d.binary?d.rows[0][1]:null));
  for(const [slug,d] of Object.entries(state.mf)) document.querySelectorAll(`[data-key="mf:${CSS.escape(slug)}"]`).forEach(card=>patchCard(card,d.rows,d.p));
}
function patchCard(card, rows, p){
  if(rows && card.querySelector(".row")){ const lead=rows.reduce((b,r,i)=>r[1]>rows[b][1]?i:b,0); card.querySelectorAll(".row").forEach((el,i)=>{ if(!rows[i]) return; el.querySelector(".bar i").style.width=Math.max(1,rows[i][1]*100)+"%"; el.querySelector(".pct").textContent=pct(rows[i][1]); el.classList.toggle("lead",i===lead); }); }
  else if(p!=null){ const el=card.querySelector(".big .p"); if(el) el.textContent=pct(p); }
}

/* ---------- nav, footer, status, loops ---------- */
document.getElementById("navwrap").innerHTML = CHAPTERS.map(c=>`<a href="#${c.id}"><span class="n">${c.num}</span>${esc(c.title.replace(/ in the UK$/,"").replace("Key indicators for ","").replace(/^./,m=>m.toUpperCase()))}</a>`).join("") +
  `<div class="legend" aria-hidden="true"><span style="--c:var(--pm)">Polymarket</span><span style="--c:var(--mf)">Manifold</span><span style="--c:var(--mc)">Metaculus</span></div>`;
document.getElementById("foot").innerHTML = `
  <h4>How to read this board</h4>
  <p>Percentages are the market's implied probability (the price of a "Yes" share). Polymarket and Manifold prices are re-fetched every minute without reloading the page; a contract that closes or resolves disappears on the next refresh. Metaculus is a forecasting community, not a market: the figure shown is the community median when the page was built, and the embedded chart is live. Within each indicator, contracts are ordered by the period they refer to.</p>
  <h4>Official readings</h4>
  <p>Every fact box is fetched directly from its publisher on load and every 30 minutes, so a new ONS release, a Bank Rate change, a day's Treasury close or the IMF's monthly commodity update appears without anyone editing the page. Annual series show three years, quarterly and monthly series two years, daily series two years of daily closes; changes are on the same period a year earlier. The NBP series is Ofgem's monthly day-ahead average, read from the data behind Ofgem's published chart; Ofgem updates it with a lag of about two months. If a publisher is unreachable, the box shows the copy saved when the page was built (${BUILT_AT}) and says so.</p>
  <h4>In the media</h4>
  <p>Under each indicator, up to seven recent passages from the press (BBC Business, CNBC Economy, The Economist) and from think tanks whose work bears on these indicators (NIESR, the Resolution Foundation, the Institute for Government, LSE British Politics and Policy, Oxford Economics, Bruegel, the Tax Foundation). Passages that report something exceptional (a surprise against forecasts, a record, a policy turn, a supply shock, an escalation, a revision to the data) are placed first, then the rest by date. A passage qualifies only if it stands on its own, states something concrete about the indicator or a factor that moves it, explains the trend or gives an expectation for it, makes its bearing on the indicator evident without commentary, and is long enough to carry its meaning: whole paragraphs, not clipped sentences. Press passages are taken from the last two weeks; think-tank analysis, which is published less often and dates more slowly, from the last two months. Links use W3C text fragments (#:~:text=…) so the browser opens the article scrolled to, and highlighting, the quoted passage. BBC and think-tank passages are quoted from the article body and checked, paragraph by paragraph, against the published page. CNBC and The Economist do not serve their article pages to automated readers, so their entries are the headline and the standfirst the publisher distributes in its own feed, and are kept only where the two together make a complete statement; the link targets the headline on the page. When this page is hosted with the daily refresh job, the set is reviewed every day: new passages are added as they appear and older ones retire; opened as a local file, it shows the set selected on ${BUILT_AT}.</p>
  <h4>Sources</h4>
  <ul>
    <li>Office for National Statistics time-series API (GDP IHYR, unemployment MGSX, population UKPOP, regular pay KAI9, CPI D7G7, output per hour LZVD, net borrowing J5II, net debt HF6X)</li>
    <li>Bank for International Settlements policy-rate statistics (Bank of England Bank Rate, Fed target midpoint) · Federal Reserve Bank of New York (effective fed funds rate) · European Central Bank Data Portal (deposit facility, main refinancing and marginal lending rates)</li>
    <li>US Department of the Treasury daily par yield curve · US Treasury Fiscal Data, Monthly Treasury Statement table 4 (customs duties)</li>
    <li>OECD Data Explorer (UK long-term interest rate)</li>
    <li>IMF Primary Commodity Price System via the IMF SDMX API (Brent, TTF, food price index)</li>
    <li>Ofgem wholesale market indicators (NBP day-ahead monthly average)</li>
    <li>Polymarket Gamma API · Manifold Markets API · Metaculus embeds</li>
    <li>BBC Business RSS and article pages · CNBC Economy, Energy and Europe RSS · The Economist RSS (Britain, Finance & economics, Business, Leaders, Middle East & Africa)</li>
    <li>Think-tank feeds and article pages: NIESR · Resolution Foundation · Institute for Government · LSE British Politics and Policy · Oxford Economics · Bruegel · Tax Foundation</li>
  </ul>
  <p style="font-size:12px;color:var(--ink-3)">Odds are not forecasts and this page is not financial advice. Prediction-market access is restricted in the UK; embeds are for information only.</p>`;


function setStatus(k,label,ok){ const d=document.getElementById("dot-"+k), s=document.getElementById("st-"+k); if(!d) return; d.className="dot "+(ok?"live":"err"); s.textContent=label; }
let nextAt=Date.now()+REFRESH_MS;
async function refreshMarkets(){
  const t=new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const [pm,mf]=await Promise.allSettled([loadPolymarket(),loadManifold()]);
  if(pm.status==="fulfilled"){ state.src.pm="live"; setStatus("pm",`live · ${pm.value}/${PM_SLUGS.length} contracts · ${t}`,true); } else setStatus("pm","unreachable · showing snapshot "+BUILT_AT,false);
  if(mf.status==="fulfilled"){ state.src.mf="live"; setStatus("mf",`live · ${mf.value}/${MF_SLUGS.length} markets · ${t}`,true); } else setStatus("mf","unreachable · showing snapshot "+BUILT_AT,false);
  if(keyOf()!==state.lastKey) renderAll(); else patchPrices();
  nextAt=Date.now()+REFRESH_MS;
}
async function refreshData(){
  const keys=Object.keys(BOX).filter(k=>BOX[k].fetch);
  const t=new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
  let ok=0;
  await Promise.allSettled(keys.map(async k=>{ try{ const r=await BOX[k].fetch(); if(r&&r.rows&&r.rows.length){ state.data[k]=r; state.dataSrc[k]=t; ok++; } }catch(e){ console.warn("data",k,e.message); } }));
  setStatus("data", `${ok}/${keys.length} live sources · ${t}`, ok===keys.length);
  renderAll();
}
async function refreshQuotes(){
  try{ const q=await getJSON("quotes.json?t="+Math.floor(Date.now()/600000), 8000); if(q&&q.quotes){ state.quotes=q; setStatus("media",`daily file · ${new Date(q.generated_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,true); renderAll(); return; } }catch(e){}
  setStatus("media", `selected ${BUILT_AT}`, true);
}
function tick(){ const el=document.getElementById("st-next"); if(el){ el.textContent=`next price refresh in ${Math.max(0,Math.round((nextAt-Date.now())/1000))}s`; } }
function reloadEmbeds(){ document.querySelectorAll("details.embed[open] iframe").forEach(f=>{ f.src=f.dataset.src; }); }

renderAll();
refreshMarkets(); refreshData(); refreshQuotes();
setInterval(refreshMarkets, REFRESH_MS); setInterval(refreshData, DATA_MS); setInterval(tick,1000); setInterval(reloadEmbeds, EMBED_MS);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden&&Date.now()>nextAt) refreshMarkets(); });
