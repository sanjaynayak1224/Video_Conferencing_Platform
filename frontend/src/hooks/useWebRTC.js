import { useRef, useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
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

export function useWebRTC(url, username, onChatMessage) {
    const socketRef = useRef(null);
    const localVideoRef = useRef(null);
    const connectionsRef = useRef({});
    const iceCandidateQRef = useRef({});
    const localStreamRef = useRef(null);
    const screenActiveRef = useRef(false);
    const connectingRef = useRef(false);
    const audioContextsRef = useRef([]); // Track AudioContexts to close on cleanup
    const clientsRef = useRef([]); // Store client metadata list (socketId -> username)
    const audioAnalyzersRef = useRef({}); // Store remote peer audio analysers
    const speakerTimeoutRef = useRef({}); // Store active speaker delay timeout identifiers

    const [videos, setVideos] = useState([]);
    const [video, setVideo] = useState(false);
    const [audio, setAudio] = useState(false);
    const [screen, setScreenUI] = useState(false);
    const [videoAvailable, setVideoAvailable] = useState(false);
    const [audioAvailable, setAudioAvailable] = useState(false);
    const [screenAvailable] = useState(true);
    const [showScreenShareError, setShowScreenShareError] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [remoteMediaStates, setRemoteMediaStates] = useState({});
    const [activeSpeaker, setActiveSpeaker] = useState(null);
    const [localStream, setLocalStream] = useState(null);

    /** Returns a silent (muted) audio MediaStreamTrack and tracks its AudioContext for cleanup */
    const makeSilentTrack = useCallback(() => {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            const ctx = new AudioContextClass();
            audioContextsRef.current.push(ctx);
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
    }, []);

    /** Returns a black (invisible) video MediaStreamTrack */
    const makeBlackTrack = useCallback(({ width = 640, height = 480 } = {}) => {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) ctx.fillRect(0, 0, width, height);
            const stream = canvas.captureStream();
            const track = stream.getVideoTracks()[0];
            if (track) track.enabled = false;
            return track;
        } catch (e) {
            console.warn("makeBlackTrack failed:", e);
            return null;
        }
    }, []);

    /** Build a black-video + silent-audio MediaStream as a placeholder */
    const makeBlackSilenceStream = useCallback(() => {
        const tracks = [];
        const v = makeBlackTrack();
        const a = makeSilentTrack();
        if (v) tracks.push(v);
        if (a) tracks.push(a);
        return new MediaStream(tracks);
    }, [makeBlackTrack, makeSilentTrack]);

    /** Handle incoming signaling message */
    const gotMessageFromServer = useCallback((fromId, rawMsg) => {
        const signal = JSON.parse(rawMsg);
        if (fromId === socketRef.current?.id) return;

        const pc = connectionsRef.current[fromId];
        if (!pc) {
            console.warn("[Signal] No RTCPeerConnection for remote user:", fromId);
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
                                socketRef.current?.emit(
                                    "signal", fromId,
                                    JSON.stringify({ sdp: pc.localDescription })
                                );
                            });
                    }
                })
                .catch(e => console.warn("[SDP Error]", e));
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

    /** Clear active speaker status after silence delay */
    const clearActiveSpeakerTimeout = useCallback((remoteId) => {
        if (speakerTimeoutRef.current[remoteId]) {
            clearTimeout(speakerTimeoutRef.current[remoteId]);
        }
        speakerTimeoutRef.current[remoteId] = setTimeout(() => {
            setActiveSpeaker(current => current === remoteId ? null : current);
            delete speakerTimeoutRef.current[remoteId];
        }, 2500); // 2.5 seconds of silence before highlight disappears
    }, []);

    const stopAudioAnalyzing = useCallback((remoteId) => {
        const analyzer = audioAnalyzersRef.current[remoteId];
        if (analyzer) {
            clearInterval(analyzer.intervalId);
            try {
                if (analyzer.actx.state !== "closed") {
                    analyzer.actx.close().catch(() => {});
                }
            } catch {
                // Silently ignore close errors
            }
            delete audioAnalyzersRef.current[remoteId];
        }
        if (speakerTimeoutRef.current[remoteId]) {
            clearTimeout(speakerTimeoutRef.current[remoteId]);
            delete speakerTimeoutRef.current[remoteId];
        }
        setActiveSpeaker(current => current === remoteId ? null : current);
    }, []);

    const startAudioAnalyzing = useCallback((remoteId, stream) => {
        // Prevent duplicate analyzers for same peer
        if (audioAnalyzersRef.current[remoteId]) return;

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const actx = new AudioContextClass();
            audioContextsRef.current.push(actx);
            
            const src = actx.createMediaStreamSource(stream);
            const analyser = actx.createAnalyser();
            analyser.fftSize = 256; // Smaller fftSize is faster for volume level polling
            src.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const intervalId = setInterval(() => {
                if (actx.state === "closed") {
                    clearInterval(intervalId);
                    return;
                }
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const averageVolume = sum / bufferLength;

                // Threshold check: 35 is standard conversational activity level
                if (averageVolume > 35) {
                    setActiveSpeaker(remoteId);
                    clearActiveSpeakerTimeout(remoteId);
                }
            }, 200);

            audioAnalyzersRef.current[remoteId] = { actx, intervalId };
        } catch (e) {
            console.warn("Failed to initialize audio analyzer:", e);
        }
    }, [clearActiveSpeakerTimeout]);

    /** Create an RTCPeerConnection for a remote peer */
    const createPeerConnection = useCallback((remoteId) => {
        const pc = new RTCPeerConnection(peerConfigConnections);

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socketRef.current?.emit(
                    "signal", remoteId,
                    JSON.stringify({ ice: candidate })
                );
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`[ICE] Remote peer ${remoteId} connection state changed to: ${state}`);
            setVideos(prev => prev.map(v => 
                v.socketId === remoteId ? { ...v, connectionState: state } : v
            ));
        };

        pc.ontrack = ({ streams, track }) => {
            const remoteStream = (streams && streams[0]) || new MediaStream([track]);
            
            // Start volume monitoring for speaker identification
            startAudioAnalyzing(remoteId, remoteStream);

            setVideos(prev => {
                const exists = prev.find(v => v.socketId === remoteId);
                const clientMeta = clientsRef.current.find(c => c.socketId === remoteId);
                const remoteUsername = clientMeta ? clientMeta.username : "Guest";

                return exists
                    ? prev.map(v => v.socketId === remoteId ? { ...v, stream: remoteStream, username: remoteUsername, connectionState: pc.iceConnectionState } : v)
                    : [...prev, { socketId: remoteId, stream: remoteStream, username: remoteUsername, connectionState: pc.iceConnectionState }];
            });
        };

        const localStream = localStreamRef.current || makeBlackSilenceStream();
        if (!localStreamRef.current) localStreamRef.current = localStream;
        
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        connectionsRef.current[remoteId] = pc;
        return pc;
    }, [makeBlackSilenceStream, startAudioAnalyzing]);

    /** Establish Socket.IO connection and wire signaling events */
    const connectToSocketServer = useCallback(() => {
        const token = localStorage.getItem("token");
        const socket = io(server_url, {
            auth: { token },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 15,
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            socket.emit("join-call", `/${url}`, username);
        });

        socket.on("signal", gotMessageFromServer);

        if (onChatMessage) {
            socket.on("chat-message", (data, sender, senderSocketId) => {
                const isFromSelf = senderSocketId === socket.id;
                onChatMessage(data, sender, isFromSelf);
            });
        }

        socket.on("media-toggle", (peerId, state) => {
            setRemoteMediaStates(prev => ({
                ...prev,
                [peerId]: state
            }));
        });

        socket.on("user-left", id => {
            connectionsRef.current[id]?.close();
            delete connectionsRef.current[id];
            delete iceCandidateQRef.current[id];
            setVideos(prev => prev.filter(v => v.socketId !== id));
            stopAudioAnalyzing(id);
            setRemoteMediaStates(prev => {
                const copy = { ...prev };
                delete copy[id];
                return copy;
            });
        });

        socket.on("user-joined", (id, clientsList) => {
            clientsRef.current = clientsList;

            // Map and store initial media states for all peers
            const statesMap = {};
            clientsList.forEach(client => {
                statesMap[client.socketId] = client.mediaState || { video: false, audio: false };
            });
            setRemoteMediaStates(prev => ({ ...prev, ...statesMap }));

            clientsList.forEach(client => {
                const remoteId = client.socketId;
                if (remoteId === socket.id) return;
                if (connectionsRef.current[remoteId]) return;
                createPeerConnection(remoteId);
            });

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
                        .catch(e => console.warn("[Offer Error]", e));
                });
            }
        });
    }, [url, username, gotMessageFromServer, createPeerConnection, onChatMessage, stopAudioAnalyzing]);

    /** Toggle local video track state */
    const toggleVideo = useCallback(() => {
        setVideo(prev => {
            const nextVal = !prev;
            const stream = localStreamRef.current;
            if (stream) {
                stream.getVideoTracks().forEach(t => { t.enabled = nextVal; });
                if (nextVal && localVideoRef.current) {
                    localVideoRef.current.play().catch((err) => {
                        console.warn("Local video play failed:", err);
                    });
                }
            }
            socketRef.current?.emit("media-toggle", { video: nextVal, audio });
            return nextVal;
        });
    }, [audio]);

    /** Toggle local audio track state */
    const toggleAudio = useCallback(() => {
        setAudio(prev => {
            const nextVal = !prev;
            const stream = localStreamRef.current;
            if (stream) {
                stream.getAudioTracks().forEach(t => { t.enabled = nextVal; });
            }
            socketRef.current?.emit("media-toggle", { video, audio: nextVal });
            return nextVal;
        });
    }, [video]);

    /** Stop screen sharing and restore camera input */
    const stopScreenShare = useCallback(async () => {
        screenActiveRef.current = false;
        setScreenUI(false);

        try {
            localStreamRef.current?.getTracks().forEach(t => t.stop());

            const camStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            localStreamRef.current = camStream;
            setLocalStream(camStream);

            camStream.getVideoTracks().forEach(t => { t.enabled = true; });
            camStream.getAudioTracks().forEach(t => { t.enabled = true; });
            setVideo(true);
            setAudio(true);

            if (localVideoRef.current) localVideoRef.current.srcObject = camStream;

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
    }, []);

    /** Start screen sharing */
    const startScreenShare = useCallback(() => {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            setShowScreenShareError(true);
            return;
        }

        const micTrack = localStreamRef.current?.getAudioTracks()[0];
        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
            .catch(() => navigator.mediaDevices.getDisplayMedia({ video: true }))
            .then(screenStream => {
                screenActiveRef.current = true;
                setScreenUI(true);

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
                setLocalStream(combinedStream);
                if (localVideoRef.current) localVideoRef.current.srcObject = combinedStream;

                Object.values(connectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender && screenVideoTrack) sender.replaceTrack(screenVideoTrack).catch(console.warn);
                });

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
    }, [stopScreenShare]);

    /** Toggle screen share state */
    const toggleScreenShare = useCallback(() => {
        if (screenActiveRef.current) {
            stopScreenShare();
        } else {
            startScreenShare();
        }
    }, [stopScreenShare, startScreenShare]);

    /** Send chat message through socket client */
    const sendMessage = useCallback((messageText) => {
        if (socketRef.current && messageText.trim()) {
            socketRef.current.emit("chat-message", messageText, username);
        }
    }, [username]);

    /** Explicit connect method */
    const connect = useCallback(async () => {
        if (connectingRef.current) return;
        connectingRef.current = true;
        setIsConnecting(true);

        try {
            let stream = localStreamRef.current;

            if (!stream || stream.getTracks().filter(t => !t.ended).length === 0) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ 
                        video: true, 
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
                    });
                    localStreamRef.current = stream;
                    setLocalStream(stream);
                    setVideoAvailable(stream.getVideoTracks().length > 0);
                    setAudioAvailable(stream.getAudioTracks().length > 0);
                } catch (e1) {
                    console.warn("Failed to acquire combined stream, trying individual streams:", e1);
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ video: true });
                        localStreamRef.current = stream;
                        setLocalStream(stream);
                        setVideoAvailable(true);
                    } catch (e2) {
                        console.warn("Camera fallback stream request failed:", e2);
                        try {
                            stream = await navigator.mediaDevices.getUserMedia({ 
                                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
                            });
                            localStreamRef.current = stream;
                            setLocalStream(stream);
                            setAudioAvailable(true);
                        } catch (e3) {
                            setIsConnecting(false);
                            connectingRef.current = false;
                            throw new Error("Could not access camera or microphone: " + e3.message, { cause: e3 });
                        }
                    }
                }
            }

            // Start stream initially disabled per requirements
            stream.getVideoTracks().forEach(t => { t.enabled = false; });
            stream.getAudioTracks().forEach(t => { t.enabled = false; });

            setVideo(false);
            setAudio(false);

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            connectToSocketServer();
        } finally {
            setIsConnecting(false);
            connectingRef.current = false;
        }
    }, [connectToSocketServer]);

    /** Core lifecycle setup (Permissions on mount, Cleanups on unmount) */
    useEffect(() => {
        if (!navigator.mediaDevices) {
            console.warn("navigator.mediaDevices unavailable.");
            return;
        }

        (async () => {
            let hasVideo = false;
            let hasAudio = false;
            let combinedStream = null;

            try {
                // Joint single-shot acquisition (iOS WebKit compatibility)
                combinedStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                });
                hasVideo = true;
                hasAudio = true;
                console.log("[Media] Joint getUserMedia acquisition successful.");
            } catch (jointError) {
                console.warn("[Media] Joint getUserMedia failed, running sequential track fallback:", jointError.message);
                
                try {
                    combinedStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    hasVideo = true;
                } catch (e) {
                    console.warn("Camera fallback denied:", e.message);
                }

                await new Promise(r => setTimeout(r, 200));

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
                    console.warn("Mic fallback denied:", e.message);
                }
            }

            setVideoAvailable(hasVideo);
            setAudioAvailable(hasAudio);

            if (combinedStream) {
                localStreamRef.current = combinedStream;
                setLocalStream(combinedStream);
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = combinedStream;
                }
            }
        })();

        return () => {
            // Stop tracks
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
            setLocalStream(null);

            Object.values(connectionsRef.current).forEach(pc => {
                try {
                    pc.close();
                } catch {
                    // Suppress connection closure errors during unmount lifecycle
                }
            });
            connectionsRef.current = {};
            iceCandidateQRef.current = {};

            // Disconnect socket
            socketRef.current?.disconnect();
            socketRef.current = null;

            // Close & clean up silent track contexts to prevent AudioContext leaks
            audioContextsRef.current.forEach(ctx => {
                if (ctx.state !== "closed") {
                    ctx.close().catch(err => console.warn("Error closing AudioContext:", err));
                }
            });
            audioContextsRef.current = [];
        };
    }, []);

    return {
        connect,
        localVideoRef,
        videos,
        video,
        audio,
        screen,
        videoAvailable,
        audioAvailable,
        screenAvailable,
        toggleVideo,
        toggleAudio,
        toggleScreenShare,
        sendMessage,
        showScreenShareError,
        setShowScreenShareError,
        isConnecting,
        socketRef,
        remoteMediaStates,
        activeSpeaker,
        localStream
    };
}
