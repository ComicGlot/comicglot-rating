// Live summaries of the collected work for the admin results page. They mirror the analysis scripts of the
// ComicGlot repository (eval/ocr_eval.py, the pairwise analysis) closely enough to watch a study as it runs;
// the numbers in the paper come from those scripts and the CSV exports.
import { db } from "./db";
import { sameText } from "./flow";
import { ATTENTION_MODEL, FAMILY_OF, OCR_GROUP_OF, baseCondition, type Family, type OcrGroup } from "./steps";

// ---------- small statistics ----------

function logFact(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

// Exact two-sided sign test: k successes out of n, p = 0.5.
export function signTest(k: number, n: number): number {
  if (n === 0) return 1;
  const lf = logFact(n);
  const pmf = (i: number) => Math.exp(lf - logFact(i) - logFact(n - i) - n * Math.LN2);
  const lo = Math.min(k, n - k);
  let tail = 0;
  for (let i = 0; i <= lo; i++) tail += pmf(i);
  return Math.min(1, 2 * tail);
}

// Wilson 95% interval for a share.
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// Krippendorff's alpha, nominal metric. units: the values given to each unit by different raters.
export function alphaNominal(units: string[][]): number | null {
  const o = new Map<string, number>();
  let n = 0;
  for (const u of units) {
    const m = u.length;
    if (m < 2) continue;
    for (let i = 0; i < m; i++)
      for (let j = 0; j < m; j++)
        if (i !== j) {
          const k = `${u[i]}\u0000${u[j]}`;
          o.set(k, (o.get(k) ?? 0) + 1 / (m - 1));
        }
    n += m;
  }
  if (n < 2) return null;
  const nc = new Map<string, number>();
  let disagreeO = 0;
  for (const [k, v] of o) {
    const [a, b] = k.split("\u0000");
    nc.set(a, (nc.get(a) ?? 0) + v);
    if (a !== b) disagreeO += v;
  }
  let disagreeE = 0;
  const vals = [...nc.entries()];
  for (const [a, na] of vals) for (const [b, nb] of vals) if (a !== b) disagreeE += na * nb;
  disagreeE /= n - 1;
  if (disagreeE === 0) return null;
  return 1 - disagreeO / disagreeE;
}

function levenshtein(a: string[], b: string[]): number {
  if (a.length < b.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[b.length];
}

// As eval/ocr_eval.py norm_chars(strip_punct=False): NFC, whitespace removed.
const normChars = (s: string) => [...(s ?? "").normalize("NFC").replace(/\s+/g, "")];

// ---------- data ----------

const live = { page: { chapter: { practice: false, study: { active: true } } } } as const;

export type StudyRow = {
  key: Family | "all";
  label: string;
  judgements: number;
  guide: number;
  plain: number;
  tie: number;
  // Tone is optional: each share is out of the judgements that gave that version a tone.
  toneGuide: number;
  tonePlain: number;
  strongGuide: number;
  strongPlain: number;
  flatGuide: number;
  flatPlain: number;
  blocks: number;
  blocksDecided: number;
  blocksGuide: number;
  p: number;
  alpha: number | null;
};

export type Results = Awaited<ReturnType<typeof loadResults>>;

export async function loadResults(studyId?: string) {
  const where = { ...live, ...(studyId ? { page: { chapter: { practice: false, studyId } } } : {}) };
  const raters = await db.rater.findMany({ select: { id: true, username: true, role: true } });
  // Testers try the study out; their answers never count.
  const tester = new Set(raters.filter((r) => r.role === "tester").map((r) => r.id));
  const nameOf = new Map(raters.map((r) => [r.id, r.username]));
  const isModel = (id: string) => (nameOf.get(id) ?? "").startsWith("model:");

  // ----- translations: guide against no type, per model group -----
  const cmp = await db.response.findMany({
    where: { step: "compare", block: where, rater: { role: { not: "tester" } } },
    select: { raterId: true, blockId: true, data: true, block: { select: { className: true, candidates: { select: { id: true, condition: true, model: true } } } } },
  });
  type J = { rater: string; block: string; model: string; family: Family | null; choice: "guide" | "plain" | "tie" | "other"; toneGuide: string; tonePlain: string; sourceWrong: boolean };
  const judgements: J[] = [];
  let attentionN = 0, attentionPass = 0;
  const attentionFail = new Map<string, number>();
  // Ranking mode: every version gets the rank of its card; the versions are scored against those of other models.
  type V = { rater: string; block: string; model: string; cond: string; rank: number; family: Family | null };
  const versions: V[] = [];
  for (const r of cmp) {
    const d = r.data as {
      sets?: { model: string | null; letters: Record<string, string>; choice: string; tone: Record<string, string> }[];
      ranking?: { models: string[]; cards: Record<string, string[]>; groups: string[][]; decoy?: string };
      sourceWrong?: boolean;
    };
    const cond = new Map(r.block.candidates.map((c) => [c.id, baseCondition(c.condition)]));
    if (d.ranking) {
      const rk = d.ranking;
      const rankOf: Record<string, number> = {};
      rk.groups.forEach((g, i) => g.forEach((l) => (rankOf[l] = i)));
      if (rk.decoy) {
        attentionN++;
        if (rankOf[rk.decoy] === rk.groups.length - 1) attentionPass++;
        else attentionFail.set(r.raterId, (attentionFail.get(r.raterId) ?? 0) + 1);
      }
      const candRank = new Map<string, number>();
      for (const [l, ids] of Object.entries(rk.cards)) if (l !== rk.decoy) for (const id of ids) candRank.set(id, rankOf[l]);
      const modelOf = new Map(r.block.candidates.map((c) => [c.id, c.model ?? ""]));
      const family = FAMILY_OF[r.block.className ?? ""] ?? null;
      for (const [id, rank] of candRank) versions.push({ rater: r.raterId, block: r.blockId, model: modelOf.get(id) ?? "", cond: cond.get(id) ?? "?", rank, family });
      // Within each model, its two versions make one guide-or-no-type judgement, as in the pair mode.
      for (const model of rk.models) {
        const ids = [...candRank.keys()].filter((id) => modelOf.get(id) === model);
        const g = ids.find((id) => cond.get(id) === "true_class"), p = ids.find((id) => cond.get(id) === "no_class");
        if (!g || !p) continue;
        const rg = candRank.get(g)!, rp = candRank.get(p)!;
        judgements.push({
          rater: r.raterId, block: `${r.blockId}:${model}`, model, family,
          choice: rg === rp ? "tie" : rg < rp ? "guide" : "plain",
          toneGuide: "", tonePlain: "", sourceWrong: !!d.sourceWrong,
        });
      }
      continue;
    }
    for (const s of d.sets ?? []) {
      if (s.model === ATTENTION_MODEL) {
        attentionN++;
        if (s.choice === "tie") attentionPass++;
        else attentionFail.set(r.raterId, (attentionFail.get(r.raterId) ?? 0) + 1);
        continue;
      }
      const byLetter = Object.fromEntries(Object.entries(s.letters).map(([l, id]) => [l, cond.get(id) ?? "?"]));
      const conds = new Set(Object.values(byLetter));
      if (!(conds.has("true_class") && conds.has("no_class"))) continue;
      const chosen = s.choice === "tie" ? "tie" : byLetter[s.choice];
      const letterOf = (c: string) => Object.keys(byLetter).find((l) => byLetter[l] === c)!;
      judgements.push({
        rater: r.raterId,
        block: `${r.blockId}:${s.model ?? ""}`,
        model: s.model ?? "(imported)",
        family: FAMILY_OF[r.block.className ?? ""] ?? null,
        choice: chosen === "tie" ? "tie" : chosen === "true_class" ? "guide" : chosen === "no_class" ? "plain" : "other",
        toneGuide: s.tone?.[letterOf("true_class")] ?? "",
        tonePlain: s.tone?.[letterOf("no_class")] ?? "",
        sourceWrong: !!d.sourceWrong,
      });
    }
  }

  function row(key: StudyRow["key"], label: string, js: J[]): StudyRow {
    const per = new Map<string, J[]>();
    for (const j of js) per.set(j.block, [...(per.get(j.block) ?? []), j]);
    let decided = 0, forGuide = 0;
    for (const v of per.values()) {
      const g = v.filter((x) => x.choice === "guide").length, p = v.filter((x) => x.choice === "plain").length;
      if (g !== p) { decided++; if (g > p) forGuide++; }
    }
    return {
      key, label,
      judgements: js.length,
      guide: js.filter((j) => j.choice === "guide").length,
      plain: js.filter((j) => j.choice === "plain").length,
      tie: js.filter((j) => j.choice === "tie").length,
      toneGuide: js.filter((j) => j.toneGuide).length,
      tonePlain: js.filter((j) => j.tonePlain).length,
      strongGuide: js.filter((j) => j.toneGuide === "strong").length,
      strongPlain: js.filter((j) => j.tonePlain === "strong").length,
      flatGuide: js.filter((j) => j.toneGuide === "flat").length,
      flatPlain: js.filter((j) => j.tonePlain === "flat").length,
      blocks: per.size,
      blocksDecided: decided,
      blocksGuide: forGuide,
      p: signTest(forGuide, decided),
      alpha: alphaNominal([...per.values()].map((v) => v.map((x) => x.choice))),
    };
  }

  const groups = (js: J[]) => [
    ...(["balloon", "box", "sfx"] as Family[]).map((f) => row(f, { balloon: "Outlined balloons", box: "Boxes and free text", sfx: "Sound effects" }[f], js.filter((j) => j.family === f))),
    row("all", "All", js),
  ];
  const human = judgements.filter((j) => !isModel(j.rater) && !tester.has(j.rater));
  const models = [...new Set(judgements.map((j) => j.model))].sort();
  const perModel = models.map((m) => ({ model: m, human: row("all", m, human.filter((j) => j.model === m)) }));
  const judges = [...new Set(judgements.filter((j) => isModel(j.rater)).map((j) => j.rater))].map((id) => ({
    judge: nameOf.get(id) ?? id,
    rows: groups(judgements.filter((j) => j.rater === id)),
  }));

  // Model ranking: each version against the versions of the other models in the same ranking (a tie counts half).
  // Score = share of such comparisons won; also the score of the guided and the unguided version alone.
  type Win = { w: number; n: number };
  const acc = new Map<string, { all: Win; guide: Win; plain: Win; texts: Set<string> }>();
  const condAcc = { guide: { w: 0, n: 0 }, plain: { w: 0, n: 0 } };
  const byItem = new Map<string, V[]>();
  for (const v of versions.filter((x) => !isModel(x.rater) && !tester.has(x.rater))) {
    const k = `${v.rater}:${v.block}`;
    byItem.set(k, [...(byItem.get(k) ?? []), v]);
  }
  for (const vs of byItem.values())
    for (const a of vs)
      for (const b of vs) {
        if (a === b || a.model === b.model) continue;
        const w = a.rank < b.rank ? 1 : a.rank === b.rank ? 0.5 : 0;
        const e = acc.get(a.model) ?? { all: { w: 0, n: 0 }, guide: { w: 0, n: 0 }, plain: { w: 0, n: 0 }, texts: new Set<string>() };
        e.all.w += w; e.all.n++;
        e.texts.add(`${a.rater}:${a.block}`);
        const c = a.cond === "true_class" ? "guide" : a.cond === "no_class" ? "plain" : null;
        if (c) { e[c].w += w; e[c].n++; }
        acc.set(a.model, e);
        // Guided against unguided versions across models: the guide's effect without the model's.
        if (a.cond === "true_class" && b.cond === "no_class") { condAcc.guide.w += w; condAcc.guide.n++; }
      }
  const share = (a: Win) => (a.n ? a.w / a.n : null);
  const ranking = [...acc.entries()]
    .map(([model, e]) => ({ model, items: e.texts.size, score: share(e.all), guide: share(e.guide), plain: share(e.plain), comparisons: e.all.n }))
    .sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
  const rankingCross = { guideOverPlain: share(condAcc.guide), n: condAcc.guide.n };

  // ----- transcription: CER of every stored reading -----
  const tr = await db.response.findMany({
    where: { step: "transcribe", block: where },
    select: { raterId: true, data: true, block: { select: { id: true, className: true, sourceText: true, readings: true } } },
  });
  type Acc = { err: number; len: number; n: number };
  const cer = new Map<string, Map<OcrGroup | "all", Acc>>();
  let unreadable = 0, transcribed = 0;
  const gtByBlock = new Map<string, string[]>();
  for (const r of tr) {
    const d = r.data as { text?: string; unreadable?: boolean };
    if (isModel(r.raterId) || tester.has(r.raterId)) continue;
    if (d.unreadable) { unreadable++; continue; }
    const gt = normChars(d.text ?? "");
    if (!gt.length) continue;
    transcribed++;
    gtByBlock.set(r.block.id, [...(gtByBlock.get(r.block.id) ?? []), gt.join("")]);
    const readings = { ...((r.block.readings ?? {}) as Record<string, string>) };
    const g = OCR_GROUP_OF[r.block.className ?? ""];
    for (const [k, v] of Object.entries(readings)) {
      if (typeof v !== "string") continue;
      const e = levenshtein(normChars(v), gt);
      const m = cer.get(k) ?? new Map();
      for (const key of [g, "all"] as const) {
        if (!key) continue;
        const a = m.get(key) ?? { err: 0, len: 0, n: 0 };
        a.err += e; a.len += gt.length; a.n++;
        m.set(key, a);
      }
      cer.set(k, m);
    }
  }
  // Agreement between transcribers on blocks typed by more than one person (CER of one against the other).
  let twoErr = 0, twoLen = 0, twoN = 0;
  for (const v of gtByBlock.values()) if (v.length >= 2) { twoErr += levenshtein([...v[0]], [...v[1]]); twoLen += Math.max(v[0].length, v[1].length); twoN++; }

  // ----- types: agreement with the detector -----
  const ty = await db.response.findMany({ where: { step: "types", block: where, rater: { role: { not: "tester" } } }, select: { raterId: true, data: true, block: { select: { className: true } } } });
  const typeRows = (["balloon", "box", "sfx"] as Family[]).map((f) => {
    const xs = ty.filter((t) => FAMILY_OF[t.block.className ?? ""] === f);
    return { family: f, n: xs.length, agree: xs.filter((t) => (t.data as { type?: string }).type === t.block.className).length };
  });

  // Pairs where the guide changed nothing: the two versions are the same text, so raters never see them.
  const pairBlocks = await db.block.findMany({
    where,
    select: { className: true, candidates: { select: { condition: true, model: true, text: true } } },
  });
  const identical = { balloon: [0, 0], box: [0, 0], sfx: [0, 0], all: [0, 0] } as Record<Family | "all", [number, number]>;
  for (const b of pairBlocks) {
    const byModel = new Map<string, { g?: string; p?: string }>();
    for (const c of b.candidates) {
      if (c.model === ATTENTION_MODEL) continue;
      const e = byModel.get(c.model ?? "") ?? {};
      const base = baseCondition(c.condition);
      if (base === "true_class") e.g = c.text;
      if (base === "no_class") e.p = c.text;
      byModel.set(c.model ?? "", e);
    }
    const fam = FAMILY_OF[b.className ?? ""];
    for (const e of byModel.values()) {
      if (e.g === undefined || e.p === undefined) continue;
      const same = sameText(e.g, e.p) ? 1 : 0;
      for (const k of [fam, "all"] as const) if (k) { identical[k][0] += same; identical[k][1] += 1; }
    }
  }

  return {
    identical,
    study: groups(human),
    perModel,
    judges,
    ranking,
    rankingCross,
    sourceWrong: human.filter((j) => j.sourceWrong).length,
    attention: { n: attentionN, pass: attentionPass, failBy: [...attentionFail.entries()].map(([id, n]) => ({ rater: nameOf.get(id) ?? id, n })) },
    cer: [...cer.entries()].map(([reading, m]) => ({ reading, groups: Object.fromEntries([...m.entries()].map(([k, a]) => [k, { cer: a.len ? a.err / a.len : null, n: a.n }])) as Record<string, { cer: number | null; n: number }> })),
    transcribed,
    unreadable,
    transcriberAgreement: twoN ? { blocks: twoN, cer: twoLen ? twoErr / twoLen : 0 } : null,
    types: { rows: typeRows, n: ty.length, agree: ty.filter((t) => (t.data as { type?: string }).type === t.block.className).length },
  };
}
