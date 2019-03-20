import consoleLogger from '../../util/logger.js';
import * as http from 'http';

function jsonParse(text) {
  try {
    return JSON.parse(text)
  } catch (err) {
    return null
  }
}

function extractJson(line) {
  var parsed = {}
  if (/^\[{0,1}\{.*\}]{0,1}$/.test(line)) {
    parsed = jsonParse(line)
    if (!parsed) {
      return null
    }
    return parsed
  }
}

function filterHerokuMessage(data, context) {
  if (data) {
    data['_type'] = context.sourceName.replace('_' + context.index, '')
    data['logSource'] = ('' + data['logSource']).replace('_' + context.index, '')
    var msg = {
      message: data.message,
      app: data.app,
      host: data.host,
      process_type: data.process_type,
      originalLine: data.originalLine,
      severity: data.severity,
      facility: data.facility,
      json: null
    }
    msg.json = extractJson(msg.message)
    var optionalFields = ['method', 'path', 'host', 'request_id', 'fwd', 'dyno', 'connect', 'service', 'status', 'bytes']
    optionalFields.forEach(function (f) {
      if (data[f]) {
        msg[f] = data[f]
      }
    })
    if (!data['@timestamp']) {
      msg['@timestamp'] = new Date()
    }
    return msg
  }
}

class InputHeroku {
  config = null;
  eventEmitter = null;
  throng = null;
  WORKERS = null;
  server = null;

  constructor(config, eventEmitter) {
    this.config = config
    this.eventEmitter = eventEmitter
    this.config.port = this.config.heroku || config.port
    if (config && config.blacklist) {
      this.config.blacklist = config.blacklist
    } else {
      this.config.blacklist = {}
    }
    if (config.workers) {
      this.config.herokuWorkers = config.workers
    } else {
      this.config.herokuWorkers = undefined
    }
  }
  start() {
    if (this.config.port) {
      this.throng = require('throng')
      this.throng({
        workers: this.config.herokuWorkers || this.WORKERS || 2,
        lifetime: Infinity
      }, this.startHerokuServer.bind(this))
    }
  }

  sto(cb) {
    if (this.server) {
      this.server.close(cb)
    }
  }

  getHttpServer(aport, handler) {
    var _port = aport || process.env.PORT
    if (aport === true) { // a commadn line flag was set but no port given
      _port = process.env.PORT
    }
    var server = http.createServer(handler)
    this.server = server
    try {
      this.server = server.listen(_port)
      consoleLogger.log('Logagent listening (http): ' + _port + ', process id: ' + process.pid)
      return server
    } catch (err) {
      consoleLogger.log('Port in use (' + _port + '): ' + err)
    }
  }

  herokuHandler(req, res) {
    try {
      var self = this
      var path = req.url.split('/')
      var token = null
      if (path.length > 1) {
        if (path[1] && path[1].length > 31 && /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(path[1])) {
          token = path[1]
        } else if (path[1] === 'health' || path[1] === 'ping') {
          res.statusCode = 200
          res.end('ok\n')
          return
        }
      }
      if (!token) {
        res.end('<html><head><link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap.min.css"</head><body><div class="alert alert-danger" role="alert">Error: Missing Logsene Token ' +
          req.url + '. Please use /LOGSENE_TOKEN. More info: <ul><li><a href="https://github.com/sematext/logagent-js#logagent-as-heroku-log-drain">Heroku Log Drain for Logsene</a> </li><li><a href="https://www.sematext.com/logsene/">Logsene Log Management by Sematext</a></li></ul></div></body><html>')
        return
      }

      if (self.config && self.config.blacklist && self.config.blacklist[token]) {
        if (self.config.debug) {
          consoleLogger.log('blacklisted request for' + token)
        }
        res.statusCode = 404
        return res.end()
      }
      var body = ''
      req.on('data', function (data) {
        body += data
      })
      req.on('end', function endHandler() {
        var lines = body.split('\n')
        lines.forEach(function (line) {
          if (!line) {
            return
          }
          self.eventEmitter.emit('data.raw', line, { sourceName: 'heroku_' + token, index: token, filter: filterHerokuMessage })
        })
        res.end('ok\n')
      })
    } catch (err) {
      consoleLogger.error('Error in Heroku (http): ' + err)
    }
  }

  // heroku start function for WEB_CONCURENCY
  startHerokuServer(id) {
    consoleLogger.log('start heroku worker: ' + id + ', pid:' + process.pid)
    this.getHttpServer(Number(this.config.port), this.herokuHandler.bind(this))
    var exitInProgress = false
    var terminate = function (reason) {
      return function () {
        if (exitInProgress) {
          return
        }
        exitInProgress = true
        consoleLogger.log('stop heroku worker: ' + id + ', pid:' + process.pid + ', terminate reason: ' + reason + ' memory rss: ' + (process.memoryUsage().rss / (1024 * 1024)).toFixed(2) + ' MB')
        setTimeout(process.exit, 250)
      }
    }
    process.once('SIGTERM', terminate('SIGTERM'))
    process.once('SIGINT', terminate('SIGINT'))
    process.once('exit', terminate('exit'))
  }

}

export default InputHeroku;
