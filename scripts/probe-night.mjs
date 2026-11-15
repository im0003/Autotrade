// 코스피200 야간선물 종가를 GitHub Actions 에서 읽을 수 있는지 시험 조회 (조회만 합니다, 아무것도 저장하지 않음)
//  - 각 후보 주소에 접속해 상태코드·응답 앞부분·'야간' 글자/숫자 유무를 보여 준다.
//  - 환경변수 EXTRA="주소1,주소2" 로 주소를 더 시험할 수 있다.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const kst = new Date(Date.now() + 9 * 3600e3);
const day = ymd(kst);
const targets = [
  ["KRX 정보데이터 파생 전종목시세(야간 시도)", "POST", "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", { bld: "dbms/MDC/STAT/standard/MDCSTAT12501", trdDd: day, prodId: "KRDRVFUK2I", mktTpCd: "N", share: "1", money: "1", csvxls_isNo: "false" }],
  ["KRX 정보데이터 파생 전종목시세(주간 대조)", "POST", "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", { bld: "dbms/MDC/STAT/standard/MDCSTAT12501", trdDd: day, prodId: "KRDRVFUK2I", share: "1", money: "1", csvxls_isNo: "false" }],
  ["apt2.me", "GET", "https://apt2.me/", null],
  ["esignal 야간선물", "GET", "https://esignal.co.kr/", null],
  ["stockhub 야간선물", "GET", "https://stockhub.kr/markets/kospi-futures", null],
  ["네이버 금융 선물", "GET", "https://finance.naver.com/sise/sise_index.naver?code=FUT", null],
  ["네이버 모바일 지수 API(FUT)", "GET", "https://m.stock.naver.com/api/index/FUT/basic", null],
  ...String(process.env.EXTRA || "").split(",").map((u) => u.trim()).filter(Boolean).map((u) => ["추가 " + u, "GET", u, null]),
];
const clean = (t) => String(t).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
console.log(`한국 날짜 ${day} · 지금 ${kst.toISOString().slice(11, 16)} (KST)`);
for (const [name, method, url, form] of targets) {
  try {
    const t0 = Date.now();
    const r = await fetch(url, { method, headers: { "user-agent": UA, ...(form ? { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", referer: "http://data.krx.co.kr/", accept: "application/json, text/javascript, */*" } : { accept: "text/html,application/json" }) }, body: form ? new URLSearchParams(form).toString() : undefined, signal: AbortSignal.timeout(20000), redirect: "follow" });
    const body = await r.text();
    const txt = clean(body);
    const night = (txt.match(/야간[^.]{0,40}/g) || []).slice(0, 3);
    const nums = (txt.match(/\d{3}\.\d{2}/g) || []).slice(0, 6);
    console.log(`\n■ ${name}\n  HTTP ${r.status} · ${r.headers.get("content-type") || ""} · ${body.length}자 · ${Date.now() - t0}ms`);
    console.log(`  앞부분: ${txt.slice(0, 260)}`);
    if (night.length) console.log(`  '야간' 포함: ${night.join(" | ")}`);
    if (nums.length) console.log(`  200대~500대 소수 두 자리 숫자 예: ${nums.join(", ")}`);
  } catch (e) { console.log(`\n■ ${name}\n  실패: ${String(e.message).slice(0, 120)}`); }
}
