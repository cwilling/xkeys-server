
var required_fields = [
//	"test_missing",
	"msg_type",
	"server_id",
	"product_id",
	"unit_id",
	"duplicate_id"
];

/*	check_required(msg)
*
*	Return an array of requied fields
*	missing from the input msg.
*
*	Empty array => mesg OK
*/
check_required = (msg) => {
	result = [];

	const msg_keys = Object.keys(msg);
	required_fields.forEach( (item) => {
		if (! msg_keys.includes(item)) {
			result.push(item);
		}
	});
	//console.log(`check_required returning: ${JSON.stringify(result)}`);
	return result;
}

module.exports = 
{
	hello: function () {
		console.log("Hello");
	},

	bye: function () {
		console.log("Bye");
	},

	/*	xlate2node (message)
	*
	*		Expect message parameter to be stringified data
	*	conforming to Xkeys Dynamic Control Data (DCD) protocol.
	*
	*		Return a stringified object containing topic string
	*	and	message object in translated format suitable for
	*	NodeRED nodes connected via MQTT.
	*/
	xlate2node (message) {
		var result = {};
		//console.log(`xlate2node() input message: ${message}`);
		let msg;
		try {
			msg = JSON.parse(message);
		}
		catch (err) {
			result["msg_type"] = "error";
			result["error_msg"] = err;
			result["error_echo"] = message;
			console.log(`Can't parse message. ${err}`);
			return JSON.stringify(result);
		}
		// Check its a valid enough message (has the fields we need)
		const fields_missing = check_required(msg);
		if (fields_missing.length > 0) {
			result["msg_type"] = "error";
			result["error_msg"] = "Missing message field(s): " + fields_missing.toString();
			result["error_echo"] = JSON.stringify(msg);
			console.log(`Incomplete message structure. Missing: ${fields_missing.toString()}`);
			return JSON.stringify(result);
		}

		var msg_topic = "/xkeys/server/" + msg.msg_type + "/" + msg.product_id + "/" + msg.unit_id + "/" + msg.duplicate_id + "/" + msg.control_id;
		var metadata = {};
		var msg_pload = {};
		switch (msg["msg_type"]) {
			case "button_event":
				metadata["row"] = msg.row;
				metadata["col"] = msg.col;
				metadata["timestamp"] = msg.timestamp;
				metadata["type"] = msg.value==0?"up":"down";
				metadata["shortnam"] = msg.device;
				msg_pload = {"server_id":msg.server_id,"request":"device_event", "data":metadata};
			break;
			case "jog_event":
				metadata["timestamp"] = msg.timestamp;
				metadata["type"] = "jog";
				metadata["deltaPos"] = msg.value;
				metadata["shortnam"] = msg.device;
				msg_pload = {"server_id":msg.server_id,"request":"device_event", "data":metadata};
			break;
			case "shuttle_event":
				metadata["timestamp"] = msg.timestamp;
				metadata["type"] = "shuttle";
				metadata["shuttlePos"] = msg.value;
				metadata["shortnam"] = msg.device;
				msg_pload = {"server_id":msg.server_id,"request":"device_event", "data":metadata};
			break;
			case "joystick_event":
				const position = {"x":msg.x, "y":msg.y, "z":msg.z, "deltaZ":msg.deltaZ};
				metadata["timestamp"] = msg.timestamp;
				metadata["type"] = "shuttle";
				metadata["position"] = position;
				metadata["shortnam"] = msg.device;
				msg_pload = {"server_id":msg.server_id,"request":"device_event", "data":metadata};
			break;
			case "tbar_event":
				metadata["timestamp"] = msg.timestamp;
				metadata["type"] = "tbar";
				metadata["position"] = msg.value;
				metadata["shortnam"] = msg.device;
				msg_pload = {"server_id":msg.server_id,"request":"device_event", "data":metadata};
			break;
			default:
				console.log(`Unknown msg_type: ${msg_type}`);
			break
		}
		result["msg_topic"] = msg_topic;
		result["msg_pload"] = msg_pload;
		//console.log(`xlate returning: ${JSON.stringify(result)}`);
		return JSON.stringify(result);
	}
};

