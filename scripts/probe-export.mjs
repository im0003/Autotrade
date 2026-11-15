// 관세청 신성질별 국가별 수출입실적 API 응답 확인용(조회만, 키는 출력하지 않음).
// 사용: DATA_GO_KR_KEY=... PROBE="코드:국가:시작-끝, ..." node scripts/probe-export.mjs
const KEY = process.env.DATA_GO_KR_KEY || "";
if (!KEY) { console.log("DATA_GO_KR_KEY 가 비어 있습니다"); process.exit(1); }
const BASE = "https://apis.data.go.kr/1220000/nnewtempertrade/getNnewtempertradeList";
const key = KEY.includes("%") ? KEY : encodeURIComponent(KEY);
const DEFAULT = "11010101:AE:201601-201601, 34010101:US:202510-202510, 34010102:US:202510-202510, 31040201:CN:202510-202510, 31049001:CN:202510-202510, 34010101:US:202501-202510, 34010101:US:202609-202609";
const list = (process.env.PROBE || DEFAULT).split(",").map((s) => s.trim()).filter(Boolean);
const mask = (s) => String(s).split(KEY).join("***").replace(/\s+/g, " ");
for (const c of list) {
  const [code, cnty, range] = c.split(":"), [a, b] = (range || "").split("-");
  const q = new URLSearchParams({ strtYymm: a, endYymm: b || a, imexTpcd: "1", imexTmprUnfcClsfCd: code, cntyCd: cnty });
  try {
    const r = await fetch(`${BASE}?serviceKey=${key}&${q}`, { signal: AbortSignal.timeout(20000) }); const t = mask(await r.text());
    const n = (t.match(/<item>/g) || []).length;
    console.log(`\n### ${c} → HTTP ${r.status} · 항목 ${n}건\n${t.slice(0, n ? 1600 : 400)}`);
  } catch (e) { console.log(`\n### ${c} → 오류 ${e.message}`); }
}
