/**
 * The continuation Workspace policy, shared by the Ideas section's Continue
 * Discussion entry: the current session's workspace, else the most recently
 * updated one (the update instant is what recency means here), else none.
 * The client only ever names a Workspace — the Host's Session Controller
 * creates the Session and attaches it — so an absent selection simply lets
 * the Host create its default conversation.
 * @module @dsh-external/dsh-idea/client/workspace
 */

/** One row of the shared Workspace navigation's list snapshot. */
export interface WorkspaceRow {
  workspaceId: string
  sessionIds: readonly string[]
  updatedAt: string
}

/**
 * Pick the Workspace a continuation conversation should be created in.
 * @param items - The ready Workspace list rows.
 * @param currentSessionId - The session the user is looking at, if any.
 * @returns the Workspace id, or undefined when nothing can be selected.
 */
export function selectContinuationWorkspace(
  items: readonly WorkspaceRow[],
  currentSessionId: string | undefined,
): string | undefined {
  const currentWorkspace = currentSessionId === undefined
    ? undefined
    : items.find(item => item.sessionIds.includes(currentSessionId))?.workspaceId
  return currentWorkspace ?? [...items].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  )[0]?.workspaceId
}
