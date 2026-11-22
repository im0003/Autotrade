// DART 공시를 날짜별로 한꺼번에 받아 archive/dart-backfill.json 에 저장한다(1회성, 이어받기 가능).
//  - 목록 API는 접수일(날짜)만 준다. 시각은 없다.
//  - 사용: DART_API_KEY=... node scripts/backfill-dart.mjs --from 20260601 --to 20261120 [--codes 파일] [--out 경로]
//    --codes: 줄마다 종목코드가 적힌 .txt, 또는 앱 '갭상승 사건 목록' .json(events/controls의 code를 사용). 없으면 코스피·코스닥 전체.
import fs from "node:fs";
import path from "node:path";
import { cleanKey } from "./collect-news.mjs";

const clean = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function weekdays(from, to) {
  const out = [], d = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  for (let t = d(from); t <= d(to); t += 864e5) { const w = new Date(t).getUTCDay(); if (w >= 1 && w <= 5) out.push(new Date(t).toISOString().slice(0, 10).replace(/-/g, "")); }
  return out;
}
export function readCodes(file) {
  if (!file) return null;
  const txt = fs.readFileSync(file, "utf8");
  if (/^\s*[{[]/.test(txt)) { const j = JSON.parse(txt), s = new Set(); for (const x of [...(j.events || []), ...(j.controls || [])]) x.code && s.add(String(x.code)); return s; }
  return new Set(txt.split(/\s+/).filter((x) => /^\d{6}$/.test(x)));
}

/** 하루치 전체 목록(코스피 Y, 코스닥 K). status 020(한도 초과)이면 limit:true 로 알린다. */
export async function fetchDay(key, date, fetchText, sleepMs = 0) {
  const items = [];
  for (const cls of ["Y", "K"]) {
    for (let page = 1; page <= 60; page++) {
      const u = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${encodeURIComponent(key)}&bgn_de=${date}&end_de=${date}&corp_cls=${cls}&page_no=${page}&page_count=100`;
      const j = JSON.parse(await fetchText(u));
      if (j.status === "013") break;
      if (j.status === "020") return { items, limit: true };
      if (j.status !== "000") throw new Error(`DART ${j.status} ${j.message || ""}`);
      for (const x of j.list || []) if (x.stock_code) items.push({ rcept: x.rcept_no, date: x.rcept_dt || date, code: x.stock_code, corp: x.corp_name, report: clean(x.report_nm) });
      if ((j.list || []).length < 100) break;
      if (sleepMs) await wait(sleepMs);
    }
  }
  return { items, limit: false };
}

export async function backfill({ key, from, to, codes = null, out = "archive/dart-backfill.json", fetchText, sleepMs = 250, log = () => {} }) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let cur = { done: [], items: [] };
  try { cur = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* 처음 */ }
  const done = new Set(cur.done), have = new Set(cur.items.map((x) => x.rcept));
  let stopped = null, n = 0;
  for (const d of weekdays(from, to)) {
    if (done.has(d)) continue;
    let r;
    try { r = await fetchDay(key, d, fetchText, sleepMs); } catch (e) { stopped = `${d}: ${String(e.message || e).replace(key, "***")}`; break; }
    for (const x of r.items) { if (codes && !codes.has(x.code)) continue; if (have.has(x.rcept)) continue; have.add(x.rcept); cur.items.push(x); n++; }
    if (r.limit) { stopped = `${d}: 하루 호출 한도 초과 — 내일 다시 실행하면 이어서 받습니다`; break; }
    done.add(d); cur.done = [...done].sort();
    fs.writeFileSync(out, JSON.stringify(cur));
    log(`${d} 완료 · 누적 ${cur.items.length}건`);
    if (sleepMs) await wait(sleepMs);
  }
  cur.done = [...done].sort();
  fs.writeFileSync(out, JSON.stringify(cur));
  return { added: n, total: cur.items.length, days: cur.done.length, stopped };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const key = cleanKey(process.env.DART_API_KEY || "");
  if (!key) { console.error("DART_API_KEY가 없습니다."); process.exit(1); }
  const from = opt("--from"), to = opt("--to");
  if (!/^\d{8}$/.test(from || "") || !/^\d{8}$/.test(to || "")) { console.error("--from YYYYMMDD --to YYYYMMDD 가 필요합니다."); process.exit(1); }
  const codes = readCodes(opt("--codes"));
  if (codes) console.log(`대상 종목 ${codes.size}개`);
  const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };
  const r = await backfill({ key, from, to, codes, out: opt("--out") || "archive/dart-backfill.json", fetchText: get, log: console.log });
  console.log(`끝: ${r.added}건 추가 · 누적 ${r.total}건 · ${r.days}일 완료${r.stopped ? " · 중단: " + r.stopped : ""}`);
  if (r.stopped) process.exitCode = 0;
}
