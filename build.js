import { build } from 'esbuild'
import fs from 'fs-extra'

const pkg = JSON.parse(fs.readFileSync('./package.json'))
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
  await fs.emptyDir(buildPath)

  await Promise.all([
    fs.copy('src/assets', `${buildPath}/assets`),
    fs.copy('src/index.html', `${buildPath}/index.html`),
    fs.copy('src/misc/numara.webmanifest', `${buildPath}/numara.webmanifest`)
  ])

  await build({
    banner: { css: cssBanner },
    bundle: true,
    minify: true,
    entryPoints: ['src/css/app.css', 'src/css/light.css', 'src/css/dark.css'],
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
