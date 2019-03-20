"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const os = require("os");
const Tail = require("tail-forever");
const glob = require("glob");
const logger_js_1 = require("../../util/logger.js");
function getFilesizeInBytes(filename) {
    try {
        var stats = fs.statSync(filename);
        return stats.size;
    }
    catch (fsErr) {
        return -1;
    }
}
class InputFile {
    constructor(options, eventEmitter) {
        this.eventEmitter = null;
        this.options = null;
        this.filesToWatch = null;
        this.fileNamesToWatch = null;
        this.scanCounter = null;
        this.stats = null;
        this.sigTermHandled = null;
        this.laStats = null;
        this.activated = null;
        this.filePointers = null;
        this.globPattern = null;
        this.eventEmitter = eventEmitter;
        this.options = options;
        this.filesToWatch = [];
        this.fileNamesToWatch = [];
        this.scanCounter = 0;
        this.stats = {};
        this.sigTermHandled = false;
        this.laStats = require('../../core/printStats');
        this.laStats.fileManger = this;
        this.activated = false;
    }
    stop(cb) {
        this.terminate();
        cb();
    }
    start() {
        var globPattern = this.options.glob || process.env.GLOB_PATTERN;
        if (this.options.args && this.options.args.length > 0) {
            this.filePointers = this.readFilePointers();
            this.tailFiles(this.options.args);
            this.activated = true;
        }
        if (globPattern) {
            this.activated = true;
            if (!this.filePointers) {
                this.filePointers = this.readFilePointers();
            }
            globPattern = globPattern.replace(/"/g, '').replace(/'/g, '').replace(/\s/g, '');
            logger_js_1.default.log('using glob pattern: ' + globPattern);
            this.tailFilesFromGlob(globPattern, 60000);
        }
    }
    tailFiles(fileList) {
        fileList.forEach(this.tailFile.bind(this));
    }
    getTempDir() {
        return this.options.diskBufferDir || process.env.LOGSENE_TMP_DIR || os.tmpdir();
    }
    getTailPosition(file) {
        var storedPos = this.filePointers[file];
        var tailStartPosition = Number(this.options.tailStartPosition);
        if ((this.options.tailStartPosition !== undefined) || !storedPos) {
            logger_js_1.default.debug('no position stored for ' + file);
            var pos = { start: getFilesizeInBytes(file) };
            if (this.options.tailStartPosition !== undefined && !isNaN(tailStartPosition)) {
                if (tailStartPosition >= 0) {
                    pos.start = tailStartPosition;
                }
                else {
                    pos.start = Math.max(pos.start + tailStartPosition, 0);
                }
            }
            return pos;
        }
        else {
            var fd = fs.openSync(file, 'r');
            var stat = fs.fstatSync(fd);
            if (stat.ino === storedPos.inode) {
                return { start: storedPos.pos, inode: storedPos.inode };
            }
            else {
                logger_js_1.default.debug('Watching file ' + file + ' inode changed, set tail position = 0');
                return { start: 0 };
            }
        }
    }
    tailFilesFromGlob(globPattern, scanTime) {
        if (globPattern) {
            glob(globPattern, {
                strict: false,
                silent: false
            }, function globCb(err, files) {
                if (!err) {
                    this.tailFiles(files);
                }
                else {
                    logger_js_1.default.error('Error in glob file patttern ' + globPattern + ': ' + err.message);
                }
            }.bind(this));
            if (!this.globPattern && scanTime > 0) {
                this.globPattern = globPattern;
                setInterval(function scanFilesTimer() {
                    this.scanCounter = 1;
                    this.tailFilesFromGlob(this.globPattern, scanTime);
                }.bind(this), scanTime);
            }
        }
    }
    tailFile(file) {
        var tail = null;
        var pos = { start: 0 };
        if (this.fileNamesToWatch.indexOf(file) > -1) {
            return null;
        }
        try {
            pos = this.getTailPosition(file);
        }
        catch (error) {
            pos = { start: 0 };
        }
        if (this.scanCounter > 0) {
            logger_js_1.default.log('New file detected: ' + file);
            pos = { start: 0 };
        }
        try {
            if (pos.start === -1) {
                pos.start = 0;
            }
            tail = new Tail(file, pos);
            this.filesToWatch.push(tail);
            this.fileNamesToWatch.push(file);
            var context = { sourceName: file, startPos: pos };
            tail.on('line', function (line) {
                this.stats[file] = (this.stats[file] || 0) + 1;
                this.eventEmitter.emit('data.raw', line, context);
            }.bind(this));
            tail.on('error', function (error) {
                var errMessage = 'ERROR tailing file ' + file + ': ' + error;
                logger_js_1.default.error(errMessage);
                this.eventEmitter.emit('error', errMessage, { file: file, error: error });
            }.bind(this));
            logger_js_1.default.log('Watching file:' + file + ' from position: ' + pos.start);
            return tail;
        }
        catch (error) {
            logger_js_1.default.log('ERROR tailing file ' + file + ': ' + error);
            return null;
        }
    }
    terminate() {
        if (!this.sigTermHandled && this.activated) {
            this.sigTermHandled = true;
            this.savePositions();
        }
    }
    savePositions() {
        var filePositions = this.filesToWatch.map(function filesToWatchMap(tailObj) {
            try {
                var position = tailObj.unwatch();
                position.fileName = tailObj.filename;
                logger_js_1.default.log('Stop watching ' + tailObj.filename + ' inode: ' + position.inode + ' pos:' + position.pos);
                return position;
            }
            catch (fileExistsError) {
                return null;
            }
        });
        try {
            var fileName = path.join(this.getTempDir(), 'logagentTailPointers.json');
            fs.writeFileSync(fileName, JSON.stringify(filePositions));
            logger_js_1.default.log('File positions stored in: ' + fileName);
        }
        catch (err) {
            logger_js_1.default.log('error writing file pointers:' + err);
        }
    }
    readFilePointers() {
        var filePointers = {};
        try {
            var fileName = path.join(this.getTempDir(), 'logagentTailPointers.json');
            var fp = fs.readFileSync(fileName).toString();
            var filePointerArr = JSON.parse(fp);
            filePointerArr.forEach(function storeFp(f) {
                filePointers[f.fileName] = { pos: f.pos, inode: f.inode };
            });
            if (Object.keys(filePointers).length > 0) {
                logger_js_1.default.debug(JSON.stringify(filePointers, null, '\t'));
            }
            fs.unlinkSync(fileName);
        }
        catch (err) {
            logger_js_1.default.log('No stored file postions (file not found):' + fileName);
        }
        return filePointers;
    }
}
exports.default = InputFile;
