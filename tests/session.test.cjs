const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createPinia, setActivePinia } = require('pinia');

/** 执行真实 store 与请求代码，仅模拟平台存储、网络和通知。 */
function fixture() {
  setActivePinia(createPinia());
  const storage = new Map();
  const pending = [];
  const redirects = [];
  let info = { user: { userId: 1, deptId: 10 }, roles: [], permissions: [] };
  const uni = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    request: options => pending.push(options),
    showToast() {},
    reLaunch: options => redirects.push(options),
  };
  const modules = new Map();
  const stubs = {
    '@/api/auth': { getInfo: async () => info, logout: async () => {} },
    '@/utils/notify': { stopOrderNotifier() {} },
    './env': { BASE_API: 'https://test.invalid' },
  };
  function load(file) {
    const requested = path.resolve(__dirname, '../src', file);
    const filename = fs.existsSync(requested) ? requested : requested.replace(/\.ts$/, '/index.ts');
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const resolve = name => {
      if (name in stubs) return stubs[name];
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), name)) + '.ts');
      return require(name);
    };
    vm.runInNewContext(source, { exports, require: resolve, uni, console, setTimeout, getCurrentPages: () => [] }, { filename });
    return exports;
  }
  const user = load('store/user.ts').useUserStore();
  const cart = load('store/cart.ts').useCartStore();
  const menu = load('utils/menuCache.ts');
  return { user, cart, menu, load, pending, storage, redirects, setInfo: value => { info = value; } };
}

test('退出和切换账号均清空私有菜单、购物车与持久购物车', () => {
  const f = fixture();
  f.user.setToken('A');
  f.menu.getMenuCache().set({ categories: [], dishes: [{ dishId: 1, name: 'A 私有菜' }], signatures: [] });
  f.cart.add({ dishId: 1, name: 'A 私有菜' }, 1, 'A 备注');
  f.user.reset();
  f.user.setToken('B');
  assert.equal(f.menu.consumeMenuCache(), null);
  assert.equal(f.cart.lines.length, 0);
  assert.equal(f.storage.has('meal-cart'), false);
});

test('旧账号的 401 响应不能注销新账号', async () => {
  const f = fixture();
  f.user.setToken('A');
  const result = f.load('utils/request.ts').requestRaw({ url: '/getInfo' });
  f.user.setToken('B');
  f.pending[0].success({ statusCode: 401 });
  await assert.rejects(result, /会话已切换/);
  assert.equal(f.user.token, 'B');
  assert.equal(f.redirects.length, 0);
});

test('当前会话的 401 走统一清理入口', async () => {
  const f = fixture();
  f.user.setToken('A');
  f.cart.add({ dishId: 1, name: 'A' });
  f.menu.getMenuCache().set({ categories: [], dishes: [], signatures: [] });
  const result = f.load('utils/request.ts').requestRaw({ url: '/getInfo' });
  f.pending[0].success({ statusCode: 200, data: { code: 401 } });
  await assert.rejects(result, /已过期/);
  assert.equal(f.user.token, '');
  assert.equal(f.menu.consumeMenuCache(), null);
  assert.equal(f.cart.lines.length, 0);
  assert.equal(f.redirects.length, 1);
});

test('同一账号迁移家庭后清空旧家庭缓存', async () => {
  const f = fixture();
  f.user.setToken('A');
  await f.user.fetchInfo();
  f.cart.add({ dishId: 1, name: '旧家庭' });
  f.menu.getMenuCache().set({ categories: [], dishes: [], signatures: [] });
  f.setInfo({ user: { userId: 1, deptId: 20 }, roles: [], permissions: [] });
  await f.user.fetchInfo();
  assert.equal(f.menu.consumeMenuCache(), null);
  assert.equal(f.cart.lines.length, 0);
});

test('同一 token 的旧家庭响应不能回填或触发登出', async () => {
  const f = fixture();
  f.user.setToken('A');
  await f.user.fetchInfo();
  const result = f.load('utils/request.ts').requestRaw({ url: '/meal/dish/list' });
  f.setInfo({ user: { userId: 1, deptId: 20 }, roles: [], permissions: [] });
  await f.user.fetchInfo();
  f.pending[0].success({ statusCode: 401 });
  await assert.rejects(result, /会话已切换/);
  assert.equal(f.user.token, 'A');
  assert.equal(f.user.user.deptId, 20);
  assert.equal(f.redirects.length, 0);
});

test('冷启动购物车只恢复当前 token 保存的内容', () => {
  const f = fixture();
  f.user.setToken('B');
  f.storage.set('meal-cart', JSON.stringify({ session: 'A', lines: [{ dishId: 1, name: 'A', quantity: 1 }] }));
  f.cart.restore();
  assert.equal(f.cart.lines.length, 0);
});
