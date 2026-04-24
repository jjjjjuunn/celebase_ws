codex
## Verdict  
PASS_WITH_CHANGES  

## Findings  

### [HIGH] Two sources of truth for `mode`  
- **Where**: Contract Definition → `GET /meal-plans/{id}` example  
- **Issue**: `mode` is returned both at the top level and again inside `adjustments.llm_provenance.mode`. Divergence during refactor or hot-fixes will break FE/Zod contract tests.  
- **Suggestion**: Expose **one** canonical `mode` (top-level is clearer). Keep the nested provenance copy server-side only or mark it internal/non-serialized in the Pydantic model.  

### [MEDIUM] Nullability rules for new fields are implicit  
- **Where**: Contract Definition / Narrative & Citations notes  
- **Issue**: It is not explicit whether `narrative` / `citations` are `null`, empty list, or omitted when `mode="standard"`. Ambiguity causes Zod/TypeScript union inflation or runtime-optional mis-match.  
- **Suggestion**: State exact rule (e.g., `citations: SourceRef[]` with `minLength=0`, `narrative?: string | null`) in both Pydantic and Zod schemas and freeze with a contract test.  

### [MEDIUM] Sub-task -c may over-run “≤ 5 files” limit  
- **Where**: Phase B table, IMPL-APP-005-c scope  
- **Issue**: `page.tsx`, `plan-detail.module.css`, `CitationChipList.tsx`, `PlanNarrativeCard.tsx`, and optional ui-kit extraction already reach 4-5 files; adding storybook/test doubles or index barrel will breach the pipeline rule.  
- **Suggestion**: Decide up-front: either inline both components inside `page.tsx`, or batch new UI-kit atoms into a single directory counted as *one* modified path per rule wording.  

### [LOW] Citation enum ownership not fixed  
- **Where**: Citation type enum section  
- **Issue**: The enum list lives in the plan only. Without a single exported constant (shared-types or BE), drift is likely when FE/BE independently expand.  
- **Suggestion**: Promote the 5-value enum to `packages/shared-types/src/enums/citation.ts` and import from both Pydantic (via `Enum`) and Zod.  

### [LOW] No contract test for duplicated provenance exposure decision  
- **Where**: Open Questions → provenance exposure  
- **Issue**: Whether `llm_provenance` stays internal is still open; decision affects BE serializer & FE typings later.  
- **Suggestion**: Add an explicit TODO to close this before v1.0 and gate with a snapshot contract test.  

## Checklist  
- [x] BE response shape (Pydantic) is concretely specified  
- [ ] FE Zod schema mirror is concrete *— nullability clarification needed*  
- [x] Subtask size ≤ 5 files each (caution flag on -c)  
- [x] G1 nutrition drop fix has regression verification  
- [x] Citation type enum matches LLM-DESIGN §S6 (5 values)  
- [x] Verification E2E covers both happy path and standard fallback  
- [x] No scope creep into deferred tasks (G4/G5/G6/G7)
18,000
## Verdict  
PASS_WITH_CHANGES  

## Findings  

### [HIGH] Two sources of truth for `mode`  
- **Where**: Contract Definition → `GET /meal-plans/{id}` example  
- **Issue**: `mode` is returned both at the top level and again inside `adjustments.llm_provenance.mode`. Divergence during refactor or hot-fixes will break FE/Zod contract tests.  
- **Suggestion**: Expose **one** canonical `mode` (top-level is clearer). Keep the nested provenance copy server-side only or mark it internal/non-serialized in the Pydantic model.  

### [MEDIUM] Nullability rules for new fields are implicit  
- **Where**: Contract Definition / Narrative & Citations notes  
- **Issue**: It is not explicit whether `narrative` / `citations` are `null`, empty list, or omitted when `mode="standard"`. Ambiguity causes Zod/TypeScript union inflation or runtime-optional mis-match.  
- **Suggestion**: State exact rule (e.g., `citations: SourceRef[]` with `minLength=0`, `narrative?: string | null`) in both Pydantic and Zod schemas and freeze with a contract test.  

### [MEDIUM] Sub-task -c may over-run “≤ 5 files” limit  
- **Where**: Phase B table, IMPL-APP-005-c scope  
- **Issue**: `page.tsx`, `plan-detail.module.css`, `CitationChipList.tsx`, `PlanNarrativeCard.tsx`, and optional ui-kit extraction already reach 4-5 files; adding storybook/test doubles or index barrel will breach the pipeline rule.  
- **Suggestion**: Decide up-front: either inline both components inside `page.tsx`, or batch new UI-kit atoms into a single directory counted as *one* modified path per rule wording.  

### [LOW] Citation enum ownership not fixed  
- **Where**: Citation type enum section  
- **Issue**: The enum list lives in the plan only. Without a single exported constant (shared-types or BE), drift is likely when FE/BE independently expand.  
- **Suggestion**: Promote the 5-value enum to `packages/shared-types/src/enums/citation.ts` and import from both Pydantic (via `Enum`) and Zod.  

### [LOW] No contract test for duplicated provenance exposure decision  
- **Where**: Open Questions → provenance exposure  
- **Issue**: Whether `llm_provenance` stays internal is still open; decision affects BE serializer & FE typings later.  
- **Suggestion**: Add an explicit TODO to close this before v1.0 and gate with a snapshot contract test.  

## Checklist  
- [x] BE response shape (Pydantic) is concretely specified  
- [ ] FE Zod schema mirror is concrete *— nullability clarification needed*  
- [x] Subtask size ≤ 5 files each (caution flag on -c)  
- [x] G1 nutrition drop fix has regression verification  
- [x] Citation type enum matches LLM-DESIGN §S6 (5 values)  
- [x] Verification E2E covers both happy path and standard fallback  
- [x] No scope creep into deferred tasks (G4/G5/G6/G7)
