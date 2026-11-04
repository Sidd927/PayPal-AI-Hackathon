# Git Attribution Policy

## Owner instruction (Phase 2)

All new commits are authored and committed as the repository owner's GitHub identity. No Claude author, no `Co-authored-by: Claude` trailer, and no other trailer that attributes a commit to an AI.

## Verified identity

| Field | Value | How it was verified |
|---|---|---|
| GitHub login | `Sidd927` | GitHub API (authenticated `get_me`) |
| User id | `212080526` | GitHub API |
| Display name | `Sidd_927` | GitHub API |
| Commit email | `212080526+Sidd927@users.noreply.github.com` | GitHub's account-bound noreply address. It always attributes to this account, so no personal address had to be guessed |

## Configuration (repository-local)

```bash
git config user.name "Sidd_927"
```

```bash
git config user.email "212080526+Sidd927@users.noreply.github.com"
```

```bash
git config commit.gpgsign false
```

The cloud environment's global configuration signs commits with a Claude-held SSH key (`gpg.ssh.program /tmp/code-sign`). Signing is disabled for this repository so commits authored by the owner aren't signed by a key that attributes them to Claude.

If the owner wants "Verified" badges, add their own SSH signing key to GitHub. Then run these locally:

```bash
git config gpg.format ssh
```

```bash
git config user.signingkey ~/.ssh/id_ed25519.pub
```

```bash
git config commit.gpgsign true
```

## Existing history (not rewritten)

The five Phase 1 commits (`0cf6c1b` → `16896a2`) are authored and committed by `Claude <noreply@anthropic.com>`. Each carries `Co-Authored-By: Claude Opus 5.5` and a `Claude-Session:` trailer and is signed by the environment key.

Per the owner's instruction they are **left unchanged**: no amend, no rebase, no force-push. Rewriting them would need explicit authorisation and would change every commit SHA on the shared branch.

## Transparency

This policy is about **git authorship metadata only**. The hackathon asks entrants to disclose the AI tools used, and the submission does: the Devpost description and README state that the product uses Claude at runtime and that development was assisted by Claude Code.
