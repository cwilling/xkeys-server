# xkeys-server API & Examples

The *xkeys_server* is a nodejs application. Clients interact with it
via the MQTT protocol, passing JSON encoded request and response messages. This
means clients may be written in any chosen language that supports MQTT and JSON.

As well as providing some simple client applications in varying languages to
demonstrate the utility of this arrangement, the server API itself is explained
here to assist developers make use of the *xkeys-server*.


## API

The first task for a client is to connect to the MQTT broker to which the
*xkeys-server* is connected and subscribe to the appropriate topic(s). For
simplicity, the examples below assume that the broker, xkeys-server and client are
all on the same machine although in practice they may all be on different machines.

The *xkeys-server* will subscribe to the **/xkeys/node/#** topic and publish on the
**/xkeys/server** topic. Therefore a client should subscribe to the **xkeys/server/#**
topic (to receive messages from the server) and publish to the **/xkeys/node/** topic
(on which the server is listening for requests).

Note that since the *xkeys-server* has subscribed to **/xkeys/node/#**, there is
potential for greater topic depth in a client's messages. Similarly, if a client has
subscribed to **/xkeys/server/#**, is is possible (probably likely), that messages
published by the server will have a greater topic depth than just **/xkeys/server**.

Client messages should be stringified JSON objects containing a "request" field naming
a well known request, followed by any parameters that may be needed to process the
request.
```
{request: requestName, param1: param, param2: param, ...}
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
{request:"method", pid_list:[e1,e2,...,eN], uid:UID, name:METHODNAME, params:[p1,p2,...,pN]}
```
where p1 is itself an array [k1,k2,k3,...kN] (dependent on the method name).

Method names currently supported by the *xkeys-server* are:
- **setIndicatorLED** where p1 (params[0]) is an array of leds to target i.e. [1], [2] or [1,2]
- **writeLcdDisplay** where p1 is an array of text strings to display e.g. ["top line text","bottom line text"]
- **setFlashRate** where p1 is an array (of length 1) containing the requested flash rate e.g. [27]
- **setUnitID** where p1 is empty and p2 (params[1]) is the new Unit ID for the device 
- **setBacklight** where p1 is an array of buttonid numbers to activate, p2 is a hue value, p3 sets flashing on or off.
- **setAllBacklights** where p1 is unused and p2 is a hue value
- **setBacklightIntensity** where p1 is an array of intensity values i.e. [blue_intensity, red_intensity]
- **saveBackLights** requires no parameters
- **writeData** where p1 is the command code to write e.g. [0, 206, 0, 1, 72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 32, 32, 32, 32, 32]





## Examples

*device_list.py* is a command line Python application which demonstrates how to connect to the MQTT server and publish a request for a list of connected X-keys devices.

