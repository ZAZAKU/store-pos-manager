import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the POS app shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>매장 판매 관리 POS<\/title>/i);
  assert.match(html, /매장 판매 관리/);
  assert.match(html, /상품 선택/);
  assert.match(html, /계산 완료/);
  assert.match(html, /최근 계산 내역/);
  assert.match(html, /정산 달력/);
  assert.match(html, /월별 판매 순위/);
  assert.match(html, /주간 판매 순위/);
  assert.match(html, /월별 판매 순위 조회 월/);
  assert.match(html, /주간 판매 순위 기준일/);
  assert.match(html, /3<!-- -->\/<!-- -->10/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/i);
});

test("keeps starter preview code out of the finished app", async () => {
  const [appFiles, page, layout, packageJson] = await Promise.all([
    readdir(new URL("../app/", import.meta.url), { recursive: true }),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.ok(!appFiles.some((file) => String(file).includes("_sites-preview")));
  assert.match(page, /MAX_CATEGORIES = 10/);
  assert.match(page, /rankSales/);
  assert.match(page, /monthlyRank/);
  assert.match(page, /weeklyRank/);
  assert.match(page, /selectedRankMonth/);
  assert.match(page, /selectedRankDate/);
  assert.match(page, /selectedWeekLabel/);
  assert.match(page, /cancelSale/);
  assert.match(page, /cancelledAt/);
  assert.match(page, /downloadExcel/);
  assert.match(layout, /lang="ko"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
