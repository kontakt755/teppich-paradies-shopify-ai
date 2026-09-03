# Repository Portability – Windows/Mac/Linux Cross-Platform Setup

This repository is configured for seamless development across Windows, macOS, and Linux. This document explains the setup and how it ensures consistency.

---

## Quick Start (All Platforms)

### 1. Clone the Repository
```bash
git clone https://github.com/kontakt755/teppich-paradies-shopify-ai.git
cd teppich-paradies-shopify-ai
```

### 2. Run the Setup Script
```bash
bash git-setup-local.sh
```

This script automatically configures your local git to use Unix-style line endings (LF) consistently.

### 3. Verify Setup
```bash
git config --list | grep -E "(core\.eol|core\.safecrlf)"
```

Expected output:
```
core.eol=lf
core.safecrlf=warn
```

---

## What Gets Configured

### Line Ending Enforcement (`.gitattributes`)

All text files are normalized to **LF (Unix-style)** line endings:

```
* text=auto eol=lf
```

This means:
- ✅ On Windows: Git automatically converts CRLF → LF on commit, LF → CRLF on checkout
- ✅ On macOS/Linux: No conversion needed (already uses LF)
- ✅ Binary files: Never touched (.png, .jpg, .woff, etc.)

### Local Git Configuration

Each developer's local git is configured:

```bash
git config core.eol lf          # Use LF as canonical line ending
git config core.safecrlf warn   # Warn if CRLF would be created
```

**Why both?**
- `core.eol=lf` ensures consistency across platforms
- `core.safecrlf=warn` prevents accidental CRLF commits on Windows

### Secrets & Artifacts Protection (`.gitignore`)

Comprehensive `.gitignore` covers:

| Category | Examples |
|----------|----------|
| Environment files | `.env`, `.env.local`, `.env.*` |
| API keys & secrets | `*.key`, `*.pem`, `credentials*.json` |
| Shopify auth | `.shopify/`, `tokens/`, `sessions/` |
| Dependencies | `node_modules/`, `__pycache__/`, `venv/` |
| Temp/logs | `*.tmp`, `*.log`, `test-results/` |
| OS/editor | `.DS_Store`, `.idea/`, `.vscode/` |

**Critical patterns** always checked:
- `.env` files
- `node_modules/`
- `.DS_Store` (macOS)
- `__pycache__` (Python)
- `.idea/` and `.vscode/` (IDEs)

---

## Verification Checklist

Before committing, verify your setup:

```bash
# ✓ Check line ending configuration
git config core.eol
# Expected: lf

# ✓ Verify .gitattributes exists
test -f .gitattributes && echo "✓ .gitattributes found"

# ✓ Verify .gitignore has critical patterns
grep -E "\.env|node_modules|\.DS_Store" .gitignore

# ✓ Check working tree is clean
git status
# Expected: "working tree clean"
```

---

## Troubleshooting

### "Mixed line endings detected"

**On Windows, if you see warnings about CRLF:**

```bash
# Reconfigure git
git config core.safecrlf false
bash git-setup-local.sh

# If needed, normalize existing files
git add -A
git commit -m "Normalize line endings"
```

### ".gitignore patterns not working"

If files that should be ignored are being committed:

```bash
# Clear git's internal cache
git rm --cached -r .
git add .

# Verify patterns
bash git-setup-local.sh
```

### Setup script fails

```bash
# Make script executable
chmod +x git-setup-local.sh

# Run with verbose output
bash -x git-setup-local.sh
```

---

## For New Team Members

1. **Clone the repo** (on any platform – Windows, Mac, or Linux)
2. **Run the setup script**: `bash git-setup-local.sh`
3. **Work normally** – no special handling needed
4. **Commit code** – line endings are automatically normalized

That's it! No manual configuration required.

---

## Configuration Details

### What `.gitattributes` does

```
* text=auto eol=lf    # All text files: LF line endings
*.jpeg binary         # Binary files: never normalized
*.png binary
*.woff binary
```

### What `.git/config` does (Local)

```bash
[core]
    eol = lf
    safecrlf = warn
```

This is **not committed** – each developer's machine has its own local config.

---

## Why This Matters

**Without proper setup:**
- ❌ Windows developers see `^M` line endings in diffs
- ❌ macOS/Linux developers see spurious changes
- ❌ Every line in a file appears "modified" on commit
- ❌ Code reviews become impossible (noise)
- ❌ Team loses trust in version control

**With this setup:**
- ✅ Same line endings across all platforms
- ✅ Clean diffs (no spurious changes)
- ✅ Reviewers see only real code changes
- ✅ Team works seamlessly

---

## References

- [GitHub: Handling line endings](https://docs.github.com/en/get-started/getting-started-with-git/configuring-git-to-handle-line-endings)
- [Pro Git Book: .gitattributes](https://git-scm.com/book/en/v2/Customizing-Git-Git-Attributes)
- [Git config: core.eol](https://git-scm.com/docs/git-config#Documentation/git-config.txt-coreeol)

---

**Status:** Ready for Use  
**Last Updated:** 2026-09-03  
**Applies to:** All platforms (Windows, macOS, Linux)
