// news.json(36시간만 보관)의 새 항목을 하루 단위 파일(archive/YYYYMMDD.json)에 계속 쌓는다.
//  - 항목마다 "처음 본 시각(seenAt)"을 기록한다. 공시는 접수 시각이 날짜뿐이라 이 값이 시각 대용이다
//    (실행 간격 이내 오차: 장중 10분, 17시 이후 30분).
//  - 사용: node scripts/archive-news.mjs [news.json] [archive 폴더]
import fs from "node:fs";
import path from "node:path";

export const kstDate = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
export const compact = (x, seenAt, extra = {}) => ({ id: x.id, kind: x.kind, src: x.src, lang: x.lang, code: x.code, corp: x.corp, title: x.title, report: x.report, link: x.link, ts: x.ts ?? null, rcept: x.rcept, seenAt, ...extra });

/** 최근 며칠치 보관 파일에 이미 있는 id */
export function loadIds(dir, nowMs, days = 4) {
  const ids = new Set();
  for (let d = 0; d <= days; d++) for (const x of readJson(path.join(dir, kstDate(nowMs - d * 864e5) + ".json"))?.items || []) ids.add(x.id);
  return ids;
}

export function archive({ news, dir, nowMs = Date.now() }) {
  fs.mkdirSync(dir, { recursive: true });
  const seen = loadIds(dir, nowMs);
  const add = [];
  for (const x of news?.items || []) { if (!x?.id || seen.has(x.id)) continue; seen.add(x.id); add.push(compact(x, nowMs)); }
  if (!add.length) return { added: 0 };
  const f = path.join(dir, kstDate(nowMs) + ".json");
  const cur = readJson(f) || { date: kstDate(nowMs), items: [] };
  cur.items.push(...add);
  fs.writeFileSync(f, JSON.stringify(cur));
  return { added: add.length, file: f };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const news = readJson(process.argv[2] || "news.json");
  if (!news) { console.error("news.json을 읽지 못했습니다 — 건너뜁니다."); process.exit(0); }
  const r = archive({ news, dir: process.argv[3] || "archive" });
  console.log(`보관: ${r.added}건 추가${r.file ? " → " + r.file : ""}`);
}
