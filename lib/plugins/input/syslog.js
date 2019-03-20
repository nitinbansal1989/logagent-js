"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_js_1 = require("../../util/logger.js");
const Syslogd = require("syslogd");
var SEVERITY = [
    'emerg',
    'alert',
    'crit',
    'err',
    'warning',
    'notice',
    'info',
    'debug'
];
var FACILITY = [
    'kern',
    'user',
    'mail',
    'daemon',
    'auth',
    'syslog',
    'lpr',
    'news',
    'uucp',
    'cron',
    'authpriv',
    'ftp',
    'ntp',
    'logaudit',
    'logalert',
    'clock',
    'local0',
    'local1',
    'local2',
    'local3',
    'local4',
    'local5',
    'local6',
    'local7'
];
class InputSyslog {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.config = config;
        this.eventEmitter = eventEmitter;
    }
    start() {
        var self = this;
        if (this.config.port) {
            try {
                var port = this.config.udp || this.config.port;
                var eventEmitter = this.eventEmitter;
                var syslogd = Syslogd(function (sysLogMsg) {
                    var context = {
                        sourceName: sysLogMsg.tag || 'syslog',
                        enrichEvent: {
                            severity: SEVERITY[sysLogMsg.facility] || SEVERITY[6],
                            facility: FACILITY[sysLogMsg.severity] || FACILITY[16],
                            'syslog-tag': sysLogMsg.tag,
                            syslogClient: sysLogMsg.address
                        },
                        syslogClient: sysLogMsg.address,
                        port: port
                    };
                    eventEmitter.emit('data.raw', sysLogMsg.msg, context);
                }, { address: self.config.address || '0.0.0.0' });
                syslogd.listen(self.config.port, function (err) {
                    logger_js_1.default.log('Start syslog server ' + syslogd.server.address().address + ':' + self.config.port + ' ' + (err || ''));
                });
            }
            catch (err) {
                console.error(err);
            }
        }
    }
    stop(cb) {
        cb();
    }
}
exports.default = InputSyslog;
