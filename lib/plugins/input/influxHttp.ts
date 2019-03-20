import consoleLogger from '../../util/logger.js';
import * as throng from 'throng';
import * as http from 'http';
import * as URL from 'url';
import * as queryString from 'query-string';
import * as influxParse from 'influx-line-protocol-parser';

class InputInfluxHttp {

  config = null;
  eventEmitter = null;
  WORKERS = null;
  server = null;

  constructor(config, eventEmitter) {
    this.config = config
    this.eventEmitter = eventEmitter
    if (config.workers && config.workers > 0) {
      this.config.workers = config.workers
    } else {
      this.config.workers = 1
    }
  }

  start() {
    consoleLogger.log('loading infux plugin')
    if (this.config) {
      throng({
        workers: this.config.workers || this.WORKERS || 1,
        lifetime: Infinity
      }, this.startServer.bind(this))
    }
  }

  stop(cb) {
    if (this.server) {
      this.server.close(cb)
    }
  }

  getHttpServer(aport, handler) {
    var _port = aport || this.config.port || process.env.PORT || 8086
    if (aport === true) {
      _port = process.env.PORT
    }
    var server = http.createServer(handler)
    this.server = server
    try {
      this.server = server.listen(_port)
      consoleLogger.log('Logagent listening (http/influxdb interface): ' + _port + ', process id: ' + process.pid)
      return server
    } catch (err) {
      consoleLogger.log('Port in use (' + _port + '): ' + err)
    }
  }

  startServer(id) {
    this.getHttpServer(Number(this.config.port), this.httpHandler.bind(this))
    var exitInProgress = false
    var terminate = function (reason) {
      return function () {
        if (exitInProgress) {
          return
        }
        exitInProgress = true
        consoleLogger.log('stop influx worker: ' + id + ', pid:' + process.pid + ', terminate reason: ' + reason + ' memory rss: ' + (process.memoryUsage().rss / (1024 * 1024)).toFixed(2) + ' MB')
        setTimeout(process.exit, 250)
      }
    }
    process.once('SIGTERM', terminate('SIGTERM'))
    process.once('SIGINT', terminate('SIGINT'))
    process.once('exit', terminate('exit'))
  }

  httpHandler(req, res) {
    try {
      var self = this
      var url = URL.parse(req.url)
      url.query = queryString.parse(url.query)
      if (!/\/write/.test(req.url)) {
        res.statusCode = 204
        return res.end()
      }
      var body = ''
      req.on('data', function (data) {
        body += data
      })
      req.on('end', function endHandler() {
        self.parse(body, url)
        res.statusCode = 204
        res.end('Ok')
      })
    } catch (err) {
      consoleLogger.error('Error in influx input (http): ' + err)
    }
  }

  getTime(precision, timestamp) {
    var time = null
    switch (precision) {
      case 'ns':
        time = new Date(timestamp / 1000 / 1000)
        break
      case 'u':
        time = new Date(timestamp / 1000)
        break
      case 'ms':
        time = new Date(timestamp)
        break
      case 's':
        time = new Date(timestamp * 1000)
        break
      case 'm':
        time = new Date(timestamp * 1000 * 60)
        break
      case 'h':
        time = new Date(timestamp * 1000 * 60 * 60)
        break
      default:
        time = new Date()
        break
    }
    return time
  }

  parse(body, url) {
    var lines = body.split('\n')
    for (var i = 0; i < lines.length; i++) {
      try {
        var ir = influxParse(lines[i])
        var rv = {
          measurement: ir.measurement,
          timestamp: ir.timestamp,
          '@timestamp': ir.timestamp ? new Date(ir.timestamp / 1000 / 1000) : new Date(),
          precision: null,
          tags: null,
          influxDbName: null
        }
        if (url.query && url.query['precision']) {
          rv.precision = url.query['precision']
          rv['@timestamp'] = this.getTime(rv.precision, rv.timestamp)
        }
        if (ir.fields) {
          ir.fields.forEach(function (f) {
            Object.keys(f).forEach(function (key) {
              rv[ir.measurement + '_' + key] = f[key]
            })
          })
        }
        if (ir.tags) {
          rv.tags = {}
          ir.tags.forEach(function (t) {
            Object.keys(t).forEach(function (key) {
              rv['tags'][key] = t[key]
            })
          })
        }
        if (url.query) {
          rv.influxDbName = url.query['db']
        }
        var context = {
          name: 'input-influx-http',
          sourceName: 'input-influx-http',
          influxDbName: rv.influxDbName
        }
        if (rv.measurement) {
          this.eventEmitter.emit('data.raw', JSON.stringify(rv), context)
        }
      } catch (err) {
        consoleLogger.error('Error parsing data from influx: ' + err + ' body: ' + body)
      }
    }
  }

}

export default InputInfluxHttp;
