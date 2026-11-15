// 야간선물 종가를 읽을 수 있는 주소 찾기 (조회만 합니다, 저장 없음)
//  2차 결과: 네이버는 주간 선물만 있고 야간은 없음(409), KRX 는 로그인 필요, apt2.me 는 차단.
//  3차: esignal·stockhub·다음금융 페이지 안에서 실제로 데이터를 불러오는 주소(api/ajax/json)를 찾아 보여 준다.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const pages = [
  "https://esignal.co.kr/",
  "https://esignal.co.kr/kospi200-night-futures/",
  "https://stockhub.kr/markets/kospi-futures",
  "https://finance.daum.net/domestic/futures",
  "https://finance.daum.net/",
  ...String(process.env.EXTRA || "").split(",").map((u) => u.trim()).filter(Boolean),
];
const get = async (url, headers = {}) => { const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json", ...headers }, signal: AbortSignal.timeout(20000), redirect: "follow" }); return { r, body: await r.text() }; };
const clean = (t) => String(t).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
console.log(`지금 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16)} (KST)`);
for (const url of pages) {
  try {
    const { r, body } = await get(url);
    console.log(`\n■ ${url}\n  HTTP ${r.status} · ${body.length}자`);
    const found = new Set();
    for (const m of body.matchAll(/["'(]((?:https?:)?\/\/[^"'()\s<>]+|\/[A-Za-z0-9_\-./]*(?:api|ajax|json|data|futures|night|quote)[A-Za-z0-9_\-./?=&%]*)["')]/gi)) { const u = m[1]; if (/(api|ajax|json|data|future|night|quote|price)/i.test(u) && !/\.(png|jpg|svg|css|woff2?|ico|gif)(\?|$)/i.test(u) && !/google|facebook|doubleclick|gstatic|cloudflare|jquery|cdn/i.test(u)) found.add(u.slice(0, 160)); if (found.size >= 40) break; }
    console.log(`  데이터 주소 후보 ${found.size}개:`); [...found].forEach((u) => console.log(`   - ${u}`));
    const tx = clean(body), i = tx.indexOf("야간");
    if (i >= 0) console.log(`  '야간' 주변: ${tx.slice(Math.max(0, i - 40), i + 200)}`);
  } catch (e) { console.log(`\n■ ${url}\n  실패: ${String(e.message).slice(0, 120)}`); }
}
