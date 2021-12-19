#!/usr/bin/env python3

"""
Copyright (c) 2021  Christoph Willing, Brisbane Australia
SPDX-License-Identifier: MIT
"""

import sys, os
import paho.mqtt.client as mqtt
import json
from threading import Timer


def main():

	# True => on, False => off
	onoff = True

	if len(sys.argv) != 2:
		print("Need an on or off argument")
		sys.exit(1)

	if sys.argv[1] == "on":
		onoff = True
	elif sys.argv[1] == "off":
		onoff = False
	else:
		print("Need an on or off argument")
		sys.exit(2)
	print("Turning LED " + sys.argv[1])


	def on_connect(client, userdata, flags, rc):
		print("Connected with result code "+str(rc))
		# Construct the request object to publish
		request_object = {}
		request_object["request"] = "method"
		request_object["pid_list"] = []
		request_object["uid"] = ""
		request_object["name"] = "setIndicatorLED"
		request_object["params"] = [[2], onoff, False]

		client.publish('/xkeys/node', json.dumps(request_object))
		print("request published")
		t = Timer(0.5, lambda:client.disconnect())
		t.start()

	client = mqtt.Client()
	client.on_connect = on_connect

	client.connect("localhost", 1883, 60)

	client.loop_forever()


if __name__ == '__main__':
    main()

