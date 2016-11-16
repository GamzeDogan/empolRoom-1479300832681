/**
 * http://usejsdoc.org/
 */

/** Imported needed libraries. */
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

/** A list with the online users. */
var userList = {};

/**
 * If a client want to connect with the server then this function will send a
 * respond with the URL to the client.
 */
app.get('/', function(request, respond) {
	respond.sendFile(__dirname + '/Chatroom.html');
});

/**
 * After the response of the server, the client will be connected. 
 */
io.on('connection', function(socket) {
	/**
	 * After the client clicked on the login button the user name will be
	 * transferred to the sever. It goes through the list and checks if the
	 * user name is already taken or not. If the user name is not in the list then
	 * it will be added to the list. After that, the list with the objects will be
	 * sent to the client side.
	 */
	socket.on('logInUser', function(data, callback) {
		if (data.username in userList) {
			callback(false);
		} else {
			callback(true);
			socket.username = data.username;
			userList[socket.username] = socket;
			io.emit('logInUserEmit', {
				timezone : new Date(),
				username : socket.username
			});
			io.emit('usernames', Object.keys(userList));
		}
	});

	/**
	 * Here we look at the text whether it is a private chat or not. If is a
	 * private chat then we slice the message to look which user gets the message. 
	 * If we have the name of the online user then we look whether the user is in the list or not.
	 */
	socket.on('chat message', function(msg) {
		var textMessage = '' + msg.text;

		if (textMessage.slice(0, 6) === '/chat ') {
			var usernameSource = msg.name
			var username = textMessage.slice(6);
			var countWords = username.indexOf(' ');
			var name = username.slice(0, countWords);
			var msgText = username.substring((countWords + 1));

			if (name in userList) {
				userList[name].emit('private message', {
					timezone : new Date(),
					name : name,
					text : msgText,
					destinationName : msg.name
				});

				userList[usernameSource].emit('private message', {
					timezone : new Date(),
					name : name,
					text : msgText,
					destinationName : msg.name
				});
			} else {
				userList[usernameSource].emit('UnvalidNameError', {
					timezone : new Date()
				});
			}

		} else {
			io.emit('chat message', {
				timezone : new Date(),
				name : msg.name,
				text : msg.text
			});
		}
	});

	/**
	 * Here you push the user name and the image to the client side.
	 */
	socket.on('userImage', function(data) {
		io.emit('userImageEmit', {
			username : data.username,
			result : data.result,
			timezone : new Date()
		});
	});

	/**
	 * If the connected user closes the window then the user will be
	 * disconnected and the name of the user will be deleted in the list. It
	 * sends also some information to the client side.
	 */
	socket.on('disconnect', function(data) {
		delete userList[socket.username];
		socket.username = undefined;
		io.emit('usernames', Object.keys(userList));
		io.emit('logOutUserEmit', {
			timezone : new Date(),
			name : socket.username
		});
	});
});

/**
 * The server listens to the port 3000.
 */
http.listen(3000);