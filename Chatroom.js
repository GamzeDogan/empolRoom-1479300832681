/**
 * http://usejsdoc.org/
 */

/** Imported needed libraries. */
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var cfenv = require('cfenv');
var appEnv = cfenv.getAppEnv();
var Cloudant = require('cloudant');

var userList = {};
var home = 'home';
var chatroomList = [home];
var roomUserlist = {};
var passwordRoomList = {};
var passwordUserList = {};

var services;
var cloudant;
var databaseEmpol;

var userSelector = {
    "selector": {
        "_id": ""
    }  
};

init();

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
	 * After the client clicked on the sign in button the user name will be
	 * transferred to the sever. It goes through the list and checks if the
	 * user name is already taken or not. If the user name is not in the list then
	 * it will be added to the list. After that, the list with the objects will be
	 * sent to the client side. Log in works like the sign in function.
	 */
	socket.on('signInUser', function(data, callback){
		if(data.username in passwordUserList){
			callback(false);
		} else {
			callback(true);
			socket.username = data.username;
			socket.password = data.password;
			passwordUserList[socket.username] = socket.password;
			io.emit('signInSuccessfully');
		}
	});
	
	socket.on('logInUser', function(data, callback) {
			if (!(data.username in passwordUserList)) {
				callback(false);
			} else {
				if(passwordUserList[data.username] == data.password){
					socket.username = data.username;
					userList[socket.username] = socket;
					callback(true);
					
					if(socket.username != undefined){
						io.emit('logInUserEmit', {
							timezone : new Date(),
							username : socket.username
						});
					}
					
				} else {
					callback(false);
				}
				roomUserlist[socket.username] = home;
				if(socket.username != undefined){
					io.emit('usernames', {userList: Object.keys(userList), roomList: roomUserlist});
				}
			}		
	});
	
	/**
	 * Here we look at the text whether it is a private chat or not. If is a
	 * private chat then we slice the message to look which user gets the message. 
	 * If we have the name of the online user then we look whether the user is in the list or not.
	 * Also we look at the text whether it is /create or /join.
	 */
	socket.on('chat message', function(msg) {
		var textMessage = '' + msg.text;
		var pwd;
		
		if(socket.username != undefined){
			if(textMessage.slice(0, 8) === '/create '){
					var chatroomNameStart = textMessage.slice(8);
					var countWords = chatroomNameStart.indexOf(' ');
					var chatroomName = chatroomNameStart.slice(0, countWords);
					pwd = chatroomNameStart.slice((countWords+1));
					
					if(chatroomList.indexOf(chatroomName) > -1){
						userList[socket.username].emit('RoomExistsWarning', {chatroom : chatroomName, timezone: new Date()});
					} else {
						chatroomList.push(chatroomName);
						roomUserlist[socket.username]=chatroomName;
						io.emit('chatroomBroadcast', {name : msg.name, chatroom: chatroomName, timezone: new Date()});
						userList[socket.username].emit('emptyChat', {timezone: new Date(), chatroom: chatroomName, pwd: pwd});
	
						passwordRoomList[chatroomName]=pwd;
						io.emit('usernames', {userList: Object.keys(userList), roomList: roomUserlist});
					}
			}
			
			else if(textMessage.slice(0,6) === '/join '){
				var chatroomNameStart = textMessage.slice(6);
				var countWords = chatroomNameStart.indexOf(' ');
				var chatroomName = chatroomNameStart.slice(0, countWords);
				var password = chatroomNameStart.slice((countWords+1));
	
				var temp = false;
				for(var i=0; i < chatroomList.length; i++){
					if(chatroomName == chatroomList[i]){
						temp = true;
						
						var pwdOfRoom = passwordRoomList[chatroomName];
						if(pwdOfRoom === password){
							roomUserlist[socket.username]=chatroomName;
							userList[socket.username].emit('emptyChat', {timezone: new Date(), chatroom: chatroomName, pwd : password});
							io.emit('userChangedRoom', {name: msg.name, timezone: new Date(), chatroom: chatroomName}); 
							io.emit('usernames', {userList: Object.keys(userList), roomList: roomUserlist});
						} else {
							userList[socket.username].emit('wrongPWforRoom', {chatroom: chatroomName, timezone: new Date()});
						}
					}
				}
				if(temp == false){
					userList[socket.username].emit('roomDoesntExistWarning', {timezone: new Date(), room: chatroomName});
				}
				temp = false;
			}
			
			else if (textMessage.slice(0, 6) === '/chat ') {
				var usernameSource = msg.name;
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
				var currentRoom = roomUserlist[socket.username];
				var targetUsers = [];
	
				for(var key in roomUserlist){
					if(roomUserlist[key] == currentRoom){
						targetUsers.push(key);
					}
				}
				for(var i = 0; i < targetUsers.length; i++){
					userList[targetUsers[i]].emit('chat message', { timezone : new Date(), name : msg.name, text : msg.text});
				}
			}
		}
	});
	
	/**
	 * Here you push the user name and the image to the client side.
	 */
	socket.on('userImage', function(data) {
		if(socket.username != undefined){
			io.emit('userImageEmit', {
				username : data.username,
				result : data.result,
				timezone : new Date()
			});
		}
	});

	/**
	 * If the connected user closes the window then the user will be
	 * disconnected and the name of the user will be deleted in the list. It
	 * sends also some information to the client side.
	 */
	socket.on('disconnect', function(data) {
			delete userList[socket.username];
			io.emit('usernames', {userList: Object.keys(userList), roomList: roomUserlist});
			if(socket.username != undefined){
				io.emit('logOutUserEmit', {timezone : new Date(), name : socket.username});
				socket.username = undefined;
		}
	});
});

function init() {
    if (process.env.VCAP_SERVICES) {
        services = JSON.parse(process.env.VCAP_SERVICES);

        var cloudantService = services['cloudantNoSQLDB'];
        for (var service in cloudantService) {
            if (cloudantService[service].name === 'datenbankEmpolService') {
                cloudant = Cloudant(cloudantService[service].credentials.url);
            }
        }
 
    } else {
        console.log("ERROR: Cloudant Service was not bound! Are you running in local mode?");
    }

    if (isServiceAvailable(cloudant)) {
        databaseEmpol = cloudant.db.use('datenbankempol');
        if (databaseEmpol === undefined) {
            console.log("ERROR: The database with the name 'datenbankempol' is not defined. You have to define it before you can use the database.")
        }
    }
}


/**
 * The server listens to the port 3000.
 */
http.listen(appEnv.port || 3000);