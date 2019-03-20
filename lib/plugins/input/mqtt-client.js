"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mqtt = require("mqtt");
const logger_js_1 = require("../../util/logger.js");
class InputMqttClient {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.started = false;
        this.client = null;
        this.config = config;
        this.eventEmitter = eventEmitter;
    }
    start() {
        if (!this.started) {
            this.connect();
            this.started = true;
        }
    }
    connect() {
        var self = this;
        this.client = mqtt.connect(this.config.url);
        this.client.on('close', function () {
            logger_js_1.default.log('mqtt client connection closed');
        });
        this.client.on('connect', function () {
            logger_js_1.default.log('mqtt client connect ' + self.config.url);
        });
        this.client.on('reconnect', function () {
            logger_js_1.default.log('mqtt client re-connect');
        });
        this.client.on('offline', function () {
            logger_js_1.default.log('mqtt client offline');
        });
        this.client.on('error', function () {
            logger_js_1.default.log('mqtt client error');
        });
        this.subscribe();
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
            };
            if (message) {
                self.eventEmitter.emit('data.raw', message.toString(), context);
            }
        });
        if (this.config.topics && this.config.topics.length > 0) {
            var self = this;
            this.config.topics.forEach(function (topicName) {
                self.client.subscribe(topicName);
            });
        }
    }
    stop(cb) {
        this.started = false;
        this.client.end();
    }
}
exports.default = InputMqttClient;
