/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import httpstatus from 'http-status';
import server from '../environment';

export const AuthContext = createContext({});


const client=axios.create({
    baseURL: `${server}/api/v1/users`
})  



export const AuthProvider = ({children}) => {

    const authContext=useContext(AuthContext);

    const [userData,setUserData]=useState(authContext);


    const handleRegister=async(name,username,password)=>{
        let request=await client.post("/register",{
          name:name,
          username:username,
          password:password
        })

        if(request.status===httpstatus.CREATED){
            return request.data.message;
        }
    }

    const handleLogin=async(username,password)=>{
        let request=await client.post("/login",{
          username:username,
          password:password
        });
        if(request.status===httpstatus.OK){
            localStorage.setItem("token",request.data.token);
            router("/home");
            return request.data.message;
        }
    }

    const router=useNavigate();

    const getHistoryOfUser=async()=>{
        let request=await client.get("/get_all_activity",{
            params:{
                token:localStorage.getItem("token")
            }
        })
        console.log(request.data);
        return request.data;
    }

    const addToUserHistory=async(meetingCode)=>{
        let request=await client.post("/add_to_activity",{
            token:localStorage.getItem("token"),
            meeting_code:meetingCode
        })
        return request;
    }


    const data={
        userData, setUserData, getHistoryOfUser, addToUserHistory, handleRegister, handleLogin, router
    }

  
    return(
      <AuthContext.Provider value={data}>
          {children}
      </AuthContext.Provider>
    )
}