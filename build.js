const fs = require('fs-extra')
const pj = require('./package.json')
const terser = require('terser')
const CleanCSS = require('clean-css')
const performance = require('perf_hooks').performance
const buildPath = 'build'
const header = `/**
 * @copyright ${new Date().getFullYear()} ${pj.author.name}
 * @homepage ${pj.homepage}
 * @license ${pj.license} - ${pj.homepage}/blob/master/LICENSE
 */

appInfo = {
    productName: '${pj.productName}',
    description:'${pj.description}',
    version: '${pj.version}',
    author: '${pj.author.name}',
    homepage: '${pj.homepage}',
    licence: '${pj.license}',
    website: 'https://numara.io'
};
`

const t0 = performance.now()

process.stdout.write('Preparing app for build...')

fs.emptyDir(buildPath)
  .then(() => {
    // Copy assets and index.html
    fs.copy('src/assets', buildPath + '/assets')
    fs.copy('src/js/sw.js', buildPath + '/sw.js')
    fs.copy('numara.webmanifest', buildPath + '/numara.webmanifest')
    fs.copy('src/index.html', buildPath + '/index.html')

    // Build JS files
    const plot = ['src/js/d3.js', 'src/js/plot.js']

    const numara = ['src/js/numara.js']

    const packages = [
      'node_modules/deep-diff/dist/deep-diff.min.js',
      'node_modules/lucide/dist/umd/lucide.min.js',
      'node_modules/luxon/build/global/luxon.min.js',
      'node_modules/mathjs/lib/browser/math.js',
      'node_modules/mousetrap/mousetrap.min.js',
      'node_modules/mousetrap-global-bind/mousetrap-global-bind.min.js',
      'node_modules/uikit/dist/js/uikit.min.js'
    ]

    const codemirror = [
      'node_modules/codemirror/lib/codemirror.js',
      'node_modules/codemirror/addon/dialog/dialog.js',
      'node_modules/codemirror/addon/display/placeholder.js',
      'node_modules/codemirror/addon/edit/matchbrackets.js',
      'node_modules/codemirror/addon/edit/closebrackets.js',
      'node_modules/codemirror/addon/hint/show-hint.js',
      'node_modules/codemirror/addon/search/jump-to-line.js',
      'node_modules/codemirror/addon/search/search.js',
      'node_modules/codemirror/addon/search/searchcursor.js',
      'node_modules/codemirror/mode/javascript/javascript.js'
    ]

    const tersePlot = {}
    const terseNumara = {}
    const tersePackages = {}
    const terseCodemirror = {}

    plot.forEach((item, index) => {
      tersePlot[index] = fs.readFileSync(item, 'utf-8')
    })
    numara.forEach((item, index) => {
      terseNumara[index] = fs.readFileSync(item, 'utf-8')
    })
    packages.forEach((item, index) => {
      tersePackages[index] = fs.readFileSync(item, 'utf-8')
    })
    codemirror.forEach((item, index) => {
      terseCodemirror[index] = fs.readFileSync(item, 'utf-8')
    })

    terser.minify(tersePlot).then((js) => {
      fs.outputFileSync(buildPath + '/js/plot.js', js.code)
    })
    terser.minify(terseNumara).then((js) => {
      fs.outputFileSync(buildPath + '/js/numara.js', js.code)
    })
    terser.minify(tersePackages).then((js) => {
      fs.outputFileSync(buildPath + '/js/packages.js', js.code)
    })
    terser.minify(terseCodemirror).then((js) => {
      fs.outputFileSync(buildPath + '/js/codemirror.js', js.code)
    })

    // Build CSS files
    const numaraCss = ['src/css/app.css', 'src/css/print.css']

    const codemirrorCss = [
      'node_modules/codemirror/lib/codemirror.css',
      'node_modules/codemirror/addon/dialog/dialog.css',
      'node_modules/codemirror/addon/hint/show-hint.css',
      'node_modules/codemirror/theme/material-darker.css'
    ]

    const cleanNumara = {}
    const cleanCodemirror = {}

    numaraCss.forEach((item) => {
      cleanNumara[item] = {
        styles: fs.readFileSync(item, 'utf-8')
      }
    })

    codemirrorCss.forEach((item) => {
      cleanCodemirror[item] = {
        styles: fs.readFileSync(item, 'utf-8')
      }
    })

    new CleanCSS().minify([cleanNumara], (error, css) => {
      if (error) throw error
      fs.outputFileSync(buildPath + '/css/numara.css', css.styles)
    })
    new CleanCSS().minify([cleanCodemirror], (error, css) => {
      if (error) throw error
      fs.outputFileSync(buildPath + '/css/codemirror.css', css.styles)
    })
    new CleanCSS().minify(['src/css/dark.css'], (error, css) => {
      if (error) throw error
      fs.outputFileSync(buildPath + '/css/dark.css', css.styles)
    })
    new CleanCSS().minify(['src/css/light.css'], (error, css) => {
      if (error) throw error
      fs.outputFileSync(buildPath + '/css/light.css', css.styles)
    })

    fs.copy('node_modules/uikit/dist/css/uikit.min.css', buildPath + '/css/uikit.min.css')
  })
  .then(() => {
    // Prepend app info
    fs.readFile(buildPath + '/js/numara.js', 'utf-8').then((numarajs) => {
      fs.writeFile(buildPath + '/js/numara.js', header + numarajs)
    })
  })
  .then(() => {
    const t1 = performance.now()
    process.stdout.write('done (in ' + ((t1 - t0) / 1000).toFixed(2) + ' seconds).\n\n')
  })
