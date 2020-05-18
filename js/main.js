/**
 * @copyright 2020 Timur Atalay 
 * @Homepage https://github.com/bornova/numpad
 * @license MIT https://github.com/bornova/numpad/blob/master/LICENSE
 */

const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain,
    shell
} = require('electron');

const {
    is
} = require('electron-util');

const fs = require('fs-extra');

const store = require('electron-store');
const schema = {
    appWidth: {
        type: 'number',
        default: 600,
        minimum: 480
    },
    appHeight: {
        type: 'number',
        default: 480,
        minimum: 320
    }
}
const dims = new store({
    schema,
    name: 'Preferences',
    fileExtension: ''
});

require('electron-context-menu')({
    prepend: (params, browserWindow) => []
});

let win;

if (!app.requestSingleInstanceLock()) {
    app.quit()
} else {
    app.on('second-instance', () => win.focus())
}

function appWindow() {
    win = new BrowserWindow({
        width: dims.get('appWidth'),
        height: dims.get('appHeight'),
        minWidth: schema.appWidth.minimum,
        minHeight: schema.appHeight.minimum,
        frame: false,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: true,
            devTools: is.development
        }
    });

    win.loadFile('numpad.html');
    win.once('ready-to-show', () => win.show());
    win.on('close', () => {
        var d = win.getSize();
        dims.set('appWidth', d[0]);
        dims.set('appHeight', d[1]);
    })
    win.on('closed', () => win = null);

    win.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });

    if (!is.development) {
        win.on('focus', (event) => globalShortcut.registerAll(['CommandOrControl+R', 'F5'], () => {}))
        win.on('blur', (event) => globalShortcut.unregisterAll())
    }
}

app.allowRendererProcessReuse = true;

app.on('ready', () => appWindow());
app.on('window-all-closed', () => app.quit());

ipcMain.on('isNormal', (event) => event.returnValue = win.isNormal());
ipcMain.on('isMaximized', (event) => event.returnValue = win.isMaximized());

ipcMain.on('close', () => win.close());
ipcMain.on('minimize', () => win.minimize());
ipcMain.on('maximize', () => win.maximize());
ipcMain.on('unmaximize', () => win.unmaximize());

ipcMain.on('getName', (event) => event.returnValue = app.name);
ipcMain.on('getVersion', (event) => event.returnValue = app.getVersion());
ipcMain.on('print', (event) => {
    win.webContents.print({}, (success) => {
        var result = success ? 'Sent to printer' : 'Print cancelled';
        event.sender.send('printReply', result);
    });
});
ipcMain.on('resetApp', () => {
    fs.remove(app.getPath('userData'));
    app.relaunch();
    app.exit();
});