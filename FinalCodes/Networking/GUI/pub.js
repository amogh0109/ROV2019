/**
 * Commnad Line arguments to specify the host for Mosquitto Broker.
 * This feature helps in achieving the modularity in the system. Many developers can test their codes with
 * mosquitto broker being run on the same network but different machine.
 */
var args = process.argv.slice(2);
var ip = "192.168.0.13";
if (args.indexOf("-h") != -1) {
	ip = args[args.indexOf("-h") + 1];
}

//Initialisaitons for MQTT,ExpressJS and Socket.io
var mqtt = require("mqtt");      //import libraries in npm(node package management)
var express = require("express");    //server
var app = express();     //middleware 
app.get("/", function (req, res) {
	res.sendFile(__dirname + "/Client/index.html");      //html file on server
});
app.use("/Client", express.static(__dirname + "/Client"));    // 

var server = app.listen(8000, "localhost");
var io = require("socket.io").listen(server);       //import socket.io
var client = mqtt.connect("mqtt://" + ip);

//Socket.io client lifecycle events
client.on("connect", function () {
	client.subscribe("navFeed", function (err) {
		if (!err) {
			console.log("subscribed to navFeed");
		}
	});

	client.subscribe("link4D", function (err) {
		if (!err) {
			console.log("subscribed to link4D");
		}
	});

	client.subscribe("link6D", function (err) {
		if (!err) {
			console.log("subscribed to link6D");
		}
	});

	client.subscribe("pumpSolenoid", function (err) {
		if (!err) {
			console.log("subscribed to pumpSolenoid");
		}
	});
});

client.on("message", function (topic, message) {
	// message is Buffer
	console.log("from mqtt: ");
	console.log(message.toString());
});

/************** JOYSTICK CODE ***************/

var controllers = [];

// Change in data check
var prev_velocities = undefined;
var prev_arm4 = undefined;
var prev_arm6 = undefined;
var prev_pump = undefined;

//Data elements
var velocities = { x: 0, y: 0, z: 0 };
var link4D = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
var link6D = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
var pump = 0;

//Link counters
var curr_l4 = 0;
var curr_l6 = 0;

var changeLink = false;
var buttonReleased = true;
var toggleButtonReleased = true;

//ToggleButtons
var gripper4 = false;
var gripper6 = false;

//Mode switch booleans
const ModeEnum = Object.freeze({ nav: 1, dof_4: 2, dof_6: 3 });     //values cannot be changed
//const HatState = Object.freeze({"ZERO":1.29, "UP":-1.00, "DOWN":0.14,"LEFT":0.71,"RIGHT":-0.43});
var joyMode = undefined;

/**
 * Helper function to map one range onto other and get the value in the new range
 * example usage: map(30,-100,100,-255,255);
 */
function map(value, range_min, range_max, out_range_min, out_range_max) {
	var slope = (out_range_max - out_range_min) / (range_max - range_min);    
	var newY = slope * (value - range_min) + out_range_min;
	return newY;          //mapping coordinates of arm
}

//Broadcast Events
io.on("connection", function (socket) {
	socket.emit("serverOnline");

	socket.on("disconnect", function () {
		console.log("connection closed");
		controllers = [];
	});

	//For server to detect a Gamepad connected to the client, a handshake is required.
	socket.on("newGamepad", function (data) {
		if (controllers.length == 0) {
			console.log("no Gamepads");
			controllers.push(data);
			socket.emit("ServerDetectedJoy", data);
		} else {
			var conn = controllers.find(function (value) {
				return value == data;                 //data --> gamepad id
			});
			if (conn.length > 0) {
				console.log("Gamepad with id: " + data + " already exists");
				socket.emit("ServerDetectedJoy", data);
			} else {
				controllers.push(data);
				socket.emit("ServerDetectedJoy", data);
			}
		} 
		console.log("Gamepads connected: " + controllers);
	});

	//Reset all values when the gamepad is removed
	socket.on("removeGamepad", function (data) {
		console.log("in removeGamepad ");
		controllers = controllers.filter(function (value) {
			return value != data;                //remove val != id
		});
		if (controllers.length > 0) {
			console.log("Gamepads connected: " + controllers);
		} else {
			console.log(" NO Gamepads connected!");
		}

		velocities.x = 0;
		velocities.y = 0;
		velocities.z = 0;
		link4D = { "1": 0, "2": 0, "3": 0, "4": 0 };
		link6D = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
		pump = 0;
		var msg = JSON.stringify(velocities);

		//Publish on MQTT Topics
		client.publish("navFeed1", msg);
		msg = JSON.stringify(link4D);
		client.publish("link4D", msg);
		msg = JSON.stringify(link6D);
		client.publish("link6D", msg);
		msg = JSON.stringify(pump);
		client.publish("pumpSolenoid", msg);
	});

	//When new message is received, i.e. joystick data has changed on client side.
	socket.on("message", function (data) {
		if (controllers.length > 0) {
			//Based on the status of the buttons a mode is selected
			if (data["buttons"][2]) {
				joyMode = ModeEnum.nav;
				console.log("NAVIGATION MODE:");
			}
			if (data["buttons"][3]) {
				joyMode = ModeEnum.dof_4;
				console.log("ARM_4 MODE:");
			}
			if (data["buttons"][4]) {
				joyMode = ModeEnum.dof_6;
				console.log("ARM_6 MODE:");
			}

			/*
			As pump and solenoid/centrall ballast system should work independently of other systems
			it's isolated from the other data and a separate dedicated topic is given for that 
			*/
			if (data["axes"][4] == 0) {
				pump = 0;
			} else if (data["axes"][4] == 1) {
				pump = 1;
			} else if (data["axes"][4] == -1) {
				pump = -1;
			}
			if (pump != prev_pump) {
				prev_pump = pump;
				var msg = JSON.stringify({ dir: pump });
				client.publish("pumpSolenoid", msg);
			}

			/**
			 *	Button functionality in Arms mode
			 *  -	button[0] changes the current link
			 *  -	button[5] is used to toggle the gripper pins
			 * 	the link index is incremented in circular fashion excluding the gripper.
			 * 	grippers' state is toggled independently.
			 * 	The link index increment is restricted to trigger once per "button press".
			 */
			if (joyMode != ModeEnum.nav) {
				if (data["buttons"][0] && !changeLink && buttonReleased) {
					changeLink = true;
					buttonReleased = false;
				} else if (data["buttons"][0] == 0) {
					buttonReleased = true;
				}

				if (data["buttons"][5] && toggleButtonReleased) {
					if (joyMode == ModeEnum.dof_4) {
						gripper4 = !gripper4;
						link4D["5"] = gripper4 === true ? 1 : 0;
					}
					if (joyMode == ModeEnum.dof_6) {
						gripper6 = !gripper6;
						link6D["6"] = gripper6 === true ? 1 : 0;
					}
					toggleButtonReleased = false;
				} else if (data["buttons"][5] == 0) {
					toggleButtonReleased = true;
				}
			}

			//If joystick is in navigation mode
			if (joyMode == ModeEnum.nav) {
				if (data["axes"][1] > 50) {
					velocities.y = 1;
				} else if (data["axes"][1] < -50) {
					velocities.y = -1;
				} else {
					velocities.y = 0;
				}
				velocities.z = data["axes"][3];
				var msg = JSON.stringify(velocities);
				if (prev_velocities == undefined) {
					prev_velocities = msg;
				} else {
					if (!(msg === prev_velocities)) {
						prev_velocities = msg;
						client.publish("navFeed", msg);
					}
				}
			}

			//4 DOF arm mode
			if (joyMode == ModeEnum.dof_4) {
				if (changeLink) {
					curr_l4++;
					curr_l4 %= 4;
					changeLink = false;
					link4D = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
				}
				link4D[(curr_l4 + 1).toString()] = parseInt(
					map(data["axes"][1], -100, 100, -255, 255)
				);

				//If data has changed from the previous data then only send the data.
				var msg = JSON.stringify(link4D);
				if (prev_arm4 == undefined) {
					prev_arm4 = msg;
				} else {
					if (!(msg === prev_arm4)) {
						prev_arm4 = msg;
						client.publish("link4D", msg);
					}
				}
			}

			//6 DOF arm mode
			if (joyMode == ModeEnum.dof_6) {
				if (changeLink) {
					curr_l6++;
					curr_l6 %= 5;
					changeLink = false;
					link6D = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
				}
				link6D[(curr_l6 + 1).toString()] = parseInt(
					map(data["axes"][1], -100, 100, -255, 255)
				);

				//If data has changed from the previous data then only send the data.
				var msg = JSON.stringify(link6D);
				if (prev_arm6 == undefined) {
					prev_arm6 = msg;
				} else {
					if (!(msg === prev_arm6)) {
						prev_arm6 = msg;
						client.publish("link6D", msg);
					}
				}
			}
		}
	});
});
