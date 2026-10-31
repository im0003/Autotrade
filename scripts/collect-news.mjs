// 뉴스(RSS) · 공시(DART) 수집기 — GitHub Actions에서 주기적으로 실행되어 news.json을 만든다.
//  - 기사는 '제목·링크·시각'만 저장한다(본문 저장 안 함). 공시는 제목(보고서명)·종목코드·접수번호.
//  - 피드 하나가 실패해도 나머지는 계속한다. 결과 파일에 피드별 성공/실패가 기록된다.
//  - 사용: DART_API_KEY=... node scripts/collect-news.mjs [출력경로 기본 news.json]
import fs from "node:fs";

export const FEEDS = [
  { name: "연합뉴스 경제", url: "https://www.yna.co.kr/rss/economy.xml", lang: "ko" },
  { name: "연합뉴스 마켓", url: "https://www.yna.co.kr/rss/market.xml", lang: "ko" },
  { name: "한국경제 증권", url: "https://www.hankyung.com/feed/finance", lang: "ko" },
  { name: "한국경제 경제", url: "https://www.hankyung.com/feed/economy", lang: "ko" },
  { name: "매일경제 증권", url: "https://www.mk.co.kr/rss/50200011/", lang: "ko" },
  { name: "이데일리 증권", url: "http://rss.edaily.co.kr/stock_news.xml", lang: "ko" },
  { name: "CNBC 시장", url: "https://www.cnbc.com/id/15839069/device/rss/rss.html", lang: "en" },
  { name: "CNBC 기술", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", lang: "en" },
];
const MAX_AGE_MS = 36 * 3600e3, MAX_ITEMS = 500;

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
const unesc = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENT[m]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const tag = (x, t) => { const m = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "i").exec(x); return m ? m[1] : ""; };

/** RSS 2.0 / Atom 텍스트 → [{title, link, ts}] */
export function parseFeed(xml) {
  const out = [];
  const blocks = String(xml).match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = unesc(tag(b, "title"));
    let link = unesc(tag(b, "link"));
    if (!link) { const m = /<link[^>]*href=["']([^"']+)["']/i.exec(b); link = m ? m[1] : ""; }
    const d = tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated");
    const ts = d ? Date.parse(unesc(d)) : NaN;
    if (title) out.push({ title, link, ts: Number.isFinite(ts) ? ts : null });
  }
  return out;
}

async function getText(url, ms = 15000) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; s26-news/1.0)", accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  let cs = /charset=([\w-]+)/i.exec(r.headers.get("content-type") || "")?.[1];
  if (!cs) cs = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(new TextDecoder("latin1").decode(buf.slice(0, 200)))?.[1];
  try { return new TextDecoder(cs || "utf-8").decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

/** 키 앞뒤 공백·따옴표·"Key" 접두어·줄바꿈 제거 */
export const cleanKey = (k) => { let s = String(k || "").replace(/[\s"']/g, ""); if (/^key/i.test(s) && s.length === 43) s = s.slice(3); return s; };
const kstDate = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
export async function fetchDart(key, nowMs = Date.now()) {
  const items = [];
  const bgn = kstDate(nowMs - 24 * 3600e3), end = kstDate(nowMs);
  for (let page = 1; page <= 3; page++) {
    const u = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${encodeURIComponent(key)}&bgn_de=${bgn}&end_de=${end}&page_no=${page}&page_count=100&sort=date&sort_mth=desc`;
    const j = JSON.parse(await getText(u));
    if (j.status === "013") break;                       // 조회된 데이터 없음
    if (j.status !== "000") throw new Error(`DART ${j.status} ${j.message || ""}`);
    for (const x of j.list || []) {
      if (!x.stock_code || !/^[YK]$/.test(x.corp_cls || "")) continue;   // 코스피·코스닥 상장사만
      const d = x.rcept_dt || "";
      items.push({ id: `dart:${x.rcept_no}`, src: "DART", kind: "dart", title: `${x.corp_name} ${unesc(x.report_nm)}`, corp: x.corp_name, code: x.stock_code, report: unesc(x.report_nm), link: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${x.rcept_no}`, ts: d ? Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T09:00:00+09:00`) : null, rcept: x.rcept_no });
    }
    if ((j.list || []).length < 100) break;
  }
  return items;
}

export async function collect({ prev = null, dartKey = "", nowMs = Date.now(), feeds = FEEDS, fetchText = getText, dartFn = fetchDart } = {}) {
  const status = [], fresh = [];
  await Promise.all(feeds.map(async (f) => {
    try {
      const xs = parseFeed(await fetchText(f.url));
      for (const x of xs) fresh.push({ id: `${f.name}:${x.link || x.title}`, src: f.name, kind: "news", lang: f.lang, title: x.title, link: x.link, ts: x.ts ?? nowMs });
      status.push({ name: f.name, ok: true, n: xs.length });
    } catch (e) { status.push({ name: f.name, ok: false, n: 0, err: String(e.message || e).slice(0, 80) }); }
  }));
  const rawKey = dartKey; dartKey = cleanKey(dartKey);
  if (dartKey) {
    try { const d = await dartFn(dartKey, nowMs); fresh.push(...d); status.push({ name: "DART 공시", ok: true, n: d.length, note: `키 ${dartKey.length}자` }); }
    catch (e) { status.push({ name: "DART 공시", ok: false, n: 0, err: String(e.message || e).replace(dartKey, "***").slice(0, 80) + ` (키 ${dartKey.length}자${dartKey !== String(rawKey || "") ? ", 자동 정리됨" : ""})` }); }
  } else status.push({ name: "DART 공시", ok: false, n: 0, err: "DART_API_KEY 없음" });
  const byId = new Map();
  for (const x of [...(prev?.items || []), ...fresh]) byId.set(x.id, x);       // 새 항목이 같은 id의 이전 항목을 덮어씀
  const live = [...byId.values()].filter((x) => nowMs - (x.ts || nowMs) <= MAX_AGE_MS).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  // 공시는 접수 시각이 그날 09:00으로 잡혀 기사보다 오래돼 보이므로, 종류별로 따로 자른다(안 그러면 기사가 500건을 채워 공시가 밀려난다)
  const items = [...live.filter((x) => x.kind === "dart").slice(0, 300), ...live.filter((x) => x.kind !== "dart").slice(0, MAX_ITEMS)].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return { updatedAt: nowMs, feeds: status, items };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const out = process.argv[2] || "news.json";
  let prev = null; try { prev = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* 첫 실행 */ }
  const res = await collect({ prev, dartKey: process.env.DART_API_KEY || "" });
  for (const s of res.feeds) console.log(`${s.ok ? "OK  " : "FAIL"} ${s.name} ${s.ok ? s.n + "건" : s.err}`);
  if (!res.feeds.some((s) => s.ok)) { console.error("모든 수집 실패 — 파일을 바꾸지 않습니다."); process.exit(1); }
  fs.writeFileSync(out, JSON.stringify(res));
  console.log(`저장: ${out} (${res.items.length}건)`);
}
