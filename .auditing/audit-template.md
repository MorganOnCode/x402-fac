---
auditor: <model-id>
created: <YYYY-MM-DD HH:MM:SS>
updated: <YYYY-MM-DD HH:MM:SS>
focus: <audit-focus-slug>
status: <strong|strong-with-open-items|adequate|needs-work|blocked>
phases-reviewed: [<phase-numbers>]
# Add a score line per phase reviewed:
# phase-N-score: X/10
---

<!--
NOTE TO LLMS:
This file is the audit template.
Anthropic Claude: update and work in .auditing/AUDIT-claude.md
Google Gemini: update and work in .auditing/AUDIT-gemini.md
xAI Grok: update and work in .auditing/AUDIT-grok.md
openAI chatGPT: update and work in .auditing/AUDIT-chatgpt.md
-->

# Audit: <Title Describing Scope>

## Executive Summary

<!-- One paragraph per phase reviewed. Include score, key metrics (tests, duration, UAT results), and overall verdict. -->

**Phase N (<Name>): <Verdict> (X/10)**
<Summary paragraph — what shipped, key metrics, upgrade \ downgrade rationale if re-scoring.>

<!-- Cross-cutting summary scores -->

**Research Quality: X/10**
<1-2 sentences on research document quality, confidence levels, unresolved items.>

**Requirements & Roadmap: X/10**
<1-2 sentences on traceability, mapping accuracy, phase ordering.>

---

# Tools and Resources

<!-- Complete inventory of everything used in the codebase. Update each audit to reflect current state. -->

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **package-name** | ^x.y.z | What it does |

## Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **package-name** | ^x.y.z | What it does |

## External APIs and Services

| Service | Purpose | Config Location |
|---------|---------|-----------------|
| **Service Name** | What it provides | Where it's configured |

## Node.js Built-in Modules

- `node:module` — what it's used for

## Key Configuration Files

| File | Purpose |
|------|---------|
| `file-path` | What it configures |

## npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `script-name` | `actual command` | What it does |

## Source Code Architecture

```
src/
├── file.ts              Brief description
├── directory/
│   ├── file.ts          Brief description
│   └── ...
```

## Testing Infrastructure

- **Framework:** Name and key features used
- **Test location:** Glob patterns
- **Setup file:** Path
- **Test count:** N tests passing across M suites
- **Mocking approach:** Strategy description
- **Known limitations:** Any test environment issues

---

# Sensitive Secrets

<!-- 
All secrets in the codebase — where they're defined, stored, used, and protected. 
DO NOT include the secrets themselves in this file. 
-->

## Developer/Operator Secrets

| Secret | Schema Path | Defined In | Purpose |
|--------|-------------|------------|---------|
| **Secret Name** | `config.path` | `src/file.ts:line` | What it authenticates/controls |

## Where Secrets Live

| Path | Status | Contains |
|------|--------|----------|
| `config/file` | **Gitignored** / Committed (safe) | What's in it |

## Where Secrets Are Used in Code

| File | What It Reads | What It Does |
|------|---------------|--------------|
| `src/file.ts:line` | `config.field` | How it uses the secret |

## Security Controls in Place

<!-- Bullet list of protections: logging exclusions, private storage, guardrails, validation, no hardcoded secrets. -->

- **Control name:** Description of what it prevents

## End-User Secrets

<!-- Describe whether end users provide secrets, how they're handled, or state that none exist. -->

## Redis/Database Authentication

<!-- Current auth state and production recommendations. -->

---

## Phase N: <Name> — Detailed Assessment

### Context

<!-- Any relevant context: pre-execution vs post-execution state, prior audit recommendations, research conducted between audits. -->

### What Was Built

| Plan | Scope | Duration | Tests |
|------|-------|----------|-------|
| NN-MM | Brief description of deliverables | X min | N new |

**Totals:** M plans, X minutes, N tests passing, T type errors, L lint violations.

### Architecture Quality

**Strong:**
<!-- Bullet list of well-executed architectural decisions with brief rationale. -->
- Decision/pattern — why it's good

**Adequate:**
<!-- Bullet list of acceptable-but-not-ideal decisions with context on why they're fine for now. -->
- Decision/pattern — why it's acceptable at this stage

### Strengths

<!-- Bullet list of things done particularly well. -->
- Strength description

### Gaps / Issues

| Gap | Risk | Severity |
|-----|------|----------|
| Description of gap | What could go wrong | Critical / High / Medium / Low |

### Concerns

<!-- Numbered list of specific technical concerns with enough detail to act on. -->

**1. Concern Title**
Description of the concern, where it lives in code, what the research/docs say, and what the risk is.

**Verdict:** <Summary sentence. Whether action is required before next phase.>

---

<!-- Repeat "Phase N" section for each phase reviewed. -->

---

## Cross-Cutting Issues

<!-- Issues that span multiple phases or affect the project globally. -->

### Documents Out of Sync

| Document | Issue | Impact |
|----------|-------|--------|
| `file.md` | What's stale or wrong | Who it misleads and how |

### Requirement Mapping Issues

<!-- Requirements that are mapped incorrectly, prematurely marked complete, or missing formal IDs. -->

**<REQ-ID> ("<requirement text>") mapped to Phase N.**
Explanation of why the mapping is questionable and what would make it accurate.

**Missing formal requirement IDs:**

| Capability | Where It Exists | Missing ID |
|-----------|----------------|------------|
| Description | File or component | What should be tracked |

### Phase Ordering Concerns

<!-- Any phases that should be reordered with rationale. -->

### Protocol / Spec Ambiguity

<!-- Any unclear specifications that need resolution. -->

### Other Cross-Cutting Issues

<!-- Anything else that spans phases: naming conventions, dependency risks, scalability concerns, etc. -->

---

## Prior Audit Cross-Reference

<!-- If a previous audit exists (from this or another auditor), reconcile findings. -->

| Prior Issue | Resolution Status |
|-------------|-------------------|
| "Issue description" | **Resolved.** How. / **Still open.** Why. / **Not needed.** Rationale. |

---

## Next Phase Readiness Assessment

### Ready

<!-- Bullet list of components, patterns, and infrastructure that are ready for the next phase. -->
- Component/capability — what it provides for the next phase

### Needs Resolution Before Next Phase Planning

<!-- Numbered list of items that MUST be resolved before planning begins. -->
1. **Item** — why it matters and suggested resolution

### Watch Items

<!-- Bullet list of risks that don't block planning but should be monitored. -->
- Risk — what could surface and when

---

## Recommended Action Items

### High Priority (Before Next Phase Planning)

1. **Action** — brief rationale

### Medium Priority (Document Hygiene)

2. **Action** — brief rationale

### Low Priority (Strategic, Deferrable)

3. **Action** — brief rationale

---

*Audit completed: <YYYY-MM-DD>*
*Auditor: <Name> (<model-id>)*
*Scope: <directories and files reviewed>*
