imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
const {GLib, GObject, Gdk, Gio, Gtk } = imports.gi;

const Cairo = imports.cairo;

const file = Gio.File.new_for_path('joystick_client_device.ui');
const [, template] = file.load_contents(null);

var JoystickClientDevice = GObject.registerClass({
	GTypeName: 'JoystickClientDevice',
	Template: template,
	Children: ['main_box'],
	InternalChildren: [
		'drawing_area'
	]
	
}, class JoystickClientDevice extends Gtk.Window {
	/* implementation */
	_init(params = {}) {
		super._init(params);

		/*	The template has been initialized and you can access the children
		*/
		this.main_box.visible = true;

		/*	Internal children are set on the instance prefixed with a `_`
		*	e.g.
		*		this._drawing_area.visible = true;
		*/

		this._drawing_area.add_events(Gdk.EventMask.BUTTON1_MOTION_MASK|Gdk.EventMask.BUTTON_PRESS_MASK);

		this.joystate = {};
		this.joystate['xpos'] = 0.0;
		this.joystate['ypos'] = 0.0;
		this.joystate['zpos'] = 90.0;

	}

	/*	This is our access to udpnet instance
	*/
	set_udp_instance(udpnet) {
		this.udpnet = udpnet;
	}

	/*	Redraw the graphic */
	redraw() {
		var width = this._drawing_area.get_allocated_width();
		var height = this._drawing_area.get_allocated_height();
		log('width:' + width)
		log('height:' + height);
		log('joystate = ' + JSON.stringify(this.joystate));

		this.queue_draw();
	}

	/*	The signal handlers bound in the UI file
	*/

	on_drawing_area_button_press_event(widget) {
		var position= widget.get_pointer();
		var width = widget.get_allocated_width();
		var height = widget.get_allocated_height();
		//var result = (x-min)/(max - min);
		this.joystate['xpos'] = (position[0] - width/2)/(width/2);
		this.joystate['ypos'] = -((position[1] - height/2)/(height/2));
		this.queue_draw();

		var data_msg = {"msg_type":"device_data", "event_type":"joystick_event", "control_id":0, "x":this.joystate.xpos, "y":this.joystate.ypos, "z":0.0,"deltaZ":0.0, "timestamp":Number.parseInt(GLib.get_monotonic_time()/1000) };
		this.udpnet.send_client_udp_message(JSON.stringify(data_msg));
	}
	on_drawing_area_motion_notify_event(widget) {
		var position= widget.get_pointer();
		var width = widget.get_allocated_width();
		var height = widget.get_allocated_height();
		//log('motion: ' + JSON.stringify(position));
		if (position[0] < 0) position[0] = 0; if (position[0] > width) position[0] = width;
		if (position[1] < 0) position[1] = 0; if (position[1] > height) position[1] = height;
		this.joystate['xpos'] = (position[0] - width/2)/(width/2);
		this.joystate['ypos'] = -((position[1] - height/2)/(height/2));
		this.queue_draw();

		var data_msg = {"msg_type":"device_data", "event_type":"joystick_event", "control_id":0, "x":this.joystate.xpos, "y":this.joystate.ypos, "z":0.0,"deltaZ":0.0, "timestamp":Number.parseInt(GLib.get_monotonic_time()/1000) };
		this.udpnet.send_client_udp_message(JSON.stringify(data_msg));
	}

	//on_drawing_area_draw(GtkWidget *widget, cairo_t *cr, gpointer data) {
	on_drawing_area_draw(widget, cr, data) {
		//log('XXXXX joystate = ' + JSON.stringify(this.joystate));
		var context = widget.get_style_context();
		var width = widget.get_allocated_width();
		var height = widget.get_allocated_height();
		Gtk.render_background (context, cr, 0, 0, width, height);
		//cr.arc(width/2.0, height/2.0, this.joystate['zpos'], 0, 2*Math.PI);
		cr.arc(width/2.0 + this.joystate['xpos']*(width/2.0),
			height/2.0 - this.joystate['ypos']*(height/2.0),
			this.joystate['zpos'], 0, 2*Math.PI);
		cr.fill();
		cr.$dispose();
	}

	/*	on_XkeysJoystickDemo_destroy()
	*
	*	Handler for window destruction or Quit from menu.
	*/
	on_JoystickClientDevice_destroy() {
		Gtk.main_quit();
	}


	/*	Other functions
	*/

	/*	set_joystate(msg)
	*
	*	Called from udpnet whenever a joystick event occurs.
	*	Call set joystate with new vaLues and redraw()
	*/
	set_joystate(msg) {
		// Should check that msg data is valid

		this.joystate['xpos'] = msg.x;
		this.joystate['ypos'] = msg.y;
		this.joystate['zpos'] += 100 * msg.deltaZ;

		this.queue_draw();
	}

	hello(msg) {
		log(`joystick_client_device.js received ${JSON.stringify(msg)}`);
	}

});

