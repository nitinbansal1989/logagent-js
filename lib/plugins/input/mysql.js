"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mysql = require("mysql");
const momenttz = require("moment-timezone");
class InputMySql {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.started = null;
        this.connection = null;
        this.debug = null;
        this.context = null;
        this.queryTime = null;
        this.queryTimeFormat = null;
        this.intervalID = null;
        this.config = config;
        this.eventEmitter = eventEmitter;
        this.started = false;
        this.connection = mysql.createConnection(config.server);
        if (this.config.interval < 1) {
            this.config.interval = 1;
        }
    }
    queryResultCb(err, rows) {
        if (!err) {
            if (this.debug) {
                console.error(this.context.queryTime, this.context.sourceName + ': ' + this.context.sql);
            }
            for (var i = 0; i < rows.length; i++) {
                if (!rows[i]['@timestamp']) {
                    rows[i]['@timestamp'] = new Date();
                }
                rows[i].logSource = this.context.sourceName;
                this.eventEmitter.emit('data.parsed', rows[i], this.context);
            }
        }
        else {
            this.eventEmitter.emit('error', err);
        }
    }
    runQuery() {
        if (!this.queryTime) {
            this.queryTime = new Date();
        }
        for (var i = 0; i < this.config.queries.length; i++) {
            var dateString = this.queryTime.toISOString().slice(0, 19).replace('T', ' ');
            if (this.config.queryTimezone && this.config.queryTimeFormat) {
                dateString = momenttz(this.queryTime).tz(this.config.queryTimezone).format(this.queryTimeFormat);
            }
            var tmpSqlStatement = this.config.queries[i].sql.replace(/\$queryTime/g, dateString);
            var context = { sourceName: this.config.queries[i].sourceName, sql: tmpSqlStatement, queryTime: this.queryTime };
            this.queryTime = new Date();
            this.query(tmpSqlStatement, this.queryResultCb.bind({ eventEmitter: this.eventEmitter, context: context, debug: this.config.debug }));
        }
    }
    start() {
        if (!this.started) {
            this.started = true;
            this.intervalID = setInterval(this.runQuery.bind(this), this.config.interval * 1000);
        }
    }
    stop() {
        if (this.started) {
            this.started = false;
            clearInterval(this.intervalID);
        }
    }
    query(sql, cb) {
        var self = this;
        self.connection.query(sql, function (err, rows, fields) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, rows);
        });
    }
}
exports.default = InputMySql;
