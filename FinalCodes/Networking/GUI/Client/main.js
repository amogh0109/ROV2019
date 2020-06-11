var socket = io();
var msg = "";
var thresh = 10;

var haveEvents = "ongamepadconnected" in window;
var controllers = {};
var prevAxes = [];
var prev_btns = [];

var interval;

var ServerDetectedJoy = [];

//On gamepad connected this function will add the gamepad to the array "controllers".
function connecthandler(e) {
	console.log("gamepad connection");
	addgamepad(e.gamepad);
}

//Gamepad details are extracted and are put on the GUI.
function addgamepad(gamepad) {
	controllers[gamepad.index] = gamepad;
	ServerDetectedJoy[gamepad.index] = { id: gamepad.id, status: false };
	$("body").append(
		"<div class='controller' id='controller" + gamepad.index + "'>"
	);

	$("#controller" + gamepad.index).append(
		"<h4>Gamepad connected at index " +
			gamepad.index +
			": " +
			gamepad.id +
			". " +
			gamepad.buttons.length +
			" buttons, " +
			gamepad.axes.length +
			" axes.</h4><br><div id='gp1_axes'></div><br><div id='gp1_hats'></div><br><div id='gp1_buttons'></div>"
	);

	//updateStatus will be called at 60 FPS
	interval = setInterval(updateStatus, 1000 / 60);
}

//Gamepad is removed from the array when disconnected
function disconnecthandler(e) {
	removegamepad(e.gamepad);
}

//Reset the GUI labels and texts related to the gamepad
function removegamepad(gamepad) {
	clearInterval(interval);
	var d = document.getElementById("controller1");
	msg = { buttons: [], axes: [] };
	msg = JSON.stringify(msg);
	console.log(msg);
	socket.emit("removeGamepad", gamepad.id);
	$("#controller1").empty();
	delete controllers[gamepad.index];
}

//Main Loop for polling the gamepad.
function updateStatus() {
	//console.log(interval);
	if (!haveEvents) {
		scangamepads();
	}

	var i = 0;
	var j;

	for (j in controllers) {
		//Client part of the HANDSHAKE mechanism.
		if (ServerDetectedJoy.length != 0) {
			if (!ServerDetectedJoy[j].status) {
				socket.emit("newGamepad", ServerDetectedJoy[j].id);
			}
		}

		/************* POLLING  & VALUE EXTRACTION ***********/
		var count = 0;
		var controller = controllers[j];
		var buttons = [];
		var axes = [
			Math.floor(controller.axes[0] * 100),
			-Math.floor(controller.axes[1] * 100),
			Math.floor(controller.axes[2] * 100),
			-parseInt(controller.axes[3].toFixed(2)),
			controller.axes[5],
		];
		var hats = [controller.axes[4], controller.axes[5]];
		var c_axes = controller.axes;

		/******* DISPLAY ON THE GUI *******/
		$("#gp1_axes").empty();
		$("#gp1_buttons").empty();
		$("#gp1_hats").empty();
		for (i in axes) {
			if (i < 4) {
				$("#gp1_axes").append(
					"<span> axes[" + i + "]: " + axes[i] + "</span><br>"
				);
			}
		}
		for (i in hats) {
			$("#gp1_hats").append(
				"<span> Hats[" + i + "]: " + hats[i] + "</span><br>"
			);
		}
		for (i in controller.buttons) {
			buttons.push(controller.buttons[i].value);
		}
		for (i in buttons) {
			$("#gp1_buttons").append(
				"<span> buttons[" + i + "]: " + buttons[i] + "</span><br>"
			);
		}

		//Compare the data with previous data.
		if (prev_btns.length == 0) {
			for (i in buttons) {
				prev_btns.push(buttons[i]);
			}
		} else {
			for (i in prev_btns) {
				if (prev_btns[i] != buttons[i]) {
					count++;
					prev_btns[i] = buttons[i];
				}
			}
		}

		//Not all axes values are between -1 to 1, some normalization is required before sending.
		//Multiplier we chose was 100, so the values come between -100 to 100.
		if (prevAxes.length == 0) {
			for (i in axes) {
				prevAxes.push(axes[i]);
			}
		} else {
			var msg_axes = [];
			for (j in prevAxes) {
				if ((j == 4 || j == 3) && prevAxes[j] != axes[j]) {
					//console.log(j+": "+axes[j]);
					msg_axes.push(axes[j]);
					count++;
				} else if (Math.abs(prevAxes[j] - axes[j]) > thresh && j < 3) {
					msg_axes.push(axes[j] - (axes[j] % 10));
					count++;
				} else {
					msg_axes.push(prevAxes[j]);
				}
			}
			//console.log(prevAxes);
			for (j in msg_axes) {
				prevAxes[j] = msg_axes[j];
			}
		}
		//The count variable decides if anything has changed from previous state.
		//If count !== 0 means values have changed and the data needs to be sent to the server.
		if (count > 0) {
			msg = { buttons: buttons, axes: msg_axes };
			//msg = JSON.stringify(msg);
			//console.log(msg);
			socket.emit("message", msg);
		}
	}
	//requestAnimationFrame(updateStatus);
}

function scangamepads() {
	var gamepads = navigator.getGamepads
		? navigator.getGamepads()
		: navigator.webkitGetGamepads
		? navigator.webkitGetGamepads()
		: [];
	for (var i = 0; i < gamepads.length; i++) {
		if (gamepads[i]) {
			if (gamepads[i].index in controllers) {
				controllers[gamepads[i].index] = gamepads[i];
			} else {
				addgamepad(gamepads[i]);
			}
		}
	}
}

window.addEventListener("gamepadconnected", connecthandler);
window.addEventListener("gamepaddisconnected", disconnecthandler);

if (!haveEvents) {
	setInterval(scangamepads, 500);
}

//HANDSHAKE Mechanism
socket.on("ServerDetectedJoy", function (data) {
	var c = ServerDetectedJoy.find(function (value) {
		return value.id == data;
	});
	console.log(c);
	c.status = true;
});

socket.on("serverOnline", function () {
	console.log("serverOnline!");
	for (j in ServerDetectedJoy) {
		ServerDetectedJoy[j].status = false;
	}
});
