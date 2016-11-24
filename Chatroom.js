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
var bcrypt = require('bcryptjs');
//var Watson = require('watson-developer-cloud/visual-recognition/v3');
//var fs = require('fs');

//var visual_recognition = new VisualRecognitionV3({
  //api_key: '<api_key>',
  //version_date: '2016-05-19'
//});

var userList = {};
var home = 'home';
var chatroomList = [home];
var roomUserlist = {};
var passwordRoomList = {};

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
	//respond.redirect('https://' + request.headers.host + request.url);
	
	
});

/**
 * After the response of the server, the client will be connected. 
 */
io.on('connection', function(socket) {
	socket.on('pwdForServerEmpolChatRoom', function(data, callback){
		var serverPwd = data.password;
		io.emit('loginInServer');
		if(serverPwd != undefined){
			userSelector.selector._id = "ServerEmpolChatRoom";
			databaseEmpol.find(userSelector, function(error, resultSet) {
				if (!(error)) {
					bcrypt.compare(serverPwd, resultSet.docs[0].password, function(err, res) {
						if(!(err)){
							if(res == true){
								callback(true);
								console.log("Passworteingabe vom Server richtig!");			
							} else  {
								callback(false);
								console.log("Passworteingabe vom Server falsch!");
							}
						} else {
							console.log('ERROR: ' + hash);
						}
					});
				} else {
					console.log("ERROR: pwdForServerEmpolChatRoom");
				}
			});	
		} else {
			console.log("serverPwd ist undefined" + serverPwd);
		}
	});
	
	socket.on('signInUser', function(data, callback){
		databaseEmpol.find(userSelector, function(error, resultSet) {
			if (error) {
                console.log("Something went wrong");
            } else {
				bcrypt.genSalt(10, function(err, salt) {
					bcrypt.hash(data.password, salt, function(err, hash) {
						data.password = hash; 
						databaseEmpol.insert({_id: data.username, password: data.password}, function(error, body) {
						if (!error) {								callback(true);
							socket.username = data.username;
							socket.password = data.password;
							io.emit('signInSuccessfully');
						} else {
							//Diesen Username gibt es schon! 
							callback(false);
							console.log("Could not store the values!");
						}
						});
					});
				});
			}
        });  
	});
	
	socket.on('logInUser', function(data, callback) {
		//socket.password = data.password;
		if(data.password != undefined){
			userSelector.selector._id = data.username;
			
			databaseEmpol.find(userSelector, function(error, resultSet) {
				console.log("login pwd eingabe: " + data.password);
				console.log("login pwd eingabe resultset: " + resultSet.docs[0].password);
				if (error) {
					console.log("Something went wrong!");
				} else {
					bcrypt.compare(data.password, resultSet.docs[0].password, function(err, res) {
						console.log("Bin hieeer");
						if(!(err)){
							console.log("Bin hieeer2");
							if(res == true){
								socket.username = data.username;
								userList[socket.username] = socket;
								callback(true);							
								if(socket.username != undefined){
									io.emit('logInUserEmit', {
									timezone : new Date(),
									username : socket.username
									});
								}
								roomUserlist[socket.username] = home;
								if(socket.username != undefined){
									io.emit('usernames', {userList: Object.keys(userList), roomList: roomUserlist});
								} else { console.log("socket username ist undefined");}	
							} else  {
								callback(false);
								console.log("Passwort falsch");
							}
						} else {
							console.log('Fehler: ' + hash);
						}
					});
				}
			});	
		} else { 
			console.log("password ist anscheinend undefined: " +data.password)};
			//falsches Passwort
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
	
	socket.on('avatarUpload', function(data) {
		console.log("avatarUplad Serverside");
		io.emit('avatarUploaded', {result : data.result});
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
		
		//Hier kommt noch Watson rein
		
		
    } else {
        console.log("Cloudant Service was not bound");
    }
        databaseEmpol = cloudant.db.use('datenbankempol');
        if (databaseEmpol === undefined) {
            console.log("The database is not defined!");
        }
}


/**
 * The server listens to the port 3000.
 */
http.listen(appEnv.port || 3000);