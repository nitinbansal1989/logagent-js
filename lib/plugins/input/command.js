"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const split = require("split2");
class InputCommand {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.started = false;
        this.lastRun = null;
        this.config = config;
        this.eventEmitter = eventEmitter;
        this.started = false;
        this.lastRun = new Date();
    }
    start() {
        if (!this.started) {
            this.started = true;
            this.runCommand(this.config.command, { sourceName: this.config.sourceName || this.config.command });
        }
    }
    stop() {
        if (this.started) {
            this.started = false;
        }
    }
    runCommand(cmd, context) {
        var self = this;
        var exec = require('child_process').exec;
        var cmdTemplate = cmd.replace(/\$QUERY_TIME/g, self.lastRun.toISOString());
        cmdTemplate = cmd.replace(/\$NOW/g, new Date().toISOString());
        var child = exec(cmdTemplate);
        if (self.config.debug) {
            console.log(cmdTemplate);
        }
        self.lastRun = new Date();
        child.stdout.pipe(split()).on('data', function (data) {
            if (self.config.debug) {
                console.log('stdout: ' + data);
            }
            self.eventEmitter.emit('data.raw', data, context);
        });
        child.stderr.pipe(split()).on('data', function (data) {
            if (self.config.debug) {
                console.log('stderr: ' + data);
            }
            if (self.config.stderr) {
                self.eventEmitter.emit('data.raw', data, context);
            }
        });
        child.on('close', function (code) {
            if (self.config.debug) {
                console.log('exitCode: ' + code);
            }
            if (self.started && self.config.restart > -1) {
                setTimeout(function rc() {
                    self.runCommand(cmd, context);
                }, self.config.restart * 1000);
            }
        });
    }
}
exports.default = InputCommand;
