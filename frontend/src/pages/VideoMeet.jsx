/* eslint-disable no-unused-vars */
import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import "../styles/VideoMeet.css";
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import io from "socket.io-client";
import server from '../environment';

const server_url = server;
const VIDEOS_PER_PAGE = 4;

const peerConfigConnections = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
    ]
};

// ── Helpers kept outside the component (no closure deps) ────────────────────

/** Returns a silent (muted) audio MediaStreamTrack */
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
    } catch (e) {
        console.warn("makeSilentTrack failed:", e);
        return null;
    }
}

/** Returns a black (invisible) video MediaStreamTrack */
function makeBlackTrack({ width = 640, height = 480 } = {}) {
    try {
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d").fillRect(0, 0, width, height);
        const track = canvas.captureStream().getVideoTracks()[0];
        track.enabled = false;
        return track;
    } catch (e) {
        console.warn("makeBlackTrack failed:", e);
        return null;
    }
}

/** Build a black-video + silent-audio MediaStream as a placeholder */
function makeBlackSilenceStream() {
    const tracks = [];
    const v = makeBlackTrack();
    const a = makeSilentTrack();
    if (v) tracks.push(v);
    if (a) tracks.push(a);
    return new MediaStream(tracks);
}

// ────────────────────────────────────────────────────────────────────────────

export default function VideoMeetComponent() {
    const { url } = useParams();

    // ── Refs – stable identity, no re-render on mutation ──────────────────────
    const socketRef        = useRef(null);
    const localVideoRef    = useRef(null);
    const connectingRef    = useRef(false);
    const videoRef         = useRef([]);     // mirror of `videos` state for stale-closure safety
    const connectionsRef   = useRef({});     // { socketId -> RTCPeerConnection }
    const iceCandidateQRef = useRef({});     // { socketId -> RTCIceCandidateInit[] }
    const localStreamRef   = useRef(null);   // the user's own camera+mic stream
    const screenActiveRef  = useRef(false);  // true while screen-sharing
    const showModalRef     = useRef(false);

    // ── React state ───────────────────────────────────────────────────────────
    const [_videoAvailable, setVideoAvailable]  = useState(false);
    const [_audioAvailable, setAudioAvailable]  = useState(false);
    const [video,           setVideo]           = useState(false);
    const [audio,           setAudio]           = useState(false);
    const [screen,          setScreenUI]        = useState(false);  // UI state only
    const [screenAvailable, setScreenAvailable] = useState(true);   // always default to true so the icon is visible
    const [showModal,       setModal]           = useState(false);
    const [messages,        setMessages]        = useState([]);
    const [message,         setMessage]         = useState("");
    const [newMessages,     setNewMessages]     = useState(0);
    const [askForUsername,  setAskForUsername]  = useState(true);
    const [username,        setUsername]        = useState(localStorage.getItem("apna_username") || "");
    const [videos,          setVideos]          = useState([]);
    const [currentPage,     setCurrentPage]     = useState(0);
    const [showScreenShareError, setShowScreenShareError] = useState(false);

    const routeTo = useNavigate();

    // Sync showModal state with ref for stale-closure safety in socket listener
    useEffect(() => {
        showModalRef.current = showModal;
    }, [showModal]);





    // ── 2. Sync track.enabled when user toggles mic/camera ────────────────────
    useEffect(() => {
        const stream = localStreamRef.current;
        if (!stream) return;
        stream.getVideoTracks().forEach(t => { t.enabled = video; });
        stream.getAudioTracks().forEach(t => { t.enabled = audio; });
        if (video && localVideoRef.current) {
            localVideoRef.current.play().catch(() => {});
        }
    }, [video, audio]);

    // ── 3. WebRTC helpers ─────────────────────────────────────────────────────

    /** Handle an incoming signal (SDP offer/answer, or ICE candidate) */
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
                    // Drain queued ICE candidates now that remoteDescription is set
                    const queued = iceCandidateQRef.current[fromId] || [];
                    queued.forEach(c =>
                        pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn)
                    );
                    delete iceCandidateQRef.current[fromId];

                    // If it was an offer, answer it
                    if (signal.sdp.type === "offer") {
                        return pc.createAnswer()
                            .then(ans => pc.setLocalDescription(ans))
                            .then(() => {
                                socketRef.current?.emit(
                                    "signal", fromId,
                                    JSON.stringify({ sdp: pc.localDescription })
                                );
                            });
                    }
                })
                .catch(e => console.warn("[SDP error]", e));
        }

        if (signal.ice) {
            // If remoteDescription not yet set, queue the candidate
            if (pc.remoteDescription?.type) {
                pc.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(console.warn);
            } else {
                if (!iceCandidateQRef.current[fromId]) iceCandidateQRef.current[fromId] = [];
                iceCandidateQRef.current[fromId].push(signal.ice);
            }
        }
    }, []); // safe: only touches refs, never state

    /** Create an RTCPeerConnection for a remote peer and attach our local tracks */
    const createPeerConnection = useCallback((remoteId) => {
        console.log("[createPeerConnection] →", remoteId);
        const pc = new RTCPeerConnection(peerConfigConnections);

        pc.onconnectionstatechange = () =>
            console.log(`[RTC] ${remoteId} connectionState = ${pc.connectionState}`);
        pc.oniceconnectionstatechange = () =>
            console.log(`[ICE] ${remoteId} iceConnectionState = ${pc.iceConnectionState}`);

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socketRef.current?.emit(
                    "signal", remoteId,
                    JSON.stringify({ ice: candidate })
                );
            }
        };

        // When we receive the remote peer's track(s)
        pc.ontrack = ({ streams, track }) => {
            const remoteStream = (streams && streams[0]) || new MediaStream([track]);
            console.log("[ontrack]", remoteId, track.kind, "stream id:", remoteStream.id);

            setVideos(prev => {
                const exists = prev.find(v => v.socketId === remoteId);
                const updated = exists
                    ? prev.map(v => v.socketId === remoteId ? { ...v, stream: remoteStream } : v)
                    : [...prev, { socketId: remoteId, stream: remoteStream }];
                videoRef.current = updated;
                return updated;
            });
        };

        // Attach our local tracks so the remote peer can see/hear us
        const localStream = localStreamRef.current || makeBlackSilenceStream();
        if (!localStreamRef.current) localStreamRef.current = localStream;
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        connectionsRef.current[remoteId] = pc;
        return pc;
    }, []); // safe: only touches refs

    /** Establish Socket.IO connection and wire all signalling events */
    const connectToSocketServer = useCallback(() => {
        console.log("[socket] connecting →", server_url);

        const socket = io(server_url, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 15,
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            console.log("[socket] connected, id =", socket.id);
            socket.emit("join-call", `/${url}`);
        });

        socket.on("connect_error", err => console.warn("[socket] connect_error:", err.message));

        socket.on("signal", gotMessageFromServer);

        socket.on("chat-message", (data, sender, senderSocketId) => {
            setMessages(prev => [...prev, { sender, data }]);
            if (senderSocketId !== socket.id && !showModalRef.current) {
                setNewMessages(n => n + 1);
            }
        });

        socket.on("user-left", id => {
            console.log("[socket] user-left:", id);
            connectionsRef.current[id]?.close();
            delete connectionsRef.current[id];
            delete iceCandidateQRef.current[id];
            setVideos(prev => {
                const updated = prev.filter(v => v.socketId !== id);
                videoRef.current = updated;
                return updated;
            });
        });

        /**
         * user-joined:
         *   id      = socket id of the user who just joined
         *   clients = complete list of socket ids currently in the room
         *
         * Strategy:
         *  • Every client creates a RTCPeerConnection for every other client it
         *    doesn't already have one for (idempotent).
         *  • ONLY the newly joined user (id === socket.id) then fires createOffer
         *    to each existing peer. The existing peers receive the offer and answer;
         *    they never initiate offers.
         */
        socket.on("user-joined", (id, clients) => {
            console.log("[socket] user-joined:", id, "| room:", clients);

            // Create RTCPeerConnection for every peer we don't already know
            clients.forEach(remoteId => {
                if (remoteId === socket.id) return;
                if (connectionsRef.current[remoteId]) return; // already exists
                createPeerConnection(remoteId);
            });

            // The joiner sends offers to everyone already in the room
            if (id === socket.id) {
                Object.entries(connectionsRef.current).forEach(([remoteId, pc]) => {
                    pc.createOffer()
                        .then(offer => pc.setLocalDescription(offer))
                        .then(() => {
                            socket.emit(
                                "signal", remoteId,
                                JSON.stringify({ sdp: pc.localDescription })
                            );
                        })
                        .catch(e => console.warn("[offer error]", e));
                });
            }
        });
    }, [gotMessageFromServer, createPeerConnection, url]);

    // ── 1. Acquire permissions on mount ───────────────────────────────────────
    useEffect(() => {
        if (!navigator.mediaDevices) {
            console.warn("navigator.mediaDevices unavailable – need HTTPS.");
            return;
        }

        (async () => {
            let hasVideo = false;
            let hasAudio = false;
            let combinedStream = null;

            // Request video first
            try {
                combinedStream = await navigator.mediaDevices.getUserMedia({ video: true });
                hasVideo = true;
            } catch (e) {
                console.warn("Camera denied:", e.message);
            }

            // Small gap so browser shows sequential prompts
            await new Promise(r => setTimeout(r, 300));

            // Request audio
            try {
                const aStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
                });
                hasAudio = true;
                if (combinedStream) {
                    aStream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
                } else {
                    combinedStream = aStream;
                }
            } catch (e) {
                console.warn("Mic denied:", e.message);
            }

            setVideoAvailable(hasVideo);
            setAudioAvailable(hasAudio);
            setScreenAvailable(true); // Force true so the screen share button shows on all devices

            if (combinedStream) {
                localStreamRef.current = combinedStream;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = combinedStream;
                }
            }

            // Auto-rejoin if username is already saved in localStorage, we are on a call route,
            // and the session flag indicates they were already in the meeting in this window session.
            const savedUsername = localStorage.getItem("apna_username");
            const wasActive = sessionStorage.getItem(`apna_active_${url}`) === "true";
            if (savedUsername && savedUsername.trim() && url && wasActive) {
                setUsername(savedUsername.trim());
                // Start with tracks disabled initially per requirement
                if (combinedStream) {
                    combinedStream.getVideoTracks().forEach(t => { t.enabled = false; });
                    combinedStream.getAudioTracks().forEach(t => { t.enabled = false; });
                }
                setVideo(false);
                setAudio(false);
                setAskForUsername(false);
                
                // Trigger connection to socket server after a short delay
                setTimeout(() => {
                    connectToSocketServer();
                }, 100);
            }
        })();

        // Cleanup on unmount
        return () => {
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
            Object.values(connectionsRef.current).forEach(pc => { try { pc.close(); } catch { /* ignored */ } });
            connectionsRef.current  = {};
            iceCandidateQRef.current = {};
            socketRef.current?.disconnect();
            socketRef.current = null;
        };
    }, [connectToSocketServer, url]);

    // ── 4. Join meeting ───────────────────────────────────────────────────────
    const connect = async () => {
        if (connectingRef.current) return;
        if (!username.trim()) { alert("Please enter a username."); return; }
        if (!navigator.mediaDevices) {
            alert("WebRTC requires HTTPS. Please open the deployed HTTPS URL.");
            return;
        }

        localStorage.setItem("apna_username", username.trim());
        sessionStorage.setItem(`apna_active_${url}`, "true");

        connectingRef.current = true;
        try {
            let stream = localStreamRef.current;

            // If we have no stream yet (permissions were denied on mount, or not yet finished),
            // try to get one now. Always ask for both video & audio so addTrack works correctly.
            if (!stream || stream.getTracks().filter(t => !t.ended).length === 0) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ 
                        video: true, 
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
                    });
                    localStreamRef.current = stream;
                    setVideoAvailable(stream.getVideoTracks().length > 0);
                    setAudioAvailable(stream.getAudioTracks().length > 0);
                } catch { /* both failed, try individually */
                    // Try video-only
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ video: true });
                        localStreamRef.current = stream;
                        setVideoAvailable(true);
                    } catch {
                        // Try audio-only
                        try {
                            stream = await navigator.mediaDevices.getUserMedia({ 
                                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
                            });
                            localStreamRef.current = stream;
                            setAudioAvailable(true);
                        } catch (e2) {
                            alert("Could not access camera or microphone.\n" + e2.message);
                            return;
                        }
                    }
                }
            }

            // Start with camera and mic OFF — user must explicitly turn them on.
            // Tracks are still added to the peer connection so WebRTC negotiation
            // succeeds; enabled=false just sends black frames / silence.
            stream.getVideoTracks().forEach(t => { t.enabled = false; });
            stream.getAudioTracks().forEach(t => { t.enabled = false; });

            setVideo(false);
            setAudio(false);

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            setAskForUsername(false);
            connectToSocketServer();
        } finally {
            connectingRef.current = false;
        }
    };

    // ── 5. Toggle camera / mic ────────────────────────────────────────────────
    const handleVideo = () => setVideo(v => !v);
    const handleAudio = () => setAudio(a => !a);

    // ── 6. Screen share ───────────────────────────────────────────────────────
    const stopScreenShare = useCallback(() => {
        screenActiveRef.current = false;
        setScreenUI(false);

        // Restore camera stream
        (async () => {
            try {
                // Stop screen tracks
                localStreamRef.current?.getTracks().forEach(t => t.stop());

                const camStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                localStreamRef.current = camStream;

                // Re-enable based on current toggle state (use refs to avoid stale closure)
                // We read from the DOM / ref rather than captured state
                camStream.getVideoTracks().forEach(t => { t.enabled = true; });
                camStream.getAudioTracks().forEach(t => { t.enabled = true; });
                setVideo(true);
                setAudio(true);

                if (localVideoRef.current) localVideoRef.current.srcObject = camStream;

                // Replace tracks in all peer connections
                Object.values(connectionsRef.current).forEach(pc => {
                    const vSender = pc.getSenders().find(s => s.track?.kind === 'video');
                    const aSender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    const newV = camStream.getVideoTracks()[0];
                    const newA = camStream.getAudioTracks()[0];
                    if (vSender && newV) vSender.replaceTrack(newV).catch(console.warn);
                    if (aSender && newA) aSender.replaceTrack(newA).catch(console.warn);
                });
            } catch (e) {
                console.warn("Restore camera failed:", e);
            }
        })();
    }, []);

    const startScreenShare = useCallback(() => {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            setShowScreenShareError(true);
            return;
        }

        const micTrack = localStreamRef.current?.getAudioTracks()[0];
        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
            .catch(() => {
                // Fallback to video-only if screen audio capture fails or is not supported (common on mobile/tablet)
                return navigator.mediaDevices.getDisplayMedia({ video: true });
            })
            .then(screenStream => {
                screenActiveRef.current = true;
                setScreenUI(true);

                // Stop only video tracks of the old stream, keeping microphone track alive
                localStreamRef.current?.getVideoTracks().forEach(t => t.stop());

                const screenVideoTrack = screenStream.getVideoTracks()[0];
                const tracks = [screenVideoTrack];
                if (micTrack) {
                    tracks.push(micTrack);
                } else {
                    const screenAudioTrack = screenStream.getAudioTracks()[0];
                    if (screenAudioTrack) tracks.push(screenAudioTrack);
                }

                const combinedStream = new MediaStream(tracks);
                localStreamRef.current = combinedStream;
                if (localVideoRef.current) localVideoRef.current.srcObject = combinedStream;

                // Replace video track in all peer connections
                Object.values(connectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender && screenVideoTrack) sender.replaceTrack(screenVideoTrack).catch(console.warn);
                });

                // Auto-stop when user clicks browser's "Stop sharing"
                screenStream.getTracks().forEach(t => {
                    t.onended = () => {
                        if (screenActiveRef.current) stopScreenShare();
                    };
                });
            })
            .catch(e => {
                console.warn("getDisplayMedia failed:", e);
                setScreenUI(false);
                screenActiveRef.current = false;
            });
    }, [stopScreenShare, setShowScreenShareError]);

    const handleScreen = useCallback(() => {
        if (screenActiveRef.current) {
            stopScreenShare();
        } else {
            startScreenShare();
        }
    }, [stopScreenShare, startScreenShare]);

    // ── 7. Chat ───────────────────────────────────────────────────────────────
    const sendMessage = () => {
        if (!socketRef.current || !message.trim()) return;
        socketRef.current.emit("chat-message", message, username);
        setMessage("");
    };

    // ── 8. End call ───────────────────────────────────────────────────────────
    const handleEndCall = () => {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        Object.values(connectionsRef.current).forEach(pc => { try { pc.close(); } catch { /* ignored */ } });
        connectionsRef.current  = {};
        iceCandidateQRef.current = {};
        socketRef.current?.disconnect();
        socketRef.current = null;
        sessionStorage.removeItem(`apna_active_${url}`);
        routeTo("/home");
    };

    // ── 9. Handle Bluetooth / audio output device changes mid-call ──────────────
    useEffect(() => {
        const handleDeviceChange = async () => {
            console.log("[Audio] Device change detected (e.g., Bluetooth connected/disconnected)");
            try {
                if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const defaultOutput = devices.find(d => d.kind === 'audiooutput' && d.deviceId === 'default');
                    const targetSinkId = defaultOutput ? defaultOutput.deviceId : 'default';

                    const videoElements = document.querySelectorAll('video');
                    for (const video of videoElements) {
                        if (typeof video.setSinkId === 'function') {
                            await video.setSinkId(targetSinkId).catch(err => {
                                console.warn("[Audio] Failed to setSinkId on video element:", err);
                            });
                        }
                        if (video.srcObject) {
                            video.play().catch(() => {});
                        }
                    }
                }
            } catch (err) {
                console.warn("[Audio] handleDeviceChange error:", err);
            }
        };

        navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
        return () => {
            navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
        };
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    const maxPage = Math.max(0, Math.ceil(videos.length / VIDEOS_PER_PAGE) - 1);
    if (currentPage > maxPage) {
        setCurrentPage(maxPage);
    }

    const visibleVideos = videos.slice(currentPage * VIDEOS_PER_PAGE, (currentPage + 1) * VIDEOS_PER_PAGE);

    return (
        <div className="meetMainPage">

            {askForUsername ? (
                /* ── Lobby ── */
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
                    <div className="lobbyVideoContainer">
                        <video
                            playsInline autoPlay muted
                            ref={ref => {
                                localVideoRef.current = ref;
                                if (ref && localStreamRef.current && ref.srcObject !== localStreamRef.current) {
                                    ref.srcObject = localStreamRef.current;
                                }
                            }}
                        />
                    </div>
                </div>

            ) : (
                /* ── Meeting room ── */
                <div className={`meetVideoContainer ${showModal ? 'chatRoomOpen' : ''}`}>

                    {videos.length > VIDEOS_PER_PAGE && (
                        <>
                            <IconButton 
                                className="carouselArrow leftArrow" 
                                disabled={currentPage === 0} 
                                onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                            >
                                <ChevronLeftIcon />
                            </IconButton>
                            <IconButton 
                                className="carouselArrow rightArrow" 
                                disabled={currentPage >= Math.ceil(videos.length / VIDEOS_PER_PAGE) - 1} 
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(videos.length / VIDEOS_PER_PAGE) - 1, prev + 1))}
                            >
                                <ChevronRightIcon />
                            </IconButton>
                        </>
                    )}

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

                    {/* Local (self) video — always muted to prevent echo */}
                    <video
                        playsInline autoPlay muted
                        className="meetUserVideo"
                        ref={ref => {
                            localVideoRef.current = ref;
                            if (ref && localStreamRef.current && ref.srcObject !== localStreamRef.current) {
                                ref.srcObject = localStreamRef.current;
                            }
                        }}
                    />

                    {/* Remote participant videos */}
                    <div className={`conferenceView visible-${visibleVideos.length}`}>
                        {visibleVideos.map(v => (
                            <div key={v.socketId} className="remoteVideoContainer">
                                <video
                                    playsInline autoPlay
                                    data-socket={v.socketId}
                                    ref={ref => {
                                        if (!ref || !v.stream) return;
                                        if (ref.srcObject !== v.stream) {
                                            ref.srcObject = v.stream;
                                        }
                                        ref.play().catch(() => {});
                                    }}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Screen Share Error Modal */}
                    {showScreenShareError && (
                        <div className="shareErrorOverlay">
                            <div className="shareErrorCard">
                                <h3>Screen Sharing Unavailable</h3>
                                <p>
                                    Mobile operating systems (iOS, iPadOS, and Android) do not support screen sharing in web browsers due to platform security limitations.
                                </p>
                                <p className="recommendText">
                                    To share your screen, please join this meeting on a laptop or desktop computer.
                                </p>
                                <div className="shareErrorActions">
                                    <Button 
                                        variant="contained" 
                                        onClick={() => {
                                            navigator.clipboard.writeText(window.location.href);
                                            alert("Meeting link copied to clipboard!");
                                        }}
                                    >
                                        Copy Link
                                    </Button>
                                    <Button 
                                        className="closeBtn"
                                        variant="outlined" 
                                        onClick={() => setShowScreenShareError(false)}
                                    >
                                        Close
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            )}

        </div>
    );
}
