import * as mqtt from 'mqtt';
import consoleLogger from '../../util/logger.js';

class InputMqttClient {

  config = null;
  eventEmitter = null;
  started: boolean = false;
  client = null;

  /**
   * Constructor called by logagent, when the config file contains this entry:
   * input
   *  mqtt-client:
   *    module: input-mqtt-client
   *    url: mqtt://test.mosquitto.org
   *    topics:
   *      - log-messages
   *      - sensor-data
   * @config cli arguments and config entries
   * @eventEmitter logent eventEmitter object
   */
  constructor(config, eventEmitter) {
    this.config = config
    this.eventEmitter = eventEmitter
  }
  /**
   * Plugin start function, called after constructor
   *
   */
  start() {
    if (!this.started) {
      this.connect()
      this.started = true
    }
  }
  connect() {
    var self = this
    this.client = mqtt.connect(this.config.url);
    this.client.on('close', function () {
      consoleLogger.log('mqtt client connection closed')
    })
    this.client.on('connect', function () {
      consoleLogger.log('mqtt client connect ' + self.config.url)
    })
    this.client.on('reconnect', function () {
      consoleLogger.log('mqtt client re-connect')
    })
    this.client.on('offline', function () {
      consoleLogger.log('mqtt client offline')
    })
    this.client.on('error', function () {
      consoleLogger.log('mqtt client error')
    })
    this.subscribe()
  }

  subscribe() {
    this.client.on('message', function (topic, message, packet) {
      var context = {
        name: 'input.mqtt.topic',
        packet: packet,
        sourceName: topic,
        topic: topic,
        qos: packet.qos,
        retain: packet.retain
      }
      if (message) {
        self.eventEmitter.emit('data.raw', message.toString(), context)
      }
    })
    if (this.config.topics && this.config.topics.length > 0) {
      var self = this
      this.config.topics.forEach(function (topicName) {
        self.client.subscribe(topicName)
      })
    }
  }

  /**
   * Plugin stop function, called when logagent terminates
   * we close the server socket here.
   */
  stop(cb) {
    this.started = false
    this.client.end()
  }

}

export default InputMqttClient;
