# QA Log Filter Guide

**Issue**: #36 (SHP-003) – QA-Logfilter  
**Purpose**: Reduce QA test output to first relevant assertion (≤30 lines)  
**Status**: Ready for use

---

## Overview

The QA log filter reduces verbose test output to show only the most relevant error or warning, keeping output under 30 lines for clarity and readability.

**Problem**: QA tests can produce 100+ lines of output with many identical errors  
**Solution**: Filter shows only the first ERROR, or first WARNING if no errors  

---

## Usage

### Command Line

```bash
# Basic usage (output to stdout)
node qa/log-filter.mjs qa/results/seo-latest.json

# With markdown file output
node qa/log-filter.mjs qa/results/seo-latest.json summary.md

# Via npm script
npm run qa:filter -- qa/results/seo-latest.json
npm run qa:filter -- qa/results/seo-latest.json SUMMARY.md
```

### Example Output

**Before** (38 errors, 80+ lines):
```
{
  "status": "FAIL",
  "summary": { "errors": 38, "warnings": 0 },
  "findings": [
    { "severity": "ERROR", "code": "HTTP_NAVIGATION", "page": "Vinylboden", ... },
    { "severity": "ERROR", "code": "HTTP_NAVIGATION", "page": "Startseite", ... },
    { "severity": "ERROR", "code": "HTTP_NAVIGATION", "page": "Teppichboden", ... },
    ...
  ]
}
```

**After** (log filter output, ~20 lines):
```
╔═══════════════════════════════════════╗
║  QA Test Summary                      ║
╚═══════════════════════════════════════╝

Status: ❌ FAIL
Errors: 38 | Warnings: 0 | Passes: 0

─── First Relevant Assertion ───
Severity: ERROR
Code: HTTP_NAVIGATION
Page: Vinylboden
Viewport: Desktop

  Navigation fehlgeschlagen: page.goto: net::ERR_TUNNEL_CONNECTION_FAILED
  Call log:
    - navigating to "https://www.teppich-paradies.net/collections/vinylboden-1"

Total findings: 38
```

---

## Features

### Stdout Output
- **Format**: Human-readable text with box drawing
- **Content**: Status, error/warning counts, first finding summary
- **Size**: ~20 lines (well under 30-line limit)

### Markdown Output (optional)
- **File**: Saved to specified path (e.g., `SUMMARY.md`)
- **Format**: Markdown with sections
- **Content**: Full details of first finding

### Severity Filtering
- **Priority**: Shows ERROR first, then WARNING
- **Logic**: If multiple ERRORs, shows the very first
- **Message truncation**: Long messages are truncated to 15 lines max

---

## Acceptance Criteria (Issue #36)

- [x] **Raw artifacts locally available**
  - ✓ `qa/results/` directory contains JSON test results
  - ✓ `qa/log-filter.mjs` processes these locally

- [x] **Worker extract ≤30 relevant lines**
  - ✓ Stdout output: ~20 lines
  - ✓ Shows severity, code, page, viewport, message
  - ✓ Truncates at 80 chars per line

---

## File Locations

| File | Purpose |
|------|---------|
| `qa/log-filter.mjs` | Main filter implementation |
| `qa/results/` | Test result JSON files |
| `LOG_FILTER_GUIDE.md` | This guide |
| `package.json` | npm script: `qa:filter` |

---

## Input Format

The filter expects JSON test results with this structure:

```json
{
  "status": "PASS|FAIL|WARN",
  "exitCode": 0|1,
  "summary": {
    "errors": number,
    "warnings": number,
    "passes": number
  },
  "findings": [
    {
      "severity": "ERROR|WARNING",
      "code": "string",
      "page": "string",
      "viewport": "Desktop|Mobile|Tablet",
      "message": "string"
    }
  ]
}
```

---

## Error Handling

| Error | Handling |
|-------|----------|
| File not found | Error message + exit 1 |
| Invalid JSON | Error message + exit 1 |
| Missing findings array | Error message + exit 1 |
| No findings | Shows summary only |

---

## Output Characteristics

### Text Output (stdout)
- **Line count**: 15-22 lines (depending on content)
- **Character width**: 80 chars max per line
- **Readable on**: Terminal, CI logs, Slack messages

### Markdown Output (optional)
- **Sections**: Summary, First Assertion Details
- **Code blocks**: For full message/call log
- **Readable on**: GitHub markdown, documentation

---

## Integration Points

### CI/CD
```bash
# In GitHub Actions or similar
npm run qa:filter -- qa/results/seo-latest.json
# Use exit code: $?
```

### Manual Review
```bash
# Quick check during development
npm run qa:filter -- qa/results/seo-latest.json review.md
# Open review.md in editor
```

### Automated Workflow
```bash
# Part of workflow pipeline
node qa/log-filter.mjs $RESULT_JSON $REPORT_PATH
```

---

## Dependencies

**Requirement**: Issue #35 (SHP-001) Repository Portability  
- ✓ Completed: LF line endings configured
- ✓ No platform-specific path issues in filter

---

## Testing

### Test 1: With errors
```bash
node qa/log-filter.mjs qa/results/seo-latest.json
# Expected: Shows first HTTP_NAVIGATION error
# Exit code: 1 (from original JSON status)
```

### Test 2: With markdown output
```bash
node qa/log-filter.mjs qa/results/seo-latest.json /tmp/test.md
cat /tmp/test.md
# Expected: Markdown file created with formatted content
```

---

## Next Steps

- [ ] Use in workflow for test result summarization
- [ ] Integrate with CI notifications (email, Slack)
- [ ] Consider expanding to filter by severity level
- [ ] Add option to show top N findings instead of just first

---

## Notes

- Filter does NOT modify original test result files
- Markdown output is optional (stdout is always produced)
- Exit code inherited from original JSON status field
- Message text is escaped and truncated for readability

---

**Status**: ✅ Issue #36 Complete  
**Version**: 1.0  
**Last Updated**: 2026-09-03
