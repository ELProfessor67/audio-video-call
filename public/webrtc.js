
var myusername;
var peerusername;
var socket = io();
var pc;
var localStream;
var remoteCandidates = [];
var sendChannel;
var receiveChannel;
let callingModal;
let callStatus = null;
let callerDetails = null;
let timerRef = null;

$(document).ready(function(){
	if(!isWebrtcSupported()) {
		alert("No WebRTC support... ");
		return;
	}
    callingModal = new bootstrap.Modal($("#callingModal"), {
        backdrop: 'static', 
        keyboard: false    
    });


});


socket.on('register succeed', function(msg){
	myusername = msg["name"];
	console.log("Successfully registered as " + myusername + "!");
});

socket.on('register failed', function(msg){
	console.log("register failed: " + msg.info);
})

socket.on('new user', function(data){
	console.log("new user " + data.name);	
});

socket.on('user leave', function(data){
	console.log(data.name + " left");	
});

socket.on('chat message', function(data){
	//dispatch signal messages to corresponding functions, ie , 
	//onRemoteOffer/ onRemoteAnswer/onRemoteIceCandidate
	//IS this message to me ?
	if(data.to != myusername){
		return;
	}
	//
	if(data.type == 'signal'){
		onSignalMessage(data);
	}else if(data.type == 'text'){
		console.log('received text message from ' + data.from + ', content: ' + data.content);
	}else{
		console.log('received unknown message type ' + data.type + ' from ' + data.from);
	}
});

socket.on('connect', function(){
	console.log("server connected");
});

function isWebrtcSupported() {
	return window.RTCPeerConnection !== undefined && window.RTCPeerConnection !== null;
};

function sendData() {
  const data = $('#datasend').val();
  sendChannel.send(data);
  console.log('Sent Data: ' + data);
  $('#datasend').val('');
}

function registerUsername(username) {
	var info = { "name": username };
	socket.emit("register", info);
	console.log("trying to register as " + username);
}



function createPc(type){
	

	var configuration = { "iceServers": [{ "urls": "stun:stun.ideasip.com" }] };
	pc = new RTCPeerConnection(configuration);
	console.log('Created local peer connection object pc');
	
	sendChannel = pc.createDataChannel("sendchannel");
	sendChannel.onopen = onSendChannelStateChange;
  	sendChannel.onclose = onSendChannelStateChange;

	pc.onicecandidate = function(e) {
		onIceCandidate(pc, e);
	};

	pc.oniceconnectionstatechange = function(e) {
		onIceStateChange(pc, e);
	};

	pc.ondatachannel = receiveChannelCallback;
	pc.ontrack  = (e) => gotRemoteTrack(e, type);
	console.log('localStream',localStream);
	pc.addStream(localStream);
	console.log('Added local stream to pc');
}

async function doCall(username,type='audio',name,profile) {
	try {
		if(type == 'audio'){
			localStream = await navigator.mediaDevices.getUserMedia({audio: true})
		}else{
			localStream = await navigator.mediaDevices.getUserMedia({audio: true,video: true})
		}
	} catch (error) {
		alert("We need access to media devices to make a call.");
		return;
	}

	if(type == 'video'){
		$("#videoElement").removeClass("hide");
		$("#videoElement").get(0).srcObject = localStream;
		$("#videoElement").get(0).muted = true;
	}

	// Call this user
	peerusername = username;
	
	createPc(type);

	var offerOptions = {
	  offerToReceiveAudio: 0,
	  offerToReceiveVideo: 1,
	  voiceActivityDetection: false
	};

	pc.createOffer(
		offerOptions
	).then(
		(desc) => onCreateOfferSuccess(desc,type,name,profile),
		onCreateSessionDescriptionError
	);
}

function onCreateSessionDescriptionError(error) {
	console.log('Failed to create session description: ' + error.toString());
	alert("WebRTC error... " + fJSON.stringiy(error));
}

function onCreateOfferSuccess(desc,callType,name,profile) {
	  console.log('Offer from pc\n' + desc.sdp);
	  console.log('pc setLocalDescription start');
	  pc.setLocalDescription(desc).then(
		  function() {
		      onSetLocalSuccess(pc);
		  },
		  onSetSessionDescriptionError
	  );

	//Send offer to remote side
	var message = {from: myusername, to:peerusername, type: 'signal', subtype: 'offer', content: desc, time:new Date(),callType:callType,user: {name,profile}};
	socket.emit('chat message', message);
    callStatus = "ringing...";
    $("#callStatus").removeClass('hide').text("Ringing...");
   	$("#endCallBtn").removeClass('hide').on('click', doHangup);
	$("#callingModalLabel").text(name);
	$("#userImageAvatar").get(0).src = profile;
	callingModal.show();
}

function onSetLocalSuccess(pc) {
	console.log(' setLocalDescription complete');
}

function onSetRemoteSuccess(pc) {
	console.log(' setRemoteDescription complete');
	applyRemoteCandidates();
}

function onSetSessionDescriptionError(error) {
	console.log('Failed to set session description: ' + error.toString());
}

function gotRemoteTrack(e,type) {
	console.log('track', e.streams[0]);
	if(type == "video"){
		$("#videoElement").removeClass("hide");
	}
	$("#videoElement").get(0).srcObject = e.streams[0];
	$("#videoElement").get(0).muted = false;
}


function onSignalMessage(m){
	if(m.subtype == 'offer'){
		console.log('got remote offer from ' + m.from + ', content ' + m.content);
		onSignalOffer(m);
	}else if(m.subtype == 'answer'){
		onSignalAnswer(m.content);
	}else if(m.subtype == 'candidate'){
		onSignalCandidate(m.content);
	}else if(m.subtype == 'close'){
		onSignalClose();
	}else{
		console.log('unknown signal type ' + m.subtype);
	}
}


function AnswerCall () {
   
    msg = callerDetails
	var callType = msg["callType"];
    peerusername = msg["from"];
	let videoPromose;
	if(callType == 'audio'){
		videoPromose = navigator.mediaDevices.getUserMedia({audio: true})
	}else{
		videoPromose = navigator.mediaDevices.getUserMedia({audio: true,video: true});
	}

	videoPromose.then(stream => {
		localStream = stream;

		createPc(callType);
		var Offer = msg["content"];
    	$("#answerCallBtn").addClass('hide').off('click', AnswerCall);
    	$("#timerContainer").removeClass("hide");
    	$("#callStatus").addClass('hide');
    	startTimer();
		callStatus = "processing"
		console.log('on remoteOffer :'+ Offer.sdp);
		pc.setRemoteDescription(Offer).then(function(){
			onSetRemoteSuccess(pc)}, onSetSessionDescriptionError
		);
		pc.createAnswer().then(
			onCreateAnswerSuccess,
			onCreateSessionDescriptionError
		);
	}).catch(err => {
		alert("We need access to media devices to make a call.");
	});				
}







			

function onSignalOffer(msg){

	console.log("Incoming call from " + msg["from"] + "!");
	
    callerDetails = msg;
	callStatus = "incoming"
	peerusername = msg["from"];
	
	
    $("#answerCallBtn").removeClass('hide').on('click', AnswerCall);
    $("#endCallBtn").removeClass('hide').on('click', doHangup);
    $("#callStatus").removeClass('hide').text('Incoming...');

	console.log(msg)
	$("#callingModalLabel").text(msg["user"]["name"]);
	$("#userImageAvatar").get(0).src = msg["user"]["profile"];

    callingModal.show();
}

function onSignalCandidate(candidate){
	onRemoteIceCandidate(candidate);
}

function onSignalAnswer(answer){
	
	$("#callStatus").addClass("hide");
	$("#timerContainer").removeClass("hide");
	callStatus = "processing";
    startTimer();
	onRemoteAnswer(answer);
}
	
function onSignalClose(){
  	console.log('Call end ');
	pc.close();
	pc = null;
	
	peerusername = null;
	$("#videoElement").addClass("hide");
	$("#endCallBtn").addClass("hide");
	$("#answerCallBtn").addClass("hide");
	$("#closeModal").removeClass("hide").on('click',closeModal);
	$("#callStatus").text("Call Ended");
	clearInterval(timerRef);
}

function onRemoteAnswer(answer){
	console.log('onRemoteAnswer : ' + answer);
	pc.setRemoteDescription(answer).then(function(){onSetRemoteSuccess(pc)}, onSetSessionDescriptionError);
	$('#call').removeAttr('disabled').html('Hangup')
		.removeClass("btn-success").addClass("btn-danger")
		.unbind('click').click(doHangup);
}


function onRemoteIceCandidate(candidate){
	console.log('onRemoteIceCandidate : ' + candidate);
	if(pc){
		addRemoteCandidate(candidate);
	}else{
		remoteCandidates.push(candidate);
	}
}

function applyRemoteCandidates(){
	for(var candidate in remoteCandidates){
		addRemoteCandidate(candidate);
	}
	remoteCandidates = [];
}

function addRemoteCandidate(candidate){
	pc.addIceCandidate(candidate).then(
      function() {
        onAddIceCandidateSuccess(pc);
      },
      function(err) {
        onAddIceCandidateError(pc, err);
      });
}


function onCreateAnswerSuccess(desc) {
	console.log('onCreateAnswerSuccess');

	pc.setLocalDescription(desc).then(
		function() {
			onSetLocalSuccess(pc);
		},
		onSetSessionDescriptionError
	);

	//Sent answer to remote side
  	var message = {from: myusername, to:peerusername, type: 'signal', subtype: 'answer', content: desc, time:new Date()};
	socket.emit('chat message', message);
}


function onIceCandidate(pc, event) {
  if (event.candidate) {
    	console.log( ' ICE candidate: \n' + event.candidate.candidate);
    
    	//Send candidate to remote side
    	var message = {from: myusername, to:peerusername, type: 'signal', subtype: 'candidate', content: event.candidate, time:new Date()};
	socket.emit('chat message', message);
  }
}

function onAddIceCandidateSuccess(pc) {
	console.log( ' addIceCandidate success');
}

function onAddIceCandidateError(pc, error) {
	console.log( ' failed to add ICE Candidate: ' + error.toString());
}

function onIceStateChange(pc, event) {
  if (pc) {
    console.log( ' ICE state: ' + pc.iceConnectionState);
    console.log('ICE state change event: ', event);
  }
}


function onSendChannelStateChange() {
  const readyState = sendChannel.readyState;
  console.log('Send channel state is: ' + readyState);
  if (readyState === 'open') {
  	$('#datasend').removeAttr('disabled');
  } else {
  	$('#datasend').attr('disabled', true);
  }
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = onReceiveMessageCallback;
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onclose = onReceiveChannelStateChange;
}

function onReceiveMessageCallback(event) {
  console.log('Received Message');
  $('#datarecv').val(event.data);
}

function onReceiveChannelStateChange() {
  const readyState = receiveChannel.readyState;
  console.log(`Receive channel state is: ${readyState}`);
}


function closeModal(){
	callingModal.hide();
}

function doHangup() {
	console.log('Hangup call');
	if(sendChannel?.close) sendChannel.close();	
	if(receiveChannel?.close) receiveChannel.close();

	if(pc?.close) pc.close();
	pc = null;

	$("#videoElement").addClass("hide");
	$("#endCallBtn").addClass("hide");
	$("#answerCallBtn").addClass("hide");
	$("#closeModal").removeClass("hide").on('click',closeModal);
	$("#callStatus").text("Call Ended");
	clearInterval(timerRef);
  	//Send signal to remote side
    	var message = {from: myusername, to:peerusername, type: 'signal', subtype: 'close', content: 'close', time:new Date()};
	socket.emit('chat message', message);

	peerusername = null;
	
}

function startTimer() {
    let seconds = 0;
    let minutes = 0;

    // Update the timer every second
    timerRef = setInterval(function() {
        seconds++;

        if (seconds === 60) {
            seconds = 0;
            minutes++;
        }

        // Format minutes and seconds as "MM:SS"
        let formattedTime = `${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
        $("#timer").text(formattedTime);
    }, 1000);
}

const promt = window.prompt("Enter your ID manually for now. After implementation, it will be dynamically retrieved from the logged-in user. Example: user5 (must contain both numbers and characters)");
registerUsername(promt)