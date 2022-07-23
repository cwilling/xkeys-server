
const {GObject, Gio, GLib } = imports.gi;
const ByteArray = imports.byteArray;

var UdpNet = GObject.registerClass ({
	GTypeName: 'UdpNet',
}, class UdpNet extends GObject.Object {
	_init(address, port, ui) {
		//super._init(params);
		log(`address is ${address}, service port is ${port}, gjs version is ${imports.system.version}`);
		this.service_port = port;
		this.any_port = 0;
		this.server_connections = [];
		this.ui = ui;

		this.socket = new Gio.Socket({
								family:Gio.SocketFamily.IPV4,
								type:Gio.SocketType.DATAGRAM,
								protocol:Gio.SocketProtocol.DEFAULT});
		this.socket.init(null);
		this.socket.broadcast = true;
		this.socket.bind(Gio.InetSocketAddress.new(Gio.InetAddress.new_any(Gio.SocketFamily.IPV4), this.any_port), true);
		this.socket.set_blocking(false);
		this.socket_source = this.socket.create_source(GLib.IOCondition.IN, Gio.Cancellable.new());
		this.socket_source_stream = new Gio.UnixInputStream({fd:this.socket.get_fd(), close_fd:false});
		this.socket_source.set_callback( () => {
			try {
				let rinfo = {};
				// PEEK for source address & port
				let remote_host = this.socket.receive_message([], Gio.SocketMsgFlags.PEEK, null);
				//log(`remote_host addr = ${remote_host[1].address.to_string()}`);
				//log(`remote_host port = ${remote_host[1].port}`);
				rinfo["port"] = remote_host[1].port;
				rinfo["address"] = remote_host[1].address.to_string();

				// Now read the data
				const bytes = this.socket_source_stream.read_bytes(8192, null).toArray();
				const decoder = new TextDecoder();
				let message = decoder.decode(bytes);
				//log(`Received: ${message} length ${message.length}`);

				const msg = JSON.parse(message);
				//log(`Received msg_type: ${msg.msg_type}`);
				switch (msg.msg_type) {
					case "discover_result":
						//	Do we connect to any server that offers? Yes.
						this.discover_result_connect(msg, rinfo);
						break;
					case "connect_result":
					case "device_connect_result":
						this.connect_server_confirmed(msg, rinfo);
						break;
					case "disconnect_warning":
						/*	Server hasn't heard from us for a while so
						*	send anything to confirm we're still alive.
						*/
						this.send_discover_message();
						break;
					case "list_attached_result":
						//this.list_attached_provided(msg, rinfo)
						break;
					case "device_disconnect":
						//this.ui._device_list_button.clicked();
						break;
					case "disconnect_result":
						/*	Some other client has been disconnected
						*	Nothing to do
						*/
						//	In case it was a device client disconnect,
						//  Simulate click of the device_list_button to obtain device list
						//this.ui._device_list_button.clicked();
						break;
					case "attach_event":
					case "detach_event":
						//this.ui._device_list_button.clicked();
						break;
					case "button_event":
					case "jog_event":
					case "shuttle_event":
					case "rotary_event":
					case "tbar_event":
						//this.device_events(message, rinfo);
						break;
					case "joystick_event":
						this.ui.set_joystate(msg);
						break
					case "error":
						if (msg.error_msg.startsWith('Client not connected')) {
							console.log("TRY connecting first!");
							this.send_discover_message();
							console.log("TRIED discover first!");
						}
						break;
					default:
						log(`Unknown msg_type: ${msg.msg_type}`);
						break;
				}

				// Here we return GLib.SOURCE_CONTINUE to wait for more available data
				return GLib.SOURCE_CONTINUE;
			} catch (err) {
				log(`XXXXX ${err}`);
				return GLib.SOURCE_REMOVE;
			}
		});
		// Add the source to the default context where it will be executed
		this.socket_source.attach(null);

	}

	send_discover_message () {
		//log(`send_discover_message()`);
		var discover_msg = {"msg_type":"discover"};
		try {
			const discover_message = JSON.stringify(discover_msg);	// Just checking message is legal JSON
			this.socket.set_broadcast(true);
			const encoder = new TextEncoder();
			this.socket.send_to(Gio.InetSocketAddress.new(Gio.InetAddress.new_from_string('255.255.255.255'), this.service_port),
								encoder.encode(discover_message), null);
			this.socket.set_broadcast(false);
		}
		catch (err) {
			log(`XXX send_udp_message XXX: ${err}`);
		}

		const encoder = new TextEncoder();
	}

	send_udp_message (message, rinfo) {
		log(`Sending: ${message}`);
		try {
			const msg = JSON.parse(message);	// Just checking message is legal JSON
			const encoder = new TextEncoder();
			this.socket.send_to(Gio.InetSocketAddress.new(Gio.InetAddress.new_from_string(rinfo.address), rinfo.port),
							encoder.encode(message), null);

		}
		catch (err) {
			log(`XXX send_udp_message XXX: ${err}`);
		}
	}

	/*	discover_result_connect()
	*
	*	On receiving a result to a discovery message,
	*	decide whether to connect to the discover_result msg e.g.
	*	 {"msg_type":"discover_result","server_id":"XKS_pi4b","xk_server_address":"192.168.8.31","attached_devices":["1029-7-0","1062-6-0"],"version":"0.9.1"}
	*	
	*	- are we already connected to this server?
	*	- is the server version OK?
	*	- are we (not) interested in the attached devices?
	*
	*	In fact, there's no decision logic; we just ask to connect.
	*/
	discover_result_connect (msg, rinfo, myname) {
		//log(`discover_result_connect(): ${JSON.stringify(msg)} from ${JSON.stringify(rinfo)}`);
		let connect_msg;
		if( myname ) {
			connect_msg = {"msg_type":"connect", "client_name":myname};
		} else {
			connect_msg = {"msg_type":"connect"};
		}
		let connect_message;
		try {
			connect_message = JSON.stringify(connect_msg);
		}
		catch (err) {
			log(`${err}`);
		}
		this.send_udp_message(connect_message, rinfo);
	}

	/*	confirm_server()
	*
	*	If our earlier connect request was accepted, add the server to our list of connected servers.
	*/
	connect_server_confirmed (msg, rinfo) {
		log(`connect_server_confirmed(): ${JSON.stringify(msg)}`);
		const index = this.server_connections.findIndex(item => item.address === rinfo.address && item.port === rinfo.port);
		if (index < 0) {	// Not yet connected to this server
			log(`Now connected to ${msg.server_id} at ${rinfo.address}:${rinfo.port}`);
			this.server_connections.push(rinfo);
		} else {
			log(`Already connected to ${msg.server_id}`);
		}

		/*
		*	A connection confirmation from a server contains a list of attached devices
		*	but only as device quads i.e. without details such as name, etc.
		*	Therefore we have to request that full device information.
		*/
		const request_msg = {"msg_type":"list_attached"};
		try {
			JSON.stringify(rinfo);	// Just checking
			this.send_udp_message(JSON.stringify(request_msg), rinfo);
		}
		catch (err) {
			log(`at connect_server_confirmed(): ${err}`);
		}

		/*
		*	Shouldn't need to do this would query all servers rather than just the server just we connected to.
		*/
		//	Simulate click of the device_list_button to obtain device list from the new server connection
		//this.ui._device_list_button.clicked();
	}

	/*	refresh_device_lists
	*
	*	Request a list of attached devices from all known xkeys_servers
	*/
	refresh_device_lists () {
		const request_msg = {"msg_type":"list_attached"};
		this.server_connections.forEach( (item) => {
			const rinfo = {"address":item.address, "port":item.port};
			try {
				JSON.stringify(rinfo);	// Just checking
				this.send_udp_message(JSON.stringify(request_msg), rinfo);
			}
			catch (err) {
				log(`${err}`);
			}
		});
	}

	/*	list_attached_provided()
	*
	*	Process a list of attached devices
	*/
	list_attached_provided(msg, rinfo) {
		// Check args are OK
		try {
			//log(`list_attached_provided(): ${JSON.stringify(msg)} from ${JSON.stringify(rinfo)}`);
			JSON.stringify(msg);
			JSON.stringify(rinfo);
		}
		catch (err) {
			log(`list_attached_provided() - problem checking args: ${err}`);
		}

		const index = this.server_connections.findIndex(item => item.address === rinfo.address && item.port === rinfo.port);
		if (index < 0) {	// Not yet connected to this server
			log(`Not connected to ${msg.server_id} at ${rinfo.address}:${rinfo.port}`);
			// What to do in this case?
		} else {
			// Add devicelist to server information
			this.server_connections[index]["server_id"] = msg.server_id;
			this.server_connections[index]["devices"] = msg.devices;
		}

		//	Update the ui
		this.ui.attached_devices(msg.server_id, msg.devices);
	}

	/*	label_format()
	*
	*	Compute the space needed for each of three text entries
	*	needed for listboxrow label. We inspect all devices
	*	name, server_id & device-triple and allocate space for
	*	longest in each category.
	*/
	label_format(server, devices) {
		let [name, sid, triple] = [28,20,10];	// Start with generous spacing
		// Check values for devices passed into here
		devices.forEach( (device) => {
			const aa = device.name.length;
			const tt = device.temp_id.length;
			if (aa > name) { name = aa; }
			if (tt > triple) { triple = tt; }
		});
		if (server.length > sid) { sid = server.length; }

		//	Now check values for devices already known
		//	(but not involving the server passed into here)
		this.server_connections.forEach( (item) => {
			if (item.server_id != server) {
				item.devices.forEach( (device) => {
					const aa = device.name.length;
					const tt = device.temp_id.length;
					if (aa > name) { name = aa; }
					if (tt > triple) { triple = tt; }
				});
				if (item.server_id.length > sid) { sid = item.server.length; }
			}
		});

		return [name, sid, triple];
	}

	/*	find_device_data()
	*
	*	Return the device data associated with
	*	the passed triple & server_id
	*/
	find_device_data(triple, server_id) {
		let ret;
		this.server_connections.forEach( (server) => {
			//log(`DDDDDDDDD ${JSON.stringify(server)}, ${server_id}`);
			if (server.server_id == server_id) {
				server.devices.forEach( (device) => {
					if (device.temp_id == triple) {
						ret = device;
					}
				});
			}
		});
		return(ret);
	}

	/*	device_events(msg, rinfo)
	*
	*	Process events received from devices.
	*	Typically, just display the event in device_data panel
	*/
	device_events(msg, rinfo) {
		//log(`device_events(): ${msg}`);
		try {
			// Check they're OK before forwarding to ui
			JSON.stringify(msg);
			JSON.stringify(rinfo);
			this.ui.device_event(msg, rinfo);
		}
		catch (err) {
			log(err);
			return;
		}
	}

}
);

