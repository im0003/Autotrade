// 야간선물 대체 후보 6차: Hyperliquid xyz:KR200 (조회만 합니다, 저장 없음)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const cut = (t, n = 500) => String(t).replace(/\s+/g, " ").slice(0, n);
console.log(`지금 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16)} (KST)`);
const post = async (body) => {
  const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json", "user-agent": UA }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { r, text: await r.text() };
};

// ① xyz 시장 목록 + 현재 시세(markPx, prevDayPx)
try {
  const { r, text } = await post({ type: "metaAndAssetCtxs", dex: "xyz" });
  console.log(`\n■ metaAndAssetCtxs(dex=xyz) · HTTP ${r.status} · ${text.length}자`);
  const [meta, ctxs] = JSON.parse(text);
  const names = meta.universe.map((u) => u.name);
  console.log(`  종목 ${names.length}개: ${names.slice(0, 60).join(", ")}`);
  meta.universe.forEach((u, i) => {
    if (!/KR|KOSPI|KRW/i.test(u.name)) return;
    const c = ctxs[i], mark = +c.markPx, prev = +c.prevDayPx;
    console.log(`  ★ ${u.name} | mark ${c.markPx} | 전일(24h전) ${c.prevDayPx} | 변화 ${prev ? ((mark / prev - 1) * 100).toFixed(2) + "%" : "-"} | oracle ${c.oraclePx} | 24h 거래대금 ${c.dayNtlVlm} | 미결제 ${c.openInterest}`);
  });
} catch (e) { console.log(`시세 실패: ${String(e.message).slice(0, 150)}`); }

// ② 1시간봉 최근 36개 (어제 장 마감 이후 흐름 확인)
try {
  const end = Date.now(), start = end - 36 * 3600e3;
  const { r, text } = await post({ type: "candleSnapshot", req: { coin: "xyz:KR200", interval: "1h", startTime: start, endTime: end } });
  console.log(`\n■ candleSnapshot xyz:KR200 1h · HTTP ${r.status}`);
  const rows = JSON.parse(text);
  console.log(`  봉 ${rows.length}개`);
  rows.slice(-36).forEach((k) => console.log(`   ${new Date(k.t + 9 * 3600e3).toISOString().slice(5, 16)} KST  시가 ${k.o} 고가 ${k.h} 저가 ${k.l} 종가 ${k.c}`));
} catch (e) { console.log(`캔들 실패: ${String(e.message).slice(0, 150)}`); }
