#!/usr/bin/env node

/*	discover.js
*
*	Discover the ip address of a service using port 48895
*	which we expect an xkeys_server to be using.
*
*	Any reply with a field "request":"result_DISCOVER" is
*   potentially a server we'll wish to use, so is added
*	to discovered_hosts[] provided it doesn't duplicate
*	a previous reply.
*
*	If no servers reply immediately we go through another
*	discovery attempt, repeating every 2 seconds indefinitely
*	until a server replies.
*
*	It is possible the multiple servers respond, requiring a
*	decision about which one to use. In this example, the
*	server found in discovered_hosts[] is chosen unless
*	the desired server Id is known and passed to discover.js
*	as the first argument e.g.
*		./discover.js pi4b
*/

let target_serverId;
const myArgs = process.argv.slice(2);
if (myArgs.length > 0) {
   target_serverId = myArgs[0];
}

const discovery_port = 48895;

var discovered_hosts = [];

var dgram = require("dgram");
var socket = dgram.createSocket("udp4");
socket.bind( () => {
	socket.setBroadcast(true);
});
var message = new Buffer.from('{"msg_type":"DISCOVER"}');

socket.on("message", (message, rinfo) => {
	const msg = JSON.parse(message);
	let msg_type;
	if (msg.hasOwnProperty('msg_type')) {
		msg_type = 'msg_type';
	} else {
		msg_type = 'request';
	}
	/* Check it's a message type we're interested in */
	if (msg[msg_type] == "result_DISCOVER") {
		if (discovered_hosts.find(entry => { return entry.data === msg.data ; }) ) {
			console.log(`Not adding duplicate ${msg.data}`);
		} else {
			console.log(`Adding server: ${JSON.stringify(msg)}`);
			discovered_hosts.push(msg);
		}
	} else {
		/* Not interested in anything else */
	}
});


choose_server = (sid) => {
	if (discovered_hosts.length == 0) {
		/*	No servers found so try again.
		*/
		console.log("Finding server ...");
		socket.send(message, 0, message.length, discovery_port, '255.255.255.255', function(err, bytes) { });
		setTimeout(choose_server, 1000, sid);
	} else {
		/*	Choose which of the servers that replied to use.
		*	For brevity/convenience, we choose the first server we received a reply from.
		*	A normal app may have a more sophisticated way to choose e.g. user input.
		*/
		if (sid) {
			/*	 From discovered_hosts[], extract the entry whose sid matches
			*/
			const choice = discovered_hosts.find(entry => { return entry.sid === sid ; });
			if (choice) {
				console.log(`Choice: ${choice.sid} at ${choice.data}`);
			} else {
				/* Something went wrong so start all over */
				console.log(`Couldn't find server with SID matching ${sid}`);
				console.log("Finding server ...");
				socket.send(message, 0, message.length, discovery_port, '255.255.255.255', function(err, bytes) { });
				setTimeout(choose_server, 1000, sid);
			}
		} else {
			const choice = discovered_hosts[0];
			console.log(`Choice: ${choice.sid} at ${choice.data}`);
		}
		/*	Having chosen a server, an EOI message would usually be sent now
		*	but since we're just demonstrating discovery here,
		*	close the socket and exit.
		*/
		socket.close();
	}
}

choose_server(target_serverId);
