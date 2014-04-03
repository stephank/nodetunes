"use strict";

var PriorityQueue = require('priorityqueuejs');

var AudioProcessor = function(rtspServer) {
  var self = this;

  AudioProcessor.prototype.process = function(audio, sequenceNumber) {
    var swapBuf = new Buffer(audio.length);

    // endian hack
    for (var i = 0; i < audio.length; i += 2) {
      swapBuf[i] = audio[i + 1];
      swapBuf[i + 1] = audio[i];
    }

    rtspServer.outputStream.write(swapBuf);
  };

};

module.exports = AudioProcessor;
