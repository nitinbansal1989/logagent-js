"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg = require("pg");
const momenttz = require("moment-timezone");
const logger_js_1 = require("../../util/logger.js");
class InputPostgresql {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.started = false;
        this.debug = null;
        this.context = null;
        this.client = null;
        this.connection = null;
        this.queryTime = null;
        this.queryTimeFormat = null;
        this.intervalID = null;
        this.config = config;
        this.eventEmitter = eventEmitter;
        this.started = false;
        if (this.config.interval < 1) {
            this.config.interval = 1;
        }
    }
    queryResultCb(err, rows) {
        if (!err) {
            if (this.debug) {
                logger_js_1.default.log('PostgreSQL input: ' + this.context.sourceName + ': ' + this.context.sql);
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
    connect() {
        if (this.client) {
            this.client.end(function (err) {
                if (err) {
                    logger_js_1.default.log('PostgreSQL input: ' + err);
                }
            });
            this.connection = null;
            this.client = null;
        }
        this.client = new pg.Client(this.config.server);
        this.connection = this.client.connect(function (err) {
            if (err) {
                logger_js_1.default.log('PostgreSQL input: ' + err);
            }
        });
    }
    runQuery() {
        this.connect();
        if (!this.connection) {
            return;
        }
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
        self.client.query(sql, function (err, result) {
            if (err) {
                cb(err);
                return;
            }
            cb(null, result.rows);
        });
    }
}
exports.default = InputPostgresql;
