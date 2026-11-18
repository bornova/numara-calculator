import assert from 'node:assert'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

import electronPath from 'electron'

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2'
}

describe('End-to-End Browser, PWA, Plot, Print, & Desktop Electron Suite', () => {
  let server = null
  let serverOrigin = ''
  let tempRoot = ''
  const e2eResults = new Map()

  before(async () => {
    // Ensure build/ reflects current source files
    execFileSync(process.execPath, ['build.js', '--prod'], { stdio: 'inherit' })

    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'numara-e2e-'))
    const userDataDir = path.join(tempRoot, 'userData')
    const syncTestDir = path.join(tempRoot, 'syncDir')
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.mkdirSync(syncTestDir, { recursive: true })

    const buildDir = path.resolve('build')

    server = http.createServer((req, res) => {
      const parsed = new URL(req.url, 'http://127.0.0.1')
      const isSab = parsed.pathname.startsWith('/sab/')
      const relPath = (isSab ? parsed.pathname.slice(4) : parsed.pathname).replace(/^\/+/, '') || 'index.html'
      const safePath = path.resolve(buildDir, relPath)

      if (!safePath.startsWith(buildDir) || !fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const ext = path.extname(safePath).toLowerCase()
      const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      }

      if (isSab) {
        headers['Cross-Origin-Opener-Policy'] = 'same-origin'
        headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
      }

      res.writeHead(200, headers)
      fs.createReadStream(safePath).pipe(res)
    })

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    serverOrigin = `http://127.0.0.1:${port}`

    const electronArgs = [path.resolve('tests/e2e-runner.js'), '--no-sandbox']
    let spawnCmd = electronPath
    let spawnArgs = electronArgs

    if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      try {
        execFileSync('which', ['xvfb-run'], { stdio: 'ignore' })
        spawnCmd = 'xvfb-run'
        spawnArgs = ['--auto-servernum', electronPath, ...electronArgs]
      } catch {
        spawnArgs = [...electronArgs, '--headless', '--ozone-platform=headless']
      }
    }

    await new Promise((resolve, reject) => {
      const child = spawn(spawnCmd, spawnArgs, {
        env: {
          ...process.env,
          NUMARA_TEST_USERDATA: userDataDir,
          NUMARA_TEST_ORIGIN: serverOrigin,
          NUMARA_TEST_SYNCDIR: syncTestDir
        },
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdoutBuf = ''
      let stderrBuf = ''

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk
        const lines = stdoutBuf.split('\n')
        stdoutBuf = lines.pop()

        for (const line of lines) {
          if (line.startsWith('E2E_RESULT:')) {
            const parsed = JSON.parse(line.slice('E2E_RESULT:'.length))
            e2eResults.set(parsed.name, parsed)
          }
        }
      })

      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => {
        stderrBuf += chunk
      })

      child.on('error', reject)
      child.on('close', (code) => {
        if (code !== 0 && e2eResults.size === 0) {
          reject(new Error(`Electron E2E runner exited with code ${code}:\n${stderrBuf}`))
          return
        }
        resolve()
      })
    })
  })

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  const EXPECTED_STEPS = [
    'Web/PWA: SharedArrayBuffer Web Worker & live CodeMirror evaluation',
    'Web/PWA: Service Worker precache, excluded desktop icons, & offline reload',
    'UI & Layout Settings: theme, zoomLevel, answerPosition (left/right/bottom), pageListPosition (dock/float/tabs/auto), rulers, truncate, lineErrors, toggleSubs',
    'Editor Features: syntax tokenizer, markdown folding, search/replace, & selection stats',
    'Plotting & Print: BigNumber multi-series SVG plot + Dark-Theme @media print legibility',
    'UDFU Dialog: adding, evaluating, and deleting control-flow UDF & custom UDU',
    'Desktop Electron: getNumFilePath, multi-file startup queue, & real two-way fs.watch Folder Sync'
  ]

  for (const stepName of EXPECTED_STEPS) {
    it(stepName, () => {
      const res = e2eResults.get(stepName)
      assert.ok(res, `E2E step did not execute: "${stepName}"`)
      assert.strictEqual(res.ok, true, res.error || `E2E step failed: "${stepName}"`)
    })
  }
})
