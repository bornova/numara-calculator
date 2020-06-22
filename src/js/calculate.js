/**
 * @copyright 2020 Timur Atalay 
 * @homepage https://github.com/bornova/numpad
 * @license MIT https://github.com/bornova/numpad/blob/master/LICENSE
 */

// Calculate answers
function calculate() {
    var solve = math.evaluate;
    var settings = JSON.parse(localStorage.getItem('settings'));
    var input = $('input').value;
    var lines = input.split('\n');
    var lineIndex = 1;
    var lineNos = [];
    var scrolls = [];
    var answers = [];
    var totals = [];
    var subtotals = [];
    var avgs = [];
    var scope = {};
    var expLim = {
        lowerExp: -12,
        upperExp: 12
    };
    var digits = {
        maximumFractionDigits: settings.precision
    };

    scope.now = moment().format(settings.dateFormat + ' LT');
    scope.today = moment().format(settings.dateFormat);

    for (var i in lines) {
        var line = lines[i].trim();
        var lineNo = lineIndex++;
        var answer = '';

        if (line) {
            try {
                line = line.split('//')[0];
                line = lineNo > 1 && line.charAt(0).match(/[\+\-\*\/]/) && lines[i - 1].length > 0 ? scope.ans + line : line;
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
                    totals.push(answer);
                    subtotals.push(answer);
                    avgs.push(answer);

                    scope.ans = scope['line' + lineNo] = answer;

                    answer = math.format(answer, expLim);
                    var a = answer.trim().split(' ')[0];
                    var b = answer.replace(a, '');
                    answer = !a.includes('e') && !isNaN(a) ? settings.thouSep ? Number(a).toLocaleString(undefined, digits) + b : parseFloat(Number(a).toFixed(settings.precision)) + b : strip(answer);

                    if (answer.match(/\w\(x\)/)) {
                        answer = '<a title="Plot ' + line + '" class="plotButton" data-func="' + line + '">Plot</a>';
                        scope.ans = scope['line' + lineNo] = line.split('=')[1].trim();
                    }
                } else {
                    answer = '';
                    subtotals = [];
                }
            } catch (e) {
                var errStr = String(e).replace(/'|"/g, '`');
                if (settings.lineErrors) {
                    answer = '<a title="' + errStr + '" class="lineError" data-line="' + lineNo + '" data-error="' + errStr + '">Err</a>';
                    lineNo = '<span class="lineErrorNo">' + lineNo + '</span>';
                }
            }
        } else {
            subtotals = [];
        }

        var br = '';
        if (settings.lineWrap) {
            $('mirror').innerHTML = lines[i];
            var h = $('mirror').offsetHeight;
            var lh = getComputedStyle($('mirror')).lineHeight.split('px')[0];
            br = h > lh ? '<br>'.repeat((h / lh) - 1) : '';
        }

        answers += answer + '<br>' + br;
        lineNos += lineNo + '<br>' + br;
        scrolls += '<br>' + br;
    }

    $('lineNo').innerHTML = lineNos;
    $('output').innerHTML = answers;
    $('scroll').innerHTML = scrolls;

    $('clearButton').className = input === '' ? 'noAction' : 'action';
    $('printButton').className = input === '' ? 'noAction' : 'action';
    $('saveButton').className = input === '' ? 'noAction' : 'action';

    localStorage.setItem('input', JSON.stringify($('input').value));
    $('undoButton').style.visibility = 'hidden';

    function strip(s) {
        var t = s.length;
        if (s.charAt(0) === '"') s = s.substring(1, t--);
        if (s.charAt(--t) === '"') s = s.substring(0, t);
        return s;
    }

    // Solver
    function solver(line) {
        var subtotal = subtotals.length > 0 ? '(' + subtotals.join('+') + ')' : 0;
        var total = totals.length > 0 ? '(' + totals.join('+') + ')' : 0;
        var avg = avgs.length > 0 ? '(' + math.mean(avgs) + ')' : 0;

        line = line.replace(/\bans\b/g, scope.ans)
            .replace(/\bnow\b/g, scope.now)
            .replace(/\btoday\b/g, scope.today)
            .replace(/\bsubtotal\b/g, subtotal)
            .replace(/\btotal\b/g, total)
            .replace(/\bavg\b/g, avg);

        var lineNoReg = line.match(/\bline\d+\b/g);
        if (lineNoReg) lineNoReg.map(n => line = line.replace(n, scope[n]));

        var timeReg = 'hour|hours|minute|minutes|second|seconds';
        var dateReg = 'day|days|week|weeks|month|months|year|years|' + timeReg;
        var momentReg = new RegExp('[\\+\\-]\\s*\\d*\\s*(' + dateReg + ')\\s*$');

        if (line.match(momentReg)) {
            var lineDate = line.split(/[\+\-]/)[0];
            var rightOfDate = String(solve(line.replace(lineDate, ''), scope));
            var dwmy = rightOfDate.match(new RegExp(dateReg));
            var dateNum = rightOfDate.split(dwmy)[0];
            var timeFormat = line.match(new RegExp(timeReg)) ? settings.dateFormat + ' LT' : settings.dateFormat;

            line = '"' + moment(new Date(lineDate)).add(dateNum, dwmy).format(timeFormat) + '"';
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
}