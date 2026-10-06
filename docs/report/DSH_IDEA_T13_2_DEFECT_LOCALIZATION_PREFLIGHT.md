# DSH Idea T13.2 — Product Defect Localization Preflight Report

- Outcome: **`T13_2_DEFECT_ATTRIBUTION_STILL_UNRESOLVED`** — the failure boundary is narrowed to the client integration layer between "Session event window published" and "controller begins evaluation", with the deterministic layers on BOTH ends proven good (Host pipeline runtime-proven healthy; controller logic deterministic-green). Two concrete, source-proven contract/robustness gaps survive as the only viable mechanisms; which one fired at runtime is NOT established, and ownership is deliberately not guessed.
- Date: 2026-10-06
- Baselines: dsh-idea HEAD == origin/main == `594365ad7975ed6c2ab2b8ca786e1c93dc821d89` (clean); **Accepted executable under diagnosis `eb7677045e3d224b3603e7a7ad7313ea299abefc`** (zero executable/test drift this phase); Harness `ddefc45fbc7f8e46dd73185e68295696d1297887` READ-ONLY. **REAL_PROVIDER_CALLS = 0**; no browser run; no Canonical Full; only existing tests re-run (65/65 green, unmodified).

## 1. Confirmed behavioral defect (from `DSH_IDEA_T13_2_SCENARIO_I_CLOSURE_VALIDATION.md`)

After a real Settings Pause → Resume cycle, three eligible completed strong-trigger turns (two full page lifecycles, the third on a fresh clean page with zero console errors) produced **zero** `RESURFACING_JUDGE` dispatches and no strip — while the Host-side pipeline independently returned the TARGET as the sole eligible candidate.

## 2. Complete trigger chain (dsh-idea, file + symbol)

1. Conversation event window mutation published: Harness `MutableSessionEventSource.publish` (`api/session-controller/src/client/contract/events.ts:198-204`) → `notifySubscribers` (`packages/client/store/src/index.ts:46-58`).
2. dsh-idea subscription: `IdeaResurfacingController` constructor subscribes `this.events.subscribe(() => this.handleWindowChange())` (`src/client/resurfacing-state.ts:385`); `events` = `sessions.binding(sessionId).eventSource` captured at construction (`src/client/index.ts:180-187`).
3. Construction is LAZY, at dock-slot render: `ctx.slots.inject('conversation.input.dock', … inject: (sessionId) => { const controller = controllerFor(sessionId) … }` (`src/client/index.ts:307-322`); `controllerFor` throws `idea resurface: session "X" resolved no binding` when `sessions.binding/scope` is undefined (`src/client/index.ts:175-179`).
4. Completion trigger: `handleWindowChange` → `change.kind === 'append'` → `turn/end` with `reason.kind === 'completed'` → `onCompletedTurn` (`resurfacing-state.ts:538-565, 603-613`); a `turn/end` seen while `budgetState === 'loading'` is retained and evaluated when the budget resolves `'free'`.
5. Pre-gates in `beginEvaluation` (`resurfacing-state.ts:616-697`): feature flag; no current suggestion; `budgetState === 'free'` (a `'failed'` budget read blocks FOREVER, silently — `loadBudget` catch-all at `resurfacing-state.ts:398-423`); not `evaluating/judging`; no stale trigger/pending; no Idea chips in composer (`input.occurrences`); save-surface idle (`save.modal/preparingMessageId/submitting` — the SESSION-scoped surface, distinct from the T12.3 root library surface used by Settings creates); `extractTurnContext` finds the turn and a settled reply; `detectResurfacingOpportunity` admits.
6. Evaluate dispatch: parallel `remote.evaluateResurfacing` + `remote.semanticResurfacingCandidates` → hybrid fusion → identity filters (pins/referenced/surfaced/dismissed — note: `mutedIds` is NOT among them) → Judge.
7. Judge dispatch: `remote.judgeResurfacing` (Host: `IdeaResurfacingService.judge` — R1-A pre-dispatch mute revalidation, one provider call) → Final Delivery Gate → `claimResurfacingBudget({sessionId, ideaId})` → `USER_MUTED` keeps budget free / `CLAIMED` surfaces → strip store update (`resurfacing-state.ts:778-903`).
8. Strip delivery: `IdeaResurfaceStrip` reads `controller.state` (dock seat, `src/client/index.ts:307-322`).

## 3. Harness event-feed exception semantics (answers from source)

- **Thrower**: the ui-conversation assembler invariant `conversation Definition "assistant-step" withdrew materialized target "chat"…` is thrown by `ConversationAssembler.buildTargetUpserts` (`packages/client/ui-conversation/src/client/conversation/assembler.ts:851-868`) when a conversation definition stops producing a node for a previously-materialized target — a Harness conversation-definition contract violation during a step transition.
- **Catcher**: it surfaced as `[session-controller] event feed subscriber failed:` because some conversation listener ran the assembler synchronously inside a subscription callback of the SAME `MutableSessionEventSource`; `notifySubscribers` (`packages/client/store/src/index.ts:46-58`) caught it. Label originates at `MutableSessionEventSource.publish` (`contract/events.ts:203`).
- **Q3/Q4 — iteration & starvation**: `notifySubscribers` iterates a COPY of the listener set with per-listener try/catch — **one subscriber throwing CANNOT prevent other subscribers from receiving the same notification**. The "assembler error starved the resurfacing controller" hypothesis is REFUTED at this layer. A failing subscriber loses only that one notification.
- **Q5 — ordering**: `publish` is synchronous on every accepted window mutation; listener iteration is Set insertion order — deterministic given the subscription set.
- **Q6 — reload**: page reload destroys the whole client tree (plugin context, controllers map, scopes, Sessions); everything reconstructs with fresh subscriptions.
- **Q1/Q2 — ownership of the throwing subscriber**: a conversation-UI subscriber (assembler is ui-conversation), NOT dsh-idea — the resurfacing controller's callback never renders React and cannot throw this invariant.

## 4. Harness session/eventSource lifecycle — the proven contract gap (H1)

- `Session.eventSource = new MutableSessionEventSource()` is a per-**Session-object** field (`sessions/session.ts:144`).
- On scope retirement (`retireScope`, `sessions/service.ts:596-605`) the Session object is withdrawn via `manager.drop(sessionId, expected)` (`sessions/manager.ts:193-199`), which **deletes the Session instance**; a later `manager.get(sessionId)` lazily **creates a NEW Session with a NEW eventSource** (`manager.ts:239-263`).
- dsh-idea's `resurfacingControllers` map is keyed by SessionId and invalidated ONLY at plugin teardown (`src/client/index.ts:192-195`); `IdeaResurfacingController.dispose()` is never invoked on scope retirement, and there is no rebind/invalidation hook.
- ⇒ **If a scope generation boundary occurs for a session between controller construction and a trigger turn, the controller remains subscribed to a dead event source — permanently, silently, with zero errors and zero RPCs** — exactly the observed signature. Both halves of the gap are source-proven (Harness drops/replaces; dsh-idea never rebinds). What is NOT proven: that a generation boundary actually occurred during the failed attempts (rounds 1–2 succeeded under the same contract, so the hazard is not deterministic).

## 5. Pause→Resume differential state table (never-muted vs Pause→Resume)

| State | Never muted | After Pause→Resume | Class | Evidence |
|---|---|---|---|---|
| `resurfacing_preferences` record | absent | absent (unmute deletes) | SAME | `IdeaService.setResurfacingMuted(false)` deletes; runtime read-back `muted=false`; evaluate probe returned the candidate |
| `resurfacing_budgets` | never written | never written (no claim ran) | SAME | ledger: no claim/`ALREADY_CONSUMED` path; Δ0 throughout |
| Idea aggregate (updatedAt/version/evolution) | untouched | untouched | SAME | preference ops never touch the aggregate (T13.1 D4, tested) |
| Host `listResurfacingMutedIds()` | empty | empty | SAME | evaluate probe returned the candidate |
| Controller `mutedIds` (ephemeral) | empty | empty for a NEW conversation's controller; **and the field is never READ anywhere** (`resurfacing-state.ts:355/510/856` — write-only) | SAME (non-causal) | grep: no read site |
| Settings `IdeaReadSurface` reminderGeneration | n/a | cycled, scoped to that component | SAME (non-causal) | `read-state.ts:231,328-341,397,506` — isolated state, not consumed by the resurfacing controller |
| Session save surface (`save` face read by the gate) | idle | idle for the NEW session (Settings creates use the T12.3 ROOT library surface, a different store) | SAME | `src/client/index.ts:185` (`surfaceFor(sessionId)` session-scoped) vs T12.3 root-scoped library surfaces |
| Controller map / scopes / eventSource instances | fresh per session | **UNKNOWN at runtime** — whether a scope generation boundary occurred for the trigger sessions is not observable post-hoc | UNKNOWN | H1 mechanism source-proven; runtime occurrence unproven |
| Budget load outcome per controller | `'free'` presumed | **UNKNOWN** — a silent `'failed'` is possible (mux transport) and indistinguishable post-hoc | UNKNOWN | `loadBudget` catch-all is silent by design |

⇒ **No identifiable persistent state after Pause→Resume can suppress a fresh conversation's controller.** The pause→resume hypothesis has NO mechanism in either codebase; its correlation with the failure (rounds 1–2 never did it) remains unexplained coincidence or an unobserved runtime interaction.

## 6. Boundary statement

- **LAST PROVEN GOOD BOUNDARY**: Host `idea/evaluateResurfacing` — runtime-proven during the failed round (TARGET returned, score 32, correct suppression state); plus the whole deterministic client controller (existing tests 65/65 green, unmodified) and the event-feed notification isolation (source-proven).
- **FIRST BROKEN / UNPROVEN BOUNDARY**: the client-side step between "event window published for the trigger session's completed turn" (the UI streamed the reply, so publication happened on SOME source instance) and "`IdeaResurfacingController.beginEvaluation` dispatches `evaluateResurfacing`" (never observed across 3 turns). Inside that step, the two surviving mechanisms are H1 and H2 (§7).

## 7. Root-cause hypotheses (ranked by evidence) — NO implementation

- **H1 (cross-layer lifetime contract, ranked 1)**: per-Session eventSource generation replacement (Harness `manager.drop`/`get`) vs dsh-idea's plugin-lifetime per-SessionId controller map with no scope-retirement rebind. Explains the exact signature (alive controller, zero errors, zero RPCs, deterministic layers green). Weakness: not deterministic — rounds 1–2 succeeded; the runtime generation boundary is unobserved.
- **H2 (dsh-idea robustness, ranked 2)**: `loadBudget` fail-closed is silent and permanent — one swallowed transport failure at construction permanently disables resurfacing for that session with no observability and no retry. Explains the signature equally well; weakness: no reason to fail 3-for-3 across two page lifecycles when rounds 1–2 never saw it.
- **Cleared**: pause→resume state (§5); assembler-error starvation (§3); Host pipeline (runtime probe); model variance (0 Judge calls — no verdicts); sandbox (rounds 1–2's Judge fired inside the identical seatbelt).
- **Recommended next diagnostics** (for review to authorize; none executed): one-shot mux-level observation of `idea/*` RPCs and event-window deliveries in a disposable round (would immediately separate H1 from H2), or a review-authorized temporary instrumentation of `loadBudget`/subscription state. Repair scopes IF confirmed: H1 — dsh-idea rebinds/validates event-source identity per evaluation (or keys controllers by scope generation) AND/OR Harness guarantees eventSource identity per session id (or exposes scope-retirement to consumers); H2 — bounded budget-read retry/re-arm plus observability of `budgetState`. No code changed in this phase.

## 8. Integrity

EXECUTABLE_CHANGE = FALSE; TEST_CHANGE = FALSE; HARNESS_CHANGE = FALSE (tracked diff 0); REAL_PROVIDER_CALLS = 0; existing tests re-run only (65/65). dsh-idea workspace clean; Harness read-only untouched. T13.3/T14 NOT_STARTED.
