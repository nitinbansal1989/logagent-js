"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tedious = require("tedious");
const momenttz = require("moment-timezone");
const logger_js_1 = require("../../util/logger.js");
var Connection = tedious.Connection;
var Request = tedious.Request;
class InputMSSql {
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
        this.connection = new Connection(config.connectioninfo);
        if (this.config.interval < 1) {
            this.config.interval = 1;
        }
    }
    queryResultCb(err, rows) {
        if (this.debug) {
            logger_js_1.default.log(this.context.sourceName + ': ' + this.context.sql);
        }
        if (!err) {
            for (var i = 0; i < rows.length; i++) {
                if (!rows[i]['@timestamp']) {
                    rows[i]['@timestamp'] = new Date();
                }
                rows[i].logSource = this.context.sourceName;
                var record = {};
                var currentRow = rows[i];
                for (var col = 0; col < currentRow.length; col++) {
                    var colName = currentRow[col].metadata.colName;
                    record[colName] = currentRow[col].value;
                }
                this.eventEmitter.emit('data.parsed', record, this.context);
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
        var request = new Request(sql, function (err, rowCount, rows) {
            console.log(rows);
            if (err) {
                cb(err);
                return;
            }
            cb(null, rows);
        });
        request.on('doneProc', function (rowCount, more, rows) { });
        self.connection.execSql(request);
    }
}
exports.default = InputMSSql;
