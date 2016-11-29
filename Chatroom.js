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
var watson = require('watson-developer-cloud/visual-recognition/v3');
var fs = require('fs');
var request = require('request');

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

var weather = {
  "username": "bb663f21-bc08-4a00-9585-31f01522991f",
  "password": "fnuIa4TxTE",
  "host": "twcservice.mybluemix.net",
  "port": 443,
  "url": "https://bb663f21-bc08-4a00-9585-31f01522991f:fnuIa4TxTE@twcservice.mybluemix.net"
}

// app.get('/api/forecast/daily', function(req, res) {
    // var geocode = (req.query.geocode || "45.43,-75.68").split(",");
    // weatherAPI("/api/weather/v1/geocode/" + geocode[0] + "/" + geocode[1] + "/forecast/daily/10day.json", {
        // units: req.query.units || "m",
        // language: req.query.language || "en"
    // }, function(err, result) {
        // if (err) {
        	// console.log(err);
            // res.send(err).status(400);
        // } else {
        	// console.log("10 days Forecast");
            // res.json(result);
        // }
    // });
// });

//var weather = json.loads(r.text);   
//console.log(json.dumps(weather,indent=1));


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
		if(serverPwd != undefined){
			userSelector.selector._id = "ServerEmpolChatRoom";
			databaseEmpol.find(userSelector, function(error, resultSet) {
				if (!(error)) {
					bcrypt.compare(serverPwd, resultSet.docs[0].password, function(err, res) {
						if(!(err)){
							if(res == true){
								callback(true);			
							} else  {
								callback(false);
							}
						} else {
							console.log('ERROR: ' + hash);
						}
					});
				} else {
					console.log("ERROR: " + error.message);
				}
			});	
		} else {
			console.log("Server pwd is undefined!");
		}
	});
	
	socket.on('signUp', function(data, callback){
		var image = data.image;
		var username = data.username;
		var password = data.password;
		var passwordVerification = data.passwordVerification;
		var detected = false;
		var filename = 'profilePicture_' + data.username;
		var directory = './image/';
		var splitting = image.split(';')[0].match(/jpeg|jpg|png/)[0];
        var data = image.replace(/^data:image\/\w+;base64,/, "");
        var buffer = new Buffer(data, 'base64');
		
		console.log("username: "+username);
		console.log("pwd: "+password);
		
		fs.writeFile(directory + filename + '.' + splitting, buffer);
		
		var params = {
			images_file: fs.createReadStream(directory + filename + '.' + splitting)
		};
		
		if(password === passwordVerification){
			databaseEmpol.find(userSelector, function(error, resultSet) {
				if (error) {
					console.log("Something went wrong");
				} else {
					visualRecognition.detectFaces(params, function(error, response) {
						if (error){
							console.log("ERROR: " + error);
						} else {
							var resImage = response.images;
							console.log(JSON.stringify(response, null, 2));
							for(var i=0; i<resImage.length; i++){
								var resImage = response.images[i];
								for(var j=0; j<resImage.faces.length; j++){
									console.log(resImage.faces[j]);	
									detected = true;
								}
							}	
							if(detected == true){	
								bcrypt.genSalt(10, function(err, salt) {
									bcrypt.hash(password, salt, function(err, hash) {
										password = hash; 
										databaseEmpol.insert({_id: username, password: password, image: image}, function(error, body) {
											if (!error) {								
												callback(true);
												socket.username = username;
												socket.password = password;
												socket.image = image;
												console.log("sign Up fkt!");
												io.emit('signInSuccessfully');
											} else { 
												callback(false);
												console.log("Could not store the values!");
											}
										});
									});
								});
							} else {
								io.emit('errorHumanFace');
								//ÖZGÜN: Error Message: Kein Mensch auf dem Bild (bild in dem div löschen)
								console.log("Doesnt contain a human face ");
							}
						}
					});
                }
            }); 
		} else {
			io.emit('errorPWDVerification');
			//ÖZGÜN: ERROR Message : PWD und PWD Verification stimmen nicht überein
			console.log("Passwörter stimmen nicht überein");
		}	
	});
	
	socket.on('logInUser', function(data, callback) {
		var username = data.username;
		var password = data.password;
		
		if(password != undefined){
			userSelector.selector._id = username;
			databaseEmpol.find(userSelector, function(error, resultSet) {
				if (error) {
					console.log("Something went wrong!");
				} else {
					bcrypt.compare(password, resultSet.docs[0].password, function(err, res) {
						if(!(err)){
							if(res == true){
								socket.username = username;
								userList[socket.username] = socket;						
								if(socket.username != undefined){
									io.emit('logInUserEmit', {
									timezone : new Date(),
									username : socket.username
									});
									userList[socket.username].emit('loginSuccessful', {username: socket.username, image: resultSet.docs[0].image});
								}
								roomUserlist[socket.username] = home;
								if(socket.username != undefined){
									io.emit('usernames', {userList: Object.keys(userList), roomList: roomUserlist});
								} else { 
									console.log("socket username ist undefined");
								}	
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
				
				/*var compareLocation;
				if(msg.text.match(reutlingen)){
					weatherAPI();
					
				}*/
	
				for(var key in roomUserlist){
					if(roomUserlist[key] == currentRoom){
						targetUsers.push(key);
					}
				}
				for(var i = 0; i < targetUsers.length; i++){
					if(userList[targetUsers[i]] != undefined){
					userList[targetUsers[i]].emit('chat message', { timezone : new Date(), name : msg.name, text : msg.text});
					} else { console.log("fehler");}
				}
			}
		}
	});
	
	socket.on('weatherAPI', function(msg){
		var urlLocation = 'https://'+weather.username+':'+weather.password+'@twcservice.mybluemix.net:443/api/weather/v3/location/search?query=Atlanta&locationType=city&countryCode=US&adminDistrictCode=GA&language=en-US';
		var url = 'https://'+weather.username+':'+weather.password+'@twcservice.mybluemix.net:443/api/weather/v1/geocode/45.42/75.69/forecast/hourly/48hour.json?units=m&language=en-US';
		
		request({
		url : url,
		method: "GET",
		headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Accept": "application/json"}
		}); 
		
		request(urlLocation, function(error, response){
			if(response.statusCode >= 200 && response.statusCode < 400){
				var line;
				 for(var i=0; i<response.body.length; i++){
					// console.log("hallo: "+JSON.stringify(response.body.location));
					var line2 = line + response.body[i];
				 }
				 console.log("hallo3: " + JSON.stringify(line2));
				// console.log("hallo3: "+JSON.stringify(response.body.location));
				//console.log("response " + JSON.stringify(response.body));
			} else {
				console.log(error);
			}
		});
		
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
			
		var visualRecognitionService = services['watson_vision_combined'];
        for (var service in visualRecognitionService) {
            if (visualRecognitionService[service].name === 'VisualRecognition') {
                visualRecognition = new watson({
                    api_key: visualRecognitionService[service].credentials.api_key,
                    version_date: '2016-11-19'
                });
            }
        }
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