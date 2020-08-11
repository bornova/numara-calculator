/**
 * @copyright 2020 Timur Atalay 
 * @homepage https://github.com/bornova/numara
 * @license MIT https://github.com/bornova/numara/blob/master/LICENSE
 */

// Get element by id
const $ = (id) => document.getElementById(id);

// localStorage
const ls = {
    get: (key) => JSON.parse(localStorage.getItem(key)),
    set: (key, value) => localStorage.setItem(key, JSON.stringify(value))
};

// Codemirror
CodeMirror.defineMode('numara', () => {
    return {
        token: (stream, state) => {
            if (stream.match(/\/\/.*/) || stream.match(/#.*/)) return 'comment';
            if (stream.match(/\d/)) return 'number';
            if (stream.match(/(?:\+|\-|\*|\/|,|;|\.|:|@|~|=|>|<|&|\||_|`|'|\^|\?|!|%)/)) return 'operator';

            stream.eatWhile(/\w/);
            var str = stream.current();
            try {
                if (math.unit(str).units.length > 0) return 'unit';
            } catch (e) {}

            if (typeof math[str] === 'function' && Object.getOwnPropertyNames(math[str]).includes('signatures')) return 'function';
            if (str.match(/\b(?:ans|total|subtotal|avg|today|now|line\d+)\b/)) return 'scope';
            stream.next();
            return 'text';
        }
    };
});

CodeMirror.defineMode('plain', () => {
    return {
        token: (stream, state) => {
            stream.next();
            return 'text';
        }
    };
});

var cm = CodeMirror.fromTextArea($('inputArea'), {
    coverGutterNextToScrollbar: true
});

(() => {
    // User agent
    var isWin = navigator.userAgent.toLowerCase().includes('win');
    var isNode = navigator.userAgent.toLowerCase().includes('electron');

    var ipc = isNode ? require('electron').ipcRenderer : null;
    var appName = isNode ? ipc.sendSync('getName') : 'Numara';
    var appVersion = isNode ? ipc.sendSync('getVersion') : ' - Web';

    // Set app info
    document.title = appName;
    $('dialog-about-title').innerHTML = appName + ' Calculator';
    $('dialog-about-appVersion').innerHTML = 'Version ' + appVersion;

    // Set headers
    if (isNode && isWin) {
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

    feather.replace();

    // Sync scroll
    var inputScroll = false;
    var outputScroll = false;
    var leftSide = document.getElementsByClassName('CodeMirror-scroll')[0];
    var rightSide = $('output');

    leftSide.addEventListener('scroll', () => {
        if (!inputScroll) {
            outputScroll = true;
            rightSide.scrollTop = leftSide.scrollTop;
        }
        inputScroll = false;
    });

    rightSide.addEventListener('scroll', () => {
        if (!outputScroll) {
            inputScroll = true;
            leftSide.scrollTop = rightSide.scrollTop;
        }
        outputScroll = false;
    });

    // App settings
    const defaultSettings = {
        app: {
            bigNumber: false,
            currencies: true,
            dateFormat: 'l',
            divider: true,
            fontSize: '1.1rem',
            fontWeight: '400',
            functionTips: true,
            lineErrors: true,
            lineNumbers: true,
            lineWrap: true,
            precision: '4',
            syntax: true,
            theme: 'system',
            thouSep: true
        },
        dateFormats: ['l', 'L', 'MMM DD, YYYY', 'ddd, l', 'ddd, L', 'ddd, MMM DD, YYYY'],
        inputWidth: 60,
        plot: {
            plotArea: false,
            plotGrid: false,
            plotCross: false
        },
        version: '2.0'
    };
    Object.freeze(defaultSettings);

    // Initiate app settings and theme
    var settings;
    if (!ls.get('settings') || ls.get('settings').version !== defaultSettings.version) ls.set('settings', defaultSettings);

    function applySettings() {
        settings = ls.get('settings');

        $('style').setAttribute('href',
            settings.app.theme == 'system' ? (isNode ? (ipc.sendSync('isDark') ? 'dark.css' : 'light.css') : 'light.css') :
            settings.app.theme == 'light' ? 'light.css' : 'dark.css');

        if (isNode) ipc.send('setTheme', settings.app.theme);

        var elements = document.querySelectorAll('.panelFont, .CodeMirror');
        for (var el of elements) {
            el.style.fontSize = settings.app.fontSize;
            el.style.fontWeight = settings.app.fontWeight;
        }

        $('input').style.width = (settings.app.divider ? settings.inputWidth : defaultSettings.inputWidth) + '%';
        $('handle').style.display = settings.app.divider ? 'block' : 'none';
        $('output').style.textAlign = settings.app.divider ? 'left' : 'right';

        cm.setOption('mode', settings.app.syntax ? 'numara' : 'plain');
        cm.setOption('lineNumbers', settings.app.lineNumbers);
        cm.setOption('lineWrapping', settings.app.lineWrap);
        cm.focus();

        math.config({
            number: settings.app.bigNumber ? 'BigNumber' : 'number'
        });

        calculate();
    }

    // Prep input
    cm.setValue(ls.get('input') || '');
    cm.on('change', () => {
        calculate();
        cm.scrollIntoView(cm.getCursor());
    });
    cm.on('update', () => {
        var funcs = document.getElementsByClassName('cm-function');
        if (funcs.length > 0 && settings.app.functionTips) {
            for (var e of funcs) {
                var res = JSON.stringify(math.help(e.innerHTML).toJSON());
                var obj = JSON.parse(res);
                UIkit.tooltip(e, {
                    title: obj.description,
                    pos: 'top-left'
                });
            }
        }
    });

    // Apply settings
    applySettings();
    if (isNode) ipc.on('themeUpdate', () => applySettings());
    cm.execCommand('goDocEnd');

    // Exchange rates
    math.createUnit('USD', {
        aliases: ['usd']
    });
    if (settings.app.currencies) getRates();

    function getRates() {
        var url = 'https://www.floatrates.com/widget/1030/cfc5515dfc13ada8d7b0e50b8143d55f/usd.json';
        if (navigator.onLine) {
            fetch(url)
                .then(rates => rates.json())
                .then(data => {
                    ls.set('rates', data);
                    createRateUnits();
                    $('lastUpdated').innerHTML = ls.get('rateDate');
                    cm.setOption('mode', settings.app.syntax ? 'numara' : 'plain');
                    cm.focus();
                }).catch((e) => notify('Failed to get exchange rates (' + e + ')', 'warning'));
        } else {
            notify('No internet connection. Could not update exchange rates.', 'warning');
        }
    }

    function createRateUnits() {
        var data = ls.get('rates');
        var dups = ['cup'];
        Object.keys(data).map(currency => {
            math.createUnit(data[currency].code, {
                definition: math.unit(data[currency].inverseRate + 'USD'),
                aliases: [dups.includes(data[currency].code.toLowerCase()) ? '' : data[currency].code.toLowerCase()]
            }, {
                override: true
            });
            ls.set('rateDate', data[currency].date);
        });
        calculate();
    }

    // Tooltip defaults
    UIkit.mixin({
        data: {
            delay: 300,
            offset: 8
        }
    }, 'tooltip');

    // Show modal dialog
    function showModal(id) {
        UIkit.modal(id, {
            bgClose: false,
            stack: true
        }).show();
    }

    UIkit.util.on('.modal', 'hidden', () => cm.focus());

    // Update open button count
    var savedCount = () => Object.keys(ls.get('saved') || {}).length;
    var updateSavedCount = () => UIkit.tooltip('#openButton', {
        title: 'Open (' + savedCount() + ')'
    });
    updateSavedCount();
    $('openButton').className = savedCount() > 0 ? 'action' : 'noAction';

    // App button actions
    $('actions').addEventListener('click', (e) => {
        switch (e.target.id) {
            case 'clearButton': // Clear board
                if (cm.getValue() != '') {
                    cm.setValue('');
                    cm.focus();
                    calculate();
                }
                break;
            case 'printButton': // Print calculations
                UIkit.tooltip('#printButton').hide();
                if (cm.getValue() != '') {
                    $('print-title').innerHTML = appName;
                    $('printBox').innerHTML = $('panel').innerHTML;
                    if (isNode) {
                        ipc.send('print');
                        ipc.once('printReply', (event, response) => {
                            if (response) notify(response);
                            $('printBox').innerHTML = '';
                        });
                    } else {
                        window.print();
                    }
                }
                break;
            case 'saveButton': // Save calcualtions
                if (cm.getValue() != '') {
                    $('saveTitle').value = '';
                    showModal('#dialog-save');
                    $('saveTitle').focus();
                }
                break;
            case 'openButton': // Open saved calculations
                if (Object.keys(ls.get('saved') || {}).length > 0) showModal('#dialog-open');
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
                    $('plotGrid').checked = settings.plot.plotGrid;
                    $('plotCross').checked = settings.plot.plotCross;
                    $('plotArea').checked = settings.plot.plotArea;
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
                var id = moment().format('x');
                var obj = ls.get('saved') || {};
                var data = cm.getValue();
                var title = $('saveTitle').value.replace(/<|>/g, '').trim() || 'No title';

                obj[id] = [title, data];
                ls.set('saved', obj);
                UIkit.modal('#dialog-save').hide();
                $('openButton').className = 'action';
                updateSavedCount();
                notify('Saved');
                break;
            case 'dialog-open-deleteAll': // Delete all saved calculations
                confirm('All saved calculations will be deleted.', () => {
                    localStorage.removeItem('saved');
                    populateSaved();
                    UIkit.modal('#dialog-open').hide();
                    notify('Deleted all saved calculations');
                });
                break;
            case 'defaultSettingsButton': // Revert back to default settings
                confirm('All settings will revert back to defaults.', () => {
                    settings.app = defaultSettings.app;
                    ls.set('settings', settings);
                    applySettings();
                    if (!$('currencyButton').checked) getRates();
                    UIkit.modal('#dialog-settings').hide();
                    notify('Default settings applied');
                });
                break;
            case 'dialog-settings-reset': // Reset app
                confirm('All user settings and data will be lost.', () => {
                    if (isNode) {
                        ipc.send('resetApp');
                    } else {
                        localStorage.clear();
                        location.reload();
                    }
                });
                break;
            case 'syntaxButton':
                $('functionTipsButton').disabled = $('syntaxButton').checked ? false : true;
                $('functionTipsButton').parentNode.style.opacity = $('syntaxButton').checked ? '1' : '0.5';
                break;
            case 'bigNumWarn': // BigNumber warning
                showError(`Using the BigNumber option will disable function plotting and is not compatible with some math functions. 
                    It may also cause unexpected behavior and affect overall performance.<br><br>
                    <a target="_blank" href="https://mathjs.org/docs/datatypes/bignumbers.html">Read more on BigNumbers</a>`,
                    'Caution: BigNumber Limitations');
                break;
            case 'currencyButton': // Enable currency rates
                if (settings.app.currencies) {
                    $('currencyUpdate').style.display = settings.app.currencies ? $('currencyButton').checked ? 'block' : 'none' : null;
                }
                break;
            case 'dialog-settings-save': // Save settings
                settings.app.theme = $('themeList').value;
                settings.app.syntax = $('syntaxButton').checked;
                settings.app.fontSize = $('fontSize').value;
                settings.app.fontWeight = $('fontWeight').value;
                settings.app.functionTips = $('functionTipsButton').checked;
                settings.app.lineNumbers = $('lineNoButton').checked;
                settings.app.lineWrap = $('lineWrapButton').checked;
                settings.app.lineErrors = $('lineErrorButton').checked;
                settings.app.divider = $('dividerButton').checked;
                settings.app.precision = $('precisionRange').value;
                settings.app.bigNumber = $('bigNumberButton').checked;
                settings.app.dateFormat = $('dateFormat').value;
                settings.app.thouSep = $('thouSepButton').checked;
                if (!settings.app.currencies && $('currencyButton').checked) {
                    getRates();
                } else if (!$('currencyButton').checked) {
                    localStorage.removeItem('rates');
                    localStorage.removeItem('rateDate');
                }
                settings.app.currencies = $('currencyButton').checked;

                ls.set('settings', settings);
                applySettings();

                UIkit.modal('#dialog-settings').hide();
                notify('Settings saved');
                break;

                // Plot settings
            case 'plotGrid':
                settings.plot.plotGrid = $('plotGrid').checked;
                ls.set('settings', settings);
                plot();
                break;
            case 'plotCross':
                settings.plot.plotCross = $('plotCross').checked;
                ls.set('settings', settings);
                plot();
                break;
            case 'plotArea':
                settings.plot.plotArea = $('plotArea').checked;
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
            cm.setValue(saved[pid][1]);
            calculate();
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
        var savedItems = Object.entries(obj);
        $('dialog-open-body').innerHTML = '';
        if (savedItems.length > 0) {
            $('dialog-open-deleteAll').disabled = false;
            savedItems.map(([id, val]) => {
                $('dialog-open-body').innerHTML += `
                    <div class="dialog-open-wrapper" id="${id}">
                        <div data-action="load">
                            <div class="dialog-open-title">${val[0]}</div>
                            <div class="dialog-open-date">${moment(Number(id)).format('lll')}</div>
                        </div>
                        <div class="dialog-open-delete" data-action="delete">&#10005;</div>
                    </div>
                    `;
            });
        } else {
            $('dialog-open-deleteAll').disabled = true;
            $('dialog-open-body').innerHTML = 'No saved calculations.';
            $('openButton').className = 'noAction';
        }
        updateSavedCount();
    }

    // Initiate settings dialog
    UIkit.util.on('#setswitch', 'beforeshow', (e) => e.stopPropagation());
    UIkit.util.on('#dialog-settings', 'beforeshow', () => {
        $('themeList').value = settings.app.theme;
        $('fontSize').value = settings.app.fontSize;
        $('fontWeight').value = settings.app.fontWeight;
        $('syntaxButton').checked = settings.app.syntax;
        $('lineNoButton').checked = settings.app.lineNumbers;
        $('lineWrapButton').checked = settings.app.lineWrap;
        $('lineErrorButton').checked = settings.app.lineErrors;
        $('functionTipsButton').checked = settings.app.functionTips;
        $('functionTipsButton').disabled = settings.app.syntax ? false : true;
        $('functionTipsButton').parentNode.style.opacity = settings.app.syntax ? '1' : '0.5';
        $('dividerButton').checked = settings.app.divider;
        $('precisionRange').value = settings.app.precision;
        $('precision-label').innerHTML = settings.app.precision;
        $('dateFormat').innerHTML = '';
        for (var d of settings.dateFormats) {
            $('dateFormat').innerHTML += `<option value=${d}>${moment().format(d)}</option>`;
        }
        $('dateFormat').value = settings.app.dateFormat;
        $('bigNumberButton').checked = settings.app.bigNumber;
        $('thouSepButton').checked = settings.app.thouSep;
        $('currencyButton').checked = settings.app.currencies;
        $('lastUpdated').innerHTML = settings.app.currencies ? ls.get('rateDate') : '';
        $('currencyUpdate').style.display = settings.app.currencies ? 'block' : 'none';
        $('defaultSettingsButton').style.display = JSON.stringify(settings.app) === JSON.stringify(defaultSettings.app) ? 'none' : 'inline-block';
    });

    $('precisionRange').addEventListener('input', () => $('precision-label').innerHTML = $('precisionRange').value);

    // Help dialog content
    $('searchBox').addEventListener('input', () => {
        var str = $('searchBox').value.trim();
        if (str) {
            try {
                $('searchResults').innerHTML = '';
                var res = JSON.stringify(math.help(str).toJSON());
                var obj = JSON.parse(res);
                $('searchResults').innerHTML = `
                    <div>Name:</div><div>${obj.name}</div>
                    <div>Description:</div><div>${obj.description}</div>
                    <div>Category:</div><div>${obj.category}</div>
                    <div>Syntax:</div><div>${String(obj.syntax).split(',').join(', ')}</div>
                    <div>Examples:</div><div>${String(obj.examples).split(',').join(', ')}</div>
                    <div>Also see:</div><div>${String(obj.seealso).split(',').join(', ')}</div>
                    `;
            } catch (error) {
                $('searchResults').innerHTML = `No results for "${str}"`;
            }
        } else {
            $('searchResults').innerHTML = 'Start typing above to search...';
        }
    });

    // Panel resizer
    var resizeDelay;
    var isResizing = false;
    var panel = $('panel');
    var handle = $('handle');

    $('handle').addEventListener('dblclick', resetHandle);
    $('handle').addEventListener('mousedown', (e) => isResizing = e.target == handle);
    $('panel').addEventListener('mouseup', () => isResizing = false);
    $('panel').addEventListener('mousemove', (e) => {
        var offset = settings.app.lineNumbers ? 12 : 27;
        var pointerRelativeXpos = e.clientX - panel.offsetLeft - offset;
        var iWidth = pointerRelativeXpos / panel.clientWidth * 100;
        var inputWidth = iWidth < 0 ? 0 : iWidth > 100 ? 100 : iWidth;
        if (isResizing) {
            $('input').style.width = inputWidth + '%';
            settings.inputWidth = inputWidth;
            ls.set('settings', settings);
            clearTimeout(resizeDelay);
            resizeDelay = setTimeout(() => {
                calculate();
                cm.refresh();
            }, 10);
        }
    });

    function resetHandle() {
        settings.inputWidth = defaultSettings.inputWidth;
        ls.set('settings', settings);
        applySettings();
    }

    // Plot
    var func;
    var activePlot;
    var functionPlot = window.functionPlot;

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
                xLine: settings.plot.plotCross,
                yLine: settings.plot.plotCross,
            },
            grid: settings.plot.plotGrid,
            data: [{
                fn: f,
                graphType: 'polyline',
                closed: settings.plot.plotArea
            }],
            plugins: [functionPlot.plugins.zoomBox()]
        });
    }

    UIkit.util.on('#dialog-plot', 'hide', () => activePlot = false);

    // Relayout plot on window resize
    var windowResizeDelay;
    window.addEventListener('resize', () => {
        if (activePlot && document.querySelector('#dialog-plot').classList.contains('uk-open')) plot();
        clearTimeout(windowResizeDelay);
        windowResizeDelay = setTimeout(() => {
            calculate();
            cm.refresh();
        }, 10);
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
    function notify(msg, stat) {
        UIkit.notification({
            message: msg,
            status: stat || 'primary',
            pos: 'bottom-center',
            timeout: 3000
        });
    }

    // Mousetrap
    var traps = {
        clearButton: ['command+d', 'ctrl+d'],
        printButton: ['command+p', 'ctrl+p'],
        saveButton: ['command+s', 'ctrl+s'],
        openButton: ['command+o', 'ctrl+o']
    };
    Object.entries(traps).map(([b, c]) => {
        Mousetrap.bindGlobal(c, (e) => {
            e.preventDefault();
            if (document.getElementsByClassName('uk-open').length === 0) $(b).click();
        });
    });
})();