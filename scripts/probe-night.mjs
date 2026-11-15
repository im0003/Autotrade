// 야간선물 종가 주소 찾기 4차 (조회만 합니다, 저장 없음): 페이지가 쓰는 스크립트를 열어 실제 데이터 주소를 찾아 바로 시험 조회한다.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const get = async (url, headers = {}) => { const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*", ...headers }, signal: AbortSignal.timeout(20000), redirect: "follow" }); return { r, body: await r.text() }; };
const cut = (t, n = 500) => String(t).replace(/\s+/g, " ").slice(0, n);
const abs = (u, base) => { try { return new URL(u, base).href; } catch { return ""; } };
const uniq = (a) => [...new Set(a)];
console.log(`지금 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16)} (KST)`);

// ① stockhub: 페이지 스크립트에서 /api/ 경로를 찾아 바로 호출
try {
  const base = "https://stockhub.kr/markets/kospi-futures";
  const { body } = await get(base);
  const srcs = uniq([...body.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)].map((m) => abs(m[1], base)).filter(Boolean));
  console.log(`\n■ stockhub: 스크립트 ${srcs.length}개`);
  const apis = new Set();
  for (const s of srcs.slice(0, 25)) { try { const { body: js } = await get(s); for (const m of js.matchAll(/["'`](\/api\/[A-Za-z0-9_\-/.?=&${}]*)["'`]/g)) apis.add(m[1]); for (const m of js.matchAll(/["'`](https?:\/\/[A-Za-z0-9_.\-]+\/(?:api|v1|v2)[A-Za-z0-9_\-/.?=&]*)["'`]/g)) apis.add(m[1]); } catch { /* 건너뜀 */ } }
  const list = [...apis].filter((u) => !/\.(png|jpg|svg)/.test(u));
  console.log(`  /api 경로 후보 ${list.length}개:`); list.slice(0, 40).forEach((u) => console.log(`   - ${u}`));
  for (const u of list.filter((x) => /night|future|kospi|market|index|quote/i.test(x) && !/[${}]/.test(x)).slice(0, 8)) { try { const full = u.startsWith("/") ? "https://stockhub.kr" + u : u; const { r, body: b } = await get(full, { referer: base }); console.log(`  ▶ ${full} → HTTP ${r.status} · ${cut(b, 400)}`); } catch (e) { console.log(`  ▶ ${u} 실패: ${String(e.message).slice(0, 80)}`); } }
} catch (e) { console.log(`stockhub 실패: ${String(e.message).slice(0, 100)}`); }

// ② esignal 야간선물 전용 페이지: 스크립트·ajax·웹소켓 단서
for (const base of ["https://esignal.co.kr/kospi200-futures-night/", "https://esignal.co.kr/kospi200-futures-day-night/"]) {
  try {
    const { r, body } = await get(base);
    console.log(`\n■ ${base} · HTTP ${r.status} · ${body.length}자`);
    const clues = uniq([...body.matchAll(/(wss?:\/\/[^"'\s<>]+|admin-ajax\.php[^"'\s<>]*|["'](?:https?:)?\/\/[A-Za-z0-9_.\-]+\/[^"'\s<>]*(?:api|json|data|chart|quote|price)[^"'\s<>]*["']|fetch\(["'][^"']+["']|\.ajax\(\{[^}]{0,120})/gi)].map((m) => cut(m[1], 160))).filter((x) => !/google|facebook|doubleclick|jquery|cloudflare|gstatic/i.test(x));
    console.log(`  단서 ${clues.length}개:`); clues.slice(0, 25).forEach((c) => console.log(`   - ${c}`));
    const sc = [...body.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => abs(m[1], base)).filter((u) => /esignal/.test(u) && !/wp-includes|jquery|elementor|wp-content\/plugins\/(?:wp-|contact)/.test(u));
    console.log(`  자체 스크립트 ${sc.length}개:`); sc.slice(0, 15).forEach((u) => console.log(`   - ${u}`));
    const tx = body.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const i = tx.indexOf("현재가"); if (i >= 0) console.log(`  '현재가' 주변: ${tx.slice(Math.max(0, i - 80), i + 200)}`);
  } catch (e) { console.log(`\n■ ${base}\n  실패: ${String(e.message).slice(0, 100)}`); }
}

// ③ 다음 금융: 지수·선물 페이지가 부르는 api
try {
  const { body } = await get("https://finance.daum.net/domestic/futures");
  const f = uniq([...body.matchAll(/["'](\/(?:api|quotes)[A-Za-z0-9_\-/.?=&]*)["']/g)].map((m) => m[1]));
  console.log(`\n■ 다음 금융 futures 페이지 단서: ${cut(body.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " "), 300)}\n  api 후보: ${f.slice(0, 15).join(", ") || "없음"}`);
  for (const u of ["https://finance.daum.net/api/quotes/FUTURES", "https://finance.daum.net/api/domestic/futures/summaries"]) { try { const { r, body: b } = await get(u, { referer: "https://finance.daum.net/domestic/futures" }); console.log(`  ▶ ${u} → HTTP ${r.status} · ${cut(b, 300)}`); } catch (e) { console.log(`  ▶ ${u} 실패: ${String(e.message).slice(0, 80)}`); } }
} catch (e) { console.log(`다음 실패: ${String(e.message).slice(0, 100)}`); }
