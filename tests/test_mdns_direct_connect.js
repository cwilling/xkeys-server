#!/usr/bin/env node

/*
*	test_mdns_direct_connect.js [serverId]
*
*	After DCDP service discovery, use DCDP "connect"
*	message to the selected server (bypassing additional
*	DCDP "discover" message). Disconnect after short delay.
*
*	If serverId is given, that will be the connection target (assuming
*	the apporopriate server responded). Otherwise the target will be the
*	first server that responded.
*/

const mdns = require('mdns');

/* Check whether a server Id has been stipulated */
let target_serverId;
const myArgs = process.argv.slice(2);
if (myArgs.length > 0) {
   target_serverId = myArgs[0];
}

var dcdp_services = [];

/*  Set up service discovery & browse for DCDP servers */
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

const dgram = require("dgram");
const client = dgram.createSocket("udp4");
client.bind( () => {
	client.setBroadcast(true);
});

client.on("message", (message, rinfo) => {
	const msg = JSON.parse(message);
	let msg_type;
	if (msg.hasOwnProperty('msg_type')) {
		msg_type = 'msg_type';
	} else {
		msg_type = 'request';
	}
	/* Check it's a message type we're interested in */
	if (msg[msg_type] == "connect_result") {
		console.log(`Received connect_result: ${JSON.stringify(msg)}`);
		/*	Mission accomplished, so disconnect after a short delay */
		setTimeout(send_udp_message, 5000, JSON.stringify({"msg_type":"disconnect"}), rinfo);
		
	} else if (msg[msg_type] == "disconnect_result") {
		console.log(`Received disconnect_result: ${JSON.stringify(msg)}`);
		console.log(`All done`);
		process.exit(0);
	} else {
		/* Not interested in anything else */
	}
});

send_udp_message = (message, rinfo) => {
	//console.log(`Sending message: ${message}`);
	client.send(message, 0, message.length, rinfo.port, rinfo.address, (err, bytes) => {
		if (err) {
			throw err;
		}
	});
}

const connect_message = JSON.stringify({"msg_type":"connect"});
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
					client.send(connect_message, 0, connect_message.length, service_entry.oport, service_entry.oaddr, function(err, bytes) { });
				}
			});
		} else {
			console.log(`Choosing from: ${JSON.stringify(dcdp_services,null,2)}`);
			const service_entry = dcdp_services[0];
			client.send(connect_message, 0, connect_message.length, service_entry.oport, service_entry.oaddr, function(err, bytes) { });
		}
	}
}

choose_server(target_serverId);
