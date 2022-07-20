#!/usr/bin/env node

var HID = require('node-hid');

/*	For >4 device entries */
process.env.UV_THREADPOOL_SIZE = 24;

const VENDORID = 1523;

var count = 0;
HID.devices().forEach( (deviceInfo) => {
	if (deviceInfo.vendorId == VENDORID && deviceInfo.usagePage == 12 && deviceInfo.usage == 1) {
		count += 1;
		console.log(`Found device entry ${count}`);
		console.log(`${JSON.stringify(deviceInfo, null, 2)}`);
		console.log();
		var device = new HID.HID( deviceInfo.path );
		device.on("data", function(data) {
			console.log(`received: ${JSON.stringify(data)}`);
		});
	}
});

