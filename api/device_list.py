#!/usr/bin/env python3

"""
Copyright (c) 2021  Christoph Willing, Brisbane Australia
SPDX-License-Identifier: MIT
"""

import sys, os
import paho.mqtt.client as mqtt
import json


def main():

	def on_connect(client, userdata, flags, rc):
		print("Connected with result code "+str(rc))
		client.subscribe("/xkeys/server/#")

	def on_subscribe(client, userdata, mid, granted_qos):
		client.publish('/xkeys/node', '{"request":"deviceList"}')

	def on_message(client, userdata, msg):
		print(json.dumps(json.loads(msg.payload), indent=2))
		sys.exit(0)

	client = mqtt.Client()
	client.on_connect = on_connect
	client.on_message = on_message
	client.on_subscribe = on_subscribe

	client.connect("localhost", 1883, 60)

	client.loop_forever()


if __name__ == '__main__':
    main()

