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
];
export const US_INDEX = [["^GSPC", "S&P500"], ["^IXIC", "나스닥종합"], ["^DJI", "다우"], ["^SOX", "필라델피아반도체"], ["SPY", "S&P500 ETF(SPY)"], ["QQQ", "나스닥100 ETF(QQQ)"], ["SOXX", "반도체 ETF(SOXX)"]];

const UA = "Mozilla/5.0 (compatible; s26-us/1.0)";
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
export async function collectUs({ fetchImpl = fetch, nowMs = Date.now(), themes = US_THEMES, index = US_INDEX } = {}) {
  const syms = [...new Set([...themes.flatMap((t) => t.syms), ...index.map((x) => x[0])])], got = {}, fail = {};
  for (let i = 0; i < syms.length; i += 4) await Promise.all(syms.slice(i, i + 4).map(async (s) => { const r = await getBars(s, fetchImpl); if (r.bars.length) got[s] = { ...lastChange(r.bars), src: r.src }; else fail[s] = r.errs; }));
  const th = themes.map((t) => { const mem = t.syms.map((s) => (got[s] ? { sym: s, chg: got[s].chg } : null)).filter(Boolean).sort((a, b) => b.chg - a.chg); const avg = mem.length ? +(mem.reduce((a, x) => a + x.chg, 0) / mem.length).toFixed(2) : null; return { id: t.id, name: t.name, kr: t.kr, n: mem.length, of: t.syms.length, avg, members: mem }; }).filter((t) => t.avg != null && t.n >= Math.min(2, t.of)).sort((a, b) => b.avg - a.avg);
  const dates = Object.values(got).map((g) => g.d).sort();
  return { at: nowMs, session: dates.at(-1) || "", indices: index.map(([s, n]) => (got[s] ? { sym: s, name: n, chg: got[s].chg } : null)).filter(Boolean), themes: th, failed: Object.keys(fail).length, failDetail: fail, ok: Object.keys(got).length, total: syms.length };
}
if (process.argv[1] && process.argv[1].endsWith("collect-us.mjs")) {
  const out = process.argv[2] || "us.json";
  collectUs().then((r) => { fs.writeFileSync(out, JSON.stringify(r)); console.log(`OK ${r.ok}/${r.total} 종목 · 기준일 ${r.session} · 상위 테마: ${r.themes.slice(0, 3).map((t) => `${t.name} ${t.avg}%`).join(", ")}`); if (r.failed) console.log("FAIL", JSON.stringify(r.failDetail).slice(0, 600)); if (!r.ok) process.exit(1); });
}
