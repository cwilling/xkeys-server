# xkeys-server API & Examples

The _xkeys_server_ is a NodeJS application. Clients interact with it by passing JSON encoded request and response messages using either UDP or MQTT. This means clients may be written in any chosen language that supports JSON encoding & decoding.

However the UDP and MQTT transport message formats are not immediately interchangeable. Communication of messages by UDP requires a message format published in the _Dynamic Control Data_ (_DCD_) protocol. An example of a client application using _DCD_ protocol is [devicefinder-gjs](https://gitlab.com/chris.willing/devicefinder-gjs/) 

Communication by MQTT is quite different to the UDP method and is further detailed below. As well as providing some simple client applications in varying languages to demonstrate the utility of this arrangement, the server API itself is explained here to assist developers make use of the _xkeys-server_.


## MQTT API

The first task for a client is to connect to the MQTT broker to which the
*xkeys-server* is connected and subscribe to the appropriate topic(s). For
simplicity, the examples below assume that the broker, xkeys-server and client are
all on the same machine although in practice they may all be on different machines.

The *xkeys-server* will subscribe to the **/xkeys/node/#** topic and publish on the
**/xkeys/server** topic. Therefore a client should initially subscribe to the
**xkeys/server/#** topic (to receive messages from the server) and publish to the
**/xkeys/node/** topic (on which the server is listening for requests).

Note that since the *xkeys-server* has subscribed to **/xkeys/node/#**, there is
potential for greater topic depth in a client's messages. Similarly, if a client has
subscribed to **/xkeys/server/#**, is is possible (probably likely), that messages
published by the server will have a greater topic depth than just **/xkeys/server**.

Client messages should be stringified JSON objects containing a "request" field naming
a well known request, followed by any parameters that may be needed to process the
request.
```
{request: requestName, parameter0: val0, parameter1: val1, ..., parameterN: valN}
```
Well known requestNames are:
- productList
- deviceList
- method

The *productList* and *deviceList* requests require no additional parameters.
Therefore a client's request message for a product list would be simply:
```
{"request":"productList"}
```

The *method* request is a request to perform a named method on the object
representing a particular physical device. It will therefore have a varying
number of parameters, always including sufficient to uniquely identify the
target device (pid_list & uid).
```
{request:"method", pid_list:[e0,e1,...,eN], uid:UID, name:METHODNAME, params:[p0,p1,...,pN]}
```
where p1 is itself an array [k0,k1,k2,...kN] (dependent on the method name).

Method names currently supported by the *xkeys-server* are:
- **setIndicatorLED** where p0 (params[0]) is an array of leds to target i.e. [1], [2] or [1,2]. Additionally, p1 (params[1]) is a boolean denoting whether the indicator should turn on or off, while the optional p2 (params[2]) is a boolean which denotes whether the nominated LED(s) should flash or not.
- **writeLcdDisplay** where p0 is an array of text strings to display e.g. ["top line text","bottom line text"]
- **setFlashRate** where p0 is an empty unused array and p1 contains the requested flash rate as a string value
- **setUnitID** where p0 is empty and p1 is the new Unit ID for the device 
- **setBacklight** where p0 is an array of buttonid numbers to activate, p1 is a hue value, p2 sets flashing on or off.
- **setAllBacklights** where p0 is empty and p1 is a hue value
- **setBacklightIntensity** where p0 is an array of intensity values i.e. [blue_intensity, red_intensity]
- **saveBackLights** requires no parameters
- **writeData** where p0 is the command code to write e.g. [0, 206, 0, 1, 72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 32, 32, 32, 32, 32]

Client requests for particular methods are performed immediately but not otherwise responded to by the *xkeys-server*.

In response to client requests *productList* & *deviceList*, the server publishes to the **/xkeys/server** topic, messages of the form:
```
{"request":"result_productList", "data":PRODUCTS}
```
and
```
{"request":"result_deviceList", "data":device_list}
```



Some server messages are published without requests from clients, in particular when events from connected devices are detected. Events from devices are published by the *xkeys-server* to topics according to the type of event, namely **/xkeys/server/EVENT_TYPE/PID/UID/index**. For instance pressing button 7 of an XK12JOG device (PID of 1062) with a Unit ID of 3 would result in the event being published on topic **/xkeys/server/button_event/1062/3/7**. The meaning of *index* in the topic varies according to *EVENT_TYPE*. In the case of a *button_event*, index refers to the button that was pressed. While a client may be able to decipher an event largely by just the topic on which the event message is received, there is usually additional information about the event in the message itself e.g. was it the *down* or *up* part of the button press.

The EVENT_TYPEs published by the *xkeys-server* are:
```
button_event
jog_event
shuttle_event
joystick_event
tbar_event
```



## Examples

### Python
Python examples use Python3 and require a python3 based MQTT client which can be installed in Debian/Ubuntu/Raspberry Pi OS systems with:
```
sudo apt install python3-paho-mqtt
```

- [_device_list.py_](device_list.py) is a command line Python application which demonstrates how to connect to the MQTT server and publish a request for a list of connected X-keys devices which is then displayed.
- [_events.py_](events.py) is another command line application but which displays device events as they occur. For each event, the first line displayed will show the topic used by the server to publish to, further lines show additional detail about the event.
- [_ledonoff.py_](ledonoff.py) is a command line application to turn the second (red) LED of any connected device on or off. To turn the LED(s) on, run `./ledonoff.py on` and run `./ledonoff.py off` to turn them off.


### C
The C language examples are only slightly modified [mosquitto example code](https://github.com/eclipse/mosquitto/blob/master/examples/) from the mosquitto development repository. They assume the installation of the _mosquitto_ MQTT library header files; some may also need _json-c_ library header files. Some platforms provide these by default; others may require additional installation. To install them on Debian, Ubuntu or Raspberry Pi OS based systems, run:
```
sudo apt install libmosquitto-dev
sudo apt install libjson-c-dev
``` 
- [_device_list.c_](device_list.c) is a C source program which requests a list of attached devices and prints out the result twice. Firstly as a raw string, secondly prettified. Compile the executable with:
```
gcc -I/usr/include/json-c -o device_list device_list.c -lmosquitto -ljson-c
```
and run the result with: `./device_list`
- [_events.c_](events.c) is a C source program which, when compiled displays device events from any attached device as they occur. In this _api_ directory, compile with:
```
gcc -o events events.c -lmosquitto
```
and then run the resulting `./events` executable to watch for device events.
- [_ledonoff.c_](ledonoff.c) is a command line application to turn the second (red) LED of any connected device on or off. Compile with:
```
gcc -I/usr/include/json-c -o ledonoff ledonoff.c -lmosquitto -ljson-c
```
and then run the result with: `./ledonoff on` to turn LED(s) on, or run: `./ledonoff off` to turn them off.

A more complete C based application, [_devicefinder-gtk_ is available here](https://gitlab.com/chris.willing/devicefinder-gtk). It uses the GTK user interface library along with the more closely aligned _json-glib_ (rather than _json-c_) for JSON handling.


### NodeJS/Javascript
Of course, NodeJS/Javascript clients are also possible. However there is no preference for them just because the _xkeys-server_ is a NodeJS application. No extra efficiency or affinity accrues to them since all communication with the server is conducted using JSON encoded messages. The examples here use modules already available in the higher level _xkeys-server/node_modules_ directory.
- [_device_list.js_](device_list.js) is a command line Javascript/NodeJS application which demonstrates how to connect to the MQTT server and publish a request for a list of connected X-keys devices which is then displayed. In the _api_ directory, run `./device_list.js`
- [_events.js_](events.js) is another Javascript/NodeJS command line application. It displays events from any connected device as they occur.
- [_ledonoff.js_](ledonoff.js) is a command line application to turn the second (red) LED of any connected device on or off. To turn the LED(s) on, run `./ledonoff.js on` and run `./ledonoff.js off` to turn them off.
