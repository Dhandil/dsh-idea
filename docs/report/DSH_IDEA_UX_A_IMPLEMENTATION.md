# DSH Idea UX-A implementation evidence

Base: `a8a0d8571e71414ceae59501d0b10a9ae7eb9720`. Scope: UX-01, 03, 04, 05, 06, 07; no Harness Core or Idea persistence-model changes.

- UX-01: the conversation lightbulb now uses the DSH `Tooltip` primitive with its existing accessible name.
- UX-03: existing section-mount `closeDetail()` already restores the list on settings re-entry; left unchanged. The existing navigation test and isolated browser re-entry both passed.
- UX-04: the detail reminder uses the controlled DSH `Switch` with explicit on/paused text. The existing Host mutation, pending disable, failure display, and stale-result guard are unchanged.
- UX-05/06: all Idea multiline inputs grow with content to a capped height. Use-when and open-question values render as editable rows, with add, remove, Enter split, wrapping, and newline paste. The existing newline-backed draft converts to the same string arrays and uses the same validation on save.
- UX-07: the editor's top Back returns to detail. Visible unsaved form changes open a confirmation dialog; Cancel and Save continue through the existing controller actions.

Verification: `typecheck`, Host build, client bundle build, and the complete Vitest suite passed (57 files, 890 tests). The first full-suite run found a bundle-factory incompatibility from top-level `forwardRef`; it was removed. The unrelated E6 embedding test timed out once under that run's load, then passed both alone and in the final full suite. Existing React `act(...)` warnings remain in older tests.

Real Chrome verification used a fresh, repository-external `DSH_HOME`, an independent temporary Chrome profile, loopback Web port `18795`, and the official `workspace/create` RPC. No credential was copied. A temporary Idea was directly saved, edited to v2, and read through official `idea/get` and `idea/getVersions`: the two use-when rows, two open-question rows, and versions 1/2 matched the UI. The Switch changed `resurfacingMuted` from false to true and back. Settings navigation returned to the list. Light and dark themes, a 650 px viewport, row add/delete, multiline input, and a dirty Back confirmation were checked. A second isolated run loaded the final client bundle and confirmed new-row focus and confirmation for a blank unsaved row. No AI organize, Agent, Judge, or Provider request was made.

The temporary Ideas were deleted; official `idea/list` returned an empty list. Both test browsers and Web services were stopped, port `18795` was released, and their disposable runtime directories were removed. Unrelated untracked files were left untouched.

Screenshots (synthetic content only): [light editor](assets/DSH_IDEA_UX_A_edit_light.png), [unsaved-change confirmation](assets/DSH_IDEA_UX_A_unsaved_confirm.png), [reminder Switch](assets/DSH_IDEA_UX_A_detail_switch.png), [dark narrow list editor](assets/DSH_IDEA_UX_A_lists_dark_narrow.png).
