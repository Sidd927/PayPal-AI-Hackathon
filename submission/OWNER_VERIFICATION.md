# Owner-side verification runbook (local Mac)

Everything here runs on your machine with your own `.env.local`. It needs no secrets in chat and makes **no PayPal writes**. Steps that would write to PayPal are marked **STOP** and need your explicit decision.

Last known local setup: Node 26.4, npm 11.17; `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash-lite`, `GEMINI_MAX_RPM=3`, `AI_DAILY_CALL_LIMIT=500`; sandbox seeded with 13 invoices (8 SENT, 5 MARKED_AS_PAID). **Never re-run the seeder.**

## 0. Preserve your local configuration (before syncing the branch)

Your local `package.json` (`allowScripts` for `better-sqlite3@13.0.3` and `esbuild@0.28.2`) and `next.config.ts` (Turbopack `root`, `serverExternalPackages`) are local-only and must never be committed.

**`.env.local` stays untouched.** It is git-ignored, so no step below reads, copies, stashes, moves or edits it. Don't open it on screen, and don't add it to any backup or commit.

**What the branch changes in `package.json`, compared with `main`.** Keep all four when you merge in your local settings:
- adds the dependency `"@google/genai": "2.30.0"`;
- adds the dependency `"ag-studio": "3.0.0"` (already installed as part of `ag-studio-react`; now declared, same version);
- adds the script `"verify:ai": "tsx scripts/verify-ai.ts"`;
- changes the `"eval"` script line only by adding a trailing comma, because `verify:ai` now follows it.

The branch doesn't change `next.config.ts`.

### 0.1 Back up and check

Back up the two config files. Note `.env.local` is deliberately not in this list:

```bash
mkdir -p ~/unstuck-local-backup && cp package.json next.config.ts ~/unstuck-local-backup/
```

Check where you are. This prints only; it doesn't assume a branch name:

```bash
git branch --show-current
```

```bash
git status --short
```

Only `package.json` and `next.config.ts` may show as modified (`M`). If any other tracked file is listed, stop and ask before going further.

```bash
git stash list
```

Note how many stashes already exist, so you can tell yours apart.

### 0.2 Set your config aside

After the branch has been approved, committed and pushed:

```bash
git stash push -m "unstuck local config" -- package.json next.config.ts
```

- **It prints `Saved working directory…`:** go on to 0.3 and use **0.4a**.
- **It prints `No local changes to save`:** your settings are committed on your current branch, or already gone. No stash was created, so **don't run `git stash pop`**: it would apply an older, unrelated stash. Go on to 0.3, then use **0.4b**.

### 0.3 Update the branch

```bash
git fetch origin claude/busy-ride-kgtyzr
```

```bash
git switch claude/busy-ride-kgtyzr || git switch -c claude/busy-ride-kgtyzr --track origin/claude/busy-ride-kgtyzr
```

```bash
git pull --ff-only origin claude/busy-ride-kgtyzr
```

If `--ff-only` refuses, your local copy of this branch has its own commits: stop and ask. Don't reset or force anything.

### 0.4a Restore your settings from the stash

Check the newest stash is yours (`stash@{0}: On …: unstuck local config`):

```bash
git stash list
```

```bash
git stash pop
```

If it reports a **conflict in `package.json`**:
1. Open `package.json` and remove the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Keep your `allowScripts` block **and** the branch's four changes listed above.
2. Unstage **both** files. A conflicted pop stages `next.config.ts` as well as marking `package.json` conflicted:

   ```bash
   git restore --staged package.json next.config.ts
   ```

3. Check that nothing is staged. This must print nothing:

   ```bash
   git diff --cached --name-only
   ```

4. Check that `package.json` is valid JSON with no markers left:

   ```bash
   node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8")); console.log("package.json OK")'
   ```

5. Git keeps the stash after a conflicted pop. Confirm `stash@{0}` is still "unstuck local config", then drop it:

   ```bash
   git stash list
   ```

   ```bash
   git stash drop stash@{0}
   ```

### 0.4b Restore your settings from the backup (no stash was created)

Merge your settings in **one at a time**. Never copy a whole file from the backup over the branch's file: that would drop the branch's `package.json` changes.

1. Open `~/unstuck-local-backup/package.json` and copy only its `"allowScripts"` block into the branch's `package.json`, as a top-level key. Leave everything else as the branch has it.
2. Open `~/unstuck-local-backup/next.config.ts` and copy only your Turbopack `root` and `serverExternalPackages` settings into the branch's `next.config.ts`.
3. Check the result. The diff should show only those settings:

   ```bash
   git diff -- package.json next.config.ts
   ```

   ```bash
   node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8")); console.log("package.json OK")'
   ```

   ```bash
   git diff --cached --name-only
   ```

   The last command must print nothing.

### 0.5 Install

```bash
npm install
```

The new packages' install scripts are a no-op (`@google/genai`) and a warning printer (`protobufjs`); `ag-studio` has none. They don't need adding to `allowScripts`.

Then check the lockfile:

```bash
git status --short package-lock.json
```

If it shows `M`, your npm version rewrote it. **Don't commit that change**; put the branch's version back:

```bash
git restore package-lock.json
```

Don't run `npm ci` once you have prepared `video.db` (§3): it deletes `node_modules/`, including the databases in `node_modules/.cache/unstuck/`.

Your backups stay in `~/unstuck-local-backup/`.

## 1. Local checks (no network services)

```bash
npm run lint && npm test && npm run build && npm run test:contract
```

Expected: lint passes; **276/276** unit tests; build succeeds; **26/26** contract checks (against a local mock PayPal, not the sandbox).

## 2. Gemini (real API, simulation only, PayPal blocked)

```bash
npm run verify:ai
```

What it does: forces simulation, removes PayPal credentials from its process, uses a throwaway database (`node_modules/.cache/unstuck/ai-verify.db`), and lets the network reach only `generativelanguage.googleapis.com`. Budget: about 13 Gemini requests, more if Gemini returns 503 and a call is retried. At 3/min it takes about 5 minutes.

Expected on a healthy run: **16/16**, and in `qa/ai-verification/verify-ai-gemini-<timestamp>.json`:

| Field | Expected | If not |
|---|---|---|
| `real_provider_response_received` | `true` | No real Gemini answer: don't claim Gemini is verified |
| check 0 (model available) | PASS | Check `GEMINI_MODEL` against AI Studio; the script stops here |
| checks 1b, 1c | PASS, with a request id and token usage | A real, schema-valid diagnosis |
| check 2 (reuse), 3 (force) | PASS | Caching and forced refresh |
| check 4 (all 8 invoices) | 8/8 AI-diagnosed | Look at `invoices[].ai_detail` and `provider_errors` |
| check 5 (changed only) | PASS, budget used = HTTP attempts | Budget accounting |
| checks 6a, 6b | PASS | Unknown model and invalid key are classified, not counted as AI |
| checks 7, 8 | PASS | Cooldown and daily limit |
| checks 9–12 | PASS | No PayPal or other traffic; no key in stored data or evidence |
| `invoices[].schema_mode` | `api_schema` | `json_only` means Gemini rejected the response schema and the validated JSON fallback ran: still a real Gemini answer |
| `provider_errors` | `{ auth: 1, model_not_found: 1, budget_exhausted: 1 }` from the deliberate checks | `unavailable` = Gemini 503 (Google's side); `rate_limited` / `quota_exhausted` = 429 |

**Provider outage or app defect?** If checks fail with `error_kind: "unavailable"` (HTTP 503 "model overloaded") or `rate_limited`, that is Gemini, not Unstuck: wait 10 minutes and run again. A failure with `invalid_request` or a schema problem in `ai_detail` would be an app problem worth reporting.

503 recovery, the circuit breaker, 429 handling and the JSON fallback can't be triggered on demand against the real API. They are covered by `tests/reliability-corrections.test.ts` and `tests/ai-tool-security.test.ts`, which drive the real Gemini SDK against a stubbed network.

Optional, real-model quality numbers (about 26 requests, about 9 minutes at 3/min):

```bash
npm run eval
```

Only publish its accuracy if the file is named `gemini-<timestamp>.json`, not `…-NO-AI-ANSWERS-…`. Report `providerOnly`, which excludes fallbacks.

## 3. Gemini in the app (simulation, separate database)

```bash
UNSTUCK_MODE=simulation DATABASE_PATH=node_modules/.cache/unstuck/video.db npm run dev 2>&1 | tee /tmp/unstuck-dev.log
```

Open http://localhost:3000. Expected header: **Simulation, not PayPal** and **AI: Gemini**. Then:

1. **Reset demo**, then **Run the agent** (about 3 minutes at 3/min). The trace fills; the *Why it's stuck* cells read "… sure, Gemini".
2. Open an invoice and press **Diagnose again**: a new Gemini call (forced refresh), with a new request id in Activity.
3. Run the agent again: unchanged invoices say "Nothing new since the last AI diagnosis" (reuse).
4. Failure UI: stop the server, restart it with `GEMINI_API_KEY=invalid-test-key` in front of the same command, and press **Diagnose again**. Expected: "AI: Request failed … (check GEMINI_API_KEY)" and a labelled rules diagnosis. Restart normally afterwards.
5. Secrets in logs:

   ```bash
   grep -c "AIza" /tmp/unstuck-dev.log
   ```

   Expected: `0`.

If Gemini is overloaded during this, invoices show "Rules fallback: Gemini temporarily unavailable … after N attempts". After two such calls the header shows **AI: Gemini paused**, and one probe request after 2 minutes brings it back without a restart.

When you're done, **stop this server** (Ctrl-C in its terminal). Next.js runs only one dev server per project folder: a second `npm run dev` exits with "You can access the existing server at http://localhost:3000".

## 4. PayPal sandbox, read-only

```bash
npm run check:sandbox
```

**STOP:** never add `-- --register-webhook`. It creates a webhook.

Expected:

```
✓ OAuth token obtained from https://api-m.sandbox.paypal.com
✓ Invoicing API reachable: 13 invoices (debug id …)
    JC-…  SENT  INV2-…          (8 lines SENT, 5 MARKED_AS_PAID)
✓ Webhooks API reachable: 0 registered
```

The app against the sandbox, read-only, on a **fresh** database. First make sure the §3 simulation server is stopped (Ctrl-C): only one dev server can run in this folder. Then:

```bash
PORT=3100 DATABASE_PATH=node_modules/.cache/unstuck/readonly-proof.db npm run dev
```

Open http://localhost:3100. If the terminal instead says "You can access the existing server at http://localhost:3000", the simulation server is still running: stop it and run the command again.

On first load it gets an OAuth token and syncs with GET requests only. With a fresh database there are no Unstuck payment plans, so the sync has nothing to write. Expected: header **PayPal sandbox**, the 8 open invoices on the board with correct amounts and late/due status, and the 5 paid ones as settled.

**STOP:** on this server, do not press **Run the agent**, **Diagnose again**, **Diagnose all**, approve anything, or use the client page. In sandbox mode, actions inside your rules run automatically (e.g. a reminder is sent through PayPal). Those are real sandbox writes to your seeded invoices. Stop the server when done.

## 5. What remains unverified until you choose to approve writes

These need PayPal sandbox **writes**, and none are run by this runbook:

- an approved action executing against the sandbox (e.g. setting a PO reference), and the re-read confirmation;
- a client plan switching a sandbox invoice to partial payments;
- a reminder accepted by PayPal;
- webhooks (registering one needs a public HTTPS URL plus a write).

All of these are verified against a strict local mock (`npm run test:contract`) and in simulation. If you decide to run any against the sandbox, do it on a copy of the scenario you're willing to change, and record what PayPal returned.

## Report back

For the README and Devpost, share (no secrets):
- the `verify:ai` summary line and `real_provider_response_received`;
- the `check:sandbox` output, with invoice ids optional;
- whether the app showed the 13 sandbox invoices correctly.
