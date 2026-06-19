import { useContext, useState, useEffect } from 'react'
import { AuthContext } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton'
import HomeIcon from '@mui/icons-material/Home'
import "./History.css"

export default function History() {


    const {getHistoryOfUser}=useContext(AuthContext)

    const [meetings,setMeetings]=useState([])

    const routTo=useNavigate();

    useEffect(()=>{
        const fetchHistory=async()=>{
            try{
                const history=await getHistoryOfUser()
                console.log(history)
                setMeetings(history);
            }catch(e){console.log(e)}
        }

        fetchHistory()
    },[getHistoryOfUser])

    let formatDate=(dateString)=>{

        const date=new Date(dateString);
        const day=date.getDate().toString().padStart(2, "0");
        const month=(date.getMonth()+1).toString().padStart(2, "0")
        const year=date.getFullYear()

        return `${day}/${month}/${year}`
    }

  return (
    <div className="historyContainer">
      <div className="historyHeader">
        <IconButton onClick={() => routTo("/home")} className="homeButton">
          <HomeIcon />
        </IconButton>
        <h2>Meeting History</h2>
      </div>
      
      <div className="historyCardsGrid">
        {meetings.length !== 0 ? (
          meetings.map((meeting, i) => {
            return (
              <Card variant="outlined" key={i} className="historyCard">
                <CardContent>
                  <Typography gutterBottom sx={{ color: 'text.secondary', fontSize: 14 }} className="cardCode">
                    Code: {meeting.meetingCode}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', mb: 1.5 }} className="cardDate">
                    Date: {formatDate(meeting.date)}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', mb: 1.5 }} className="cardUserId">
                    User ID: {meeting.user_id}
                  </Typography>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <p className="noMeetings">No meeting history found.</p>
        )}
      </div>
    </div>
  )
}
