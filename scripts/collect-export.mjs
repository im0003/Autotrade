// 관세청 수출 실적 수집기 — GitHub Actions 에서 실행되어 export.json 을 만든다. (조회만 합니다)
//  - 신성질별 국가별 수출입실적(공공데이터포털 15101607). 국가를 꼭 넣어야 해서 국가별로 받아 더한다.
//  - 첫 실행(또는 FULL=1)은 모든 국가를 조회하고, 이후에는 수출이 있었던 국가만 조회한다(호출 수 절약).
//  - 새 달 자료가 올라오지 않았으면 한 번만 조회해 보고 끝낸다.
//  - 사용: DATA_GO_KR_KEY=... node scripts/collect-export.mjs [export.json]
import fs from "node:fs";

const BASE = "https://apis.data.go.kr/1220000/nnewtempertrade/getNnewtempertradeList";
export const COUNTRIES = "AD AE AF AG AI AL AM AN AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CS CT CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET EU FI FJ FK FM FO FR FX GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP JT KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MI MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NQ NR NT NU NZ OM PA PE PF PG PH PK PL PM PN PO PR PS PT PW PY PZ QA RA RE RK RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TP TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WK WS YE YM YT YU Z1 ZA ZM ZR ZW ZZ".split(" ");
/** 묶음 이름 · 연결 테마(없으면 null) · 관세청 신성질 세세분류 코드. 코드표(성질통합분류코드)에서 골랐다 */
export const GROUPS = [
  { key: "memory", name: "메모리반도체", themeId: "memory", codes: ["34010101"] },
  { key: "sysemi", name: "시스템반도체", themeId: "aichip", codes: ["34010102"] },
  { key: "semieq", name: "반도체 제조장비(부품 포함)", themeId: "semieq", codes: ["32050701", "32050702"] },
  { key: "display", name: "평판디스플레이", themeId: null, codes: ["34020101", "34020190", "34020102"] },
  { key: "battery", name: "일차전지·축전지(2차전지)", themeId: "battery", codes: ["32040601"] },
  { key: "ship", name: "선박", themeId: null, codes: ["31040101", "31040201", "31040301", "31040601", "31049001", "31040701"] },
  { key: "shipeng", name: "선박 엔진", themeId: null, codes: ["31060401"] },
  { key: "oil", name: "석유제품", themeId: null, codes: ["23020201", "23020202", "23020203", "23020204", "23020205", "23020206", "23020290"] },
  { key: "car", name: "승용차(신차)·전기차", themeId: "battery", codes: ["12020101", "12020102", "12020103", "12020104", "12020105", "12020106", "12020301", "12020302", "12020303", "12020304", "12020501"] },
];

const ym = (y, m) => `${y}.${String(m).padStart(2, "0")}`;
/** now 기준 지난달부터 거꾸로 n개월: ["2026.10", "2026.09", …] */
export function monthsBack(nowMs, n) {
  const d = new Date(nowMs + 9 * 3600000); let y = d.getUTCFullYear(), m = d.getUTCMonth();   // m: 0~11 → 지난달은 m(1~12 로 보면 이번 달 -1)
  const out = [];
  for (let i = 0; i < n; i++) { if (m === 0) { y--; m = 12; } out.push(ym(y, m)); m--; }
  return out;
}
const q6 = (s) => s.replace(".", "");
export const shiftYm = (ym, k) => { let y = +ym.slice(0, 4), m = +ym.slice(5) + k; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return ym.slice(0, 0) + `${y}.${String(m).padStart(2, "0")}`; };

/** 응답 XML → 항목 배열 / 결과 코드 */
export function parseItems(xml) {
  const code = (/<resultCode>([^<]*)<\/resultCode>/.exec(xml) || [])[1] ?? "";
  const items = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const g = (t) => (new RegExp(`<${t}>([^<]*)</${t}>`).exec(m[1]) || [])[1] ?? "";
    return { ym: g("year"), usd: Number(g("dlr")) || 0, cnty: g("statCd"), cntyKor: g("statCdCntnKor1") };
  }).filter((x) => /^\d{4}\.\d{2}$/.test(x.ym));
  return { code, items, msg: (/<resultMsg>([^<]*)<\/resultMsg>/.exec(xml) || [])[1] ?? "" };
}

export class LimitError extends Error {}
async function call({ key, code, cnty, from, to, fetchImpl, tries = 5 }) {
  const q = new URLSearchParams({ strtYymm: q6(from), endYymm: q6(to), imexTpcd: "1", imexTmprUnfcClsfCd: code, cntyCd: cnty });
  let last = "";
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetchImpl(`${BASE}?serviceKey=${key}&${q}`, { signal: AbortSignal.timeout(25000) });
      const body = await r.text(), p = parseItems(body);
      if (p.code === "00") return p.items;
      if (/22|LIMIT/.test(p.code) || /한도|초과/.test(p.msg)) throw new LimitError(`호출 한도 초과 (${p.code} ${p.msg})`);
      if (r.status === 429 || (!p.code && /Too Many|429/i.test(body))) { last = "요청이 너무 잦음 (HTTP 429)"; await new Promise((z) => setTimeout(z, 3000 * (t + 1))); continue; }   // 잠깐 쉬고 다시
      last = `결과 ${p.code} ${p.msg}`;
      if (!p.code) last = `응답 형식 이상 (HTTP ${r.status}): ${String(body).replace(/\s+/g, " ").slice(0, 200)}`;
      const e = new Error(last); e.noRetry = true; throw e;
    } catch (e) { if (e instanceof LimitError || e.noRetry) throw e; last = e.message; }
    await new Promise((r) => setTimeout(r, 800 * (t + 1)));
  }
  throw new Error(last || "조회 실패");
}

/** 묶음별·월별 합계(달러) + 마지막 달 상위 3개국 */
export async function collect({ key, nowMs = Date.now(), prev = null, full = false, only = null, fetchImpl = fetch, span = 12, conc = 3, log = console.log } = {}) {
  const groups = only?.length ? GROUPS.filter((g) => only.includes(g.key)) : GROUPS;   // only: 일부 묶음만 새로 받고 나머지는 저장된 값을 유지(여러 번에 나눠 돌릴 때)
  // 자료가 실제로 올라온 가장 최근 달을 찾는다(지난달이 아직 없을 수 있다). 올라오지 않은 달을 기간 끝으로 넣으면 조회가 전부 실패한다.
  const cand = monthsBack(nowMs, 3); let to = "";
  for (const m of cand) {
    try { const probe = await call({ key, code: "34010101", cnty: "US", from: m, to: m, fetchImpl }); if (probe.length) { to = m; break; } }
    catch (e) { if (e instanceof LimitError) throw e; log(`  ${m} 확인 실패: ${e.message}`); }
  }
  if (!to) { log(`최근 3개월(${cand[cand.length - 1]} ~ ${cand[0]}) 중 올라온 자료를 못 찾았습니다`); return null; }
  const from = shiftYm(to, -11), fromB = shiftYm(to, -14), toB = shiftYm(to, -12);   // 관세청은 한 번에 1년 이내만 가능 → 12개월 + 이전 3개월(작년 같은 달 비교용)
  if (!full && !only && prev?.latest && prev.latest >= to) { log(`새 달 없음 (저장된 최신 ${prev.latest}, 올라온 최신 ${to})`); return null; }
  const active = prev?.active || {};
  const jobs = [];
  for (const g of groups) for (const code of g.codes) { const list = !full && active[code]?.length ? active[code] : COUNTRIES; for (const c of list) jobs.push({ g, code, cnty: c }); }
  log(`조회 ${jobs.length}건 (${fromB} ~ ${to}) ${full || !prev ? "전체 국가" : "수출 있었던 국가만"}`);
  const sums = Object.fromEntries(GROUPS.map((g) => [g.key, {}])), tops = Object.fromEntries(GROUPS.map((g) => [g.key, {}])), act = {};
  let i = 0, fail = 0, done = 0; const t0 = Date.now(), errs = new Map();
  const worker = async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      try {
        let items = await call({ key, code: j.code, cnty: j.cnty, from, to, fetchImpl });
        if (items.some((x) => x.usd > 0)) items = items.concat(await call({ key, code: j.code, cnty: j.cnty, from: fromB, to: toB, fetchImpl }));
        for (const it of items) {
          sums[j.g.key][it.ym] = (sums[j.g.key][it.ym] || 0) + it.usd;
          if (it.usd > 0) { (act[j.code] ||= new Set()).add(j.cnty); const t = (tops[j.g.key][it.ym] ||= {}); t[it.cntyKor || it.cnty] = (t[it.cntyKor || it.cnty] || 0) + it.usd; }
        }
      } catch (e) { if (e instanceof LimitError) throw e; fail++; const k = String(e.message).slice(0, 90); errs.set(k, (errs.get(k) || 0) + 1); }
      if (++done % 200 === 0) log(`  ${done}/${jobs.length} · ${Math.round((Date.now() - t0) / 1000)}초 · 실패 ${fail}`);
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  if (fail) log(`실패 ${fail}건 이유: ${[...errs].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => `${m} (${n}건)`).join(" / ")}`);
  if (fail > Math.max(5, jobs.length * 0.02)) throw new Error(`조회 실패가 너무 많습니다 (${fail}/${jobs.length}) — 저장하지 않습니다`);
  const fresh = (g) => groups.includes(g);
  const items = GROUPS.map((g) => {
    if (!fresh(g)) return prev?.items?.find((x) => x.key === g.key) || null;
    const s = sums[g.key], mths = Object.keys(s).sort();
    const last = mths[mths.length - 1], top = last ? Object.entries(tops[g.key][last] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => ({ n, usd: Math.round(v) })) : [];
    return { key: g.key, name: g.name, themeId: g.themeId, codes: g.codes, months: Object.fromEntries(mths.map((m) => [m, Math.round(s[m])])), top };
  }).filter(Boolean);
  const all = [...new Set(items.flatMap((x) => Object.keys(x.months)))].sort();
  const latest = all.filter((m) => items.some((x) => x.months[m] > 0)).pop() || "";
  // 다음 달 이후에는 수출이 있었던 국가만 조회한다 (이번에 전체를 돌렸을 때만 갱신)
  const newAct = Object.fromEntries(Object.entries(act).map(([c, s]) => [c, [...s].sort()]));
  const nextActive = full || !prev?.active || only ? { ...(prev?.active || {}), ...newAct } : prev.active;
  return { updated: new Date(nowMs).toISOString(), latest, unit: "USD", source: "관세청 신성질별 국가별 수출입실적(수출, 달러)", items, active: nextActive };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key0 = process.env.DATA_GO_KR_KEY || "";
  if (!key0) { console.log("DATA_GO_KR_KEY 가 비어 있습니다"); process.exit(1); }
  const key = key0.includes("%") ? key0 : encodeURIComponent(key0), out = process.argv[2] || "export.json";
  let prev = null; try { prev = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* 첫 실행 */ }
  const mask = (s) => String(s).split(key0).join("***");
  try {
    const only = (process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean);
    const r = await collect({ key, prev, full: process.env.FULL === "1" || !prev || only.length > 0, only, log: (s) => console.log(mask(s)) });
    if (!r) process.exit(0);
    fs.writeFileSync(out, JSON.stringify(r));
    console.log(`저장 ${out} · 최신 ${r.latest} · ${r.items.map((x) => `${x.name} ${Math.round((x.months[r.latest] || 0) / 1e6)}백만$`).join(" / ")}`);
  } catch (e) { console.log("실패:", mask(e.message)); process.exit(1); }
}
