"use client";
import { useActionState, useRef, useState } from "react";
import { submitJudgement } from "./actions";

type Props = {
  assignmentId: string;
  itemId: string;
  hasImage: boolean;
  source: string;
  context: string[];
  candidates: { letter: string; text: string }[];
  askOwn: boolean;
};

// Step 1 (optional): the rater writes their own translation without seeing any candidate.
// Step 2: the candidates appear in a per-rater random order, labelled only by letter.
export default function RateForm(p: Props) {
  const [step, setStep] = useState(p.askOwn ? 1 : 2);
  const [own, setOwn] = useState("");
  const [choice, setChoice] = useState("");
  const [tone, setTone] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const started = useRef(Date.now());
  const msRef = useRef<HTMLInputElement>(null);
  const [error, action, pending] = useActionState(submitJudgement, null);

  return (
    <form
      action={action}
      onSubmit={() => {
        if (msRef.current) msRef.current.value = String(Date.now() - started.current);
      }}
    >
      <input type="hidden" name="assignmentId" value={p.assignmentId} />
      <input type="hidden" name="ownTranslation" value={own} />
      <input ref={msRef} type="hidden" name="msSpent" defaultValue="0" />

      <div className="card row">
        {p.hasImage && (
          <div className="grow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="crop" src={`/api/image/${p.itemId}`} alt="The text block on the page, marked" />
          </div>
        )}
        <div className="grow">
          {p.context.length > 0 && (
            <>
              <label>Previous lines</label>
              <div className="context">{p.context.join("\n")}</div>
            </>
          )}
          <label>Korean</label>
          <div className="korean">{p.source}</div>
        </div>
      </div>

      {step === 1 && (
        <div className="card">
          <label htmlFor="own">Your translation (optional)</label>
          <textarea id="own" value={own} onChange={(e) => setOwn(e.target.value)} />
          <p><button type="button" onClick={() => setStep(2)}>Show the translations</button></p>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <p className="muted">Which translation is better for this block, as it is drawn on the page?</p>
          {p.candidates.map((c) => (
            <div key={c.letter} className={`cand ${choice === c.letter ? "chosen" : ""}`}>
              <label style={{ fontWeight: 400 }}>
                <input type="radio" name="choice" value={c.letter} checked={choice === c.letter} onChange={() => setChoice(c.letter)} />{" "}
                <span className="letter">{c.letter}</span>
                {c.text}
              </label>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <span className="muted">Tone:</span>
                <select name={`tone_${c.letter}`} value={tone[c.letter] ?? "fine"} onChange={(e) => setTone({ ...tone, [c.letter]: e.target.value })} style={{ width: "auto" }}>
                  <option value="fine">fits the page</option>
                  <option value="added">adds tone that is not there</option>
                  <option value="overdone">overdoes the tone</option>
                </select>
              </div>
            </div>
          ))}
          <label style={{ fontWeight: 400 }}>
            <input type="radio" name="choice" value="tie" checked={choice === "tie"} onChange={() => setChoice("tie")} /> Equally good (tie)
          </label>
          <label htmlFor="comment">Comment (optional)</label>
          <textarea id="comment" name="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          {error && <p className="err">{error}</p>}
          <p><button disabled={!choice || pending}>Save and continue</button></p>
        </div>
      )}
    </form>
  );
}
