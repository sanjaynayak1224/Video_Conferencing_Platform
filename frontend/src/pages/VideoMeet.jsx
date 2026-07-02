import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import "../styles/VideoMeet.css";
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Snackbar from '@mui/material/Snackbar';

const VIDEOS_PER_PAGE = 4;

export default function VideoMeetComponent() {
    const { url } = useParams();
    const routeTo = useNavigate();

    // ── React UI state ───────────────────────────────────────────────────────────
    const savedUsername = localStorage.getItem("apna_username") || "";
    const wasActive = sessionStorage.getItem(`apna_active_${url}`) === "true";
    const shouldAutoJoin = !!(savedUsername.trim() && url && wasActive);

    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [newMessages, setNewMessages] = useState(0);
    const [askForUsername, setAskForUsername] = useState(!shouldAutoJoin);
    const [username, setUsername] = useState(savedUsername);
    const [currentPage, setCurrentPage] = useState(0);
    const [showModal, setModal] = useState(false);
    
    // MUI Toast / Notifications state instead of standard alerts
    const [toastOpen, setToastOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState("");

    const showModalRef = useRef(false);

    // Sync showModal state with ref for stale-closure safety in socket listener
    useEffect(() => {
        showModalRef.current = showModal;
    }, [showModal]);

    // Toast triggers helper
    const triggerToast = useCallback((msg) => {
        setToastMessage(msg);
        setToastOpen(true);
    }, []);

    // Handle incoming chat messages (passed as callback to useWebRTC hook)
    const handleIncomingChatMessage = useCallback((data, sender, isFromSelf) => {
        setMessages(prev => [...prev, { sender, data }]);
        if (!isFromSelf && !showModalRef.current) {
            setNewMessages(n => n + 1);
        }
    }, []);

    // Initialize custom hook
    const {
        connect: rtcConnect,
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
        sendMessage: rtcSendMessage,
        showScreenShareError,
        setShowScreenShareError,
        remoteMediaStates,
        activeSpeaker
    } = useWebRTC(url, username, handleIncomingChatMessage);

    // Lock viewport scrolling when actively inside a meeting call
    useEffect(() => {
        if (!askForUsername) {
            document.body.classList.add("meeting-active");
            document.documentElement.classList.add("meeting-active");
        } else {
            document.body.classList.remove("meeting-active");
            document.documentElement.classList.remove("meeting-active");
        }
        return () => {
            document.body.classList.remove("meeting-active");
            document.documentElement.classList.remove("meeting-active");
        };
    }, [askForUsername]);

    // Auto-rejoin if username is already saved in localStorage and window session flag is set
    useEffect(() => {
        if (shouldAutoJoin) {
            // Connect to call room automatically
            setTimeout(() => {
                rtcConnect().catch(err => {
                    console.error("Auto-rejoin failed:", err);
                    triggerToast("Failed to access media devices on re-join.");
                });
            }, 100);
        }
    }, [shouldAutoJoin, rtcConnect, triggerToast]);

    // ── Join meeting trigger ───────────────────────────────────────────────────
    const connect = async () => {
        if (!username.trim()) {
            triggerToast("Please enter a username.");
            return;
        }
        if (!navigator.mediaDevices) {
            triggerToast("Secure context (HTTPS) required for video calls.");
            return;
        }

        localStorage.setItem("apna_username", username.trim());
        sessionStorage.setItem(`apna_active_${url}`, "true");

        try {
            await rtcConnect();
            setAskForUsername(false);
        } catch (err) {
            triggerToast(err.message || "Could not join the meeting room.");
        }
    };

    // Chat Message Sender
    const sendChatMessage = () => {
        if (!message.trim()) return;
        rtcSendMessage(message);
        setMessage("");
    };

    // ── End call ─────────────────────────────────────────────────────────────
    const handleEndCall = () => {
        sessionStorage.removeItem(`apna_active_${url}`);
        routeTo("/home");
    };

    // ── Handle Bluetooth / audio output device changes mid-call ──────────────
    useEffect(() => {
        const handleDeviceChange = async () => {
            console.log("[Audio] Device change detected. Syncing audio output targets.");
            try {
                if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const defaultOutput = devices.find(d => d.kind === 'audiooutput' && d.deviceId === 'default');
                    const targetSinkId = defaultOutput ? defaultOutput.deviceId : 'default';

                    const videoElements = document.querySelectorAll('video');
                    for (const vEl of videoElements) {
                        if (typeof vEl.setSinkId === 'function') {
                            await vEl.setSinkId(targetSinkId).catch(err => {
                                console.warn("[Audio] Failed to setSinkId on video element:", err);
                            });
                        }
                        if (vEl.srcObject) {
                            vEl.play().catch(() => {});
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

    // Helper to get initials from username
    const getInitials = (name) => {
        if (!name) return "?";
        const parts = name.trim().split(" ");
        if (parts.length >= 2) {
            return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
        }
        return parts[0].substring(0, 2).toUpperCase();
    };

    // Pagination and Active Speaker sorting
    const sortedVideos = [...videos].sort((a, b) => {
        if (a.socketId === activeSpeaker) return -1;
        if (b.socketId === activeSpeaker) return 1;
        return 0;
    });

    const maxPage = Math.max(0, Math.ceil(sortedVideos.length / VIDEOS_PER_PAGE) - 1);
    if (currentPage > maxPage) {
        setCurrentPage(maxPage);
    }

    const visibleVideos = sortedVideos.slice(currentPage * VIDEOS_PER_PAGE, (currentPage + 1) * VIDEOS_PER_PAGE);

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
                    <div className="lobbyDeviceStatus">
                        <div className={`statusIndicator ${videoAvailable ? 'active' : 'denied'}`}>
                            <span className="dot"></span>
                            <span>Camera: {videoAvailable ? "Ready" : "Blocked"}</span>
                        </div>
                        <div className={`statusIndicator ${audioAvailable ? 'active' : 'denied'}`}>
                            <span className="dot"></span>
                            <span>Microphone: {audioAvailable ? "Ready" : "Blocked"}</span>
                        </div>
                    </div>
                    <div className="lobbyVideoContainer">
                        <video
                            playsInline autoPlay muted
                            ref={ref => {
                                if (ref && localVideoRef.current !== ref) {
                                    localVideoRef.current = ref;
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
                                        onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
                                    />
                                    <Button variant="contained" onClick={sendChatMessage}>Send</Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Control buttons */}
                    <div className="buttonContainers">
                        <IconButton style={{ color: "white" }} onClick={toggleVideo}>
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>

                        <IconButton className="endCallButton" onClick={handleEndCall}>
                            <CallEndIcon />
                        </IconButton>

                        <IconButton style={{ color: "white" }} onClick={toggleAudio}>
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable && (
                            <IconButton style={{ color: "white" }} onClick={toggleScreenShare}>
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

                    {/* Local (self) video — wrapped to support overlays */}
                    <div className="meetUserVideoWrapper">
                        <video
                            playsInline autoPlay muted
                            className="meetUserVideo"
                            ref={ref => {
                                if (ref && localVideoRef.current !== ref) {
                                    localVideoRef.current = ref;
                                }
                            }}
                        />
                        <div className="videoLabel localLabel">
                            <span>{username} (You)</span>
                            {!audio && <MicOffIcon className="micStatusIcon" />}
                        </div>
                        {!video && (
                            <div className="avatarPlaceholder localAvatar">
                                <span>{getInitials(username)}</span>
                            </div>
                        )}
                    </div>

                    {/* Remote participant videos */}
                    <div className={`conferenceView visible-${visibleVideos.length}`}>
                        {visibleVideos.map(v => {
                            const isDisconnected = v.connectionState === 'disconnected' || v.connectionState === 'failed';
                            const isConnecting = v.connectionState === 'checking' || v.connectionState === 'connecting';
                            const remoteVideoOff = remoteMediaStates[v.socketId]?.video === false;
                            const remoteAudioMuted = remoteMediaStates[v.socketId]?.audio === false;
                            const isSpeaking = activeSpeaker === v.socketId;

                            return (
                                <div key={v.socketId} className={`remoteVideoContainer ${isSpeaking ? 'activeSpeaker' : ''}`}>
                                    <video
                                        playsInline autoPlay muted
                                        data-socket={v.socketId}
                                        ref={ref => {
                                            if (ref && ref.srcObject !== v.stream) {
                                                ref.srcObject = v.stream;
                                            }
                                        }}
                                        onLoadedMetadata={e => {
                                            const el = e.target;
                                            el.muted = false; // Safari-friendly unmuting after loaded metadata event
                                            el.play().catch(() => {
                                                el.muted = true; // Fallback muted autoplay if gesture parsing fails
                                                el.play().catch(() => {});
                                            });
                                        }}
                                    />
                                    <div className="videoLabel">
                                        <span>{v.username || "Guest"}</span>
                                        {remoteAudioMuted && <MicOffIcon className="micStatusIcon" />}
                                    </div>

                                    {/* Video Mute Placeholder Card */}
                                    {remoteVideoOff && (
                                        <div className="avatarPlaceholder">
                                            <span>{getInitials(v.username)}</span>
                                        </div>
                                    )}

                                    {/* Connection status feedback overlays */}
                                    {isDisconnected && (
                                        <div className="connectionStatusOverlay disconnected">
                                            <div className="statusCard">
                                                <div className="pulseCircle red"></div>
                                                <p>Connection Interrupted</p>
                                            </div>
                                        </div>
                                    )}
                                    {isConnecting && (
                                        <div className="connectionStatusOverlay connecting">
                                            <div className="statusCard">
                                                <div className="pulseCircle blue"></div>
                                                <p>Reconnecting...</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Screen Share Error Modal */}
                    {showScreenShareError && (
                        <div className="shareErrorOverlay">
                            <div className="shareErrorCard">
                                <h3>Screen Sharing Unavailable</h3>
                                <p>
                                    Mobile operating systems (iOS, iPadOS, and Android) do not support screen sharing in web browsers due to security restrictions.
                                </p>
                                <p className="recommendText">
                                    To share your screen, please join this meeting on a laptop or desktop computer.
                                </p>
                                <div className="shareErrorActions">
                                    <Button 
                                        variant="contained" 
                                        onClick={() => {
                                            navigator.clipboard.writeText(window.location.href);
                                            triggerToast("Meeting link copied to clipboard!");
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

            {/* Notification system */}
            <Snackbar
                open={toastOpen}
                autoHideDuration={4000}
                message={toastMessage}
                onClose={() => setToastOpen(false)}
            />
        </div>
    );
}
