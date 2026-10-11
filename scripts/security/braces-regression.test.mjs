import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const braces = require('braces');

test('bounded brace parser preserves ordinary build globs', () => {
  assert.equal(braces.compile('apps/{web,admin}/**/*.{ts,tsx}'), 'apps/(web|admin)/**/*.(ts|tsx)');
  assert.deepEqual(braces.expand('file{1..3}.ts'), ['file1.ts', 'file2.ts', 'file3.ts']);
  assert.equal(braces.stringify(braces.parse('x{a,{b,c}}y')), 'x{a,{b,c}}y');
});

test('deep brace and parenthesis patterns fail before recursive traversal', () => {
  const patterns = [
    '{'.repeat(2048) + 'a,b' + '}'.repeat(2048),
    '('.repeat(2048) + 'a' + ')'.repeat(2048),
    '{('.repeat(1024) + 'a,b' + ')}'.repeat(1024),
    '{'.repeat(2048) + 'a,b',
  ];
  for (const pattern of patterns) {
    for (const operation of [braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => operation(pattern), {
        name: 'SyntaxError',
        message: 'Brace AST exceeds maximum depth (128)',
      });
    }
  }
});

test('caller-supplied deep and cyclic ASTs cannot bypass parser limits', () => {
  let deep = { type: 'text', value: 'a' };
  for (let depth = 0; depth < 5000; depth++) deep = { type: 'root', nodes: [deep] };
  const cyclic = { type: 'root', nodes: [] };
  cyclic.nodes.push(cyclic);
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(deep), {
      name: 'SyntaxError',
      message: 'Brace AST exceeds maximum depth (128)',
    });
    assert.throws(() => operation(cyclic), {
      name: 'SyntaxError',
      message: 'Brace AST must be an acyclic tree',
    });
  }
});
