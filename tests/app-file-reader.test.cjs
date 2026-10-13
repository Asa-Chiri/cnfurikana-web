const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Vue = require("vue");

// Exercise the real component options, lifecycle, methods, and computed content.
// Only rendering/TTS imports are stubbed; FileReader completion is controlled below.
const source = fs
  .readFileSync(path.join(__dirname, "../src/App.vue"), "utf8")
  .match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^import .*;\r?\n/gm, "")
  .replace("export default", "module.exports =");

function createAppFactory(t) {
  const readers = [];
  class DeferredFileReader {
    constructor() {
      readers.push(this);
    }

    readAsArrayBuffer(file) {
      this.file = file;
    }

    complete(text) {
      this.result = new TextEncoder().encode(text).buffer;
      this.onload();
    }
  }

  const context = {
    module: { exports: {} },
    FurikanaDisplay: {},
    Speech: class {},
    FileReader: DeferredFileReader,
    TextDecoder,
    Uint8Array,
    localStorage: { getItem: () => null },
    console: { log() {} },
  };
  vm.runInNewContext(source, context, { filename: "App.vue" });
  const options = context.module.exports;
  return function createApp() {
    const app = new Vue({
      ...options,
      beforeCreate: [
        function () {
          this.$i18n = { locale: "en_US" };
        },
        options.beforeCreate,
      ],
    });
    t.after(() => app.$destroy());

    function selectFile(name) {
      const file = { name };
      assert.equal(app.beforeUpload(file), false, "no HTTP upload is started");
      const reader = readers[readers.length - 1];
      assert.equal(reader.file, file);
      assert.equal(app.fileList[0], file);
      return reader;
    }

    return { app, selectFile };
  };
}

function createApp(t) {
  return createAppFactory(t)();
}

test("the current file read still decodes UTF-8 and takes precedence over typed text", (t) => {
  const { app, selectFile } = createApp(t);
  app.inputContent = "typed text";
  const reader = selectFile("current.txt");

  reader.complete("\u4f60\u597d current file");

  assert.ok(app.fileContent.endsWith("\u4f60\u597d current file"));
  assert.equal(app.content, app.fileContent);
});

test("select A, Clear, type B, then complete A preserves typed B", (t) => {
  const { app, selectFile } = createApp(t);
  const readerA = selectFile("A.txt");
  app.clear();
  assert.equal(app.fileList.length, 0);
  app.inputContent = "typed B";

  readerA.complete("stale file A");

  assert.equal(app.content, "typed B");
  assert.equal(app.fileContent, "");
  assert.equal(app.fileList.length, 0);
});

test("select A, Clear, select B, complete B then A keeps file B", (t) => {
  const { app, selectFile } = createApp(t);
  const readerA = selectFile("A.txt");
  app.clear(); // Re-enables the upload control before the next selection.
  const readerB = selectFile("B.txt");
  readerB.complete("current file B");
  const contentB = app.content;
  assert.ok(contentB.endsWith("current file B"));

  readerA.complete("stale file A");

  assert.equal(app.content, contentB);
  assert.equal(app.fileContent, contentB);
  assert.equal(app.fileList[0].name, "B.txt");
});

for (const completionOrder of ["A then B", "B then A"]) {
  test(`multiple selection A, B with completion ${completionOrder} only accepts B`, (t) => {
    const { app, selectFile } = createApp(t);
    app.inputContent = "typed fallback";
    // el-upload's multiple input invokes beforeUpload for each selected file.
    const readerA = selectFile("A.txt");
    const readerB = selectFile("B.txt");

    if (completionOrder === "A then B") {
      readerA.complete("stale file A");
      assert.equal(app.fileContent, "");
      assert.equal(app.content, "typed fallback");
      readerB.complete("current file B");
    } else {
      readerB.complete("current file B");
      readerA.complete("stale file A");
    }

    assert.ok(app.content.endsWith("current file B"));
    assert.equal(app.fileList[0].name, "B.txt");
  });
}

test("Clear after the newest read completes also invalidates older pending reads", (t) => {
  const { app, selectFile } = createApp(t);
  const readerA = selectFile("A.txt");
  const readerB = selectFile("B.txt");
  readerB.complete("current file B");
  app.clear();

  readerA.complete("stale file A");

  assert.equal(app.content, "");
  assert.equal(app.fileContent, "");
  assert.equal(app.inputContent, "");
  assert.equal(app.fileList.length, 0);
});

test("clearing one component does not invalidate another component's read", (t) => {
  const createInstance = createAppFactory(t);
  const first = createInstance();
  const second = createInstance();
  const readerA = first.selectFile("A.txt");
  const readerB = second.selectFile("B.txt");
  first.app.clear();

  readerB.complete("current file B");
  readerA.complete("stale file A");

  assert.ok(second.app.content.endsWith("current file B"));
  assert.equal(first.app.content, "");
});
