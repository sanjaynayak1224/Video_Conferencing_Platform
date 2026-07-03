/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import WithAuth from '../utils/WithAuth.jsx';
import { useNavigate } from 'react-router-dom';
import "../styles/HomeComponent.css";
import IconButton from '@mui/material/IconButton';
import RestoreIcon from '@mui/icons-material/Restore';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Snackbar from '@mui/material/Snackbar';

function HomeComponent() {
    const navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState('');
    const [toastOpen, setToastOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    const handleJoinVideoCall = () => {
        if (!meetingCode.trim()) {
            setToastMessage("Please enter a meeting code.");
            setToastOpen(true);
            return;
        }
        navigate(`/${meetingCode}`);
    };

    return (
        <div className="homePageContainer">
            <div className="navBar">
                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => navigate("/")}>
                    <h2>Apna Video Call</h2>
                </div>

                <div className="navActions">
                    <div className="historyBtn" onClick={() => navigate("/history")}>
                        <IconButton color="inherit">
                            <RestoreIcon />
                        </IconButton>
                        <p>History</p>
                    </div>
                    <Button className="logoutBtn" onClick={() => {
                        localStorage.removeItem("token");
                        navigate("/auth");
                    }}>Logout</Button>
                </div>
            </div>

            <div className="meetContainer">
                <div className="leftPanel">
                    <div className="joinCard">
                        <h2>Providing Quality Video Call just like Quality Education</h2>

                        <div className="joinInputGroup">
                            <TextField
                                className="meetInput"
                                placeholder="Enter meeting code"
                                variant="outlined"
                                value={meetingCode}
                                onChange={e => setMeetingCode(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleJoinVideoCall(); }}
                            />
                            <Button onClick={handleJoinVideoCall} variant="contained" className="joinBtn">Join</Button>
                        </div>
                    </div>
                </div>

                <div className="rightPanel">
                    <img src="/logo.svg" alt="Apna Video Call logo" className="heroLogo" />
                </div>
            </div>

            <Snackbar
                open={toastOpen}
                autoHideDuration={4000}
                message={toastMessage}
                onClose={() => setToastOpen(false)}
            />
        </div>
    );
}

export default WithAuth(HomeComponent);
