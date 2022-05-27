/*	elgato-plugin.js
*
*	SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
*	SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>
* 
*	A plugin to add Elgato devices functionality to xkeys-server.
*/

const usbDetect = require('usb-detection');
const { listStreamDecks, openStreamDeck } = require('@elgato-stream-deck/node');
const streamDecks = {};
const vid = 4057;	// Elgato vendor id

let elgato_devices;
let add_elgato_device;
let update_client_device_list;
let ServerID;

async function addDevice(info) {
	const start_time = Date.now();
	const path = info.path;
	streamDecks[path] = openStreamDeck(path);

	const firmwareVersion =  await streamDecks[path].getFirmwareVersion()
	const serial_number = info.serialNumber;

	/*      Derive a product id from device's vendorId & productId.
	*       Use it generate a uniqueId
	*/
	usbDetect.find(vid, function(err, devices) {
		devices.forEach( (device) => {
			if (serial_number == device.serialNumber) {
				const product_id = parseInt(device.vendorId + device.productId.toString().padStart(4,0));
				const unit_id = 0;
				streamDecks[path]["uniqueId"] = product_id + "_" + unit_id;
				var device_info = {};
				device_info["name"] = streamDecks[path].device.PRODUCT_NAME;
				device_info["product_id"] = product_id;
				device_info["interface"] = 0;
				device_info["unit_id"] = unit_id;
				device_info["firmwareVersion"] = firmwareVersion;
				device_info["colCount"] = streamDecks[path].device.KEY_COLUMNS;
				device_info["rowCount"] = streamDecks[path].device.KEY_ROWS;
				device_info["serial_number"] = serial_number;
				streamDecks[path]["info.orig"] = info;
				streamDecks[path]["info"] = device_info;

				console.log(`Streamdeck panel ${streamDecks[path]["uniqueId"]} discovered`);
				add_elgato_device(streamDecks[path]);

				var attach_msg = {"msg_type":"attach_event", "server_id":ServerID, "device":streamDecks[path].info.name,};
				attach_msg["product_id"] = streamDecks[path].info.product_id;
				attach_msg["unit_id"] = streamDecks[path].info.unit_id;
				attach_msg["duplicate_id"] = streamDecks[path].duplicate_id;
				attach_msg["attached_devices"] = Object.keys(elgato_devices);
				send_udp_message(JSON.stringify(attach_msg));
			}
		});
	})

	// Clear all keys
	await streamDecks[path].clearPanel()

	// Fill one key in red
	await streamDecks[path].fillKeyColor(0, 255, 0, 0)

	await streamDecks[path].resetToLogo()

	streamDecks[path].on('error', (e) => {
		console.log(`Device at ${path} was removed (${e})`)
		// assuming any error means we lost connection
		streamDecks[path].removeAllListeners()
		//delete streamDecks[path]

		console.log(`remove: ${streamDecks[path].uniqueId}-${streamDecks[path].duplicate_id}`);
		var temp_id = streamDecks[path].uniqueId.replace(/_/g, "-") + "-" + streamDecks[path].duplicate_id;
		console.log(`X-keys panel ${temp_id} disconnected`)
		delete elgato_devices[temp_id];
		//update_client_device_list("");
		var detach_msg = {"msg_type":"detach_event", "server_id":ServerID, "device":streamDecks[path].info.name,};
		detach_msg["product_id"] = streamDecks[path].info.unit_id;
		detach_msg["unit_id"] = streamDecks[path].info.unit_id;
		detach_msg["duplicate_id"] = streamDecks[path].duplicate_id;
		detach_msg["attached_devices"] = Object.keys(elgato_devices);
		send_udp_message(JSON.stringify(detach_msg));
	})

	//  Event listeners (buttons, tbar, joystick, etc.) go here
	//	Button value = 1 for down, 0 for up
	streamDecks[path].on('down', (keyIndex) => {
		//console.log(`${keyIndex}, ${streamDecks[path].KEY_ROWS}, ${streamDecks[path].KEY_COLUMNS} DOWN`);
		const rowcol = calcRowCol(keyIndex, streamDecks[path].KEY_ROWS, streamDecks[path].KEY_COLUMNS);
		var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":streamDecks[path].info.name,
						"product_id":streamDecks[path].info.product_id,"unit_id":streamDecks[path].info.unit_id,"duplicate_id":streamDecks[path].duplicate_id,
						"control_id":0, "row":rowcol[0],"col":rowcol[1], "value":1, "timestamp":Date.now()-start_time};
		send_udp_message(JSON.stringify(msg_udp));
	});
	streamDecks[path].on('up', (keyIndex) => {
		//console.log(`${keyIndex}, ${streamDecks[path].KEY_ROWS}, ${streamDecks[path].KEY_COLUMNS} UP`);
		const rowcol = calcRowCol(keyIndex, streamDecks[path].KEY_ROWS, streamDecks[path].KEY_COLUMNS);
		var msg_udp = {"msg_type":"button_event", "server_id":ServerID, "device":streamDecks[path].info.name,
						"product_id":streamDecks[path].info.product_id,"unit_id":streamDecks[path].info.unit_id,"duplicate_id":streamDecks[path].duplicate_id,
						"control_id":0, "row":rowcol[0],"col":rowcol[1], "value":0, "timestamp":Date.now()-start_time};
		send_udp_message(JSON.stringify(msg_udp));
	});
}

function refresh() {
	const streamdecks = listStreamDecks()
	streamdecks.forEach((device) => {
		if (!streamDecks[device.path]) {
			addDevice(device).catch((e) => console.error('Add failed:', e))
		}
	});
}

usbDetect.on('add:4057', function () {
	refresh();
})
usbDetect.on('remove:4057', function (device) {
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

	hello (message) {
		console.log(`Hello: ${message}`);
	},

	start (xkeys_devices, add_xkeys_device, update_client_device_list, ServerID) {
		elgato_devices = xkeys_devices;
		add_elgato_device = add_xkeys_device;
		update_client_device_list = update_client_device_list;
		ServerID = ServerID;
		refresh();
		usbDetect.startMonitoring();
	},
	stop () {
		usbDetect.stopMonitoring();
		Object.values(streamDecks).forEach( (device) => {
			device.removeAllListeners();
		})
	}
}
