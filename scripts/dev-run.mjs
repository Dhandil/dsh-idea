#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import {
  cleanupRun, createRun, groupMembers, inspectRuns, processIdentity, reapRun,
  registerChild, requireRun, runEnvironment,
} from './dev-runtime.mjs'

export async function runCommand(command, { label = 'task', cwd = process.cwd() } = {}) {
  if (!command.length) throw new Error('dev-run: command required')
  const nested = Boolean(process.env.DSH_IDEA_RUN_ID)
  const run = nested ? requireRun() : createRun({ label })
  let child, identity, signal, spawned = false, cancelTimer, expireCancellation
  const cancellation = new Promise(resolve => { expireCancellation = resolve })
  const forward = sig => {
    signal ??= sig
    cancelTimer ??= setTimeout(() => expireCancellation({ timedOut: true }), 2500)
    if (child?.pid) {
      try { process.kill(nested ? child.pid : -child.pid, sig) } catch (e) { if (e.code !== 'ESRCH') throw e }
    }
  }
  const listeners = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(sig => [sig, () => forward(sig)]))
  for (const [sig, fn] of listeners) process.on(sig, fn)
  let exitCode = 1
  try {
    child = spawn(command[0], command.slice(1), { cwd, env: runEnvironment(run), stdio: 'inherit', detached: !nested })
    const closed = new Promise(resolve => {
      child.once('error', error => resolve({ error }))
      child.once('close', (code, sig) => resolve({ code, sig }))
    })
    // Install close/error listeners before awaiting spawn to cover short-lived commands.
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
    spawned = true
    identity = processIdentity(child.pid)
    if (!nested) registerChild(run, identity ?? { pid: child.pid, started: null })
    if (signal) forward(signal)
    const result = await Promise.race([closed, cancellation])
    if (result.error) throw result.error
    if (result.timedOut) throw new Error('dev-run: cancellation timed out; active run retained')
    exitCode = signal || result.sig ? 128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[signal ?? result.sig] ?? 1) : result.code ?? 1
  } finally {
    try {
      if (!nested && spawned) {
        // Only the process group created by this invocation is signaled.
        const current = processIdentity(child.pid)
        if (current && identity && current.started !== identity.started) throw new Error('dev-run: child PID reused; retained')
        if (groupMembers(child.pid).length) {
          if (!identity) throw new Error('dev-run: child identity unavailable; active group retained')
          process.kill(-child.pid, 'SIGTERM')
          for (let n = 0; n < 40 && groupMembers(child.pid).length; n++) await delay(50)
          // No force kill: if graceful termination fails, retain the run and report it.
          if (groupMembers(child.pid).length) throw new Error('dev-run: active descendants; retained for review')
        }
      }
      if (!nested) {
        const result = cleanupRun(run)
        console.error(`dev-runtime: ${JSON.stringify({ ...result, exceptions: result.exceptions.map(x => ({ category: x.category, endCheck: x.endCheck })) })}`)
      }
    } finally {
      clearTimeout(cancelTimer)
      child?.unref()
      for (const [sig, fn] of listeners) process.off(sig, fn)
    }
  }
  return exitCode
}

async function main(args) {
  const separator = args.indexOf('--')
  if (args[0] === 'audit') {
    console.log(JSON.stringify(inspectRuns().map(({ id, state }) => ({ id, state })), null, 2))
    return 0
  }
  if (args[0] === 'reap' && args.length === 2) {
    console.log(JSON.stringify(reapRun(args[1])))
    return 0
  }
  return runCommand(separator < 0 ? args : args.slice(separator + 1))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(process.argv.slice(2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
