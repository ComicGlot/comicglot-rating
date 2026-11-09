# ComicGlot rating

The human-evaluation app of [ComicGlot](https://github.com/ComicGlot/ComicGlot). Raters see single frames from Korean webtoons, one text at a time, and judge what the ComicGlot pipeline produced. A study chooses its steps; a rater can be limited to some of them.

| Step | What the rater does | What it measures |
| --- | --- | --- |
| Text types | Chooses the type of every numbered box without seeing the detector's type; flags text that has no box. | Agreement of people with the detector. |
| Transcription | Types the Korean of every box from the crop, or marks it unreadable. Model readings are never shown. | Ground truth for the character error rate of the OCR systems. |
| Translations | Sees the Korean and two unlabelled English versions, picks the better one or a tie, and marks the tone of each version (fits, added, overdone). Can flag a Korean source that looks misread. | The blind comparison of translating with the text type's style guide against translating without it, per model. |
| Check the frame | Sees everything entered on the frame and confirms it. | Completeness. |

## For raters

- Sign-in is one field: the **access key** they were given. A one-person key stays that person's key, so they can come back with it on any device. A shared key gives each person their own key, shown on their home page.
- Interface in English, French, German, Russian or Ukrainian (switch at the top of every page; English by default). Translations are always judged into English. Texts live in `src/lib/i18n/<lang>.ts`, checked against the English file by the type system.
- A welcome page with what the study is, the steps, a time estimate, how the data is used and a consent box (`Rater.consentAt`). The text above the steps is the study's `intro`, editable in the admin panel.
- An optional practice set, shown first and left out of every export and result. Attention checks (two identical versions, expected answer: equal).
- Pairs whose two versions are the same text are not shown; the results page counts them per family.
- Shortcuts: `J`/`K` next and previous text, `A`/`E`/`B` the better version, `1`/`2`/`3` the tone, `Ctrl+Enter` next text or save, `?` the guide. Drafts survive a reload. Time is recorded per text and per frame.
- Light and dark themes; works down to phone width.

## For the admin

The admin signs in at `/admin/login` with `ADMIN_USERNAME` and `ADMIN_PASSWORD` from the environment.

- **Access keys**: create keys for one person, up to N people or anyone; with a role (translator, transcriber, tester), optional custom steps, one study or every open study, and an optional end date. Copy the key or a ready invitation. Pause, resume or delete a key (raters who already joined keep their own key).
- **Raters**: role, steps, key, progress; assign sets imported later; block; clear a rater's answers or delete the rater (both ask for a second click). Testers are left out of every result; "Delete all testers" cleans the dashboard after a trial run.
- **Studies**: steps, own-translation setting, welcome text, translations per model and condition; clear every answer of a study or delete it (second click); generate more translations or run a model judge through OpenRouter.
- **Results**: guide against no type by text family, ties, overdone tone, Krippendorff's alpha, a sign test on texts, per model; model judges apart; attention checks; character error rate against the transcriptions; agreement with the detector.
- **Exports**: one CSV per step, unblinded, practice left out, with `rater_kind` (person or model), attention checks, the source flag and time per text.

Stack: Next.js 15 (App Router), Postgres through Prisma, a signed cookie for sessions, OpenRouter for model calls from the admin side.

## Deploy on Vercel

1. Import the repository in Vercel (New Project). A public repository deploys on the free plan.
2. Storage: add a Postgres database (Neon) to the project. This sets `DATABASE_URL`; add `DIRECT_URL` (the non-pooled URL) in Settings > Environment Variables.
3. Add the variables from `.env.example`: `SESSION_SECRET` (32+ random characters, e.g. `openssl rand -base64 48`), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `OPENROUTER_API_KEY` if you generate translations or run a judge from the admin panel.
4. Create the tables from your machine: put the two database URLs in `.env`, run `npm install` then `npm run db:push`. Run `npm run db:push` again after a schema change.
5. Load a study (below), deploy, sign in at `/admin/login` and create access keys.

## Load a study

```bash
# In the ComicGlot checkout: translations under both conditions
python -m eval.translation_study.run_conditions --runs RUN.json ... --sample blocks.csv \
    --source corrected --model MODEL --conditions true_class no_class --out study_round1

# Here (with Pillow installed): frames, boxes, readings and candidates into data/ (git-ignored)
python tools/export_chapters.py --project-root ../ComicGlot --runs ../ComicGlot/data/output/RUN/chapter_full_results.json ... \
    --sample sample.json --calls ../ComicGlot/study_round1/calls.jsonl --attention 10 --steps compare --study round1 --out data/round1

# Into the database named in .env
npm run import -- data/round1/chapters.json
```

- `--sample sample.json` (from ComicGlot `eval/sample_frames.py`) exports exactly the frames of the study sample. `--practice N` puts N frames in a practice set; `--attention N` adds N attention checks; `--intro FILE` sets the welcome text.
- The transcription export has `block_uid` and `gt_text` columns, so it is the `--gt` file of ComicGlot's `eval/ocr_eval.py`. `--readings` adds other OCR systems' readings as `reading:<name>` columns.
- Importing again adds new candidates and readings and changes nothing raters may have seen.

## Model judge

"Judge with a model" on the Studies page sends every blind pair to a language model through OpenRouter, with the same random letters a person would get. The judge sees the Korean, the two versions and, by default, the frame with the text's box; it is never told the type. Its answers are stored as the rater `model:<id>` (blocked from signing in) and reported apart from people.

## Data and privacy

- Frames are stored in the database and served only through `/api/page-image/<id>` to the admin and to raters assigned that set. The frames belong to their publishers: do not publish a deployment beyond the raters, and never commit import files, images or keys (`data/` and `.env*` are ignored).
- Raters are known by a generated name and their key; keep real identities outside the app.

## Run locally

Put local values in `.env.local` (git-ignored), push the schema with the same database URLs in the environment, then:

```bash
npx prisma db push
npm run dev
```
