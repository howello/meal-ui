const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/** 加载真实 TS 源文件，仅把路径别名解析为本地文件。 */
function load(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  const resolve = name => {
    if (name === '@/types') return {};
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) {
      return load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), name)) + '.ts');
    }
    return require(name);
  };
  vm.runInNewContext(source, { exports, require: resolve, console, Set, Array, String }, { filename });
  return exports;
}

const { collectMenuDishes, matchDishesByName, orderMenuDishesByIds, rankSuggestions } = load('utils/dishSearch.ts');

const dish = (dishId, name) => ({ dishId, name });

/** vm 里创建的数组属于另一个 realm，转成本 realm 的数组再深比较。 */
const ids = list => Array.from(list, item => item.dishId);

test('分类顺序收集会跳过最近/招牌推荐位并按菜ID去重', () => {
  const groups = [
    { key: 'recent', items: [dish(1, '番茄炒蛋'), dish(2, '土豆丝')] },
    { key: 'signature', items: [dish(2, '土豆丝')] },
    { key: '10', items: [dish(1, '番茄炒蛋'), dish(3, '麻婆豆腐')] },
    { key: '11', items: [dish(3, '麻婆豆腐')] },
  ];
  assert.deepEqual(ids(collectMenuDishes(groups)), [1, 3]);
});

test('菜名匹配忽略大小写与前后空白，不匹配食材', () => {
  const dishes = [
    { dishId: 1, name: 'Tomato Egg', ingredients: '["番茄"]' },
    { dishId: 2, name: '番茄牛腩', ingredients: '["土豆"]' },
  ];
  assert.deepEqual(ids(matchDishesByName(dishes, '  tomato ')), [1]);
  assert.deepEqual(ids(matchDishesByName(dishes, '番茄')), [2]);
  assert.deepEqual(ids(matchDishesByName(dishes, '土豆')), []);
  assert.deepEqual(ids(matchDishesByName(dishes, '   ')), []);
});

test('建议按完全相等、前缀、包含排序并限制条数', () => {
  const dishes = [dish(1, '凉拌西红柿'), dish(2, '西红柿炒蛋'), dish(3, '西红柿'), dish(4, '西红柿蛋汤')];
  assert.deepEqual(ids(rankSuggestions(dishes, '西红柿')), [3, 2, 4, 1]);
  assert.equal(rankSuggestions(dishes, '西红柿', 2).length, 2);
});

test('后端候选映射到菜单快照时按菜单顺序并过滤已不存在的菜', () => {
  const menu = [dish(1, 'A'), dish(2, 'B'), dish(3, 'C')];
  const remote = [dish(3, 'C'), dish(9, '已删除'), dish(1, 'A')];
  assert.deepEqual(ids(orderMenuDishesByIds(menu, remote)), [1, 3]);
  assert.equal(orderMenuDishesByIds(menu, []).length, 0);
});
