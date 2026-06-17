import React, { useContext, useState } from 'react'
import WithAuth from '../utils/WithAuth.jsx'
import { useNavigate } from 'react-router-dom'
import "../App.css"
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
      addToUserHistory(meetingCode)
      navigate(`/${meetingCode}`)
  }


  return (  
    <>  
        <div className="navBar">

        <div style={{display: 'flex', alignItems: 'center'}}>

          <h2>Apna Video Call</h2>
        </div>

        <div style={{display: 'flex', alignItems: 'center'}}>

          <IconButton onClick={
            ()=>{
              navigate("/history")
            }
          }>
              <RestoreIcon/>
          </IconButton>
          <p>History</p>
          <Button onClick={() => {
            localStorage.removeItem("token");
            navigate("/auth");
          }}>Logout</Button>
        </div>
        
    </div>

          
    <div className="meetContainer">

          <div className="leftPanel">
            <div>
                <h2>Providing Quality Video Call just like Quality Education</h2>

                <div style={{display:"flex",gap:"10px"}}>

                    <TextField onChange={e=>{setMeetingCode(e.target.value)}}></TextField>
                    <Button onClick={handleJoinVideoCall} variant="contained">Join</Button>

                </div>
            </div>
          </div>

          <div className="rightPanel">
            <img srcSet="./logo.svg"></img>
          </div>


    </div>

    </>
    
  )
}

export default WithAuth(HomeComponent)
