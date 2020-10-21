const fs = require('fs-extra');
const pj = require('./package.json');
const terser = require("terser");
const cleanCSS = require('clean-css');

const build_path = 'build';

process.stdout.write('Preparing app for build...');

fs.emptyDir(build_path).then(() => {
    // Copy assets and index.html
    fs.copy('src/assets', build_path + '/assets');
    fs.copy('src/index.html', build_path + '/index.html');

    // Build JS files
    var numara = [
        'src/js/d3.js',
        'src/js/plot.js',
        'src/js/app.js' // app.js has to be last
    ];

    var packages = [
        'node_modules/deep-diff/dist/deep-diff.min.js',
        'node_modules/feather-icons/dist/feather.min.js',
        'node_modules/mathjs/dist/math.min.js',
        'node_modules/moment/min/moment.min.js',
        'node_modules/mousetrap/mousetrap.min.js',
        'node_modules/mousetrap-global-bind/mousetrap-global-bind.min.js',
        'node_modules/uikit/dist/js/uikit.min.js'
    ];

    var codemirror = [
        'node_modules/codemirror/lib/codemirror.js',
        'node_modules/codemirror/addon/dialog/dialog.js',
        'node_modules/codemirror/addon/edit/matchbrackets.js',
        'node_modules/codemirror/addon/edit/closebrackets.js',
        'node_modules/codemirror/addon/hint/show-hint.js',
        'node_modules/codemirror/addon/search/search.js',
        'node_modules/codemirror/addon/search/searchcursor.js',
        'node_modules/codemirror/addon/search/jump-to-line.js'
    ];

    var t_n = {};
    var t_p = {};
    var t_c = {};

    numara.forEach((item, index) => t_n[index] = fs.readFileSync(item, 'utf-8'));
    packages.forEach((item, index) => t_p[index] = fs.readFileSync(item, 'utf-8'));
    codemirror.forEach((item, index) => t_c[index] = fs.readFileSync(item, 'utf-8'));

    terser.minify(t_n).then((js) => fs.outputFileSync(build_path + '/js/numara.js', js.code));
    terser.minify(t_p, {
        compress: false,
        mangle: false
    }).then((js) => fs.outputFileSync(build_path + '/js/packages.js', js.code));
    terser.minify(t_c, {
        mangle: false
    }).then((js) => fs.outputFileSync(build_path + '/js/codemirror.js', js.code));

    // Build CSS files
    var numara_css = [
        'src/css/app.css',
        'src/css/print.css'
    ];

    var codemirror_css = [
        'node_modules/codemirror/lib/codemirror.css',
        'node_modules/codemirror/addon/dialog/dialog.css',
        'node_modules/codemirror/addon/hint/show-hint.css'
    ];

    var c_n = {};
    var c_c = {};

    numara_css.forEach((item, index) => {
        c_n[item] = {
            styles: fs.readFileSync(item, 'utf-8')
        };
    });

    codemirror_css.forEach((item, index) => {
        c_c[item] = {
            styles: fs.readFileSync(item, 'utf-8')
        };
    });

    new cleanCSS().minify([c_n], (error, css) => fs.outputFileSync(build_path + '/css/numara.css', css.styles));
    new cleanCSS().minify([c_c], (error, css) => fs.outputFileSync(build_path + '/css/codemirror.css', css.styles));
    new cleanCSS().minify(['src/css/dark.css'], (error, css) => fs.outputFileSync(build_path + '/css/dark.css', css.styles));
    new cleanCSS().minify(['src/css/light.css'], (error, css) => fs.outputFileSync(build_path + '/css/light.css', css.styles));
    new cleanCSS().minify(['src/css/mobile.css'], (error, css) => fs.outputFileSync(build_path + '/css/mobile.css', css.styles));

    fs.copy('node_modules/uikit/dist/css/uikit.min.css', build_path + '/css/uikit.min.css');
}).then(() => {
    // Prepend app name and version
    var str = 'const appName="' + pj.productName + '";const appVersion="' + pj.version + '";';
    fs.readFile(build_path + '/js/numara.js', 'utf-8')
        .then(numarajs => fs.writeFile(build_path + '/js/numara.js', str + numarajs));
}).then(() => process.stdout.write('done.\n\n'));