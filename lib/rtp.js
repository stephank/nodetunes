
"use strict";

var dgram = require('dgram');
var tools = require('./helper');
var crypto = require('crypto');

function RtpServer(rtspServer) {

  this.rtspServer = rtspServer;

}

RtpServer.prototype.start = function() {

  this.baseServer = dgram.createSocket('udp4');
  this.controlServer = dgram.createSocket('udp4');
  this.timingServer = dgram.createSocket('udp4');

  this.baseServer.bind(this.rtspServer.ports[0]);
  this.controlServer.bind(this.rtspServer.ports[1]);
  this.timingServer.bind(this.rtspServer.ports[2]);

  this.timeoutCounter = -1;

  this.baseServer.on('message', function(msg) {

    var meta = msg.slice(0, 12);
    var sequenceNumber = meta.slice(2, 4).readUInt16BE(0);

    var encryptedAudio = msg.slice(12);

    var decipher = crypto.createDecipheriv('aes-128-cbc', this.rtspServer.audioAesKey, this.rtspServer.audioAesIv);
    decipher.setAutoPadding(false);

    var audio = decipher.update(encryptedAudio);
    this.rtspServer.audioProcessor.process(audio, sequenceNumber);

  }.bind(this));

  this.controlServer.on('message', function(msg) {

    // timeout logic for socket disconnects
    if (this.timeoutCounter === -1) {
      this.timeoutCounter = 0;

      var iv = setInterval(function() {
        this.timeoutCounter++;

        if (this.timeoutCounter >= this.rtspServer.controlTimeout) {
          clearInterval(iv);
          this.rtspServer.timeoutHandler();
        }

      }.bind(this), 1000);

    } else {
      this.timeoutCounter = 0;
    }

  }.bind(this));

  this.timingServer.on('message', function(msg) {
    //console.log(msg.length + ' BYTES SENT TO TIMING PORT');
  }.bind(this));

};

RtpServer.prototype.stop = function() {
  if (this.baseServer) {
    try {
      this.baseServer.close();
      this.controlServer.close();
      this.timingServer.close();
    } catch (err) {

    }
  }
};

module.exports = RtpServer;
