"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_js_1 = require("../../util/logger.js");
const http = require("http");
const throng = require("throng");
const fast_safe_stringify_1 = require("fast-safe-stringify");
const errResponse = '{"error":{"root_cause":[{"type":"action_request_validation_exception","reason":"Validation Failed: 1: no requests added;"}],"type":"action_request_validation_exception","reason":"Validation Failed: 1: no requests added;"},"status":400}';
function createIndexCall(action, source, defaultIndex, defaultType) {
    source._index = action._index || defaultIndex;
    source._type = action._type || defaultType;
    if (action._id) {
        source._id = action._id;
    }
    return source;
}
function isJson(str) {
    try {
        JSON.parse(str);
    }
    catch (e) {
        return false;
    }
    return true;
}
class InputElasticsearchHttp {
    constructor(config, eventEmitter) {
        this.config = null;
        this.eventEmitter = null;
        this.config = config;
        this.eventEmitter = eventEmitter;
        if (config.workers) {
            this.config.workers = config.workers;
        }
        else {
            this.config.workers = 0;
        }
    }
    start() {
        if (this.config.workers && this.config.workers > 0) {
            throng({
                workers: this.config.workers,
                lifetime: Infinity
            }, this.startElasticsearchHttp.bind(this));
        }
        else {
            this.startElasticsearchHttp(1);
        }
    }
    stop(cb) {
        cb();
    }
    getHttpServer(aport, handler) {
        var _port = aport || process.env.PORT || 9200;
        if (aport === true) {
            _port = process.env.PORT;
        }
        var server = http.createServer(handler);
        try {
            var bindAddress = this.config.bindAddress || '0.0.0.0';
            server.listen(_port, bindAddress);
            logger_js_1.default.log('Logagent listening (http): ' + bindAddress + ':' + _port + ', process id: ' + process.pid);
            return server;
        }
        catch (err) {
            logger_js_1.default.log('Port in use (' + _port + '): ' + err);
        }
    }
    validateRequest(req, res) {
        var path = req.url.split('/');
        var result = {
            defaultIndex: null,
            defaultType: null,
            isBulk: false,
            isValid: true
        };
        if (/\/_nodes|\/_search|\/_cat|\/_count|\/_settings|\/_mapping|\/_aliases|\/_reindex|\/_cluster/.test(req.url)) {
            result.isValid = false;
            return result;
        }
        if (path.length === 2) {
            if (path[1] === '_bulk') {
                result.isBulk = true;
            }
        }
        if (path.length === 3) {
            if (path[2] === '_bulk') {
                result.isBulk = true;
            }
            else {
                result.defaultType = path[2];
            }
            if (path[1]) {
                result.defaultIndex = path[1];
            }
        }
        if (path.length === 4) {
            if (path[3] === '_bulk') {
                result.isBulk = true;
            }
            if (path[1]) {
                result.defaultIndex = path[1];
            }
            if (path[2]) {
                result.defaultType = path[2];
            }
        }
        return result;
    }
    elasticSearchHttpHandler(req, res) {
        try {
            var self = this;
            var reqInfo = self.validateRequest(req, res);
            if (!reqInfo.isValid) {
                return res.end(errResponse);
            }
            var bodyIn = '';
            req.on('data', function (data) {
                bodyIn += data;
            });
            req.on('end', function endHandler() {
                if (!reqInfo.isBulk) {
                    if (!bodyIn) {
                        return res.end();
                    }
                    var msg = {};
                    try {
                        msg = JSON.parse(bodyIn);
                    }
                    catch (err) {
                        logger_js_1.default.error('Invalid JSON: ' + bodyIn);
                        return;
                    }
                    msg._index = reqInfo.defaultIndex;
                    msg._type = reqInfo.defaultType;
                    return self.eventEmitter.emit('data.raw', fast_safe_stringify_1.default(msg), {
                        source: 'input-elasticsearch-http',
                        index: msg._index
                    });
                }
                var document = bodyIn.split('\n');
                var offSet = 0;
                var okResponse = {
                    took: 7,
                    errors: false,
                    items: []
                };
                document.forEach(function (line) {
                    if (isJson(document[offSet])) {
                        var lineObj = JSON.parse(document[offSet]);
                        if (lineObj.index) {
                            var source = JSON.parse(document[offSet + 1]);
                            offSet += 2;
                            var emitMsg = fast_safe_stringify_1.default(createIndexCall(lineObj.index, source, reqInfo.defaultIndex, reqInfo.defaultType));
                            var responseItem = {
                                index: {
                                    result: 'created',
                                    forced_refresh: false
                                },
                                _index: null,
                                _type: null,
                                _id: null
                            };
                            responseItem._index = source._index;
                            responseItem._type = source._type;
                            responseItem._id = source._id;
                            okResponse.items.push(responseItem);
                            self.eventEmitter.emit('data.raw', emitMsg, { source: 'input-elasticsearch-http', index: lineObj.index._index });
                        }
                        else {
                            logger_js_1.default.log('Command not supported yet: ' + document[offSet]);
                            offSet += 1;
                        }
                    }
                });
                res.end(fast_safe_stringify_1.default(okResponse));
            });
        }
        catch (err) {
            res.statusCode = 500;
            res.end();
            logger_js_1.default.error('Error in Elasticsearch HTTP: ' + err);
        }
    }
    startElasticsearchHttp(id) {
        this.getHttpServer(Number(this.config.port), this.elasticSearchHttpHandler.bind(this));
        var exitInProgress = false;
        var terminate = function (reason) {
            return function () {
                if (exitInProgress) {
                    return;
                }
                exitInProgress = true;
                logger_js_1.default.log('Stop Elasticsearch http worker: ' + id + ', pid:' + process.pid + ', terminate reason: ' + reason + ' memory rss: ' + (process.memoryUsage().rss / (1024 * 1024)).toFixed(2) + ' MB');
                setTimeout(process.exit, 250);
            };
        };
        process.once('SIGTERM', terminate('SIGTERM'));
        process.once('SIGINT', terminate('SIGINT'));
        process.once('exit', terminate('exit'));
    }
}
exports.default = InputElasticsearchHttp;
