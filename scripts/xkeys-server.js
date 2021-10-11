var mqtt = require('mqtt')
var path = require('path')
const { XKeys, XKeysWatcher } = require('xkeys');
const { PRODUCTS } = require('@xkeys-lib/core/dist/products');

/* An XKeysWatcher */
let watcher;

/*
	Local record of discovered devices keyed by UniqueId
*/
let xkeys_devices = {};

/*
Proposed Topic heirarchy:
	'/xkeys/SRC/PID/UID/MSG'
where:
	SRC = source of msg - probably: server|node
	PID = X-keys product id
	UID = X-keys unit id (or devicePath if UID == 0)
	MSG = message data

Server will listen to:
	/xkeys/node/#

Nodes could listen to (filtering appropriately):
	/xkeys/server/#
or:
	xkeys/#

*/

/*
console.log("Products: " + JSON.stringify(PRODUCTS));
for (const product of Object.values(PRODUCTS)) {
	//console.log("Product: " + JSON.stringify(product));
	//console.log("Product: " + product.name);
}
*/

const connectUrl = 'mqtt://localhost'
var client = mqtt.connect(connectUrl)

client.on('reconnect', (error) => {
    console.log('reconnecting:', error)
})

client.on('error', (error) => {
    console.log('Connection failed:', error)
})

client.on('connect', () => {
    console.log('connected')
    startWatcher();
    client.publish('/xkeys/server', 'Hello from Xkeys device server')
    client.subscribe('/xkeys/node/#', function (err) {
    	if (!err) {
      	    console.log('subscribed OK')
    	} else {
	    // Any point in going on?
      	    console.log('Subscription failed: ' + err)
	    process.exit(1)
	}
    })

    function startWatcher () {
		watcher = new XKeysWatcher();
		watcher.on('connected', (xkeysPanel) => {
	   		console.log(`X-keys panel ${xkeysPanel.uniqueId} connected`);
	   		//xkeys_devices[xkeysPanel.uniqueId] = {"owner": "", "device": xkeysPanel};
			add_xkeys_device(xkeysPanel);

			update_client_device_list();

			xkeysPanel.on('disconnected', () => {
				console.log(`X-keys panel of type ${xkeysPanel.info.name} disconnected`)
				delete xkeys_devices[xkeysPanel.uniqueId];
				update_client_device_list();
			})
		})
	}

	// Add a newly discovered device to xkeys_devices object.
	// Main concern is duplicate uniqueId
	// (probably same devices with UID still == 0)
    function add_xkeys_device (xkeysPanel) {
		if ( xkeysPanel.uniqueId in xkeys_devices ) {
			// Duplicate; use devicePath instead of uniqueId
	  		xkeys_devices[path.basename(xkeysPanel.devicePath)] = {"owner": "", "device": xkeysPanel};
		} else {
	  		xkeys_devices[xkeysPanel.uniqueId] = {"owner": "", "device": xkeysPanel};
		}
	}
})

/*
	Each message should be a stringified json object
	containing a "request" field, optionally followed
	by any parameters required for the request.
	{request: requestName, param1: param, param2: param, etc.}
*/
client.on('message', (topic, message) => {
    console.log('received message：', topic, message.toString())

    var msg = ""
    try {
	msg = JSON.parse(message)
        if (msg.request == "bid") {
		    console.log("BID in progress by bidder: " + msg.bidder)
        } else if (msg.request == "hello") {
		    console.log("HELLO request from: " + topic)
        } else if (msg.request == "productList") {
			// A list of all known products
		    console.log("PRODUCTLIST request from: " + topic)
   			client.publish('/xkeys/server', JSON.stringify({"request":"result_productList", "data":PRODUCTS}));
        } else if (msg.request == "deviceList") {
			// Generate a fresh dict of info objects keyed by uniqueId
		    console.log("DEVICELIST request from: " + topic)
			update_client_device_list();
        } else {
            console.log(`Unknown message request: ${msg.request} from ${topic}`)
        }
    }
    catch (e) {
		console.log("Couldn't parse message: ${message.toString()} from ${topic}")
		console.log(e)
		return;
    }



})

// Send a (possibly unsolicited) device list
function update_client_device_list () {

	var device_list = {};
	for (const key of Object.keys(xkeys_devices) ) {
		//console.log("Found ", xkeys_devices[key].info.name, " at ", key);
		device_list[key] = xkeys_devices[key].device.info;
	}
	console.log("update_client_device_list(): " + JSON.stringify(device_list));
   	client.publish('/xkeys/server', JSON.stringify({"request":"result_deviceList", "data":device_list}));
}

