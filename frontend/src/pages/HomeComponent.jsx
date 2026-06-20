/* eslint-disable react-refresh/only-export-components */
import { useContext, useState } from 'react'
import WithAuth from '../utils/WithAuth.jsx'
import { useNavigate } from 'react-router-dom'
import "../styles/HomeComponent.css"
import IconButton from '@mui/material/IconButton';
import RestoreIcon from '@mui/icons-material/Restore';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { AuthContext } from '../context/AuthContext.jsx';

function HomeComponent() {

  let navigate = useNavigate()


  const [meetingCode, setMeetingCode] = useState('')
  
  const {addToUserHistory}=useContext(AuthContext)

  let handleJoinVideoCall = () => {
      if (!meetingCode.trim()) {
          alert("Please enter a meeting code.");
          return;
      }
      addToUserHistory(meetingCode);
      navigate(`/${meetingCode}`);
  }


  return (  
    <div className="homePageContainer">  
        <div className="navBar">

          <div style={{display: 'flex', alignItems: 'center'}}>
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
                      onChange={e => setMeetingCode(e.target.value)}
                    />
                    <Button onClick={handleJoinVideoCall} variant="contained" className="joinBtn">Join</Button>
                </div>
            </div>
          </div>

          <div className="rightPanel">
            <img src="/logo.svg" alt="logo" className="heroLogo" />
          </div>

        </div>
    </div>
  )
}

export default WithAuth(HomeComponent)
