"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const split = require("split2");
const net = require("net");
const fast_safe_stringify_1 = require("fast-safe-stringify");
class InputTCP {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.server = null;
        this.started = false;
        this.config = config;
        this.config.maxInputRate = config.maxInputRate || config.maxInputRate;
        this.eventEmitter = eventEmitter;
    }
    start() {
        if (!this.started) {
            this.createServer();
            this.started = true;
        }
    }
    stop(cb) {
        this.server.close(cb);
    }
    createServer() {
        var self = this;
        this.server = net.createServer(function (socket) {
            var context = { name: 'input.tcp', sourceName: self.config.sourceName || socket.remoteAddress + ':' + socket.remotePort };
            socket.pipe(Throttle(self.config.maxInputRate)).pipe(split()).on('data', function emitLine(data) {
                self.eventEmitter.emit('data.raw', data, context);
                if (self.config.debug) {
                    console.log(data + '\n', context);
                }
            }).on('error', console.error);
            if (self.config.returnResults) {
                self.eventEmitter.on('data.parsed', function (data, context) {
                    socket.write(fast_safe_stringify_1.default(data) + '\n');
                    if (self.config.debug) {
                        console.log(data, context);
                    }
                });
            }
        });
        var port = this.config.port || 4545;
        var address = this.config.bindAddress || '0.0.0.0';
        this.server.listen(port, address);
        console.log('listening to ' + address + ':' + port);
    }
}
exports.default = InputTCP;
var StreamThrottle = require('stream-throttle').Throttle;
function Throttle(maxRate) {
    var inputRate = maxRate || 1024 * 1024 * 100;
    var chunkSize = inputRate / 10;
    if (chunkSize < 1) {
        chunkSize = 1;
    }
    return new StreamThrottle({
        chunksize: chunkSize,
        rate: inputRate || 1024 * 1024 * 100
    });
}
