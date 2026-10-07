// In-browser quote search: BM25 over quote text, work title and topic tags,
// with light stemming and a small synonym map. No server, no model download.

const STOP = new Set(`a about above after again against all am an and any are as at be because been
before being below between both but by can could did do does doing down during each few for from
further had has have having he her here hers herself him himself his how i if in into is it its
itself just me more most my myself no nor not now of off on once only or other our ours ourselves
out over own same she should so some such than that the their theirs them themselves then there
these they this those through to too under until up very was we were what when where which while
who whom why will with would you your yours yourself yourselves mr lincoln abraham abe president
tell say said think thought thoughts feel opinion view views about anything something please
know does did ever really much many like whats what's dont don't us let lets get got`.split(/\s+/));

const SYN = {
  freedom: ["liberty", "free"], liberty: ["freedom", "free"], free: ["freedom", "liberty"],
  slavery: ["slave", "emancipation"], slave: ["slavery"], slaves: ["slavery"],
  war: ["battle", "civil", "army"], fight: ["war", "battle"], battle: ["war"],
  enemy: ["enemies", "malice"], enemies: ["malice", "friends"], hate: ["malice", "enemies"],
  forgive: ["malice", "charity", "enemies"], forgiveness: ["malice", "charity"], revenge: ["malice", "charity"],
  god: ["religion", "faith", "prayer"], religion: ["god", "faith"], faith: ["god", "prayer"], pray: ["prayer", "god"],
  sad: ["grief", "sorrow"], depressed: ["grief", "sorrow", "sad"], grief: ["sorrow", "loss"], lonely: ["sorrow", "sad"],
  death: ["grief", "dead", "loss"], die: ["dead", "death"], lost: ["loss", "grief"],
  job: ["work", "labor", "career"], work: ["labor"], career: ["work", "success"],
  money: ["wealth", "rich", "property"], rich: ["wealth", "property"], poor: ["poor", "houseless"],
  success: ["succeed", "resolution"], succeed: ["success", "resolution"], fail: ["success", "resolution"],
  motivation: ["resolution", "success", "duty"], motivated: ["motivation", "resolution", "success"], inspire: ["motivation", "courage"], inspiration: ["motivation", "courage"], motivate: ["resolution", "success"], quit: ["resolution", "success"],
  vote: ["voting", "election", "suffrage"], election: ["vote", "voting"],
  government: ["democracy", "govern"],
  equal: ["equality"], equality: ["equal"], race: ["racial", "black"], racism: ["race", "racial", "black"],
  immigrant: ["immigrants", "foreigners", "immigration"], immigration: ["immigrants", "foreigners"],
  school: ["education"], learn: ["education", "learning"], study: ["education"], read: ["reading", "books"],
  lie: ["honest", "truth"], lying: ["honest", "truth"], honest: ["honesty", "truth"], truth: ["honest"],
  leader: ["leadership"], lead: ["leadership"], boss: ["leadership", "management"],
  america: ["nation", "country", "union"], country: ["nation", "union"], usa: ["america", "union"],
  persuade: ["convince", "persuasion"], argue: ["debate", "persuasion"], convince: ["persuade"],
  divided: ["division"], polarization: ["division", "divided", "friends"], politics: ["politics", "public"],
  change: ["anew", "adapt"], future: ["history"], legacy: ["history", "remembered"],
  hard: ["difficulty", "struggle"], tough: ["difficulty", "struggle"], difficult: ["difficulty"],
  funny: ["humor"], joke: ["humor"], laugh: ["humor"],
  lawyer: ["law"], kids: ["children"], son: ["children"], daughter: ["children"],
  soldier: ["soldiers", "army", "veterans"], veteran: ["veterans", "soldiers"], military: ["army", "generals"],
  procrastinate: ["delay", "caution", "action"], procrastination: ["delay", "caution"], lazy: ["idle", "idler", "work"],
  dream: ["ambition", "goal"], goal: ["ambition", "purpose"], meaning: ["purpose"], purpose: ["meaning"],
  breakup: ["sorrow", "grief", "affliction", "pass"], broke: ["sorrow", "affliction", "pass"],
  heartbreak: ["sorrow", "grief", "affliction", "pass"], heartbroken: ["sorrow", "grief", "affliction", "pass"],
  girlfriend: ["sorrow", "affliction", "pass"], boyfriend: ["sorrow", "affliction", "pass"],
  dumped: ["sorrow", "affliction", "pass"], divorce: ["sorrow", "affliction", "pass"],
  relationship: ["friend", "affection"], love: ["affection", "friend"], hurt: ["sorrow", "distress"],
  cry: ["sorrow", "grief"], crying: ["sorrow", "grief"], upset: ["sorrow", "distress"], anxious: ["distress", "affliction"],
  anxiety: ["distress", "affliction"], stress: ["distress", "difficulty"], stressed: ["distress", "difficulty"],
  unhappy: ["sorrow", "happy"], miserable: ["sorrow", "affliction"], hopeless: ["hope", "happy", "sorrow"],
  danger: ["threat"], threat: ["danger"], media: ["public", "sentiment"], news: ["public", "sentiment"],
};

function stem(w) {
  if (w.length <= 4) return w;
  for (const [suf, rep] of [["ies", "y"], ["ness", ""], ["ing", ""], ["edly", ""], ["ed", ""], ["ly", ""], ["es", ""], ["s", ""]]) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length) + rep;
  }
  return w;
}

function words(s) {
  return (s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/).filter((w) => w.length > 1 && !STOP.has(w));
}

function editDistance(a, b, limit) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin >= limit) return limit;
    prev = cur;
  }
  return prev[b.length];
}

export function tokenize(s) {
  return words(s).map(stem);
}

export class QuoteIndex {
  constructor(quotes) {
    this.quotes = quotes;
    this.docs = quotes.map((q) => {
      const tf = new Map();
      const add = (tokens, weight) => tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + weight));
      add(tokenize(q.text), 1);
      add(tokenize(q.work), 1.5);
      add(tokenize((q.topics || []).join(" ")), 2.5);
      const len = [...tf.values()].reduce((a, b) => a + b, 0);
      return { tf, len };
    });
    this.avgLen = this.docs.reduce((a, d) => a + d.len, 0) / Math.max(1, this.docs.length);
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }

  // Closest indexed word to a misspelled one ("democrazy" → "democracy").
  correct(t) {
    // Short words are too often real words we simply don't index ("deal", "treat").
    if (t.length < 6 || this.df.has(t)) return null;
    const maxDist = t.length >= 8 ? 2 : 1;
    let best = null, bestD = maxDist + 1;
    for (const v of this.df.keys()) {
      if (Math.abs(v.length - t.length) > maxDist || v[0] !== t[0]) continue;
      const d = editDistance(t, v, bestD);
      if (d < bestD) { best = v; bestD = d; }
    }
    return best;
  }

  queryTerms(question) {
    const terms = new Map();
    for (const w of words(question)) {
      const fixed = SYN[w] || SYN[stem(w)] ? null : this.correct(stem(w));
      if (fixed) terms.set(fixed, Math.max(terms.get(fixed) || 0, 0.9));
      terms.set(stem(w), Math.max(terms.get(stem(w)) || 0, 1));
      for (const s of SYN[w] || SYN[stem(w)] || []) {
        for (const t of tokenize(s)) terms.set(t, Math.max(terms.get(t) || 0, 0.4));
      }
    }
    return terms;
  }

  search(question, k = 5) {
    const terms = this.queryTerms(question);
    const N = this.docs.length, k1 = 1.4, b = 0.7;
    const results = [];
    this.docs.forEach((d, i) => {
      let score = 0;
      for (const [t, qw] of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t);
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += qw * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / this.avgLen));
      }
      if (score > 0) results.push({ quote: this.quotes[i], score });
    });
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }
}
