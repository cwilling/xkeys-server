#!/usr/bin/env node


/*	test_udp_client.js
*
*	SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
*	SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>
* 
*	A client for testing UDP communication with an xkeys-server using the
*	API described at https://gitlab.com/chris.willing/xkeys-server/-/tree/main/api
*/

//const { PRODUCTS } = require('../node_modules/@xkeys-lib/core/dist/products');
const PRODUCTS = require('./btest/products');
console.log(`package products = ${PRODUCTS}`);

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
			console.log(`Received connect_result: ${JSON.stringify(msg)}`);
			//begin_normal_operations();
		} else if (msg[msg_type] == "list_attached_result") {
			var device_keys = Object.keys(msg.devices);
			if (device_keys.length > 0 ){
				console.log(JSON.stringify(msg.devices));
				/* Choose a device randomly to display */
				var choice = Math.floor(Math.random() * device_keys.length);
				console.log(`Showing number ${(choice + 1)} of ${device_keys.length} attached device(s) (${device_keys[choice]}):`);
				console.log(JSON.stringify(msg.devices[device_keys[choice]], null, 2));
			} else {
				console.log(`No devices attached at ${msg.server_id}`);
			}
		} else if (msg[msg_type] == "product_list_result") {
			var product_keys = Object.keys(msg.data);
			if (product_keys.length > 0 ){
				/* Choose a device randomly to display */
				var choice = Math.floor(Math.random() * product_keys.length);
				console.log(`Showing number ${(choice + 1)} of ${product_keys.length} product(s):`);
				console.log(JSON.stringify(msg.data[product_keys[choice]]));
			} else {
				console.log(`No products available at ${msg.server_id}`);
			}
		} else if (msg[msg_type] == "command_result") {
			console.log(`Received command_result: ${JSON.stringify(msg)}`);
		} else if (msg[msg_type] == "list_clients_result") {
			console.log(`Received list_clients_result: ${JSON.stringify(msg)}`);
		} else if (msg[msg_type] == "disconnect_result") {
			console.log(`Received disconnect_result: ${JSON.stringify(msg)}`);
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

choose_server = (server_id) => {
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
		setTimeout(choose_server, 1000, server_id);
	} else {
		if (server_id) {
			/* Extract the entry with matching SID
			*/
			const target = discovered_hosts.find(entry => { return entry.server_id === server_id ; });
			if (target) {
				console.log(`Choice: ${target.server_id} at ${target.data}`);
				server_addr = target.data;
				client.setBroadcast(false);
				send_udp_message(new Buffer.from('{"msg_type":"connect"}', 'UTF-8'));
			} else {
				/* Something went wrong so start all over */
				console.log(`Couldn't find server with SID matching ${server_id}`);
				console.log("Finding server ...");
				client.send(discovery_message, 0, discovery_message.length, server_port, '255.255.255.255', function(err, bytes) { });
				setTimeout(choose_server, 1000, server_id);
			}
		} else {
			var choice = discovered_hosts[0];
			console.log(`Choosing server: ${choice.server_id} at ${choice.xk_server_address}`);
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
*		- some time later, request a command to connected devices (start LED flashing)
*		- some time later, request a list of devices attached to the server
*		- some time later, request a command to connected devices (stop LED)
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
	//setTimeout(send_udp_message, 9000, (new Buffer.from('{"msg_type":"list_attached"}', 'UTF-8')));
	//setTimeout(send_udp_message, 18000, (new Buffer.from('{"msg_type":"product_list"}', 'UTF-8')));


	// LEDs
	//setTimeout(send_udp_message, 4000, (new Buffer.from('{"msg_type":"command","command_type":"set_indicator_led","product_id":1029,"unit_id":-1,"duplicate_id":-1,"control_id":2,"value":1,"flash":1}', 'UTF-8')));
	//setTimeout(send_udp_message, 15000, (new Buffer.from('{"msg_type":"command","command_type":"set_indicator_led","product_id":-1,"unit_id":-1,"duplicate_id":-1,"control_id":2,"value":0}', 'UTF-8')));

	// Button lamps
	//setTimeout(send_udp_message, 3000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight","product_id":1325,"unit_id":-1,"duplicate_id":-1,"control_id":[9,17,25,33],"value":1,"color":"blue","flash":1}', 'UTF-8')));
	//setTimeout(send_udp_message, 8000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight","product_id":1325,"unit_id":-1,"duplicate_id":-1,"control_id":[9,17,25,33],"value":0,"flash":0}', 'UTF-8')));

	/*
	// AllBacklights
	setTimeout(send_udp_message, 1000, (new Buffer.from('{"msg_type":"command","command_type":"set_all_backlights","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":0}', 'UTF-8')));
	setTimeout(send_udp_message, 2000, (new Buffer.from('{"msg_type":"command","command_type":"set_all_backlights","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":1}', 'UTF-8')));
	setTimeout(send_udp_message, 5000, (new Buffer.from('{"msg_type":"command","command_type":"set_all_backlights","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":0}', 'UTF-8')));
	setTimeout(send_udp_message, 6000, (new Buffer.from('{"msg_type":"command","command_type":"set_all_backlights","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":1,"color":"red"}', 'UTF-8')));
	setTimeout(send_udp_message, 10000, (new Buffer.from('{"msg_type":"command","command_type":"set_all_backlights","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":0}', 'UTF-8')));
	setTimeout(send_udp_message, 14000, (new Buffer.from('{"msg_type":"command","command_type":"set_all_backlights","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":1,"color":"blue"}', 'UTF-8')));
	*/

	// Flash rate
	//setTimeout(send_udp_message, 3800, (new Buffer.from('{"msg_type":"command","command_type":"set_flash_rate","product_id":-1,"unit_id":-1,"duplicate_id":-1,"value":4}', 'UTF-8')));
	//setTimeout(send_udp_message, 5000, (new Buffer.from('{"msg_type":"command","command_type":"set_flash_rate","product_id":-1,"unit_id":-1,"duplicate_id":-1,"value":24}', 'UTF-8')));

	// LCD text
	//setTimeout(send_udp_message, 2000, (new Buffer.from('{"msg_type":"command","command_type":"write_lcd_display","product_id":1316,"unit_id":-1,"duplicate_id":-1,"line":2,"text":"UDP: coming soon"}', 'UTF-8')));

	/*
	// Intensity
	setTimeout(send_udp_message, 1000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight_intensity","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":128, "color":"red"}', 'UTF-8')));
	setTimeout(send_udp_message, 3000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight_intensity","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":128, "color":"blue"}', 'UTF-8')));
	setTimeout(send_udp_message, 6000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight_intensity","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":128, "color":"purple"}', 'UTF-8')));
	setTimeout(send_udp_message, 9000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight_intensity","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":255, "color":"red"}', 'UTF-8')));
	setTimeout(send_udp_message, 12000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight_intensity","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":[128,128], "color":"orange"}', 'UTF-8')));
	setTimeout(send_udp_message, 15000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight_intensity","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":[0,255], "color":"orange"}', 'UTF-8')));
	setTimeout(send_udp_message, 18000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight_intensity","product_id":1325,"unit_id":-1,"duplicate_id":-1,"value":[255,0]}', 'UTF-8')));
	*/

	/*
	// New unit_id
	*/
	setTimeout(send_udp_message, 4000, (new Buffer.from('{"msg_type":"command","command_type":"set_unit_id","product_id":1325,"unit_id":2,"duplicate_id":0,"new_unit_id":1}', 'UTF-8')));

	/*
	// Save Backlight
	setTimeout(send_udp_message, 2500, (new Buffer.from('{"msg_type":"command","command_type":"set_all_backlights","product_id":1325,"unit_id":2,"duplicate_id":0,"value":1,"color":"purple"}', 'UTF-8')));
	setTimeout(send_udp_message, 4000, (new Buffer.from('{"msg_type":"command","command_type":"set_backlight_intensity","product_id":1325,"unit_id":2,"duplicate_id":0,"value":[128,0]}', 'UTF-8')));
	setTimeout(send_udp_message, 5000, (new Buffer.from('{"msg_type":"command","command_type":"save_backlight","product_id":1325,"unit_id":2,"duplicate_id":0}', 'UTF-8')));
	*/

	// list_clients
	setTimeout(send_udp_message, 5000, (new Buffer.from('{"msg_type":"list_clients"}', 'UTF-8')));

	// disconnect
	//setTimeout(send_udp_message, 12000, (new Buffer.from('{"msg_type":"disconnect"}', 'UTF-8')));

}

/*
//	Another connect (change name?)
setTimeout(send_udp_message, 3000, (new Buffer.from('{"msg_type":"connect"}', 'UTF-8')));
setTimeout(send_udp_message, 5000, (new Buffer.from('{"msg_type":"connect", "client_name":"topsy turvy"}', 'UTF-8')));
setTimeout(send_udp_message, 6000, (new Buffer.from('{"msg_type":"disconnect"}', 'UTF-8')));

setTimeout(send_udp_message, 7000, (new Buffer.from('{"msg_type":"connect", "client_name":"topsy turvy"}', 'UTF-8')));
setTimeout(send_udp_message, 8000, (new Buffer.from('{"msg_type":"connect", "client_name":"daisy"}', 'UTF-8')));
setTimeout(send_udp_message, 11000, (new Buffer.from('{"msg_type":"connect"}', 'UTF-8')));

setTimeout(send_udp_message, 15000, (new Buffer.from('{"msg_type":"list_clients"}', 'UTF-8')));

setTimeout(send_udp_message, 16000, (new Buffer.from('{"msg_type":"connect"}', 'UTF-8')));
setTimeout(send_udp_message, 18000, (new Buffer.from('{"msg_type":"product_list"}', 'UTF-8')));

setTimeout(send_udp_message, 27000, (new Buffer.from('{"msg_type":"list_clients"}', 'UTF-8')));
*/

product_list_message = {"msg_type":"new_products", "data":PRODUCTS};
setTimeout(send_udp_message, 4000, (JSON.stringify(product_list_message)));
