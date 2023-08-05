import nodePolyfills from 'rollup-plugin-polyfill-node'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import json from '@rollup/plugin-json'

import CleanCSS from 'clean-css'
import fs from 'fs-extra'

const pkg = JSON.parse(fs.readFileSync('./package.json'))

const buildPath = 'build'

const banner = `/**
* Numara Calculator
* Version ${pkg.version}
* Copyright ©️ ${new Date().getFullYear()} ${pkg.author.name}
* 
* Licence : ${pkg.license} - ${pkg.homepage}/blob/master/LICENSE
* GitHub  : ${pkg.homepage}
* Website : ${pkg.author.url}
*/`

fs.emptyDir(buildPath).then(() => {
  const copyFiles = [
    { source: 'src/assets', target: buildPath + '/assets' },
    { source: 'src/index.html', target: buildPath + '/index.html' },
    { source: 'src/misc/sw.js', target: buildPath + '/sw.js' },
    { source: 'src/misc/numara.webmanifest', target: buildPath + '/numara.webmanifest' },
    { source: 'node_modules/uikit/dist/css/uikit.min.css', target: buildPath + '/css/uikit.min.css' }
  ]

  copyFiles.forEach(({ source, target }) => {
    fs.copy(source, target)
  })

  const cssFiles = [
    {
      input: [
        'node_modules/codemirror/lib/codemirror.css',
        'node_modules/codemirror/addon/dialog/dialog.css',
        'node_modules/codemirror/addon/hint/show-hint.css',
        'node_modules/codemirror/theme/material-darker.css'
      ],
      output: '/css/codemirror.css'
    },
    { input: ['src/css/app.css'], output: '/css/numara.css' },
    { input: ['src/css/light.css'], output: '/css/light.css' },
    { input: ['src/css/dark.css'], output: '/css/dark.css' }
  ]

  // Build CSS files
  cssFiles.forEach(({ input, output }) => {
    new CleanCSS().minify(input, (e, css) => {
      fs.outputFileSync(buildPath + output, css.styles)
    })
  })
})

const buildConfig = {
  input: 'src/js/app.js',
  output: [
    {
      file: buildPath + '/js/numara.js',
      name: 'numara',
      format: 'iife',
      compact: true,
      sourcemap: !process.env.PROD,
      plugins: [terser({ format: { preamble: banner } })]
    }
  ],
  plugins: [json(), resolve(), commonjs(), nodePolyfills()]
}

export default buildConfig
