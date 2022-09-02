#!/usr/bin/env node


/*	mpv_transport.js
*
*	SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
*	SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>
* 
*	A client for testing UDP communication with an xkeys-server using the
*	API described at https://gitlab.com/chris.willing/xkeys-server/-/tree/main/api
*
*	In particular, listen for jog/shuttle/button events and pass to an mpv instance.
*/


let target_device;
const myArgs = process.argv.slice(2);
if (myArgs.length > 0) {
   target_device = myArgs[0];
} else {
   target_device = "1523-1062-";	// XK12 Jog/Shuttle
}

var PLAYER = "mpv";
if (process.env.mpvname) { PLAYER = process.env.mpvname };

const { exec } = require('child_process');

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
		} else if (msg[msg_type] == "list_attached_result") {
			var device_keys = Object.keys(msg.devices);
			if (device_keys.length > 0 ){
				console.log(JSON.stringify(msg.devices));
			} else {
				console.log(`No devices attached at ${msg.server_id}`);
			}
		} else if (msg[msg_type] == "product_list_result") {
		} else if (msg[msg_type] == "command_result") {
			console.log(`Received command_result: ${JSON.stringify(msg)}`);
		} else if (msg[msg_type] == "list_clients_result") {
			console.log(`Received list_clients_result: ${JSON.stringify(msg)}`);
		} else if (msg[msg_type] == "disconnect_warning") {
			console.log(`Received disconnect_warning: ${JSON.stringify(msg)}`);
			console.log(`${Date.call()}`);
			//	Stay connected
			setTimeout(send_udp_message, 10, (new Buffer.from('{"msg_type":"connect"}', 'UTF-8')));
		} else if (msg[msg_type] == "disconnect_result") {
			console.log(`Received disconnect_result: ${JSON.stringify(msg)}`);
		} else if (msg[msg_type] == "error") {
			console.log(`Received ERROR msg: ${JSON.stringify(msg)}`);
		} else if (msg[msg_type] == "button_event") {
			if (msg.value == 0) {
				//	We're only interested in DOWN events
				return;
			}
			console.log(`Received button event: ${JSON.stringify(msg)}`);
			console.log(`Received button index: ${msg.control_id}`);
			const keyIndex = msg.control_id
			if (keyIndex == 9) {
				console.log(`Have space`);
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key space');
			}
			else if (keyIndex == 3) {
				console.log(`Have speed decrease`);
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key braceleft');
			}
			else if (keyIndex == 12) {
				console.log(`Have speed increase`);
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key braceright');
			}
			else if (keyIndex == 6 ) {
				console.log(`Have Backspace`);
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key BackSpace');
			}
		} else if (msg[msg_type] == "shuttle_event") {
			//console.log(`Received shuttle event: ${JSON.stringify(msg)}`);

			//	Denormalise back to discreet shuttle values 0->7
			const shuttlePos = Math.round(msg.value * 7);
			if (shuttlePos == 0 ) {
				//	Set forward direction and set pause yes
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key alt+KP_0 key question');
			}
			else if (shuttlePos == -1 ) {
				//	Set reverse direction, set speed to preset 1 and set pause no
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key ctrl+KP_0 key Shift+KP_1 key ctrl+slash');
			}
			else if (shuttlePos == 1 ) {
				//	Set forward direction, set speed to preset 1 and set pause no
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key alt+KP_0 key Shift+KP_1 key ctrl+slash');
			}
			else {
				//	Set speed to preset assigned to shuttle position (2-7)
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key shift+KP_' + Math.abs(shuttlePos));
			}
		} else if (msg[msg_type] == "jog_event") {
			console.log(`Received jog event: ${JSON.stringify(msg)}`);
			if (msg.value > 0) {
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key period');
			} else {
				exec('xdotool search --onlyvisible --name ' + PLAYER + ' key comma');
			}
		} else if (/.*_event/.exec(msg[msg_type])) {
			/*	See all events */
			console.log(`xxxx ${JSON.stringify(JSON.parse(message))}`);

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
	/*
	var msg = "";
	try {
		msg = JSON.parse(message);
	}
	catch (err) {
		console.log(`Not sending invalid message: ${message}`);
		console.log(err);
		return;
	}
	*/

	client.send(message, 0, message.length, server_port, server_addr, (err, bytes) => {
		if (err) {
			throw err;
		}
		//console.log(`Sending ${msg["msg_type"]} request to ${server_addr}:${server_port}`);
	});
}

choose_server = (device_quad) => {
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
		setTimeout(choose_server, 1000, target_device);
	} else {
		if (device_quad) {
			/* Extract the entry containing device_quad as one of the connected devices.
			*/
			const target = discovered_hosts.find(entry => {
				console.log(`zzz ${JSON.stringify(entry.attached_devices)}`);
				console.log(`zzz ${JSON.stringify(entry.attached_devices).search(device_quad)}`);
				return JSON.stringify(entry.attached_devices).search(device_quad) > -1;
			});
			if (target) {
				console.log(`Choice: ${JSON.stringify(target)}`);
				console.log(`Choice: ${target.server_id} at ${target.xk_server_address}`);
				server_addr = target.xk_server_address;
				client.setBroadcast(false);
				send_udp_message(new Buffer.from('{"msg_type":"connect"}', 'UTF-8'));
			} else {
				/* Something went wrong so start all over */
				console.log(`Couldn't find server device matching ${device_quad}`);
				console.log("Finding server ...");
				client.send(discovery_message, 0, discovery_message.length, server_port, '255.255.255.255', function(err, bytes) { });
				setTimeout(choose_server, 1000, device_quad);
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
*/

/*	Find the xkeys-server
*	See discovery.js for detail on how this works.
*/
var discovery_message = new Buffer.from('{"msg_type":"discover"}');
choose_server(target_device);


setTimeout(send_udp_message, 5000, (new Buffer.from('{"msg_type":"product_list"}', 'UTF-8')));
