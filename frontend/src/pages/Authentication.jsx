import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import Snackbar from '@mui/material/Snackbar';
import "../styles/Authentication.css";

// TODO remove, this demo shouldn't need to reset the theme.

const defaultTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0E71EB',
    },
    secondary: {
      main: '#00d2ff',
    },
  },
});

export default function Authentication() {
  
  const [username, setUsername] = React.useState("");

  const [password, setPassword]= React.useState("");

  const [name, setName]= React.useState("");

  const [error, setError]= React.useState("");

  const [message, setMessage]= React.useState("");

  const [formState, setFormState] = React.useState(0);

  const [open , setOpen]= React.useState(false);

  const [loading, setLoading] = React.useState(false);

  const {handleLogin,handleRegister}=useContext(AuthContext);

  let handleAuth=async()=>{
      setLoading(true);
      try{

        if(formState===0){
            let result=await handleLogin(username,password);
            console.log(result);
            setMessage(result);
            setOpen(true);
            setError("");
            setPassword("");
            setUsername("");
        }

        if(formState===1){
            let result=await handleRegister(name,username,password);
            console.log(result);
            setMessage(result);
            setOpen(true);
            setError("");
            setFormState(0);
            setPassword("");
            setUsername("");
            setName("");
        }

      }catch(err){
        let message = err.response?.data?.message || err.message || "An error occurred";
        setError(message);
      } finally {
          setLoading(false);
      }
  }
  
  return (
    <ThemeProvider theme={defaultTheme}>
      <div className="authContainer">
        <CssBaseline />
        <Paper elevation={10} className="authCard">
          <Box className="authBox">
            <Avatar className="authAvatar">
              <LockOutlinedIcon />
            </Avatar>

            <h2 className="authHeader">
              {formState === 0 ? "Welcome Back" : "Create Account"}
            </h2>
            <p className="authSubHeader">
              {formState === 0 ? "Sign in to continue your meetings" : "Get started with your free account"}
            </p>

            <div className="tabContainer">
              <Button variant={formState===0?"contained":""} onClick={()=>setFormState(0)}>Sign In</Button>
              <Button variant={formState===1?"contained":""} onClick={()=>setFormState(1)}>Sign Up</Button>
            </div>

            <Box component="form" noValidate className="authForm">
            {formState===1?<TextField
                margin="normal"
                required
                fullWidth
                id="fullname"
                label="Full Name"
                name="fullname"
                value={name}
                autoFocus
                onChange={(e)=>setName(e.target.value)}
              />
              :<></>}
               
              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                value={username}
                autoFocus
                 onChange={(e)=>setUsername(e.target.value)}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                value={password}
                onChange={(e)=>setPassword(e.target.value)}
              />

              <p className="authError">{error}</p>
              <Button
                type="button"
                fullWidth
                variant="contained"
                className="submitButton"
                disabled={loading}
                onClick={handleAuth}
              >
                {loading ? "Loading..." : (formState===0?"Log In":"Register")}
              </Button>
            </Box>
          </Box>
        </Paper>
      </div>

      <Snackbar open={open} autoHideDuration={4000} message={message} onClose={() => setOpen(false)} />
    </ThemeProvider>
  );
}