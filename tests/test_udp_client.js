#!/usr/bin/env node


/*	test_udp_client.js
*
*	SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
*	SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>
* 
*	A client for testing UDP communication with an xkeys-server using the
*	API described at https://gitlab.com/chris.willing/xkeys-server/-/tree/main/api
*/


const server_port = 48895;
let server_addr;

const dgram = require('dgram');
const client = dgram.createSocket('udp4');
client.bind( () => {
	client.setBroadcast(true);
});


client.on('message', (message, remote) => {
	//console.log('Msg Rcvd: ' + JSON.stringify(JSON.parse(message), null, 2) + "  from: " + JSON.stringify(remote));
	//console.log(`Msg Rcvd: ${JSON.stringify(JSON.parse(message))} from: ${JSON.stringify(remote)})`);
	var msg = "";
	try{
		msg = JSON.parse(message);
		if (msg.request == "result_DISCOVER") {
			console.log(`Received a result_DISCOVER message. Server address: ${msg.data}`);
			server_addr = msg.data;
			client.setBroadcast(true);
			send_udp_message(new Buffer.from('{"request":"EOI"}', 'UTF-8'));
		} else if (msg.request == "result_EOI") {
			if (msg.data == "OK") {
				   console.log(`EOI was accepted by ${msg.sid}`);
				   begin_normal_operations();
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
				console.log(`No products available at ${msg.sid}`);
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
	client.send(message, 0, message.length, server_port, server_addr, (err, bytes) => {
		if (err) {
			throw err;
		}
		console.log(`Sending ${msg.request} request to ${server_addr}:${server_port}`);
	});
}


/* This is where we start doing things:
*	- send DISCOVERY
*	- send EOI
*	- some time later, request a list of devices attached to the server
*	- some time later, request a list of known products
*/

/* Find the xkeys-server
*/
var discovery_message = new Buffer.from('{"request":"DISCOVER"}');
client.send(discovery_message, 0, discovery_message.length, server_port, '255.255.255.255', function(err, bytes) {
});


begin_normal_operations = () => {
	/*	At intervals, request some things.
	*/
	setTimeout(send_udp_message, 9000, (new Buffer.from('{"request":"deviceList"}', 'UTF-8')));
	setTimeout(send_udp_message, 18000, (new Buffer.from('{"request":"productList"}', 'UTF-8')));
}


