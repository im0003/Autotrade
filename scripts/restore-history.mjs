// git 커밋 기록에 남아 있는 과거 news.json들을 훑어서 archive/ 에 복원한다(1회성).
//  - 수집기가 10~30분마다 news.json을 커밋하므로, 36시간이 지나 파일에서 사라진 항목도 커밋 기록에는 남아 있다.
//  - 항목의 seenAt = 그 항목이 처음 나타난 커밋 시각. restored:true 로 표시한다.
//  - 사용: node scripts/restore-history.mjs [news.json] [archive 폴더]   (checkout 시 fetch-depth: 0 필요)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { kstDate, compact } from "./archive-news.mjs";

const defRun = (args) => execFileSync("git", args, { maxBuffer: 512 * 1024 * 1024 }).toString("utf8");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

export function restore({ file = "news.json", dir = "archive", run = defRun, log = () => {} } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const lines = run(["log", "--reverse", "--format=%H %ct", "--", file]).trim().split("\n").filter(Boolean);
  const have = new Set();
  const byDay = new Map();
  const load = (d) => { if (!byDay.has(d)) byDay.set(d, readJson(path.join(dir, d + ".json")) || { date: d, items: [] }); return byDay.get(d); };
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (/^\d{8}\.json$/.test(f)) { const o = load(f.slice(0, 8)); for (const x of o.items) have.add(x.id); }
  let added = 0, bad = 0;
  lines.forEach((ln, i) => {
    const [h, ct] = ln.split(" ");
    let obj; try { obj = JSON.parse(run(["show", `${h}:${file}`])); } catch { bad++; return; }
    const seenAt = Number(ct) * 1000;
    for (const x of obj?.items || []) {
      if (!x?.id || have.has(x.id)) continue;
      have.add(x.id); load(kstDate(seenAt)).items.push(compact(x, seenAt, { restored: true })); added++;
    }
    if ((i + 1) % 200 === 0) log(`${i + 1}/${lines.length} 커밋 처리 · 복원 ${added}건`);
  });
  for (const [d, o] of byDay) fs.writeFileSync(path.join(dir, d + ".json"), JSON.stringify(o));
  return { commits: lines.length, added, unreadable: bad, days: byDay.size };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const r = restore({ file: process.argv[2] || "news.json", dir: process.argv[3] || "archive", log: console.log });
  console.log(`복원 완료: 커밋 ${r.commits}개 확인 · ${r.added}건 복원 · ${r.days}일치 파일 · 읽지 못한 커밋 ${r.unreadable}개`);
}
