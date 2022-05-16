
const devices = {
	"0"    : {"jog":1, "shuttle":7, "tbar":255, "joyx":127, "joyy":127, "joyz":255, "deltaZ":255},
	"1062" : {"jog":1, "shuttle":7},
	"1065" : {"joyx":127, "joyy":127, "joyz":255, "deltaZ":255},
	"1114" : {"jog":1, "shuttle":7},
	"1275" : {"tbar":255},
	"1325" : {"jog":1, "shuttle":7, "tbar":255}

};

module.exports = 
{
	hello (message) {
		console.log(`Hello: ${message}`);
	},

	maxVal (pid) {
		if (! (devices.hasOwnProperty(pid.toString())) ) { pid = "0" };
		return devices[pid.toString()];
	},

	normalize (x, controlType="tbar", pid=0) {
		const min = 0;
		const max = this.maxVal(pid)[controlType];
		if (!max) { throw new Error("No " + controlType + " controller found for device PID " + pid); }
		//console.log(`Running normalize with: ${x}, ${min}, ${max}`);
		const fixlen = (max - min).toString().length
		var result = (x-min)/(max - min);
		return parseFloat(result.toFixed(fixlen));
	},

	/* 	Convert from normalized back to native value */
	native (n, controlType="tbar", pid=0) {
		const min = 0;
		const max = this.maxVal(pid)[controlType];
		if (!max) { throw new Error(`No ${controlType} controller found for device PID ${pid}`); }
		//console.log(`Running native with: ${n}, ${min}, ${max}`);
		var result = n*(max - min) + min;
		return Math.round(result);
	}
}

