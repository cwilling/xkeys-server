#!/usr/bin/env node

/*
Copyright (c) 2022  Christoph Willing, Brisbane Australia
SPDX-License-Identifier: MIT
*/

const mqtt = require('../node_modules/mqtt')

var onoff = true;

if (process.argv.length != 3) {
	console.log(process.argv[1] + " requires a single on or off argument");
	process.exit(1);
}

if (process.argv[2] == "on") {
	onoff = true;
}
else if (process.argv[2] == "off") {
	onoff = false;
}
else {
	console.log(process.argv[1] + " requires a single on or off argument");
	process.exit(2);
}
console.log("Turning LED " + process.argv[2]);

const connectUrl = 'mqtt://localhost';
const qos = 0;

var client = mqtt.connect(connectUrl);
client.on('error', (error) => {
	console.log('Connection failed:', error)
})
client.on('connect', () => {
	console.log('connected')
	/* Construct the request object to publish */
	request_object = {};
	request_object["request"] = "method";
	request_object["pid_list"] = [];
	request_object["uid"] = "";
	request_object["name"] = "setIndicatorLED";
	request_object["params"] = [[2], onoff, false];

	client.publish('/xkeys/node', JSON.stringify(request_object));
	setTimeout(doExit, 500);
})
client.on('close', () => {
	console.log("connection closed");
})

function doExit() {
	process.exit(0);
}
