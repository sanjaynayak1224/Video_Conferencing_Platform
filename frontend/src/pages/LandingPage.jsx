import "../styles/LandingPage.css"
import { Link, useNavigate } from 'react-router-dom'

function LandingPage() {

    const router= useNavigate();
  return (
    <div className='landingPageContainer'>

        <nav>
            <div className='navHeader'>
                <h2>Apna Video Call</h2>
            </div>
            <div className='navlist'>
                <p onClick={()=>{
                    router("/q23eqe")
                }}>Join as Guest</p>
                <p onClick={()=>{router("/auth")}}>Register</p>
                <div role="button" onClick={()=>{router("/auth")}}>
                    <p>Login</p>
                </div>
            </div>
        </nav>

         <div className="landingMainContainer">
            <div>
                <h1><span style={{color:"#0E71EB"}}>Connect</span> with your loved ones</h1>
                
                <p>Cover a distance by Apna Video Call</p>
                <div role="button" id="button">
                    <Link to={"/auth"}>Get Started</Link>
                </div>
            </div>

            <div>

                <img src="/mobile.jpg" alt=""/>

            </div>
         </div>

    </div>
  )
}

export default LandingPage