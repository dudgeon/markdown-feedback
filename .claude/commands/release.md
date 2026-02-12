---
description: Create a GitHub release with changelog, tag, and single-file HTML build
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite
---

# Release

Create a versioned release of Markdown Feedback. This command discovers unreleased changes, writes a changelog, builds the single-file HTML, tags the release, and publishes it on GitHub with the HTML attached.

## Environment

Prefix all bash commands with:
```
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 20.19.3
```

## Step 1: Discover unreleased changes

1. Get the last release tag:
   ```
   git describe --tags --abbrev=0 2>/dev/null
   ```
   If no tags exist, use the initial commit as the baseline.

2. List all commits since that tag (or since the beginning):
   ```
   git log <baseline>..HEAD --oneline --no-decorate
   ```

3. Get the date range of those commits.

4. **Summarize the changes** by reading commit messages and grouping them into categories:
   - **Features** — new user-facing functionality
   - **Fixes** — bug fixes
   - **Infrastructure** — build, deploy, tooling, docs

5. Present the summary to the user: commit count, date range, and grouped changes.

## Step 2: Ask the user

Use AskUserQuestion to ask:
- Whether this feels like a release
- What version number to use

Suggest a version based on:
- If no prior releases exist → suggest `v1.0.0`
- If changes include new features → suggest minor bump (e.g., `v1.1.0`)
- If changes are only fixes → suggest patch bump (e.g., `v1.0.1`)

The user argument `$ARGUMENTS` may already specify a version — if so, confirm it rather than asking.

## Step 3: Execute release

Once the user confirms:

### 3a. Create or update CHANGELOG.md

- If CHANGELOG.md doesn't exist, create it with a header
- Prepend a new section at the top (below the header) with:
  ```
  ## [vX.Y.Z] — YYYY-MM-DD

  ### Features
  - Description of feature (commit hash)

  ### Fixes
  - Description of fix (commit hash)

  ### Infrastructure
  - Description of change (commit hash)
  ```
- Omit empty categories

### 3b. Update package.json version

Change the `"version"` field to the new version (without the `v` prefix).

### 3c. Build

Run both builds and confirm they succeed:
```
npm run build:single
npm run build
```

### 3d. Commit

Stage and commit:
```
git add CHANGELOG.md package.json package-lock.json
git commit -m "Release vX.Y.Z"
```

### 3e. Tag and push

```
git tag vX.Y.Z
git push origin main --tags
```

### 3f. Create GitHub release

Create the release with the single-file HTML attached:
```
gh release create vX.Y.Z dist-single/index.html \
  --title "vX.Y.Z" \
  --notes "$(changelog section for this version)"
```

Use the changelog section content (the grouped changes, not the full file) as the release notes.

### 3g. Verify

1. Run `gh release view vX.Y.Z` to confirm the release exists
2. Verify the asset is attached
3. Get the release URL and report it to the user

## Step 4: Post-release

Check if README.md references a release download link. If it does, verify the link now resolves. If the README says "Build it from source" but doesn't link to the release, update it to include a download link:
```
1. Download `index.html` from the [latest release](https://github.com/<owner>/<repo>/releases/latest), or build it yourself:
```

**IMPORTANT:** Get the actual owner/repo from `git remote get-url origin` — NEVER guess the GitHub username.
