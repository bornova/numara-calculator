/**
 * @copyright 2020 Timur Atalay 
 * @homepage https://github.com/bornova/numpad
 * @license MIT https://github.com/bornova/numpad/blob/master/LICENSE
 */

const schema = {
    precision: {
        type: 'number',
        default: 4,
        minimum: 0,
        maximum: 16
    },
    dateFormat: {
        type: 'string',
        default: 'l',
        enum: ['l', 'L', 'MMM DD, YYYY', 'ddd, l', 'ddd, L', 'ddd, MMM DD, YYYY']
    },
    inputWidth: {
        type: 'number',
        default: 50,
        minimum: 0,
        maximum: 100
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