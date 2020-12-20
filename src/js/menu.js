module.exports = {
    macOS: (appName) => {
        const shell = require('electron').shell
        const template = [{
                label: appName,
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
                    click: async () => await shell.openExternal('https://github.com/bornova/numara')
                }]
            }
        ]

        return template
    }
}