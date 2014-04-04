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

  var lastRInfo = null;

  var requestRetransmit = function(startSequence, length) {
    if (!lastRInfo) return;

    console.log('requesting retransmit for', startSequence, 'to', startSequence + length, '- total:', length);
    var msg = new Buffer(12);
    msg.writeUInt8(0x80, 0); // 2 bit version = 2, 1 bit padding = 0, 1 bit ext = 0, 2 bit -- = 0
    msg.writeUInt8(0x80, 2); // 1 bit marker = 1, 7 bit seqno = 0?
    msg.writeUInt32BE(new Date().getTime() / 1000, 4); // 4 byte timestamp
    msg.writeUInt16BE(sequenceNumber, 9); // 2 byte seq no start
    msg.writeUInt16BE(length, 11); // 2 byte length
    socket.send(msg, 0, msg.length, lastRInfo.port, lastRInfo.address);
  };

  RtpServer.prototype.start = function() {
    self.baseServer = dgram.createSocket('udp4');
    self.controlServer = dgram.createSocket('udp4');
    self.timingServer = dgram.createSocket('udp4');

    self.baseServer.bind(rtspServer.ports[0]);
    self.controlServer.bind(rtspServer.ports[1]);
    self.timingServer.bind(rtspServer.ports[2]);

    // audio messages
    self.baseServer.on('message', function(msg, rinfo) {

      lastRInfo = rinfo;

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

          }, STAGE_FINAL_DELAY);

        }, STAGE_WAIT_DELAY);

      } else if (rtpType == 85) {
        // retransmit reply
          stagingBuffer.enq({ buffer: audio, sequenceNumber: sequenceNumber });

          setTimeout(function() {

            var current = stagingBuffer.deq();
            rtspServer.audioProcessor.process(current.audio, current.sequenceNumber);

          }, STAGE_FINAL_DELAY);
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
  
}

module.exports = RtpServer;
