// 미국 마감 요약 수집기 — GitHub Actions 에서 매일 한국시간 아침(미장 마감 후)에 실행되어 us.json 을 만든다.
//  - 종목·ETF 일봉의 마지막 두 종가로 전일 대비 등락률을 구하고, 테마별(대표 종목 묶음) 평균을 낸다.
//  - 출처: 야후 파이낸스 차트 API → 실패하면 Stooq CSV. 둘 다 실패한 종목은 건너뛰고 결과 파일에 실패 목록을 남긴다.
//  - 사용: node scripts/collect-us.mjs [출력경로 기본 us.json]
import fs from "node:fs";

/** 테마 정의: id, 한글 이름, 국내 테마 연결 키워드, 대표 미국 종목/ETF (제가 임의로 정한 묶음이며 수정 가능) */
export const US_THEMES = [
  { id: "optical", name: "광통신·광학", kr: ["광통신", "광케이블", "광섬유", "광학"], syms: ["LITE", "COHR", "CIEN", "AAOI", "GLW", "FN"] },
  { id: "quantum", name: "양자컴퓨터", kr: ["양자", "퀀텀"], syms: ["IONQ", "RGTI", "QBTS", "QUBT"] },
  { id: "aichip", name: "AI 반도체", kr: ["AI반도체", "반도체", "GPU", "시스템반도체"], syms: ["NVDA", "AMD", "AVGO", "MRVL", "TSM"] },
  { id: "memory", name: "메모리·HBM", kr: ["HBM", "메모리", "D램", "낸드"], syms: ["MU", "WDC", "STX"] },
  { id: "semieq", name: "반도체 전공정 장비", kr: ["전공정", "반도체장비", "식각", "증착"], syms: ["AMAT", "LRCX", "KLAC", "ASML"] },
  { id: "semiback", name: "반도체 후공정·테스트", kr: ["후공정", "패키징", "테스트"], syms: ["TER", "AMKR", "COHU", "FORM"] },
  { id: "power", name: "전력·원전·SMR", kr: ["원전", "원자력", "SMR", "전력", "변압기"], syms: ["CEG", "VST", "OKLO", "SMR", "CCJ"] },
  { id: "dcinfra", name: "데이터센터 인프라", kr: ["데이터센터", "전력설비", "냉각"], syms: ["VRT", "ETN", "GEV", "PWR"] },
  { id: "battery", name: "2차전지·전기차", kr: ["2차전지", "전기차", "리튬"], syms: ["TSLA", "ALB", "RIVN", "LCID"] },
  { id: "bio", name: "바이오·제약", kr: ["바이오", "제약", "비만"], syms: ["XBI", "LLY", "VRTX", "MRNA"] },
  { id: "robot", name: "로봇·자동화", kr: ["로봇", "자동화"], syms: ["ISRG", "TER", "SYM", "ROBO"] },
  { id: "space", name: "방산·우주", kr: ["방산", "우주", "항공", "위성"], syms: ["LMT", "RTX", "RKLB", "ASTS", "LUNR"] },
  { id: "software", name: "AI 소프트웨어", kr: ["소프트웨어", "AI", "인공지능", "클라우드"], syms: ["PLTR", "NOW", "SNOW", "CRM"] },
  { id: "security", name: "사이버보안", kr: ["보안", "사이버"], syms: ["CRWD", "PANW", "FTNT"] },
  { id: "crypto", name: "가상자산", kr: ["가상화폐", "가상자산", "비트코인", "블록체인"], syms: ["COIN", "MSTR", "MARA"] },
  { id: "oilgas", name: "석유·가스 시추", kr: ["시추", "석유", "가스", "해양플랜트", "자원개발"], syms: ["VAL", "RIG", "HAL", "PTEN", "HP", "NE", "OII"] },
  // 세부분류별 미국 종목(분류표 shared/themes.json 과 같아야 한다 — test/themes.test.js 가 확인)
  { id: "dcinfra.power_equip", sub: true, name: "데이터센터 인프라 · 전력기기·변압기", kr: [], syms: ["ETN","HUBB","POWL","GEV"] },
  { id: "dcinfra.gen", sub: true, name: "데이터센터 인프라 · 발전설비(가스터빈·원전·연료전지)", kr: [], syms: ["GEV","CEG","VST","BE","TLN"] },
  { id: "dcinfra.ess", sub: true, name: "데이터센터 인프라 · ESS·전력저장", kr: [], syms: ["FLNC","EOSE","GNRC"] },
  { id: "dcinfra.backup", sub: true, name: "데이터센터 인프라 · 비상발전·백업전원", kr: [], syms: ["GNRC","CAT","CMI"] },
  { id: "dcinfra.cooling", sub: true, name: "데이터센터 인프라 · 액침냉각·공조·배관", kr: [], syms: ["VRT","MOD","TT","CARR"] },
  { id: "dcinfra.network", sub: true, name: "데이터센터 인프라 · 네트워크·광통신", kr: [], syms: ["ANET","CRDO","ALAB","CIEN","LITE"] },
  { id: "dcinfra.memory", sub: true, name: "데이터센터 인프라 · 메모리·스토리지", kr: [], syms: ["MU","WDC","STX","SNDK","PSTG"] },
  { id: "dcinfra.idc", sub: true, name: "데이터센터 인프라 · IDC 통신·클라우드", kr: [], syms: ["EQIX","DLR"] },
  { id: "dcinfra.security", sub: true, name: "데이터센터 인프라 · 보안·관제", kr: [], syms: ["CRWD","PANW","FTNT"] },
  { id: "dcinfra.si", sub: true, name: "데이터센터 인프라 · SI·시설관리", kr: [], syms: ["PWR","EME","FIX","STRL"] },
];
/** 미국 업종·산업 등락(자동) — 대표 ETF 하루 등락으로 본다. [심볼, 한글 이름, 구분(sector 큰 업종 · industry 세부 산업), 우리 테마 id(없으면 null)]
 *  테마(양자·데이터센터 냉각 같은 사람이 이름 붙인 묶음)가 아니라 공식에 가까운 분류이므로, "우리 테마에 없는데 오른 곳"을 놓치지 않기 위한 보조 지표다. ETF 는 업종의 대용품이라 구성이 정확히 같지는 않다. */
export const US_SECTORS = [
  ["XLE", "에너지", "sector", null], ["XLK", "기술", "sector", null], ["XLF", "금융", "sector", null], ["XLV", "헬스케어", "sector", null], ["XLY", "경기소비재", "sector", null], ["XLP", "필수소비재", "sector", null],
  ["XLI", "산업재", "sector", null], ["XLB", "소재", "sector", null], ["XLU", "유틸리티", "sector", null], ["XLRE", "부동산", "sector", null], ["XLC", "커뮤니케이션", "sector", null],
  ["XES", "석유 장비·서비스(시추)", "industry", "oilgas"], ["OIH", "석유 서비스(시추·유전)", "industry", "oilgas"], ["XOP", "석유·가스 탐사·생산", "industry", "oilgas"],
  ["SMH", "반도체", "industry", "aichip"], ["XSD", "반도체(동일가중)", "industry", "aichip"], ["IGV", "소프트웨어", "industry", "software"], ["CLOU", "클라우드", "industry", "software"], ["AIQ", "인공지능", "industry", "software"],
  ["HACK", "사이버보안", "industry", "security"], ["XBI", "바이오텍", "industry", "bio"], ["XPH", "제약", "industry", "bio"], ["IHI", "의료기기", "industry", null], ["XHS", "헬스케어 서비스", "industry", null],
  ["XAR", "항공우주·방산", "industry", "space"], ["UFO", "우주", "industry", "space"], ["JETS", "항공사", "industry", null], ["XTN", "운송", "industry", null],
  ["LIT", "리튬·배터리", "industry", "battery"], ["DRIV", "자율주행·전기차", "industry", "battery"], ["TAN", "태양광", "industry", null], ["ICLN", "청정에너지", "industry", null],
  ["NLR", "원자력", "industry", "power"], ["URA", "우라늄", "industry", "power"], ["GRID", "스마트그리드", "industry", "dcinfra"], ["SRVR", "데이터센터", "industry", "dcinfra"],
  ["BOTZ", "로봇·AI 장비", "industry", "robot"], ["QTUM", "양자컴퓨팅", "industry", "quantum"], ["BLOK", "블록체인", "industry", "crypto"], ["BITO", "비트코인 선물", "industry", "crypto"],
  ["XME", "금속·광업", "industry", null], ["GDX", "금광", "industry", null], ["COPX", "구리", "industry", null], ["REMX", "희토류·전략금속", "industry", null], ["SLX", "철강", "industry", null],
  ["KRE", "지역은행", "industry", null], ["KCE", "자본시장", "industry", null], ["KIE", "보험", "industry", null], ["XRT", "소매", "industry", null], ["XHB", "주택건설", "industry", null], ["PAVE", "인프라", "industry", null],
  ["KWEB", "중국 인터넷", "industry", null], ["ESPO", "게임·e스포츠", "industry", null], ["MOO", "농업", "industry", null], ["ARKK", "혁신 성장(ARK)", "industry", null],
];
export const US_INDEX = [["^GSPC", "S&P500"], ["^IXIC", "나스닥종합"], ["^DJI", "다우"], ["^SOX", "필라델피아반도체"], ["SPY", "S&P500 ETF(SPY)"], ["QQQ", "나스닥100 ETF(QQQ)"], ["SOXX", "반도체 ETF(SOXX)"], ["EWY", "한국 ETF(EWY)"]];

const UA = "Mozilla/5.0 (compatible; s26-us/1.0)";
/** 국내 지수 일봉(장 상황 판단용 일봉 RSI 계산에 씀) — 야후 심볼, 이름 */
export const KR_INDEX = [["^KS11", "KOSPI"], ["^KQ11", "KOSDAQ"]];
/** 야후 차트 JSON → 일봉 [[YYYYMMDD(한국 날짜), 시, 고, 저, 종]] */
export function parseYahooOhlc(j) {
  const r = j?.chart?.result?.[0]; if (!r) return [];
  const ts = r.timestamp || [], q = r.indicators?.quote?.[0] || {};
  return ts.map((t, i) => [new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10).replace(/-/g, ""), q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]])
    .filter((a) => a.slice(1).every((x) => Number.isFinite(x)))
    .map((a) => [a[0], ...a.slice(1).map((x) => +x.toFixed(2))]);
}
async function getKrIdx(sym, f = fetch) {
  try {
    const r = await f(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    if (r.ok === false) return { rows: [], err: `HTTP ${r.status}` };
    const rows = parseYahooOhlc(await r.json());
    return rows.length >= 30 ? { rows } : { rows: [], err: `일봉 ${rows.length}개뿐` };
  } catch (e) { return { rows: [], err: String(e?.message || e).slice(0, 80) }; }
}
/** 야후 차트 JSON → [{d:'YYYYMMDD', c}] */
export function parseYahoo(j) {
  const r = j?.chart?.result?.[0]; if (!r) return [];
  const ts = r.timestamp || [], cl = r.indicators?.quote?.[0]?.close || [];
  return ts.map((t, i) => ({ d: new Date(t * 1000).toISOString().slice(0, 10).replace(/-/g, ""), c: cl[i] })).filter((x) => Number.isFinite(x.c));
}
/** Stooq CSV(Date,Open,High,Low,Close,Volume) → [{d, c}] */
export function parseStooq(csv) {
  return String(csv || "").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).map((a) => ({ d: String(a[0] || "").replace(/-/g, ""), c: Number(a[4]) })).filter((x) => /^\d{8}$/.test(x.d) && Number.isFinite(x.c));
}
/** 마지막 두 종가로 등락률 */
export function lastChange(bars) {
  if (bars.length < 2) return null; const a = bars[bars.length - 2], b = bars[bars.length - 1];
  return a.c > 0 ? { d: b.d, close: +b.c.toFixed(2), chg: +(((b.c / a.c - 1) * 100).toFixed(2)) } : null;
}
async function getBars(sym, f = fetch) {
  const tries = [
    async () => parseYahoo(await (await f(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10d&interval=1d`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) })).json()),
    async () => { if (sym.startsWith("^")) throw new Error("지수는 야후만"); const r = await f(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym.toLowerCase())}.us&i=d`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return parseStooq(await r.text()); },
  ];
  const errs = [];
  for (const [i, t] of tries.entries()) { try { const b = await t(); if (b.length >= 2) return { bars: b, src: i ? "stooq" : "yahoo" }; errs.push(i ? "stooq 비어 있음" : "yahoo 비어 있음"); } catch (e) { errs.push(`${i ? "stooq" : "yahoo"} ${String(e?.message || e).slice(0, 60)}`); } }
  return { bars: [], errs };
}

/** 크게 움직인 미국 종목의 기사 제목 — 기준(절대 등락 %)과 최대 종목 수 */
export const MOVER_PCT = 8, MOVER_MAX = 24, NEWS_KEEP = 3, NEWS_MAX_AGE_H = 120;
const unesc = (x) => String(x || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();
/** RSS(XML) → [{t, l, ts}] — 정규식으로 item 만 읽는다(외부 라이브러리 없이) */
export function parseRss(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const b = m[0], g = (tag) => { const r = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return r ? unesc(r[1]) : ""; };
    const t = g("title"), l = g("link"), ts = Date.parse(g("pubDate"));
    if (t && /^https?:/.test(l)) out.push({ t, l, ts: Number.isFinite(ts) ? ts : null });
  }
  return out;
}
/** 종목 하나의 최근 기사(야후 → 안 되면 구글뉴스). 제목은 영어 그대로 */
export async function getNews(sym, nowMs, f = fetch) {
  const tries = [
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`,
    `https://news.google.com/rss/search?q=${encodeURIComponent(sym + " stock")}&hl=en-US&gl=US&ceid=US:en`,
  ];
  const errs = [];
  for (const [i, u] of tries.entries()) {
    try {
      const r = await f(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
      if (r.ok === false) { errs.push(`${i ? "google" : "yahoo"} HTTP ${r.status}`); continue; }
      const items = parseRss(await r.text()).filter((x) => x.ts == null || nowMs - x.ts <= NEWS_MAX_AGE_H * 3600e3).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, NEWS_KEEP);
      if (items.length) return { items, src: i ? "google" : "yahoo" };
      errs.push(`${i ? "google" : "yahoo"} 기사 없음`);
    } catch (e) { errs.push(`${i ? "google" : "yahoo"} ${String(e?.message || e).slice(0, 40)}`); }
  }
  return { items: [], errs };
}
/** 오늘 크게 움직인 종목(지수 제외) — 절대 등락 큰 순 */
export const pickMovers = (got, skip = new Set()) => Object.entries(got).filter(([s, g]) => !s.startsWith("^") && !skip.has(s) && Math.abs(g.chg) >= MOVER_PCT).sort((a, b) => Math.abs(b[1].chg) - Math.abs(a[1].chg)).slice(0, MOVER_MAX).map(([s]) => s);
/** 해외 거래소(하이퍼리퀴드)의 KOSPI200 24시간 상품 — 한국장 마감(평일 15:30 KST) 대비 지금까지의 변화. 진짜 야간선물이 아니라 대용 지표.
 *  실패하면 null (화면에서는 '—') */
export async function getKr200(fetchImpl = fetch, nowMs = Date.now(), coin = "xyz:KR200") {
  try {
    const r = await fetchImpl("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: "5m", startTime: nowMs - 5 * 86400000, endTime: nowMs } }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length < 10) return null;
    let ref = null;
    for (const k of rows) { const d = new Date(k.t + 9 * 3600e3); const wd = d.getUTCDay(); if (wd >= 1 && wd <= 5 && d.getUTCHours() === 15 && d.getUTCMinutes() === 25 && k.t < nowMs) ref = { px: +k.c, t: k.t }; }
    const last = rows[rows.length - 1], px = +last.c;
    if (!ref || !(px > 0) || !(ref.px > 0)) return null;
    return { sym: coin, price: px, ref: ref.px, refAt: ref.t, asOf: last.t, chg: +((px / ref.px - 1) * 100).toFixed(2) };
  } catch { return null; }
}
export async function collectUs({ fetchImpl = fetch, nowMs = Date.now(), themes = US_THEMES, index = US_INDEX, krIndex = KR_INDEX, sectors = US_SECTORS } = {}) {
  const syms = [...new Set([...themes.flatMap((t) => t.syms), ...index.map((x) => x[0])])], got = {}, fail = {};
  for (let i = 0; i < syms.length; i += 4) await Promise.all(syms.slice(i, i + 4).map(async (s) => { const r = await getBars(s, fetchImpl); if (r.bars.length) got[s] = { ...lastChange(r.bars), src: r.src }; else fail[s] = r.errs; }));
  const th = themes.map((t) => { const mem = t.syms.map((s) => (got[s] ? { sym: s, chg: got[s].chg } : null)).filter(Boolean).sort((a, b) => b.chg - a.chg); const avg = mem.length ? +(mem.reduce((a, x) => a + x.chg, 0) / mem.length).toFixed(2) : null; return { id: t.id, ...(t.sub ? { sub: true } : {}), name: t.name, kr: t.kr, n: mem.length, of: t.syms.length, avg, members: mem }; }).filter((t) => t.avg != null && t.n >= Math.min(2, t.of)).sort((a, b) => b.avg - a.avg);
  const dates = Object.values(got).map((g) => g.d).sort();
  const secOut = [], secFail = [];   // 업종·산업 ETF — 실패해도 나머지 수집에는 영향 없음
  for (let i = 0; i < sectors.length; i += 4) await Promise.all(sectors.slice(i, i + 4).map(async ([sym, name, kind, theme]) => { try { const r = await getBars(sym, fetchImpl); const c = r.bars.length ? lastChange(r.bars) : null; if (c) secOut.push({ sym, name, kind, theme, chg: c.chg, d: c.d }); else secFail.push(sym); } catch { secFail.push(sym); } }));
  secOut.sort((a, b) => b.chg - a.chg);
  const news = {}, newsFail = {};   // 큰 움직임 종목의 기사 — 실패해도 나머지 수집에는 영향 없음
  const movers = pickMovers(got, new Set(index.map((x) => x[0])));
  for (let i = 0; i < movers.length; i += 4) await Promise.all(movers.slice(i, i + 4).map(async (s) => { const r = await getNews(s, nowMs, fetchImpl); if (r.items.length) news[s] = r.items; else newsFail[s] = r.errs || []; }));
  const market = {};   // 원/달러·WTI 유가 (야후). 실패하면 비워 둔다(화면에서는 '—')
  for (const [sym, name] of [["KRW=X", "원/달러"], ["CL=F", "WTI 유가"]]) { try { const r = await getBars(sym, fetchImpl); const c = r.bars.length ? lastChange(r.bars) : null; if (c) market[name] = { close: c.close, chg: c.chg }; } catch { /* 건너뜀 */ } }
  const krIdx = {}, krFail = {};
  for (const [sym, name] of krIndex) { const k = await getKrIdx(sym, fetchImpl); if (k.rows.length) krIdx[name] = k.rows; else krFail[name] = k.err; }
  const night = await getKr200(fetchImpl, nowMs);
  const nightStocks = {};   // 삼성전자·SK하이닉스 해외 무기한선물(대용 지표). 못 받으면 빠진다
  for (const [k, coin] of [["삼성전자", "xyz:SMSN"], ["SK하이닉스", "xyz:SKHX"]]) { const v = await getKr200(fetchImpl, nowMs, coin); if (v) nightStocks[k] = { chg: v.chg, price: v.price }; }
  return { at: nowMs, market, ...(night ? { night } : {}), ...(Object.keys(nightStocks).length ? { nightStocks } : {}), news, ...(Object.keys(newsFail).length ? { newsFail } : {}), movers, krIdx, ...(Object.keys(krFail).length ? { krFail } : {}), session: dates.at(-1) || "", indices: index.map(([s, n]) => (got[s] ? { sym: s, name: n, chg: got[s].chg } : null)).filter(Boolean), themes: th, failed: Object.keys(fail).length, failDetail: fail, ok: Object.keys(got).length, total: syms.length, sectors: secOut, ...(secFail.length ? { sectorsFail: secFail } : {}) };
}
/** 새로 받은 결과 r 을 이전 파일 prev 와 합친다. 미국 종목을 하나도 못 받았으면 이전 미국 요약을 그대로 두고(stale 표시), 지수 일봉은 새로 받은 것만 덮어쓴다.
 *  반환 {out, usable}: usable=false 면 새로 얻은 것도, 이전에 있던 것도 없다 → 실패 처리 */
export function mergeWithPrev(r, prev) {
  if (!(r.sectors?.length) && Array.isArray(prev?.sectors) && prev.sectors.length) r = { ...r, sectors: prev.sectors };   // 업종을 못 받으면 이전 값 유지
  if (!r.night && prev?.night) r = { ...r, night: prev.night, nightStale: true };
  if (!r.nightStocks && prev?.nightStocks) r = { ...r, nightStocks: prev.nightStocks, nightStale: true };
  const hasUs = r.ok > 0, hasKr = Object.keys(r.krIdx || {}).length > 0;
  if (hasUs && hasKr) return { out: r, usable: true, note: "" };
  const p = prev && typeof prev === "object" ? prev : {};
  const out = { ...r };
  if (!hasKr && p.krIdx && Object.keys(p.krIdx).length) out.krIdx = p.krIdx;
  if (!hasUs && Array.isArray(p.themes) && p.themes.length) { out.themes = p.themes; out.indices = p.indices || []; out.session = p.session || ""; out.stale = true; if (p.news && !Object.keys(out.news || {}).length) out.news = p.news; out.staleAt = p.at || null; }
  const usable = hasUs || hasKr || Object.keys(out.krIdx || {}).length > 0 || out.stale === true;
  return { out, usable, note: !hasUs ? "미국 종목을 하나도 못 받음 — 이전 요약 유지" : !hasKr ? "국내 지수 일봉을 못 받음 — 이전 것 유지" : "" };
}
if (process.argv[1] && process.argv[1].endsWith("collect-us.mjs")) {
  const out = process.argv[2] || "us.json";
  (async () => {
    const r = await collectUs();
    console.log(`OK ${r.ok}/${r.total} 종목 · 기준일 ${r.session} · 상위 테마: ${r.themes.slice(0, 3).map((t) => `${t.name} ${t.avg}%`).join(", ")}`);
    console.log(`국내 지수 일봉: ${Object.entries(r.krIdx).map(([k, v]) => `${k} ${v.length}일(마지막 ${v[v.length - 1][0]})`).join(", ") || "없음"}${r.krFail ? ` · 실패 ${JSON.stringify(r.krFail)}` : ""}`);
    console.log(`큰 움직임(±${MOVER_PCT}%) ${r.movers.length}종목 중 기사 ${Object.keys(r.news).length}종목 받음${r.newsFail ? ` · 실패 예) ${Object.entries(r.newsFail).slice(0, 3).map(([k, v]) => `${k}: ${v.join(" / ")}`).join(" | ")}` : ""}`);
    console.log(`삼성/하이닉스 선물형: ${Object.entries(r.nightStocks || {}).map(([k, v]) => `${k} ${v.chg}%`).join(", ") || "못 받음"}`);
    console.log(r.night ? `KOSPI200 24h(해외) ${r.night.price} · 마감 대비 ${r.night.chg}%` : "KOSPI200 24h(해외) 못 받음");
    console.log(`업종·산업 ETF ${r.sectors.length}/${US_SECTORS.length}개 받음${r.sectors.length ? ` · 가장 센 곳: ${r.sectors.slice(0, 3).map((x) => `${x.name} ${x.chg}%`).join(", ")}` : ""}${r.sectorsFail ? ` · 실패 ${r.sectorsFail.join(",")}` : ""}`);
    if (r.failed) { const ex = Object.entries(r.failDetail).slice(0, 5).map(([k, v]) => `${k}: ${v.join(" / ")}`); console.log(`실패 ${r.failed}개 — 예) ${ex.join(" | ")}`); }
    let prev = null; try { prev = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* 이전 파일 없음 */ }
    const m = mergeWithPrev(r, prev);
    if (!m.usable) { console.log("::error::받은 데이터가 하나도 없고 이전 파일도 없음 — 위의 '실패' 줄 참고"); process.exit(1); }
    fs.writeFileSync(out, JSON.stringify(m.out));
    if (m.note) console.log(`::warning::${m.note}`);
  })().catch((e) => { console.log(`::error::수집 중 오류: ${String(e?.stack || e).slice(0, 400)}`); process.exit(1); });
}
