#!/usr/bin/env node

/*  discover-mdns.js
*
*   Discover the ip address & port of a machine offering
*   DCDP service. This example uses UDP but any protocol
*   may be used.
*
*   If a suitable server is found, a further
*       "msg_type":"discover"
*   message is sent to the discovered address/port.
*   A reply with a field "request":"discover_result" is
*   taken to be a successful discovery
*   i.e. we have found a server via DNS-SD and confirmed its
*   suitability by sending a particular msessage and receiving
*   the expected reply.
*
*   If no servers are discovered by initial service discovery,
*   we recheck discovery every 1 second.
*
*   If multiple servers are discovered we must decide which
*   to use. In this example, the first server found in
*   dcdp_services[] is chosen unless the desired server Id
*   is known and passed to discover-mdns.js as the first argument e.g.
*       ./discover.js pi4b
*/

const mdns = require('mdns');

/* Check whether a server Id is stipulated */
let target_serverId;
const myArgs = process.argv.slice(2);
if (myArgs.length > 0) {
   target_serverId = myArgs[0];
}

var dcdp_services = [];

/*  Set up service discovery */
const sequence = [
    mdns.rst.DNSServiceResolve(),
    "DNSServiceGetAddrInfo" in mdns.dns_sd ? mdns.rst.DNSServiceGetAddrInfo() : mdns.rst.getaddrinfo({families: [4]}),
	mdns.rst.makeAddressesUnique(),
];
const browser = mdns.createBrowser(mdns.makeServiceType('dcdp', 'udp'), {resolverSequence: sequence});

browser.on('serviceUp', service => {
	if (!service.txtRecord) return;
	if (!service.txtRecord.oaddr) return;
	console.log("service up: ", service.txtRecord);
	service_duplicate = false;
	dcdp_services.forEach((service_entry) => {
		if (service_entry.oaddr == service.txtRecord.oaddr) {
			//console.log(`duplicate oaddress: ${service.txtRecord.oaddr}`);
			service_duplicate = true;
		}
	});
	if (service_duplicate) {
		console.log(`Duplicate service advertisement from: ${service.txtRecord.oaddr}`);
	} else {
		dcdp_services.push(service.txtRecord);
	}
});
browser.on('serviceDown', service => {
  console.log("service down: ", service);
});
browser.on('error', exception => {
  console.log("service error: ", exception.toString());
});
browser.start();


//setTimeout(() => {console.log(`======== Available services =======`);console.log(`service: ${JSON.stringify(dcdp_services,null,2)}`);}, 1000);

let discovered_server;

var dgram = require("dgram");
var socket = dgram.createSocket("udp4");
socket.bind( () => {
	socket.setBroadcast(true);
});
var message = new Buffer.from('{"msg_type":"discover"}');

socket.on("message", (message, rinfo) => {
	const msg = JSON.parse(message);
	let msg_type;
	if (msg.hasOwnProperty('msg_type')) {
		msg_type = 'msg_type';
	} else {
		msg_type = 'request';
	}
	/* Check it's a message type we're interested in */
	if (msg[msg_type] == "discover_result") {
		console.log(`Found server to use: ${JSON.stringify(msg)}`);
		discovered_server = msg;
        process.exit(0);
	} else {
		/* Not interested in anything else */
	}
});


choose_server = (server_id) => {
	if (dcdp_services.length == 0) {
		/*	No servers found so try again.
		*/
		console.log("Finding server ...");
		setTimeout(choose_server, 1000, server_id);
	} else {
	
		if (server_id) {
			console.log(`Search for ${server_id}`);
			dcdp_services.forEach((service_entry) => {
				if (service_entry.oid == server_id) {
					console.log(`Have requested server_id (${server_id})`);
					socket.send(message, 0, message.length, service_entry.oport, service_entry.oaddr, function(err, bytes) { });
				}
			});
		} else {
			console.log(`Choosing from: ${JSON.stringify(dcdp_services,null,2)}`);
			const service_entry = dcdp_services[0];
			socket.send(message, 0, message.length, service_entry.oport, service_entry.oaddr, function(err, bytes) { });
		}
	}
}

choose_server(target_serverId);
