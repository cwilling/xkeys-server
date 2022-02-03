#!/usr/bin/env node


/*	test_udp_client.js
*
*	SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
*	SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>
* 
*	A client for testing UDP communication with an xkeys-server using the
*	API described at https://gitlab.com/chris.willing/xkeys-server/-/tree/main/api
*/


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


client.on('message', (message, remote) => {
	//console.log('Msg Rcvd: ' + JSON.stringify(JSON.parse(message), null, 2) + "  from: " + JSON.stringify(remote));
	//console.log(`Msg Rcvd: ${JSON.stringify(JSON.parse(message))} from: ${JSON.stringify(remote)})`);
	var msg = "";
	try{
		msg = JSON.parse(message);
		if (msg.request == "result_EOI") {
			if (msg.data == "OK") {
				console.log(`EOI was accepted by ${msg.sid}`);
			} else {
				console.log(`EOI not accepted, returned: ${JSON.stringify(msg)}`);
			}
		} else if (msg.request == "result_deviceList") {
			var device_keys = Object.keys(msg.data);
			if (device_keys.length > 0 ){
				/* Choose a device randomly to display */
				var choice = Math.floor(Math.random() * device_keys.length);
				console.log(`Showing number ${choice} of ${device_keys.length} attached devices:`);
				console.log(JSON.stringify(msg.data[device_keys[choice]], null, 2));
			} else {
				console.log(`No devices attached at ${msg.sid}`);
			}
		} else if (msg.request == "result_productList") {
			var product_keys = Object.keys(msg.data);
			if (product_keys.length > 0 ){
				/* Choose a device randomly to display */
				var choice = Math.floor(Math.random() * product_keys.length);
				console.log(`Showing number ${choice} of ${product_keys.length} products:`);
				console.log(JSON.stringify(msg.data[product_keys[choice]]));
			} else {
			}
		} else if (msg.request == "device_event") {
			//console.log(JSON.stringify(JSON.parse(message)));
			/* FILTER for only "down" events
			*  - could be "up", "tbar", "jog", "shuttle", ...
			*
			*	To see without filtering i.e. see all events
			*	remove (or comment out) the following 'if' statement
			*/
			if (msg.data.type == "down") {
				//console.log(JSON.stringify(msg, null, 2));
				console.log(msg);
			}
		} else {
		}
	}
	catch (err) {
	}
});

send_udp_message = (message) => {
	var msg = "";
	try {
		msg = JSON.parse(message);
	}
	catch (err) {
		console.log(`Not sending invalid message: ${message}`);
		console.log(err);
	}
	client.send(message, 0, message.length, port, host, (err, bytes) => {
		if (err) {
			throw err;
		}
		console.log(`Sending ${msg.request} request to ${host}:${port}`);
	});
}

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
//setInterval(repeat_msg, 9000);


/* This is where we start doing things:
*	- send EOI
*	- some time later, request a list of devices attached to the server
*   - some time later, request a list of known products
*/
send_udp_message(new Buffer.from('{"request":"EOI"}', 'UTF-8'));
setTimeout(send_udp_message, 9000, (new Buffer.from('{"request":"deviceList"}', 'UTF-8')));
setTimeout(send_udp_message, 18000, (new Buffer.from('{"request":"productList"}', 'UTF-8')));

