/* eslint-disable react-hooks/set-state-in-effect, react-hooks/immutability */
import { useRef, useState, useEffect} from 'react';
import { useNavigate } from 'react-router-dom';
import "./VideoMeet.css"
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import Button from '@mui/material/Button';
import Badge from '@mui/material/Badge';
import ChatIcon from '@mui/icons-material/Chat';
import io from "socket.io-client";
import server from '../environment';

const server_url=server;

var connections={};
let getPermissionsCalled = false;

const peerConfigConnections={
    "iceServers":[
        {"urls":"stun:stun.l.google.com:19302"}
    ]
}

export default function VideoMeetComponent() {

    var socketRef=useRef();
    let socketIdref=useRef();

    let localVideoRef=useRef();
    const connectingRef = useRef(false);

    let [videoAvailable, setVideoAvailable] = useState(true);

    let [audioAvailable, setAudioAvailable] = useState(true);

    let [video, setVideo]=useState(true);
    let [audio, setAudio]=useState(true);
    
    let [screen, setScreenState] = useState();
    const screenRef = useRef(false);
    const setScreen = (val) => {
        screenRef.current = val;
        setScreenState(val);
    }

    let [showModal, setModal]=useState(false);

    let [screenAvailable, setScreenAvailable]=useState();

    let [messages, setMessages]=useState([]);

    let [message, setMessage]=useState("");

    let [newMessages, setNewMessages]=useState(0);

    let [askForUsername, setAskForUsername]=  useState(true);

    let [username, setUsername]=useState("");

    const videoRef=useRef([]);

    let [videos,setVideos]=useState([]);

    // if(isChrome()===false){

    // }

    const getPermissions=async()=>{
        if (getPermissionsCalled) return;
        getPermissionsCalled = true;

        let hasVideo = false;
        let hasAudio = false;
        let stream = null;

        // Try getting video
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream = videoStream;
            hasVideo = true;
        } catch (vErr) {
            console.log("Video permission denied on mount:", vErr);
        }

        // Wait 500ms before requesting audio to ensure sequential prompt
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try getting audio
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            hasAudio = true;
            if (stream) {
                const audioTrack = audioStream.getAudioTracks()[0];
                stream.addTrack(audioTrack);
            } else {
                stream = audioStream;
            }
        } catch (aErr) {
            console.log("Audio permission denied on mount:", aErr);
        }

        setVideoAvailable(hasVideo);
        setAudioAvailable(hasAudio);

        if (navigator.mediaDevices.getDisplayMedia) {
            setScreenAvailable(true);
        } else {
            setScreenAvailable(false);
        }

        if (stream) {
            window.localStream = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
        }
    }

    useEffect(()=>{
        getPermissions();
        },[])

    useEffect(()=>{
        return ()=>{

            try{
                window.localStream?.getTracks()?.forEach(track=>track.stop());
            }catch(e){
                console.log(e);
            }

            try{
                for(let id in connections){
                    connections[id]?.close();
                }

                socketRef.current?.disconnect();
            }catch(e){
                console.log(e);
            }

        }
    },[])

    let getUserMediaSuccess=(stream)=>{

        try{
            window.localStream.getTracks().forEach(track=>track.stop());

        }catch(e){console.log(e);}

        window.localStream=stream;
        if(localVideoRef.current){
            localVideoRef.current.srcObject = window.localStream;
        }

        // Dynamically replace tracks in existing peer connections
        for(let id in connections){
            if(id===socketRef.current.id)continue;

            const senders = connections[id].getSenders();
            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];

            if (videoTrack) {
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(videoTrack).catch(e => console.log(e));
                } else {
                    try {
                        connections[id].addStream(window.localStream);
                    } catch(err) {
                        console.warn(err);
                    }
                }
            }
            if (audioTrack) {
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                if (audioSender) {
                    audioSender.replaceTrack(audioTrack).catch(e => console.log(e));
                } else {
                    try {
                        connections[id].addStream(window.localStream);
                    } catch(err) {
                        console.warn(err);
                    }
                }
            }
        }

        stream.getTracks().forEach(track=>track.onended=()=>{
            setVideo(false);
            setAudio(false);

            try{
                const stream=localVideoRef.current?.srcObject;
                if(stream){
                    stream.getTracks().forEach(track=>track.stop());
                }
            }catch(e){console.log(e);}

            let blackSilenceStream=(...args)=>new MediaStream([black(...args),silence()]);
            window.localStream=blackSilenceStream();
            if(localVideoRef.current){
                localVideoRef.current.srcObject = window.localStream;
            }

            // Replace tracks with black/silence for existing connections
            for(let id in connections){
                if(id===socketRef.current.id)continue;
                const senders = connections[id].getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(window.localStream.getVideoTracks()[0]).catch(e => console.log(e));
                }
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                if (audioSender) {
                    audioSender.replaceTrack(window.localStream.getAudioTracks()[0]).catch(e => console.log(e));
                }
            }
        })

    }

    let silence=()=>{
        if(!window.audioContext){
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        let oscillator = window.audioContext.createOscillator();

        let dst = oscillator.connect(
            window.audioContext.createMediaStreamDestination()
        );

        oscillator.start();

        if(window.audioContext.state === "suspended"){
            window.audioContext.resume();
        }

        return Object.assign(
            dst.stream.getAudioTracks()[0],
            { enabled:false }
        );
    }

    let black=({width=640,height=480}={})=>{
        let canvas=document.createElement("canvas");

        canvas.width=width;
        canvas.height=height;

        canvas.getContext("2d").fillRect(0,0,width,height);

        let stream=canvas.captureStream();
        return Object.assign(stream.getVideoTracks()[0],{enabled:false});
    }


    let getUserMedia=()=>{
        if((video && videoAvailable) || (audio && audioAvailable)){
            navigator.mediaDevices.getUserMedia({video:video,audio:audio})
            .then(getUserMediaSuccess)
            .then(()=>{})
            .catch((e)=>console.log(e))
        }
        else{
            try{
                let tracks=localVideoRef.current.srcObject.getTracks();
                tracks.forEach((track)=>{track.stop()});
            }catch(e){
                console.log(e);
            }
        }
    }

    useEffect(() => {
        if (window.localStream) {
            window.localStream.getVideoTracks().forEach(track => {
                track.enabled = video;
            });
            window.localStream.getAudioTracks().forEach(track => {
                track.enabled = audio;
            });
        }
    }, [audio, video]);

    let gotMessageFromServer=(fromId,message)=>{

        var signal=JSON.parse(message);

        if(fromId!==socketRef.current.id){

            if(!connections[fromId]){
                    console.warn("Connection not found:", fromId);
                    return;
            }

            if(signal.sdp){
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(()=>{

                    if(signal.sdp.type==="offer"){

                        connections[fromId].createAnswer().then((description)=>{
                            connections[fromId].setLocalDescription(description).then(()=>{
                                socketRef.current.emit("signal",fromId,JSON.stringify({"sdp":connections[fromId].localDescription}))
                            }).catch(e=>console.log(e));
                        }).catch(e=>console.log(e))
                    }
                }).catch(e=>console.log(e));
            }

            if(signal.ice){

                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e=>console.log(e));
            }
        }

    }

    let addMessage=(data,sender,socketIdSender)=>{

        setMessages((prevMessages)=>{
            return [...prevMessages,
            {sender:sender,data:data}]
        });
        
        if(socketIdSender!==socketRef.current.id){
            setNewMessages((prevCount)=>prevCount+1);
        }
    }

    let connectToSocketServer=()=>{
         console.log("CONNECT TO SOCKET CALLED");
        socketRef.current=io.connect(server_url,{secure:false});

        socketRef.current.on('signal',gotMessageFromServer);

        socketRef.current.on("chat-message",addMessage);

        socketRef.current.on("user-left",(id)=>{

            if(connections[id]){
                connections[id].close();
                delete connections[id];
            }

            setVideos((videos)=>{
                return videos.filter((video)=>video.socketId!==id);
            });
        });

        socketRef.current.on("user-joined",(id,clients)=>{
            clients.forEach((socketListId)=>{

                if(connections[socketListId]){
                    return;
                }

                connections[socketListId]=new RTCPeerConnection(peerConfigConnections);

                connections[socketListId].onicecandidate=(event)=>{

                    if(event.candidate!==null){
                        socketRef.current.emit(
                            "signal",
                            socketListId,
                            JSON.stringify({"ice":event.candidate})
                        );
                    }
                }

                connections[socketListId].onaddstream=(event)=>{

                    let videoExists=videoRef.current.find(
                        video=>video.socketId===socketListId
                    );

                    if(videoExists){

                        setVideos((videos)=>{
                            const updatedVideos=videos.map(video=>(
                                video.socketId===socketListId
                                    ? {...video,stream:event.stream}
                                    : video
                            ));

                                videoRef.current=updatedVideos;
                                return updatedVideos;
                            });

                    }else{

                        let newVideo={
                            socketId:socketListId,
                            stream:event.stream,
                            autoPlay:true,
                            playsInline:true
                        };

                        setVideos((videos)=>{
                            const updatedVideos=[...videos,newVideo];

                            videoRef.current=updatedVideos;
                            return updatedVideos;
                        });
                    }
                };

                if(window.localStream){
                    connections[socketListId].addStream(window.localStream);
                }else{
                    let blackSilenceStream=(...args)=>
                        new MediaStream([black(...args),silence()]);

                    window.localStream=blackSilenceStream();

                    connections[socketListId].addStream(window.localStream);
                }
            });

            if(id===socketRef.current.id){

                for(let id2 in connections){

                    if(id2===socketRef.current.id) continue;

                    try{
                        connections[id2].addStream(window.localStream);
                    }catch(err){
                        console.warn(err);
                    }

                    connections[id2]
                        .createOffer()
                        .then((description)=>{
                            connections[id2]
                                .setLocalDescription(description)
                                .then(()=>{
                                    socketRef.current.emit(
                                        "signal",
                                        id2,
                                        JSON.stringify({
                                            "sdp":connections[id2].localDescription
                                        })
                                    );
                                })
                                .catch(e=>console.log(e));
                        });
                }
            }
        });

        socketRef.current.on("connect",()=>{

            socketRef.current.emit(
                "join-call",
                window.location.href
            );

            socketIdref.current=socketRef.current.id;
        });
    }


    let routeTo=useNavigate();

    let connect=async()=>{
        if (connectingRef.current) return;
        if(!username.trim()){
            alert("Please enter a username.");
            return;
        }

        connectingRef.current = true;
        try {
            let hasVideo = videoAvailable;
            let hasAudio = audioAvailable;
            let localStreamInstance = window.localStream;

            let videoStream = null;
            let audioStream = null;

            // If they don't have both permissions, warn them that both are required and prompt sequentially
            if (!hasVideo || !hasAudio) {
                alert("Both Camera and Microphone permissions are required to join the meeting. You will be prompted for each sequentially. Please allow both.");

                if (!hasVideo) {
                    try {
                        videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                        hasVideo = true;
                    } catch (err) {
                        console.warn("Video permission check failed on connect:", err);
                        hasVideo = false;
                    }
                }

                // Wait 500ms before requesting audio to ensure sequential prompt
                if (!hasVideo || !hasAudio) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                if (!hasAudio) {
                    try {
                        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        hasAudio = true;
                    } catch (err) {
                        console.warn("Audio permission check failed on connect:", err);
                        hasAudio = false;
                    }
                }
            }

            // Final verification check
            if (!hasVideo || !hasAudio) {
                if (videoStream) {
                    videoStream.getTracks().forEach(track => track.stop());
                }
                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                }
                alert("Permission denied. You must allow access to both your camera and microphone to join the meeting. If permissions are blocked in your browser settings, please click the site settings icon in the address bar to reset them.");
                return; // Block joining
            }

            // Combine streams if new permissions were granted
            if (videoStream || audioStream) {
                let tracks = [];
                if (videoStream) {
                    tracks.push(videoStream.getVideoTracks()[0]);
                } else if (localStreamInstance) {
                    const existingVideoTrack = localStreamInstance.getVideoTracks()[0];
                    if (existingVideoTrack) tracks.push(existingVideoTrack);
                }

                if (audioStream) {
                    tracks.push(audioStream.getAudioTracks()[0]);
                } else if (localStreamInstance) {
                    const existingAudioTrack = localStreamInstance.getAudioTracks()[0];
                    if (existingAudioTrack) tracks.push(existingAudioTrack);
                }

                if (localStreamInstance) {
                    localStreamInstance.getTracks().forEach(track => track.stop());
                }
                localStreamInstance = new MediaStream(tracks);
            }

            setVideoAvailable(true);
            setAudioAvailable(true);
            window.localStream = localStreamInstance;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStreamInstance;
            }

            // Set video and audio OFF by default when they enter the meeting
            setVideo(false);
            setAudio(false);
            if (window.localStream) {
                window.localStream.getVideoTracks().forEach(track => {
                    track.enabled = false;
                });
                window.localStream.getAudioTracks().forEach(track => {
                    track.enabled = false;
                });
            }

            setAskForUsername(false);
            connectToSocketServer();
        } finally {
            connectingRef.current = false;
        }
    }


    let handleVideo=()=>{
        setVideo(!video);

    }

    let handleAudio=()=>{
        setAudio(!audio);
    }

    let stopScreenShareAndRestore = () => {
        setScreen(false);

        try {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop());
            }
        } catch (e) {
            console.log(e);
        }

        let blackSilenceStream = (...args) => new MediaStream([black(...args), silence()]);
        window.localStream = blackSilenceStream();
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = window.localStream;
        }

        // Replace tracks with black/silence for existing connections
        for (let id in connections) {
            if (id === socketRef.current.id) continue;
            try {
                const senders = connections[id].getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(window.localStream.getVideoTracks()[0]).catch(e => console.log(e));
                }
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                if (audioSender) {
                    audioSender.replaceTrack(window.localStream.getAudioTracks()[0]).catch(e => console.log(e));
                }
            } catch (e) {
                console.log(e);
            }
        }

        getUserMedia();
    }

    let getDisplayMediaSuccess=(stream)=>{
        try{
            window.localStream.getTracks().forEach(track=>track.stop());
        }catch(e){console.log(e);}

        window.localStream=stream;
        if(localVideoRef.current){
            localVideoRef.current.srcObject = window.localStream;
        }

        for(let id in connections){
            if(id===socketRef.current.id)continue;
            try{
                const senders = connections[id].getSenders();
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(videoTrack).catch(e => console.log(e));
                    } else {
                        connections[id].addStream(window.localStream);
                    }
                }
            }catch(e){console.log(e);}
        }
        
        stream.getTracks().forEach(track=>track.onended=()=>{
            if (screenRef.current) {
                stopScreenShareAndRestore();
            }
        })
    }

    let getDisplayMedia=()=>{
        if(screen){
            if(navigator.mediaDevices.getDisplayMedia){
                navigator.mediaDevices.getDisplayMedia({video:true, audio:true})
                .then((getDisplayMediaSuccess))
                .then(()=>{})
                .catch(e=>{
                    console.log(e);
                    setScreen(false);
                });
            }
        }
    }

    useEffect(()=>{
        if(screen!==undefined){
            getDisplayMedia();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    },[screen])
    
    let handleScreen=()=>{
        if (screen) {
            stopScreenShareAndRestore();
        } else {
            setScreen(true);
        }
    }

    let sendMessage=()=>{

        if(!socketRef.current) return;

        socketRef.current.emit("chat-message",message,username);
        setMessage("");
    }

    let handleEndCall=()=>{
        try{
            const stream=localVideoRef.current?.srcObject;

            if(stream){
                stream.getTracks().forEach(track=>track.stop());
            }
        }catch(e){
            console.log(e);
        }

        socketRef.current?.disconnect();

        routeTo("/home");
}

    return (
        <div className="meetMainPage">

            {askForUsername===true?
                <div className="lobbyContainer">

                    <h2>Enter into the lobby</h2>
                    <TextField id="outlined-basic" label="Username" value={username} onChange={(e)=>setUsername(e.target.value)} variant="outlined" />
                    <Button variant="contained" onClick={connect}>
                        Connect
                    </Button>

                    <div className="lobbyVideoContainer">
                        <video 
                            playsInline 
                            ref={ref => {
                                localVideoRef.current = ref;
                                if (ref && window.localStream) {
                                    if (ref.srcObject !== window.localStream) {
                                        ref.srcObject = window.localStream;
                                    }
                                }
                            }} 
                            autoPlay 
                            muted>
                        </video>
                    </div>
                </div>:
                <div className="meetVideoContainer">

                    {showModal?

                     <div className="chatRoom">


                        <div className="chatContainer">
                            <h1>chat</h1>

                            <div className="chattingDisplay">

                                {messages.length>0?messages.map((item,index)=>{
                                    return(
                                        <div key={index} style={{marginBottom:"20px"}}>
                                            <p style={{fontWeight:"bold"}}>{item.sender}</p>
                                            <p>{item.data}</p>
                                        </div>
                                    )
                                }):<p>No messages yet</p>}

                            </div>

                            <div className="chattingArea">
                                <TextField value={message} onChange={(e)=>setMessage(e.target.value)} variant="outlined" label="Enter Your Chat"/>
                                <Button variant="contained" onClick={sendMessage}>Send</Button>
                            </div>
                            
                        </div>
                      


                    </div>

                     :<></>}


                    <div className="buttonContainers">
                    
                        <IconButton style={{color:"white"}} onClick={handleVideo}>
                            {(video===true)?<VideocamIcon/>:<VideocamOffIcon/>}
                        </IconButton>

                        <IconButton style={{color:"red"}} onClick={handleEndCall}>
                            <CallEndIcon/>
                        </IconButton>

                        <IconButton style={{color:"white"}} onClick={handleAudio}>
                            {(audio===true)?<MicIcon/>:<MicOffIcon/>}
                        </IconButton>

                        {screenAvailable===true?
                        <IconButton style={{color:"white"}} onClick={handleScreen}>
                            {screen===true?<StopScreenShareIcon/>:<ScreenShareIcon/>}
                        </IconButton>
                        :<></>}

                        <Badge badgeContent={newMessages} max={999} color="secondary">
                            <IconButton onClick={()=>{
                                setModal(!showModal);
                                setNewMessages(0);
                            }} style={{color:"white"}}>
                                <ChatIcon/>
                            </IconButton>
                        </Badge>
                    </div>

                    <video 
                        playsInline 
                        className="meetUserVideo" 
                        ref={ref => {
                            localVideoRef.current = ref;
                            if (ref && window.localStream) {
                                if (ref.srcObject !== window.localStream) {
                                    ref.srcObject = window.localStream;
                                }
                            }
                        }} 
                        autoPlay 
                        muted>
                    </video>
                    <div className="conferenceView">
                    {videos.map((video)=>(
                        <div key={video.socketId} className="remoteVideoContainer">
                            <video playsInline
                                data-socket={video.socketId}
                                ref={ref=>{
                                    if(ref && video.stream){    
                                        if (ref.srcObject !== video.stream) {
                                            ref.srcObject = video.stream;
                                        }
                                    }
                                }}
                                autoPlay>
                            </video>
                        </div>
                        ))}
                    </div>
                </div>
            }

        </div>
    )
}
