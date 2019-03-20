import * as pg from 'pg';
import * as momenttz from 'moment-timezone';

import consoleLogger from '../../util/logger.js';

class InputPostgresql {

  config = null;
  eventEmitter = null;
  started: boolean = false;
  debug = null;
  context = null;
  client = null;
  connection = null;
  queryTime = null;
  queryTimeFormat = null;
  intervalID = null;

  constructor(config, eventEmitter) {
    this.config = config
    this.eventEmitter = eventEmitter
    this.started = false
    // this.client = new pg.Client(config.server)
    // this.connection = this.client.connect()
    if (this.config.interval < 1) {
      this.config.interval = 1
    }
  }

  queryResultCb(err, rows) {
    if (!err) {
      if (this.debug) {
        consoleLogger.log('PostgreSQL input: ' + this.context.sourceName + ': ' + this.context.sql)
      }
      for (var i = 0; i < rows.length; i++) {
        if (!rows[i]['@timestamp']) {
          rows[i]['@timestamp'] = new Date()
        }
        rows[i].logSource = this.context.sourceName
        this.eventEmitter.emit('data.parsed', rows[i], this.context)
      }
    } else {
      this.eventEmitter.emit('error', err)
    }
  }

  connect() {
    // we re-connect, in case PG did close connections
    // while LA was waiting in a long interval
    if (this.client) {
      this.client.end(function (err) {
        if (err) {
          consoleLogger.log('PostgreSQL input: ' + err)
        }
      })
      this.connection = null
      this.client = null
    }
    this.client = new pg.Client(this.config.server)
    this.connection = this.client.connect(function (err) {
      if (err) {
        consoleLogger.log('PostgreSQL input: ' + err)
      }
    })
  }

  runQuery() {
    // re-connect before we run queries
    this.connect()
    if (!this.connection) {
      // connection failed
      return
    }
    if (!this.queryTime) {
      this.queryTime = new Date()
    }
    for (var i = 0; i < this.config.queries.length; i++) {
      var dateString = this.queryTime.toISOString().slice(0, 19).replace('T', ' ')
      if (this.config.queryTimezone && this.config.queryTimeFormat) {
        dateString = momenttz(this.queryTime).tz(this.config.queryTimezone).format(this.queryTimeFormat)
      }
      var tmpSqlStatement = this.config.queries[i].sql.replace(/\$queryTime/g, dateString)
      var context = { sourceName: this.config.queries[i].sourceName, sql: tmpSqlStatement, queryTime: this.queryTime }
      this.queryTime = new Date()
      this.query(tmpSqlStatement, this.queryResultCb.bind({ eventEmitter: this.eventEmitter, context: context, debug: this.config.debug }))
    }
  }

  start() {
    if (!this.started) {
      this.started = true
      this.intervalID = setInterval(this.runQuery.bind(this), this.config.interval * 1000)
    }
  }

  stop() {
    if (this.started) {
      this.started = false
      clearInterval(this.intervalID)
    }
  }

  query(sql, cb) {
    var self = this
    self.client.query(sql, function (err, result) {
      if (err) {
        cb(err)
        return
      }
      cb(null, result.rows)
    })
  }

}

export default InputPostgresql;

