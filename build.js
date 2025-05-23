import { build } from 'esbuild'
import fs from 'fs-extra'

const pkg = JSON.parse(fs.readFileSync('./package.json'))
const buildPath = 'build'

/**
 * Copy files to the build directory.
 * @param {Array} files - Array of file objects with source and target paths.
 */
function copyFiles(files) {
  files.forEach(({ source, target }) => {
    fs.copySync(source, target)
  })
}

/**
 * Build CSS files.
 * @param {Array} entryPoints - Array of entry points for CSS files.
 * @param {string} outfile - Output file for the built CSS file.
 */
function buildCSS(entryPoints, outdir) {
  const cssBanner = `/* ${pkg.description} ${pkg.version} */\n`
  const cssConfig = { banner: { css: cssBanner }, bundle: true, minify: true }

  build({
    ...cssConfig,
    entryPoints,
    outdir
  })
}

/**
 * Build JavaScript files.
 * @param {Array} entryPoints - Array of entry points for JavaScript files.
 * @param {string} outfile - Output file for the built JavaScript file.
 */
function buildJS(entryPoints, outfile) {
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
    entryPoints,
    minify: true,
    outfile,
    sourcemap: !process.env.PROD
  })
}

// Clear the build directory and start the build process
fs.emptyDir(buildPath).then(() => {
  const filesToCopy = [
    { source: 'src/assets', target: buildPath + '/assets' },
    { source: 'src/index.html', target: buildPath + '/index.html' },
    { source: 'src/misc/numara.webmanifest', target: buildPath + '/numara.webmanifest' }
  ]

  copyFiles(filesToCopy)

  buildCSS(['src/css/app.css', 'src/css/light.css', 'src/css/dark.css'], buildPath + '/css')

  buildJS(['src/js/app.js'], buildPath + '/js/numara.js')
})
