export interface DevRun {
  id: string
  root: string
  path: string
  receipt: string
  paths: Record<'home' | 'dshHome' | 'tmp' | 'browserProfile' | 'workspace' | 'storage' | 'logs' | 'screenshots' | 'videos' | 'build' | 'cache' | 'config' | 'data' | 'state', string>
  owner: { token: string }
}
export interface RuntimeException {
  category: string
  reason: string
  path?: string
  status?: string
  endCheck?: string
}
export interface CleanupResult {
  id: string
  removed: true
  exceptions: RuntimeException[]
}
export interface ProcessIdentity {
  pid: number
  started: string | null
}
export const repositoryRoot: string
export function createRun(options?: { root?: string; label?: string }): DevRun
export function requireRun(env?: NodeJS.ProcessEnv): DevRun
export function runPath(run: DevRun, ...parts: string[]): string
export function runEnvironment(run: DevRun, base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
export function recordException(run: DevRun, entry: RuntimeException): void
export function cleanupRun(run: DevRun, options?: { stale?: boolean }): CleanupResult
export function reapRun(id: string, root?: string): CleanupResult
export function inspectRuns(root?: string): { id: string; state: string; run?: DevRun }[]
export function processIdentity(pid: number): ProcessIdentity | undefined
export function groupMembers(pgid: number): number[]
export function registerChild(run: DevRun, child: ProcessIdentity): void
