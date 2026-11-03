# ComicGlot rating (private)

Web app for the blind translator study of the ComicGlot paper. Raters sign in with a name and an access code, see one text block at a time (the frame with the block outlined, the previous lines and the Korean), may write their own translation first, then compare two or more candidate translations labelled only by letter. They pick the better one or a tie and flag tone that is added or overdone. The admin panel creates raters, shows progress and exports the judgements with the letters mapped back to conditions.

Stack: Next.js 15 (App Router) on Vercel, Postgres through Prisma (Vercel Postgres / Neon), a signed cookie for sessions, OpenRouter for generating candidates from the admin side.

## Status

Skeleton, tested end to end on a local Postgres with synthetic items:
- wrong code rejected;
- admin creates a rater and gets a one-time code;
- the rater sees the image, writes an own translation, compares A/B, saves, and moves to the next item;
- the page never contains the condition names;
- raters cannot reach the admin pages or the export;
- the CSV maps letters to conditions.

## Set up on Vercel

1. Import this repository in Vercel (New Project).
2. Storage: add a Postgres database (Neon) to the project. This sets `DATABASE_URL`; also add `DIRECT_URL` (the non-pooled URL) in Settings > Environment Variables.
3. Add the other variables from `.env.example`:
   - `SESSION_SECRET`: 32+ random characters, e.g. `openssl rand -base64 48`;
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`;
   - optionally `OPENROUTER_API_KEY`.
4. Create the tables once from your machine: copy `.env.example` to `.env`, fill in the two database URLs, run `npm install` then `npm run db:push`.
5. Deploy. Open the site, sign in as the admin.

## Load a study

```bash
# in the ComicGlot checkout: produce translations under each condition
python -m eval.translation_study.run_conditions ... --out study_round1
# here: build the import file (page crops are embedded; data/ is git-ignored)
python tools/export_packet.py --comicglot ../ComicGlot --calls ../ComicGlot/study_round1/calls.jsonl \
    --runs ../ComicGlot/data/output/RUN/chapter_full_results.json --study round1 --out data/round1.json
npm run import -- data/round1.json     # uses DATABASE_URL from .env
```

Then create raters in the admin panel. Each new rater gets every item of the active studies, in an order and with letters shuffled per rater. "Assign new items" gives existing raters items imported later.

Candidates can also be generated from the admin side through OpenRouter: `POST /api/admin/generate` with `{ studyId, condition, model, guides? }` fills up to 25 missing items per call. With `guides` (class name to guide text) each block gets its type's guide; without it the block is translated with no type.

## Data and privacy

- Page crops are stored in the database and served only through `/api/image/<id>` to the admin and to raters assigned that item.
- Never commit import files, crops, workbooks or keys; `data/`, `*.xlsx` and `key.json` are ignored.
- Raters are identified by the name the admin gives them; keep real identities outside the app.

## Next steps

- Per-candidate scales from the rater guidelines (adequacy, tone fit, fluency, error counts) as an optional second stage.
- An instructions and consent page shown once before the first item; a short practice item.
- Attention checks (an item whose two candidates are identical, or one clearly wrong).
- Inter-rater agreement (Krippendorff's alpha) and the sign test in the admin view, matching `analyse_ratings.py` in ComicGlot.
- Images in Vercel Blob instead of the database if the study grows past a few hundred items.
- Rate limiting on the login route.
