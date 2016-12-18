/**
 * http://usejsdoc.org/
 */

/** Imported & needed libraries. */
var app = require('express')();
//var https = require('https').Server(app);
var tls = require('tls');
//var http = require('http').Server(app); 
//var io = require('socket.io')(http);
var cfenv = require('cfenv');
var Cloudant = require('cloudant');
var bcrypt = require('bcryptjs');
var watson = require('watson-developer-cloud/visual-recognition/v3');
var fs = require('fs');
var helmet = require('helmet');
var sri = require('node-sri');
var request = require('request');
var requestLocation = require('request');
var appEnv = cfenv.getAppEnv();

/** Some variables */
var userList = {};
var home = 'home';
var chatroomList = [home];
var roomUserlist = {};
var passwordRoomList = {};
var services;
var cloudant;
var databaseEmpol;


var options = {
    key: fs.readFileSync('server.enc.key'),
    cert: fs.readFileSync('server.crt')
};

var https = require('https').createServer(options, app);
var io = require('socket.io').listen(https);

/** Variable for database*/
var userSelector = {
    "selector": {
        "_id": ""
    }  
};

/** Credentials for Weather Company Data*/
var weather = {
  "username": "bb663f21-bc08-4a00-9585-31f01522991f",
  "password": "fnuIa4TxTE",
  "host": "twcservice.mybluemix.net",
  "port": 443,
  "url": "https://bb663f21-bc08-4a00-9585-31f01522991f:fnuIa4TxTE@twcservice.mybluemix.net"
}
 
sri.hash(__dirname + '/Chatroom.js', function(err, hash){
  if (err) throw err
 
  console.log('My hash is', hash);
});

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
	directives:{
        defaultSrc:["'self'"],
        scriptSrc: ["'self'", 'https://code.jquery.com/jquery-1.11.1.js', 'https://cdn.socket.io/socket.io-1.4.5.js', "'unsafe-inline'"],
        styleSrc:["'self'", "'unsafe-inline'"],
        connectSrc:["'self'", "ws://" + appEnv.url.replace('https://', '')],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
	},
    browserSniff: false,
    setAllHeaders: true

}));

app.use(helmet.xssFilter()); 
app.enable('trust proxy');
app.use(helmet.noSniff());
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
	/** Entered password will be compared with the password in the database*/
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
			console.log("ERROR: Server password is undefined!");
		}
	});
	
	/** To sign up the user has to enter a username and password. Also he has to upload or capture a picture of himself.
	If the picture doesnt contain a human face it will be rejected*/
	socket.on('signUp', function(data, callback){
		var image = data.image;
		var detected = false;
		var username = data.username;
		var password = data.password;
		var passwordVerification = data.passwordVerification;
		var filename = 'profilePicture_' + data.username;
		var directory = './image/';
		var splitting = image.split(';')[0].match(/jpeg|jpg|png/)[0];
		var data = image.replace(/^data:image\/\w+;base64,/, "");
		var buffer = new Buffer(data, 'base64');
		fs.writeFile(directory + filename + '.' + splitting, buffer);
		var params = {
			images_file: fs.createReadStream(directory + filename + '.' + splitting)
		};
		
		if(password === passwordVerification){
			databaseEmpol.find(userSelector, function(error, resultSet) {
				if (error) {
					console.log("ERROR: Something went wrong");
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
												socket.emit('signInSuccessfully');
											} else { 
												callback(false);
												console.log("ERROR: Could not store the values!" + error);
											}
										});
									});
								});
							} else {
								socket.emit('errorHumanFace');
								console.log("WARNING: Doesn't contain a human face!");
							}
						}
					});
				}
			}); 
		} else {
			socket.emit('errorPWDVerification');
		}	
	});
	
	/** The user has to enter his username and password to enter the chatroom. */
	socket.on('logInUser', function(data, callback) {
		var username = data.username;
		var password = data.password;
		
		if(password != undefined){
			if(username in userList){
				socket.emit('userIsAlreadyLogged');
			} else {
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
										console.log("ERROR: Socket username is undefined!");
									}	
								} else  {
									callback(false);
								}
							} else {
								console.log('ERROR: ' + hash);
							}
						});
					}
				});	
			}
		} else { 
			console.log("ERROR: Password is undefined: " +data.password)};
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
		var chatImage;
		var username = msg.name;
		userSelector.selector._id = username;
		
		databaseEmpol.find(userSelector, function(error, resultSet) {
			chatImage = resultSet.docs[0].image;
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
						io.emit('chatroomBroadcast', {name : msg.name, chatroom: chatroomName, timezone: new Date(), chatImage : chatImage});
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
								io.emit('userChangedRoom', {name: msg.name, timezone: new Date(), chatroom: chatroomName, chatImage : chatImage}); 
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
							destinationName : msg.name,
							chatImage: chatImage
						});
						userList[usernameSource].emit('private message', {
							timezone : new Date(),
							name : name,
							text : msgText,
							destinationName : msg.name,
							chatImage: chatImage
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
						if(userList[targetUsers[i]] != undefined){
						userList[targetUsers[i]].emit('chat message', {chatImage: chatImage, timezone : new Date(), name : msg.name, text : msg.text});
						} else { 
							console.log("ERROR: targetUsers[i] is undefined");
						}
					}
				}
			}
		});
	});
	
	/**Here we look whether the chat message contains a city or not. If it contains a city then a weather Icon will be shown*/
	socket.on('weatherAPI', function(msg){
		var message = msg.text; 
		var latitude, longitude, city, filename, word;
		var splittedMessage = message.split(" ");
		console.log("splittedMessageArray: "+splittedMessage);
		for(var i=0; i<splittedMessage.length; i++){
			word = splittedMessage[i].toLowerCase();
			if(word == 'chicago' || word == 'miami' || word == 'boston' || word == 'detroit' || word == 'reutlingen' || word == 'atlanta'){
				city = splittedMessage[i];	
				requestLocation('https://'+weather.username+':'+weather.password+'@twcservice.mybluemix.net:443/api/weather/v3/location/search?query='+city+'&locationType=city&language=en-US', function(error, response){
					if(response.statusCode >= 200 && response.statusCode < 400){
						var content = JSON.parse(response.body);
						latitude = content.location.latitude[0];
						longitude = content.location.longitude[0];
						var location = content.location.city[0];

						request('https://'+weather.username+':'+weather.password+'@twcservice.mybluemix.net:443/api/weather/v1/geocode/'+latitude+'/'+longitude+'/forecast/daily/10day.json?units=m&language=en-US', function(error, response){
							if(response.statusCode >= 200 && response.statusCode < 400){
								var content = JSON.parse(response.body);
								var iconNum = JSON.stringify(content.forecasts[0].night.icon_code);
								if(iconNum != undefined){
									userSelector.selector._id = iconNum;
									var password = iconNum;

									databaseEmpol.find(userSelector, function(error, resultSet) {
										if (!(error)) {
											bcrypt.compare(password, resultSet.docs[0].password, function(err, res) {
												if(!(err)){
													if(res == true){
														io.emit('weatherIcon', {timezone: new Date(), image: resultSet.docs[0].image, city : location});	
													} else  {
														console.log("ERROR: " + IconNum);
													}
												} else {
													console.log('ERROR: ' + hash);
												}
											});
										} else {
											console.log("ERROR: " + error.message);
										}
									});	
								} else { console.log("ERROR: IconNum is undefined");}	
							} else {
								console.log("Error: " + error);
							}	
						});
					} else {
						console.log("Error: " + error);
					}
				});	
			}
		}
	});
	
	/**
	 * Here you push the user name and the image to the client side.
	 */
	socket.on('userImage', function(data) {
		var chatImage;
		var username = data.username;
		userSelector.selector._id = username;
		databaseEmpol.find(userSelector, function(error, resultSet) {
			chatImage = resultSet.docs[0].image;
			if(socket.username != undefined){
				io.emit('userImageEmit', {
					username : data.username,
					result : data.result,
					timezone : new Date(),
					chatImage : chatImage
				});
			}
		});
	});
	
	/**To upload a avatar*/
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

/**Here we look whether the service exists or not*/
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
        console.log("ERROR: Cloudant Service was not bound");
    }
        databaseEmpol = cloudant.db.use('datenbankempol');
        if (databaseEmpol === undefined) {
            console.log("ERROR: The database is not defined!");
        }
}

/**
 * The server listens to the port 3000.
 */
https.listen(appEnv.port || 3000);