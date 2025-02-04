var express = require('express');
var app = express();
var http = require('http').Server(app);
var users = {};
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.use(express.static(__dirname + '/public'));

function findUserByUID(uid){
  return users[uid];
}

function censor(key, value) {
  if (key == 'socketid') {
    return undefined;
  }
  return value;
}

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});





io.on('connection', function(socket){
  console.log('a user connected');
  
  socket.on('disconnect', function(){
    console.log('user disconnected');
    if(socket.uuid){
    	var usr = findUserByUID(socket.uuid);
    	delete users[socket.uuid];
    	socket.broadcast.emit('user leave', {id: usr.id, name:usr.name});
    }
  });
  
  socket.on('chat message', function(msg){
  
    if(msg.to == 'all'){
      socket.broadcast.emit('chat message', msg);
    }else{
      var target = findUserByUID(msg.to);
      if(target){
        socket.broadcast.to(target.socketid).emit('chat message', msg);
        //socket_to.emit("chat message", msg);
      }else{
        socket.broadcast.emit("chat message", msg);
      }
    }
  });
  
  socket.on('register', function(info){
	console.log("register request: " + info.name);
	if(findUserByUID(info.name) == null){
		var usr = {id: info.name, name: info.name, socketid: socket.id};
		users[info.name] = usr;
		socket.emit('register succeed', {id: info.name, name: info.name});
		socket.broadcast.emit('new user', {id: info.name, name: info.name});
		socket.uuid = info.name;
	}else{
		socket.emit('register failed', {info: "name exist"});
	}
  
  });
  
});


http.listen(3000, function(){
  console.log('listening on http://localhost:3000');
});

