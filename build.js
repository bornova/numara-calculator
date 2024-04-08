import { build } from 'esbuild'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

import fs from 'fs-extra'

const pkg = JSON.parse(fs.readFileSync('./package.json'))

const buildPath = 'build'

fs.emptyDir(buildPath).then(() => {
  const copyFiles = [
    { source: 'src/assets', target: buildPath + '/assets' },
    { source: 'src/index.html', target: buildPath + '/index.html' },
    { source: 'src/misc/sw.js', target: buildPath + '/sw.js' },
    { source: 'src/misc/numara.webmanifest', target: buildPath + '/numara.webmanifest' }
  ]

  copyFiles.forEach(({ source, target }) => {
    fs.copySync(source, target)
  })

  const cssBanner = `/* ${pkg.description} ${pkg.version} */\n`
  const cssConfig = { banner: { css: cssBanner }, bundle: true, minify: true }

  build({
    ...cssConfig,
    entryPoints: ['src/css/app.css'],
    outfile: buildPath + '/css/numara.css'
  })

  build({
    ...cssConfig,
    entryPoints: ['src/css/light.css', 'src/css/dark.css'],
    outdir: buildPath + '/css/'
  })

  const jsBanner = `/**
  * ${pkg.description}
  * Version ${pkg.version}
  * Copyright ©️ ${new Date().getFullYear()} ${pkg.author.name}
  * 
  * Licence : ${pkg.license} - ${pkg.homepage}/blob/master/LICENSE
  * GitHub  : ${pkg.homepage}
  * Website : ${pkg.author.url}
  */`

  build({
    banner: { js: jsBanner },
    bundle: true,
    entryPoints: ['src/js/app.js'],
    minify: true,
    outfile: buildPath + '/js/numara.js',
    plugins: [polyfillNode()],
    sourcemap: !process.env.PROD
  })
})
