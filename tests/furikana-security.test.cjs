const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");

// Use the same browser package entry points as the shipped Vite application.
const source = fs.readFileSync(path.join(__dirname, "../src/utils/furikana.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/export function /g, "function ");
const context = {
  pinyin: require("pinyin/lib/web-pinyin.js"),
  cnchar: require("cnchar"),
  funikanaData: require("../src/utils/table.json"),
  console: { log() {} },
};
vm.runInNewContext(source, context);
const { ToParsedContent, ToHtmlContent } = context;

for (const mode of [0, 1, 2, 3]) {
  test(`mode ${mode}: imported text stays inert`, () => {
    const text = '<img src="unused" onerror="void(0)"> & <b>text</b>';
    const html = ToHtmlContent(ToParsedContent(text), mode);
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes("<b>"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&amp;"));
  });
  test(`mode ${mode}: annotation fields stay inert`, () => {
    const text = '<b title="test">annotation</b>';
    const html = ToHtmlContent([[{
      hanzi: text, funikana: text, arrowTone: text,
      tonePinyin: text, untonePinyin: text,
    }]], mode);
    assert.ok(!html.includes("<b"));
    assert.ok(html.includes("&lt;b"));
  });
  test(`mode ${mode}: normal Chinese and spacing render`, () => {
    const html = ToHtmlContent(ToParsedContent("你好 abc\n世界"), mode);
    assert.ok(html.includes("你"));
    assert.ok(html.includes("好"));
    assert.ok(html.includes("<ruby>"));
    assert.ok(html.includes("<br>"));
    assert.ok(!html.includes("&amp;nbsp;"));
    assert.ok(!html.includes("undefined"));
  });
}

test("literal entities are displayed once instead of interpreted as markup", () => {
  const html = ToHtmlContent(ToParsedContent("&lt;b&gt;"));
  assert.ok(html.includes("&amp;lt;b&amp;gt;"));
});
