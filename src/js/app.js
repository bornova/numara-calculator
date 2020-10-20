/**
 * @copyright 2020 Timur Atalay 
 * @homepage https://github.com/bornova/numara
 * @license MIT https://github.com/bornova/numara/blob/master/LICENSE
 */

var numara = (() => {
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

    // Codemirror autocomplete hints
    var hints = ['ans', 'now', 'today', 'total', 'subtotal', 'avg'];
    Object.getOwnPropertyNames(math).forEach((f) => {
        if (typeof math[f] === 'function' && Object.getOwnPropertyNames(math[f]).includes('signatures')) {
            hints.push(f);
        }
    });

    CodeMirror.registerHelper('hint', 'numaraHints', (editor) => {
        var cur = editor.getCursor();
        var curLine = editor.getLine(cur.line);
        var start = cur.ch;
        var end = start;
        while (end < curLine.length && /[\w$]/.test(curLine.charAt(end))) ++end;
        while (start && /[\w$]/.test(curLine.charAt(start - 1))) --start;
        var curWord = start !== end && curLine.slice(start, end);
        var regex = new RegExp('^' + curWord, 'i');
        return {
            list: (!curWord ? [] : hints.filter((item) => item.match(regex))).sort(),
            from: CodeMirror.Pos(cur.line, start),
            to: CodeMirror.Pos(cur.line, end)
        };
    });

    CodeMirror.commands.autocomplete = (cm) => {
        CodeMirror.showHint(cm, CodeMirror.hint.numaraHints, {
            completeSingle: false
        });
    };

    // User agent
    var isWin = navigator.userAgent.toLowerCase().includes('win');
    var isNode = navigator.userAgent.toLowerCase().includes('electron');

    var ipc = isNode ? require('electron').ipcRenderer : null;


    if (!isNode) {
        $('mobile').setAttribute('href', 'css/mobile.css');
    }

    // Set app info
    document.title = appName + ' Calculator';
    $('dialog-about-title').innerHTML = appName + ' Calculator';
    $('dialog-about-appVersion').innerHTML = isNode ? 'Version ' + appVersion :
        `Version ${appVersion}
        <div class="versionCtnr">
            <div>Desktop version:</div>
            <div><a href="https://numara.io/releases/win/Numara Setup ${appVersion}.exe">Windows</a></div>
            <div><a href="https://numara.io/releases/mac/Numara-${appVersion}.dmg">MacOS</a></div>
        </div>`;

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

    // Calculate answers
    function calculate() {
        var solve = math.evaluate;
        var answers = [];
        var avgs = [];
        var totals = [];
        var subtotals = [];
        var scope = {};
        var solverScope = {};
        var expLim = {
            lowerExp: -12,
            upperExp: 12
        };
        var digits = {
            maximumFractionDigits: settings.app.precision
        };

        $('mirror').style.width = document.getElementsByClassName('CodeMirror-line')[0].clientWidth - 8 + 'px';

        scope.now = moment().format((settings.app.dateDay ? 'ddd, ' : '') + settings.app.dateFormat + ' ' + settings.app.timeFormat);
        scope.today = moment().format((settings.app.dateDay ? 'ddd, ' : '') + settings.app.dateFormat);

        cm.eachLine((line) => {
            var answer = '';
            var lineNo = cm.getLineNumber(line) + 1;
            var mirrorLine = line.text;

            setLineNo(lineNo);

            line = line.text.trim().split('//')[0].split('#')[0];

            if (line) {
                try {
                    line = lineNo > 1 && line.charAt(0).match(/[\+\-\*\/]/) && cm.getLine(lineNo - 2).length > 0 ? scope.ans + line : line;

                    try {
                        answer = solve(line, scope);
                    } catch (e) {
                        while (line.match(/\([^\)]+\)/)) {
                            var s = line.substring(line.lastIndexOf('(') + 1);
                            var sp = line.substring(line.lastIndexOf('('));

                            s = s.substring(0, s.indexOf(')'));
                            sp = sp.substring(0, sp.indexOf(')') + 1);
                            if (sp.length === 0) break;

                            try {
                                line = line.replace(sp, solver(s));
                            } catch (e) {
                                break;
                            }
                        }
                        answer = solver(line);
                    }

                    if (answer !== undefined) {
                        scope.ans = scope['line' + lineNo] = answer;

                        if (!isNaN(answer)) {
                            avgs.push(answer);
                            totals.push(answer);
                            subtotals.push(answer);
                        }

                        answer = format(math.format(answer, expLim));

                        if (answer.match(/\w\(x\)/)) {
                            answer = `<a class="plotButton" data-func="${line}">Plot</a>`;
                            scope.ans = scope['line' + lineNo] = line.split('=')[1].trim();
                        }
                    } else {
                        subtotals.length = 0;
                    }
                } catch (e) {
                    var errStr = String(e).replace(/'|"/g, '`');
                    answer = settings.app.lineErrors ? `<a class="lineError" data-line="${lineNo}" data-error="${errStr}">Err</a>` : '';
                    setLineNo(lineNo, true);
                }
            } else {
                subtotals.length = 0;
            }

            var br = '';
            if (settings.app.lineWrap) {
                $('mirror').innerHTML = mirrorLine;
                var h = $('mirror').offsetHeight;
                var lh = getComputedStyle($('mirror')).lineHeight.split('px')[0];
                br = h > lh ? '<span></span>'.repeat((h / lh) - 1) : '';
            }

            answers += '<span>' + answer + '</span>' + br;
        });

        $('output').innerHTML = answers;

        $('clearButton').className = cm.getValue() == '' ? 'noAction' : 'action';
        $('printButton').className = cm.getValue() == '' ? 'noAction' : 'action';
        $('saveButton').className = cm.getValue() == '' ? 'noAction' : 'action';

        ls.set('input', cm.getValue());

        function format(answer) {
            answer = String(answer);
            var a = answer.trim().split(' ')[0];
            var b = answer.replace(a, '');
            formattedAnswer = !a.includes('e') && !isNaN(a) ?
                settings.app.thouSep ? Number(a).toLocaleString(undefined, digits) + b : parseFloat(Number(a).toFixed(settings.app.precision)) + b :
                a.match(/e-?\d+/) ? parseFloat(Number(a.split('e')[0]).toFixed(settings.app.precision)) + 'e' + answer.split('e')[1] + b :
                strip(answer);
            return formattedAnswer;
        }

        function setLineNo(lineNo, isErr) {
            if (settings.app.lineNumbers) {
                var ln = document.createElement("div");
                ln.classList.add('CodeMirror-linenumber');
                ln.classList.add(isErr ? 'lineErrorNo' : null);
                ln.innerHTML = lineNo;
                cm.setGutterMarker(lineNo - 1, 'CodeMirror-linenumbers', ln);
            }
        }

        function solver(line) {
            solverScope.avg = solve(avgs.length > 0 ? '(' + math.mean(avgs) + ')' : 0);
            solverScope.total = solve(totals.length > 0 ? '(' + totals.join('+') + ')' : 0);
            solverScope.subtotal = solve(subtotals.length > 0 ? '(' + subtotals.join('+') + ')' : 0);

            line = line.replace(/\bans\b/g, scope.ans)
                .replace(/\bnow\b/g, scope.now)
                .replace(/\btoday\b/g, scope.today)
                .replace(/\bavg\b/g, solverScope.avg)
                .replace(/\btotal\b/g, solverScope.total)
                .replace(/\bsubtotal\b/g, solverScope.subtotal);

            var lineNoReg = line.match(/\bline\d+\b/g);
            if (lineNoReg) lineNoReg.map((n) => line = line.replace(n, scope[n]));

            var dateTimeReg = new RegExp('millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia');
            if (line.match(dateTimeReg)) {
                var lineDate = line.split(/[\+\-]/)[0].trim();
                var d = moment(lineDate, settings.app.dateFormat, true);
                var t = moment(lineDate, settings.app.dateFormat + ' ' + settings.app.timeFormat, true);
                var dt = d.isValid() ? d : t.isValid() ? t : undefined;
                var rightOfDate = String(solve(line.replace(lineDate, '') + ' to hours', scope));
                var durNum = Number(rightOfDate.split(' ')[0]);
                var durUnit = rightOfDate.split(' ')[1];

                line = '"' + dt.add(durNum, durUnit).format((settings.app.dateDay ? 'ddd, ' : '') + settings.app.dateFormat + ' ' + settings.app.timeFormat) + '"';
            }

            var modReg = /\d*\.?\d%\d*\.?\d/g;
            var pcntReg = /[\w.]*%/g;
            var pcntOfReg = /%[ ]*of[ ]*/g;
            var pcntOfRegC = /[\w.]*%[ ]*of[ ]*/g;

            line = line.match(pcntOfRegC) ? line.replace(pcntOfReg, '/100*') : line;

            if (line.match(modReg)) line.match(modReg).map((m) => line = line.replace(m, solve(m, scope)));

            while (line.match(pcntReg) && !line.match(modReg)) {
                var right = line.match(pcntReg)[0];
                var rightVal = solve(right.slice(0, -1), scope);
                var left = line.split(right)[0];
                var leftVal = solve(left.trim().slice(0, -1), scope);

                newval = solve(leftVal + '*' + rightVal + '/100', scope);
                line = line.replace(left + right, solve(left + newval, scope));
            }

            return solve(line, scope);
        }

        function strip(s) {
            var t = s.length;
            if (s.charAt(0) === '"') s = s.substring(1, t--);
            if (s.charAt(--t) === '"') s = s.substring(0, t);
            return s;
        }
    }

    // App settings
    const defaultSettings = {
        app: {
            autocomplete: true,
            closeBrackets: true,
            currencies: true,
            dateDay: false,
            dateFormat: 'M/D/YYYY',
            divider: true,
            fontSize: '1.1rem',
            fontWeight: '400',
            functionTips: true,
            lineErrors: true,
            lineNumbers: true,
            lineWrap: true,
            matchBrackets: true,
            matrixType: 'Matrix',
            numericOutput: 'number',
            precision: '4',
            predictable: false,
            syntax: true,
            theme: 'system',
            thouSep: true,
            timeFormat: 'h:mm A'
        },
        inputWidth: 60,
        plot: {
            plotArea: false,
            plotCross: false,
            plotGrid: false
        }
    };
    Object.freeze(defaultSettings);

    // Initiate app settings and theme
    var settings;
    var initSettings = ls.get('settings');

    if (!initSettings) {
        ls.set('settings', defaultSettings);
    } else {
        // Check for and apply default settings changes
        DeepDiff.observableDiff(initSettings, defaultSettings, (d) => {
            if (d.kind !== 'E') {
                DeepDiff.applyChange(initSettings, defaultSettings, d);
                ls.set('settings', initSettings);
            }
        });
    }

    // Apply settings
    function applySettings() {
        settings = ls.get('settings');

        $('style').setAttribute('href',
            settings.app.theme == 'system' ? (isNode ? (ipc.sendSync('isDark') ? 'css/dark.css' : 'css/light.css') : 'css/light.css') :
            settings.app.theme == 'light' ? 'css/light.css' : 'css/dark.css');

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
        cm.setOption('autoCloseBrackets', settings.app.closeBrackets);
        cm.setOption('matchBrackets', settings.app.syntax && settings.app.matchBrackets ? {
            'maxScanLines': 1
        } : false);
        cm.focus();

        math.config({
            matrix: settings.app.matrixType,
            number: settings.app.numericOutput,
            predictable: settings.app.predictable
        });

        calculate();
    }

    // Prep input
    cm.setValue(ls.get('input') || '');
    cm.on('change', () => {
        calculate();
        cm.scrollIntoView(cm.getCursor());
    });
    cm.on("inputRead", (cm, event) => {
        if (settings.app.autocomplete) CodeMirror.commands.autocomplete(cm);
    });
    cm.on('update', () => {
        var funcs = document.getElementsByClassName('cm-function');
        if (funcs.length > 0 && settings.app.functionTips) {
            for (var f of funcs) {
                try {
                    var res = JSON.stringify(math.help(f.innerHTML).toJSON());
                    var obj = JSON.parse(res);
                    UIkit.tooltip(f, {
                        title: obj.description,
                        pos: 'top-left'
                    });
                } catch (e) {
                    UIkit.tooltip(f, {
                        title: 'Description not available.',
                        pos: 'top-left'
                    });
                }
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
                .then((rates) => rates.json())
                .then((data) => {
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
        Object.keys(data).map((currency) => {
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
    UIkit.util.on('.uk-switcher', 'show', () => cm.getInputField().blur());

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

    $('output').addEventListener('mousedown', () => {
        var sels = document.getElementsByClassName('CodeMirror-selected');
        while (sels[0]) {
            sels[0].classList.remove('CodeMirror-selected');
        }
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

                $('matchBracketsButton').disabled = $('syntaxButton').checked ? false : true;
                $('matchBracketsButton').parentNode.style.opacity = $('syntaxButton').checked ? '1' : '0.5';
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
                // Appearance
                settings.app.theme = $('themeList').value;
                settings.app.fontSize = $('fontSize').value;
                settings.app.fontWeight = $('fontWeight').value;
                settings.app.dateFormat = $('dateFormat').value;
                settings.app.timeFormat = $('timeFormat').value;
                settings.app.dateDay = $('dateDay').checked;
                // Calculator
                settings.app.precision = $('precisionRange').value;
                settings.app.matrixType = $('matrixType').value;
                settings.app.numericOutput = $('numericOutput').value;
                settings.app.predictable = $('predictableButton').checked;
                settings.app.thouSep = $('thouSepButton').checked;
                if (!settings.app.currencies && $('currencyButton').checked) {
                    getRates();
                } else if (!$('currencyButton').checked) {
                    localStorage.removeItem('rates');
                    localStorage.removeItem('rateDate');
                }
                settings.app.currencies = $('currencyButton').checked;
                // Panel UI
                settings.app.syntax = $('syntaxButton').checked;
                settings.app.functionTips = $('functionTipsButton').checked;
                settings.app.matchBrackets = $('matchBracketsButton').checked;
                settings.app.autocomplete = $('autocompleteButton').checked;
                settings.app.closeBrackets = $('closeBracketsButton').checked;
                settings.app.lineNumbers = $('lineNoButton').checked;
                settings.app.lineErrors = $('lineErrorButton').checked;
                settings.app.divider = $('dividerButton').checked;
                settings.app.lineWrap = $('lineWrapButton').checked;

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

            case 'restartButton': // Restart to update
                ipc.send('updateApp');
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
        // Appearance
        var dateFormats = ['M/D/YYYY', 'D/M/YYYY', 'MMM DD, YYYY'];
        var timeFormats = ['h:mm A', 'H:mm'];
        var matrixTypes = ['Matrix', 'Array'];
        var numericOutputs = ['number', 'BigNumber', 'Fraction'];

        $('themeList').value = settings.app.theme;
        $('fontSize').value = settings.app.fontSize;
        $('fontWeight').value = settings.app.fontWeight;
        $('dateFormat').innerHTML = '';
        for (var d of dateFormats) $('dateFormat').innerHTML += `<option value="${d}">${moment().format(d)}</option>`;
        $('dateFormat').value = settings.app.dateFormat;
        $('timeFormat').innerHTML = '';
        for (var t of timeFormats) $('timeFormat').innerHTML += `<option value="${t}">${moment().format(t)}</option>`;
        $('timeFormat').value = settings.app.timeFormat;
        $('dateDay').checked = settings.app.dateDay;
        // Calculator
        $('precisionRange').value = settings.app.precision;
        $('precision-label').innerHTML = settings.app.precision;
        $('matrixType').innerHTML = '';
        for (var m of matrixTypes) $('matrixType').innerHTML += `<option value="${m}">${m}</option>`;
        $('matrixType').value = settings.app.matrixType;
        $('numericOutput').innerHTML = '';
        for (var n of numericOutputs) $('numericOutput').innerHTML += `<option value="${n}">${n.charAt(0).toUpperCase() + n.slice(1)}</option>`;
        $('numericOutput').value = settings.app.numericOutput;
        if (settings.app.numericOutput == 'BigNumber') bigNumberWarning();
        $('predictableButton').checked = settings.app.predictable;
        $('thouSepButton').checked = settings.app.thouSep;
        $('currencyButton').checked = settings.app.currencies;
        $('lastUpdated').innerHTML = settings.app.currencies ? ls.get('rateDate') : '';
        $('currencyUpdate').style.display = settings.app.currencies ? 'block' : 'none';
        // Panel UI
        $('syntaxButton').checked = settings.app.syntax;
        $('functionTipsButton').checked = settings.app.functionTips;
        $('matchBracketsButton').checked = settings.app.matchBrackets;
        $('autocompleteButton').checked = settings.app.autocomplete;
        $('closeBracketsButton').checked = settings.app.closeBrackets;
        $('lineNoButton').checked = settings.app.lineNumbers;
        $('lineErrorButton').checked = settings.app.lineErrors;
        $('dividerButton').checked = settings.app.divider;
        $('lineWrapButton').checked = settings.app.lineWrap;

        $('defaultSettingsButton').style.display = JSON.stringify(settings.app) === JSON.stringify(defaultSettings.app) ? 'none' : 'inline-block';
    });

    function bigNumberWarning() {
        $('bigNumWarn').style.display = $('numericOutput').value == 'BigNumber' ? 'inline-block' : 'none';
    }

    $('numericOutput').addEventListener('change', bigNumberWarning);
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

    // Check for updates
    if (isNode) {
        ipc.send('checkUpdate');
        ipc.on('notifyUpdate', (event) => notify(`A new version is available. <a onclick="document.getElementById('aboutButton').click();">Info</a>`));
        ipc.on('updateStatus', (event, status) => {
            if (status == 'ready') {
                $('dialog-about-updateStatus').innerHTML = 'Restart Numara to finish updating.';
                $('restartButton').style.display = 'inline-block';
            } else {
                $('dialog-about-updateStatus').innerHTML = status;
            }
        });
    }
})();