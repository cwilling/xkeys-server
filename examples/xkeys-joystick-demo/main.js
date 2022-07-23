#!/usr/bin/env gjs

// SPDX-License-Identifier: MIT OR LGPL-2.0-or-later
// SPDX-FileCopyrightText: 2022 Christoph Willing <chris.willing@linux.com>

imports.searchPath.push(".");
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
const {GLib, GObject, Gdk, Gio, Gtk } = imports.gi;

Gtk.init(null);

const { XkeysJoystickDemo } = imports.xkeys_joystick_demo;
let xkeysJoystickDemo = new XkeysJoystickDemo();

var UdpNet = imports.udpnet;
let udpnet = new UdpNet.UdpNet('0.0.0.0', 48895, xkeysJoystickDemo);

const css_file = Gio.File.new_for_path('xkeys_joystick_demo.css');
var provider = Gtk.CssProvider.new();
if (!provider.load_from_file(css_file)) {
	log(`Couldn't load CSS file`);
}
Gtk.StyleContext.add_provider_for_screen( Gdk.Screen.get_default(),
					provider, Gtk.GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);


/*	Periodically check for new xkeys-servers
*/
udpnet.send_discover_message();
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
					100, // usually every 10 seconds but 100 for now
					() => { udpnet.send_discover_message(); return GLib.SOURCE_CONTINUE; });

xkeysJoystickDemo.present();
Gtk.main();

