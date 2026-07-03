import { useState, useContext, useEffect } from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import Snackbar from '@mui/material/Snackbar';
import "../styles/Authentication.css";

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#0E71EB' },
        secondary: { main: '#00d2ff' },
    },
});

export default function Authentication() {
    const navigate = useNavigate();

    useEffect(() => {
        if (localStorage.getItem("token")) {
            navigate("/home");
        }
    }, [navigate]);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [formState, setFormState] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const { handleLogin, handleRegister } = useContext(AuthContext);

    const handleAuth = async () => {
        setLoading(true);
        try {
            if (formState === 0) {
                const result = await handleLogin(username, password);
                setMessage(result);
                setOpen(true);
                setError("");
                setPassword("");
                setUsername("");
            }

            if (formState === 1) {
                const result = await handleRegister(name, username, password);
                setMessage(result);
                setOpen(true);
                setError("");
                setFormState(0);
                setPassword("");
                setUsername("");
                setName("");
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || "An error occurred";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ThemeProvider theme={darkTheme}>
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
                            <Button variant={formState === 0 ? "contained" : "text"} onClick={() => setFormState(0)}>Sign In</Button>
                            <Button variant={formState === 1 ? "contained" : "text"} onClick={() => setFormState(1)}>Sign Up</Button>
                        </div>

                        <Box component="form" noValidate className="authForm">
                            {formState === 1 && (
                                <TextField
                                    margin="normal"
                                    required
                                    fullWidth
                                    id="fullname"
                                    label="Full Name"
                                    name="fullname"
                                    value={name}
                                    autoFocus
                                    onChange={(e) => setName(e.target.value)}
                                />
                            )}

                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                id="username"
                                label="Username"
                                name="username"
                                value={username}
                                autoFocus={formState === 0}
                                onChange={(e) => setUsername(e.target.value)}
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
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(); }}
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
                                {loading ? "Loading..." : (formState === 0 ? "Log In" : "Register")}
                            </Button>
                        </Box>
                    </Box>
                </Paper>
            </div>

            <Snackbar open={open} autoHideDuration={4000} message={message} onClose={() => setOpen(false)} />
        </ThemeProvider>
    );
}