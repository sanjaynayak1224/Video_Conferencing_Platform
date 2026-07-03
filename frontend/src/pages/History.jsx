import { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import HomeIcon from '@mui/icons-material/Home';
import CircularProgress from '@mui/material/CircularProgress';
import "../styles/History.css";

export default function History() {
    const { getHistoryOfUser } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser();
                setMeetings(history);
            } catch (e) {
                console.error("Failed to fetch meeting history:", e);
                setError("Could not load meeting history. Please try again.");
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [getHistoryOfUser]);

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const formatTime = (dateString) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatDuration = (ms) => {
        if (!ms && ms !== 0) return "N/A";
        const totalSecs = Math.floor(ms / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;

        if (mins === 0) {
            return `${secs} sec${secs !== 1 ? 's' : ''}`;
        }
        return `${mins} min${mins !== 1 ? 's' : ''} ${secs} sec${secs !== 1 ? 's' : ''}`;
    };

    return (
        <div className="historyContainer">
            <div className="historyHeader">
                <IconButton onClick={() => navigate("/home")} className="homeButton">
                    <HomeIcon />
                </IconButton>
                <h2>Meeting History</h2>
            </div>

            {loading ? (
                <div className="historyLoading">
                    <CircularProgress sx={{ color: '#0E71EB' }} />
                    <p>Loading history...</p>
                </div>
            ) : error ? (
                <p className="noMeetings">{error}</p>
            ) : (
                <div className="historyCardsGrid">
                    {meetings.length !== 0 ? (
                        [...meetings].reverse().map((meeting, i) => (
                            <Card variant="outlined" key={meeting._id || i} className="historyCard">
                                <CardContent>
                                    <Typography gutterBottom sx={{ color: 'text.secondary', fontSize: 14 }} className="cardCode">
                                        Code: {meeting.meetingCode}
                                    </Typography>
                                    <Typography sx={{ color: 'text.secondary', mb: 1.2 }} className="cardDate">
                                        Date: {formatDate(meeting.date)}
                                    </Typography>
                                    <Typography sx={{ color: 'text.secondary', mb: 1.2 }} className="cardUserId">
                                        User ID: {meeting.user_id}
                                    </Typography>
                                    {meeting.joinedAt && (
                                        <>
                                            <Typography sx={{ color: '#ffffff', mb: 1.2 }} className="cardTime">
                                                Time: {formatTime(meeting.joinedAt)} - {meeting.leftAt ? formatTime(meeting.leftAt) : "Present"}
                                            </Typography>
                                            <Typography sx={{ color: '#ffffff', mb: 0 }} className="cardDuration">
                                                Duration: {meeting.duration !== undefined && meeting.duration !== null ? formatDuration(meeting.duration) : "Active"}
                                            </Typography>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <p className="noMeetings">No meeting history found.</p>
                    )}
                </div>
            )}
        </div>
    );
}
