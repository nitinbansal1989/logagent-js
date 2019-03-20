"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cassandra = require("cassandra-driver");
const momenttz = require("moment-timezone");
const logger_js_1 = require("../../util/logger.js");
const distance = cassandra.types.distance;
class InputCassandra {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.started = false;
        this.client = null;
        this.debug = null;
        this.context = null;
        this.queryTime = null;
        this.queryTimeFormat = null;
        this.intervalID = null;
        this.config = config;
        this.eventEmitter = eventEmitter;
        this.started = false;
        var distanceLocal = config.pooling.coreConnectionsPerHost.distanceLocal;
        var distanceRemote = config.pooling.coreConnectionsPerHost.distanceRemote;
        var contatPoints = config.server.host.split(',');
        this.client = new cassandra.Client({ contactPoints: contatPoints, keyspace: config.server.keyspace, pooling: { coreConnectionsPerHost: { [distance.local]: distanceLocal, [distance.remote]: distanceRemote } } });
        if (this.config.interval < 1) {
            this.config.interval = 1;
        }
    }
    queryResultCb(err, result) {
        if (!err) {
            if (this.debug) {
                logger_js_1.default.error(this.context.queryTime, this.context.sourceName + ': ' + this.context.sql);
            }
            var rows = result.rows;
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
            this.client.shutdown;
        }
    }
    query(csql, cb) {
        var self = this;
        self.client.connect()
            .then(function () {
            return self.client.execute(csql, { prepare: true });
        }).then(function (result) {
            cb(null, result);
        }).catch(function (err) {
            console.error('error query', err);
            return;
        });
    }
}
exports.default = InputCassandra;
