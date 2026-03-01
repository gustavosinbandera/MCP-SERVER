# SSH sync and change indexing

This document explains how to sync the MCP repo to the instance over SSH **only with new changes**, and how documentation for each change (and future auto-generated bug documentation) is used for **indexing** to expand the Hub’s knowledge.

## Summary flow

1. **Local:** you make changes, commit, and (optionally) document in `deploy-docs/` what each change fixes.
2. **Sync:** you run `.\scripts\sync-to-ec2.ps1` (optionally with `-Changelog`).
3. **On the instance:** the script runs `git pull` (receives changes via git) and copies `.md` files from `deploy-docs/` into `INDEX_INBOX`.
4. **Indexing:** the supervisor indexes everything that arrives in INDEX_INBOX using embeddings; the content is stored in Qdrant and becomes available for semantic search.

This enables the Hub to answer questions like “what bug was fixed”, “what did the last deploy solve”, or “documentation for bug X”.

---

## 1. SSH sync (changes only)

- **Method:** Git. Locally: `git push origin master`. On the instance: `git pull origin master` (via the script).
- Only **new git objects** are transferred; the entire repo is not recopied via SCP/rsync.
- **Requirements:** the repo must already be cloned on the instance (`git clone ...`); the first time can be manual or via a bootstrap script. After that, each sync is just `git pull`.

Script configuration:

- Copy `scripts/sync-config.example.json` to `scripts/sync-config.json` (this file is not committed).
- Adjust `sshKeyPath`, `ec2Host`, `remoteRepoPath`, `remoteIndexInboxPath`, and `branch` as needed.

Useful commands:

```powershell
.\scripts\sync-to-ec2.ps1              # push + pull + upload deploy-docs + store last-sync
.\scripts\sync-to-ec2.ps1 -Changelog   # also generate+upload changelog (git log) for indexing
.\scripts\sync-to-ec2.ps1 -SkipPush    # no push; only remote pull and upload docs
.\scripts\sync-to-ec2.ps1 -SkipDeployDocs   # repo sync only, do not upload .md
```

---

## 2. Document what each change solves

So that information is **useful for indexing**:

- Create Markdown files in **`deploy-docs/`** (or subfolders, e.g. `deploy-docs/bugs/`).
- Suggested names: `YYYY-MM-DD-short-description.md` or `BUG-123-fix-login.md`.
- Include at minimum:
  - **Problem:** what bug/need was addressed.
  - **Solution:** what changed (files, logic, config).
  - **Search context:** keywords that help find the doc (bug-123, login, warehouse, etc.).

The sync script uploads all `.md` files under `deploy-docs/` (recursive, excluding `README.md`) into `INDEX_INBOX` on the instance. The supervisor indexes them on the next cycle, then deletes them from INDEX_INBOX (normal inbox behavior). The content remains in Qdrant for semantic search.

---

## 3. Auto-generated documentation related to bugs

When you have **auto-generated documentation** related to the bug being fixed (analysis, decision, solution):

- Save those Markdown files in **`deploy-docs/`** or a subfolder (e.g. `deploy-docs/bugs/`).
- The same **sync-to-ec2** script will copy them to INDEX_INBOX and they will be indexed like the rest.
- No script changes are needed: any `.md` under `deploy-docs/` (except `README.md`) gets uploaded and indexed.

This expands the Hub’s knowledge with the context of each bug and its solution.

---

## 4. Automatic changelog (optional)

With **`-Changelog`** the script:

- Reads the last synced commit on the instance (`.last-sync-commit`).
- Generates a Markdown file using `git log` from that commit to `HEAD` (commit messages = “what each change solved” at commit granularity).
- Uploads that file to INDEX_INBOX (e.g. `sync-changelog-YYYY-MM-DD-HHmm.md`) so it gets indexed.

Use this when you want the Hub to answer questions using the latest deploy’s commit messages as well.

---

## 5. Files and paths summary

| Item | Location / Action |
|----------|---------------------|
| Sync config (not committed) | `scripts/sync-config.json` |
| Change/bug docs | `deploy-docs/*.md` (and subfolders) |
| Inbox on the instance | `~/MCP-SERVER/INDEX_INBOX` |
| Last synced commit | `~/MCP-SERVER/.last-sync-commit` (on instance) |

With this flow, SSH sync sends only changes, you document what each change solves (and bug docs), and that information is indexed for the Knowledge Hub.
