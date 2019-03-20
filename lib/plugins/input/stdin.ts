import * as split from 'split2';

import createStreamThrottle from '../../util/throttle';

class InputStdin {

  config = null;
  eventEmitter = null;

  constructor(config, eventEmitter) {
    this.config = config
    this.eventEmitter = eventEmitter
  }
  start() {
    var context = { name: 'input.stdin', sourceName: this.config.sourceName || 'unknown' }
    var eventEmitter = this.eventEmitter
    process.stdin.pipe(createStreamThrottle(this.config.maxInputRate)).pipe(split()).on('data', function emitLine(data) {
      eventEmitter.emit('data.raw', data, context)
    }).on('error', console.error)
    if (this.config.stdinExitEnabled || this.config.configFile && this.config.configFile.input && this.config.configFile.input.stdin && this.config.configFile.input.stdin.stdinExitEnabled) {
      process.stdin.once('end', function () {
        eventEmitter.emit('input.stdin.end', null, context)
      })
    } else {
      // terminate on EOF from stdin deactivated
      process.stdin.on('error', function (err) {
        console.log('stdin error ' + err)
      })
    }
  }

  stop(cb) {
    cb()
  }

}

export default InputStdin;

