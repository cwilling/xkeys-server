#!/usr/bin/env node

const ServerVersion = require('../package.json').version;

//var { env } = require('process');
process.env.UV_THREADPOOL_SIZE = 48;

const { hostname, networkInterfaces } = require('os');
const ServerID = hostname();
console.log("ServerID = " + ServerID);

const dgram = require('dgram');
const udp_server = dgram.createSocket('udp4');
const udp_host = '0.0.0.0';
const udp_port = 48895;
const udp_clients = [];
const udp_expiry = 20000;

const crypto = require('crypto');

var mqtt = require('mqtt');
const qos = 2;
var path = require('path');
const { XKeysWatcher } = require('xkeys');
const XKeys = require('xkeys');
const { PRODUCTS } = require('@xkeys-lib/core/dist/products');

/* An XKeysWatcher */
let watcher;

/* Local record of discovered devices keyed by UniqueId */
let xkeys_devices = {};

/* Reverse lookup of PRODUCTS keys (short name ids), indexed by hidDevice number */
let xkeys_products = {};
Object.entries(PRODUCTS).forEach(entry => {
	const [key, value] = entry;
	value.hidDevices.forEach(hidDev => {
		xkeys_products[hidDev[0]] = key;
	});

});

/*
Proposed Topic heirarchy:
	'/xkeys/SRC/PID/UID/index'
where:
	SRC = source of msg - probably: server|node
	PID = X-keys product id
	UID = X-keys unit id (or devicePath if UID == 0)
	index = device dependent index value
			e.g. button id

Server will listen to:
	/xkeys/node/#

Nodes could listen to (filtering appropriately):
	/xkeys/server/#
or:
	/xkeys/#
or, more specifically:
	/xkeys/server/pid/uid
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

	if (msg_transport == "udp") {
		rinfo = moreArgs[0];
	} else if (msg_transport == "mqtt") {
		topic = moreArgs[0];
	}

	/* Does the message comply? */
    var msg = ""
    try {
		msg = JSON.parse(message);
		/*	Accommodate new message structure */
		let msg_type;
		if (msg.hasOwnProperty('msg_type')) {
			msg_type = 'msg_type'; 
		} else {
			msg_type = 'request'; 
		}
		console.log(`${msg_transport} message request: ${msg[msg_type]}`);

		switch (msg[msg_type]) {
			case "discover":
				/*	Since we exist on 0.0.0.0 i.e. every available interface,
				*	and therefore have possibly multiple IP addresses,
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
				console.log(`${JSON.stringify(nif_addrs)}`);

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
					discover_result = {};
					discover_result["msg_type"] = "discover_result";
					discover_result["sid"] = ServerID;
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
				if (msg_transport == "udp") {
					console.log("request_message_process(): UDP msg.request was connect");
					var udp_client_found = false;
					for (var i=udp_clients.length;i>0;i--) {
						udp_client_found = false;
						if ((udp_clients[i-1].remote.address == rinfo.address) && (udp_clients[i-1].remote.port == rinfo.port)) {
							udp_client_found = true;
							break;
						}
					}
					if (!udp_client_found) {
						// New client
						udp_clients.push({"timestamp":Date.now(), "remote":rinfo});
						try {
							connect_result = {};
							connect_result["msg_type"] = "connect_result";
							connect_result["sid"] = ServerID;
							connect_result["client_address"] = rinfo.address;
							connect_result["client_port"] = rinfo.port;
							if (msg.hasOwnProperty("client_name")) {
								connect_result["client_name"] = msg.client_name;
							} else {
								// For now, generate a random name
								connect_result["client_name"] = crypto.randomBytes(8).toString('hex');
							}
							connect_result["attached_devices"] = Object.keys(xkeys_devices);
							connect_result["version"] = ServerVersion;

							//udp_server.send(JSON.stringify(connect_result), rinfo.port, rinfo.address);
							send_udp_message(JSON.stringify(connect_result));

						} catch (err) {
							console.log("send_udp_message() error: " + err);
						}
						console.log(`New client at ${rinfo.address}:${rinfo.port}`);
					}
					/* Otherwise do nothing since we already have this client registered */

				} else if (msg_transport == "mqtt") {
					console.log("request_message_process(): MQTT msg.request was EOI");
					/*	EOI isn't really part of MQTT establishment.
					*	Should we dignify it with a response?
					*/
					client.publish('/xkeys/server', JSON.stringify({"sid":ServerID, "request":"result_EOI", "data":"OK"}), {qos:qos,retain:false});

				} else {
					console.log("request_message_process(): UNKNOWN TYPE msg.request was EOI");
				}
				break;
			case "deviceList":
				/*	Generate latest device list */
				var device_list = {};
				for (const key of Object.keys(xkeys_devices) ) {
					device_list[key] = xkeys_devices[key].device.info;
				}

				if (msg_transport == "udp") {
					udp_server.send(JSON.stringify({"sid":ServerID,"msg_type":"result_deviceList","data":device_list}), rinfo.port, rinfo.address);
				} else if (msg_transport == "mqtt") {
					client.publish('/xkeys/server', JSON.stringify({"sid":ServerID, "request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
				}
				break;
			case "productList":
				if (msg_transport == "udp") {
					udp_server.send(JSON.stringify({"sid":ServerID,"msg_type":"result_productList","data":PRODUCTS}), rinfo.port, rinfo.address);
				} else if (msg_transport == "mqtt") {
					client.publish('/xkeys/server', JSON.stringify({"sid":ServerID, "request":"result_productList", "data":PRODUCTS}), {qos:qos,retain:false});
				}
				break;
			case "method":
				/*
				*	Expect msg = {request:"method", pid_list:[e0,e1,...,eN], uid:UID, name:METHODNAME, params:[p0,p1,...,pN]}
				*	where p0 = [k1,k2,...,kN] (dependent on method name)
				*/
				console.log("method request: " + message);
				var devices = [];
				Object.keys(xkeys_devices).forEach(function (item) {
					//console.log("xkeys_devices item:" + item);
					/*
					*	pid_list == [] means target any attached device.
					*/
					if (msg.pid_list.length == 0) {
						var regex;
						if (msg.uid) {
							//console.log("uid check: " + msg.uid);
							regex = new RegExp("_" + msg.uid);
							if (item.search(regex) > -1) {
								//console.log("Found usable device: " + item);
								devices.push(item);
							}
						} else {
							// No UID specified. Anything goes!
							devices.push(item);
						}
					} else {
						msg.pid_list.forEach(function (ep) {
							//console.log("Checking endpoint: " + ep);
							var regex;
							if (msg.uid) {
								//console.log("uid check: " + msg.uid);
								regex = new RegExp(ep + "_" + msg.uid);
								if (item.search(regex) > -1) {
									//console.log("Found usable device: " + item);
									devices.push(item);
								}
							} else {
								//console.log("uid check: (none)");
								regex = new RegExp(ep + "_");
								if (item.search(regex) > -1) {
									//console.log("Found usable device: " + item);
									devices.push(item);
								}
							}
						})
					}
				});
				devices.forEach( function (device) {
					if (msg.name == "setIndicatorLED") {
						//console.log("setIndicatorLED(): ");
						/*
						*	For each device matching pid_list & uid, call the named method with given params.
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

					} else if (msg.name == "writeLcdDisplay") {
						/*
						*	Parameter p0 (msg.params[0]) is an array of strings (one entry for each line) for the device to display.
						*/
						// Determine what text to write to each line
						for (var i=0;i<msg.params[0].length;i++) {
							xkeys_devices[device].device.writeLcdDisplay(i+1, msg.params[0][i], msg.params[1]);
						}

					} else if (msg.name == "setFlashRate") {
						/*
							Flash rate is provided as parameter params[1]
							(empty p0 is unused)
						*/
						if (isNaN(parseInt(msg.params[1]))) { return; }
						xkeys_devices[device].device.setFrequency(parseInt(msg.params[1]));

					} else if (msg.name == "setUnitID") {
						/*
						*	The new UnitID provided as parameter params[1]
							(empty p0 is unused)
						*/
						//console.log("About to run: setUnitId(" + parseInt(msg.params[1]) + ")");
						xkeys_devices[device].device.setUnitId(parseInt(msg.params[1]));

						// Reboot this "new" device so that it is noticed by the system
						xkeys_devices[device].device.rebootDevice();

						// Remove the _old_ device from our local record
						const regex = /_.*/;
						var old_id = xkeys_devices[device].device.uniqueId.replace(regex, "_"+msg.uid);
						if (Object.keys(xkeys_devices).includes(old_id)) {
							//console.log("deleting: " + old_id);
							delete xkeys_devices[old_id];
						}

					} else if (msg.name == "setBacklight") {
						/*
						*	For backlights, msg.params[0] is an array of buttonids to activate
						*	                msg.params[1] is the hue to set
						*	                msg.params[2] is true/false (flashing mode or not)
						*/
						/*
						// Does this device have a backlight?
						if (xkeys_devices[device].device.product.backLightType == 0 ) {
							console.log("no backlight for " + xkeys_devices[device].device.product.name);
							return;
						}
						*/

						msg.params[0].forEach( (key) => {
							// key must represent a valid number
							var buttonid = parseInt(key);
							if (isNaN(buttonid)) { return; }

							//console.log("Running: setBacklight(" + buttonid + "," + msg.params[1] + "," + msg.params[2] + ")");
							xkeys_devices[device].device.setBacklight(buttonid, msg.params[1], msg.params[2]);
						});

					} else if (msg.name == "setAllBacklights") {
						//console.log("Running: setAllBacklights(" + msg.params[1] + ")");
						xkeys_devices[device].device.setAllBacklights(msg.params[1]);

					} else if (msg.name == "setBacklightIntensity") {
						/*
						*	params[0] is an array of intensity values (blue, red) 
						*/
						//console.log("Running: setBacklightIntensity(" + msg.params[0] + ") for " + xkeys_devices[device].device.product.name);

						xkeys_devices[device].device.setBacklightIntensity(msg.params[0][0], msg.params[0][1]);

					} else if (msg.name == "saveBackLights") {
						//console.log("Running: saveBackLights() for " + xkeys_devices[device].device.product.name);
						xkeys_devices[device].device.saveBackLights();

					} else if (msg.name == "writeData") {
						//console.log("Running: writeData(" + JSON.stringify(msg.params[0]) + ") for " + xkeys_devices[device].device.product.name);
						xkeys_devices[device].device.writeData(msg.params[0]);

					} else {
						console.log("Unsupported library method: " + msg.name);
					}
				});

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
    console.log('reconnecting:', error)
})

client.on('error', (error) => {
    console.log('Connection failed:', error)
})

client.on('connect', () => {
    console.log('connected');
    startWatcher();
    client.publish('/xkeys/server', JSON.stringify({"sid":ServerID, "request":"hello","data":"Hello from Xkeys device server"}),{qos:qos,retain:false});
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

    function startWatcher () {
		watcher = new XKeysWatcher({
			usePolling: false,
			pollingInterval: 500, // optional, default is 1000 ms
		});
		watcher.on('connected', (xkeysPanel) => {
	   		console.log(`X-keys panel ${xkeysPanel.uniqueId} connected`);
	   		//xkeys_devices[xkeysPanel.uniqueId] = {"owner": "", "device": xkeysPanel};
			add_xkeys_device(xkeysPanel);

			update_client_device_list("");

			xkeysPanel.on('disconnected', () => {
				var full_id = xkeysPanel.uniqueId.replace(/_/g, "-") + "-" + xkeysPanel.order;
				console.log(`X-keys panel ${full_id} disconnected`)
				delete xkeys_devices[full_id];
				update_client_device_list("");
			})
			/*
				RPIs version < 4 don't handle rebootDevice(), leaving xkeys_devices in an inconsistent state.
				Therefore we always check the source of the following events and add_unknown_xkeys_device() if necessary.
			*/
			xkeysPanel.on('down', (btnIndex, metadata) => {
				//console.log(`X-keys panel ${xkeysPanel.info.name} down`)
				if (Object.keys(xkeys_devices).includes(xkeysPanel.uniqueId)) {
					var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
					var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
					//console.log("DOWN event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
					metadata["type"] = "down";
					metadata["shortnam"] = xkeys_products[pid.toString()];
					var msg_topic = '/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex;
					var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the new format
					// value = 1 for down, 0 for up
					var msg_udp = {"sid":ServerID,"msg_type":"button_event","device":xkeys_products[pid.toString()],
									"pid":pid,"uid":uid,"index":btnIndex,"row":metadata.row,"col":metadata.col,
									"value":1,"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				} else {
					add_unknown_xkeys_device(xkeysPanel)
					.then(data => {
						console.log("XXXXX " + data);
						update_client_device_list("");
						console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

						var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
						var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
						//console.log("DOWN event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
						metadata["type"] = "down";
						metadata["shortnam"] = xkeys_products[pid.toString()];
						var msg_topic = '/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex;
						var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
						client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

						// This is the new format
						// value = 1 for down, 0 for up
						var msg_udp = {"sid":ServerID,"msg_type":"button_event","device":xkeys_products[pid.toString()],
										"pid":pid,"uid":uid,"index":btnIndex,"row":metadata.row,"col":metadata.col,
										"value":1,"timestamp":metadata.timestamp};
						send_udp_message(JSON.stringify(msg_udp));
					})
				}
			})
			xkeysPanel.on('up', (btnIndex, metadata) => {
				//console.log(`X-keys panel ${xkeysPanel.info.name} up`)
				if (Object.keys(xkeys_devices).includes(xkeysPanel.uniqueId)) {
					var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
					var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
					//console.log("UP event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
					metadata["type"] = "up";
					metadata["shortnam"] = xkeys_products[pid.toString()];
					var msg_topic = '/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex;
					var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the new format
					// value = 1 for down, 0 for up
					var msg_udp = {"sid":ServerID,"msg_type":"button_event","device":xkeys_products[pid.toString()],
									"pid":pid,"uid":uid,"index":btnIndex,"row":metadata.row,"col":metadata.col,
									"value":0,"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				} else {
					add_unknown_xkeys_device(xkeysPanel)
					.then(data => {
						console.log("XXXXX " + data);
						update_client_device_list("");
						console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

						var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
						var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
						//console.log("UP event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
						metadata["type"] = "up";
						metadata["shortnam"] = xkeys_products[pid.toString()];
						var msg_topic = '/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex;
						var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
						client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

						// This is the new format
						// value = 1 for down, 0 for up
						var msg_udp = {"sid":ServerID,"msg_type":"button_event","device":xkeys_products[pid.toString()],
										"pid":pid,"uid":uid,"index":btnIndex,"row":metadata.row,"col":metadata.col,
										"value":0,"timestamp":metadata.timestamp};
						send_udp_message(JSON.stringify(msg_udp));
					})
				}
			})
			xkeysPanel.on('jog', (index, deltaPos, metadata) => {
				//console.log(`X-keys panel ${xkeysPanel.info.name} jog (${index}), delta ${deltaPos}`)
				if (Object.keys(xkeys_devices).includes(xkeysPanel.uniqueId)) {
					var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
					var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
					//console.log("JOG event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
					metadata["type"] = "jog";
					metadata["deltaPos"] = deltaPos;
					metadata["shortnam"] = xkeys_products[pid.toString()];
					var msg_topic = '/xkeys/server/jog_event/' + pid + '/' + uid + '/' + index;
					var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the new format
					var msg_udp = {"sid":ServerID,"msg_type":"jog_event","device":xkeys_products[pid.toString()],
									"pid":pid,"uid":uid,"index":index,"value":deltaPos,"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				} else {
					add_unknown_xkeys_device(xkeysPanel)
					.then(data => {
						console.log("XXXXX " + data);
						update_client_device_list("");
						console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

						var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
						var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
						//console.log("JOG event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
						metadata["type"] = "jog";
						metadata["deltaPos"] = deltaPos;
						metadata["shortnam"] = xkeys_products[pid.toString()];
						var msg_topic = '/xkeys/server/jog_event/' + pid + '/' + uid + '/' + index;
						var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
						client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

						// This is the new format
						var msg_udp = {"sid":ServerID,"msg_type":"jog_event","device":xkeys_products[pid.toString()],
										"pid":pid,"uid":uid,"index":index,"value":deltaPos,"timestamp":metadata.timestamp};
						send_udp_message(JSON.stringify(msg_udp));
					})
				}
			})
			xkeysPanel.on('shuttle', (index, shuttlePos, metadata) => {
				//console.log(`X-keys panel ${xkeysPanel.info.name} jog (${index})`)
				if (Object.keys(xkeys_devices).includes(xkeysPanel.uniqueId)) {
					var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
					var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
					//console.log("SHUTTLE event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
					metadata["type"] = "shuttle";
					metadata["shuttlePos"] = shuttlePos;
					metadata["shortnam"] = xkeys_products[pid.toString()];
					var msg_topic = '/xkeys/server/shuttle_event/' + pid + '/' + uid + '/' + index;
					var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the new format
					var msg_udp = {"sid":ServerID,"msg_type":"shuttle_event","device":xkeys_products[pid.toString()],
									"pid":pid,"uid":uid,"index":index,"value":shuttlePos,"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				} else {
					add_unknown_xkeys_device(xkeysPanel)
					.then(data => {
						console.log("XXXXX " + data);
						update_client_device_list("");
						console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

						var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
						var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
						//console.log("SHUTTLE event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
						metadata["type"] = "shuttle";
						metadata["shuttlePos"] = shuttlePos;
						metadata["shortnam"] = xkeys_products[pid.toString()];
						var msg_topic = '/xkeys/server/shuttle_event/' + pid + '/' + uid + '/' + index;
						var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
						client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

						// This is the new format
						var msg_udp = {"sid":ServerID,"msg_type":"shuttle_event","device":xkeys_products[pid.toString()],
										"pid":pid,"uid":uid,"index":index,"value":shuttlePos,"timestamp":metadata.timestamp};
						send_udp_message(JSON.stringify(msg_udp));
					})
				}
			})
			xkeysPanel.on('joystick', (index, position, metadata) => {
				//console.log(`X-keys panel ${xkeysPanel.info.name} joystick (${index})`)
				if (Object.keys(xkeys_devices).includes(xkeysPanel.uniqueId)) {
					var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
					var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
					//console.log("JOYSTICK event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
					metadata["type"] = "joystick";
					metadata["position"] = position;
					metadata["shortnam"] = xkeys_products[pid.toString()];
					var msg_topic = '/xkeys/server/joystick_event/' + pid + '/' + uid + '/' + index;
					var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the new format
					var msg_udp = {"sid":ServerID,"msg_type":"joystick_event","device":xkeys_products[pid.toString()],
									"pid":pid,"uid":uid,"index":index,
									"x":position.x,"y":position.y,"z":position.z,"deltaZ":position.deltaZ,"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				} else {
					add_unknown_xkeys_device(xkeysPanel)
					.then(data => {
						console.log("XXXXX " + data);
						update_client_device_list("");
						console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

						var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
						var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
						//console.log("JOYSTICK event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
						metadata["type"] = "joystick";
						metadata["position"] = position;
						metadata["shortnam"] = xkeys_products[pid.toString()];
						var msg_topic = '/xkeys/server/joystick_event/' + pid + '/' + uid + '/' + index;
						var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
						client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

						// This is the new format
						var msg_udp = {"sid":ServerID,"msg_type":"joystick_event","device":xkeys_products[pid.toString()],
										"pid":pid,"uid":uid,"index":index,
										"x":position.x,"y":position.y,"z":position.z,"deltaZ":position.deltaZ,"timestamp":metadata.timestamp};
						send_udp_message(JSON.stringify(msg_udp));
					})
				}
			})
			xkeysPanel.on('tbar', (index, position, metadata) => {
				//console.log(`X-keys panel ${xkeysPanel.info.name} tbar (${index})`)
				if (Object.keys(xkeys_devices).includes(xkeysPanel.uniqueId)) {
					var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
					var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
					//console.log("TBAR event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
					metadata["type"] = "tbar";
					metadata["position"] = position;
					metadata["shortnam"] = xkeys_products[pid.toString()];
					var msg_topic = '/xkeys/server/tbar_event/' + pid + '/' + uid + '/' + index;
					var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
					client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

					// This is the new format
					var msg_udp = {"sid":ServerID,"msg_type":"tbar_event","device":xkeys_products[pid.toString()],
									"pid":pid,"uid":uid,"index":index, "value":position,"timestamp":metadata.timestamp};
					send_udp_message(JSON.stringify(msg_udp));
				} else {
					add_unknown_xkeys_device(xkeysPanel)
					.then(data => {
						console.log("XXXXX " + data);
						update_client_device_list("");
						console.log("updated: " + JSON.stringify(Object.keys(xkeys_devices)));

						var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
						var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
						//console.log("TBAR event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
						metadata["type"] = "tbar";
						metadata["position"] = position;
						metadata["shortnam"] = xkeys_products[pid.toString()];
						var msg_topic = '/xkeys/server/tbar_event/' + pid + '/' + uid + '/' + index;
						var msg_pload = {"sid":ServerID,"request":"device_event", "data":metadata};
						client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});

						// This is the new format
						var msg_udp = {"sid":ServerID,"msg_type":"tbar_event","device":xkeys_products[pid.toString()],
										"pid":pid,"uid":uid,"index":index, "value":position,"timestamp":metadata.timestamp};
						send_udp_message(JSON.stringify(msg_udp));
					})
				}
			})
		})
	}

	// Return the key used in PRODUCTS for the device with given uniqueId
	function product_code(uniqueId) {
	}

	/*
		Add a newly discovered device to xkeys_devices object.
		Main concern is duplicate uniqueId
		(probably same devices with UID still == 0)
	*/
    function add_xkeys_device (xkeysPanel) {
		var order = 0;
		var temp_id_base = xkeysPanel.uniqueId.replace(/_/g, "-");
		while ((temp_id_base + '-' + order) in xkeys_devices) {
			order += 1;
		}
		xkeysPanel["order"] = order;
		var temp_id = temp_id_base + "-" + xkeysPanel.order;
		console.log(`New device entry: ${temp_id}`);
		xkeys_devices[temp_id] = {"owner": "", "device": xkeysPanel};

		console.log(`After add_xkeys_device(): xkeys_devices = ${JSON.stringify(Object.keys(xkeys_devices))}`);
	}

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
    }

})

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
function update_client_device_list (topic) {

	var device_list = {};
	for (const key of Object.keys(xkeys_devices) ) {
		//console.log("Found ", xkeys_devices[key].info.name, " at ", key);
		device_list[key] = xkeys_devices[key].device.info;
	}
	//console.log("update_client_device_list(): " + JSON.stringify(device_list));
	if (topic.length > 0) {
		//console.log("Publish result_deviceList to:" + topic.replace("node","server"));
   		client.publish(topic.replace("node","server"), JSON.stringify({"sid":ServerID, "request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
		send_udp_message(JSON.stringify({"topic":topic.replace("node","server"),"sid":ServerID, "request":"result_deviceList", "data":device_list}));
	} else {
		//console.log("Publish result_deviceList");
   		client.publish('/xkeys/server', JSON.stringify({"sid":ServerID, "request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
		send_udp_message(JSON.stringify({"topic":"/xkeys/server","sid":ServerID, "request":"result_deviceList", "data":device_list}));
	}
}

sendHeartbeat = (client) => {
	//console.log("heartbeat");
  	client.publish('/xkeys/server', JSON.stringify({"sid":ServerID, "request":"heartbeat"}), {qos:qos,retain:false});
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
*	send the message to all known clients
*/
function send_udp_message (msg) {
	//console.log("send_udp_message(), clients = " + udp_clients.length);
	//console.log("send_udp_message(), mesg = " + msg);
	for (var i=udp_clients.length;i>0;i--) {
		var rinfo = udp_clients[i-1].remote;
		try {
			udp_server.send(msg, rinfo.port, rinfo.address);
		} catch (err) {
			console.log("send_udp_message() error: " + err);
		}
		//console.log("Sent msg to: " + rinfo.address + ":" + rinfo.port);
	}
}

function check_udp_clients() {
	//console.log("check_udp_clients(), clients# = " + udp_clients.length);
	for (var i=udp_clients.length;i>0;i--) {
		console.log(JSON.stringify(udp_clients[i-1]) + " " + i);
	}
}
//setInterval(check_udp_clients, 4000);

