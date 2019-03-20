"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graygelf = require("graygelf");
var gelfserver = graygelf.server;
const fast_safe_stringify_1 = require("fast-safe-stringify");
class InputGELF {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.started = false;
        this.server = null;
        this.source = null;
        this.config = config;
        this.config.port = config.port || 12100;
        this.config.host = config.host || '0.0.0.0';
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
        this.server = gelfserver();
        this.server.listen(this.config.port, this.config.host);
        this.server._udp.on('message', function (buf, rinfo) {
            self.source = rinfo.address + ':' + rinfo.port;
        });
        this.server.on('message', function (gelf) {
            self.eventEmitter.emit('data.raw', fast_safe_stringify_1.default(gelf), { sourceName: 'gelf-input : ' + self.source });
        });
    }
}
exports.default = InputGELF;
