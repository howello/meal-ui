const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/** 在带 uni 存储桩的沙箱里加载真实 TS 源文件。 */
function load(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const store = new Map();
  const uni = {
    setStorageSync: (key, value) => store.set(key, value),
    getStorageSync: key => (store.has(key) ? store.get(key) : ''),
    removeStorageSync: key => store.delete(key),
  };
  const exports = {};
  const resolve = name => {
    if (name.startsWith('.')) {
      return load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), name)) + '.ts');
    }
    return require(name);
  };
  vm.runInNewContext(source, { exports, require: resolve, uni, console, String }, { filename });
  return { exports, store };
}

const { saveProposalPrefillName, consumeProposalPrefillName } = load('utils/proposalPrefill.ts').exports;

test('中文菜名原样暂存，不受 URL 编码影响', () => {
  const { exports: api, store } = load('utils/proposalPrefill.ts');
  api.saveProposalPrefillName(' 西红柿炒蛋 ');
  const value = store.values().next().value;
  assert.equal(value, '西红柿炒蛋');
  assert.equal(api.consumeProposalPrefillName(), '西红柿炒蛋');
});

test('取出后立即清除，避免下次进入新菜页残留旧菜名', () => {
  const { exports: api, store } = load('utils/proposalPrefill.ts');
  api.saveProposalPrefillName('麻婆豆腐');
  assert.equal(api.consumeProposalPrefillName(), '麻婆豆腐');
  assert.equal(store.size, 0);
  assert.equal(api.consumeProposalPrefillName(), '');
});

test('空菜名不写入，也不会把非字符串存储值当菜名', () => {
  const { exports: api, store } = load('utils/proposalPrefill.ts');
  api.saveProposalPrefillName('   ');
  assert.equal(store.size, 0);
  store.set('meal-proposal-prefill-name', 42);
  assert.equal(api.consumeProposalPrefillName(), '');
});

test('本地存储读写抛错时安全降级为空菜名', () => {
  const filename = path.resolve(__dirname, '../src', 'utils/proposalPrefill.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  const uni = {
    setStorageSync: () => {},
    getStorageSync: () => {
      throw new Error('storage unavailable');
    },
    removeStorageSync: () => {},
  };
  vm.runInNewContext(source, { exports, require, uni, console, String }, { filename });
  assert.equal(exports.consumeProposalPrefillName(), '');
});

test('从搜索跳转提交新菜不再把菜名拼进 URL', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src', 'pages/menu/index.vue'), 'utf8');
  assert.match(source, /saveProposalPrefillName\(query\)/);
  assert.doesNotMatch(source, /proposal\/edit\?name=/);
});
