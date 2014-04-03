"use strict";

var dgram = require('dgram');
var tools = require('./rtspHelper');
var crypto = require('crypto');
var PriorityQueue = require('priorityqueuejs');

var RtpServer = function(rtspServer) {
  var self = this;
  var crypto = require('crypto');

  var STAGE_WAIT_DELAY = 100;
  var STAGE_FINAL_DELAY = 100;

  var waitBuffer = new PriorityQueue(function(a, b) {
    return b.sequenceNumber - a.sequenceNumber;
  });
  var waitLastSequence = -1;

  var stagingBuffer = new PriorityQueue(function(a, b) {
    return b.sequenceNumber - a.sequenceNumber;
  });

  var requestRetransmit = function(startSequence, length) {
    console.log('requesting retransmit for', startSequence, 'to', startSequence + length, '- total:', length);
    //var msg = new Buffer(12);
    //socket.send(msg, 0, msg.length, port, );
  };

  RtpServer.prototype.start = function() {
    self.baseServer = dgram.createSocket('udp4');
    self.controlServer = dgram.createSocket('udp4');
    self.timingServer = dgram.createSocket('udp4');

    self.baseServer.bind(rtspServer.ports[0]);
    self.controlServer.bind(rtspServer.ports[1]);
    self.timingServer.bind(rtspServer.ports[2]);

    // audio messages
    self.baseServer.on('message', function(msg) {

      var meta = msg.slice(0, 12);
      var sequenceNumber = meta.slice(2, 4).readUInt16BE(0);
      var rtpType = meta.readUInt8(1) & 0x7f;

      var encryptedAudio = msg.slice(12);

      var decipher = crypto.createDecipheriv('aes-128-cbc', rtspServer.audioAesKey, rtspServer.audioAesIv);
      decipher.setAutoPadding(false);

      var audio = decipher.update(encryptedAudio);

      if (rtpType == 96) {

        waitBuffer.enq({ buffer: audio, sequenceNumber: sequenceNumber });
        // there's a one to one relationship between sequences written in, and setTimeout's set...
        setTimeout(function() {
          var current = waitBuffer.deq();
          if (current.sequenceNumber - 1 != waitLastSequence && waitLastSequence != -1) {
            // we're missing packets between waitLastSequence + 1 to current.sequenceNumber - 1, inclusive
            requestRetransmit(waitLastSequence + 1, current.sequenceNumber - waitLastSequence - 1);
          }

          waitLastSequence = current.sequenceNumber;
          stagingBuffer.enq(current);

          setTimeout(function() {

            var current = stagingBuffer.deq();
            rtspServer.audioProcessor.process(current.buffer, current.sequenceNumber);

          }, 100);

        }, STAGE_WAIT_DELAY);
      } else if (rtpType == 85) {
        // retransmit reply
          stagingBuffer.enq({ buffer: audio, sequenceNumber: sequenceNumber });

          setTimeout(function() {

            var current = stagingBuffer.deq();
            rtspServer.audioProcessor.process(current.audio, current.sequenceNumber);

          }, 100);
      }

    });

    self.controlServer.on('message', function(msg) {
      var timestamp = msg.readUInt32BE(4);
    });

    self.timingServer.on('message', function(msg) {
      //console.log(msg.length + ' BYTES SENT TO TIMING PORT');
    });

  };

  RtpServer.prototype.stop = function() {
    self.baseServer.close();
    self.controlServer.close();
    self.timingServer.close();
  }

  RtpServer.prototype.notifyMissing
}

module.exports = RtpServer;
