imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
const {GObject, Gdk, Gio, Gtk } = imports.gi;

const Cairo = imports.cairo;

const file = Gio.File.new_for_path('xkeys_joystick_demo.ui');
const [, template] = file.load_contents(null);

var XkeysJoystickDemo = GObject.registerClass({
	GTypeName: 'XkeysJoystickDemo',
	Template: template,
	Children: ['main_box'],
	InternalChildren: [
		'drawing_area'
	]
	
}, class XkeysJoystickDemo extends Gtk.Window {
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

		this.joystate = {};
		this.joystate['xpos'] = 0.0;
		this.joystate['ypos'] = 0.0;
		this.joystate['zpos'] = 90.0;

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
	on_XkeysJoystickDemo_destroy() {
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
		//log('msg: ' + JSON.stringify(msg));

		this.joystate['xpos'] = msg.x;
		this.joystate['ypos'] = msg.y;
		this.joystate['zpos'] += 100 * msg.deltaZ;

		this.queue_draw();
	}

	hello(msg) {
		log(`xkeys_joystick_demo.js received ${JSON.stringify(msg)}`);
	}

});

