---
name: Bug Fix & Regression Specification
about: Report a defect with mandatory reproduction steps and regression test requirements
title: 'fix: '
labels: ['sdlc:bug-fix']
---

### Defect Description
<!-- Clear summary of the unexpected behavior. -->

### Reproduction Steps
1. 
2. 
3. 

### Expected Invariant
<!-- State the violated invariant (e.g. JWT role ignored, 503 on DB error, tenant rejected). -->

### Root Cause Analysis
<!-- Identify the subsystem, module, or database query responsible. -->

### Mandatory Regression Test
<!-- Name of automated test in tests/ verifying this fix permanently. -->
- [ ] Automated regression test added in `tests/`
- [ ] `npm run verify` passes with 0 errors
