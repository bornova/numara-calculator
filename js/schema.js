/**
 * @copyright 2020 Timur Atalay 
 * @homepage https://github.com/bornova/numpad
 * @license MIT https://github.com/bornova/numpad/blob/master/LICENSE
 */

const schema = {
    appWidth: {
        type: 'number',
        default: 600
    },
    appHeight: {
        type: 'number',
        default: 480
    },
    precision: {
        type: 'number',
        default: 4,
        minimum: 0,
        maximum: 16
    },
    dateFormat: {
        type: 'string',
        default: 'l'
    },
    inputWidth: {
        type: 'string',
        default: '50%'
    },
    autoRates: {
        type: 'boolean',
        default: true
    },
    resizable: {
        type: 'boolean',
        default: true
    },
    lineErrors: {
        type: 'boolean',
        default: true
    },
    lineNumbers: {
        type: 'boolean',
        default: true
    },
    plotGridLines: {
        type: 'boolean',
        default: false
    },
    plotTipLines: {
        type: 'boolean',
        default: false
    },
    plotClosed: {
        type: 'boolean',
        default: false
    }
};

module.exports = {
    schema,
    fileExtension: ''
}