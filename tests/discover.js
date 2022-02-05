#!/usr/bin/env node

const discover_port = 48895;

var dgram = require("dgram");
var socket = dgram.createSocket("udp4");
socket.bind( () => {
	socket.setBroadcast(true);
});
var message = new Buffer.from('{"request":"DISCOVER"}');

socket.send(message, 0, message.length, discover_port, '255.255.255.255', function(err, bytes) {
});
socket.on("message", (msg, rinfo) => {
	console.log(`Rcvd reply: ${msg}`);
	socket.close();
});
