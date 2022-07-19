#!/usr/bin/env node

var HID = require('node-hid');

/*	For >4 device entries */
process.env.UV_THREADPOOL_SIZE = 24;

const VENDORID = 1523;

HID.devices().forEach( (deviceInfo) => {
	if (deviceInfo.vendorId == VENDORID && deviceInfo.usagePage == 12 && deviceInfo.usage == 1) {
		console.log(`Found ${JSON.stringify(deviceInfo, null, 2)}`);
		var device = new HID.HID( deviceInfo.path );
		device.on("data", function(data) {
			console.log(`received: ${JSON.stringify(data)}`);
		});
	}
});

