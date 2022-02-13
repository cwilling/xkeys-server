#!/usr/bin/env node


/*	test_udp_client.js
*
*	SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
*	SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>
* 
*	A client for testing UDP communication with an xkeys-server using the
*	API described at https://gitlab.com/chris.willing/xkeys-server/-/tree/main/api
*/


let target_serverId;
const myArgs = process.argv.slice(2);
if (myArgs.length > 0) {
   target_serverId = myArgs[0];
}

const server_port = 48895;
let server_addr;
const discovered_hosts = [];

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
		let msg_type;
		if (msg.hasOwnProperty('msg_type')) {
			msg_type = 'msg_type';
		} else {
			msg_type = 'request';
		}
		if (msg[msg_type] == "discover_result") {
			console.log(`Received a discover_result message. Server address: ${msg.xk_server_address}`);
			if (discovered_hosts.find(entry => { return entry.xk_server_address === msg.xk_server_address ; }) ) {
				/* We have already seen this server */
				console.log(`Not adding duplicate ${msg.xk_server_address}`);
			} else {
				console.log(`Adding server: ${JSON.stringify(msg)}`);
				discovered_hosts.push(msg);
			}
		} else if (msg[msg_type] == "connect_result") {
		   console.log(`connect was accepted by ${msg.sid}`);
		   begin_normal_operations();
		} else if (msg[msg_type] == "result_deviceList") {
			var device_keys = Object.keys(msg.data);
			if (device_keys.length > 0 ){
				/* Choose a device randomly to display */
				var choice = Math.floor(Math.random() * device_keys.length);
				console.log(`Showing number ${(choice + 1)} of ${device_keys.length} attached device(s):`);
				console.log(JSON.stringify(msg.data[device_keys[choice]], null, 2));
			} else {
				console.log(`No devices attached at ${msg.sid}`);
			}
		} else if (msg[msg_type] == "result_productList") {
			var product_keys = Object.keys(msg.data);
			if (product_keys.length > 0 ){
				/* Choose a device randomly to display */
				var choice = Math.floor(Math.random() * product_keys.length);
				console.log(`Showing number ${(choice + 1)} of ${product_keys.length} product(s):`);
				console.log(JSON.stringify(msg.data[product_keys[choice]]));
			} else {
				console.log(`No products available at ${msg.sid}`);
			}
		} else if (/.*_event/.exec(msg[msg_type])) {
			/*	See all events */
			console.log(JSON.stringify(JSON.parse(message)));

			/* OR, to filter to see only "down" events
			*  - could be "up", "tbar", "jog", "shuttle", ...
			*
				if (msg.data.type == "down") {
					console.log(msg);
				}
			*/
		} else {
		}
	}
	catch (err) {
	}
});

send_udp_message = (message) => {
	/*	Before sending message, check that it's valid JSON */
	var msg = "";
	try {
		msg = JSON.parse(message);
	}
	catch (err) {
		console.log(`Not sending invalid message: ${message}`);
		console.log(err);
		return;
	}

	client.send(message, 0, message.length, server_port, server_addr, (err, bytes) => {
		if (err) {
			throw err;
		}
		console.log(`Sending ${msg["msg_type"]} request to ${server_addr}:${server_port}`);
	});
}

choose_server = (sid) => {
	if (discovered_hosts.length == 0) {
		/* No servers found so try again
		*/
		console.log("Finding server ...");
		try {
			client.setBroadcast(true);
		}
		catch (err) {
		}
		client.send(discovery_message, 0, discovery_message.length, server_port, '255.255.255.255', function(err, bytes) { });
		setTimeout(choose_server, 1000, sid);
	} else {
		if (sid) {
			/* Extract the entry with matching SID
			*/
			const target = discovered_hosts.find(entry => { return entry.sid === sid ; });
			if (target) {
				console.log(`Choice: ${target.sid} at ${target.data}`);
				server_addr = target.data;
				client.setBroadcast(false);
				send_udp_message(new Buffer.from('{"msg_type":"connect"}', 'UTF-8'));
			} else {
				/* Something went wrong so start all over */
				console.log(`Couldn't find server with SID matching ${sid}`);
				console.log("Finding server ...");
				client.send(discovery_message, 0, discovery_message.length, server_port, '255.255.255.255', function(err, bytes) { });
				setTimeout(choose_server, 1000, sid);
			}
		} else {
			var choice = discovered_hosts[0];
			console.log(`Choosing server: ${choice.sid} at ${choice.xk_server_address}`);
			server_addr = choice.xk_server_address;
			client.setBroadcast(false);
			send_udp_message(new Buffer.from('{"msg_type":"connect"}', 'UTF-8'));
		}
	}
}



/* This is where we start doing things:
*	- send DISCOVERY
*	- choose server from respondents
*	- send connect to chosen server
*	- if connect_result is OK, begin_normal_operations
*		- some time later, request a method on connected devices (start LED flashing)
*		- some time later, request a list of devices attached to the server
*		- some time later, request a method on connected devices (stop LED)
*		- some time later, request a list of known products
*/

/*	Find the xkeys-server
*	See discovery.js for detail on how this works.
*/
var discovery_message = new Buffer.from('{"msg_type":"discover"}');
choose_server(target_serverId);


begin_normal_operations = () => {
	/*	At intervals, request some things.
	*/
	setTimeout(send_udp_message, 9000, (new Buffer.from('{"msg_type":"deviceList"}', 'UTF-8')));
	setTimeout(send_udp_message, 18000, (new Buffer.from('{"msg_type":"productList"}', 'UTF-8')));

	setTimeout(send_udp_message, 4000, (new Buffer.from('{"msg_type":"method","pid_list":[],"uid":"","name":"setIndicatorLED","params":[["2"],true,true]}', 'UTF-8')));
	setTimeout(send_udp_message, 15000, (new Buffer.from('{"msg_type":"method","pid_list":[],"uid":"","name":"setIndicatorLED","params":[["2"],false]}', 'UTF-8')));
}


