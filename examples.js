(function (root) {
  const EXAMPLES = {
    'Oscillator (repressilator)': `# Three genes each repress the next: A blocks B, B blocks C, C blocks A.
# No clock and no program counter, yet the cell ticks on its own.
protein A init 30 decay 0.05
protein B init 0  decay 0.05
protein C init 0  decay 0.05

gene makeA makes A 2 rate 0.8 if C < 8
gene makeB makes B 2 rate 0.8 if A < 8
gene makeC makes C 2 rate 0.8 if B < 8
`,

    'Memory latch (toggle switch)': `# Two genes repress each other, so the cell holds one bit.
# SET and RESET arrive from outside as pulses and flip the bit.
protein X     init 20 decay 0.08
protein Y     init 0  decay 0.08
protein SET   decay 0.2
protein RESET decay 0.2

gene holdX makes X 2 rate 0.9 if Y < 5
gene holdY makes Y 2 rate 0.9 if X < 5
gene setY  makes Y 3 rate 1   if SET > 3
gene resetX makes X 3 rate 1  if RESET > 3

pulse SET   40 at 150
pulse RESET 40 at 350
`,

    'AND gate': `# OUT is made only while both inputs are high.
# A arrives at tick 100, B at tick 200, and both fade away.
protein A   decay 0.004
protein B   decay 0.004
protein OUT decay 0.1

gene gate makes OUT 2 rate 0.9 if A > 20 and B > 20

pulse A 60 at 100
pulse B 60 at 200
`,

    'Signal amplifier': `# The rate of a gene can be linked to a protein:
# the more signal S there is, the faster R is made.
protein S init 0 decay 0.005
protein R init 0 decay 0.05

gene amp makes R 1 rate 0.02*S

pulse S 10 at 50
pulse S 20 at 200
pulse S 20 at 350
`,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EXAMPLES;
  else root.BIO_EXAMPLES = EXAMPLES;
})(typeof window !== 'undefined' ? window : globalThis);
