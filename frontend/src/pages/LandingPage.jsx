import "../styles/LandingPage.css";
import { useNavigate } from 'react-router-dom';

function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className='landingPageContainer'>
            <nav>
                <div className='navHeader' style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
                    <h2>Apna Video Call</h2>
                </div>
                <div className='navlist'>
                    <p onClick={() => navigate("/q23eqe")}>Join as Guest</p>
                    <p onClick={() => navigate("/auth")}>Register</p>
                    <div role="button" onClick={() => navigate("/auth")}>
                        <p>Login</p>
                    </div>
                </div>
            </nav>

            <div className="landingMainContainer">
                <div>
                    <h1><span style={{ color: "#0E71EB" }}>Connect</span> with your loved ones</h1>
                    <p>Cover a distance by Apna Video Call</p>
                    <div role="button" id="button" onClick={() => navigate("/auth")}>
                        <span>Get Started</span>
                    </div>
                </div>

                <div>
                    <img src="/mobile.jpg" alt="Video conferencing on mobile devices" />
                </div>
            </div>
        </div>
    );
}

export default LandingPage;