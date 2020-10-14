const fs = require('fs-extra');
const terser = require("terser");
const cleanCSS = require('clean-css');

const build_path = 'build';

console.log('Starting build...');

fs.emptyDir(build_path).then(() => {
    fs.ensureDir(build_path + '/css');
    fs.ensureDir(build_path + '/js');
}).then(() => {
    // Build JS files
    var ops_p = {
        compress: false,
        mangle: false
    };

    var ops_c = {
        mangle: false
    };

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

    var numara = [
        'src/js/d3.js',
        'src/js/plot.js',
        'src/js/app.js' // app.js has to be last
    ];

    var t_p = {};
    var t_c = {};
    var t_n = {};

    packages.forEach((item, index) => t_p[index] = fs.readFileSync(item, 'utf-8'));
    codemirror.forEach((item, index) => t_c[index] = fs.readFileSync(item, 'utf-8'));
    numara.forEach((item, index) => t_n[index] = fs.readFileSync(item, 'utf-8'));

    terser.minify(t_p, ops_p).then((js) => fs.writeFileSync(build_path + '/js/packages.js', js.code));
    terser.minify(t_c, ops_c).then((js) => fs.writeFileSync(build_path + '/js/codemirror.js', js.code));
    terser.minify(t_n).then((js) => fs.writeFileSync(build_path + '/js/numara.js', js.code));

    // Build CSS files
    var css_ops = {
        returnPromise: true
    }

    var codemirror_css = [
        'node_modules/codemirror/lib/codemirror.css',
        'node_modules/codemirror/addon/dialog/dialog.css',
        'node_modules/codemirror/addon/hint/show-hint.css'
    ]

    var numara_css = [
        'src/css/app.css',
        'src/css/print.css'
    ];

    var c_c = {};
    var c_n = {};

    codemirror_css.forEach((item, index) => {
        c_c[item] = {
            styles: fs.readFileSync(item, 'utf-8')
        }
    });

    numara_css.forEach((item, index) => {
        c_n[item] = {
            styles: fs.readFileSync(item, 'utf-8')
        }
    });

    new cleanCSS(css_ops).minify([c_c]).then((css) => fs.writeFileSync(build_path + '/css/codemirror.css', css.styles));
    new cleanCSS(css_ops).minify([c_n]).then((css) => fs.writeFileSync(build_path + '/css/numara.css', css.styles));
    new cleanCSS(css_ops).minify(['src/css/light.css']).then((css) => fs.writeFileSync(build_path + '/css/light.css', css.styles));
    new cleanCSS(css_ops).minify(['src/css/dark.css']).then((css) => fs.writeFileSync(build_path + '/css/dark.css', css.styles));

    fs.copy('node_modules/uikit/dist/css/uikit.min.css', build_path + '/css/uikit.min.css');

    // Copy assets and index.html
    fs.copy('src/assets', build_path + '/assets');
    fs.copy('src/index.html', build_path + '/index.html');

}).then(() => console.log('Build complete.'));