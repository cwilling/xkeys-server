#!/usr/bin/env gjs

// SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
// SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>

imports.searchPath.push(".");
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
const {GLib, GObject, Gdk, Gio, Gtk } = imports.gi;

Gtk.init(null);

const { JoystickClientDevice } = imports.joystick_client_device;
let joystickClientDevice = new JoystickClientDevice();

var UdpNet = imports.udpnet;
let udpnet = new UdpNet.UdpNet('0.0.0.0', 48895, joystickClientDevice);

/*	Give ui access to udpnet methods
*	(to send events)
*/
joystickClientDevice.set_udp_instance(udpnet);

const css_file = Gio.File.new_for_path('joystick_client_device.css');
var provider = Gtk.CssProvider.new();
if (!provider.load_from_file(css_file)) {
	log(`Couldn't load CSS file`);
}
Gtk.StyleContext.add_provider_for_screen( Gdk.Screen.get_default(),
					provider, Gtk.GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);


/*	A device client connects to just a single xkeys-server.
*	If no particular server is nominated at startup,
*	choose the first server shich responds to a discovery message.
*/
let target_serverId;
if (ARGV.length > 0) {
   log(`Targeted server is ${ARGV[0]}`);
   target_serverId = ARGV[0];
} else {
	log(`Any server will do`);
}
udpnet.send_discover_message();
udpnet.choose_server(target_serverId);

joystickClientDevice.present();
Gtk.main();

