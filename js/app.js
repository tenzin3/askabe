import { QuoteIndex } from "./search.js";
import { Avatar } from "./avatar.js";
import { Voice } from "./voice.js";

const MIN_SCORE = 1.2;           // below this, Lincoln says he has nothing on record
const RELATED_RATIO = 0.4;       // show other passages scoring at least 40% of the best
const SUGGESTIONS = [
  "What is democracy?",
  "How should we treat our enemies?",
  "What did you think of slavery?",
  "How do I deal with grief?",
  "Any advice for a young lawyer?",
  "What do you remember of Gettysburg?",
  "How do I stay motivated?",
  "What did you believe about race?",
];

const $ = (s) => document.querySelector(s);
const transcript = $("#transcript");
const input = $("#q");
const avatar = new Avatar($("#lincoln"));
const voice = new Voice();
const recent = [];
let index;

// ---------- data ----------
async function loadQuotes() {
  const base = await fetch("data/lincoln.json").then((r) => r.json());
  let quotes = base.quotes;
  try {
    const wq = await fetch("data/wikiquote_lincoln.json");
    if (wq.ok) {
      const extra = (await wq.json()).quotes || [];
      const key = (t) => t.toLowerCase().replace(/[^a-z]/g, "").slice(0, 60);
      const seen = new Set(quotes.map((q) => key(q.text)));
      const fresh = extra.filter((q) => !seen.has(key(q.text)));
      quotes = quotes.concat(fresh);
      if (fresh.length) $("#wq-credit").hidden = false;
    }
  } catch { /* optional file */ }
  return quotes;
}

// ---------- formatting ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatDate(q) {
  if (!q.date) return "";
  const [y, m, d] = q.date.split("-").map(Number);
  if (q.date_precision === "year") return String(y);
  if (q.date_precision === "approximate") return `c. ${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function citeLine(q) {
  return [q.work, q.place, formatDate(q)].filter(Boolean).join(" · ");
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// ---------- small talk (app narration, never presented as a quotation) ----------
function smallTalk(q) {
  const s = q.trim().toLowerCase();
  if (/^(hi|hello|hey|howdy|greetings|good (morning|afternoon|evening|day))\b[\s!.,?]*$/.test(s))
    return "Good day to you, friend. Ask me what you will, and I shall answer only with words I truly spoke or wrote.";
  if (/^(who are you|what are you|introduce yourself)\b/.test(s))
    return "I am Abraham Lincoln of Illinois, sixteenth President of the United States, from 1861 until my death in April 1865. Here I answer only from my own speeches and letters.";
  if (/^(thanks|thank you|thx)\b/.test(s))
    return "You are most welcome. Ask again whenever you please.";
  return null;
}
const NO_RECORD = "I find nothing in my speeches or letters that answers that, and I will not put words in my own mouth. Try asking me of liberty, the Union, the war, slavery, work, honesty, grief, or faith.";

// ---------- transcript rendering ----------
function addQuestion(text) {
  const li = el("li", "turn you");
  li.append(el("span", "who", "You asked"), el("p", "asked", text));
  transcript.append(li);
}

function addNarration(text) {
  const li = el("li", "turn lincoln");
  li.append(el("span", "who", "Mr. Lincoln"), el("p", "narration", text));
  transcript.append(li);
  scrollDown();
  speak([text]);
}

function addAnswer(q, related) {
  const li = el("li", "turn lincoln");
  li.append(el("span", "who", "Mr. Lincoln"));
  li.append(renderQuote(q));
  if (related.length) {
    const more = el("div", "related");
    more.append(el("span", "related-label", "Also on record:"));
    for (const r of related) {
      const b = el("button", "related-item", `${r.work}${r.date ? ", " + r.date.slice(0, 4) : ""}`);
      b.type = "button";
      b.addEventListener("click", () => {
        const li2 = el("li", "turn lincoln");
        li2.append(el("span", "who", "Mr. Lincoln"), renderQuote(r));
        transcript.append(li2);
        remember(r.id);
        scrollDown();
        speakQuote(r);
      });
      more.append(b);
    }
    li.append(more);
  }
  transcript.append(li);
  scrollDown();
  speakQuote(q);
}

function renderQuote(q) {
  const wrap = el("div", "answer");
  wrap.append(el("p", "narration", introFor(q)));
  const bq = el("blockquote", "quote");
  bq.append(el("p", null, q.text));
  wrap.append(bq);
  const cite = el("p", "cite");
  cite.append(el("span", null, "— " + citeLine(q)));
  if (q.origin) {
    const a = el("a", null, "source");
    a.href = q.origin; a.target = "_blank"; a.rel = "noopener";
    cite.append(" ", a);
  }
  wrap.append(cite);
  if (q.note) wrap.append(el("p", "note", q.note));
  return wrap;
}

function introFor(q) {
  return q.intro || "On that, I once said:";
}

function scrollDown() {
  const last = transcript.lastElementChild;
  if (!last) return;
  if (getComputedStyle(transcript).overflowY === "auto") {
    // Desktop: the conversation pane scrolls on its own; keep the page still.
    transcript.scrollTop = last.offsetTop - transcript.offsetTop - 8;
  } else {
    // Mobile: the page scrolls; bring the newest answer into view.
    last.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

// ---------- speaking ----------
function speak(parts) {
  voice.speak(parts, {
    onStart: () => { avatar.start(); $("#hush").hidden = false; },
    onEnd: () => { avatar.stop(); $("#hush").hidden = true; },
    onWord: () => avatar.word(),
  });
}
function speakQuote(q) {
  speak([introFor(q), q.text]);
}

// ---------- answering ----------
function remember(id) {
  recent.push(id);
  if (recent.length > 4) recent.shift();
}

function ask(question) {
  question = question.trim();
  if (!question) return;
  addQuestion(question);

  const talk = smallTalk(question);
  if (talk) return addNarration(talk);

  const results = index.search(question, 8);
  if (!results.length || results[0].score < MIN_SCORE) return addNarration(NO_RECORD);

  // Asking the same thing again gets a different passage when a close one exists.
  let pick = results[0];
  if (recent.includes(pick.quote.id)) {
    const alt = results.find((r) => !recent.includes(r.quote.id) && r.score >= results[0].score * 0.55);
    if (alt) pick = alt;
  }
  remember(pick.quote.id);

  const related = results
    .filter((r) => r !== pick && r.score >= results[0].score * RELATED_RATIO && r.quote.text !== pick.quote.text)
    .slice(0, 3)
    .map((r) => r.quote);
  addAnswer(pick.quote, related);
}

// ---------- wiring ----------
$("#ask").addEventListener("submit", (e) => {
  e.preventDefault();
  ask(input.value);
  input.value = "";
});

$("#mute").addEventListener("click", (e) => {
  voice.muted = !voice.muted;
  e.currentTarget.textContent = voice.muted ? "Voice off" : "Voice on";
  e.currentTarget.setAttribute("aria-pressed", String(voice.muted));
  if (voice.muted) voice.cancel(), avatar.stop(), ($("#hush").hidden = true);
});
if (!voice.available) { $("#mute").textContent = "No voice in this browser"; $("#mute").disabled = true; }

$("#hush").addEventListener("click", () => {
  voice.cancel();
  avatar.stop();
  $("#hush").hidden = true;
});

const chips = $("#chips");
for (const s of SUGGESTIONS) {
  const b = el("button", "chip", s);
  b.type = "button";
  b.addEventListener("click", () => ask(s));
  chips.append(b);
}

// Voice input (Chrome, Edge, Safari)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const mic = $("#mic");
  mic.hidden = false;
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = true;
  let listening = false;
  rec.onresult = (e) => {
    const r = e.results[e.results.length - 1];
    input.value = r[0].transcript;
    if (r.isFinal) { ask(input.value); input.value = ""; }
  };
  rec.onend = () => { listening = false; mic.classList.remove("listening"); };
  rec.onerror = rec.onend;
  mic.addEventListener("click", () => {
    if (listening) return rec.stop();
    voice.cancel(); avatar.stop();
    listening = true; mic.classList.add("listening");
    rec.start();
  });
}

// ---------- start ----------
loadQuotes().then((quotes) => {
  index = new QuoteIndex(quotes);
  const welcome = el("li", "turn lincoln");
  welcome.append(
    el("span", "who", "Mr. Lincoln"),
    el("p", "narration", `Good day. I have ${quotes.length} passages from my speeches and letters at hand. Ask me a question, and I will answer in my own recorded words.`)
  );
  transcript.append(welcome);
  const q = new URLSearchParams(location.search).get("q");
  if (q) ask(q);
}).catch((err) => {
  transcript.append(el("li", "turn error", "Could not load the quotations. If you opened this file directly, serve the folder instead (see README)."));
  console.error(err);
});
