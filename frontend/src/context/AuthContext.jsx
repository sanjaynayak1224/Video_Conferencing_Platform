import { createContext, useContext, useState } from 'react'
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import httpstatus from 'http-status';

export const AuthContext = createContext({});


const client=axios.create({
    baseURL: 'http://localhost:8080/api/v1/users'
})  



export const AuthProvider = ({children}) => {

    const authContext=useContext(AuthContext);

    const [userData,setUserData]=useState(authContext);


    const handleRegister=async(name,username,password)=>{
          try{
              let request=await client.post("/register",{
                name:name,
                username:username,
                password:password
              })

              if(request.status===httpstatus.CREATED){
                  return request.data.message;
              }

          }catch(err){
              throw err;
          }

    }

    const handleLogin=async(username,password)=>{
        try{
            let request=await client.post("/login",{
              username:username,
              password:password
            });
            if(request.status===httpstatus.OK){
                localStorage.setItem("token",request.data.token);
                router("/home");
                return request.data.message;
            }

        }catch(err){
            throw err;
        }
    }

    const router=useNavigate();

    const getHistoryOfUser=async()=>{
        try{
            let request=await client.get("/get_all_activity",{
                params:{
                    token:localStorage.getItem("token")
                }
            })
            console.log(request.data);
            return request.data;
        }catch(err){throw err};
    }

    const addToUserHistory=async(meetingCode)=>{
        try{
            let request=await client.post("/add_to_activity",{
                token:localStorage.getItem("token"),
                meeting_code:meetingCode
            })
            return request;
        }catch(e){throw e};
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