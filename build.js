import { build } from 'esbuild'
import { readFileSync, promises as fs } from 'fs'

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
}

buildNumara()
