/**
 * @copyright 2020 Timur Atalay 
 * @homepage https://github.com/bornova/numara
 * @license MIT https://github.com/bornova/numara/blob/master/LICENSE
 */

var scopelist = [];

// Calculate answers
function calculate() {
    var solve = math.evaluate;
    var settings = ls.get('settings');
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

    scopelist.length = 0;

    scope.now = moment().format(settings.app.dateFormat + ' LT');
    scope.today = moment().format(settings.app.dateFormat);

    cm.eachLine((line) => {
        var answer = '';
        var lineNo = cm.getLineNumber(line) + 1;
        var mirrorLine = line.text;
        var cline = line = line.text.trim().split('//')[0].split('#')[0];

        setLineNo(lineNo);

        if (line) {
            try {
                line = lineNo > 1 && line.charAt(0).match(/[\+\-\*\/]/) && cm.getLine(lineNo - 2).length > 0 ? scope.ans + line : line;

                scopeCheck(line, 0);
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
                scopeCheck(cline);

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

    function scopeCheck(line, order) {
        var reg = order == 0 ? /\b(?:ans|today|now|line\d+)\b/g : /\b(?:total|subtotal|avg)\b/g;
        var result;
        while ((result = reg.exec(line)) !== null) {
            var val = result[0];
            scopelist.push(order == 0 ? (scope[val] !== undefined ? format(scope[val]) : 'n/a') : format(solverScope[result[0]]));
        }
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
        if (lineNoReg) lineNoReg.map(n => line = line.replace(n, scope[n]));

        var dateTimeReg = new RegExp('millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia');
        if (line.match(dateTimeReg)) {
            var lineDate = line.split(/[\+\-]/)[0];
            var rightOfDate = String(solve(line.replace(lineDate, '') + ' to hours', scope));
            var durNum = Number(rightOfDate.split(' ')[0]);
            var durUnit = rightOfDate.split(' ')[1];

            line = '"' + moment(new Date(lineDate)).add(durNum, durUnit).format('l LT') + '"';
        }

        var modReg = /\d*\.?\d%\d*\.?\d/g;
        var pcntReg = /[\w.]*%/g;
        var pcntOfReg = /%[ ]*of[ ]*/g;
        var pcntOfRegC = /[\w.]*%[ ]*of[ ]*/g;

        line = line.match(pcntOfRegC) ? line.replace(pcntOfReg, '/100*') : line;

        if (line.match(modReg)) line.match(modReg).map(m => line = line.replace(m, solve(m, scope)));

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