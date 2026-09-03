# Repository Portability Guide

Ensures consistent Git behavior across Windows, macOS, and Linux environments.

## Status

- ✅ LF-Regel aktiv (`.gitattributes` configured)
- ✅ Secrets/Artefakte in `.gitignore`
- ✅ Keine Theme-Inhalte verändert (clean working tree)

## Setup Instructions

### 1. Git Line Ending Configuration

**macOS / Linux** (recommended - already set):
```bash
git config core.autocrlf false
git config core.eol lf
git config core.safecrlf warn
```

**Windows** (required for team consistency):
```bash
git config --global core.autocrlf false
git config core.eol lf
git config core.safecrlf warn
```

### 2. Verify Configuration

```bash
# Check all line-ending settings
git config --list | grep -E "core\.(autocrlf|eol|safecrlf)"

# Expected output:
# core.eol=lf
# core.autocrlf=false
# core.safecrlf=warn
```

### 3. Restore Line Endings (if needed)

If line endings were corrupted during clone:

```bash
# Temporarily remove git's ability to change line endings
git config core.autocrlf false

# Reset repository to text mode (normalizes to LF)
git rm -rf --cached .
git reset --hard HEAD

# Verify clean state
git status
```

## Project Structure

### Version Controlled
- `theme/` - Liquid templates (LF line endings)
- `blocks/` - Shopify block definitions (LF)
- `sections/` - Shopify section definitions (LF)
- `snippets/` - Reusable Liquid partials (LF)
- `templates/` - Page templates (LF)
- `assets/` - JavaScript, CSS (LF)
- `locales/` - Multilingual strings (LF JSON)

### Excluded from Git
- `.env*` - Environment variables (not in version control)
- `.claude/` - Claude local settings (except CLAUDE.md)
- `node_modules/` - Dependencies
- `.shopify/` - Shopify CLI session data
- `qa/artifacts/` - QA test results
- `playwright-report/` - Browser test reports

## Gitignore Validation

```bash
# Check what's ignored
git check-ignore -v <file-path>

# Example: verify .env is ignored
git check-ignore -v .env.local
# Output: .env.local (pattern: .env*)
```

## Pre-Commit Verification

Before each commit, verify:

```bash
# 1. No unintended theme changes
git diff --name-only

# 2. No secrets in staged files
git diff --cached --name-only | while read f; do
  grep -l "sk-ant-\|sk_live_\|ANTHROPIC_API_KEY" "$f" 2>/dev/null && echo "SECRET IN: $f"
done

# 3. No large binary files (limit: 10MB)
git diff --cached --name-status | grep -i "^A" | awk '{print $2}' | xargs -I {} bash -c 'size=$(stat -f%z "{}" 2>/dev/null || stat -c%s "{}" 2>/dev/null); [[ $size -gt 10485760 ]] && echo "LARGE FILE: {} ($(numfmt --to=iec-i --suffix=B $size))"'

# 4. Line endings are LF
git diff-index --cached --diff-filter=ACM HEAD | cut -f 2 | while read f; do
  file "$f" | grep -q "CRLF" && echo "CRLF DETECTED: $f"
done
```

## Device Onboarding Checklist

For new team members or new devices:

```bash
# 1. Clone repository
git clone https://github.com/kontakt755/teppich-paradies-shopify-ai.git

# 2. Enter repository
cd teppich-paradies-shopify-ai

# 3. Configure git for this repo
git config core.autocrlf false
git config core.eol lf
git config core.safecrlf warn

# 4. Verify configuration
git config --list | grep -E "core\.(autocrlf|eol|safecrlf)"

# 5. Install dependencies
npm install

# 6. Verify no theme changes
git status
# Should show: On branch main, nothing to commit, working tree clean

# 7. Set up API key (in .env.local, not version controlled)
# See SECURE_MULTIDEVICE_SETUP.md

# 8. Run preflight check
./api_cost_check.sh
```

## Troubleshooting

### Line Endings Mixed (LF/CRLF)

**Problem**: Git shows files as modified but content hasn't changed

**Solution**:
```bash
# 1. Check current mixed endings
git status | grep modified

# 2. Normalize to LF
git config core.eol lf
git config core.autocrlf false

# 3. Refresh index
git rm --cached -r .
git reset --hard HEAD

# 4. Verify
git status
```

### File Permissions Issues (Windows)

**Problem**: Executable bits changing on Windows

**Solution**:
```bash
# Disable core.filemode for Windows
git config core.filemode false

# Check if already disabled
git config core.filemode
# Should output: false (or nothing if default)
```

### Secrets Accidentally Committed

**Problem**: API key or credentials found in repository

**Solution**:
1. Stop all work immediately
2. Run secret scan: `./automation/scripts/secret-scan.mjs`
3. Revoke the exposed key in console.anthropic.com
4. Create a new key
5. Update .env.local
6. Force-push history removal (if production hasn't merged)

## References

- [Git LF/CRLF Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Configuration#_core_autocrlf)
- `.gitattributes` - Central source of truth for line endings
- `SECURE_MULTIDEVICE_SETUP.md` - API key security guidelines
- `TEAM_SETUP_GUIDE.md` - Team onboarding and cost management

## Verification Commands

Run these monthly to ensure repository health:

```bash
# 1. Check repository size
du -sh .git

# 2. Verify no LFS needed
find . -type f -size +50M ! -path './.git/*' | head

# 3. Count commits
git rev-list --all --count

# 4. Verify all line endings are LF
find . \( -name "*.js" -o -name "*.json" -o -name "*.liquid" -o -name "*.css" \) ! -path './.git/*' ! -path './node_modules/*' -exec file {} \; | grep -i CRLF || echo "✅ All files use LF"

# 5. Check for uncommitted changes
git status --porcelain

# 6. Verify protected files aren't modified
git diff HEAD -- .gitattributes .gitignore REPOSITORY_PORTABILITY.md
```

---

**Last Updated**: 2026-09-03  
**Status**: Repository Portability Verified ✅
