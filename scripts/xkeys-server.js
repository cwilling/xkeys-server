#!/usr/bin/env node

var mqtt = require('mqtt')
var path = require('path')
const { XKeys, XKeysWatcher } = require('xkeys');
const { PRODUCTS } = require('@xkeys-lib/core/dist/products');

const flashRate_default = 20;
var flashRate = flashRate_default;

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
    client.publish('/xkeys/server', JSON.stringify({"request":"hello","data":"Hello from Xkeys device server"}));
    client.subscribe('/xkeys/node/#', function (err) {
    	if (!err) {
      	    console.log('subscribed OK')
    	} else {
	    // Any point in going on?
      	    console.log('Subscription failed: ' + err)
	    process.exit(1)
	}
    })

    function startWatcher () {
		watcher = new XKeysWatcher();
		watcher.on('connected', (xkeysPanel) => {
	   		console.log(`X-keys panel ${xkeysPanel.uniqueId} connected`);
	   		//xkeys_devices[xkeysPanel.uniqueId] = {"owner": "", "device": xkeysPanel};
			add_xkeys_device(xkeysPanel);

			update_client_device_list();

			xkeysPanel.on('disconnected', () => {
				console.log(`X-keys panel of type ${xkeysPanel.info.name} disconnected`)
				delete xkeys_devices[xkeysPanel.uniqueId];
				update_client_device_list();
			})
			xkeysPanel.on('down', (btnIndex, metadata) => {
				//console.log(`X-keys panel of type ${xkeysPanel.info.name} down`)
				var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
				var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
				//console.log("DOWN event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
				metadata["type"] = "down";
				metadata["shortnam"] = xkeys_products[pid.toString()];
				client.publish('/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex, JSON.stringify({"request":"device_event", "data":metadata}));
			})
			xkeysPanel.on('up', (btnIndex, metadata) => {
				//console.log(`X-keys panel of type ${xkeysPanel.info.name} up`)
				var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
				var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
				//console.log("UP event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
				metadata["type"] = "up";
				metadata["shortnam"] = xkeys_products[pid.toString()];
				client.publish('/xkeys/server/button_event/' + pid + '/' + uid + '/' + btnIndex, JSON.stringify({"request":"device_event", "data":metadata}));
			})
			xkeysPanel.on('jog', (index, deltaPos, metadata) => {
				//console.log(`X-keys panel of type ${xkeysPanel.info.name} jog (${index}), delta ${deltaPos}`)
				var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
				var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
				//console.log("JOG event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
				metadata["type"] = "jog";
				metadata["deltaPos"] = deltaPos;
				metadata["shortnam"] = xkeys_products[pid.toString()];
				client.publish('/xkeys/server/jog_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}));
			})
			xkeysPanel.on('shuttle', (index, shuttlePos, metadata) => {
				//console.log(`X-keys panel of type ${xkeysPanel.info.name} jog (${index})`)
				var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
				var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
				//console.log("SHUTTLE event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
				metadata["type"] = "shuttle";
				metadata["shuttlePos"] = shuttlePos;
				metadata["shortnam"] = xkeys_products[pid.toString()];
				client.publish('/xkeys/server/shuttle_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}));
			})
			xkeysPanel.on('joystick', (index, position, metadata) => {
				//console.log(`X-keys panel of type ${xkeysPanel.info.name} joystick (${index})`)
				var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
				var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
				//console.log("JOYSTICK event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
				metadata["type"] = "joystick";
				metadata["position"] = position;
				metadata["shortnam"] = xkeys_products[pid.toString()];
				client.publish('/xkeys/server/joystick_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}));
			})
			xkeysPanel.on('tbar', (index, position, metadata) => {
				//console.log(`X-keys panel of type ${xkeysPanel.info.name} tbar (${index})`)
				var pid = xkeys_devices[xkeysPanel.uniqueId].device.info.productId;
				var uid = xkeys_devices[xkeysPanel.uniqueId].device.info.unitId;
				//console.log("TBAR event from " + JSON.stringify(xkeys_devices[xkeysPanel.uniqueId].device.info));
				metadata["type"] = "tbar";
				metadata["position"] = position;
				metadata["shortnam"] = xkeys_products[pid.toString()];
				client.publish('/xkeys/server/tbar_event/' + pid + '/' + uid + '/' + index, JSON.stringify({"request":"device_event", "data":metadata}));
			})
		})
	}

	// Return the key used in PRODUCTS for the device with given uniqueId
	function product_code(uniqueId) {
	}

	// Add a newly discovered device to xkeys_devices object.
	// Main concern is duplicate uniqueId
	// (probably same devices with UID still == 0)
    function add_xkeys_device (xkeysPanel) {
		if ( xkeysPanel.uniqueId in xkeys_devices ) {
			// Duplicate; use devicePath instead of uniqueId
	  		xkeys_devices[path.basename(xkeysPanel.devicePath)] = {"owner": "", "device": xkeysPanel};
		} else {
	  		xkeys_devices[xkeysPanel.uniqueId] = {"owner": "", "device": xkeysPanel};
		}
	}
})

/*
	Each message should be a stringified json object
	containing a "request" field, optionally followed
	by any parameters required for the request.
	{request: requestName, param1: param, param2: param, etc.}
*/
client.on('message', (topic, message) => {
    console.log('received message：', topic, message.toString())

    var msg = ""
    try {
	msg = JSON.parse(message)
        if (msg.request == "hello") {
		    console.log("HELLO request from: " + topic)
        } else if (msg.request == "productList") {
			// A list of all known products
   			client.publish('/xkeys/server', JSON.stringify({"request":"result_productList", "data":PRODUCTS}));
        } else if (msg.request == "deviceList") {
			// Generate a fresh dict of info objects keyed by uniqueId
			update_client_device_list();
        } else if (msg.request == "flashRate") {
   			client.publish('/xkeys/server', JSON.stringify({"request":"result_flashRate", "data":flashRate}));
        } else if (msg.request == "setFlashRate") {
			// Expect msg = {request: "setFlashRate", data: VALUE}
			try {
				var value = parseInt(msg.data);
				// Check value in range?
				flashRate = value;
			}
			catch (err) {
				console.log("Bad data for setFlashRate request: " + err);
			}
			// Advertise the new flashRate
   			client.publish('/xkeys/server', JSON.stringify({"request":"result_flashRate", "data":flashRate}));

        } else if (msg.request == "method") {
			// Expect msg = {request:"method", endpoints:[e1,e2,...,eN], uid:UID, name:METHODNAME, params:[p1,p2,...,pn]}
			// where p1 = [l1,l2,...,lN]
			console.log("method request: " + message);
			/*	For each device matching endpoints & uid, call the named method with given params.
			*	param p1 is an array of led# to target, typically 1, 2, or 1 & 2.
			*/
			var devices = [];
			Object.keys(xkeys_devices).forEach(function (item) {
				//console.log("xkeys_devices item:" + item);
				msg.endpoints.forEach(function (ep) {
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
			});
			devices.forEach( function (device) {
				// Determine which led(s) to target
				msg.params[0].forEach( function (ledid) {
					// Is ledid a valid number (1 or 2)
					if (isNaN(parseInt(ledid))) { return; }

					// Run it
					xkeys_devices[device].device.setFrequency(flashRate);
					if ( msg.params.length > 2 ) {
						console.log("Running: setIndicatorLED(" + parseInt(ledid) + "," + msg.params[1] + "," + msg.params[2] + ")");
						xkeys_devices[device].device.setIndicatorLED(parseInt(ledid), msg.params[1], msg.params[2]);
					} else {
						xkeys_devices[device].device.setIndicatorLED(parseInt(ledid), msg.params[1]);
					}
				});
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
function update_client_device_list () {

	var device_list = {};
	for (const key of Object.keys(xkeys_devices) ) {
		//console.log("Found ", xkeys_devices[key].info.name, " at ", key);
		device_list[key] = xkeys_devices[key].device.info;
	}
	//console.log("update_client_device_list(): " + JSON.stringify(device_list));
   	client.publish('/xkeys/server', JSON.stringify({"request":"result_deviceList", "data":device_list}));
}

