// Drives the inline SVG portrait: blinking, idle breathing, and a mouth that
// moves while speaking (pulsed by word-boundary events when the voice provides them).

export class Avatar {
  constructor(svg) {
    this.svg = svg;
    this.mouth = svg.querySelector("#mouth-inner");
    this.lowerLip = svg.querySelector("#lower-lip");
    this.head = svg.querySelector("#head");
    this.eyes = svg.querySelectorAll(".eye");
    this.open = 0;
    this.target = 0;
    this.talking = false;
    this.nextFlap = 0;
    this.t0 = performance.now();
    this.scheduleBlink();
    requestAnimationFrame((t) => this.tick(t));
  }

  scheduleBlink() {
    setTimeout(() => {
      this.eyes.forEach((e) => e.classList.add("blink"));
      setTimeout(() => this.eyes.forEach((e) => e.classList.remove("blink")), 140);
      this.scheduleBlink();
    }, 2200 + Math.random() * 3800);
  }

  start() { this.talking = true; this.svg.classList.add("talking"); }
  stop() { this.talking = false; this.target = 0; this.svg.classList.remove("talking"); }
  word() { if (this.talking) { this.target = 0.75 + Math.random() * 0.25; this.nextFlap = performance.now() + 110; } }

  tick(now) {
    if (this.talking && now > this.nextFlap) {
      // Syllable-like rhythm: mostly open, sometimes closed.
      this.target = Math.random() < 0.28 ? 0.05 : 0.3 + Math.random() * 0.7;
      this.nextFlap = now + 80 + Math.random() * 90;
    }
    this.open += (this.target - this.open) * 0.35;
    const o = this.open;
    this.mouth.setAttribute("ry", (1.2 + 8 * o).toFixed(2));
    this.mouth.setAttribute("cy", (318 + 3.5 * o).toFixed(2));
    this.lowerLip.setAttribute("transform", `translate(0 ${(7 * o).toFixed(2)})`);

    const t = (now - this.t0) / 1000;
    const sway = this.talking ? Math.sin(t * 2.1) * 1.3 + Math.sin(t * 3.7) * 0.6 : Math.sin(t * 0.8) * 0.5;
    const nod = this.talking ? Math.sin(t * 1.6) * 1.5 : Math.sin(t * 0.6) * 0.8;
    this.head.setAttribute("transform", `rotate(${sway.toFixed(2)} 200 400) translate(0 ${nod.toFixed(2)})`);
    requestAnimationFrame((t2) => this.tick(t2));
  }
}
