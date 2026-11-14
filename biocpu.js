// bio-cpu core: a stochastic, parallel machine modelled on gene
// regulation. Browser (window.BioCPU) and Node (module.exports).
//
// Mapping to a computer:
//   genes (the program)        -> ROM: fixed while the cell runs
//   protein types / counts     -> RAM addresses / stored values
//   "if A < 10" on a gene      -> a conditional (transcription-factor threshold)
//   every gene each tick       -> parallel instructions, no program counter
//   pulses from outside        -> input (signals arriving at the membrane)

(function (root) {
  'use strict';

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------
  // Parser for the program language. One statement per line:
  //   protein NAME [init N] [decay P]
  //   gene NAME makes PROTEIN [AMOUNT] rate R [if COND [and COND ...]]
  //        R is a probability (0.3) or linked to a protein (0.02*S)
  //        COND is PROTEIN < N or PROTEIN > N
  //   pulse PROTEIN AMOUNT at TICK
  //   # comment
  // ---------------------------------------------------------------
  class ParseError extends Error {
    constructor(line, msg) { super('Line ' + line + ': ' + msg); this.line = line; }
  }

  const NAME = /^[A-Za-z_]\w*$/;

  function parse(source) {
    const proteins = new Map(); // name -> { init, decay }
    const genes = [];
    const pulses = [];
    const used = []; // [name, line] for proteins mentioned before declaration

    const num = (tok, line, what) => {
      const v = Number(tok);
      if (tok === undefined || !Number.isFinite(v)) throw new ParseError(line, 'expected a number for ' + what);
      return v;
    };

    source.split(/\r?\n/).forEach((raw, i) => {
      const line = i + 1;
      const text = raw.replace(/#.*$/, '').trim();
      if (!text) return;
      const t = text.split(/\s+/);
      const kw = t[0].toLowerCase();

      if (kw === 'protein') {
        const name = t[1];
        if (!name || !NAME.test(name)) throw new ParseError(line, 'protein needs a name');
        if (proteins.has(name)) throw new ParseError(line, 'protein ' + name + ' declared twice');
        const p = { init: 0, decay: 0 };
        for (let k = 2; k < t.length; k += 2) {
          const key = t[k].toLowerCase();
          if (key === 'init') p.init = Math.max(0, Math.round(num(t[k + 1], line, 'init')));
          else if (key === 'decay') p.decay = num(t[k + 1], line, 'decay');
          else throw new ParseError(line, 'unknown protein option "' + t[k] + '"');
        }
        if (p.decay < 0 || p.decay > 1) throw new ParseError(line, 'decay must be between 0 and 1');
        proteins.set(name, p);
        return;
      }

      if (kw === 'gene') {
        const name = t[1];
        if (!name || !NAME.test(name)) throw new ParseError(line, 'gene needs a name');
        if (genes.some((g) => g.name === name)) throw new ParseError(line, 'gene ' + name + ' declared twice');
        if ((t[2] || '').toLowerCase() !== 'makes') throw new ParseError(line, 'expected "makes" after the gene name');
        const product = t[3];
        if (!product || !NAME.test(product)) throw new ParseError(line, 'gene ' + name + ' must make a protein');
        used.push([product, line]);
        let k = 4;
        let amount = 1;
        if (t[k] !== undefined && t[k].toLowerCase() !== 'rate') { amount = Math.round(num(t[k], line, 'amount')); k++; }
        if ((t[k] || '').toLowerCase() !== 'rate') throw new ParseError(line, 'expected "rate"');
        const rate = parseRate(t[k + 1], line);
        if (rate.link) used.push([rate.link, line]);
        k += 2;
        const conds = [];
        if (t[k] !== undefined) {
          if (t[k].toLowerCase() !== 'if') throw new ParseError(line, 'expected "if" or end of line');
          k++;
          while (k < t.length) {
            const [prot, op, val] = [t[k], t[k + 1], t[k + 2]];
            if (!prot || !NAME.test(prot) || (op !== '<' && op !== '>')) {
              throw new ParseError(line, 'conditions look like "A < 10" or "A > 10"');
            }
            conds.push({ protein: prot, op, value: num(val, line, 'threshold') });
            used.push([prot, line]);
            k += 3;
            if (k < t.length) {
              if (t[k].toLowerCase() !== 'and') throw new ParseError(line, 'join conditions with "and"');
              k++;
              if (k >= t.length) throw new ParseError(line, 'condition missing after "and"');
            }
          }
        }
        genes.push({ name, product, amount, rate, conds, line });
        return;
      }

      if (kw === 'pulse') {
        const [, prot, amt, at, tick] = t;
        if (!prot || !NAME.test(prot)) throw new ParseError(line, 'pulse needs a protein');
        if ((at || '').toLowerCase() !== 'at') throw new ParseError(line, 'write pulses as "pulse A 20 at 100"');
        pulses.push({ protein: prot, amount: Math.round(num(amt, line, 'amount')), tick: Math.round(num(tick, line, 'tick')) });
        used.push([prot, line]);
        return;
      }

      throw new ParseError(line, 'unknown statement "' + t[0] + '"');
    });

    for (const [name, line] of used) {
      if (!proteins.has(name)) throw new ParseError(line, 'protein ' + name + ' is not declared');
    }
    if (!genes.length) throw new ParseError(1, 'the program has no genes');
    return { proteins, genes, pulses };
  }

  function parseRate(tok, line) {
    if (tok === undefined) throw new ParseError(line, 'rate needs a value');
    const m = tok.match(/^([\d.]+)\*([A-Za-z_]\w*)$/);
    if (m) return { k: Number(m[1]), link: m[2] };
    const v = Number(tok);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new ParseError(line, 'rate must be 0-1 or like 0.02*S');
    return { k: v, link: null };
  }

  // ---------------------------------------------------------------
  // Machine
  // ---------------------------------------------------------------
  class Cell {
    constructor(program, seed = 1) {
      this.program = typeof program === 'string' ? parse(program) : program;
      this.names = [...this.program.proteins.keys()];
      this.slot = new Map(this.names.map((n, i) => [n, i]));
      this.seed = seed;
      this.reset();
    }

    reset() {
      this.rand = rng(this.seed);
      this.tick = 0;
      this.counts = this.names.map((n) => this.program.proteins.get(n).init);
      this.fired = this.program.genes.map(() => false);
      this.fireTotals = this.program.genes.map(() => 0);
    }

    get(name) { return this.counts[this.slot.get(name)]; }

    // Is this gene switched on, given the current protein counts?
    active(gene, counts = this.counts) {
      return gene.conds.every((c) => {
        const v = counts[this.slot.get(c.protein)];
        return c.op === '<' ? v < c.value : v > c.value;
      });
    }

    rateOf(gene, counts = this.counts) {
      const r = gene.rate.link ? gene.rate.k * counts[this.slot.get(gene.rate.link)] : gene.rate.k;
      return Math.min(1, Math.max(0, r));
    }

    // One tick: every gene reads the same snapshot, fires at random
    // with its rate, and adds its product. Additions don't overwrite
    // each other, so parallel genes can't race. Then proteins decay.
    step() {
      const snap = this.counts.slice();
      const delta = new Array(this.counts.length).fill(0);
      this.program.genes.forEach((g, i) => {
        const on = this.active(g, snap) && this.rand() < this.rateOf(g, snap);
        this.fired[i] = on;
        if (on) { delta[this.slot.get(g.product)] += g.amount; this.fireTotals[i]++; }
      });
      for (let p = 0; p < this.counts.length; p++) {
        const decay = this.program.proteins.get(this.names[p]).decay;
        let n = snap[p];
        if (decay > 0 && n > 0) n -= binomial(n, decay, this.rand);
        this.counts[p] = Math.max(0, n + delta[p]);
      }
      this.tick++;
      for (const pl of this.program.pulses) {
        if (pl.tick === this.tick) {
          const s = this.slot.get(pl.protein);
          this.counts[s] = Math.max(0, this.counts[s] + pl.amount);
        }
      }
    }

    run(ticks) { for (let i = 0; i < ticks; i++) this.step(); }
  }

  // Number of molecules lost this tick. Exact for small counts,
  // normal approximation for large ones.
  function binomial(n, p, rand) {
    if (n < 40) {
      let k = 0;
      for (let i = 0; i < n; i++) if (rand() < p) k++;
      return k;
    }
    const mean = n * p, sd = Math.sqrt(n * p * (1 - p));
    const u = Math.max(rand(), 1e-12);
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    return Math.min(n, Math.max(0, Math.round(mean + sd * z)));
  }

  const api = { parse, ParseError, Cell, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BioCPU = api;
})(typeof window !== 'undefined' ? window : globalThis);
