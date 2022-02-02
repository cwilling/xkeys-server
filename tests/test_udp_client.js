#!/usr/bin/env node


const dgram = require('dgram');
const client = dgram.createSocket('udp4');

const default_host = '0.0.0.0';
const default_port = 48895;
var host = default_host;
var port = default_port;

const myArgs = process.argv.slice(2);
if (myArgs.length > 0) {
	host = myArgs[0];
}
if (myArgs.length > 1) {
	port = parseInt(myArgs[1]);
}
console.log(`Connecting to ${host}:${port}`);

const message = new Buffer.from('Hello Server', "UTF-8");

client.on('message', (message, remote) => {
	console.log('Msg Rcvd: ' + JSON.stringify(JSON.parse(message), null, 2) + "  from: " + JSON.stringify(remote));
});

client.send(message, 0, message.length, port, host, (err, bytes) => {
	if (err) {
		throw err;
	}
	console.log(`EOI sent to ${host}:${port}`);
});


/* Occasional msg back to server */
repeat_msg = () => {
	const message = new Buffer.from('Hello again, Server', "UTF-8");
	client.send(message, 0, message.length, port, host, (err, bytes) => {
		if (err) {
			throw err;
		}
		console.log(`Repeat msg sent to ${host}:${port}`);
	});
}
setInterval(repeat_msg, 9000)
