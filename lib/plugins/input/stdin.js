"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const split = require("split2");
const throttle_1 = require("../../util/throttle");
class InputStdin {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.config = config;
        this.eventEmitter = eventEmitter;
    }
    start() {
        var context = { name: 'input.stdin', sourceName: this.config.sourceName || 'unknown' };
        var eventEmitter = this.eventEmitter;
        process.stdin.pipe(throttle_1.default(this.config.maxInputRate)).pipe(split()).on('data', function emitLine(data) {
            eventEmitter.emit('data.raw', data, context);
        }).on('error', console.error);
        if (this.config.stdinExitEnabled || this.config.configFile && this.config.configFile.input && this.config.configFile.input.stdin && this.config.configFile.input.stdin.stdinExitEnabled) {
            process.stdin.once('end', function () {
                eventEmitter.emit('input.stdin.end', null, context);
            });
        }
        else {
            process.stdin.on('error', function (err) {
                console.log('stdin error ' + err);
            });
        }
    }
    stop(cb) {
        cb();
    }
}
exports.default = InputStdin;
