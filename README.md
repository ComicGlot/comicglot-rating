# ComicGlot rating

The human-evaluation app of [ComicGlot](https://github.com/ComicGlot/ComicGlot). Raters see single frames from Korean webtoons, one text at a time, and judge what the ComicGlot pipeline produced. A study chooses its steps; a rater can be limited to some of them.

| Step | What the rater does | What it measures |
| --- | --- | --- |
| Text types | Chooses the type of every numbered box without seeing the detector's type; flags text that has no box. | Agreement of people with the detector. |
| Transcription | Types the Korean of every box from the crop, or marks it unreadable. Model readings are never shown. | Ground truth for the character error rate of the OCR systems. |
| Translations, ranking mode (the current study) | Sees the Korean and the unlabelled English versions of three models drawn at random for this rater and text, each made with the type's guide and without the type, and drags them into an order from best to worst (ties allowed). Can flag a Korean source that looks misread. | The guide against no type, pooled and per model, and the models against each other on one scale. |
| Translations, pair mode (round1) | Sees two unlabelled versions of one model, picks the better one or a tie, and marks the tone of each (too flat, fits, too strong). | The same comparison for one model. |
| Check the frame | Sees everything entered on the frame and confirms it. | Completeness. |

## For raters

- Sign-in is one field: the **access key** they were given. A one-person key stays that person's key, so they can come back with it on any device. A shared key gives each person their own key, shown on their home page.
- Interface in English, French, German, Russian or Ukrainian (switch at the top of every page; English by default). Translations are always judged into English. Texts live in `src/lib/i18n/<lang>.ts`, checked against the English file by the type system.
- A welcome page with what the study is, the steps, a time estimate, how the data is used and a consent box (`Rater.consentAt`). The text above the steps is the study's `intro`, editable in the admin panel.
- An optional practice set, shown first and left out of every export and result. Attention checks: in pair mode two identical versions (expected answer: equal), in ranking mode a decoy (expected: last).
- Pairs whose two versions are the same text are not shown; the results page counts them per family.
- Shortcuts: `J`/`K` next and previous text, `Ctrl+Enter` next text or save, `?` the guide; in pair mode `A`/`E`/`B` and `1`/`2`/`3`, in ranking mode the keys above. Drafts survive a reload. Time is recorded per text and per frame.
- Light and dark themes; works down to phone width.

## Ranking mode

A study ranks when its `rankModels` is set (3 in round3; the Studies page edits it). For every text and rater the app
draws that many models among those with both versions of the text (`rankFor` in `src/lib/flow.ts`, deterministic per
rater and text, so the server rebuilds the same draw when the answer comes back). Each model brings its guided and its
unguided version: six versions with three models. Versions with exactly the same wording become one card and share a
rank, so a text can show fewer cards; a text whose versions all say the same is skipped. An attention check adds a
decoy, the translation of a different text, as one more card; it belongs at the bottom.

The board (`src/app/rate/work/RankBoard.tsx`, on dnd-kit) has two parts. The reading list holds every version full
size, in a random order, and never moves; a placed version shows its rank. Above it the order runs in one lane from
best (left) to worst (right). While a card is dragged the drop zones open: the next free slot appends, a gap marked +
between two ranks inserts there, a dashed "+ same rank" box under a rank ties, and the reading list takes a version
out. A version gets a rank only by being dropped, so nothing has a default order, and a text is done when every
version has a place. Keys: a letter picks a version, a digit puts it at that rank, the arrows move it, `=` ties it with
its left neighbour, `Backspace` takes it out, `Ctrl+Z` undoes. The answer stores the cards (letter to candidate ids),
the groups, the models, the decoy, the number of moves and the order in which versions were first placed.

Every rater gets every set of the study. The sets the fewest other raters have worked on come first (`loadPlan`), and a
set the rater has started stays first; raters do as much as they are willing to. `setsPerRater` is kept as a planning
number and is not shown to raters.

The work page lays the frame in a pane of bounded width and the task in one centred column, so it reads the same on a
laptop, on 1920 x 1080 and on a wide monitor; below 700 px the lane shows letters only.

## For the admin

The admin signs in at `/admin/login` with `ADMIN_USERNAME` and `ADMIN_PASSWORD` from the environment.

- **Access keys**: create keys for one person, up to N people or anyone; with a role (translator, transcriber, tester), optional custom steps, one study or every open study, and an optional end date. Copy the key or a ready invitation. Pause, resume or delete a key (raters who already joined keep their own key).
- **Raters**: role, steps, key, progress; assign sets imported later; block; clear a rater's answers or delete the rater (both ask for a second click). Testers are left out of every result; "Delete all testers" cleans the dashboard after a trial run.
- **Studies**: steps, own-translation setting, welcome text, translations per model and condition; clear every answer of a study or delete it (second click); generate more translations or run a model judge through OpenRouter.
- **Results**: guide against no type by text family, ties, overdone tone, Krippendorff's alpha, a sign test on texts, per model; model judges apart; attention checks; character error rate against the transcriptions; agreement with the detector.
- **Exports**: one CSV per step, unblinded, practice left out, with `rater_kind` (person, model or tester), attention checks, the source flag and time per text. The ranking export has one row per version a rater ranked (card, rank, model, condition, decoy), the input of ComicGlot's `eval/translation_study/rank_analysis.py` (Bradley-Terry ranking of the models, the guide against no type per model and type).

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
- Ranking studies: `--tag-model --rank-models 3 --decoys N --inactive` (conditions are stored as `<condition>@<model>`). The workspace script `tools/build_round2.sh` builds one from the study sample with `STUDY=round3 TR=translations_v5` (the revised prompt's translations of all eight models), and `npx tsx tools/switch_study.ts round2 round3` closes the old round, opens the new one and moves keys and raters tied to the old one. Keys made for "every open study" follow automatically.
- `npx tsx tools/drop_study.ts <study>` deletes a study only while nobody but testers has answered in it.

## Studies so far

- round1: pairs of Claude Sonnet 5.5 (published prompt), tone per version. Closed.
- round2: ranking, published prompt, eight models. A trial; closed on 12 November with 60 trial rankings kept.
- round3: ranking, the revised prompt (ComicGlot `data/prompts/lab/v5.json`), eight models, 302 texts in ten sets, 14 decoys. Open.

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
