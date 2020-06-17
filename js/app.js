/**
 * @copyright 2020 Timur Atalay 
 * @homepage https://github.com/bornova/numpad
 * @license MIT https://github.com/bornova/numpad/blob/master/LICENSE
 */

window.d3 = require('d3');

// Get element by id
const $ = (id) => document.getElementById(id);

// localStorage
const ls = {
    get: (key) => JSON.parse(localStorage.getItem(key)),
    set: (key, value) => localStorage.setItem(key, JSON.stringify(value))
};

// App default settings
const defaultSettings = {
    autoRates: true,
    dateFormat: 'l',
    inputWidth: 50,
    lineErrors: true,
    lineNumbers: true,
    lineWrap: true,
    plotClosed: false,
    plotGridLines: false,
    plotTipLines: false,
    precision: '4',
    resizable: true,
    fontSize: '1.2rem',
    fontWeight: '500',
    thouSep: true
};

Object.freeze(defaultSettings);

// Initiate app settings
var settings;
if (!ls.get('settings')) ls.set('settings', defaultSettings);
if (!ls.get('theme')) ls.set('theme', 'light');

// Check settings for property changes
let initSettings = ls.get('settings');
var newSettings = {};
for (var [p, v] of Object.entries(defaultSettings)) {
    newSettings[p] = p in initSettings ? initSettings[p] : defaultSettings[p];
    ls.set('settings', newSettings);
}

(() => {
    const calculate = require('./js/calculate');
    const ipc = require('electron').ipcRenderer;
    const appName = ipc.sendSync('getName');
    const appVersion = ipc.sendSync('getVersion');

    document.title = appName;

    // Set headers
    if (ipc.sendSync('isWindows')) {
        $('header-mac').remove();
        $('header-win').style.display = 'block';
        $('header-win-title').innerHTML = appName;

        if (ipc.sendSync('isNormal')) $('unmax').style.display = 'none';
        if (ipc.sendSync('isMaximized')) $('max').style.display = 'none';
        ipc.on('fullscreen', (event, isFullscreen) => {
            if (isFullscreen) $('max').click();
        });

        $('winButtons').addEventListener('click', (e) => {
            switch (e.target.id) {
                case 'min':
                    ipc.send('minimize');
                    break;
                case 'max':
                    ipc.send('maximize');
                    $('unmax').style.display = 'block';
                    $('max').style.display = 'none';
                    break;
                case 'unmax':
                    ipc.send('unmaximize');
                    $('unmax').style.display = 'none';
                    $('max').style.display = 'block';
                    break;
                case 'close':
                    ipc.send('close');
                    break;
            }
            e.stopPropagation();
        });
    } else {
        $('header-win').remove();
        $('header-mac').style.display = 'block';
        $('header-mac-title').innerHTML = appName;
    }

    // Load last calculations
    $('input').value = ls.get('input');

    // Apply theme and settings
    feather.replace();
    applyTheme();
    applySettings();

    function applyTheme() {
        var theme = ls.get('theme');
        $('style').setAttribute('href', theme == 'dark' ? './css/dark.css' : './css/light.css');
    }

    function applySettings() {
        settings = ls.get('settings');
        var theme = ls.get('theme');
        var elements = document.getElementsByName('sync');

        $('style').setAttribute('href', theme == 'dark' ? './css/dark.css' : './css/light.css');
        $('input').setAttribute('wrap', settings.lineWrap ? 'on' : 'off');

        for (var el of elements) {
            el.style.fontSize = settings.fontSize;
            el.style.fontWeight = settings.fontWeight;
        }
        $('lineNo').style.display = settings.lineNumbers ? 'block' : 'none';
        $('inputPane').style.width = settings.resizable ? settings.inputWidth + '%' : defaultSettings.inputWidth;
        $('inputPane').style.marginLeft = settings.lineNumbers ? '0px' : '18px';
        $('output').style.textAlign = settings.resizable ? 'left' : 'right';
        $('handle').style.display = settings.resizable ? 'block' : 'none';
        $('wrapper').style.visibility = 'visible';

        calculate();
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('input').focus();
        $('input').addEventListener('input', calculate);
        $('input').dispatchEvent(new CustomEvent('scroll'));

        // Panel resizer
        var handle = document.querySelector('.handle');
        var panel = handle.closest('.panel');
        var resize = panel.querySelector('.resize');
        var isResizing = false;
        var resizeDelay;

        $('handle').addEventListener('mousedown', (e) => isResizing = e.target === handle);
        $('panel').addEventListener('mouseup', (e) => isResizing = false);
        $('panel').addEventListener('mousemove', (e) => {
            var offset = $('lineNo').style.display == 'block' ? 54 : 30;
            var pointerRelativeXpos = e.clientX - panel.offsetLeft - offset;
            var iWidth = pointerRelativeXpos / panel.clientWidth * 100;
            var inputWidth = iWidth < 0 ? 0 : iWidth > 100 ? 100 : iWidth;
            if (isResizing) {
                resize.style.width = inputWidth + '%';
                settings.inputWidth = inputWidth;
                ls.set('settings', settings);
                clearTimeout(resizeDelay);
                resizeDelay = setTimeout(calculate, 20);
            }
        });

        // Exchange rates
        math.createUnit('USD');
        if (ls.get('rates')) createRateUnits();
        if (!ls.get('rates') || settings.autoRates) getRates();

        function getRates() {
            var url = 'https://www.floatrates.com/daily/usd.json';
            if (navigator.onLine) {
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        ls.set('rates', data);
                        createRateUnits();
                        showMsg('Updated exchange rates');
                    }).catch((error) => {
                        showMsg('Failed to get exchange rates');
                    });
            } else {
                showMsg('No internet connection');
            }
        }

        function createRateUnits() {
            var data = ls.get('rates');
            Object.keys(data).map(currency => math.createUnit(data[currency].code, math.unit(data[currency].inverseRate, 'USD'), {
                override: true
            }));
            calculate();
        }

        // Show modal dialog
        function showModal(id) {
            UIkit.modal(id, {
                bgClose: false,
                stack: true
            }).show();
        }

        // App button actions
        $('actions').addEventListener('click', (e) => {
            switch (e.target.id) {
                case 'clearButton': // Clear board
                    if ($('input').value != '') {
                        ls.set('undoData', $('input').value);
                        $('input').value = '';
                        $('input').focus();
                        calculate();
                        showMsg('Board cleared');
                        $('undoButton').style.visibility = 'visible';
                    }
                    break;
                case 'printButton': // Print calculations
                    UIkit.tooltip('#printButton').hide();
                    if ($('input').value != '') {
                        $('printLines').style.display = settings.lineNumbers ? 'block' : 'none';
                        $('printInput').style.width = settings.resizable ? settings.inputWidth : '50%';
                        $('printInput').style.marginLeft = settings.lineNumbers ? '0px' : '18px';
                        $('printInput').style.borderRightWidth = settings.resizable ? '1px' : '0';
                        $('printOutput').style.textAlign = settings.resizable ? 'left' : 'right';

                        $('print-title').innerHTML = appName;
                        $('printLines').innerHTML = $('lineNo').innerHTML;
                        $('printInput').innerHTML = $('input').value;
                        $('printOutput').innerHTML = $('output').innerHTML;
                        ipc.send('print');
                        ipc.once('printReply', (event, response) => showMsg(response));
                    }
                    break;
                case 'saveButton': // Save calcualtions
                    if ($('input').value !== '') {
                        $('saveTitle').value = '';
                        showModal('#dialog-save');
                        $('saveTitle').focus();
                    }
                    break;
                case 'openButton': // Open saved calculations
                    showModal('#dialog-open');
                    break;
                case 'undoButton': // Undo action
                    $('input').value = ls.get('undoData');
                    $('undoButton').style.visibility = 'hidden';
                    calculate();
                    break;

                case 'settingsButton': // Open settings dialog
                    showModal('#dialog-settings');
                    break;
                case 'helpButton': // Open help dialog
                    showModal('#dialog-help');
                    $('searchBox').focus();
                    break;
                case 'aboutButton': // Open app info dialog
                    showModal('#dialog-about');
                    break;
            }
            e.stopPropagation();
        });

        // Output actions
        $('output').addEventListener('click', (e) => {
            switch (e.target.className) {
                case 'plotButton': // Plot function
                    func = e.target.getAttribute('data-func');
                    try {
                        $('plotGridLines').checked = settings.plotGridLines;
                        $('plotTipLines').checked = settings.plotTipLines;
                        $('plotClosed').checked = settings.plotClosed;
                        plot();
                        showModal('#dialog-plot');
                    } catch (error) {
                        showError(error);
                    }
                    break;
                case 'lineError': // Show line error
                    var num = e.target.getAttribute('data-line');
                    var err = e.target.getAttribute('data-error');
                    showError(err, 'Error on Line ' + num);
                    break;
            }
            e.stopPropagation();
        });

        // Dialog button actions
        document.addEventListener('click', (e) => {
            switch (e.target.id) {
                case 'dialog-save-save': // Save calculation
                    var obj = ls.get('saved') || {};
                    var id = moment().format('x');
                    var title = $('saveTitle').value.replace(/<|>/g, '') || 'No title';
                    var data = $('input').value;

                    obj[id] = [title, data];
                    ls.set('saved', obj);
                    UIkit.modal('#dialog-save').hide();
                    showMsg('Saved');
                    break;
                case 'dialog-open-deleteAll': // Delete all saved calculations
                    confirm('All saved calculations will be deleted.', () => {
                        localStorage.removeItem('saved');
                        populateSaved();
                    });
                    break;
                case 'darkModeButton':
                    ls.set('theme', $('darkModeButton').checked ? 'dark' : 'light');
                    ipc.send('darkMode', $('darkModeButton').checked);
                    applyTheme();
                    break;
                case 'dialog-settings-save': // Save settings
                    ls.set('theme', $('darkModeButton').checked ? 'dark' : 'light');
                    ipc.send('darkMode', $('darkModeButton').checked);

                    settings.fontSize = $('fontSize').value;
                    settings.fontWeight = $('fontWeight').value;
                    settings.lineNumbers = $('lineNoButton').checked;
                    settings.lineWrap = $('lineWrapButton').checked;
                    settings.lineErrors = $('lineErrorButton').checked;
                    settings.resizable = $('resizeButton').checked;

                    settings.precision = $('precisionRange').value;
                    settings.dateFormat = $('dateFormat').value;
                    settings.thouSep = $('thouSepButton').checked;
                    settings.autoRates = $('autoRatesButton').checked;

                    ls.set('settings', settings);
                    applySettings();

                    UIkit.modal('#dialog-settings').hide();
                    showMsg('Settings saved');
                    break;
                case 'defaultSettingsButton': // Revert back to default settings
                    confirm('All settings will revert back to defaults.', () => {
                        ls.set('settings', defaultSettings);
                        applySettings();
                        UIkit.modal('#dialog-settings').hide();
                        showMsg('Default settings applied');
                    });
                    break;
                case 'dialog-settings-reset': // Reset app
                    confirm('All user settings and data will be lost.', () => ipc.send('resetApp'));
                    break;
                case 'sizeReset':
                    settings.inputWidth = defaultSettings.inputWidth;
                    $('sizeReset').style.display = 'none';
                    ls.set('settings', settings);
                    applySettings();
                    $('defaultSettingsButton').style.display = JSON.stringify(settings) == JSON.stringify(defaultSettings) ? 'none' : 'block';
                    break;
                case 'updateRatesButton': // Update exchange rates
                    getRates();
                    break;
                    // Plot settings
                case 'plotGridLines':
                    settings.plotGridLines = $('plotGridLines').checked;
                    ls.set('settings', settings);
                    plot();
                    break;
                case 'plotTipLines':
                    settings.plotTipLines = $('plotTipLines').checked;
                    ls.set('settings', settings);
                    plot();
                    break;
                case 'plotClosed':
                    settings.plotClosed = $('plotClosed').checked;
                    ls.set('settings', settings);
                    plot();
                    break;
            }
        });

        // Open saved calculations dialog actions
        $('dialog-open').addEventListener('click', (e) => {
            var pid;
            var saved = ls.get('saved');
            if (e.target.parentNode.getAttribute('data-action') == 'load') {
                pid = e.target.parentNode.parentNode.id;
                ls.set('undoData', $('input').value);
                $('input').value = saved[pid][1];
                calculate();
                $('undoButton').style.visibility = 'visible';
                UIkit.modal('#dialog-open').hide();
            }
            if (e.target.getAttribute('data-action') == 'delete') {
                pid = e.target.parentNode.id;
                confirm('Calculation "' + saved[pid][0] + '" will be deleted.', () => {
                    delete saved[pid];
                    ls.set('saved', saved);
                    populateSaved();
                });
            }
        });

        // Populate saved calculation
        UIkit.util.on('#dialog-open', 'beforeshow', () => populateSaved());

        function populateSaved() {
            var obj = ls.get('saved') || {};
            var savedItems = Object.keys(obj);
            $('dialog-open-body').innerHTML = '';
            if (savedItems.length > 0) {
                $('dialog-open-deleteAll').disabled = false;
                savedItems.map(id => {
                    $('dialog-open-body').innerHTML += (
                        '<div class="dialog-open-wrapper" id="' + id + '">' +
                        '<div data-action="load">' +
                        '<div class="dialog-open-title">' + obj[id][0] + '</div>' +
                        '<div class="dialog-open-date">' + moment(Number(id)).format('lll') + '</div>' +
                        '</div>' +
                        '<div class="dialog-open-delete" data-action="delete">&#10005;</div>' +
                        '</div>'
                    );
                });
            } else {
                $('dialog-open-deleteAll').disabled = true;
                $('dialog-open-body').innerHTML = 'No saved calculations.';
            }
        }

        // Initiate settings dialog
        UIkit.util.on('#setswitch', 'beforeshow', (e) => e.stopPropagation());
        UIkit.util.on('#dialog-settings', 'beforeshow', () => {
            $('darkModeButton').checked = ls.get('theme') == 'dark' ? true : false;
            $('fontSize').value = settings.fontSize;
            $('fontWeight').value = settings.fontWeight;
            $('lineNoButton').checked = settings.lineNumbers;
            $('lineWrapButton').checked = settings.lineWrap;
            $('lineErrorButton').checked = settings.lineErrors;
            $('resizeButton').checked = settings.resizable;
            $('sizeReset').style.display = settings.inputWidth == defaultSettings.inputWidth ? 'none' : 'inline-block';
            $('precisionRange').value = settings.precision;
            $('precision-label').innerHTML = settings.precision;
            $('dateFormat').innerHTML = (
                '<option value="l">' + moment().format('l') + '</option>' +
                '<option value="L">' + moment().format('L') + '</option>' +
                '<option value="MMM DD, YYYY">' + moment().format('MMM DD, YYYY') + '</option>' +
                '<option value="ddd, l">' + moment().format('ddd, l') + '</option>' +
                '<option value="ddd, L">' + moment().format('ddd, L') + '</option>' +
                '<option value="ddd, MMM DD, YYYY">' + moment().format('ddd, MMM DD, YYYY') + '</option>'
            );
            $('dateFormat').value = settings.dateFormat;
            $('thouSepButton').checked = settings.thouSep;
            $('autoRatesButton').checked = settings.autoRates;
            $('defaultSettingsButton').style.display = JSON.stringify(settings) == JSON.stringify(defaultSettings) ? 'none' : 'block';
        });

        $('precisionRange').addEventListener('input', () => $('precision-label').innerHTML = $('precisionRange').value);

        // Help dialog content
        $('searchBox').addEventListener('input', (e) => {
            var str = $('searchBox').value;
            if (str.trim()) {
                try {
                    $('searchResults').innerHTML = '';
                    var res = JSON.stringify(math.help(str).toJSON());
                    var obj = JSON.parse(res);
                    $('searchResults').innerHTML = (
                        '<div>Name:</div><div>' + obj.name + '</div>' +
                        '<div>Description:</div><div>' + obj.description + '</div>' +
                        '<div>Category:</div><div>' + obj.category + '</div>' +
                        '<div>Syntax:</div><div>' + String(obj.syntax).split(',').join(', ') + '</div>' +
                        '<div>Examples:</div><div>' + String(obj.examples).split(',').join(', ') + '</div>' +
                        '<div>Also see:</div><div>' + String(obj.seealso).split(',').join(', ') + '</div>'
                    );
                } catch (error) {
                    $('searchResults').innerHTML = 'No results for "' + str + '"';
                }
            } else {
                $('searchResults').innerHTML = 'Start typing above to search...';
            }
        });

        // About info content
        $('dialog-about-title').innerHTML = appName + ' Calculator';
        $('dialog-about-appVersion').innerHTML = 'Version ' + appVersion;

        // Plot
        var func;
        var activePlot;

        function plot() {
            $('plotTitle').innerHTML = func;

            var f = func.split('=')[1];
            var domain = math.abs(math.evaluate(f, {
                x: 0
            })) * 2;

            if (domain == Infinity || domain == 0) domain = 10;

            var xDomain = activePlot ? activePlot.meta.xScale.domain() : [-domain, domain];
            var yDomain = activePlot ? activePlot.meta.yScale.domain() : [-domain, domain];

            activePlot = functionPlot({
                target: '#plot',
                height: window.innerHeight - 175,
                width: window.innerWidth - 55,
                xAxis: {
                    domain: xDomain
                },
                yAxis: {
                    domain: yDomain
                },
                tip: {
                    xLine: settings.plotTipLines,
                    yLine: settings.plotTipLines,
                },
                grid: settings.plotGridLines,
                data: [{
                    fn: f,
                    graphType: 'polyline',
                    closed: settings.plotClosed
                }],
                plugins: [
                    functionPlot.plugins.zoomBox()
                ]
            });
        }

        UIkit.util.on('#dialog-plot', 'hide', () => activePlot = false);

        // Relayout plot on window resize
        var windowResizeDelay;
        window.addEventListener('resize', () => {
            if (activePlot && document.querySelector('#dialog-plot').classList.contains('uk-open')) plot();
            clearTimeout(windowResizeDelay);
            windowResizeDelay = setTimeout(calculate, 100);
        });

        // Show confirmation dialog
        function confirm(msg, action) {
            $('confirmMsg').innerHTML = msg;
            showModal('#dialog-confirm');
            var yesAction = (e) => {
                action();
                e.stopPropagation();
                UIkit.modal('#dialog-confirm').hide();
                $('confirm-yes').removeEventListener('click', yesAction);
            };
            $('confirm-yes').addEventListener('click', yesAction);
            UIkit.util.on('#dialog-confirm', 'hidden', () => $('confirm-yes').removeEventListener('click', yesAction));
        }

        // Show error dialog
        function showError(e, title) {
            UIkit.util.on('#dialog-error', 'beforeshow', () => {
                $('errTitle').innerHTML = title || 'Error';
                $('errMsg').innerHTML = e;
            });
            showModal('#dialog-error');
        }

        // Show app messages
        function showMsg(msg) {
            $('msg').innerHTML = msg;
            $('msg').style.opacity = '1';
            setTimeout(() => $('msg').style.opacity = '0', 2000);
            setTimeout(() => $('msg').innerHTML = '', 2300);
        }

        /**
         * @fileoverview syncscroll - scroll several areas simultaniously
         * @version 0.0.3
         * 
         * @license MIT, see http://github.com/asvd/intence
         * @copyright 2015 asvd <heliosframework@gmail.com>
         * 
         * Modified by Timur Atalay
         */

        (() => {
            var names = {};
            var scroll = () => {
                var elems = document.getElementsByName('sync');
                var i, j, el, found, name;
                var scrollSync = (el, name) => {
                    el.addEventListener('scroll', el.syn = () => {
                        var elems = names[name];
                        var scrollY = el.scrollTop;
                        var yRate = scrollY / (el.scrollHeight - el.clientHeight);
                        var updateY = scrollY != el.eY;

                        el.eY = scrollY;
                        for (i in elems) {
                            var otherEl = elems[i++];
                            if (otherEl != el) {
                                if (updateY && Math.round(otherEl.scrollTop - (scrollY = otherEl.eY = Math.round(yRate * (otherEl.scrollHeight - otherEl.clientHeight))))) {
                                    otherEl.scrollTop = scrollY;
                                }
                            }
                        }
                    }, 0);
                };

                for (i = 0; i < elems.length;) {
                    found = j = 0;
                    el = elems[i++];
                    if (!(name = el.getAttribute('name'))) continue;

                    el = el.scroller || el;
                    for (j in (names[name] = names[name] || [])) found |= names[name][j++] == el;

                    if (!found) names[name].push(el);

                    el.eX = el.eY = 0;
                    scrollSync(el, name);
                }
            };

            if (document.readyState == 'complete') {
                scroll();
            } else {
                window.addEventListener('load', scroll, 0);
            }
        })();

        // Mousetrap
        var iso = () => document.getElementsByClassName('uk-open').length > 0;
        Mousetrap.bind(['command+d', 'ctrl+d'], () => {
            if (!iso()) $('clearButton').click();
        });
        Mousetrap.bind(['command+p', 'ctrl+p'], () => {
            if (!iso()) $('printButton').click();
        });
        Mousetrap.bind(['command+s', 'ctrl+s'], () => {
            if (!iso()) $('saveButton').click();
        });
        Mousetrap.bind(['command+o', 'ctrl+o'], () => {
            if (!iso()) $('openButton').click();
        });
    });
})();