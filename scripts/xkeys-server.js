#!/usr/bin/env node

//var { env } = require('process');
process.env.UV_THREADPOOL_SIZE = 32;

var mqtt = require('mqtt')
const qos = 2;
var path = require('path')
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
	'/xkeys/SRC/PID/UID/MSG'
where:
	SRC = source of msg - probably: server|node
	PID = X-keys product id
	UID = X-keys unit id (or devicePath if UID == 0)
	MSG = message data

Server will listen to:
	/xkeys/node/#

Nodes could listen to (filtering appropriately):
	/xkeys/server/#
or:
	xkeys/#

*/

/*
console.log("Products: " + JSON.stringify(PRODUCTS));
for (const product of Object.values(PRODUCTS)) {
	//console.log("Product: " + JSON.stringify(product));
	//console.log("Product: " + product.name);
}
*/

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
    client.publish('/xkeys/server', JSON.stringify({"request":"hello","data":"Hello from Xkeys device server"}),{qos:qos,retain:false});
    client.subscribe({'/xkeys/node/#':{qos:qos}}, function (err) {
    	if (!err) {
      	    console.log('subscribed OK');
    	} else {
			// Any point in going on?
			console.log('Subscription failed: ' + err);
			process.exit(1);
		}
    })

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
				console.log(`X-keys panel ${xkeysPanel.uniqueId} disconnected`)
				delete xkeys_devices[xkeysPanel.uniqueId];
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
					client.publish('/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex, JSON.stringify({"request":"device_event", "data":metadata}),{qos:qos,retain:false});
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
						client.publish('/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex, JSON.stringify({"request":"device_event", "data":metadata}),{qos:qos,retain:false});

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
					client.publish('/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
						client.publish('/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
					client.publish('/xkeys/server/jog_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
						client.publish('/xkeys/server/jog_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
					client.publish('/xkeys/server/shuttle_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
						client.publish('/xkeys/server/shuttle_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
					client.publish('/xkeys/server/joystick_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
						client.publish('/xkeys/server/joystick_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
					client.publish('/xkeys/server/tbar_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
						client.publish('/xkeys/server/tbar_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}), {qos:qos,retain:false});
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
		if ( xkeysPanel.uniqueId in xkeys_devices ) {
			// Duplicate; use devicePath instead of uniqueId
	  		xkeys_devices[path.basename(xkeysPanel.devicePath)] = {"owner": "", "device": xkeysPanel};
		} else {
	  		xkeys_devices[xkeysPanel.uniqueId] = {"owner": "", "device": xkeysPanel};
			console.log("(add_xkeys_device) Added device " + xkeysPanel.uniqueId);
		}
		console.log("(add_xkeys_device) xkeys_devices = " + JSON.stringify(Object.keys(xkeys_devices)));
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

/*
	Each message should be a stringified json object
	containing a "request" field, optionally followed
	by any parameters required for the request.
	{request: requestName, param1: param, param2: param, etc.}
*/
client.on('message', (topic, message) => {
    //console.log('received message：', topic, message.toString())

    var msg = ""
    try {
	msg = JSON.parse(message)
        if (msg.request == "hello") {
		    console.log("HELLO request from: " + topic)

        } else if (msg.request == "productList") {
			// A list of all known products
   			client.publish('/xkeys/server', JSON.stringify({"request":"result_productList", "data":PRODUCTS}), {qos:qos,retain:false});

        } else if (msg.request == "deviceList") {
		    //console.log("deviceList request from: " + topic)
			// Generate a fresh dict of info objects keyed by uniqueId
			update_client_device_list(topic);


        } else if (msg.request == "method") {
			/*	Expect msg = {request:"method", pid_list:[e1,e2,...,eN], uid:UID, name:METHODNAME, params:[p1,p2,...,pn]}
			*	where p1 = [l1,l2,...,lN] (dependent on method name)
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
					/*	For each device matching pid_list & uid, call the named method with given params.
					*	param p1 (msg.params[0]) is an array of led# to target, typically 1, 2, or 1 & 2.
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
					// Determine what text to write to each line
					for (var i=0;i<msg.params[0].length;i++) {
						xkeys_devices[device].device.writeLcdDisplay(i+1, msg.params[0][i], msg.params[1]);
					}

				} else if (msg.name == "setFlashRate") {
					// params[0] is an array of flashRates (only one!) 
					if (isNaN(parseInt(msg.params[0][0]))) { return; }
					xkeys_devices[device].device.setFrequency(parseInt(msg.params[0][0]));

				} else if (msg.name == "setUnitID") {
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
					if (isNaN(parseInt(msg.params[0][0]))) { return; }
					if (isNaN(parseInt(msg.params[0][1]))) { return; }

					xkeys_devices[device].device.setBacklightIntensity(parseInt(msg.params[0][0]), parseInt(msg.params[0][1]));

				} else if (msg.name == "saveBackLights") {
					console.log("Running: saveBackLights() for " + xkeys_devices[device].device.product.name);
					xkeys_devices[device].device.saveBackLights();

				} else {
					console.log("Unsupported library method: " + msg.name);
				}
			});
        } else {
            console.log(`Unknown message request: ${msg.request} from ${topic}`)
        }
    }
    catch (e) {
		console.log("Couldn't parse message: ${message.toString()} from ${topic}")
		console.log(e)
		return;
    }



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
   		client.publish(topic.replace("node","server"), JSON.stringify({"request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
	} else {
		//console.log("Publish result_deviceList");
   		client.publish('/xkeys/server', JSON.stringify({"request":"result_deviceList", "data":device_list}), {qos:qos,retain:false});
	}
}

