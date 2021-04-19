const solve = math.evaluate;

function calculate() {
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

    scope.now = DateTime.local().toFormat((settings.app.dateDay ? 'ccc, ' : '') + settings.app.dateFormat + ' ' + settings.app.timeFormat);
    scope.today = DateTime.local().toFormat((settings.app.dateDay ? 'ccc, ' : '') + settings.app.dateFormat);

    cm.refresh();
    cm.eachLine((line) => {
        var cmLine = line.text.trim().split('//')[0].split('#')[0];
        var cmLineNo = cm.getLineNumber(line);
        var lineNo = cmLineNo + 1;
        var lineHeight = line.height;
        var answer = '';

        cm.removeLineClass(cmLineNo, 'gutter', 'lineError');

        if (cmLine) {
            try {
                cmLine = lineNo > 1 && cmLine.charAt(0).match(/[\+\-\*\/]/) && cm.getLine(lineNo - 2).length > 0 ? scope.ans + cmLine : cmLine;

                try {
                    answer = solve(cmLine, scope);
                } catch (e) {
                    if (cmLine.match(/:/)) {
                        try {
                            solve(cmLine.split(':')[0]);
                        } catch (e) {
                            cmLine = cmLine.substring(cmLine.indexOf(':') + 1);
                        }
                    }

                    while (cmLine.match(/\([^\)]+\)/)) {
                        var s = cmLine.substring(cmLine.lastIndexOf('(') + 1);
                        var sp = cmLine.substring(cmLine.lastIndexOf('('));

                        s = s.substring(0, s.indexOf(')'));
                        sp = sp.substring(0, sp.indexOf(')') + 1);
                        if (sp.length === 0) break

                        try {
                            cmLine = cmLine.replace(sp, solver(s));
                        } catch (e) {
                            break
                        }
                    }
                    
                    answer = solver(cmLine);
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
                        var plotAns = /\w\(x\)$/.test(answer) ? cmLine.trim() : answer.trim();
                        answer = `<a class="plotButton" data-func="${plotAns}">Plot</a>`;
                        scope.ans = scope['line' + lineNo] = plotAns;
                    }
                } else {
                    subtotals.length = 0;
                }
            } catch (e) {
                var errStr = String(e).replace(/'|"/g, '`');
                answer = settings.app.lineErrors ? `<a class="lineError" data-line="${lineNo}" data-error="${errStr}">Error</a>` : '';
                if (settings.app.lineErrors) cm.addLineClass(cmLineNo, 'gutter', 'lineError');
            }
        } else {
            subtotals.length = 0;
        }

        answers += `<span style="height:${lineHeight}px">${answer}</span>`;
    });

    $('output').innerHTML = answers;

    $('clearButton').className = cm.getValue() == '' ? 'noAction' : 'action';
    $('printButton').className = cm.getValue() == '' ? 'noAction' : 'action';
    $('saveButton').className = cm.getValue() == '' ? 'noAction' : 'action';

    ls.set('input', cm.getValue());

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
            var lineDate = line.split(/[\+\-]/);
            var lineDateLeft = lineDate[0].replace(/[A-Za-z]+,/, '').trim();
            var lineDateRight = line.replace(lineDate[0], '').trim();

            var todayFormat = settings.app.dateFormat;
            var nowFormat = settings.app.dateFormat + ' ' + settings.app.timeFormat;

            var t = DateTime.fromFormat(lineDateLeft, todayFormat);
            var n = DateTime.fromFormat(lineDateLeft, nowFormat);
            var dt = t.isValid ? t : n.isValid ? n : null;

            var rightOfDate = String(solve(lineDateRight + ' to hours', scope));
            var durHrs = Number(rightOfDate.split(' ')[0]);

            if (dt) {
                var isToday = dt.toFormat(settings.app.dateFormat + "hh:mm:ss:SSS").endsWith('12:00:00:000') ? true : false;
                line = '"' + dt.plus({
                    hours: durHrs
                }).toFormat((settings.app.dateDay ? 'ccc, ' : '') + (isToday ? todayFormat : nowFormat)) + '"';
            } else {
                return 'Invalid Date'
            }
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

        return s
    }

    function format(answer) {
        answer = String(answer);
        var a = answer.trim().split(' ')[0];
        var b = answer.replace(a, '');
        formattedAnswer = !a.includes('e') && !isNaN(a) ?
            settings.app.thouSep ? Number(a).toLocaleString(undefined, digits) + b : parseFloat(Number(a).toFixed(settings.app.precision)) + b :
            a.match(/e-?\d+/) ? parseFloat(Number(a.split('e')[0]).toFixed(settings.app.precision)) + 'e' + answer.split('e')[1] + b :
            strip(answer);

        return formattedAnswer
    }
}