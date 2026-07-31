/**
 * The `assertActive` error Pi throws when an `ExtensionContext` captured by a
 * long-lived listener outlives its session.
 *
 * In-process subagents (e.g. `@gotgenes/pi-subagents`) create a sibling
 * `AgentSession` in the same process. Its `session.dispose()` invalidates the
 * child's `ExtensionRunner` (so any captured child ctx throws on access) but
 * does NOT emit `session_shutdown`, so async work still draining on the
 * child's event bus — the SSE quota tee reader — can fire a quota-updates
 * listener after the child ctx is already stale.
 */
export function isStaleExtensionCtxError(err: unknown): boolean {
  return err instanceof Error && /extension ctx is stale/i.test(err.message);
}
