// 관세청 신성질별 국가별 수출입실적 API 응답 확인용(조회만 합니다, 키는 출력하지 않습니다).
// 사용: DATA_GO_KR_KEY=... node scripts/probe-export.mjs
const KEY = process.env.DATA_GO_KR_KEY || "";
if (!KEY) { console.log("DATA_GO_KR_KEY 가 비어 있습니다 (GitHub Settings → Secrets 확인)"); process.exit(1); }
const BASE = "https://apis.data.go.kr/1220000/nnewtempertrade";
const OPS = ["getNnewtempertradeList", ""];   // 공식 호출 이름 / 이름 없이
const key = KEY.includes("%") ? KEY : encodeURIComponent(KEY);
const cases = [
  ["반도체 34010000 · 미국 · 2025-10", { strtYymm: "202510", endYymm: "202510", imexTpcd: "1", imexTmprUnfcClsfCd: "34010000", cntyCd: "US" }],
  ["선박 31040000 · 중국 · 2025-10", { strtYymm: "202510", endYymm: "202510", imexTpcd: "1", imexTmprUnfcClsfCd: "31040000", cntyCd: "CN" }],
  ["반도체 · 국가 비움 · 2025-10", { strtYymm: "202510", endYymm: "202510", imexTpcd: "1", imexTmprUnfcClsfCd: "34010000", cntyCd: "" }],
  ["반도체 · 미국 · 2025-01~10 (여러 달)", { strtYymm: "202501", endYymm: "202510", imexTpcd: "1", imexTmprUnfcClsfCd: "34010000", cntyCd: "US" }],
  ["반도체 · 미국 · 2026-10 (최근 달)", { strtYymm: "202610", endYymm: "202610", imexTpcd: "1", imexTmprUnfcClsfCd: "34010000", cntyCd: "US" }],
];
const show = (s) => String(s).replace(new RegExp(KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "***").replace(/\s+/g, " ").slice(0, 1400);
let okOp = null;
for (const op of OPS) {
  const [name, q] = cases[0];
  const url = `${BASE}${op ? "/" + op : ""}?serviceKey=${key}&${new URLSearchParams(q)}`;
  try { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); const t = await r.text(); console.log(`\n### 호출 이름 "${op || "(없음)"}" → HTTP ${r.status}\n${show(t)}`); if (r.ok && /<item>|<resultCode>00/.test(t)) { okOp = op; break; } }
  catch (e) { console.log(`\n### 호출 이름 "${op || "(없음)"}" → 오류 ${e.message}`); }
}
if (okOp == null) { console.log("\n두 호출 방식 모두 정상 응답이 아닙니다. 위 내용을 알려 주세요."); process.exit(0); }
for (const [name, q] of cases.slice(1)) {
  const url = `${BASE}${okOp ? "/" + okOp : ""}?serviceKey=${key}&${new URLSearchParams(q)}`;
  try { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); console.log(`\n### ${name} → HTTP ${r.status}\n${show(await r.text())}`); }
  catch (e) { console.log(`\n### ${name} → 오류 ${e.message}`); }
}
