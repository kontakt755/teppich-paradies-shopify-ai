# QA Artifacts Management

Centralized management of QA test outputs with filtered logging and local artifact storage.

## Overview

This system separates QA test outputs into two categories:
- **Raw Artifacts**: Complete, unfiltered test output for debugging
- **Filtered Evidence**: First relevant assertion only, ≤30 log lines for human review

## Directory Structure

```
qa/
├── artifacts/          # Raw test artifacts (complete output)
│   └── {test}-{date}-raw.json
├── results/            # Filtered evidence (compressed findings)
│   └── {test}-{date}-evidence.json
├── qa-artifacts-manager.mjs  # Management utility
└── evidence-filter.mjs  # Filtering logic
```

## Usage

### Store QA Result with Automatic Filtering

```javascript
import { storeQAResult } from './qa-artifacts-manager.mjs';

const testName = 'seo-check';
const rawResult = { /* QA test output */ };

const { rawPath, evidencePath, evidence } = storeQAResult(testName, rawResult, {
  verbose: true  // Show filtered output in console
});
```

### List All Artifacts

```bash
node qa/qa-artifacts-manager.mjs list
```

Output:
```
📦 Raw Artifacts:
  - seo-check-2026-09-03-raw.json
  - sales-check-2026-09-03-raw.json

📋 Filtered Evidence:
  - seo-check-2026-09-03-evidence.json
  - sales-check-2026-09-03-evidence.json
```

### Clean Old Artifacts

```bash
# Remove artifacts older than 7 days (default)
node qa/qa-artifacts-manager.mjs clean

# Remove artifacts older than 14 days
node qa/qa-artifacts-manager.mjs clean 14
```

## Artifact Format

### Raw Artifact (`*-raw.json`)
Complete, unfiltered QA test output for detailed debugging.

```json
{
  "checks": [
    {
      "severity": "error",
      "scope": "Browser",
      "page": "Product Page",
      "viewport": "mobile",
      "message": "Image failed to load",
      "data": {
        "url": "https://example.com/products/test",
        "check": "Image Responsiveness",
        "stack": "..."
      }
    }
  ],
  "exitCode": 1
}
```

### Filtered Evidence (`*-evidence.json`)
Compressed findings with only first relevant assertion.

```json
{
  "version": 1,
  "status": "FAIL",
  "exitCode": 1,
  "summary": "3 relevante QA-Fehler; kompakte Evidenz erzeugt.",
  "failureCount": 3,
  "primaryFailure": {
    "checkName": "Image Responsiveness",
    "firstRelevantAssertion": "Image failed to load",
    "url": "https://example.com/products/test",
    "viewport": "mobile",
    "relevantLog": [
      "Image failed to load at /images/product-1.jpg",
      "Expected: image with dimensions 600x400",
      "Actual: 404 Not Found"
    ]
  },
  "additionalFailures": [
    {
      "checkName": "Video Autoplay",
      "firstRelevantAssertion": "Video should not autoplay",
      "url": "https://example.com/products/test"
    }
  ],
  "truncatedAdditionalFailures": 0
}
```

## Log Line Limits

Configured in `evidence-filter.mjs`:

| Setting | Value | Purpose |
|---------|-------|---------|
| `MAX_LOG_LINES` | 30 | Max lines per assertion |
| `MAX_LINE_LENGTH` | 500 | Max chars per line |
| `MAX_ASSERTION_LENGTH` | 800 | Max chars for assertion message |
| `maxAdditionalFailures` | 4 | Show up to 4 additional failures |

All values are tuned to keep worker output at ≤30 relevant lines.

## Example: Filtering in CI/CD

```bash
#!/bin/bash
# Run QA test and store with filtering
node qa/run-qa.mjs | tee /tmp/raw-output.json

# Process through artifact manager (auto-filters)
node -e "
  import { storeQAResult } from './qa-artifacts-manager.mjs';
  const raw = JSON.parse(require('fs').readFileSync('/tmp/raw-output.json'));
  const { evidence } = storeQAResult('qa-check', raw);
  console.log(evidence.summary);
  process.exit(evidence.status === 'PASS' ? 0 : 1);
"
```

## Related Issues

- **Issue #36**: [SHP-003] QA-Logfilter
  - ✅ Raw artifacts locally available
  - ✅ Worker excerpt ≤30 relevant lines

## Technical Details

### Artifact Deduplication
Each artifact filename includes:
- Test name (e.g., `seo-check`)
- Date (e.g., `2026-09-03`)
- Type suffix (`-raw.json` or `-evidence.json`)

Example: `seo-check-2026-09-03-raw.json`

### Scope Priority
Artifacts are sorted by relevance (highest priority first):
1. Allowlist violations
2. Secrets exposure
3. Theme Check errors
4. Live Shop issues
5. Browser compatibility
6. Asset/Image issues
7. Shop smoke test failures

### Classification
Errors are automatically classified:
- `allowlist` - Allowlist rule violations
- `secret` - Exposed secrets or credentials
- `theme-check` - Theme validation errors
- `navigation-http` - Navigation or HTTP issues
- `browser` - Browser compatibility issues
- `asset` - Image or media issues
- `assertion` - General test assertions
- `unknown` - Unclassified errors

## Future Enhancements

- [ ] Web UI for browsing artifacts
- [ ] Automated artifact compression for long-term storage
- [ ] Diff comparison between artifact runs
- [ ] Integration with CI/CD dashboards
