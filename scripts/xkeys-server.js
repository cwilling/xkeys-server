#!/usr/bin/env node


const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const xdgBasedir = require('xdg-basedir');
const xlate = require('./xkeys-xlate');
const norm = require('./NormalizeValues.js');
const elgato = require('./elgato-plugin')

const default_config = {
	"hostname"		: require('os').hostname().split('.')[0],
	"host_address"	: "0.0.0.0",
	"host_port"		: 48895,
	"timeout_client_ttl"	: 600000,
	"timeout_client_warning_ttl" : 120000,
	"client_ttl_warnings"	: 2
}
const ServerVersion = require('../package.json').version;
console.log(`Server version = ${ServerVersion}`);

/*	Load config file or create one from defaults
*/
let config;
try {
	const config_dir = path.join(xdgBasedir.config, "xkeys-server");
	if (! fs.existsSync(config_dir)) {
		fs.mkdirSync(config_dir, true);
		console.log(`Creating ${config_dir} `);
	}
	//console.log(`${config_dir} exists`);
	const config_file = path.join(config_dir, "xkeys-server.conf");
	if (! fs.existsSync(config_file)) {
		const data = JSON.stringify(default_config, null, 2);
		fs.writeFileSync(config_file, data, 'utf8');
	}
	try {
		const data = fs.readFileSync(config_file, 'utf8');
		config = JSON.parse(data);
		//	Here we should check that the values are reasonable.
		//	e.g. external apps shouldn't be imposing version number so might be empty
		var is_dirty = false;
		if (config.hostname.length == 0) {
			config.hostname = require('os').hostname().split('.')[0];
			is_dirty = true
		}
		if (config.host_address.length == 0) {
			config.host_address = "0.0.0.0";
			is_dirty = true
		}
		if (config.host_port < 0 || config.host_port > 65535) {
			config.host_port = 48895;
			is_dirty = true
		}
		if (config.timeout_client_ttl < 0) {
			config.timeout_client_ttl = 10000;
			is_dirty = true
		}
		if (config.timeout_client_warning_ttl < 0) {
			config.timeout_client_warning_ttl = 2000;
			is_dirty = true
		}
		if (config.client_ttl_warnings < 0) {
			config.client_ttl_warnings = 2;
			is_dirty = true
		}
		if (is_dirty) {
			const new_data = JSON.stringify(config, null, 2);
			fs.writeFileSync(config_file, new_data, 'utf8');
		}
	}
	catch (err) {
		console.log(`ERROR  ${err}`);
		process.exit(1);
	}
}
catch (err) {
	console.log(`ERROR ${err}`);

	//	Fall back to default configuration
	config = default_config;
}
//console.log(`config = ${JSON.stringify(config)}`);

//var { env } = require('process');
process.env.UV_THREADPOOL_SIZE = 48;

const { networkInterfaces } = require('os');
const ServerID = "XKS_" + config.hostname;
//const ServerID = "XKS_Chris' test UDP server"; 
console.log(`Server id = ${ServerID}`);

const dgram = require('dgram');
const udp_server = dgram.createSocket('udp4');
const udp_host = config.host_address;
const udp_port = config.host_port;
const udp_clients = [];

process.on('SIGINT', () => {
	console.log(`Shutting down (SIGINT)`);
	udp_server.close();
	client.end();
	watcher.stop();
	elgato.stop();

	process.exit();
});
process.on('SIGTERM', () => {
	// Help systemctl stop
	console.log(`Shutting down (SIGTERM)`);
	udp_server.close();
	client.end();
	watcher.stop();
	elgato.stop();

	process.exit();
});

/*	Suggested timeouts are 10mins (600000) for ttl and 2mins (120000)for warnings.
*	Shorter times temporarily for testing only
*/
const TIMEOUT_CLIENT_TTL = config.timeout_client_ttl;
const TIMEOUT_CLIENT_WARNING_TTL = config.timeout_client_warning_ttl;
const CLIENT_TTL_WARNINGS = config.client_ttl_warnings;

var mqtt = require('mqtt');
const qos = 2;
const { XKeysWatcher } = require('xkeys');
const XKeys = require('xkeys');
//const { PRODUCTS } = require('@xkeys-lib/core/dist/products');
var { PRODUCTS } = require('@xkeys-lib/core/dist/products');
/*	Add Elgato products */
elgato.products(PRODUCTS);

/*	An XKeysWatcher */
const USE_POLLING = true;
let watcher;

/*	Local record of discovered devices keyed by UniqueId */
let xkeys_devices = {};

/*	Reverse lookup of PRODUCTS keys (short name ids), indexed by hidDevice number */
let xkeys_products = {};
Object.entries(PRODUCTS).forEach(entry => {
	const [key, value] = entry;
	value.hidDevices.forEach(hidDev => {
		xkeys_products[hidDev[0]] = key;
	});
});
/*
Object.entries(xkeys_products).forEach(entry => {
	console.log(`${entry}`);
});
*/

/*	Hex colour to rgb */
hex2rgb = (hexval) => {
	var result = [];
	for (const i of [0,2,4]) { result.push(parseInt(hexval.slice(i, i+2), 16)); }
	return result;
}

/*
Proposed Topic heirarchy:
	'/xkeys/SRC/product_id/unit_id/control_id'
	(version 1.0.0 was '/xkeys/SRC/PID/UID/index')
where:
	SRC = source of msg - probably: server|node
	PID = X-keys product id
	UID = X-keys unit id (or devicePath if UID == 0)
	control_id = device dependent index value
			e.g. button id

Server will listen to:
	/xkeys/node/#

Nodes could listen to (filtering appropriately):
	/xkeys/server/#
or:
	/xkeys/#
or, more specifically:
	/xkeys/server/product_id/unit_id
	(version 1.0.0 was /xkeys/server/pid/uid)
	i.e. messages intended for a specific node only
*/

/*	request_message_process()
*
*	Generic request processor through which all transport
*	types (MQTT, UDP) request messages are processed.
*
*	type: string describing caller origin ("MQTT"|"UDP"|...)
*	message: JSON format string
*   moreArgs: array of additional args
*		moreArgs[0] is the topic (string) of an MQTT message
*		            is rinfo (object) of a UDP message
*/
request_message_process = (type, message, ...moreArgs) => {
	var msg_transport = type.toLowerCase();
	let topic;
	let rinfo;

    var msg = ""
	if (msg_transport == "udp") {
		rinfo = moreArgs[0];

		/* Basic syntax check */
		try {
			msg = JSON.parse(message);
			if (! msg.hasOwnProperty('msg_type')) {
				//	UDP messages MUST have this field
				console.log(`UDP message without msg_type rejected`);
				udp_server.send(JSON.stringify({"msg_type":"error","server_id":ServerID, "error_msg":"Illegal message format: 'msg_type' is missing", "error_echo":message}), rinfo.port, rinfo.address);
				return;
			}
		}
		catch (err) {
			// Probably a JSON syntax error
			console.log(`Sending error_msg for message: ${message.toString()}`);
			udp_server.send(JSON.stringify({"msg_type":"error","server_id":ServerID, "error_msg":"" + err, "error_echo":message.toString()}), rinfo.port, rinfo.address);
			return;
		}
	} else if (msg_transport == "mqtt") {
		topic = moreArgs[0];
	}

	/* Process the incoming message */
	try {
		msg = JSON.parse(message);
		/*	Determine whether this is an old style
		*	"request" message or new style "msg_type" message
		* 	since we have to deal with both.
		*/
		let msg_type;
		if (msg.hasOwnProperty('msg_type')) {
			//	New UDP message
			msg_type = 'msg_type'; 
			reset_client_ttl_timer(rinfo);
		} else {
			//	Old (pre UDP) message request
			msg_type = 'request'; 
		}
		//console.log(`${msg_transport} msg_type: ${msg[msg_type]}`);

		switch (msg[msg_type]) {
			case "new_products":
				//	UDP only test command
				if (is_connected(rinfo)) {
					udp_server.send(JSON.stringify({"msg_type":"new_products_result","server_id":ServerID}), rinfo.port, rinfo.address);
				} else {
					//	Send error unconnected message
					udp_server.send(JSON.stringify({"msg_type":"error","server_id":ServerID, "error_msg":"Client not connected. Try 'msg_type':'connect'.", "error_echo":message}), rinfo.port, rinfo.address);
					break;
				}
				PRODUCTS = msg.data.PRODUCTS;
				console.log(`XK24RGB name: ${JSON.stringify(PRODUCTS.XK24RGB.name)}`);
				break;
			case "discover":
				/*	Since we exist on 0.0.0.0 i.e. every available interface,
				*	and therefore possibly have multiple IP addresses,
				*	find the best IP address to provide the client with.
				*/
				const nifs = networkInterfaces();
				const nif_addrs = {};

				for (const name of Object.keys(nifs)) {
					for (const net of nifs[name]) {
						// Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
						if (net.family === 'IPv4' && !net.internal) {
							if (!nif_addrs[name]) {
								nif_addrs[name] = [];
							}
							nif_addrs[name].push(net.address);
						}
					}
				}
				//console.log(`${JSON.stringify(nif_addrs)}`);

				var address_match = "";
				for (const name of Object.keys(nif_addrs)) {
					nif_addrs[name].forEach( (item) => {
						//console.log(`Checking: ${item}, against ${rinfo.address}`);
						if (item == rinfo.address) {
							address_match = item;
							return;
						} else if (/[0-9]*\.[0-9]*\.[0-9]*/.exec(item).toString() == /[0-9]*\.[0-9]*\.[0-9]*/.exec(rinfo.address).toString()) {
							address_match = item;
							return;
						} else if (/[0-9]*\.[0-9]*/.exec(item).toString() == /[0-9]*\.[0-9]*/.exec(rinfo.address).toString()) {
							address_match = item;
							return;
						} else {
						}
					});
					if (address_match.length > 0) {
						//console.log(`The match is: ${address_match}`);
						break
					}
				}
				if (address_match.length < 7) {
					return;
				}

				if (msg_transport == "udp") {
					discover_result = {"msg_type":"discover_result", "server_id":ServerID};
					discover_result["xk_server_address"] = address_match;
					discover_result["attached_devices"] = Object.keys(xkeys_devices);
					discover_result["version"] = ServerVersion;

					//console.log("sending discover_result message");
					udp_server.send(JSON.stringify(discover_result), rinfo.port, rinfo.address);
				} else if (msg_transport == "mqtt") {
					console.log("DISCOVER message via MQTT");
				} else {
					console.log(`request_message_process(): UNKNOWN TYPE msg.request was ${msg.request}`);
				}
				break;
			case "connect":
				/*	Normal client connect */
				if (msg_transport == "udp") {
					//console.log(`request_message_process(): UDP msg.request was 'connect' from ${rinfo.address}`);

					//	Start building the connect_result
					var connect_result = {"msg_type":"connect_result", "server_id":ServerID};
					connect_result["client_address"] = rinfo.address;
					connect_result["client_port"] = rinfo.port;

					//	Determine new or returning client
					const index = udp_clients.findIndex(item => item.remote.address === rinfo.address && item.remote.port === rinfo.port);
					if (index < 0) {
						// New client
						// client_name is optional so create one if none sent
						if (msg.hasOwnProperty("client_name")) {
							//	client nominated a name but check it hasn't already been used
							const name_used = udp_clients.findIndex(item => item.client_name === msg.client_name);
							if (name_used > -1 ) {
								//	Requested client_name already used - change it
								msg["client_name"] = udp_clients[name_used].client_name + "_" + crypto.randomBytes(8).toString('hex');
							}
						} else {
							//	client needs a name
							msg["client_name"] = "client_" + crypto.randomBytes(8).toString('hex');
						}
						add_udp_client({"timestamp":Date.now(), "client_name":msg.client_name, "remote":rinfo});
					} else {
						/*	An existing client is connecting again
						*	with a new client name?
						*/
						if (msg.hasOwnProperty("client_name")) {
							//	client nominated a name but check it hasn't already been used
							const name_used = udp_clients.findIndex(item => item.client_name === msg.client_name);
							if (name_used < 0 ) {
								//	No one uses his name yet so claim it.
								udp_clients[index].client_name = msg.client_name;
							} else {
								//	Requested client_name is already used by someone.
								//	If used by someone else, we can't use it i.e nothing to do
								//	If used by us already, then nothing to do
							}
						} else {
							//	No new name provided - use existing
							msg.client_name = udp_clients[index].client_name;
						}
						add_udp_client({"timestamp":Date.now(), "client_name":msg.client_name, "remote":rinfo});
					}
					// 	Remainder of connect_result
					connect_result["client_name"] = msg.client_name;
					connect_result["attached_devices"] = Object.keys(xkeys_devices);
					connect_result["version"] = ServerVersion;

					//udp_server.send(JSON.stringify(connect_result), rinfo.port, rinfo.address);
					send_udp_message(JSON.stringify(connect_result));
					//console.log(`Sent ${JSON.stringify(connect_result)} to ${rinfo.address}:${rinfo.port}`);

				} else if (msg_transport == "mqtt") {
					/*	"connect" isn't part of MQTT establishment.
					*	Should we supply a response?
					*/

				} else {
					console.log("request_message_process(): UNKNOWN TRANSPORT TYPE for msg.type connect");
				}
				break;

			case "device_connect":
				/*	This is a "Client Device" - a network device rather than a "normal" USB attached device.
				*
				*	For new device client connections, we create a fauxPanel to be added to xkeys_devices.
				*	In addition, we add a device_triple when adding to udp_clients[], to distinguish
				*	from ordinary clients, so that correct entry in xkeys_devices can be removed
				*	when the device_client dies.
				*/
				//console.log("device_client connecting ...");
				if (msg_transport == "udp") {
					//	Start building the connect_result
					var connect_result = {"msg_type":"device_connect_result", "server_id":ServerID};
					connect_result["client_address"] = rinfo.address;
					connect_result["client_port"] = rinfo.port;

					//	Determine new or returning client
					const index = udp_clients.findIndex(item => item.remote.address === rinfo.address && item.remote.port === rinfo.port);
					if (index < 0) {
						/*	Connection from a new device client */

						/*	Create a faux xkeysPanel based on supplied connection information */
						if ( msg.hasOwnProperty('device') && msg.hasOwnProperty('product_id') && msg.hasOwnProperty('unit_id') )
						{
							var fauxPanel = {
								get info() {
									return {
										name     : this.product.name,
										productId: this.product.productId,
										interface: this.product.interface,
										unitId   : this.unitId,
										colCount : this.product.colCount,
										rowCount : this.product.rowCount
									}
								}
							};
							var deviceInfo = {};
							var product = {};

							Object.keys(msg).forEach( (key, index) => {
								if (key == 'msg_type') {
									console.log(`Processing ${msg[key]} message`);
								}
								else if (key == 'device') {
									product["name"] = msg[key];
									deviceInfo["product"] = msg[key];
								}
								else if (key == 'product_id') {
									product["productId"] = msg[key];
									deviceInfo["productId"] = msg[key];
								}
								else if (key == 'rowCount') {
									product["rowCount"] = msg[key];
								}
								else if (key == 'colCount') {
									product["colCount"] = msg[key];
								}
								else if (key == 'unit_id') {
									fauxPanel["unitId"] = msg[key];
								} else {
									console.log(`Unknown device_connect msg key: ${key}`);
								}
							});
							// Want these?
							product["interface"] = 0;	// interface: number | null // null means "anything goes", used when interface isn't available
							deviceInfo["interface"] = 0

							fauxPanel["product"]    = product;
							fauxPanel["deviceInfo"] = deviceInfo;
							fauxPanel["name"]       = `${fauxPanel.deviceInfo.product}`
							fauxPanel["uniqueId"]   = `${fauxPanel.deviceInfo.productId}_${fauxPanel.unitId}`

							console.log(`X-keys panel ${fauxPanel.uniqueId} connected`);
							add_xkeys_device(fauxPanel);
							update_client_device_list("");
							
							var attach_msg = {"msg_type":"attach_event", "server_id":ServerID, "device":fauxPanel.info.name,};
							attach_msg["product_id"] = fauxPanel.info.productId;
							attach_msg["unit_id"] = fauxPanel.info.unitId;
							attach_msg["duplicate_id"] = fauxPanel.duplicate_id;
							attach_msg["attached_devices"] = Object.keys(xkeys_devices);
							send_udp_message(JSON.stringify(attach_msg));

						} else {
							console.log(`New device_connect msg has insufficient properties to create new device object: ${JSON.stringify(msg, null, 2)}`);
							break;
						}

						// New device_clients don't arrive with a client_name so make one up
						msg["client_name"] = "device_client_" + crypto.randomBytes(8).toString('hex');

						// Including device_triple here enables removal of fauxPanel when udp_client is removed
						var device_triple = fauxPanel.uniqueId.replace(/_/g, "-") + "-" + fauxPanel.duplicate_id;
						add_udp_client({"timestamp":Date.now(), "client_name":msg.client_name, "remote":rinfo,"device_triple":device_triple});
						console.log(`Added new device_client: ${msg.client_name}, ${device_triple}`);

					} else {
						/*	Connection from an existing device client - posibly a keep-alive */
						//console.log(`index already exists: ${index}`);

						// Use existing client_name & device_triple
						add_udp_client({"timestamp":Date.now(), "client_name":udp_clients[index].client_name, "remote":rinfo,"device_triple":udp_clients[index].device_triple});
					}

					// 	Remainder of connect_result
					connect_result["client_name"] = msg.client_name;
					connect_result["attached_devices"] = Object.keys(xkeys_devices);
					connect_result["version"] = ServerVersion;
					send_udp_message(JSON.stringify(connect_result));

				} else if (msg_transport == "mqtt") {
					/*	"device_connect" isn't part of MQTT establishment.
					*	Should we supply a response?
					*/
				} else {
					console.log("request_message_process(): UNKNOWN TRANSPORT TYPE for msg.type device_connect");
				}
				break;

			case "device_data":
				/*	Emit an event based on event data from a Device Client */
				//console.log(`Received device_data: ${JSON.stringify(msg)}`);

				// Search udp_clients to identify device_client device_triple to access device_client object
				const index = udp_clients.findIndex(item => item.remote.address === rinfo.address && item.remote.port === rinfo.port);
				if (index < 0) {
					console.log(`device_data from unconnected client`);
				} else {
					var device_triple = udp_clients[index].device_triple;
					var device_client_obj = xkeys_devices[device_triple]["device"];
					//console.log(`device: ${JSON.stringify(device_client_obj, null, 4)}`);

					var device       = device_client_obj.info.name;
					var product_id   = device_client_obj.info.productId;
					var unit_id      = device_client_obj.info.unitId;
					var duplicate_id = device_client_obj.duplicate_id;
					//	Device Clients have no shortnam. If no entry in PRODUCTS to find one (most probable case), make one up
					var shortnam     = xkeys_products[product_id.toString()];
					if (shortnam) {
						msg["shortnam"] = shortnam;
					} else {
						msg["shortnam"] = device.replace(/\s/g, "").toUpperCase() + "-" + device_triple;
					}
					if (msg.event_type == "button_event") {
						var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":device,
										"product_id":product_id,"unit_id":unit_id,"duplicate_id":duplicate_id, "control_id":msg.control_id,
										"row":msg.row,"col":msg.col, "value":msg.value,"timestamp":msg.timestamp};

						//	NodeRED
						msg["type"] = msg.value==1?"down":"up";
						//console.log(`${msg.type.toUpperCase()} event from ${device}`);
						if (! msg.hasOwnProperty("timestamp")) { msg["timestamp"] = -1; }
						var msg_topic = '/xkeys/server/button_event/' + product_id + '/' + unit_id + '/' + duplicate_id + '/' + msg.control_id;
						var msg_pload = {"server_id":ServerID,"request":"device_event", "data":msg};
					}
					else if (msg.event_type == "tbar_event") {
						var msg_udp = {"msg_type":"tbar_event", "server_id":ServerID, "device":device,
										"product_id":product_id,"unit_id":unit_id,"duplicate_id":duplicate_id, "control_id":msg.control_id,
										"value":msg.value,"timestamp":msg.timestamp};

						//	NodeRED
						msg["type"] = "tbar"
						//console.log(`${msg.type.toUpperCase()} event from ${device}`);
						if (! msg.hasOwnProperty("position")) { msg["position"] = msg.value; }
						if (! msg.hasOwnProperty("timestamp")) { msg["timestamp"] = -1; }
						var msg_topic = '/xkeys/server/tbar_event/' + product_id + '/' + unit_id + '/' + duplicate_id + '/' + msg.control_id;
						var msg_pload = {"server_id":ServerID,"request":"device_event", "data":msg};
					}
					else if (msg.event_type == "jog_event") {
						var msg_udp = {"msg_type":"jog_event", "server_id":ServerID, "device":device,
										"product_id":product_id,"unit_id":unit_id,"duplicate_id":duplicate_id, "control_id":msg.control_id,
										"value":msg.value,"timestamp":msg.timestamp};

						//	NodeRED
						msg["type"] = "jog"
						//console.log(`${msg.type.toUpperCase()} event from ${device}`);
						if (! msg.hasOwnProperty("deltaPos")) { msg["deltaPos"] = msg.value; }
						if (! msg.hasOwnProperty("timestamp")) { msg["timestamp"] = -1; }
						var msg_topic = '/xkeys/server/jog_event/' + product_id + '/' + unit_id + '/' + duplicate_id + '/' + msg.control_id;
						var msg_pload = {"server_id":ServerID,"request":"device_event", "data":msg};
					}
					else if (msg.event_type == "shuttle_event") {
						var msg_udp = {"msg_type":"shuttle_event", "server_id":ServerID, "device":device,
										"product_id":product_id,"unit_id":unit_id,"duplicate_id":duplicate_id, "control_id":msg.control_id,
										"value":msg.value,"timestamp":msg.timestamp};

						//	NodeRED
						msg["type"] = "shuttle"
						//console.log(`${msg.type.toUpperCase()} event from ${device}`);
						if (! msg.hasOwnProperty("shuttlePos")) { msg["shuttlePos"] = msg.value; }
						if (! msg.hasOwnProperty("timestamp")) { msg["timestamp"] = -1; }
						var msg_topic = '/xkeys/server/shuttle_event/' + product_id + '/' + unit_id + '/' + duplicate_id + '/' + msg.control_id;
						var msg_pload = {"server_id":ServerID,"request":"device_event", "data":msg};
					}
					else if (msg.event_type == "joystick_event") {
						var msg_udp = {"msg_type":"joystick_event", "server_id":ServerID, "device":device,
										"product_id":product_id,"unit_id":unit_id,"duplicate_id":duplicate_id, "control_id":msg.control_id,
										"x":msg.x,"y":msg.y,"Z":msg.z,"deltaZ":msg.deltaZ, "timestamp":msg.timestamp};

						//	NodeRED
						msg["type"] = "joystick"
						//console.log(`${msg.type.toUpperCase()} event from ${device}`);
						if (! msg.hasOwnProperty("position")) { msg["position"] = {"x":msg.x,"y":msg.y,"z":msg.z,"deltaZ":msg.deltaZ}; }
						if (! msg.hasOwnProperty("timestamp")) { msg["timestamp"] = -1; }
						var msg_topic = '/xkeys/server/joystick_event/' + product_id + '/' + unit_id + '/' + duplicate_id + '/' + msg.control_id;
						var msg_pload = {"server_id":ServerID,"request":"device_event", "data":msg};
					}
					else {
						console.log(`Unknown event type from device_data message: ${JSON.stringify(msg)}`);
						break;
					}
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});
					send_udp_message(JSON.stringify(msg_udp));
				}
				break;

			case "device_disconnect":
				/*	This is a Device Client disconnecting. As well as removing this connection from udp_clients,
					remove the device object we created and saved on xkeys_devices.
				*/
				console.log(`device_disconnect`);
				if (msg_transport == "udp") {
					// Search udp_clients to identify device_client device_triple to access device_client object
					const index = udp_clients.findIndex(item => item.remote.address === rinfo.address && item.remote.port === rinfo.port);
					if (index < 0) {
						// 	Nothing to do
						console.log(`device_disconnect from unconnected client`);
					} else {
						var device_triple     = udp_clients[index].device_triple;
						var device_client_obj = xkeys_devices[device_triple]["device"];
						var client_name       = device_client_obj.info.name;

						var msg_udp = {"msg_type":"device_disconnect_result", "host_name":ServerID,
										"client_address":rinfo.address, "client_port":rinfo.port, "client_name":client_name};
						//delete xkeys_devices[device_triple];	// do this as part of remove_udp_client()
						remove_udp_client(rinfo, "device_disconnect");
					}
				} else if (msg_transport == "mqtt") {
				} else {
					console.log("request_message_process(): UNKNOWN TRANSPORT TYPE msg.type was device_disconnect");
				}
					break;

			case "disconnect":
				if (msg_transport == "udp") {
					remove_udp_client(rinfo);

				} else if (msg_transport == "mqtt") {
					console.log("request_message_process(): MQTT msg.type was disconnect");
					/*	EOI/connect isn't really part of MQTT establishment.
					*	Should we supply a response?
					*/

				} else {
					console.log("request_message_process(): UNKNOWN TRANSPORT TYPE msg.type was connect");
				}
				break;

			case "reflect":
				if (! msg.hasOwnProperty("message")) {
					if (msg_transport == "udp") {
						udp_server.send(JSON.stringify({"msg_type":"error","server_id":ServerID, "error_msg":"No message supplie for reflect request", "error_echo":message}), rinfo.port, rinfo.address);
					}
				}
				if (msg_transport == "udp") {
					if (is_connected(rinfo)) {
						send_udp_message(JSON.stringify(msg.message));
					}

					// Create topic & message based on content of the message to be reflected.
					var xlated_msg = xlate.xlate2node(JSON.stringify(msg.message));
					if (xlated_msg.search(/"msg_type":"error"/) > 0) {
						console.log(`ERROR: ${xlated_msg}`);
						break;
					}
					try {
						const msg = JSON.parse(xlated_msg);
						console.log(`publishing topic: ${msg.msg_topic}`);
						console.log(`publishing pload: ${JSON.stringify(msg.msg_pload)}`);
						client.publish(msg.msg_topic, JSON.stringify(msg.msg_pload), {qos:qos,retain:false});
					}
					catch (err) {
						console.log(`Couldn't publish xlated message. ${err}`);
					}
				}
				break

			case "list_attached":
				/*	Generate latest device list */
				var device_list = [];
				for (const key of Object.keys(xkeys_devices) ) {
					device_list.push(xkeys_devices[key].device.info);
					device_list[device_list.length-1]["temp_id"] = key;
				}
				//console.log(`case list_attached: ${JSON.stringify(device_list)}`);
				if (msg_transport == "udp") {
					if (is_connected(rinfo)) {
						udp_server.send(JSON.stringify({"msg_type":"list_attached_result","server_id":ServerID, "devices":device_list}), rinfo.port, rinfo.address);
					} else {
						//	Send error unconnected message
						udp_server.send(JSON.stringify({"msg_type":"error","server_id":ServerID, "error_msg":"Client not connected. Try 'msg_type':'connect'.", "error_echo":message}), rinfo.port, rinfo.address);
					}
				} else if (msg_transport == "mqtt") {
					client.publish('/xkeys/server', JSON.stringify({"server_id":ServerID, "request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
				}
				break
			case "deviceList":
				/*	!!! Only relevant to OLD 1.0.0 server - retained for backward compatibility (for now).
				*	!!! Clients should now use "msg_request":"list_attached"
				*/
				/*	Generate latest device list */
				var device_list = {};
				for (const key of Object.keys(xkeys_devices) ) {
					device_list[key] = xkeys_devices[key].device.info;
				}

				if (msg_transport == "udp") {
					udp_server.send(JSON.stringify({"msg_type":"result_deviceList","server_id":ServerID,"data":device_list}), rinfo.port, rinfo.address);
				} else if (msg_transport == "mqtt") {
					client.publish('/xkeys/server', JSON.stringify({"server_id":ServerID, "request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
				}
				break;

			case "product_list":
				if (msg_transport == "udp") {
					if (is_connected(rinfo)) {
						udp_server.send(JSON.stringify({"msg_type":"product_list_result", "server_id":ServerID, "data":PRODUCTS}), rinfo.port, rinfo.address);
					} else {
						//	Send error unconnected messamessage
						udp_server.send(JSON.stringify({"msg_type":"error","server_id":ServerID, "error_msg":"Client not connected. Try 'msg_type':'connect'.", "error_echo":message}), rinfo.port, rinfo.address);
					}
				} else if (msg_transport == "mqtt") {
					client.publish('/xkeys/server', JSON.stringify({"server_id":ServerID, "request":"result_productList", "data":PRODUCTS}), {qos:qos,retain:false});
				}
			case "productList":
				/*	!!! Only relevant to OLD 1.0.0 server - retained for backward compatibility (for now).
				*	!!! Clients should now use "msg_request":"product_list"
				*/
				if (msg_transport == "udp") {
					udp_server.send(JSON.stringify({"server_id":ServerID,"msg_type":"result_productList","data":PRODUCTS}), rinfo.port, rinfo.address);
				} else if (msg_transport == "mqtt") {
					client.publish('/xkeys/server', JSON.stringify({"server_id":ServerID, "request":"result_productList", "data":PRODUCTS}), {qos:qos,retain:false});
				}
				break;
			case "list_clients":
				var client_list = [];
				for (const client of udp_clients) {
					client_list.push({"client_address":client.remote.address, "client_port":client.remote.port, "client_name":client.client_name});
				}
				try {
					if (is_connected(rinfo)) {
						console.log("Is connected OK");
						udp_server.send(JSON.stringify({"msg_type":"list_clients_result","server_id":ServerID, "clients":client_list}), rinfo.port, rinfo.address);
					} else {
						console.log("NOT connected OK");
						//	Send error unconnected message
						udp_server.send(JSON.stringify({"msg_type":"error","server_id":ServerID, "error_msg":"Client not connected. Try 'msg_type':'connect'.", "error_echo":message}), rinfo.port, rinfo.address);
					}
					//connect_result = {"msg_type":"list_clients_result","server_id":ServerID, "clients":client_list};
				} catch (err) {
					console.log("client_list_result_message() error: " + err);
				}
				break;
			case "command":
				/*	This is a 2.0.0 format method request.
				*
				*	Here we convert the command to a format
				*	originally used for NodeRED method requests.
				*	At the same time, we fill in default values
				*	for optional parameters of the specified command.
				*/
				/*	First, setup any command components common to all command_type
				*	e.g. product_id --> pid_list
				*/
				/*	Step 0 - check client is connected
				*/
				if (! is_connected(rinfo)) {
					udp_server.send(JSON.stringify({"msg_type":"error","server_id":ServerID, "error_msg":"Client not connected. Try 'msg_type':'connect'.", "error_echo":message}), rinfo.port, rinfo.address);
					break;
				}
				msg["pid_list"] = [];
				if (msg.product_id > -1) { msg.pid_list.push(msg.product_id); }
				// If (optional) "duplicate_id" is missing, it means order = 0.
				if (! msg.hasOwnProperty("duplicate_id")) { msg["duplicate_id"] = 0; }

				/*	Now set up components specific to particular command_type
				*/
				if (msg.command_type == "set_indicator_led") {
					//console.log("Command: set_indicator_led");
					msg.name = "setIndicatorLED";
					var params = [];
					// control_id may come in as a single int or an array of ints.
					// we convert to array if necessary.
					if (typeof(msg.control_id) == "object") {
						params.push(msg.control_id)
					} else {
						var ledids = []; ledids.push(msg.control_id); params.push(ledids);
					}
					// Convert int (1/0) to boolean
					params.push(1 == msg.value);
					// flash is optional
					if (msg.hasOwnProperty("flash")) {
						params.push(1 == msg.flash);
					} else {
						// No flash entry => no flashing required
						// Add a nothing value (for use in later reply message)
						msg["flash"] = 0;
						params.push(false);
					}
					msg["params"] = params;

				} else if (msg.command_type == "set_backlight") {
					//console.log("Command: set_backlight");
					msg.name = "setBacklight";
					var params = [];
					// control_id may come in as a single int or an array of ints.
					// we convert to array if necessary for params[0].
					if (typeof(msg.control_id) == "object") {
						params.push(msg.control_id)
					} else {
						var lampids = []; lampids.push(msg.control_id); params.push(lampids);
					}
					// params[1]: colour also doubles as on/off
					if (msg.value == 0) {
						params[1] = "000000";
					} else if (msg.value == 1) {
						params[1] = msg.color;
					} else {
						// Any other value is an error isn't it?
					}
					// params[2]: flash is optional?
					if (msg.hasOwnProperty("flash")) {
						params.push(1 == msg.flash);
					} else {
						// No flash entry => no flashing required
						// Add a nothing value (for use in later reply message)
						msg["flash"] = 0;
						params.push(false);
					}
					msg["params"] = params;

				} else if (msg.command_type == "write_lcd_display") {
					//console.log(`Command: write_lcd_display`);
					msg.name = "writeLcdDisplay";
					var params = [];
					/*	Incoming msg.text may be
					*	- text string, as exampled in DCD
					*	- boolean, indicating clearing of the line nominated by msg.line
					*	- array of 2 text strings (or boolean),
					*	  indicating text for both LCD lines
					*	For now, just implement the basic text string.
					*/
					var text_lines = ["",""];


					//	params[0]
					if (typeof(msg.text) == "string") {
						if (msg.line == 1) {
							text_lines[0] = msg.text;
						} else if (msg.line == 2) {
							text_lines[1] = msg.text;
						} else {
							// Illegal line number
						}
					} else if (typeof(msg.text) == "number") {
						if (msg.line == 1) {
							text_lines[0] = msg.text.toString();
						} else if (msg.line == 2) {
							text_lines[1] = msg.text.toString();
						} else {
							// Illegal line number
						}
					} else {
						// Unknown type
					}
					params.push(text_lines);
					//	params[1]
					if (msg.hasOwnProperty("backlight")) {
						params.push(1 == msg.backlight);
					} else {
						// Add default backlight entry - assume on
						msg["backlight"] = 1;
						params.push(true);
					}
					msg["params"] = params;

				} else if (msg.command_type == "set_flash_rate") {
					/*	"params": [[],msg.payload.flashRate] */
					//console.log("Command: set_flash_rate");
					msg.name = "setFlashRate";
					var params = [];

					// params[0] is empty for this command
					params.push([]);
					// params[1] flashrate value
					params.push(msg.value);

					msg["params"] = params;

				} else if (msg.command_type == "set_all_backlights") {
					//console.log("Command: set_all_backlights");
					msg.name = "setAllBacklights";
					var params = [];

					// params[0] is empty for this command
					params.push([]);

					// params[1] boolean colour/on/off value
					if (msg.value == 1) {
						// Light on - what colour?
						if (msg.hasOwnProperty("color")) {
							params.push(msg.color);
						} else {
							params.push(true);
							msg["color"] = -1;
						}
					} else if (msg.value == 0) {
						params.push(false);
						if (! msg.hasOwnProperty("color")) { msg["color"] = -1; }
					} else {
						// Unknown/wrong value
					}

					msg["params"] = params;

				} else if (msg.command_type == "set_backlight_intensity") {
					/*	TODO
					*	In particular, we need a table mapping known colours
					*	to red/blue values which this command uses.
					*/
					//console.log("Command: set_backlight_intensity");
					msg.name = "setBacklightIntensity";
					var params = [];
					var blue_red_pair = [];
					if (typeof(msg.value) == "number") {
						if (msg.color == "red") { blue_red_pair[0] = 0; blue_red_pair[1] = msg.value; }
						else if (msg.color == "red") { blue_red_pair[0] = 0; blue_red_pair[1] = msg.value; }
						else if (msg.color == "blue") { blue_red_pair[0] = msg.value; blue_red_pair[1] = 0; }
						else if (msg.color == "purple") { blue_red_pair[0] = msg.value; blue_red_pair[1] = msg.value; }
						else {
							// Unknown colour
							blue_red_pair[0] = msg.value; blue_red_pair[1] = msg.value;
						}
						params.push(blue_red_pair);
					}
					else if (typeof(msg.value) == "object") {
						// In this case, expect an array already containing the blue & red values required
						params.push(msg.value);
						// Add/substitute dummy value for msg.colour to indicate it was unused
						msg.color = -1;
					}
					else {
						// Unknown value type. Abort.
						// Error message?
						return;
					}

					msg["params"] = params;

				} else if (msg.command_type == "write_data") {
					//console.log("Command: write_data");
					msg.name = "writeData";
					var params = [];
					if ((msg.hasOwnProperty("byte_array")) && (typeof(msg.byte_array) == "object")) {
						params.push(msg.byte_array);
					}

					msg["params"] = params;

				} else if (msg.command_type == "set_unit_id") {
					/*	Since we touch the EEPROM with this command,
					*	don't accept wildcards for product_id, unit_id, duplicate_id.
					*/
					//console.log("Command: set_unit_id");
					msg.name = "setUnitID";
					var params = [];

					if (msg.product_id < 0 || msg.unit_id < 0 || msg.duplicate_id < 0) {
						// Not aceptable // Send error message?
						console.log(`Command set_unit_id doesn't accept wildcards`);
						return;
					}
					if (msg.new_unit_id < 0) { // Not aceptable // Send error message?
						console.log(`Command set_unit_id needs a valid new_unit_id - not ${msg.new_unit_id}`);
						return;
					}

					// params[0] is empty for this command
					params.push([]);

					// params[1] has the new unit_it
					params.push(msg.new_unit_id);

					msg["params"] = params;

				} else if (msg.command_type == "save_backlight") {
					/*	Since we touch the EEPROM with this command,
					*	don't accept wildcards for product_id, unit_id, duplicate_id.
					*/
					//console.log("Command: save_backlight");
					msg.name = "saveBackLights";
					var params = [];

					if (msg.product_id < 0 || msg.unit_id < 0 || msg.duplicate_id < 0) {
						// Not aceptable // Send error message?
						console.log(`Command save_backlight doesn't accept wildcards`);
						return;
					}

				} else {
					console.log("Unhandled command");
					return;
				}
			/*	No "break" for case "command"!
			*
			*	Having massaged the command into a format
			*	suitable for processing by case "method",
			*	we now want to fall through to case "method"
			*/
			case "method":
				/*	This is a 1.0.0 format method request
				*
				*	We expect messages in format:
				*		{request:"method", pid_list:[e0,e1,...,eN], unit_id:UID, duplicate_id:ORDER, name:METHODNAME, params:[p0,p1,...,pN]}
				*	where p0 = [k1,k2,...,kN] (dependent on method name)
				*/
				//console.log("method request: " + message);
				var devices = [];
				Object.keys(xkeys_devices).forEach(function (item) {
					//console.log("xkeys_devices item:" + item);
					/*
					*	pid_list == [] means target any attached device.
					*/
					if (msg.pid_list.length == 0) {
						var regex;
						if (msg.unit_id > -1) {
							//console.log("unit_id check 0: " + msg.unit_id);
							regex = new RegExp("\[0-9\]+-" + msg.unit_id);
							if (item.search(regex) > -1) {
								// unit_id matches, what about duplicate_id?
								if (msg.duplicate_id > -1 ) {
									regex = new RegExp("\[0-9\]+-" + msg.unit_id + "-" + msg.duplicate_id);
									if (item.search(regex) > -1) {
										//console.log(`Found usable device 4: ${item}`);
										devices.push(item);
									}
								} else if (msg.duplicate_id == -1) {
									regex = new RegExp("\[0-9\]+-" + msg.unit_id + "-\[0-9\]+");
									if (item.search(regex) > -1) {
										//console.log(`Found usable device 4: ${item}`);
										devices.push(item);
									}
								}
							}
						} else {
							// no unit_id specified but check specified duplicate_id
							if (msg.duplicate_id > -1) {
								regex = new RegExp("\[0-9\]+-\[0-9\]+-" + msg.duplicate_id);
								if (item.search(regex) > -1) {
									//console.log(`Found usable device 2: ${item}`);
									devices.push(item);
								}
							} else if (msg.duplicate_id == -1) {
								// use all devices
								devices.push(item);
							}
						}
					} else {
						// An endpoint has been specified
						msg.pid_list.forEach(function (ep) {
							//console.log("Checking endpoint: " + ep);
							var regex;
							if (msg.unit_id > -1) {
								//console.log("unit_id check 1: " + msg.unit_id);
								regex = new RegExp(ep + "-" + msg.unit_id);
								if (item.search(regex) > -1) {
									// endpoint and unit_id both given, what about duplicate_id?
									if (msg.duplicate_id > -1) {
										// ep, unit_id, duplicate_id all given
										regex = new RegExp(ep + "-" + msg.unit_id + "-" + msg.duplicate_id);
										if (item.search(regex) > -1) {
											//console.log("Found usable device 5: " + item);
											devices.push(item);
										}
									} else if (msg.duplicate_id == -1) {
										// ep & unit_id given, any duplicate_id will do
										regex = new RegExp(ep + "-" + msg.unit_id + "-\[0-9\]+");
										if (item.search(regex) > -1) {
											//console.log("Found usable device 6: " + item);
											devices.push(item);
										}
									}

								}
							} else {
								// No unit_id specified - accept any unit_id
								//console.log(`unit_id check 2 ${item}: (none)`);
								// Check duplicate_id
								if (msg.duplicate_id > -1) {
									// no unit_id specified but check specified duplicate_id
									regex = new RegExp(ep + "-\[0-9\]+-" + msg.duplicate_id);
									if (item.search(regex) > -1) {
										//console.log(`Found usable device 2: ${item}`);
										devices.push(item);
									}
								} else if (msg.duplicate_id == -1) {
									regex = new RegExp(ep + "-\[0-9\]+-\[0-9\]+");
									if (item.search(regex) > -1) {
										//console.log(`Found usable device 1: ${item}`);
										devices.push(item);
									}
								}
							}
						})
					}
				});

				/*	command_result message.
				*
				*	Up to duplicate_id, message fields are common
				*	to all command_types, so we set them up here
				*	before anything is executed.
				*
				*	Fields that are specific to a command_type are
				*	added below when that command type has been processed.
				*/
				var command_result = {};
				command_result["msg_type"] = "command_result";
				command_result["command_type"] = msg.command_type;
				command_result["server_id"] = ServerID;
				if (devices.length > 0) {
					device_names = [];
					devices.forEach( (device) => {
						device_names.push(xkeys_devices[device].device.info.name);
					})
					command_result["device"] = device_names.toString();

					command_result["device_list"] = devices;

				} else {
					//	Never reached because no devices satisfied device matching requirements
					//	Not srictly an error but we could still return some sort of advice
				}
				if (msg.hasOwnProperty("product_id")) {
					/*	Only commands via UDP have the product_id field
					*	(NodeRED methods use pid_list)
					*/
					command_result["product_id"] = msg.product_id;
				} else {
					// This wasn't a command via UDP, so doesn't need a command_result.
					// Use this later to determine whether to send command_result at all
					// (or should UDP clients know when something has been changed by a NodeRED client?)
				}
				command_result["unit_id"] = msg.unit_id;
				command_result["duplicate_id"] = msg.duplicate_id;
				/*	Individual commands below will add fields specific to them */

				/*
				*	Process the command.
				*/
				devices.forEach( (device) => {
					if (msg.name == "setIndicatorLED") {
						//console.log("setIndicatorLED(): ");
						/*
						*	For each device matching pid_list & unit_id, call the named method with given params.
						*	param p0 (msg.params[0]) is an array of led# to target, typically 1, 2, or 1 & 2.
						*	param p1 (msg.params[1]) is a boolean denoting whether to turn LED on or off
						*	param p2 (msg.params[2]) is a boolean denoting whether LED should be flashing or not
						*/
						// Determine which led(s) to target
						msg.params[0].forEach( function (ledid) {
							// Is ledid a valid number (1 or 2)
							if (isNaN(parseInt(ledid))) { return; }

							// Run it
							if ( msg.params.length > 2 ) {
								//console.log("Running: setIndicatorLED(" + parseInt(ledid) + "," + msg.params[1] + "," + msg.params[2] + ")");
								xkeys_devices[device].device.setIndicatorLED(parseInt(ledid), msg.params[1], msg.params[2]);
							} else {
								xkeys_devices[device].device.setIndicatorLED(parseInt(ledid), msg.params[1]);
							}
						});

						// Add command_result entries specific to this command_type
						command_result["control_id"] = msg.control_id;
						command_result["value"] = msg.value;
						command_result["flash"] = msg.flash;

					} else if (msg.name == "writeLcdDisplay") {
						/*
						*	Parameter p0 (msg.params[0]) is an array of strings (one entry for each line) for the device to display.
						*/
						// Determine what text to write to each line
						for (var i=0;i<msg.params[0].length;i++) {
							if (msg.params[0][i].length > 0) {
								xkeys_devices[device].device.writeLcdDisplay(i+1, msg.params[0][i], msg.params[1]);
							}
						}

						// Add command_result entries specific to this command_type
						command_result["line"] = msg.line;
						command_result["text"] = msg.text;
						if (msg.hasOwnProperty("backlight")) {
							command_result["backlight"] = msg.backlight;
						}

					} else if (msg.name == "setFlashRate") {
						/*
							Flash rate is provided as parameter params[1]
							(empty p0 is unused)
						*/
						if (isNaN(parseInt(msg.params[1]))) { return; }
						xkeys_devices[device].device.setFrequency(parseInt(msg.params[1]));

						// Add command_result entries specific to this command_type
						command_result["value"] = msg.value;

					} else if (msg.name == "setUnitID") {
						/*
						*	The new UnitID provided as parameter params[1]
						*	(empty p0 is unused)
						*/
						//console.log("About to run: setUnitId(" + parseInt(msg.params[1]) + ")");
						xkeys_devices[device].device.setUnitId(parseInt(msg.params[1]));

						// Add command_result entries specific to this command_type
						command_result["target_unit_id"] = msg.unit_id;
						command_result["new_unit_id"] = msg.params[1];

						// Reboot this "new" device so that it is noticed by the system
						xkeys_devices[device].device.rebootDevice();

						// Remove the _old_ device from our local record
						delete xkeys_devices[device];
						console.log(`After removal, xkeys_devices = ${JSON.stringify(Object.keys(xkeys_devices))}`);

					} else if (msg.name == "setBacklight") {
						/*
						*	For backlights, msg.params[0] is an array of buttonids to activate
						*	                msg.params[1] is the hue to set
						*	                msg.params[2] is true/false (flashing mode or not)
						*/

						msg.params[0].forEach( (key) => {
							// key must represent a valid number
							var buttonid = parseInt(key);
							if (isNaN(buttonid)) { return; }

							//console.log("Running: setBacklight(" + buttonid + "," + msg.params[1] + "," + msg.params[2] + ")");
							xkeys_devices[device].device.setBacklight(buttonid, msg.params[1], msg.params[2]);
						});

						// Add command_result entries specific to this command_type
						command_result["control_id"] = msg.control_id;
						command_result["value"] = msg.value;
						command_result["flash"] = msg.flash;

					} else if (msg.name == "setAllBacklights") {
						/*	params[0] unused
						*	params[1] for colour/on/off
						*/
						xkeys_devices[device].device.setAllBacklights(msg.params[1]);

						// Add command_result entries specific to this command_type
						command_result["value"] = msg.value;
						command_result["color"] = msg.color;

					} else if (msg.name == "setBacklightIntensity") {
						/*
						*	params[0] is an array of intensity values (blue, red) 
						*/
						//console.log("Running: setBacklightIntensity(" + msg.params[0] + ") for " + xkeys_devices[device].device.product.name);

						xkeys_devices[device].device.setBacklightIntensity(msg.params[0][0], msg.params[0][1]);

						// Add command_result entries specific to this command_type
						command_result["value"] = msg.value;
						command_result["color"] = msg.color;

					} else if (msg.name == "saveBackLights") {
						//console.log("Running: saveBackLights() for " + xkeys_devices[device].device.product.name);
						xkeys_devices[device].device.saveBackLights();

						// No command_result entries specific to this command_type

					} else if (msg.name == "writeData") {
						//console.log("Running: writeData(" + JSON.stringify(msg.params[0]) + ") for " + xkeys_devices[device].device.product.name);
						xkeys_devices[device].device.writeData(msg.params[0]);

						// Add command_result entries specific to this command_type
						command_result["byte_array"] = msg.params[0];

					} else {
						console.log("Unsupported library method: " + msg.name);
					}
				});
				if (msg.hasOwnProperty("product_id")) {
					// NodeRED clients don't send product_id (they use pid_List)

					if (devices.length < 1) {
						console.log(`No device match to run command ${msg.command_type}`);
						command_result["error"] = `No device match to run command ${msg.command_type}`;
						udp_server.send(JSON.stringify(command_result), rinfo.port, rinfo.address);
					} else {
						send_udp_message(JSON.stringify(command_result));
					}
				}

				/*	Nothing to do but ... */
				if (msg_transport == "udp") {
				} else if (msg_transport == "mqtt") {
				}
				break;
			default:
				console.log(`request_message_process(): Unhandled msg.reqest - ${message}`);
		}

	}
    catch (err) {
		/*	message doesn't comply in some way - either:
		*	- can't JSON.parse it
		*	- some error processing it
		*/
		if (msg_transport == "udp") {
			console.log(`Couldn't parse message: ${message.toString()} from ${rinfo.address}:${rinfo.port}`);
		} else if (msg_transport == "mqtt") {
			console.log(`Couldn't parse message: ${message.toString()}`);
		}
		console.log(err);
		return;
	}
}


const connectUrl = 'mqtt://localhost'
var client = mqtt.connect(connectUrl)

client.on('reconnect', (error) => {
    //console.log('reconnecting:', error)
})

client.on('error', (error) => {
    //console.log('Connection failed:', error)
})

client.on('connect', () => {
    console.log('connected');
    client.publish('/xkeys/server', JSON.stringify({"server_id":ServerID, "request":"hello","data":"Hello from Xkeys device server"}),{qos:qos,retain:false});
    client.subscribe({'/xkeys/node/#':{qos:qos}}, function (err) {
    	if (!err) {
      	    console.log(`xkeys-server ${ServerVersion} subscribed OK`);
    	} else {
			// Any point in going on?
			console.log('Subscription failed: ' + err);
			process.exit(1);
		}
    })

	/* Heartbeat timer */
	setInterval(sendHeartbeat, 2000, client);

})


/*	this_is_a_test ()
*
*/
this_is_a_test = () => {
	console.log(`Testing whether this is a test`);
	const args = process.argv.slice(2);
	if (args.length > 0) {
		if (args[0] == "test") {
			console.log(`This is a test`);
			elgato.stop();
			udp_server.close();
			client.end();
			watcher.stop();
			process.exit(0);
		}
	}
}
setTimeout(this_is_a_test, 5000);

function startWatcher () {
	watcher = new XKeysWatcher({
		automaticUnitIdMode: false,
		usePolling: USE_POLLING,
		pollingInterval: 500, // optional, default is 1000 ms
	});
	watcher.on('connected', (xkeysPanel) => {
		console.log(`X-keys panel ${xkeysPanel.uniqueId} discovered`);
		add_xkeys_device(xkeysPanel);
		update_client_device_list("");
			var attach_msg = {"msg_type":"attach_event", "server_id":ServerID, "device":xkeysPanel.info.name,};
			attach_msg["product_id"] = xkeysPanel.info.productId;
			attach_msg["unit_id"] = xkeysPanel.info.unitId;
			attach_msg["duplicate_id"] = xkeysPanel.duplicate_id;
			attach_msg["attached_devices"] = Object.keys(xkeys_devices);
			send_udp_message(JSON.stringify(attach_msg));

		xkeysPanel.on('disconnected', () => {
			var temp_id = xkeysPanel.uniqueId.replace(/_/g, "-") + "-" + xkeysPanel.duplicate_id;
			console.log(`X-keys panel ${temp_id} disconnected`)
			delete xkeys_devices[temp_id];
			update_client_device_list("");
			var detach_msg = {"msg_type":"detach_event", "server_id":ServerID, "device":xkeysPanel.info.name,};
			detach_msg["product_id"] = xkeysPanel.info.productId;
			detach_msg["unit_id"] = xkeysPanel.info.unitId;
			detach_msg["duplicate_id"] = xkeysPanel.duplicate_id;
			detach_msg["attached_devices"] = Object.keys(xkeys_devices);
			send_udp_message(JSON.stringify(detach_msg));
		})
		/*
			RPIs version < 4 don't handle rebootDevice(), leaving xkeys_devices in an inconsistent state.
			Therefore we always check the source of the following events and add_unknown_xkeys_device() if necessary.
		*/
		xkeysPanel.on('down', (btnIndex, metadata) => {
			//console.log(`X-keys panel ${xkeysPanel.info.name} down`)
			var temp_id = xkeysPanel.uniqueId.replace(/_/g, "-") + "-" + xkeysPanel.duplicate_id;
			if (Object.keys(xkeys_devices).includes(temp_id)) {
				var product_id = xkeys_devices[temp_id].device.info.productId;
				var unit_id = xkeys_devices[temp_id].device.info.unitId;
				//console.log("DOWN event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
				if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
				metadata["type"] = "down";
				metadata["shortnam"] = xkeys_products[product_id.toString()];
				var msg_topic = '/xkeys/server/button_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + btnIndex;
				var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
				client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

				// This is the v2.0.0 format
				// value = 1 for down, 0 for up
				var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":xkeysPanel.info.name,
								"product_id":product_id,"unit_id":unit_id,"duplicate_id":xkeysPanel.duplicate_id, "control_id":btnIndex,
								"row":metadata.row,"col":metadata.col, "value":1,"timestamp":metadata.timestamp};
				send_udp_message(JSON.stringify(msg_udp));
			} else {
				add_unknown_xkeys_device(xkeysPanel)
				.then(data => {
					console.log("XXXXX " + data);
					update_client_device_list("");
					console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

					var product_id = xkeys_devices[temp_id].device.info.productId;
					var unit_id = xkeys_devices[temp_id].device.info.unitId;
					//console.log("DOWN event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
					if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
					metadata["type"] = "down";
					metadata["shortnam"] = xkeys_products[product_id.toString()];
					var msg_topic = '/xkeys/server/button_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + btnIndex;
					var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the v2.0.0 format
					// value = 1 for down, 0 for up
					var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":xkeysPanel.info.name,
									"product_id":product_id,"unit_id":unit_id,"duplicate_id":xkeysPanel.duplicate_id, "control_id":btnIndex,
									"row":metadata.row,"col":metadata.col, "value":1,"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				})
			}
		})
		xkeysPanel.on('up', (btnIndex, metadata) => {
			//console.log(`X-keys panel ${xkeysPanel.info.name} up`)
			var temp_id = xkeysPanel.uniqueId.replace(/_/g, "-") + "-" + xkeysPanel.duplicate_id;
			if (Object.keys(xkeys_devices).includes(temp_id)) {
				var product_id = xkeys_devices[temp_id].device.info.productId;
				var unit_id = xkeys_devices[temp_id].device.info.unitId;
				//console.log("UP event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
				if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
				metadata["type"] = "up";
				metadata["shortnam"] = xkeys_products[product_id.toString()];
				var msg_topic = '/xkeys/server/button_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + btnIndex;
				var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
				client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

				// This is the v2.0.0 format
				// value = 1 for down, 0 for up
				var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":xkeysPanel.info.name,
								"product_id":product_id,"unit_id":unit_id,"duplicate_id":xkeysPanel.duplicate_id, "control_id":btnIndex,
								"row":metadata.row,"col":metadata.col, "value":0,"timestamp":metadata.timestamp};
				send_udp_message(JSON.stringify(msg_udp));
			} else {
				add_unknown_xkeys_device(xkeysPanel)
				.then(data => {
					console.log("XXXXX " + data);
					update_client_device_list("");
					console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

					var product_id = xkeys_devices[temp_id].device.info.productId;
					var unit_id = xkeys_devices[temp_id].device.info.unitId;
					//console.log("UP event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
					if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
					metadata["type"] = "up";
					metadata["shortnam"] = xkeys_products[product_id.toString()];
					var msg_topic = '/xkeys/server/button_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + btnIndex;
					var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the v2.0.0 format
					// value = 1 for down, 0 for up
					var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":xkeysPanel.info.name,
									"product_id":product_id,"unit_id":unit_id,"duplicate_id":xkeysPanel.duplicate_id, "control_id":btnIndex,
									"row":metadata.row,"col":metadata.col, "value":0,"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				})
			}
		})
		xkeysPanel.on('jog', (index, deltaPos, metadata) => {
			//console.log(`X-keys panel ${xkeysPanel.info.name} jog (${index}), delta ${deltaPos}`)
			var temp_id = xkeysPanel.uniqueId.replace(/_/g, "-") + "-" + xkeysPanel.duplicate_id;
			if (Object.keys(xkeys_devices).includes(temp_id)) {
				var product_id = xkeys_devices[temp_id].device.info.productId;
				var unit_id = xkeys_devices[temp_id].device.info.unitId;
				//console.log("JOG event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
				if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
				metadata["type"] = "jog";
				metadata["deltaPos"] = norm.normalize(deltaPos, "jog");
				metadata["shortnam"] = xkeys_products[product_id.toString()];
				var msg_topic = '/xkeys/server/jog_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id +  '/' + index;
				var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
				client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

				// This is the v2.0.0 format
				var msg_udp = {"msg_type":"jog_event", "server_id":ServerID, "device":xkeysPanel.info.name,
								"product_id":product_id, "unit_id":unit_id, "duplicate_id":xkeysPanel.duplicate_id,
								"control_id":index, "value":norm.normalize(deltaPos,"jog"), "timestamp":metadata.timestamp};
				send_udp_message(JSON.stringify(msg_udp));
			} else {
				add_unknown_xkeys_device(xkeysPanel)
				.then(data => {
					console.log("XXXXX " + data);
					update_client_device_list("");
					console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

					var product_id = xkeys_devices[temp_id].device.info.productId;
					var unit_id = xkeys_devices[temp_id].device.info.unitId;
					//console.log("JOG event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
					if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
					metadata["type"] = "jog";
					metadata["deltaPos"] = norm.normalize(deltaPos,"jog");
					metadata["shortnam"] = xkeys_products[product_id.toString()];
					var msg_topic = '/xkeys/server/jog_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + index;
					var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the v2.0.0 format
					var msg_udp = {"msg_type":"jog_event", "server_id":ServerID, "device":xkeysPanel.info.name,
									"product_id":product_id, "unit_id":unit_id, "duplicate_id":xkeysPanel.duplicate_id,
									"control_id":index, "value":norm.normalize(deltaPos,"jog"), "timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				})
			}
		})
		xkeysPanel.on('shuttle', (index, shuttlePos, metadata) => {
			//console.log(`X-keys panel ${xkeysPanel.info.name} jog (${index})`)
			var temp_id = xkeysPanel.uniqueId.replace(/_/g, "-") + "-" + xkeysPanel.duplicate_id;
			if (Object.keys(xkeys_devices).includes(temp_id)) {
				var product_id = xkeys_devices[temp_id].device.info.productId;
				var unit_id = xkeys_devices[temp_id].device.info.unitId;
				//console.log("SHUTTLE event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
				if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
				metadata["type"] = "shuttle";
				metadata["shuttlePos"] = norm.normalize(shuttlePos, metadata["type"]);
				metadata["shortnam"] = xkeys_products[product_id.toString()];
				var msg_topic = '/xkeys/server/shuttle_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + index;
				var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
				client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

				// This is the v2.0.0 format
				var msg_udp = {"msg_type":"shuttle_event", "server_id":ServerID, "device":xkeysPanel.info.name,
								"product_id":product_id, "unit_id":unit_id, "duplicate_id":xkeysPanel.duplicate_id,
								"control_id":index, "value":norm.normalize(shuttlePos,metadata["type"]), "timestamp":metadata.timestamp};
				send_udp_message(JSON.stringify(msg_udp));
			} else {
				add_unknown_xkeys_device(xkeysPanel)
				.then(data => {
					console.log("XXXXX " + data);
					update_client_device_list("");
					console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

					var product_id = xkeys_devices[temp_id].device.info.productId;
					var unit_id = xkeys_devices[temp_id].device.info.unitId;
					//console.log("SHUTTLE event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
					if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
					metadata["type"] = "shuttle";
					metadata["shuttlePos"] = norm.normalize(shuttlePos, metadata["type"]);
					metadata["shortnam"] = xkeys_products[product_id.toString()];
					var msg_topic = '/xkeys/server/shuttle_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + index;
					var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the v2.0.0 format
					var msg_udp = {"msg_type":"shuttle_event", "server_id":ServerID, "device":xkeysPanel.info.name,
									"product_id":product_id, "unit_id":unit_id, "duplicate_id":xkeysPanel.duplicate_id,
									"control_id":index, "value":norm.normalize(shuttlePos, metadata["type"]), "timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				})
			}
		})
		xkeysPanel.on('joystick', (index, position, metadata) => {
			//console.log(`X-keys panel ${xkeysPanel.info.name} joystick (${index})`)
			position["x"] = norm.normalize(position["x"], "joyx");
			position["y"] = norm.normalize(position["y"], "joyy");
			position["z"] = norm.normalize(position["z"], "joyz");
			position["deltaZ"] = norm.normalize(position["deltaZ"], "deltaZ");
			var temp_id = xkeysPanel.uniqueId.replace(/_/g, "-") + "-" + xkeysPanel.duplicate_id;
			if (Object.keys(xkeys_devices).includes(temp_id)) {
				var product_id = xkeys_devices[temp_id].device.info.productId;
				var unit_id = xkeys_devices[temp_id].device.info.unitId;
				//console.log("JOYSTICK event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
				if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
				metadata["type"] = "joystick";
				metadata["position"] = position;
				metadata["shortnam"] = xkeys_products[product_id.toString()];
				var msg_topic = '/xkeys/server/joystick_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + "/" + index;
				var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
				client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

				// This is the v2.0.0 format
				var msg_udp = {"msg_type":"joystick_event", "server_id":ServerID, "device":xkeysPanel.info.name,
								"product_id":product_id, "unit_id":unit_id, "duplicate_id":xkeysPanel.duplicate_id, "control_id":index,
								"x":position.x, "y":position.y, "z":position.z, "deltaZ":position.deltaZ,
								"timestamp":metadata.timestamp};
				send_udp_message(JSON.stringify(msg_udp));
			} else {
				add_unknown_xkeys_device(xkeysPanel)
				.then(data => {
					console.log("XXXXX " + data);
					update_client_device_list("");
					console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

					var product_id = xkeys_devices[temp_id].device.info.productId;
					var unit_id = xkeys_devices[temp_id].device.info.unitId;
					//console.log("JOYSTICK event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
					if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
					metadata["type"] = "joystick";
					metadata["position"] = position;
					metadata["shortnam"] = xkeys_products[product_id.toString()];
					var msg_topic = '/xkeys/server/joystick_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + "/" + index;
					var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the v2.0.0 format
					var msg_udp = {"msg_type":"joystick_event", "server_id":ServerID, "device":xkeysPanel.info.name,
									"product_id":product_id, "unit_id":unit_id, "duplicate_id":xkeysPanel.duplicate_id, "control_id":index,
									"x":position.x, "y":position.y, "z":position.z, "deltaZ":position.deltaZ,
									"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				})
			}
		})
		xkeysPanel.on('tbar', (index, position, metadata) => {
			//console.log(`X-keys panel ${xkeysPanel.info.name} tbar (${index})`)
			var temp_id = xkeysPanel.uniqueId.replace(/_/g, "-") + "-" + xkeysPanel.duplicate_id;
			if (Object.keys(xkeys_devices).includes(temp_id)) {
				var product_id = xkeys_devices[temp_id].device.info.productId;
				var unit_id = xkeys_devices[temp_id].device.info.unitId;
				//console.log("TBAR event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
				if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
				metadata["type"] = "tbar";
				metadata["position"] = norm.normalize(position, "tbar");
				metadata["shortnam"] = xkeys_products[product_id.toString()];
				var msg_topic = '/xkeys/server/tbar_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + index;
				var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
				client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

				// This is the 2.0.0 format
				var msg_udp = {"msg_type":"tbar_event", "server_id":ServerID, "device":xkeysPanel.info.name,
								"product_id":product_id, "unit_id":unit_id, "duplicate_id":xkeysPanel.duplicate_id, "control_id":index,
								"value":norm.normalize(position, "tbar"),"timestamp":metadata.timestamp};
				send_udp_message(JSON.stringify(msg_udp));
			} else {
				add_unknown_xkeys_device(xkeysPanel)
				.then(data => {
					console.log("XXXXX " + data);
					update_client_device_list("");
					console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

					var product_id = xkeys_devices[temp_id].device.info.productId;
					var unit_id = xkeys_devices[temp_id].device.info.unitId;
					//console.log("TBAR event from " + JSON.stringify(xkeys_devices[temp_id].device.info));
					if (! metadata.hasOwnProperty("timestamp")) { metadata["timestamp"] = -1; }
					metadata["type"] = "tbar";
					metadata["position"] = norm.normalize(position, "tbar");
					metadata["shortnam"] = xkeys_products[product_id.toString()];
					var msg_topic = '/xkeys/server/tbar_event/' + product_id + '/' + unit_id + '/' + xkeysPanel.duplicate_id + '/' + index;
					var msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the 2.0.0 format
					var msg_udp = {"msg_type":"tbar_event", "server_id":ServerID, "device":xkeysPanel.info.name,
									"product_id":product_id, "unit_id":unit_id, "duplicate_id":xkeysPanel.duplicate_id, "control_id":index,
									"value":norm.normalize(position, "tbar"),"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				})
			}
		})
	})
}	// function startWatcher()


/*
	Add a newly discovered device to xkeys_devices object.
	Main concern is duplicate uniqueId
	(probably same devices with UID still == 0)
*/
add_xkeys_device = (xkeysPanel) => {
	var duplicate_id = 0;
	var temp_id_base = xkeysPanel.uniqueId.replace(/_/g, "-");
	while ((temp_id_base + '-' + duplicate_id) in xkeys_devices) {
		duplicate_id += 1;
	}
	xkeysPanel["duplicate_id"] = duplicate_id;
	var temp_id = temp_id_base + "-" + xkeysPanel.duplicate_id;
	console.log(`New device entry: ${temp_id}`);
	xkeys_devices[temp_id] = {"owner": "", "device": xkeysPanel};

	console.log(`After add_xkeys_device(): xkeys_devices = ${JSON.stringify(Object.keys(xkeys_devices))}`);
	//console.log(`After add_xkeys_device(): xkeys_devices = ${JSON.stringify(xkeys_devices)}`);
}	// function add_xkeys_device()

/*
	Add a device discovered by acccident i.e. not by the watcher itself.
	This can happen with RPSs version < 4, which have insufficient USB hardware
	to deal with rebootDevice() calls (used after setUnitId() is called).

	Although we can probably add the "new" device to xkeys_devices here, it still leaves
	xkeys_devices in an inconsistent state because the "old" device remains on it.

	Here we use XKeys.listAllConnectedPanels() to completely repopulate xkeys_devices.
*/
function add_unknown_xkeys_device (xkeysPanel) {
	console.log("add_unknown_xkeys_device");
	var devices = XKeys.listAllConnectedPanels();
	var devsRemaining = devices.length;
	console.log("device count = " + devsRemaining);
	xkeys_devices = {};

	return new Promise((resolve) => {
		devices.forEach((panel) => {
			XKeys.setupXkeysPanel(panel)
				.then( (xkeysPanel) => {
					add_xkeys_device(xkeysPanel);
					devsRemaining -= 1;
					console.log("devsRemaining = " + devsRemaining);
					if ( devsRemaining < 1 ) {
						resolve(devsRemaining);
					}
				})
				.catch(console.log)
				})
	})
}	// function add_unknown_xkeys_device()

/*	MQTT message

	Each message should be a stringified json object
	containing a "request" field, optionally followed
	by any parameters required for the request.
	{request: requestName, param0: param, param1: param, ...}
*/
client.on('message', (topic, message) => {
    //console.log('received message：', topic, message.toString())
	request_message_process("mqtt", message, topic);
})

// Send a (possibly unsolicited) device list
update_client_device_list = (topic) => {

	var device_list = {};
	for (const key of Object.keys(xkeys_devices) ) {
		//console.log("Found ", xkeys_devices[key].info.name, " at ", key);
		device_list[key] = xkeys_devices[key].device.info;
	}
	//console.log("update_client_device_list(): " + JSON.stringify(device_list));
	if (topic.length > 0) {
		//console.log("Publish result_deviceList to:" + topic.replace("node","server"));
   		client.publish(topic.replace("node","server"), JSON.stringify({"server_id":ServerID, "request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
		//send_udp_message(JSON.stringify({"topic":topic.replace("node","server"),"server_id":ServerID, "request":"result_deviceList", "data":device_list}));
	} else {
		console.log("Publish result_deviceList");
   		client.publish('/xkeys/server', JSON.stringify({"server_id":ServerID, "request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
		//send_udp_message(JSON.stringify({"server_id":ServerID, "request":"result_deviceList", "data":device_list}));
	}
}

/*	are_we_there_yet ()
*
*	This is an opportunity to decide whether to startWatcher().
*	Perhaps we want to check status of UDP and/or MQTT connection.
*/
are_we_there_yet = () => {
	console.log(`Are we there yet?`);

	// For now, assume everything is OK to go.
	startWatcher();

	/*	 Introduce the elgato plugin
	*/
	elgato.start(xkeys_devices, ServerID, client);
}
setTimeout(are_we_there_yet, 1000);

sendHeartbeat = (client) => {
	//console.log("heartbeat");
  	client.publish('/xkeys/server', JSON.stringify({"server_id":ServerID, "request":"heartbeat"}), {qos:qos,retain:false});
}


/* udp_server functions */
udp_server.on('error', (err) => {
	console.log(err.stack);
	udp_server.close();
});

udp_server.on('message', (message, rinfo) => {
	//console.log(`Client message \"${message}\" from ${rinfo.address}:${rinfo.port}`);
	request_message_process("udp", message, rinfo);
});

udp_server.on('listening', () => {
	const address = udp_server.address();
	console.log(`server listening ${address.address}:${address.port}`);
});

udp_server.on('closed', (rinfo) => {
});

udp_server.bind(udp_port, udp_host);

/*	send_udp_message(msg)
*
*	send the msg to all known clients
*/
send_udp_message = (msg) => {
	//console.log("send_udp_message(), mesg = " + msg);
	//	Ensure we're sending valid (parsable) JSON
	try {
		var message = JSON.parse(msg);
	}
	catch (err) {
		console.log(`send_udp_message(): Exception parsing msg. ${err}`);
		return;
	}

	for (const client of udp_clients) {
		try {
			udp_server.send(msg, client.remote.port, client.remote.address);
		} catch (err) {
			console.log("send_udp_message() error: " + err);
		}
	}
}


/*	check_connected (msg, rinfo)
*
*	Return true if sender in known in udp_clients.
*	Otherwise return false.
*/
is_connected = (rinfo) => {
	return (udp_clients.findIndex(item => item.remote.address === rinfo.address && item.remote.port === rinfo.port) > -1);
}

/*	reset_client_ttl_timer(client)
*
*	Restart the timer sequence for this client.
*	Typically used whenever a client message is received.
*/
reset_client_ttl_timer = (rinfo) => {
	//	Check that the client is known
	const index = udp_clients.findIndex(item => item.remote.address === rinfo.address && item.remote.port === rinfo.port);
	if (index < 0) {
		//	Unknown client (discover or connect client?)
	} else {
		//	Reset the timeout object
		clearTimeout(udp_clients[index].ttl_timer);
		udp_clients[index].ttl_timer = setTimeout(send_ttl_warning, TIMEOUT_CLIENT_TTL, udp_clients[index]);
		udp_clients[index].warnings = 0;
	}
}

/*	send_ttl_warning(client)
*
*	If the client has not communicated within a certain time,
*	we send it two warnings that it should communicate somehow
*	(perhaps with another connect message)
*	
*/
send_ttl_warning = (client) => {
	client.warnings += 1;
	//console.log(`send_ttl_warning() ${client.warnings}`);

	if (client.warnings < CLIENT_TTL_WARNINGS) {
		//	Send another warning
		const disconnect_warning = {"msg_type":"disconnect_warning","server_id":ServerID};
		disconnect_warning["client_address"] = client.remote.address;
		disconnect_warning["client_port"] = client.remote.port;
		disconnect_warning["client_name"] = client.client_name;
		// To warned client only?
		udp_server.send(JSON.stringify(disconnect_warning), client.remote.port, client.remote.address);

		// 	Check again later
		client.ttl_timer = setTimeout(send_ttl_warning, TIMEOUT_CLIENT_WARNING_TTL, client);

	} else {
		//	Enough warnings - disconnect the client
		console.log(`send_ttl_warning() time to die (warnings = ${client.warnings} for ${client.client_name})`);
		remove_udp_client(client.remote);
	}
}
/*	add_udp_client(client)
*
*	This is the preferred method to establish a client presence
*	in the udp_clients list (rather than udp_clients.push()) because
*	it sets up a timeout mechanism for inactive clients.
*/
add_udp_client = (client) => {
	//console.log(`add_udp_client() add`);

	const index = udp_clients.findIndex(item => item.remote.address === client.remote.address && item.remote.port === client.remote.port);
	if (index < 0) {
		//	Add a timeout object
		client["ttl_timer"] = setTimeout(send_ttl_warning, TIMEOUT_CLIENT_TTL, client);
		client["warnings"] = 0;
		udp_clients.push(client);

	} else {
		/*	This an existing client so this is either
		*	- a keep alive connect
		*	- a change of name connect
		*/
		//	In any case, cancel any existing timer & restart it
		clearTimeout(udp_clients[index].ttl_timer);
		udp_clients[index].ttl_timer = setTimeout(send_ttl_warning, TIMEOUT_CLIENT_TTL, udp_clients[index]);
		udp_clients[index].warnings = 0;

		//	In case of a name change
		udp_clients[index].client_name = client.client_name;
	}
	//show_udp_clients()
}

/*	remove_udp_client(rinfo)
*
*	Preferred method to remove a client from udp_clients.
*	As well as simple removal (splice) we also remove ttl timer
*	and send a disconnect_result (or device_disconnect) message.
*/
remove_udp_client = (rinfo, msg_type = "disconnect_result") => {
	// Remove this client from udp_clients
	const index = udp_clients.findIndex(item => item.remote.address === rinfo.address && item.remote.port === rinfo.port);
	if (index < 0 ) {
		// not found
		console.log(`remove_udp_client(): couldn't find ${JSON.stringify(rinfo)} to disconnect`);
		udp_server.send(JSON.stringify({"msg_type":msg_type,"server_id":ServerID, "error":"Unknown client to disconnect"}), rinfo.port, rinfo.address);
	} else {
		console.log(`disconnecting ${udp_clients[index].client_name}`);
		//	First remove ttl timer
		clearTimeout(udp_clients[index].ttl_timer);

		// Remove any devices associated with this client
		//const device_triple = udp_clients[index].device_triple;
		if (udp_clients[index].device_triple) {
			delete xkeys_devices[udp_clients[index].device_triple];
			update_client_device_list("");
		}

		const disconnect_result = {"msg_type":msg_type,"server_id":ServerID};
		disconnect_result["client_address"] = udp_clients[index].remote.address;
		disconnect_result["client_port"] = udp_clients[index].remote.port;
		disconnect_result["client_name"] = udp_clients[index].client_name;
		udp_clients.splice(index, 1);
		// To disconnecting client (all client messages must have a response)
		udp_server.send(JSON.stringify(disconnect_result), rinfo.port, rinfo.address);
		// To remaining clients
		send_udp_message(JSON.stringify(disconnect_result));
	}
}

show_udp_clients = () => {
	for (const client of udp_clients) {
		const client_display = {"client_name":client.client_name, "remote":client.remote, "warnings":client.warnings};
		console.log(`show_udp_clients(): ${JSON.stringify(client_display)}`);
	}
}

