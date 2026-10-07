import { build } from 'esbuild'
import { readFileSync, promises as fs } from 'fs'
import path from 'path'

const pkg = JSON.parse(readFileSync('./package.json'))
const buildPath = 'build'

const jsBanner = `/**
* ${pkg.description}
* Version ${pkg.version}
* Copyright ©️ ${new Date().getFullYear()} ${pkg.author.name}
* 
* Licence : ${pkg.license} - ${pkg.homepage}/blob/master/LICENSE
* GitHub  : ${pkg.homepage}
* Website : ${pkg.author.url}
*/`

const cssBanner = `/* ${pkg.description} ${pkg.version} */\n`

/**
 * Recursively collect the files in the build directory as service worker
 * precache URLs (relative to the deploy root). Source maps are excluded.
 * @param {string} dir Directory to walk.
 * @param {string} root Directory the returned URLs are relative to.
 * @returns {Promise<string[]>} Sorted list of relative URLs.
 */
async function collectPrecacheUrls(dir, root = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  const urls = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(dir, entry.name)

      if (entry.isDirectory()) return collectPrecacheUrls(entryPath, root)
      if (entry.name.endsWith('.map')) return []

      return [`./${path.relative(root, entryPath).split(path.sep).join('/')}`]
    })
  )

  return urls.flat().sort()
}

async function buildNumara() {
  await fs.rm(buildPath, { recursive: true, force: true })
  await fs.mkdir(buildPath, { recursive: true })

  await Promise.all([
    fs.cp('src/assets', `${buildPath}/assets`, { recursive: true }),
    fs.cp('src/index.html', `${buildPath}/index.html`),
    fs.cp('src/misc/numara.webmanifest', `${buildPath}/numara.webmanifest`)
  ])

  await build({
    banner: { css: cssBanner },
    bundle: true,
    minify: true,
    entryPoints: ['src/css/app.css'],
    outdir: `${buildPath}/css`
  })

  await build({
    banner: { js: jsBanner },
    bundle: true,
    minify: true,
    entryPoints: ['src/js/app.js'],
    outfile: `${buildPath}/js/numara.js`,
    sourcemap: !process.env.PROD
  })

  await build({
    bundle: true,
    minify: true,
    entryPoints: ['src/js/calc/calc.worker.js'],
    outfile: `${buildPath}/js/calc.worker.js`,
    sourcemap: !process.env.PROD
  })

  const precacheUrls = await collectPrecacheUrls(buildPath)
  const serviceWorker = readFileSync('src/misc/sw.js', 'utf8')
    .replace('__VERSION__', pkg.version)
    .replace("['__PRECACHE__']", JSON.stringify(precacheUrls, null, 2))

  await fs.writeFile(`${buildPath}/sw.js`, serviceWorker)
}

buildNumara()
