#!/usr/bin/env node

/*
Copyright (c) 2022  Christoph Willing, Brisbane Australia
SPDX-License-Identifier: MIT
*/


const mqtt = require('../node_modules/mqtt')


const connectUrl = 'mqtt://localhost';
const qos = 0;

var client = mqtt.connect(connectUrl);
client.on('error', (error) => {
	console.log('Connection failed:', error)
})
client.on('connect', () => {
	console.log('connected')
	client.subscribe({'/xkeys/server/#':{qos:qos}}, function (err, granted) {
		if (!err) {
			console.log("Subscribed OK, granted: " + JSON.stringify(granted));
		} else {
			console.log('Subscription failed: ' + err)
		}
	})
})
client.on('close', () => {
	console.log("connection closed");
})

client.on('message', (topic, message) => {
	var message_obj = "";
	try {
		message_obj = JSON.parse(message);
		console.log(message_obj.data);
	}
	catch (e) {
		console.log('ERROR parsing message: ' + e);
	}
})

