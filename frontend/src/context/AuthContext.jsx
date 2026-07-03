/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import httpStatus from "http-status";
import server from "../config";

export const AuthContext = createContext({});

const client = axios.create({
    baseURL: `${server}/api/v1/users`
});

export const AuthProvider = ({ children }) => {
    const navigate = useNavigate();

    const handleRegister = useCallback(async (name, username, password) => {
        const response = await client.post("/register", { name, username, password });
        if (response.status === httpStatus.CREATED) {
            return response.data.message;
        }
    }, []);

    const handleLogin = useCallback(async (username, password) => {
        const response = await client.post("/login", { username, password });
        if (response.status === httpStatus.OK) {
            localStorage.setItem("token", response.data.token);
            navigate("/home");
            return response.data.message;
        }
    }, [navigate]);

    const getHistoryOfUser = useCallback(async () => {
        const response = await client.get("/get_all_activity", {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`
            }
        });
        return response.data;
    }, []);

    const addToUserHistory = useCallback(async (meetingCode) => {
        const response = await client.post("/add_to_activity", {
            meeting_code: meetingCode
        }, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`
            }
        });
        return response;
    }, []);

    const data = useMemo(() => ({
        getHistoryOfUser,
        addToUserHistory,
        handleRegister,
        handleLogin,
        navigate
    }), [getHistoryOfUser, addToUserHistory, handleRegister, handleLogin, navigate]);

    return (
        <AuthContext.Provider value={data}>
            {children}
        </AuthContext.Provider>
    );
};