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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PeopleIcon from '@mui/icons-material/People';
import Snackbar from '@mui/material/Snackbar';

const VIDEOS_PER_PAGE = 4;

export default function VideoMeetComponent() {
    const { url } = useParams();
    const routeTo = useNavigate();

    // UI state
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
    const [toastOpen, setToastOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [meetingDuration, setMeetingDuration] = useState(0);

    const showModalRef = useRef(false);
    const chatEndRef = useRef(null);
    const meetingStartRef = useRef(null);

    useEffect(() => {
        showModalRef.current = showModal;
    }, [showModal]);

    const triggerToast = useCallback((msg) => {
        setToastMessage(msg);
        setToastOpen(true);
    }, []);

    const handleIncomingChatMessage = useCallback((data, sender, isFromSelf) => {
        setMessages(prev => [...prev, { sender, data, timestamp: new Date().toISOString() }]);
        if (!isFromSelf && !showModalRef.current) {
            setNewMessages(n => n + 1);
        }
    }, []);

    const {
        connect: rtcConnect,
        disconnect: rtcDisconnect,
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
        activeSpeaker,
        localStream
    } = useWebRTC(url, username, handleIncomingChatMessage);

    // Lock viewport scrolling during active meeting
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

    // Keep local video element synced with localStream updates
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            if (localVideoRef.current.srcObject !== localStream) {
                localVideoRef.current.srcObject = localStream;
            }
        }
    }, [localStream, askForUsername, localVideoRef]);

    // Auto-rejoin from saved session
    useEffect(() => {
        if (shouldAutoJoin) {
            setTimeout(() => {
                rtcConnect().catch(err => {
                    console.error("Auto-rejoin failed:", err);
                    triggerToast("Failed to access media devices on re-join.");
                });
            }, 100);
        }
    }, [shouldAutoJoin, rtcConnect, triggerToast]);

    // Meeting duration timer
    useEffect(() => {
        if (!askForUsername && !meetingStartRef.current) {
            meetingStartRef.current = Date.now();
        }

        if (!askForUsername) {
            const interval = setInterval(() => {
                if (meetingStartRef.current) {
                    setMeetingDuration(Math.floor((Date.now() - meetingStartRef.current) / 1000));
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [askForUsername]);

    // Keep currentPage within bounds when remote streams change
    useEffect(() => {
        const maxPage = Math.max(0, Math.ceil(videos.length / VIDEOS_PER_PAGE) - 1);
        if (currentPage > maxPage) {
            Promise.resolve().then(() => {
                setCurrentPage(maxPage);
            });
        }
    }, [videos.length, currentPage]);

    // Auto-scroll chat to latest message
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Keyboard shortcuts (M = mic, V = video, Esc = close chat)
    useEffect(() => {
        if (askForUsername) return;

        const handleKeyDown = (e) => {
            // Don't trigger shortcuts when typing in input fields
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

            switch (e.key.toLowerCase()) {
                case "m":
                    toggleAudio();
                    break;
                case "v":
                    toggleVideo();
                    break;
                case "escape":
                    setModal(false);
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [askForUsername, toggleAudio, toggleVideo]);

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

    const sendChatMessage = () => {
        if (!message.trim()) return;
        rtcSendMessage(message);
        setMessage("");
    };

    const handleEndCall = () => {
        sessionStorage.removeItem(`apna_active_${url}`);
        meetingStartRef.current = null;
        rtcDisconnect();
        routeTo("/home");
    };

    const copyMeetingLink = () => {
        navigator.clipboard.writeText(window.location.href);
        triggerToast("Meeting link copied to clipboard!");
    };

    const getInitials = (name) => {
        if (!name) return "?";
        const parts = name.trim().split(" ");
        if (parts.length >= 2) {
            return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
        }
        return parts[0].substring(0, 2).toUpperCase();
    };

    const formatDuration = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        const pad = (n) => String(n).padStart(2, "0");
        return hrs > 0
            ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
            : `${pad(mins)}:${pad(secs)}`;
    };

    // Sort remote videos: active speaker floats to front
    const sortedVideos = [...videos].sort((a, b) => {
        if (a.socketId === activeSpeaker) return -1;
        if (b.socketId === activeSpeaker) return 1;
        return 0;
    });

    const maxPage = Math.max(0, Math.ceil(sortedVideos.length / VIDEOS_PER_PAGE) - 1);
    const visibleVideos = sortedVideos.slice(currentPage * VIDEOS_PER_PAGE, (currentPage + 1) * VIDEOS_PER_PAGE);

    // Eagerly bind localStream when local video DOM element mounts
    const localVideoRefCallback = useCallback((ref) => {
        if (ref && localVideoRef.current !== ref) {
            localVideoRef.current = ref;
            if (localStream && ref.srcObject !== localStream) {
                ref.srcObject = localStream;
            }
        }
    }, [localStream, localVideoRef]);

    return (
        <div className="meetMainPage">

            {askForUsername ? (
                <div className="lobbyContainer">
                    <h2>Enter the Lobby</h2>
                    <TextField
                        id="lobby-username"
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
                    <div className="lobbyActions">
                        <Button
                            variant="outlined"
                            startIcon={<ContentCopyIcon />}
                            onClick={copyMeetingLink}
                            className="copyLinkBtn"
                        >
                            Copy Meeting Link
                        </Button>
                    </div>
                    <div className="lobbyVideoContainer">
                        <video playsInline autoPlay muted ref={localVideoRefCallback} />
                    </div>
                </div>

            ) : (
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
                                disabled={currentPage >= maxPage}
                                onClick={() => setCurrentPage(prev => Math.min(maxPage, prev + 1))}
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
                                            <div key={index} className="chatBubble">
                                                <p className="chatSender">{item.sender}</p>
                                                <p className="chatText">{item.data}</p>
                                            </div>
                                        ))
                                        : <p className="emptyChat">No messages yet</p>
                                    }
                                    <div ref={chatEndRef} />
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

                    {/* Meeting info bar */}
                    <div className="meetingInfoBar">
                        <span className="meetingTimer">{formatDuration(meetingDuration)}</span>
                        <span className="participantCount">
                            <PeopleIcon fontSize="small" />
                            {videos.length + 1}
                        </span>
                    </div>

                    {/* Control buttons */}
                    <div className="buttonContainers">
                        <IconButton style={{ color: "white" }} onClick={toggleVideo} title="Toggle camera (V)">
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>

                        <IconButton className="endCallButton" onClick={handleEndCall} title="End call">
                            <CallEndIcon />
                        </IconButton>

                        <IconButton style={{ color: "white" }} onClick={toggleAudio} title="Toggle mic (M)">
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable && (
                            <IconButton style={{ color: "white" }} onClick={toggleScreenShare} title="Share screen">
                                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton>
                        )}

                        <Badge badgeContent={newMessages} max={999} color="secondary">
                            <IconButton
                                onClick={() => { setModal(m => !m); setNewMessages(0); }}
                                style={{ color: "white" }}
                                title="Chat"
                            >
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>

                    {/* Local (self) video */}
                    <div className="meetUserVideoWrapper">
                        <video
                            playsInline autoPlay muted
                            className="meetUserVideo"
                            ref={localVideoRefCallback}
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
                                            el.muted = false;
                                            el.play().catch(() => {
                                                el.muted = true;
                                                el.play().catch(() => {});
                                            });
                                        }}
                                    />
                                    <div className="videoLabel">
                                        <span>{v.username || "Guest"}</span>
                                        {remoteAudioMuted && <MicOffIcon className="micStatusIcon" />}
                                    </div>

                                    {remoteVideoOff && (
                                        <div className="avatarPlaceholder">
                                            <span>{getInitials(v.username)}</span>
                                        </div>
                                    )}

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

                    {/* Screen Share Error Dialog */}
                    {showScreenShareError && (
                        <div className="shareErrorOverlay">
                            <div className="shareErrorCard">
                                <h3>Screen Sharing Unavailable</h3>
                                <p>
                                    Mobile operating systems do not support screen sharing in web browsers due to security restrictions.
                                </p>
                                <p className="recommendText">
                                    To share your screen, please join this meeting on a laptop or desktop computer.
                                </p>
                                <div className="shareErrorActions">
                                    <Button variant="contained" onClick={copyMeetingLink}>
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

            <Snackbar
                open={toastOpen}
                autoHideDuration={4000}
                message={toastMessage}
                onClose={() => setToastOpen(false)}
            />
        </div>
    );
}
