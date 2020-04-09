/**
 * @copyright 2020 Timur Atalay 
 * @Homepage https://github.com/bornova/numpad
 * @license MIT https://github.com/bornova/numpad/blob/master/LICENSE
 */

const {
    app,
    BrowserWindow,
    ipcMain,
    shell
} = require('electron');
const fs = require('fs-extra');

require('electron-context-menu')({
    prepend: (params, browserWindow) => []
});

let win;

function appWindow() {
    win = new BrowserWindow({
        width: 600,
        height: 480,
        minWidth: 400,
        minHeight: 320,
        frame: false,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: true
            //devTools: false
        }
    });

    win.loadFile('numpad.html');
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => win = null);

    win.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });
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