/*	elgato-plugin.js
*
*	SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
*	SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>
* 
*	A plugin to add Elgato Streamdeck devices functionality to xkeys-server.
*/

const usbDetect = require('usb-detection');
const { listStreamDecks, openStreamDeck } = require('@elgato-stream-deck/node');
const { DEVICE_MODELS, VENDOR_ID } = require('@elgato-stream-deck/core');
const streamDecks = {};

/*	These are global functions from xkeys-server
	- add_xkeys_device()
	- update_client_device_list()
	- send_udp_message()
*/

/*	These are set by whoever calls us with start() */
let elgato_devices;
let ServerID;
let mqtt_client;

async function addDevice(info) {
	const start_time = Date.now();
	const path = info.path;
	streamDecks[path] = openStreamDeck(path);
	if (arguments.length == 2) {
		ServerID = arguments[1];
		console.log(`ServerID set to: ${ServerID}`);
	}


	const firmwareVersion =  await streamDecks[path].getFirmwareVersion()
	const serial_number = info.serialNumber;

	/*	Find the correct device (match serialNumber),
	*	then derive a product id from device's vendorId & productId.
	*	Use derived product id to generate a uniqueId.
	*	Insert these and other expected values as device info.
	*	Advertise device attachment.
	*/
	usbDetect.find(VENDOR_ID.toString(), function(err, devices) {
		devices.forEach( (device) => {
			if (serial_number == device.serialNumber) {
				const product_id = parseInt(device.vendorId + device.productId.toString().padStart(4,0));
				const unit_id = 0;
				const panel = streamDecks[path];
				panel["uniqueId"] = product_id + "_" + unit_id;
				const device_info = {};
				device_info["name"] = panel.device.PRODUCT_NAME;
				device_info["product_id"] = product_id;
				device_info["interface"] = 0;
				device_info["unit_id"] = unit_id;
				device_info["firmwareVersion"] = firmwareVersion;
				device_info["colCount"] = panel.device.KEY_COLUMNS;
				device_info["rowCount"] = panel.device.KEY_ROWS;
				device_info["emitsTimestamp"] = true;
				device_info["serial_number"] = serial_number;
				panel["info.orig"] = info;
				panel["info"] = device_info;

				console.log(`Streamdeck panel ${panel["uniqueId"]} discovered`);
				add_xkeys_device(panel);

				var attach_msg = {"msg_type":"attach_event", "server_id":ServerID, "device":panel.info.name,};
				attach_msg["product_id"] = panel.info.product_id;
				attach_msg["unit_id"] = panel.info.unit_id;
				attach_msg["duplicate_id"] = panel.duplicate_id;
				attach_msg["attached_devices"] = Object.keys(elgato_devices);
				send_udp_message(JSON.stringify(attach_msg));
			}
		});
	})

	//	Clear all keys
	await streamDecks[path].clearPanel()

	//	Fill one key in red
	await streamDecks[path].fillKeyColor(0, 255, 0, 0)

	await streamDecks[path].resetToLogo()

	/*	Device removal */
	streamDecks[path].on('error', (e) => {
		console.log(`Device at ${path} was removed (${e})`)
		// assuming any error means we lost connection
		streamDecks[path].removeAllListeners()

		var temp_id = streamDecks[path].uniqueId.replace(/_/g, "-") + "-" + streamDecks[path].duplicate_id;
		console.log(`X-keys panel ${temp_id} disconnected`)
		delete elgato_devices[temp_id];

		update_client_device_list("");
		var detach_msg = {"msg_type":"detach_event", "server_id":ServerID, "device":streamDecks[path].info.name,};
		detach_msg["product_id"] = streamDecks[path].info.product_id;
		detach_msg["unit_id"] = streamDecks[path].info.unit_id;
		detach_msg["duplicate_id"] = streamDecks[path].duplicate_id;
		detach_msg["attached_devices"] = Object.keys(elgato_devices);
		send_udp_message(JSON.stringify(detach_msg));

		delete streamDecks[path]
	})

	/*	Event listeners (buttons, tbar, joystick, etc.) go here
	*	Only button events for Elgato Streamdecks.
	*	value = 1 for down, 0 for up
	*/
	streamDecks[path].on('down', (keyIndex) => {
		//console.log(`${keyIndex}, ${streamDecks[path].KEY_ROWS}, ${streamDecks[path].KEY_COLUMNS} DOWN`);
		const metadata = {};
		metadata["timestamp"] = Date.now() - start_time;
		const panel = streamDecks[path];
		const rowcol = calcRowCol(keyIndex, panel.KEY_ROWS, panel.KEY_COLUMNS);
		var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":panel.info.name,
						"product_id":panel.info.product_id,"unit_id":panel.info.unit_id,"duplicate_id":panel.duplicate_id,
						"control_id":0, "row":rowcol[0],"col":rowcol[1], "value":1, "timestamp":metadata.timestamp};
		send_udp_message(JSON.stringify(msg_udp));

		/*	For NodeRED */
		metadata["type"] = "down";
		metadata["shortnam"] = panel.info.name.replace(/\s+/, ''); 
		const msg_topic = '/xkeys/server/button_event/' + panel.info.product_id + '/' + panel.info.unit_id + '/' + panel.duplicate_id + '/' + keyIndex;
		const msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
		//mqtt_client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});
		mqtt_client.publish(msg_topic, JSON.stringify(msg_pload));

	});
	streamDecks[path].on('up', (keyIndex) => {
		//console.log(`${keyIndex}, ${streamDecks[path].KEY_ROWS}, ${streamDecks[path].KEY_COLUMNS} UP`);
		const metadata = {};
		metadata["timestamp"] = Date.now() - start_time;
		const panel = streamDecks[path];
		const rowcol = calcRowCol(keyIndex, panel.KEY_ROWS, panel.KEY_COLUMNS);
		var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":panel.info.name,
						"product_id":panel.info.product_id,"unit_id":panel.info.unit_id,"duplicate_id":panel.duplicate_id,
						"control_id":0, "row":rowcol[0],"col":rowcol[1], "value":0, "timestamp":metadata.timestamp};
		send_udp_message(JSON.stringify(msg_udp));

		/*	NodeRED */
		metadata["type"] = "up";
		metadata["shortnam"] = panel.info.name.replace(/\s+/, ''); 
		const msg_topic = '/xkeys/server/button_event/' + panel.info.product_id + '/' + panel.info.unit_id + '/' + panel.duplicate_id + '/' + keyIndex;
		const msg_pload = {"server_id":ServerID,"request":"device_event", "data":metadata};
		//mqtt_client.publish(msg_topic, JSON.stringify(msg_pload), {qos:qos,retain:false});
		mqtt_client.publish(msg_topic, JSON.stringify(msg_pload));

	});
}

function refresh() {
	const streamdecks = listStreamDecks()
	streamdecks.forEach((device) => {
		if (!streamDecks[device.path]) {
			if (arguments.length == 0) {
				addDevice(device).catch((e) => console.error('Add failed:', e))
			} else {
				addDevice(device, arguments[0]).catch((e) => console.error('Add failed:', e))
			}
		}
	});
}

usbDetect.on('add:'+VENDOR_ID.toString(), function () {
	refresh();
})
usbDetect.on('remove:'+VENDOR_ID.toString(), function (device) {
	console.log(`${JSON.stringify(device)} was removed`)
	refresh();
})

calcRowCol = (keyIndex, rows, cols) => {
	var row, col;
	dance:
	for (row=0;row<rows;row++) {
		for (col=0;col<cols;col++) {
			if ((row*cols + col) >= keyIndex) {
				break dance;
			}
		}
	}
	return [row,col];
}

module.exports = {
	start (xkeys_devices, ServerID, client) {
		elgato_devices = xkeys_devices;
		mqtt_client = client;
		refresh(ServerID);
		usbDetect.startMonitoring();
	},
	stop () {
		usbDetect.stopMonitoring();
		Object.values(streamDecks).forEach( (device) => {
			device.removeAllListeners();
		})
	},
	products (products) {
		/*	Add Streamdeck products in a format matching Xkeys products */
		//console.log(`DEVICE_MODELS = ${JSON.stringify(DEVICE_MODELS)}`);
		DEVICE_MODELS.forEach( (model) => {
			const product_id = parseInt(VENDOR_ID.toString() + model.productId.toString().padStart(4,0));
			products["SD"+model.id.toUpperCase()] = {"name":"Streamdeck " + model.id.toUpperCase(), "hidDevices":[[product_id,0]]};
		});
		console.log(`VENDOR_ID is ${typeof VENDOR_ID}`);
	}
}

