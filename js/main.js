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
    Menu,
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
        default: 500
    },
    appHeight: {
        type: 'number',
        default: 420
    },
    fullSize: {
        type: 'boolean',
        default: false
    }
};
const dims = new store({
    schema,
    fileExtension: ''
});

require('electron-context-menu')({
    prepend: (params, browserWindow) => []
});

let win;

function appWindow() {
    win = new BrowserWindow({
        width: parseInt(dims.get('appWidth')),
        height: parseInt(dims.get('appHeight')),
        minWidth: schema.appWidth.default,
        minHeight: schema.appHeight.default,
        frame: false,
        show: false,
        hasShadow: true,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: true,
            spellcheck: false,
            devTools: is.development
        }
    });

    win.loadFile('numpad.html');

    win.on('ready-to-show', () => win.show());
    win.on('close', () => {
        if (win.isMaximized()) {
            dims.set('fullSize', true);
        } else {
            var size = win.getSize();
            dims.set('appWidth', size[0]);
            dims.set('appHeight', size[1]);
            dims.set('fullSize', false);
        }
    });

    win.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });

    if (dims.get('fullSize') & is.windows) win.maximize();

    if (!is.development) {
        win.on('focus', (event) => globalShortcut.registerAll(['CommandOrControl+R', 'F5'], () => {}));
        win.on('blur', (event) => globalShortcut.unregisterAll());
    }
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => win.focus());
}

app.on('ready', () => appWindow());

ipcMain.on('close', () => app.quit());
ipcMain.on('minimize', () => win.minimize());
ipcMain.on('maximize', () => win.maximize());
ipcMain.on('unmaximize', () => win.unmaximize());
ipcMain.on('isNormal', (event) => event.returnValue = win.isNormal());
ipcMain.on('isMaximized', (event) => event.returnValue = win.isMaximized());
ipcMain.on('getName', (event) => event.returnValue = app.name);
ipcMain.on('getVersion', (event) => event.returnValue = app.getVersion());
ipcMain.on('isWindows', (event) => event.returnValue = is.windows);
ipcMain.on('print', (event) => {
    win.webContents.print({}, (success) => {
        var result = success ? 'Sent to printer' : 'Print cancelled';
        event.sender.send('printReply', result);
    });
});
ipcMain.on('resetApp', () => {
    win.close();
    fs.remove(app.getPath('userData'));
    app.relaunch();
    app.quit();
});

if (is.macos) {
    const template = [{
            label: app.name,
            submenu: [{
                    role: 'about'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'hide'
                },
                {
                    role: 'hideothers'
                },
                {
                    role: 'unhide'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'quit'
                }
            ]
        },
        {
            label: 'File',
            submenu: [{
                role: 'close'
            }]
        },
        {
            label: 'Edit',
            submenu: [{
                    role: 'undo'
                },
                {
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'cut'
                },
                {
                    role: 'copy'
                },
                {
                    role: 'paste'
                },
                {
                    role: 'pasteAndMatchStyle'
                },
                {
                    role: 'delete'
                },
                {
                    role: 'selectAll'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Speech',
                    submenu: [{
                            role: 'startspeaking'
                        },
                        {
                            role: 'stopspeaking'
                        }
                    ]
                }
            ]
        },
        {
            label: 'View',
            submenu: [{
                    role: 'reload'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'resetzoom'
                },
                {
                    role: 'zoomin'
                },
                {
                    role: 'zoomout'
                },
                {
                    type: 'separator'
                }
            ]
        },
        {
            label: 'Window',
            submenu: [{
                    role: 'minimize'
                },
                {
                    role: 'zoom'
                },
                {
                    role: 'togglefullscreen'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'front'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'window'
                }
            ]
        },
        {
            role: 'help',
            submenu: [{
                label: 'Learn More',
                click: async () => await shell.openExternal('https://github.com/bornova/numpad')
            }]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}
