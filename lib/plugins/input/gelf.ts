import * as graygelf from 'graygelf';
var gelfserver = graygelf.server;
import safeStringify from 'fast-safe-stringify';

class InputGELF {
  config = null;
  eventEmitter = null;
  started: boolean = false;
  server = null;
  source = null;

  constructor(config, eventEmitter) {
    this.config = config
    this.config.port = config.port || 12100
    this.config.host = config.host || '0.0.0.0'
    this.eventEmitter = eventEmitter
  }

  start() {
    if (!this.started) {
      this.createServer()
      this.started = true
    }
  }
  stop(cb) {
    this.server.close(cb)
  }
  createServer() {
    var self = this
    this.server = gelfserver()
    this.server.listen(this.config.port, this.config.host)
    this.server._udp.on('message', function (buf, rinfo) {
      self.source = rinfo.address + ':' + rinfo.port
    })
    this.server.on('message', function (gelf) {
      self.eventEmitter.emit('data.raw', safeStringify(gelf), { sourceName: 'gelf-input : ' + self.source })
    })
  }

}

export default InputGELF;
