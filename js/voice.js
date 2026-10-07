// Text-to-speech with the browser's built-in Web Speech API, split into
// short chunks (Chrome stops long utterances), with callbacks for lip-sync.

const PREFERRED = ["Daniel", "Google UK English Male", "Microsoft Guy", "Microsoft David", "Alex", "Fred", "Aaron", "Arthur", "Rishi"];

function chunk(text, max = 180) {
  const sentences = text.match(/[^.!?;:—]+[.!?;:—]*["”]?\s*/g) || [text];
  const out = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ""; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export class Voice {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.muted = false;
    this.voice = null;
    this.gen = 0;
    this.timer = null;
    if (this.synth) {
      const pick = () => {
        const voices = this.synth.getVoices().filter((v) => v.lang.startsWith("en"));
        this.voice = PREFERRED.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean)
          || voices.find((v) => /male/i.test(v.name)) || voices[0] || null;
      };
      pick();
      this.synth.onvoiceschanged = pick;
    }
  }

  get available() { return !!this.synth; }

  cancel() {
    this.gen++;
    clearTimeout(this.timer);
    if (this.synth) this.synth.cancel();
  }

  // parts: array of strings; hooks: { onStart, onEnd, onWord }
  speak(parts, hooks = {}) {
    this.cancel();
    const gen = this.gen;
    const pieces = parts.filter(Boolean).flatMap((p) => chunk(p));
    if (!pieces.length) return;

    // Silent mode (muted or unsupported): animate for roughly the reading time.
    if (this.muted || !this.synth) {
      hooks.onStart?.();
      const words = pieces.join(" ").split(/\s+/).length;
      this.timer = setTimeout(() => gen === this.gen && hooks.onEnd?.(), Math.min(14000, words * 330));
      return;
    }

    let i = 0;
    const next = () => {
      if (gen !== this.gen) return;
      if (i >= pieces.length) { hooks.onEnd?.(); return; }
      const u = new SpeechSynthesisUtterance(pieces[i++]);
      if (this.voice) u.voice = this.voice;
      u.rate = 0.92;
      u.pitch = 0.9;
      u.onboundary = (e) => { if (gen === this.gen && e.name !== "sentence") hooks.onWord?.(); };
      u.onend = next;
      u.onerror = next;
      this.synth.speak(u);
    };
    hooks.onStart?.();
    next();
  }
}
