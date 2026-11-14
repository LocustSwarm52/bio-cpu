// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const { parse, Cell } = require('./biocpu.js');
const EX = require('./examples.js');

test('every example parses', () => {
  for (const [name, src] of Object.entries(EX)) assert.doesNotThrow(() => parse(src), name);
});

test('parser points at the bad line', () => {
  assert.throws(() => parse('protein A\ngene g makes B rate 0.5'), /Line 2: protein B is not declared/);
  assert.throws(() => parse('protein A\ngene g makes A rate 2'), /rate must be/);
  assert.throws(() => parse('protein A\ngene g makes A rate 0.5 if A = 3'), /conditions look like/);
  assert.throws(() => parse('protein A'), /no genes/);
});

test('same seed, same run', () => {
  const a = new Cell(EX['Oscillator (repressilator)'], 42); a.run(500);
  const b = new Cell(EX['Oscillator (repressilator)'], 42); b.run(500);
  assert.deepStrictEqual(a.counts, b.counts);
});

test('repressilator oscillates', () => {
  const cell = new Cell(EX['Oscillator (repressilator)'], 3);
  // Count how often A rises past 20 after having fallen below 5.
  let peaks = 0, low = false;
  for (let t = 0; t < 3000; t++) {
    cell.step();
    const a = cell.get('A');
    if (a < 5) low = true;
    if (low && a > 20) { peaks++; low = false; }
  }
  assert.ok(peaks >= 5, 'expected repeated peaks, got ' + peaks);
});

test('latch holds a bit and flips on SET and RESET', () => {
  const cell = new Cell(EX['Memory latch (toggle switch)'], 5);
  cell.run(140);
  assert.ok(cell.get('X') > cell.get('Y'), 'starts with X high');
  cell.run(200); // past SET at 150
  assert.ok(cell.get('Y') > cell.get('X'), 'SET flips to Y');
  cell.run(200); // past RESET at 350
  assert.ok(cell.get('X') > cell.get('Y'), 'RESET flips back to X');
});

test('AND gate needs both inputs', () => {
  const cell = new Cell(EX['AND gate'], 9);
  cell.run(190);
  assert.strictEqual(cell.fireTotals[0], 0, 'no output with A alone');
  cell.run(60);
  assert.ok(cell.get('OUT') > 5, 'output once A and B are both high');
});

test('linked rate scales with the signal', () => {
  const cell = new Cell(EX['Signal amplifier'], 11);
  cell.run(190);
  const low = cell.get('R');
  cell.run(150);
  assert.ok(cell.get('R') > low, 'more signal, more R');
});

test('handles a large program: 100 genes, 500 proteins', () => {
  const lines = [];
  for (let p = 0; p < 500; p++) lines.push(`protein P${p} init ${p % 7} decay 0.05`);
  for (let g = 0; g < 100; g++) lines.push(`gene g${g} makes P${(g * 5) % 500} rate 0.5 if P${(g * 7 + 1) % 500} < 4`);
  const cell = new Cell(lines.join('\n'), 1);
  const t0 = Date.now();
  cell.run(1000);
  assert.ok(Date.now() - t0 < 2000, 'should run 1000 ticks quickly');
});
