import React from 'react'
import { useRef, useState, useEffect} from 'react';
import { useNavigate } from 'react-router-dom';
import styles from "../styles/videoComponent.module.css"
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

const peerConfigConnections={
    "iceServers":[
        {"urls":"stun:stun.l.google.com:19302"}
    ]
}

export default function VideoMeetComponent() {

    var socketRef=useRef();
    let socketIdref=useRef();

    let localVideoRef=useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);

    let [audioAvailable, setAudioAvailable] = useState(true);

    let [video, setVideo]=useState(false);
    let [audio, setAudio]=useState(false);
    
    let [screen, setScreen]=useState();

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
        try{
            const videoPermission=await navigator.mediaDevices.getUserMedia({video:true});

            if(videoPermission){
                setVideoAvailable(true);
            }else{
                setVideoAvailable(false);
            }

            const audioPermission=await navigator.mediaDevices.getUserMedia({audio:true});

            if(audioPermission){
                setAudioAvailable(true);
            }else{
                setAudioAvailable(false);
            }

            if(navigator.mediaDevices.getDisplayMedia){
                setScreenAvailable(true);
            }
            else{
                setScreenAvailable(false);
            }

            if(videoAvailable || audioAvailable){
                const userMediaStream=await navigator.mediaDevices.getUserMedia({video:videoAvailable,audio:audioAvailable});

                if(userMediaStream){
                    window.localStream=userMediaStream;
                    if(localVideoRef.current){
                        localVideoRef.current.srcObject=userMediaStream;
                    }
                }
            }

        }catch(err){
            console.log(err);
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

        for(let id in connections){
            if(id===socketRef.current.id)continue;

            connections[id].addStream(window.localStream);

            connections[id].createOffer().then((description)=>{
                connections[id].setLocalDescription(description).then(()=>{
                    socketRef.current.emit("signal",id,JSON.stringify({"sdp":connections[id].localDescription}))
                }).catch(e=>console.log(e));
            }).catch(e=>console.log(e))
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

            for(let id in connections){
                connections[id].addStream(window.localStream);
                connections[id].createOffer().then((description)=>{
                    connections[id].setLocalDescription(description).then(()=>{
                        socketRef.current.emit("signal",id,JSON.stringify({"sdp":connections[id].localDescription}))
                    }).catch(e=>console.log(e));
                }).catch(e=>console.log(e))
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
            .then((stream)=>{})
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

    useEffect(()=>{
        if(video !==undefined && audio!==undefined){
            getUserMedia();
        }
    },[audio,video])

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
                    }catch(e){}

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


    let getMedia=()=>{
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    }

    let routeTo=useNavigate();

    let connect=()=>{
        setAskForUsername(false);
        getMedia();
    }


    let handleVideo=()=>{
        setVideo(!video);

    }

    let handleAudio=()=>{
        setAudio(!audio);
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
                connections[id].addStream(window.localStream);
                connections[id].createOffer().then((description)=>{
                    connections[id].setLocalDescription(description)
                    .then(()=>{
                        socketRef.current.emit("signal",id,JSON.stringify({"sdp":connections[id].localDescription}))
                    })
                    .catch(e=>console.log(e));
                }).catch(e=>console.log(e))
            }catch(e){console.log(e);}
        }
        
        stream.getTracks().forEach(track=>track.onended=()=>{
            setScreen(false);

            try{
                
                let tracks=localVideoRef.current.srcObject.getTracks();
                tracks.forEach((track)=>{track.stop()});
            }catch(e){console.log(e);}

            let blackSilenceStream=(...args)=>new MediaStream([black(...args),silence()]);
            window.localStream=blackSilenceStream();
            if(localVideoRef.current){
                localVideoRef.current.srcObject = window.localStream;
            }

           getUserMedia();
        })
    }

    let getDisplayMedia=()=>{
        if(screen){
            if(navigator.mediaDevices.getDisplayMedia){
                navigator.mediaDevices.getDisplayMedia({video:true, audio:true})
                .then((getDisplayMediaSuccess))
                .then((stream)=>{})
                .catch(e=>console.log(e));
            }
        }
    }

    useEffect(()=>{
        if(screen!==undefined){
            getDisplayMedia();
        }
    },[screen])
    
    let handleScreen=()=>{
        setScreen(!screen);
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
        <div>

            {askForUsername===true?
                <div>

                    <h2>Enter into the lobby</h2>
                    <TextField id="outlined-basic" label="Username" value={username} onChange={(e)=>setUsername(e.target.value)} variant="outlined" />
                    <Button variant="contained" onClick={connect}>
                        Connect
                    </Button>

                    <div>
                        <video playsInline ref={localVideoRef} autoPlay muted></video>
                    </div>
                </div>:
                <div className={styles.meetVideoContainer}>

                    {showModal?

                     <div className={styles.chatRoom}>


                        <div className={styles.chatContainer}>
                            <h1>chat</h1>

                            <div className={styles.chattingDisplay}>

                                {messages.length>0?messages.map((item,index)=>{
                                    return(
                                        <div key={index} style={{marginBottom:"20px"}}>
                                            <p style={{fontWeight:"bold"}}>{item.sender}</p>
                                            <p>{item.data}</p>
                                        </div>
                                    )
                                }):<p>No messages yet</p>}

                            </div>

                            <div className={styles.chattingArea}>
                                <TextField value={message} onChange={(e)=>setMessage(e.target.value)} variant="outlined" label="Enter Your Chat"/>
                                <Button variant="contained" onClick={sendMessage}>Send</Button>
                            </div>
                            
                        </div>
                      


                    </div>

                     :<></>}


                    <div className={styles.buttonContainers}>
                    
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

                    <video playsInline className={styles.meetUserVideo} ref={localVideoRef} autoPlay muted></video>
                    <div className={styles.conferenceView}>
                    {videos.map((video)=>(
                        <div key={video.socketId}>
                            <video playsInline
                                data-socket={video.socketId}
                                ref={ref=>{
                                    if(ref && video.stream){    
                                        ref.srcObject=video.stream;
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
