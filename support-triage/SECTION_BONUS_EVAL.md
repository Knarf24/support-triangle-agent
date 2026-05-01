# SECTION_BONUS Evaluation Results

**Date evaluated:** 2026-05-01  
**Tickets:** 20 labelled samples from `output.csv` (ticket text → expected KB section)  
**Metrics:** Hit@3 = correct section appears in top-3 results; MRR = mean reciprocal rank  

---

## Python Retriever (`retriever.py`)

Hybrid scoring: `0.65 × semantic + 0.35 × TF-IDF + section_bonus`  
Corpus chunk threshold: >50 chars (matching `retriever.py` line 84)

| SECTION_BONUS | Hit@3 | MRR   | Hits/20 |
|---------------|-------|-------|---------|
| 0.00          | 0.850 | 0.692 | 17/20   |
| 0.05          | 0.850 | 0.692 | 17/20   |
| 0.10          | 0.850 | 0.717 | 17/20   |
| **0.15** *(was)* | 0.850 | 0.717 | 17/20 |
| 0.20          | 0.850 | 0.717 | 17/20   |
| **0.25** *(set)* | **0.850** | **0.725** | **17/20** |
| 0.30          | 0.850 | 0.725 | 17/20   |
| 0.40          | 0.800 | 0.700 | 16/20   |
| 0.50          | 0.800 | 0.717 | 16/20   |
| 0.60          | 0.750 | 0.700 | 15/20   |
| 0.75          | 0.700 | 0.650 | 14/20   |
| 1.00          | 0.700 | 0.650 | 14/20   |

**Decision:** Update `SECTION_BONUS` from **0.15 → 0.25**.  
MRR improves from 0.717 to 0.725. Values ≥ 0.40 degrade Hit@3 as section signal overwhelms the semantic + TF-IDF scores.

Remaining misses at 0.25 (corpus content gaps, not retriever algorithm failures):
- "interview prep / HackerRank ranking" → expected CODING CHALLENGES & SUBMISSIONS
- "API key pushed to GitHub" → expected SAFETY & PRIVACY  
- "old card still charged after replacement" → expected CARD BASICS

---

## TypeScript Retriever (`triage.ts`)

Keyword-count scoring: `keyword_matches + section_bonus`  
Corpus chunk threshold: >30 chars (matching `triage.ts` `parseCorpusWithSections`)

| SECTION_BONUS | Hit@3 | MRR   | Hits/20 |
|---------------|-------|-------|---------|
| 0.00          | 0.800 | 0.617 | 16/20   |
| 0.05          | 0.800 | 0.667 | 16/20   |
| 0.10–1.00     | 0.800 | 0.667 | 16/20   |
| **0.50** *(kept)* | **0.800** | **0.667** | **16/20** |

**Decision:** Retain `SECTION_BONUS` at **0.50** (no change).  
All values in [0.05, 1.00] achieve identical Hit@3 and MRR. The keyword-count score is integer-valued and the section bonus acts as a consistent tie-breaker at any positive magnitude. The existing 0.50 value (≈ half a keyword match) was retained for continuity since it is empirically indistinguishable from the minimal-effective value (0.05).

---

## How to re-run

```bash
python3 support-triage/eval_section_bonus.py
```
