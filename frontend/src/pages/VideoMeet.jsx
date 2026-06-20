/* eslint-disable react-hooks/set-state-in-effect */
import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import "./VideoMeet.css";
import TextField   from '@mui/material/TextField';
import IconButton  from '@mui/material/IconButton';
import VideocamIcon        from '@mui/icons-material/Videocam';
import VideocamOffIcon     from '@mui/icons-material/VideocamOff';
import MicIcon             from '@mui/icons-material/Mic';
import MicOffIcon          from '@mui/icons-material/MicOff';
import CallEndIcon         from '@mui/icons-material/CallEnd';
import ScreenShareIcon     from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import Button  from '@mui/material/Button';
import Badge   from '@mui/material/Badge';
import ChatIcon from '@mui/icons-material/Chat';
import io from "socket.io-client";
import server from '../environment';

const server_url = server;

const peerConfigConnections = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
    ]
};

// ── Pure helpers (no React deps) ─────────────────────────────────────────────

function makeSilentTrack() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const dst = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        osc.connect(dst);
        osc.start();
        const track = dst.stream.getAudioTracks()[0];
        track.enabled = false;
        return track;
    } catch {
        return null;
    }
}

function makeBlackTrack({ width = 640, height = 480 } = {}) {
    try {
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d").fillRect(0, 0, width, height);
        const track = canvas.captureStream().getVideoTracks()[0];
        track.enabled = false;
        return track;
    } catch {
        return null;
    }
}

/** Placeholder stream used when user hasn't granted camera/mic yet */
function makeBlackSilenceStream() {
    const tracks = [];
    const v = makeBlackTrack();
    const a = makeSilentTrack();
    if (v) tracks.push(v);
    if (a) tracks.push(a);
    return new MediaStream(tracks);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function VideoMeetComponent() {

    // ── Refs ──────────────────────────────────────────────────────────────────
    const socketRef        = useRef(null);
    const localVideoRef    = useRef(null);
    const connectingRef    = useRef(false);
    const videoRef         = useRef([]);
    const connectionsRef   = useRef({});         // { socketId → RTCPeerConnection }
    const iceCandidateQRef = useRef({});         // { socketId → RTCIceCandidateInit[] }
    const localStreamRef   = useRef(null);       // user's camera+mic stream (may be null)
    const screenActiveRef  = useRef(false);

    // ── State ─────────────────────────────────────────────────────────────────
    const [video,           setVideo]           = useState(false);
    const [audio,           setAudio]           = useState(false);
    const [screen,          setScreenUI]        = useState(false);
    const [screenAvailable, setScreenAvailable] = useState(false);
    const [showModal,       setModal]           = useState(false);
    const [messages,        setMessages]        = useState([]);
    const [message,         setMessage]         = useState("");
    const [newMessages,     setNewMessages]     = useState(0);
    const [askForUsername,  setAskForUsername]  = useState(true);
    const [username,        setUsername]        = useState("");
    const [videos,          setVideos]          = useState([]);

    const routeTo = useNavigate();

    // ── 1. On mount: detect available devices, no permissions requested ────────
    useEffect(() => {
        // Check if screen sharing API is available (no permission needed)
        setScreenAvailable(!!navigator.mediaDevices?.getDisplayMedia);

        // Cleanup on unmount
        return () => {
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
            Object.values(connectionsRef.current).forEach(pc => {
                try { pc.close(); } catch { /* ignored */ }
            });
            connectionsRef.current   = {};
            iceCandidateQRef.current = {};
            socketRef.current?.disconnect();
            socketRef.current = null;
        };
    }, []);

    // ── 2. WebRTC: handle incoming signal ────────────────────────────────────
    const gotMessageFromServer = useCallback((fromId, rawMsg) => {
        const signal = JSON.parse(rawMsg);
        if (fromId === socketRef.current?.id) return;

        const pc = connectionsRef.current[fromId];
        if (!pc) {
            console.warn("[signal] no RTCPeerConnection for", fromId);
            return;
        }

        if (signal.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => {
                    const queued = iceCandidateQRef.current[fromId] || [];
                    queued.forEach(c =>
                        pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn)
                    );
                    delete iceCandidateQRef.current[fromId];

                    if (signal.sdp.type === "offer") {
                        return pc.createAnswer()
                            .then(ans => pc.setLocalDescription(ans))
                            .then(() => {
                                socketRef.current?.emit("signal", fromId,
                                    JSON.stringify({ sdp: pc.localDescription }));
                            });
                    }
                })
                .catch(e => console.warn("[SDP]", e));
        }

        if (signal.ice) {
            if (pc.remoteDescription?.type) {
                pc.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(console.warn);
            } else {
                if (!iceCandidateQRef.current[fromId]) iceCandidateQRef.current[fromId] = [];
                iceCandidateQRef.current[fromId].push(signal.ice);
            }
        }
    }, []);

    // ── 3. WebRTC: create peer connection ────────────────────────────────────
    const createPeerConnection = useCallback((remoteId) => {
        const pc = new RTCPeerConnection(peerConfigConnections);

        pc.onconnectionstatechange = () =>
            console.log(`[RTC] ${remoteId} → ${pc.connectionState}`);
        pc.oniceconnectionstatechange = () =>
            console.log(`[ICE] ${remoteId} → ${pc.iceConnectionState}`);

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socketRef.current?.emit("signal", remoteId,
                    JSON.stringify({ ice: candidate }));
            }
        };

        pc.ontrack = ({ streams, track }) => {
            const remoteStream = (streams && streams[0]) || new MediaStream([track]);
            console.log("[ontrack]", remoteId, track.kind);
            setVideos(prev => {
                const exists = prev.find(v => v.socketId === remoteId);
                const updated = exists
                    ? prev.map(v => v.socketId === remoteId ? { ...v, stream: remoteStream } : v)
                    : [...prev, { socketId: remoteId, stream: remoteStream }];
                videoRef.current = updated;
                return updated;
            });
        };

        // Always add tracks (real ones if available, black/silence otherwise)
        // so the SDP negotiation includes both audio and video from the start.
        const stream = localStreamRef.current || makeBlackSilenceStream();
        if (!localStreamRef.current) localStreamRef.current = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        connectionsRef.current[remoteId] = pc;
        return pc;
    }, []);

    // ── 4. Socket server ─────────────────────────────────────────────────────
    const connectToSocketServer = useCallback(() => {
        const socket = io(server_url, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 15,
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            console.log("[socket] connected:", socket.id);
            socket.emit("join-call", window.location.pathname);
        });

        socket.on("connect_error", err => console.warn("[socket] error:", err.message));
        socket.on("signal", gotMessageFromServer);

        socket.on("chat-message", (data, sender, senderSocketId) => {
            setMessages(prev => [...prev, { sender, data }]);
            if (senderSocketId !== socket.id) setNewMessages(n => n + 1);
        });

        socket.on("user-left", id => {
            connectionsRef.current[id]?.close();
            delete connectionsRef.current[id];
            delete iceCandidateQRef.current[id];
            setVideos(prev => {
                const updated = prev.filter(v => v.socketId !== id);
                videoRef.current = updated;
                return updated;
            });
        });

        socket.on("user-joined", (id, clients) => {
            console.log("[socket] user-joined:", id, "clients:", clients);

            clients.forEach(remoteId => {
                if (remoteId === socket.id) return;
                if (connectionsRef.current[remoteId]) return;
                createPeerConnection(remoteId);
            });

            if (id === socket.id) {
                Object.entries(connectionsRef.current).forEach(([remoteId, pc]) => {
                    pc.createOffer()
                        .then(offer => pc.setLocalDescription(offer))
                        .then(() => {
                            socket.emit("signal", remoteId,
                                JSON.stringify({ sdp: pc.localDescription }));
                        })
                        .catch(e => console.warn("[offer]", e));
                });
            }
        });
    }, [gotMessageFromServer, createPeerConnection]);

    // ── 5. Join meeting ───────────────────────────────────────────────────────
    // User can join WITHOUT giving camera/mic permissions.
    // video and audio start as OFF (false). Permissions asked only when toggled ON.
    const connect = async () => {
        if (connectingRef.current) return;
        if (!username.trim()) { alert("Please enter a username."); return; }

        connectingRef.current = true;
        try {
            // Join with a black/silence placeholder so WebRTC negotiation works
            // even before the user grants camera/mic permissions.
            if (!localStreamRef.current) {
                localStreamRef.current = makeBlackSilenceStream();
            }

            // Ensure video & audio are OFF when entering the meeting
            setVideo(false);
            setAudio(false);
            localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = false; });
            localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
            }

            setAskForUsername(false);
            connectToSocketServer();
        } finally {
            connectingRef.current = false;
        }
    };

    // ── 6. Toggle video (lazy permission request) ─────────────────────────────
    const handleVideo = useCallback(async () => {
        if (video) {
            // ── Turn OFF: just disable the track ──────────────────────────────
            localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = false; });
            setVideo(false);
        } else {
            // ── Turn ON: request camera permission if we don't have a real track
            const existingTrack = localStreamRef.current?.getVideoTracks()
                .find(t => !t.ended && t.label && !t.label.startsWith('canvas'));

            if (existingTrack) {
                // We already have a real camera track — just re-enable it
                existingTrack.enabled = true;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = localStreamRef.current;
                    localVideoRef.current.play().catch(() => {});
                }
                setVideo(true);
            } else {
                // Request camera permission now
                try {
                    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    const newVideoTrack = camStream.getVideoTracks()[0];

                    // Remove old (placeholder) video tracks and add the real one
                    const currentStream = localStreamRef.current;
                    if (currentStream) {
                        currentStream.getVideoTracks().forEach(t => {
                            t.stop();
                            currentStream.removeTrack(t);
                        });
                        currentStream.addTrack(newVideoTrack);
                    } else {
                        localStreamRef.current = new MediaStream([newVideoTrack]);
                    }

                    // Show in local preview
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = localStreamRef.current;
                        localVideoRef.current.play().catch(() => {});
                    }

                    // Replace the video sender in every active peer connection
                    Object.values(connectionsRef.current).forEach(pc => {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) {
                            sender.replaceTrack(newVideoTrack).catch(console.warn);
                        } else {
                            pc.addTrack(newVideoTrack, localStreamRef.current);
                        }
                    });

                    setVideo(true);
                } catch (err) {
                    console.warn("Camera permission denied:", err);
                    alert("Camera access was denied. Please allow camera permissions in your browser settings and try again.");
                }
            }
        }
    }, [video]);

    // ── 7. Toggle audio (lazy permission request) ─────────────────────────────
    const handleAudio = useCallback(async () => {
        if (audio) {
            // ── Turn OFF: disable the track ───────────────────────────────────
            localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
            setAudio(false);
        } else {
            // ── Turn ON: request mic permission if we don't have a real track ─
            const existingTrack = localStreamRef.current?.getAudioTracks()
                .find(t => !t.ended && t.label && !t.label.toLowerCase().includes('silence'));

            if (existingTrack) {
                existingTrack.enabled = true;
                setAudio(true);
            } else {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const newAudioTrack = micStream.getAudioTracks()[0];

                    // Remove old (placeholder) audio tracks and add the real one
                    const currentStream = localStreamRef.current;
                    if (currentStream) {
                        currentStream.getAudioTracks().forEach(t => {
                            t.stop();
                            currentStream.removeTrack(t);
                        });
                        currentStream.addTrack(newAudioTrack);
                    } else {
                        localStreamRef.current = new MediaStream([newAudioTrack]);
                    }

                    // Replace the audio sender in every active peer connection
                    Object.values(connectionsRef.current).forEach(pc => {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                        if (sender) {
                            sender.replaceTrack(newAudioTrack).catch(console.warn);
                        } else {
                            pc.addTrack(newAudioTrack, localStreamRef.current);
                        }
                    });

                    setAudio(true);
                } catch (err) {
                    console.warn("Mic permission denied:", err);
                    alert("Microphone access was denied. Please allow microphone permissions in your browser settings and try again.");
                }
            }
        }
    }, [audio]);

    // ── 8. Screen share ───────────────────────────────────────────────────────
    const stopScreenShare = useCallback(() => {
        screenActiveRef.current = false;
        setScreenUI(false);

        (async () => {
            try {
                localStreamRef.current?.getTracks().forEach(t => t.stop());
                // After stopping screen share, restore camera if video was ON
                // Otherwise fall back to black/silence
                let restoredStream;
                try {
                    restoredStream = await navigator.mediaDevices.getUserMedia({
                        video: true, audio: true
                    });
                } catch {
                    restoredStream = makeBlackSilenceStream();
                }
                localStreamRef.current = restoredStream;

                if (localVideoRef.current) localVideoRef.current.srcObject = restoredStream;

                Object.values(connectionsRef.current).forEach(pc => {
                    const vSender = pc.getSenders().find(s => s.track?.kind === 'video');
                    const aSender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    const newV = restoredStream.getVideoTracks()[0];
                    const newA = restoredStream.getAudioTracks()[0];
                    if (vSender && newV) vSender.replaceTrack(newV).catch(console.warn);
                    if (aSender && newA) aSender.replaceTrack(newA).catch(console.warn);
                });
            } catch (e) {
                console.warn("Restore after screen share failed:", e);
            }
        })();
    }, []);

    const startScreenShare = useCallback(() => {
        if (!navigator.mediaDevices?.getDisplayMedia) return;

        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
            .then(screenStream => {
                screenActiveRef.current = true;
                setScreenUI(true);

                localStreamRef.current?.getTracks().forEach(t => t.stop());
                localStreamRef.current = screenStream;
                if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;

                Object.values(connectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    const newTrack = screenStream.getVideoTracks()[0];
                    if (sender && newTrack) sender.replaceTrack(newTrack).catch(console.warn);
                });

                screenStream.getTracks().forEach(t => {
                    t.onended = () => { if (screenActiveRef.current) stopScreenShare(); };
                });
            })
            .catch(e => {
                console.warn("getDisplayMedia failed:", e);
                setScreenUI(false);
                screenActiveRef.current = false;
            });
    }, [stopScreenShare]);

    const handleScreen = useCallback(() => {
        if (screenActiveRef.current) stopScreenShare();
        else startScreenShare();
    }, [stopScreenShare, startScreenShare]);

    // ── 9. Chat ───────────────────────────────────────────────────────────────
    const sendMessage = () => {
        if (!socketRef.current || !message.trim()) return;
        socketRef.current.emit("chat-message", message, username);
        setMessage("");
    };

    // ── 10. End call ──────────────────────────────────────────────────────────
    const handleEndCall = () => {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        Object.values(connectionsRef.current).forEach(pc => {
            try { pc.close(); } catch { /* ignored */ }
        });
        connectionsRef.current   = {};
        iceCandidateQRef.current = {};
        socketRef.current?.disconnect();
        socketRef.current = null;
        routeTo("/home");
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="meetMainPage">

            {askForUsername ? (
                /* ── Lobby ─────────────────────────────────────────────────── */
                <div className="lobbyContainer">
                    <h2>Enter into the lobby</h2>
                    <TextField
                        id="outlined-basic"
                        label="Username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        variant="outlined"
                        onKeyDown={e => { if (e.key === 'Enter') connect(); }}
                    />
                    <Button variant="contained" onClick={connect}>Connect</Button>

                    {/* Lobby preview — only shown if user already granted permissions */}
                    <div className="lobbyVideoContainer">
                        <video
                            playsInline autoPlay muted
                            ref={ref => {
                                localVideoRef.current = ref;
                                if (ref && localStreamRef.current &&
                                    ref.srcObject !== localStreamRef.current) {
                                    ref.srcObject = localStreamRef.current;
                                }
                            }}
                        />
                    </div>
                </div>

            ) : (
                /* ── Meeting room ───────────────────────────────────────────── */
                <div className="meetVideoContainer">

                    {/* Chat panel */}
                    {showModal && (
                        <div className="chatRoom">
                            <div className="chatContainer">
                                <h1>Chat</h1>
                                <div className="chattingDisplay">
                                    {messages.length > 0
                                        ? messages.map((item, index) => (
                                            <div key={index} style={{ marginBottom: "20px" }}>
                                                <p style={{ fontWeight: "bold" }}>{item.sender}</p>
                                                <p>{item.data}</p>
                                            </div>
                                        ))
                                        : <p>No messages yet</p>
                                    }
                                </div>
                                <div className="chattingArea">
                                    <TextField
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        variant="outlined"
                                        label="Enter Your Chat"
                                        onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                                    />
                                    <Button variant="contained" onClick={sendMessage}>Send</Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Control buttons */}
                    <div className="buttonContainers">
                        <IconButton style={{ color: "white" }} onClick={handleVideo}>
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>

                        <IconButton className="endCallButton" onClick={handleEndCall}>
                            <CallEndIcon />
                        </IconButton>

                        <IconButton style={{ color: "white" }} onClick={handleAudio}>
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable && (
                            <IconButton style={{ color: "white" }} onClick={handleScreen}>
                                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton>
                        )}

                        <Badge badgeContent={newMessages} max={999} color="secondary">
                            <IconButton
                                onClick={() => { setModal(m => !m); setNewMessages(0); }}
                                style={{ color: "white" }}
                            >
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>

                    {/* Local video — muted to prevent echo */}
                    <video
                        playsInline autoPlay muted
                        className="meetUserVideo"
                        ref={ref => {
                            localVideoRef.current = ref;
                            if (ref && localStreamRef.current &&
                                ref.srcObject !== localStreamRef.current) {
                                ref.srcObject = localStreamRef.current;
                            }
                        }}
                    />

                    {/* Remote participant videos */}
                    <div className="conferenceView">
                        {videos.map(v => (
                            <div key={v.socketId} className="remoteVideoContainer">
                                <video
                                    playsInline autoPlay
                                    data-socket={v.socketId}
                                    ref={ref => {
                                        if (!ref || !v.stream) return;
                                        if (ref.srcObject !== v.stream) ref.srcObject = v.stream;
                                        ref.play().catch(() => {});
                                    }}
                                />
                            </div>
                        ))}
                    </div>

                </div>
            )}

        </div>
    );
}
