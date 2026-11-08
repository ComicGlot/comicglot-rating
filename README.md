# ComicGlot rating (private)

Web app for the studies of the ComicGlot paper. Each rater signs in with a name and an access code and works through assigned chapters in order, page by page. A chapter is either a real chapter or a set of single frames sampled across series (see Load chapters). On every page the steps come in a fixed order:

| Step | What the rater does | What it measures (paper) |
| --- | --- | --- |
| Text types | Chooses the type of every numbered box, without seeing the detector's type; flags text that has no box. | Agreement of people with the detector's types on unseen chapters; missed text. |
| Transcription | Types the Korean of every box from the crop, or marks it unreadable. Model readings are never shown. | Ground truth for the character error rate of every OCR system (`tab:cer`). |
| Translations | May write an own translation first (then locked), sees the Korean and two unlabelled English versions per comparison, picks the better or a tie, marks tone that fits, is added, or is overdone, and can flag a Korean source that looks misread. | The blind study of the type's guide against no type (`tab:study`), and the same for other models (`tab:models`). |
| Check the frame | Sees everything entered on the frame, can go back to any step, and confirms the frame once every step is done. Changing a step later asks for a new confirmation. | Completeness. |

A study chooses which steps it uses; a rater can be limited to some of them (a Korean reader does transcription, a translator does translations).

### For raters

- A welcome page before the first frame: what the study is, the steps this person does, a time estimate, how their data is used, and a consent box (stored as `Rater.consentAt`). The text above the steps is the study's `intro`, editable in the admin panel.
- An optional practice set, shown first and left out of every export and result.
- The work screen: the frame on the left (zoom, focus on the active box), one text at a time on the right with a zoomed crop, and the steps as tabs. Shortcuts: `J`/`K` next and previous text, `1`–`0` types, `A`/`B`/`T` choices, `Ctrl+Enter` next text or save, `?` the guide.
- Drafts are kept in the browser until the frame is saved, so a reload or a lost connection loses nothing.
- Time is recorded per text (`ms` in each answer) as well as per frame.
- Light and dark themes; the layout works down to phone width, although desktop is the intended setting.

### For the admin

- Overview: raters, progress per step, time, last activity.
- Results: a live preview of `tab:study` (guide against no type by family, ties, overdone tone, Krippendorff's alpha, a sign test on texts), the per-model column of `tab:models`, model judges reported apart, attention checks, `tab:cer` against the transcriptions, and agreement with the detector's types. The paper's numbers come from the exports and the analysis scripts.
- Raters: presets for a Korean reader and a translator, one-time codes with a copyable invitation, steps per person, block and unblock.
- Studies: steps, own-translation setting, welcome text, translations per model and condition, and generation of more translations through OpenRouter.
- Exports: one CSV per step, unblinded, practice left out, with `rater_kind` (person or model), attention checks, the source flag and time per text.

Stack: Next.js 15 (App Router) on Vercel, Postgres through Prisma (Vercel Postgres / Neon), a signed cookie for sessions, OpenRouter for model calls from the admin side.

## Set up on Vercel

1. Import this repository in Vercel (New Project).
2. Storage: add a Postgres database (Neon) to the project. This sets `DATABASE_URL`; also add `DIRECT_URL` (the non-pooled URL) in Settings > Environment Variables.
3. Add the other variables from `.env.example`:
   - `SESSION_SECRET`: 32+ random characters, e.g. `openssl rand -base64 48`;
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`;
   - `OPENROUTER_API_KEY` for the model comparison.
4. Create the tables from your machine: copy `.env.example` to `.env`, fill in the two database URLs, run `npm install` then `npm run db:push`. Run `npm run db:push` again after a schema change.
5. Deploy. Open the site and sign in as the admin.

## Load chapters

```bash
# 1. In the ComicGlot checkout, if the study has translations: produce them under each condition
python -m eval.translation_study.run_conditions --runs RUN.json ... --sample sample.csv \
    --source corrected --model MODEL --conditions true_class no_class --out study_round1

# 2. Here (with Pillow installed): pages, boxes, readings and candidates into data/ (git-ignored)
python tools/export_chapters.py --project-root ../ComicGlot \
    --runs ../ComicGlot/data/output/RUN/chapter_full_results.json ... \
    --calls ../ComicGlot/study_round1/calls.jsonl --readings ocr_systems.csv \
    --study round1 --per-type 40 --set-size 20 --out data/round1

# 3. Into the database named in .env
npm run import -- data/round1/chapters.json
```

- `--practice N` puts the first N sampled frames in a practice set; `--attention N` adds to N texts a comparison of two identical versions (expected answer: a tie); `--intro FILE` sets the welcome text.
- `--per-type 40` draws single frames, rarest type first, until every type has at least 40 blocks, and groups them into shuffled sets of 20 frames from many series; the app shows each set like a chapter. Pass only runs of chapters the detector was not trained on. Without it, every run becomes one chapter.
- The transcription export has `block_uid` and `gt_text` columns (`#ILLEGIBLE` for unreadable blocks), so it is the `--gt` file of `ComicGlot/eval/ocr_eval.py` as it is.
- `--readings` takes CSV files with a `block_uid` column and one column per OCR system; they appear as `reading:<name>` columns in the transcription export next to the rater's text.
- Importing a chapter again adds new candidates and readings and changes nothing else; candidates raters may have seen are never replaced.
- New raters get every chapter of the open studies; "Assign new chapters" gives existing raters chapters imported later.

## Other models

"Translate with another model" in the admin panel sends every block of a study through OpenRouter with the pipeline's own prompt (`eval/translation_study/run_conditions.py`), the study's style guides and the three previous lines. Each condition is stored as `<condition>@<model>` (with `+page` when the page image is sent), and candidates are compared only with others of the same model, so each model adds one comparison per block.

## Data and privacy

- Pages are stored in the database and served only through `/api/page-image/<id>` to the admin and to raters assigned that chapter. The chapters belong to their publishers: never make the deployment public beyond the raters.
- Never commit import files, images, workbooks or keys; `data/`, `*.xlsx` and `key.json` are ignored.
- Raters are identified by the name the admin gives them; keep real identities outside the app.

## Tested

8 November 2026, on a local Postgres with frames from the two published chapters (`next build`, then Playwright driving Chrome): sign-in, the welcome page and consent, a Korean reader transcribing a practice frame and a real frame with the keyboard, confirming a frame, a translator writing an own translation, revealing the versions and choosing with `A`, `T` and `Ctrl+Enter`, a draft restored after a reload, every admin page, and the results page on simulated answers. The checks found no browser errors. Earlier (4 November): the four CSV exports with letters mapped back to conditions, and raters kept out of the admin export. The OpenRouter call itself has not been run.

## Run locally

With PostgreSQL installed (or any Postgres you can reach), put local values in `.env.local` (git-ignored; Next.js prefers it to `.env`) and pass the same URLs to the Prisma commands:

```bash
DATABASE_URL=postgresql://postgres@localhost:5433/comicglot_rating DIRECT_URL=postgresql://postgres@localhost:5433/comicglot_rating npx prisma db push
npm run dev
```

## Next steps

- A model judge: the same blind pairs sent to a language model and stored as a rater named `model:<slug>`, so the export and the results page treat it like a person and report it apart.
- Images in Vercel Blob instead of the database if the study grows past a few dozen chapters.
- Rate limiting on the login route.
