import { useNavigate } from "react-router-dom";

const WithAuth = (WrappedComponent) => {
    const AuthComponent = (props) => {
        const navigate = useNavigate();
        const isAuthenticated = !!localStorage.getItem("token");

        // Redirect on next render cycle if not authenticated
        if (!isAuthenticated) {
            // Defer navigation to avoid calling during render
            Promise.resolve().then(() => navigate("/auth"));
            return null;
        }

        return <WrappedComponent {...props} />;
    };
    return AuthComponent;
};

export default WithAuth;