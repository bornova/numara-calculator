import { build } from 'esbuild'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

import fs from 'fs-extra'

const pkg = JSON.parse(fs.readFileSync('./package.json'))

const buildPath = 'build'

const copyFiles = [
  { source: 'src/assets', target: buildPath + '/assets' },
  { source: 'src/index.html', target: buildPath + '/index.html' },
  { source: 'src/misc/sw.js', target: buildPath + '/sw.js' },
  { source: 'src/misc/numara.webmanifest', target: buildPath + '/numara.webmanifest' }
]

const cssBanner = `/* ${pkg.description} ${pkg.version} */\n`

const jsBanner = `/**
* ${pkg.description}
* Version ${pkg.version}
* Copyright ©️ ${new Date().getFullYear()} ${pkg.author.name}
* 
* Licence : ${pkg.license} - ${pkg.homepage}/blob/master/LICENSE
* GitHub  : ${pkg.homepage}
* Website : ${pkg.author.url}
*/`

fs.emptyDir(buildPath).then(() => {
  copyFiles.forEach(({ source, target }) => {
    fs.copySync(source, target)
  })

  build({
    banner: { css: cssBanner },
    bundle: true,
    entryPoints: ['src/css/app.css', 'src/css/light.css', 'src/css/dark.css'],
    minify: true,
    outdir: buildPath + '/css'
  })

  build({
    banner: { js: jsBanner },
    bundle: true,
    entryPoints: ['src/js/app.js'],
    format: 'iife',
    globalName: 'numara',
    minify: true,
    outdir: buildPath + '/js',
    plugins: [polyfillNode()],
    sourcemap: !process.env.PROD
  })
})
