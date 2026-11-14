# bio-cpu

A computer architecture modelled on gene regulation, with a simulator that runs in the browser. Programs are written as genes. Protein counts act as memory, and every gene runs in parallel each tick, at random, with no program counter.

**Live demo:** `https://<your-username>.github.io/bio-cpu/`

## The idea

A living cell runs something like a program. This project treats that literally and maps gene regulation onto a computer:

| Cell | Computer |
|---|---|
| Genes (DNA) | Program memory. The running cell can read genes but never rewrite them, which makes them ROM. |
| Protein types | Memory addresses |
| Protein counts | The values stored at those addresses (RAM) |
| A gene that fires only while `A < 10` | A conditional, set by a transcription-factor threshold |
| All genes, every tick | Parallel instructions. There is no program counter. |
| Signals from outside the cell | Input |

The result is a stochastic Harvard architecture without a program counter. Program and data live in separate memories, instructions run in parallel, and each one fires with a probability instead of on a clock. Each gene's output is *added* to a protein count rather than written over it, so genes running at the same time can't race each other.

## The language

```
protein NAME [init N] [decay P]
gene NAME makes PROTEIN [AMOUNT] rate R [if COND and COND ...]
    R    = probability of firing per tick (0.5), or linked to a protein (0.02*S)
    COND = PROTEIN < N   or   PROTEIN > N
pulse PROTEIN AMOUNT at TICK
# comments
```

## Example programs

| Program | What it shows |
|---|---|
| **Oscillator (repressilator)** | Three genes that each repress the next. The cell keeps time on its own, with no clock. |
| **Memory latch (toggle switch)** | Two genes that repress each other store one bit. SET and RESET pulses flip it. |
| **AND gate** | An output gene that fires only while two inputs are both high |
| **Signal amplifier** | A gene whose firing rate is linked to the amount of a signal protein |

The oscillator:

```
protein A init 30 decay 0.05
protein B init 0  decay 0.05
protein C init 0  decay 0.05

gene makeA makes A 2 rate 0.8 if C < 8
gene makeB makes B 2 rate 0.8 if A < 8
gene makeC makes C 2 rate 0.8 if B < 8
```

## How a tick works (`Cell.step()` in `biocpu.js`)

1. Take a snapshot of every protein count.
2. For each gene, check its conditions against the snapshot. If they hold, it fires with probability equal to its rate.
3. Add each fired gene's product to a separate tally, so no gene sees another gene's output in the same tick.
4. Remove molecules at random by decay. Exact sampling is used for small counts and a normal approximation for large ones.
5. Apply the tallies, then any pulses scheduled for this tick.

Runs use a seeded random number generator, so the same seed always gives the same run. The simulator handles programs of 100 genes and 500 proteins at well over 1,000 ticks a second.

## Run it

Open `index.html` in a browser. To run the tests (Node 18 or newer):

```
npm test
```

The tests check the parser and its error messages, that a run can be reproduced from its seed, that the oscillator oscillates, that the latch flips on SET and RESET, that the AND gate needs both inputs, that linked rates scale, and that a 100-gene, 500-protein program runs fast.

## Files

| File | What it holds |
|---|---|
| `biocpu.js` | Parser and simulator |
| `examples.js` | Example programs |
| `index.html` | Editor, live chart, and gene table |
| `test.js` | Tests |
