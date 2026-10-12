/** A controller with resources that must be released when its Session changes. */
interface DisposableController {
  dispose(): void
}

interface OwnedController<TController extends DisposableController> {
  eventSource: object
  controller: TController
  disposing: boolean
}

/**
 * Own one resurfacing controller per SessionId and current Session event
 * source. SessionId can outlive a Session object, so the event source is the
 * generation identity used to decide whether a cached controller is live.
 * This module is internal to the client package; it is not a package export.
 */
export class ResurfacingControllerOwner<TController extends DisposableController> {
  private readonly controllers = new Map<string, OwnedController<TController>>()

  /** Return the controller for this generation, or retire it if no binding exists. */
  get(sessionId: string, eventSource: undefined, create: () => TController): undefined
  get(sessionId: string, eventSource: object, create: () => TController): TController
  get(
    sessionId: string,
    eventSource: object | undefined,
    create: () => TController,
  ): TController | undefined {
    if (eventSource === undefined) {
      this.disposeSession(sessionId)
      return undefined
    }

    const current = this.controllers.get(sessionId)
    if (current?.disposing) {
      throw new Error(`idea resurface: controller for session "${sessionId}" is disposing`)
    }
    if (current?.eventSource === eventSource) return current.controller

    // Keep the old entry reachable until dispose has released its event,
    // input, and controller-local async resources.
    if (current !== undefined) this.disposeEntry(sessionId, current)

    const controller = create()
    this.controllers.set(sessionId, { eventSource, controller, disposing: false })
    return controller
  }

  /** Retire a controller as soon as its current binding/scope disappears. */
  disposeSession(sessionId: string): void {
    const current = this.controllers.get(sessionId)
    if (current !== undefined && !current.disposing) this.disposeEntry(sessionId, current)
  }

  /** Dispose every controller still owned by this plugin exactly once. */
  disposeAll(): void {
    let didThrow = false
    let firstError: unknown
    for (const sessionId of [...this.controllers.keys()]) {
      try {
        this.disposeSession(sessionId)
      } catch (error) {
        if (!didThrow) firstError = error
        didThrow = true
      }
    }
    if (didThrow) throw firstError
  }

  private disposeEntry(sessionId: string, entry: OwnedController<TController>): void {
    entry.disposing = true
    try {
      entry.controller.dispose()
    } finally {
      if (this.controllers.get(sessionId) === entry) this.controllers.delete(sessionId)
    }
  }
}
