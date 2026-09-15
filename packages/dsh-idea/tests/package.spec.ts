/**
 * Build/package gates: the built package carries every runtime face the
 * delivery contract promises, all four consumer entry points resolve through
 * package exports, and the web bundle is a well-formed client module with the
 * plugin id and its own inlined Remote contribution. No source-only runtime
 * accident.
 * @module tests/package.spec
 */

import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDir = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]tests$/, '')
const libDir = join(packageDir, 'lib')

const requireFromPackage = createRequire(join(packageDir, 'package.json'))

/** Resolve one export path through the package's own exports map. */
const resolveExport = (subpath: string): string =>
  requireFromPackage.resolve(subpath === '.' ? '@dsh-external/dsh-idea' : `@dsh-external/dsh-idea${subpath}`)

describe('built package contents', () => {
  const required: Array<[string, string]> = [
    ['host runtime', 'lib/index.js'],
    ['host types', 'lib/index.d.ts'],
    ['preparation runtime', 'lib/preparation/index.js'],
    ['remote-host runtime', 'lib/remote-host/index.js'],
    ['generated typert host artifact', 'lib/typert.host.js'],
    ['generated typert host types', 'lib/typert.host.d.ts'],
    ['generated remote client artifact', 'lib/typert.remote-client.js'],
    ['generated remote client types', 'lib/typert.remote-client.d.ts'],
    ['web client bundle', 'lib/client.js'],
    ['cordis patch manifest', 'cordis.patch.yml'],
  ]

  it.each(required)('%s exists', (_label, rel) => {
    expect(existsSync(join(packageDir, rel))).toBe(true)
  })
})

describe('consumer resolution smoke', () => {
  it('resolves every consumer entry point into lib/', () => {
    for (const subpath of ['.', '/preparation', '/remote-host', '/typert', '/remote', '/client']) {
      const resolved = resolveExport(subpath)
      expect(relative(libDir, resolved), subpath).not.toMatch(/^\.\./)
    }
  })

  it('loads the root runtime and its remote artifacts without source imports', async () => {
    const root = await import(resolveExport('.'))
    expect(root.default).toBe(root.IdeaService)
    expect(root.IdeaRemoteService).toBeDefined()

    const host = await import(resolveExport('/typert'))
    expect(host.TYPERT).toMatchObject({ package: '@dsh-external/dsh-idea', face: 'host' })

    const remote = await import(resolveExport('/remote'))
    expect(remote.default).toMatchObject({ package: '@dsh-external/dsh-idea' })
  })

  it('keeps built outputs free of source-tree specifiers', () => {
    const root = readFileSync(resolveExport('.'), 'utf8')
    const remoteHost = readFileSync(resolveExport('/remote-host'), 'utf8')
    expect(root).not.toMatch(/['"]\.\.\/src\//)
    expect(remoteHost).not.toMatch(/['"]\.\.\/src\//)
    expect(root).not.toMatch(/\.ts['"]/)
  })
})

describe('web client bundle', () => {
  it('is a registered client module with the plugin id and both exported seats', async () => {
    const source = readFileSync(resolveExport('/client'), 'utf8')
    expect(source).toContain('window.__ModuleLoader__.load')
    expect(source).toContain('"@dsh-external/dsh-idea"')
    // The generated remote contribution is inlined, never a runtime import.
    expect(source).toContain('idea/prepareFromMessage')
    expect(source).not.toContain("require('@dsh-external/dsh-idea/remote')")
    expect(source).toContain('exports.apply')
    expect(source).toContain('exports.inject')

    const loaded: Record<string, { id: string, exports: Record<string, unknown> }> = {}
    const previousWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = {
      __ModuleLoader__: {
        load: (definition: { id: string, factory: (require: (id: string) => unknown) => Record<string, unknown> }) => {
          loaded[definition.id] = {
            id: definition.id,
            exports: definition.factory(() => ({})) as Record<string, unknown>,
          }
        },
      },
    }
    try {
      const entry = resolveExport('/client')
      await import(pathToFileURL(entry).href)
      expect(Object.keys(loaded)).toEqual(['@dsh-external/dsh-idea'])
      expect(typeof loaded['@dsh-external/dsh-idea']?.exports.apply).toBe('function')
      expect(loaded['@dsh-external/dsh-idea']?.exports.inject).toEqual(['remote', 'locale', 'slots'])
    } finally {
      ;(globalThis as { window?: unknown }).window = previousWindow
    }
  })
})
