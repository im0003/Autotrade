// 야간선물 주소 찾기 5차 (조회만 합니다, 저장 없음)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const get = async (url, headers = {}, init = {}) => { const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*", ...headers }, signal: AbortSignal.timeout(20000), redirect: "follow", ...init }); return { r, body: await r.text() }; };
const cut = (t, n = 500) => String(t).replace(/\s+/g, " ").slice(0, n);
console.log(`지금 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16)} (KST)`);

// ① stockhub 티커 시세: 항목 이름 전부 + 한국/코스피 관련 항목
try {
  const { r, body } = await get("https://stockhub.kr/api/ticker-strip/quotes", { referer: "https://stockhub.kr/markets/kospi-futures" });
  console.log(`\n■ stockhub ticker-strip/quotes · HTTP ${r.status} · ${body.length}자`);
  const j = JSON.parse(body);
  console.log(`  checkedAt ${j.checkedAt} · 항목 ${j.items?.length}개`);
  for (const it of j.items || []) console.log(`   - ${it.key} | ${it.name} | ${it.market} | mark ${it.mark ?? it.price ?? ""} | 전일 ${it.prevDay ?? ""} | ${typeof it.changePct === "number" ? it.changePct.toFixed(2) + "%" : it.changePct} | 출처 ${it.sourceId} | 갱신 ${it.sourceAsOf || it.receivedAt || ""}`);
  const kr = (j.items || []).filter((it) => /KOSPI|코스피|KR|한국|200/i.test(JSON.stringify(it)));
  console.log(`  한국 관련 항목 ${kr.length}개`); kr.forEach((it) => console.log(`   * ${cut(JSON.stringify(it), 600)}`));
} catch (e) { console.log(`stockhub 시세 실패: ${String(e.message).slice(0, 120)}`); }

// ② stockhub: 심볼을 넣는 market-data 에 야간선물 후보 시험
for (const q of ["KOSPI200", "K200", "KOSPI-NIGHT", "kospi-night", "NIGHT"]) {
  try { const { r, body } = await get(`https://stockhub.kr/api/market-data?symbols=${q}`, { referer: "https://stockhub.kr/markets/kospi-futures" }); console.log(`  ▶ market-data?symbols=${q} → HTTP ${r.status} · ${cut(body, 250)}`); } catch (e) { console.log(`  ▶ ${q} 실패: ${String(e.message).slice(0, 80)}`); }
}

// ② esignal: 야간 예상 차트 스크립트와 ajax 호출 방식
try {
  const u = "https://esignal.co.kr/wp-includes/js/chart/kospif_ngt_est.js?v=1.01";
  const { r, body } = await get(u, { referer: "https://esignal.co.kr/kospi200-futures-night/" });
  console.log(`\n■ esignal kospif_ngt_est.js · HTTP ${r.status} · ${body.length}자`);
  console.log(`  ajax/주소 단서: ${[...body.matchAll(/(admin-ajax\.php[^"'\s;)]*|action\s*[:=]\s*["'][^"']+["']|url\s*:\s*[^,}]+|fetch\([^)]{0,120}\)|\.getJSON\([^)]{0,120}\)|\.post\([^)]{0,140}\))/gi)].slice(0, 12).map((m) => cut(m[1], 160)).join("  ||  ") || "없음"}`);
  console.log(`  앞부분: ${cut(body, 1500)}`);
} catch (e) { console.log(`esignal 스크립트 실패: ${String(e.message).slice(0, 120)}`); }
