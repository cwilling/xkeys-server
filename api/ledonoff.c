/*
 * This example shows how to write a client that publishes a "request".
 */

#include <json.h>
#include <mosquitto.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>


/* Turn the LED on or off */
bool onoff;

/* Callback called when the client knows to the best of its abilities that a
* PUBLISH has been successfully sent. For QoS 0 this means the message has
* been completely written to the operating system. For QoS 1 this means we
* have received a PUBACK from the broker. For QoS 2 this means we have
* received a PUBCOMP from the broker. */
void on_publish(struct mosquitto *mosq, void *obj, int mid)
{
	printf("Message with mid %d has been published.\n", mid);
	printf("Turning LED(s) %s\n", onoff?"ON":"OFF");

	/* Having published our request, we can quit. */
	mosquitto_disconnect(mosq);
}

/*	Create a request object and publish it
*/
void publish_request(struct mosquitto *mosq)
{
	struct json_object *jobj; /* The request object */
	struct json_object *pid_list, *params, *p0, *request, *uid, *name, *tmp;
	const char* jobj_string;
	int rc;
	char payload[120];

	/*	The xkeys-server expects the request object we create here to contain a number of fields.
	*	"request" : what type of action we're requesting - in this case to execute a "method"
	*	"pid_list": an array of device PIDs to perform the action on (empty array => any/all devices)
	*	"uid"     : a particular device Unit ID to perform the action on (empty string => any/all UIDs)
	*	"name"    : the name of the method being requested - in this case "setIndicatorLED"
	*	"params"  : an array of any paramaters to be applied to this method
	*				params[0] is itself an array of LED ids to target (here we target LED #2)
	*				params[1] is a boolean signalling whether to turn LED on or off
	*				params[2] is a boolean signalling whether the LED should be flashing when on
	*/
	jobj = json_object_new_object();

	/* Type of request is "method" */
	request = json_object_new_string("method");
	json_object_object_add(jobj, "request", request);

	/* Array of PIDs (empty in this case) */
	pid_list = json_object_new_array();
	json_object_object_add(jobj, "pid_list", pid_list);

	/* Unit ID as a string (empty in this case) */
	uid = json_object_new_string("");
	json_object_object_add(jobj, "uid", uid);

	/* Name of the method being requested */
	name = json_object_new_string("setIndicatorLED");
	json_object_object_add(jobj, "name", name);

	/* An Array of parameters for the requested method */
	params = json_object_new_array();
		/* params[0] is an array of LED ids to target */
		p0 = json_object_new_array();
			tmp = json_object_new_int(2);
			json_object_array_add(p0, tmp);
		json_object_array_add(params, p0);
		/* params[1] is a boolean denoting LED should turn on or off */
		tmp = json_object_new_boolean(onoff);
		json_object_array_add(params, tmp);
		/* params[2] is a boolean denoting whether LED should be flashing when on */
		tmp = json_object_new_boolean(false);
		json_object_array_add(params, tmp);
	json_object_object_add(jobj, "params", params);

	/* Check that it looks OK */
	/*
	printf("\nPrettified request to publish:\n%s\n\n", json_object_to_json_string_ext(jobj, JSON_C_TO_STRING_PRETTY ));
	*/


	/* Publish the message
	* mosq - our client instance
	* *mid = NULL - we don't want to know what the message id for this message is
	* topic = "/xkeys/node" - the topic on which this message will be published
	* payloadlen = strlen(payload) - the length of our payload in bytes
	* payload - the actual payload
	* qos = 2 - publish with QoS 2 for this example
	* retain = false - do not use the retained message feature for this message
	*/
	jobj_string = json_object_to_json_string(jobj);
	snprintf(payload, sizeof(payload), "%s", jobj_string);

	rc = mosquitto_publish(mosq, NULL, "/xkeys/node", strlen(payload), payload, 2, false);
	if(rc != MOSQ_ERR_SUCCESS){
		fprintf(stderr, "Error publishing: %s\n", mosquitto_strerror(rc));
	}
}

/* Callback called when the client receives a CONNACK message from the broker. */
void on_connect(struct mosquitto *mosq, void *obj, int reason_code)
{
	int rc;
	/* Print out the connection result. mosquitto_connack_string() produces an
	 * appropriate string for MQTT v3.x clients, the equivalent for MQTT v5.0
	 * clients is mosquitto_reason_string().
	 */
	printf("on_connect: %s\n", mosquitto_connack_string(reason_code));
	if(reason_code != 0){
		/* If the connection fails for any reason, we don't want to keep on
		 * retrying in this example, so disconnect. Without this, the client
		 * will attempt to reconnect. */
		mosquitto_disconnect(mosq);
	}

	/*	When connected, send our request.
	*	We don't subscribe to any topics since we don't expect any result
	*	to be returned.
	*/
	publish_request(mosq);
}


int main(int argc, char *argv[])
{
	struct mosquitto *mosq;
	int rc;

	/* Determine whether we're turning LED on or off. Set onoff */
	if (argc != 2 ) {
		fprintf(stderr, "%s requires an \"on\" or \"off\" argument\n", argv[0]);
		exit(1);
	}
	if (!strcmp(argv[1], "on")) {
		onoff = true;
	} else if (!strcmp(argv[1], "off")) {
		onoff = false;
	} else {
		fprintf(stderr, "%s requires an \"on\" or \"off\" argument\n", argv[0]);
		exit(2);
	}

	/* Required before calling other mosquitto functions */
	mosquitto_lib_init();

	/* Create a new client instance.
	 * id = NULL -> ask the broker to generate a client id for us
	 * clean session = true -> the broker should remove old sessions when we connect
	 * obj = NULL -> we aren't passing any of our private data for callbacks
	 */
	mosq = mosquitto_new(NULL, true, NULL);
	if(mosq == NULL){
		fprintf(stderr, "Error: Out of memory.\n");
		return 1;
	}

	/* Configure callbacks. This should be done before connecting ideally. */
	mosquitto_connect_callback_set(mosq, on_connect);
	mosquitto_publish_callback_set(mosq, on_publish);

	/* Connect to localhost on port 1883, with a keepalive of 60 seconds.
	 * This call makes the socket connection only, it does not complete the MQTT
	 * CONNECT/CONNACK flow, you should use mosquitto_loop_start() or
	 * mosquitto_loop_forever() for processing net traffic. */
	rc = mosquitto_connect(mosq, "localhost", 1883, 60);
	if(rc != MOSQ_ERR_SUCCESS){
		mosquitto_destroy(mosq);
		fprintf(stderr, "Error: %s\n", mosquitto_strerror(rc));
		return 1;
	}

	/* Run the network loop in a blocking call. The only thing we do in this
	 * example is to print incoming messages, so a blocking call here is fine.
	 *
	 * This call will continue forever, carrying automatic reconnections if
	 * necessary, until the user calls mosquitto_disconnect().
	 */
	mosquitto_loop_forever(mosq, -1, 1);

	mosquitto_lib_cleanup();
	return 0;
}

