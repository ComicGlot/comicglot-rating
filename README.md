# ComicGlot rating (private)

Web app for the studies of the ComicGlot paper. Each rater signs in with a name and an access code and works through assigned chapters in order, page by page. On every page the steps come in a fixed order:

| Step | What the rater does | What it measures (paper) |
| --- | --- | --- |
| Text types | Chooses the type of every numbered box, without seeing the detector's type; flags text that has no box. | Agreement of people with the detector's types on unseen chapters; missed text. |
| Transcription | Types the Korean of every box from the crop, or marks it unreadable. Model readings are never shown. | Ground truth for the character error rate of every OCR system (`tab:cer`). |
| Translations | May write an own translation first (then locked), sees the Korean and two unlabelled English versions per comparison, picks the better or a tie and marks tone that fits, is added, or is overdone. | The blind study of the type's guide against no type (`tab:study`), and the same for other models (`tab:models`). |
| Check the page | Sees everything entered on the page, can go back to any step, and confirms the page. Changing a step later asks for a new confirmation. | Completeness. |

A study chooses which steps it uses; a rater can be limited to some of them (a Korean reader does types and transcription, a translator does translations). The admin panel creates raters with one-time codes, sets steps, shows progress per step, generates more candidate translations through OpenRouter, and exports one CSV per step with letters mapped back to conditions.

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
    --study round1 --frames 0-29 --skip-empty --out data/round1

# 3. Into the database named in .env
npm run import -- data/round1/chapters.json
```

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

On a local Postgres with a synthetic two-page chapter (`next build`, then a Playwright run): admin login, a rater with a one-time code, all four steps on both pages with the own translation locked once the candidates are shown, a page without boxes skipped, the overview at 100%, raters kept out of the admin export, and the four CSV exports with letters mapped back to conditions. The OpenRouter call itself was not run (no key in the test environment).

## Next steps

- An instructions and consent page before the first page, and a short practice chapter.
- Attention checks (a comparison whose two versions are identical).
- Agreement (Krippendorff's alpha) and the sign test in the admin view, matching `analyse_ratings.py`.
- Images in Vercel Blob instead of the database if the study grows past a few dozen chapters.
- Rate limiting on the login route.
