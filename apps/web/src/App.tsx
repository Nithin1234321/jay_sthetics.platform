import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { api, apiBlob } from "./lib/api";
import { downloadExcel } from "./lib/excel";

type User={id:string;fullName:string;email:string;role:"ADMIN"|"CLIENT"};
type Program={id:string;slug:string;name:string;description:string;pricePaise:number;durationDays?:number|null;isActive:boolean};
type Overview={clients:number;activeSubscriptions:number;newLeads:number;upcomingAppointments:number;recentCheckIns:number;revenuePaise:number;exercises:number};

const fallback:Program[]=[
{id:"n3",slug:"natural-3-months",name:"Natural Training — 3 Months",description:"Training, nutrition, weekly check-ins and progress support.",pricePaise:900000,durationDays:90,isActive:true},
{id:"n6",slug:"natural-6-months",name:"Natural Training — 6 Months",description:"Long-term structured coaching and accountability.",pricePaise:1500000,durationDays:180,isActive:true},
{id:"e3",slug:"enhanced-3-months",name:"Enhanced Training — 3 Months",description:"Detailed training, nutrition and progress management.",pricePaise:1200000,durationDays:90,isActive:true},
{id:"e6",slug:"enhanced-6-months",name:"Enhanced Training — 6 Months",description:"Complete six-month coaching and progress support.",pricePaise:2000000,durationDays:180,isActive:true}
];
const loadUser=()=>{try{return JSON.parse(localStorage.getItem("user")||"null") as User|null}catch{return null}};
const money=(paise:number)=>`₹${(paise/100).toLocaleString("en-IN")}`;
const date=(v:string)=>new Date(v).toLocaleString();

function PasswordField({
  name = "password",
  placeholder = "Enter your password",
  autoComplete = "current-password",
  minLength,
  required = true,
  value,
  onChange
}: {
  name?: string;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  value?: string;
  onChange?: (e:ChangeEvent<HTMLInputElement>)=>void;
}){
  const [showPassword,setShowPassword]=useState(false);

  return <div style={{position:"relative",width:"100%"}}>
    <input
      name={name}
      type={showPassword?"text":"password"}
      placeholder={placeholder}
      autoComplete={autoComplete}
      minLength={minLength}
      required={required}
      value={value}
      onChange={onChange}
      style={{width:"100%",paddingRight:"72px"}}
    />
    <button
      type="button"
      onClick={()=>setShowPassword(v=>!v)}
      aria-label={showPassword?"Hide password":"Show password"}
      style={{
        position:"absolute",
        right:"12px",
        top:"50%",
        transform:"translateY(-50%)",
        border:"0",
        background:"transparent",
        color:"inherit",
        cursor:"pointer",
        fontSize:"12px",
        fontWeight:700,
        padding:"6px"
      }}
    >
      {showPassword?"HIDE":"SHOW"}
    </button>
  </div>;
}

export default function App(){
  const [programs,setPrograms]=useState<Program[]>(fallback);
  const [modal,setModal]=useState<"login"|"signup"|"call"|"message"|null>(null);
  const [notice,setNotice]=useState("");
  const [user,setUser]=useState<User|null>(loadUser());
  const [selectedProgram,setSelectedProgram]=useState<Program|null>(null);
  const [admin2FA,setAdmin2FA]=useState<{
    email:string;
    password:string;
  }|null>(null);
  const path=location.pathname;

  useEffect(()=>{api<Program[]>("/programs").then(setPrograms).catch(()=>{})},[]);

  function session(token:string,u:User,next?:string){
    localStorage.setItem("token",token);
    localStorage.setItem("user",JSON.stringify(u));
    setUser(u);
    location.href=next||(u.role==="ADMIN"?"/coach-panel":"/dashboard");
  }
  async function login(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const f=new FormData(e.currentTarget);
    try{
      const r=await api<{token?:string;user?:User;requires2FA?:boolean;requiresEmailVerification?:boolean;email?:string;devCode?:string;message?:string}>("/auth/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password"),adminCode:f.get("adminCode")||undefined})});
      if(r.requires2FA){
        setAdmin2FA({
          email:String(f.get("email")),
          password:String(f.get("password"))
        });
        setNotice("Enter the 6-digit verification code sent to your email.");
        return;
      }
      if(r.requiresEmailVerification&&r.email){
        if(r.devCode)sessionStorage.setItem("devVerificationCode",r.devCode);
        const programId=new URLSearchParams(location.search).get("programId");
        location.href=`/verify-email?email=${encodeURIComponent(r.email)}${programId?`&programId=${encodeURIComponent(programId)}`:""}`;return;
      }
      if(!r.token||!r.user)throw new Error("Login could not be completed");
      const checkoutProgram=new URLSearchParams(location.search).get("programId");
      const nextProgram=selectedProgram?.id||((["/checkout","/signup"].includes(location.pathname)&&checkoutProgram)?checkoutProgram:null);
      session(r.token,r.user,nextProgram&&r.user.role==="CLIENT"?`/checkout?programId=${nextProgram}`:undefined);
    }catch(e:any){setNotice(e.message)}
  }
  async function verifyAdmin2FA(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!admin2FA) return;

    const f=new FormData(e.currentTarget);
    const adminCode=String(f.get("adminCode")||"").trim();

    if(!/^[0-9]{6}$/.test(adminCode)){
      setNotice("Enter a valid 6-digit verification code.");
      return;
    }

    try{
      const r=await api<{
        token?:string;
        user?:User;
      }>("/auth/login",{
        method:"POST",
        body:JSON.stringify({
          email:admin2FA.email,
          password:admin2FA.password,
          adminCode
        })
      });

      if(!r.token||!r.user){
        throw new Error("Two-factor authentication could not be completed.");
      }

      setAdmin2FA(null);
      session(r.token,r.user);
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function register(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const f=new FormData(e.currentTarget);
    try{
      const r=await api<{token?:string;user?:User;requiresVerification?:boolean;email?:string;devCode?:string;message?:string}>("/auth/register",{method:"POST",body:JSON.stringify({fullName:f.get("fullName"),email:f.get("email"),phone:f.get("phone"),password:f.get("password")})});
      const signupProgram=new URLSearchParams(location.search).get("programId");
      const nextProgram=selectedProgram?.id||signupProgram;
      if(r.requiresVerification&&r.email){
        if(r.devCode)sessionStorage.setItem("devVerificationCode",r.devCode);
        location.href=`/verify-email?email=${encodeURIComponent(r.email)}${nextProgram?`&programId=${encodeURIComponent(nextProgram)}`:""}`;return;
      }
      if(!r.token||!r.user)throw new Error(r.message||"Registration could not be completed");
      session(r.token,r.user,nextProgram?`/checkout?programId=${nextProgram}`:undefined);
    }catch(e:any){setNotice(e.message)}
  }

  function chooseProgram(p:Program){
    setSelectedProgram(p);
    if(user?.role==="CLIENT"){
      location.href=`/checkout?programId=${p.id}`;
      return;
    }
    location.href=`/signup?programId=${p.id}`;
  }

  async function submitLead(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    try{await api("/leads",{method:"POST",body:JSON.stringify({fullName:f.get("fullName"),email:f.get("email"),phone:f.get("phone"),fitnessGoal:f.get("goal"),message:f.get("message")})});setNotice("Message sent. Jay can follow up with you.");setModal(null)}
    catch(e:any){setNotice(e.message)}
  }
  async function schedulePublicCall(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    try{await api("/appointments",{method:"POST",body:JSON.stringify({fullName:f.get("fullName"),email:f.get("email"),phone:f.get("phone"),preferredAt:new Date(`${f.get("date")}T${f.get("time")}:00+05:30`).toISOString(),reason:f.get("reason")})});setNotice("Call request submitted.");setModal(null)}
    catch(e:any){setNotice(e.message)}
  }

  function logout(){localStorage.clear();location.href="/"}

  if(path==="/forgot-password") return <ForgotPassword/>;
  if(path==="/verify-email") return <VerifyEmail session={session}/>;

  if(path==="/programs"){
    return <ProgramsPage programs={programs} user={user} chooseProgram={chooseProgram}/>;
  }

  if(path==="/signup"){
    const programId=new URLSearchParams(location.search).get("programId");
    const selected=programs.find(p=>p.id===programId)||null;
    return <SignupPage program={selected} register={register} login={login} notice={notice}/>;
  }

  if(path==="/checkout"){
    if(!user) return <AccessGate title="Client Login" login={login} notice={notice}/>;
    if(user.role!=="CLIENT") return <div className="gate"><div className="modalCard"><h2>Client checkout only</h2><a className="btn red full" href="/coach-panel">Return to coach panel</a></div></div>;
    return <CheckoutPage user={user}/>;
  }

  if(path==="/coach-panel"){
    if(!user||user.role!=="ADMIN"){
      if(admin2FA){
        return (
          <div className="gate">
            <div className="modalCard">
              <div className="modalAuthHead">
                <span>ADMIN SECURITY</span>
                <h2>Two-Factor Authentication</h2>
                <p>
                  Enter the 6-digit verification code sent to
                  <br/>
                  <strong>{admin2FA.email}</strong>
                </p>
              </div>

              {notice&&<div className="notice">{notice}</div>}

              <form className="authForm compact" onSubmit={verifyAdmin2FA}>
                <label>
                  Verification code
                  <input
                    name="adminCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    autoFocus
                    required
                  />
                </label>

                <button className="btn red full authSubmit" type="submit">
                  Verify & Sign In
                </button>

                <button
                  type="button"
                  className="btn ghost full"
                  onClick={()=>{
                    setAdmin2FA(null);
                    setNotice("");
                  }}
                >
                  Back to Login
                </button>
              </form>
            </div>
          </div>
        );
      }

      return <AccessGate title="Coach Access" login={login} notice={notice}/>;
    }

    return <CoachPanel user={user} logout={logout}/>;
  }
  if(path==="/dashboard"){
    if(!user) return <AccessGate title="Client Login" login={login} notice={notice}/>;
    return <ClientPanel user={user} logout={logout}/>;
  }

  return <div className="publicPage">
    <header>
      <a className="brand" href="/"><b>jay.</b><span>__sthetics</span></a>
      <nav><a href="#home">Home</a><a href="#about">About Jay</a><a href="/programs">Programs</a><a href="#contact">Contact</a></nav>
      <div className="actions">{user?.role==="CLIENT"?<a className="btn ghost" href="/dashboard">My Dashboard</a>:<button className="btn ghost" onClick={()=>setModal("login")}>Client Login</button>}<a className="btn red" href="/programs">Get Started</a></div>
    </header>
    {notice&&<div className="notice" onClick={()=>setNotice("")}>{notice} ×</div>}
    <main>
      <section className="hero" id="home"><div className="heroInner">
        <p className="eyebrow">TRANSFORM YOUR <i>BODY.</i><br/>ELEVATE YOUR <i>LIFE.</i></p>
        <h1>jay.<br/><span>__sthetics</span></h1><h2>Online Coaching. Real Results.</h2>
        <p className="muted">Personalized training, nutrition, weekly check-ins and direct coaching support in one platform.</p>
        <div className="heroButtons"><a className="btn red" href="/programs">View Coaching →</a><button className="btn ghost" onClick={()=>setModal("call")}>Schedule a Call</button></div>
      </div></section>
      <section className="featureRow">
        <div><b>🏋 Training</b><span>Workout splits, videos and alternatives.</span></div>
        <div><b>🍎 Nutrition</b><span>Macros and flexible meal options.</span></div>
        <div><b>📈 Progress</b><span>Weekly check-ins and strength tracking.</span></div>
        <div><b>💬 Coaching</b><span>Private chat and designated call hours.</span></div>
      </section>
      <section className="section" id="programs"><p className="eyebrow redText">COACHING PROGRAMMES</p><h2>CHOOSE YOUR PROGRAMME</h2>
        <div className="cards">{programs.filter(p=>p.isActive!==false).map((p,i)=><article className="card" key={p.id}>
          <img src={i<2?"/assets/jay-stage-1.jpeg":"/assets/jay-stage-2.jpeg"} alt={p.name}/>
          <div className="cardBody"><div className="pill">{p.name.includes("Natural")?"NATURAL":"ENHANCED"}</div><h3>{p.name}</h3><p>{p.description}</p><strong>{money(p.pricePaise)}</strong><button className="btn red full" onClick={()=>chooseProgram(p)}>Join Coaching</button></div>
        </article>)}</div>
      </section>
      <section className="about" id="about"><img src="/assets/jay-stage-2.jpeg" alt="Jay"/><div><p className="eyebrow redText">ABOUT JAY</p><h2>COACH. ATHLETE. MENTOR.</h2><p>Structured training, practical nutrition, accountability and measurable progress.</p><div className="stats"><b>1:1<span>Coaching</span></b><b>WEEKLY<span>Check-ins</span></b><b>24/7<span>Dashboard access</span></b></div></div></section>
      <section className="section"><p className="eyebrow redText">MEMBERS ONLY</p><h2>YOUR COACHING HUB</h2>
        <div className="hubGrid">{["Training & Form Videos","Exercise Alternatives","Nutrition & Macro Options","Weekly Check-ins","Progress Tracking","Private Chat","Coaching Calls"].map(x=><div key={x}><span>🔒</span><b>{x}</b><small>Active subscribers only</small></div>)}</div>
      </section>
      <section className="cta" id="contact"><div><h2>READY TO TRANSFORM?</h2><p>Choose your programme or speak with Jay before joining.</p><a className="btn red" href="/programs">Choose Programme</a><button className="btn ghost" onClick={()=>setModal("call")}>Schedule a Call</button><button className="btn ghost" onClick={()=>setModal("message")}>Message Jay</button></div></section>
    </main>
    <footer><div className="brand"><b>jay.</b><span>__sthetics</span></div><span>© 2026 jay.__sthetics</span></footer>
    {modal&&<div className="modal" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><div className="modalCard"><button className="close" onClick={()=>setModal(null)}>×</button>
      {modal==="login"&&<><div className="modalAuthHead"><span>WELCOME BACK</span><h2>Client Login</h2><p>Access your training, nutrition, progress and coaching support.</p></div><form className="authForm compact" onSubmit={login}><label>Email address<input name="email" type="email" placeholder="name@example.com" autoComplete="email" required/></label><label>Password<PasswordField placeholder="Enter your password" autoComplete="current-password"/></label><div className="authOptions"><span>Your account is protected</span><a href="/forgot-password">Forgot password?</a></div><button className="btn red full authSubmit">Sign In</button></form><div className="modalLoginFooter"><span>Don't have an account?</span><button onClick={()=>{setModal(null);location.href="/programs"}}>View programmes</button></div></>}
      {modal==="signup"&&<><h2>Start Coaching</h2>{selectedProgram&&<div className="selectedPlanMini"><small>SELECTED PROGRAMME</small><b>{selectedProgram.name}</b><span>{money(selectedProgram.pricePaise)}</span></div>}<form onSubmit={register}><input name="fullName" placeholder="Full name" required/><input name="email" type="email" placeholder="Email" required/><input name="phone" placeholder="Phone" required/><PasswordField placeholder="Create password" autoComplete="new-password" minLength={8}/><button className="btn red full">Create Account</button></form>{selectedProgram&&<div className="modalLoginFooter"><span>Already have an account?</span><button onClick={()=>setModal("login")}>Sign in instead</button></div>}</>}
      {modal==="call"&&<><div className="modalAuthHead"><span>CONSULTATION</span><h2>Schedule a Call</h2><p>Talk with Jay before choosing your coaching programme. Times are shown in India Standard Time (IST).</p></div><form className="authForm compact" onSubmit={schedulePublicCall}><label>Full name<input name="fullName" required/></label><label>Email<input name="email" type="email" required/></label><label>Phone<input name="phone" required/></label><div className="formGrid"><label>Date<input name="date" type="date" required/></label><label>Time (IST)<input name="time" type="time" required/></label></div><label>What do you want to discuss?<textarea name="reason"/></label><button className="btn red full">Request Call</button></form></>}
      {modal==="message"&&<><div className="modalAuthHead"><span>CONTACT JAY</span><h2>Send a Message</h2><p>Leave your details and Jay can follow up.</p></div><form className="authForm compact" onSubmit={submitLead}><label>Full name<input name="fullName" required/></label><label>Email<input name="email" type="email" required/></label><label>Phone<input name="phone"/></label><label>Goal<input name="goal" placeholder="e.g. fat loss / muscle gain"/></label><label>Message<textarea name="message" required/></label><button className="btn red full">Send Message</button></form></>}
    </div></div>}
  </div>;
}

function VerifyEmail({session}:{session:(token:string,u:User,next?:string)=>void}){
  const params=new URLSearchParams(location.search);
  const email=params.get("email")||"";
  const programId=params.get("programId");
  const [code,setCode]=useState("");
  const [msg,setMsg]=useState(()=>{
    const test=sessionStorage.getItem("devVerificationCode");
    return test?`Development test code: ${test}`:"Enter the 6-digit code sent to your email.";
  });
  async function verify(e:FormEvent){
    e.preventDefault();
    try{
      const r=await api<{token:string;user:User}>("/auth/register/verify",{method:"POST",body:JSON.stringify({email,code})});
      sessionStorage.removeItem("devVerificationCode");
      session(r.token,r.user,programId&&r.user.role==="CLIENT"?`/checkout?programId=${programId}`:undefined);
    }catch(e:any){setMsg(e.message)}
  }
  async function resend(){
    try{
      const r=await api<any>("/auth/verification/resend",{method:"POST",body:JSON.stringify({email})});
      if(r.devCode)sessionStorage.setItem("devVerificationCode",r.devCode);
      setMsg(`${r.message}${r.devCode?` Development test code: ${r.devCode}`:""}`);
    }catch(e:any){setMsg(e.message)}
  }
  return <div className="authPage"><div className="authVisual"><div className="authVisualShade"></div><a className="brand authBrand" href="/"><b>jay.</b><span>__sthetics</span></a><div className="authVisualCopy"><p className="eyebrow">VERIFY. <i>ACTIVATE.</i></p><h1>ONE CODE.<br/><span>FULL ACCESS.</span></h1><p>Confirm your coaching account before continuing to checkout and your private dashboard.</p></div></div><div className="authPanel"><div className="authPanelInner"><div className="authHeader"><span className="authKicker">EMAIL VERIFICATION</span><h2>Verify Your Account</h2><p>We generated a 6-digit verification code for <b>{email}</b>.</p></div>{msg&&<div className="authError">{msg}</div>}<form className="authForm" onSubmit={verify}><label>Verification code<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required/></label><button className="btn red authSubmit">Verify & Continue</button></form><button className="authResend" onClick={resend}>Generate another code</button><p className="authSecurity">🔒 Codes expire after 10 minutes and can only be used once.</p></div></div></div>;
}

function ForgotPassword(){
  const [email,setEmail]=useState(""); const [code,setCode]=useState(""); const [password,setPassword]=useState(""); const [step,setStep]=useState<1|2>(1); const [msg,setMsg]=useState("");
  async function request(e:FormEvent){e.preventDefault();try{const r=await api<any>("/auth/password/request",{method:"POST",body:JSON.stringify({email})});setMsg(`${r.message}${r.devCode?` Test code: ${r.devCode}`:""}`);setStep(2)}catch(e:any){setMsg(e.message)}}
  async function reset(e:FormEvent){e.preventDefault();try{const r=await api<any>("/auth/password/reset",{method:"POST",body:JSON.stringify({email,code,password})});setMsg(r.message);setTimeout(()=>location.href="/dashboard",900)}catch(e:any){setMsg(e.message)}}
  return <div className="authPage"><div className="authVisual"><div className="authVisualShade"></div><a className="brand authBrand" href="/"><b>jay.</b><span>__sthetics</span></a><div className="authVisualCopy"><p className="eyebrow">SECURE ACCOUNT <i>RECOVERY.</i></p><h1>RESET.<br/><span>RETURN.</span></h1><p>Recover your coaching account securely with a one-time verification code.</p></div></div><div className="authPanel"><div className="authPanelInner"><div className="authHeader"><span className="authKicker">ACCOUNT SECURITY</span><h2>Reset Password</h2><p>{step===1?"Enter the email used for your coaching account.":"Enter your verification code and choose a new password."}</p></div>{msg&&<div className="authError">{msg}</div>}{step===1?<form className="authForm" onSubmit={request}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><button className="btn red authSubmit">Send Verification Code</button></form>:<form className="authForm" onSubmit={reset}><label>Verification code<input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={6} required/></label><label>New password<PasswordField value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters" autoComplete="new-password" minLength={8}/></label><button className="btn red authSubmit">Update Password</button></form>}<a className="authTextLink" href="/dashboard">Back to sign in</a></div></div></div>;
}

function AccessGate({title,login,notice}:{title:string;login:(e:FormEvent<HTMLFormElement>)=>void;notice?:string}){
  const isCoach=title.toLowerCase().includes("coach");
  return <div className="authPage">
    <div className="authVisual">
      <div className="authVisualShade"></div>
      <a className="brand authBrand" href="/"><b>jay.</b><span>__sthetics</span></a>
      <div className="authVisualCopy">
        <p className="eyebrow">BUILD YOUR <i>BEST PHYSIQUE.</i></p>
        <h1>COACHING.<br/><span>STRUCTURED.</span></h1>
        <p>Training, nutrition, check-ins and progress — all managed in one place.</p>
      </div>
      <div className="authVisualFooter"><span>jay.__sthetics</span><span>ONLINE COACHING</span></div>
    </div>

    <div className="authPanel">
      <div className="authPanelInner">
        <a className="brand mobileAuthBrand" href="/"><b>jay.</b><span>__sthetics</span></a>
        <div className="authHeader">
          <span className="authKicker">{isCoach?"PRIVATE COACH PORTAL":"WELCOME BACK"}</span>
          <h2>{title}</h2>
          <p>{isCoach?"Authorized jay.__sthetics coach access only.":"Sign in to access your coaching dashboard."}</p>
        </div>
        {notice&&<div className="authError">{notice}</div>}

        <form className="authForm" onSubmit={login}>
          <label>Email address
            <input name="email" type="email" placeholder="name@example.com" autoComplete="email" required/>
          </label>
          <label>Password
            <PasswordField placeholder="Enter your password" autoComplete="current-password"/>
          </label>
          {isCoach&&<label>Admin verification code <input name="adminCode" inputMode="numeric" maxLength={6} placeholder="Enter after password check"/></label>}
          <div className="authOptions">
            <span>{isCoach?"Secure admin access":"Your account is protected"}</span>
            {!isCoach&&<a href="/forgot-password">Forgot password?</a>}
          </div>
          <button className="btn red authSubmit">Sign In</button>
        </form>

        {!isCoach&&<>
          <div className="authDivider"><span>New to jay.__sthetics?</span></div>
          <a href="/programs" className="btn red full authSecondary">Create Account / Join Coaching</a>
          <a href="/programs" className="authTextLink">View coaching programmes and pricing</a>
        </>}

        <p className="authSecurity">🔒 Secure access · Client data protected</p>
      </div>
    </div>
  </div>
}

const adminTabs=["overview","clients","leads","programs","exercise library","workout plans","nutrition","check-ins","calls","messages","payments","settings"];

function CoachPanel({user,logout}:{user:User;logout:()=>void}){
  const [tab,setTab]=useState("overview");
  const [notice,setNotice]=useState("");
  return <div className="appShell">
    <Sidebar items={adminTabs} tab={tab} setTab={setTab} logout={logout}/>
    <main className="dash premiumDash">
      <div className="dashTop premiumTop"><div><small className="redText">jay.__sthetics · ADMIN</small><h1>{tab.toUpperCase()}</h1><p>Manage coaching operations from one place.</p></div><div className="topRight"><div className="topStatus"><span></span>Online</div><div className="avatar premiumAvatar">{user.fullName?.split(" ").map((x:string)=>x[0]).join("").slice(0,2)}</div></div></div>
      {notice&&<div className="inlineNotice">{notice}</div>}
      {tab==="overview"&&<AdminOverview/>}
      {tab==="clients"&&<AdminClients setNotice={setNotice}/>} 
      {tab==="leads"&&<AdminLeads setNotice={setNotice}/>}
      {tab==="programs"&&<AdminPrograms setNotice={setNotice}/>}
      {tab==="exercise library"&&<AdminExercises setNotice={setNotice}/>}
      {tab==="workout plans"&&<AdminWorkouts setNotice={setNotice}/>}
      {tab==="nutrition"&&<AdminNutrition setNotice={setNotice}/>}
      {tab==="check-ins"&&<AdminCheckins/>}
      {tab==="calls"&&<AdminCalls setNotice={setNotice}/>}
      {tab==="messages"&&<AdminMessages/>}
      {tab==="payments"&&<AdminPayments/>}
      {tab==="settings"&&<AdminSettings setNotice={setNotice}/>}
    </main>
  </div>
}

function Sidebar({items,tab,setTab,logout}:{items:string[];tab:string;setTab:(x:string)=>void;logout:()=>void}){
  const icon=(x:string)=>({
    overview:"◫",clients:"◉",leads:"◎",programs:"▦","exercise library":"✦","workout plans":"⌁",nutrition:"◇","check-ins":"✓",calls:"☎",messages:"✉",payments:"▣",settings:"⚙",
    dashboard:"◫",onboarding:"◎",training:"⌁",progress:"↗","weekly check-in":"✓",chat:"✉"
  } as Record<string,string>)[x]||"•";
  return <aside className="sidebar premiumSidebar">
    <div className="sidebarBrandWrap"><div className="brand"><b>jay.</b><span>__sthetics</span></div><small>COACHING PLATFORM</small></div>
    <div className="sidebarNav">{items.map(x=><button key={x} className={tab===x?"sideActive":""} onClick={()=>setTab(x)}><span className="sideIcon">{icon(x)}</span><span>{x}</span></button>)}</div>
    <div className="sidebarFooter"><button className="logoutBtn" onClick={logout}><span>↪</span><span>Logout</span></button></div>
  </aside>
}

function AdminOverview(){
  const [o,setO]=useState<Overview|null>(null);
  useEffect(()=>{api<Overview>("/admin/overview").then(setO).catch(()=>{})},[]);
  const rows=[
    ["Active Clients",o?.clients,"Current coaching clients"],
    ["Subscriptions",o?.activeSubscriptions,"Paid active access"],
    ["New Leads",o?.newLeads,"Waiting for follow-up"],
    ["Upcoming Calls",o?.upcomingAppointments,"Scheduled coaching calls"],
    ["Check-ins",o?.recentCheckIns,"Submitted this week"],
    ["Exercise Library",o?.exercises,"Available form videos"],
    ["Revenue",o?money(o.revenuePaise):"—","Successful payments"]
  ];
  return <div className="overviewLayout">
    <div className="overviewHero">
      <div><span className="overviewKicker">COACHING OPERATIONS</span><h2>Everything Jay needs, in one dashboard.</h2><p>Track clients, revenue, progress, messages and coaching activity without jumping between tools.</p></div>
      <div className="heroPulse"><span></span><b>System Active</b><small>Local development</small></div>
    </div>
    <div className="metricGrid premiumMetrics">{rows.map(([a,b,c])=><div className="metric premiumMetric" key={String(a)}><div className="metricTop"><small>{a}</small><span>↗</span></div><b>{b??"—"}</b><p>{c}</p></div>)}</div>
    <div className="adminGrid2">
      <div className="infoPanel premiumPanel"><div className="panelTitle"><div><small>QUICK ACCESS</small><h3>Daily Workflow</h3></div></div><div className="quickLinks"><div><b>Clients</b><span>Review coaching status and assign plans</span></div><div><b>Check-ins</b><span>Review weekly progress and adherence</span></div><div><b>Messages</b><span>Respond to client questions</span></div><div><b>Payments</b><span>Review successful and pending records</span></div></div></div>
      <div className="infoPanel premiumPanel"><div className="panelTitle"><div><small>PLATFORM</small><h3>Coaching Hub</h3></div></div><div className="platformStatus"><div><span></span><b>Database</b><small>Connected</small></div><div><span></span><b>Client Portal</b><small>Active</small></div><div><span></span><b>Admin Portal</b><small>Protected</small></div><div><span></span><b>Payments</b><small>Test-ready</small></div></div></div>
    </div>
  </div>;
}

function AdminClients({setNotice}:{setNotice:(s:string)=>void}){
  const [clients,setClients]=useState<any[]>([]),[programs,setPrograms]=useState<Program[]>([]),[workouts,setWorkouts]=useState<any[]>([]),[nutrition,setNutrition]=useState<any[]>([]),[q,setQ]=useState("");
  const [selected,setSelected]=useState<any|null>(null),[showNew,setShowNew]=useState(false),[clientTab,setClientTab]=useState("overview");
  async function load(){const [r,p,w,n]=await Promise.all([api<any>(`/admin/clients?q=${encodeURIComponent(q)}`),api<Program[]>("/admin/programs"),api<any[]>("/admin/workout-plans"),api<any[]>("/admin/nutrition-plans")]);setClients(r.items);setPrograms(p);setWorkouts(w);setNutrition(n)}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);
  async function open(id:string){try{setClientTab("overview");setSelected(await api<any>(`/admin/clients/${id}`))}catch(e:any){setNotice(e.message)}}
  async function refresh(){if(selected)setSelected(await api<any>(`/admin/clients/${selected.id}`))}
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/admin/clients",{method:"POST",body:JSON.stringify({fullName:f.get("fullName"),email:f.get("email"),phone:f.get("phone"),temporaryPassword:f.get("password"),fitnessGoal:f.get("goal")})});setShowNew(false);setNotice("Client created.");load()}catch(e:any){setNotice(e.message)}}
  async function assignProgram(programId:string){if(!selected)return;await api(`/admin/clients/${selected.id}/subscription`,{method:"POST",body:JSON.stringify({programId,status:"ACTIVE"})});setNotice("Programme assigned.");refresh()}
  async function assignWorkout(workoutPlanId:string){if(!selected||!workoutPlanId)return;await api(`/admin/clients/${selected.id}/workout`,{method:"POST",body:JSON.stringify({workoutPlanId})});setNotice("Workout assigned.");refresh()}
  async function assignNutrition(nutritionPlanId:string){if(!selected||!nutritionPlanId)return;await api(`/admin/clients/${selected.id}/nutrition`,{method:"POST",body:JSON.stringify({nutritionPlanId})});setNotice("Nutrition assigned.");refresh()}
  async function saveProfile(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const f=new FormData(e.currentTarget);try{await api(`/admin/clients/${selected.id}/profile`,{method:"PATCH",body:JSON.stringify({fullName:f.get("fullName"),phone:f.get("phone"),dateOfBirth:f.get("dob"),heightCm:Number(f.get("height")),currentWeightKg:Number(f.get("weight")),fitnessGoal:f.get("goal"),trainingExperience:f.get("experience")})});setNotice("Client details updated.");refresh()}catch(e:any){setNotice(e.message)}}
  async function addNote(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const f=new FormData(e.currentTarget);await api(`/admin/clients/${selected.id}/notes`,{method:"POST",body:JSON.stringify({body:f.get("body")})});e.currentTarget.reset();setNotice("Private note saved.");refresh()}
  return <div>
    <div className="toolbar"><div className="search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, email or phone"/><button className="btn ghost" onClick={()=>load()}>Search</button></div><div className="toolbarActions"><button className="btn ghost" onClick={()=>downloadExcel("jay-sthetics-clients.xlsx",[{name:"Clients",rows:clients.map(c=>({Client_ID:c.id,Name:c.fullName,Email:c.email,Phone:c.phone||"",Account_Status:c.isActive?"Active":"Disabled",Programme:c.subscriptions?.[0]?.program?.name||"Not assigned",Subscription_Status:c.subscriptions?.[0]?.status||"No subscription",Joined:new Date(c.createdAt).toLocaleDateString()}))}])}>↓ Excel</button><button className="btn red" onClick={()=>setShowNew(true)}>+ Add Client</button></div></div>
    <div className="dataTable premiumTable"><div className="tr head"><span>Client</span><span>Contact</span><span>Programme</span><span>Access</span></div>{clients.map(c=><button className="tr rowButton" key={c.id} onClick={()=>open(c.id)}><span><b>{c.fullName}</b><small>{date(c.createdAt)}</small></span><span>{c.email}<small>{c.phone||"No phone"}</small></span><span>{c.subscriptions?.[0]?.program?.name||"Not assigned"}</span><span>{c.subscriptions?.[0]?.status||"NO PLAN"}</span></button>)}</div>
    {showNew&&<Dialog title="Create Client" close={()=>setShowNew(false)}><form onSubmit={create}><input name="fullName" placeholder="Full name" required/><input name="email" type="email" placeholder="Email" required/><input name="phone" placeholder="Phone"/><input name="goal" placeholder="Fitness goal"/><input name="password" placeholder="Temporary password" minLength={8} required/><button className="btn red full">Create Client</button></form></Dialog>}
    {selected&&<div className="clientWorkspaceOverlay"><div className="clientWorkspace"><div className="clientWorkspaceTop"><button className="backClient" onClick={()=>setSelected(null)}>← Back to clients</button><div className="clientIdentity"><div className="clientInitial">{selected.fullName?.[0]}</div><div><h2>{selected.fullName}</h2><p>{selected.email} · {selected.phone||"No phone"}</p></div></div><div className="clientAccessBadge">{selected.subscriptions?.[0]?.status||"NO PLAN"}</div></div>
      <div className="clientTabs">{["overview","profile","subscription","workout","nutrition","progress","check-ins","calls","payments","notes"].map(t=><button key={t} className={clientTab===t?"active":""} onClick={()=>setClientTab(t)}>{t}</button>)}</div><div className="clientWorkspaceBody">
      {clientTab==="overview"&&<div className="clientOverviewGrid"><div className="clientHeroCard"><small>COACHING STATUS</small><h2>{selected.subscriptions?.[0]?.program?.name||"No programme assigned"}</h2><p>{selected.subscriptions?.[0]?.status||"No coaching access yet."}</p></div><Info k="Goal" v={selected.clientProfile?.fitnessGoal||"Not added"}/><Info k="Weight" v={selected.clientProfile?.currentWeightKg?`${selected.clientProfile.currentWeightKg} kg`:"Not added"}/><Info k="Height" v={selected.clientProfile?.heightCm?`${selected.clientProfile.heightCm} cm`:"Not added"}/><Info k="Experience" v={selected.clientProfile?.trainingExperience||selected.clientProfile?.experienceLevel||"Not added"}/></div>}
      {clientTab==="profile"&&<div className="clientSection"><h3>Client Details</h3><form onSubmit={saveProfile} className="profileForm"><div className="formGrid"><label>Full name<input name="fullName" defaultValue={selected.fullName} required/></label><label>Contact number<input name="phone" defaultValue={selected.phone||""} required/></label></div><div className="formGrid"><label>Date of birth<input name="dob" type="date" defaultValue={selected.clientProfile?.dateOfBirth?String(selected.clientProfile.dateOfBirth).slice(0,10):""} required/></label><label>Height (cm)<input name="height" type="number" step=".1" defaultValue={selected.clientProfile?.heightCm||""} required/></label></div><div className="formGrid"><label>Weight (kg)<input name="weight" type="number" step=".1" defaultValue={selected.clientProfile?.currentWeightKg||""} required/></label><label>Training experience<input name="experience" defaultValue={selected.clientProfile?.trainingExperience||selected.clientProfile?.experienceLevel||""} required/></label></div><label>Goal<textarea name="goal" defaultValue={selected.clientProfile?.fitnessGoal||""} required/></label><button className="btn red">Save Details</button></form></div>}
      {clientTab==="subscription"&&<div className="clientSection"><h3>Subscription</h3><select className="largeSelect" defaultValue="" onChange={e=>e.target.value&&assignProgram(e.target.value)}><option value="" disabled>Assign programme…</option>{programs.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.pricePaise)}</option>)}</select>{selected.subscriptions?.map((x:any)=><div className="managementRow" key={x.id}><b>{x.program.name}</b><span>{x.status}</span></div>)}</div>}
      {clientTab==="workout"&&<div className="clientSection"><h3>Workout</h3><select className="largeSelect" defaultValue="" onChange={e=>assignWorkout(e.target.value)}><option value="" disabled>Assign workout plan…</option>{workouts.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>{selected.workouts?.map((x:any)=><div className="managementRow" key={x.id}><b>{x.workoutPlan.name}</b><small>{new Date(x.assignedAt).toLocaleDateString()}</small></div>)}</div>}
      {clientTab==="nutrition"&&<div className="clientSection"><h3>Nutrition</h3><select className="largeSelect" defaultValue="" onChange={e=>assignNutrition(e.target.value)}><option value="" disabled>Assign nutrition plan…</option>{nutrition.map(x=><option key={x.id} value={x.id}>{x.name} · {x.calories||"—"} kcal</option>)}</select>{selected.nutrition?.map((x:any)=><div className="managementRow" key={x.id}><b>{x.nutritionPlan.name}</b><small>{x.nutritionPlan.calories||"—"} kcal</small></div>)}</div>}
      {clientTab==="progress"&&<div className="clientSection"><h3>Progress History</h3>{selected.measurements?.length?selected.measurements.map((x:any)=><div className="managementRow" key={x.id}><b>{x.metric}: {String(x.value)} {x.unit}</b><small>{new Date(x.measuredAt).toLocaleDateString()}</small></div>):<Empty text="No measurements yet."/>}</div>}
      {clientTab==="check-ins"&&<div className="clientSection"><h3>Weekly Check-ins</h3>{selected.checkIns?.length?selected.checkIns.map((x:any)=><div className="checkinCard" key={x.id}><b>{new Date(x.createdAt).toLocaleDateString()} · {x.weightKg?`${x.weightKg} kg`:"Check-in"}</b><p>Training: {x.trainingPerformance||"—"} · Diet: {x.dietAdherence??"—"}% · Energy: {x.energyLevel??"—"}/10 · Sleep: {x.sleepHours??"—"}h</p><p>{x.stepsCardio||""} {x.issues||""} {x.questions||""} {x.notes||""}</p></div>):<Empty text="No check-ins yet."/>}</div>}
      {clientTab==="calls"&&<div className="clientSection"><h3>Calls</h3>{selected.appointments?.length?selected.appointments.map((x:any)=><div className="managementRow" key={x.id}><b>{date(x.preferredAt)}</b><span>{x.status}</span></div>):<Empty text="No calls yet."/>}</div>}
      {clientTab==="payments"&&<div className="clientSection"><h3>Payments</h3>{selected.payments?.length?selected.payments.map((x:any)=><div className="managementRow" key={x.id}><b>{money(x.amountPaise)}</b><span>{x.status}</span><small>{new Date(x.createdAt).toLocaleDateString()}</small></div>):<Empty text="No payments yet."/>}</div>}
      {clientTab==="notes"&&<div className="clientSection"><h3>Private Coach Notes</h3><p className="muted">Only Jay can see these.</p><form onSubmit={addNote} className="noteComposer"><textarea name="body" placeholder="Add a private note…" required/><button className="btn red">Save Note</button></form><div className="noteList">{selected.notes?.length?selected.notes.map((x:any)=><div className="coachNote" key={x.id}><small>{date(x.createdAt)}</small><p>{x.body}</p></div>):<Empty text="No private notes yet."/>}</div></div>}
      </div></div></div>}
  </div>
}


function AdminLeads({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<any[]>([]);
  async function load(){setItems(await api<any[]>("/admin/leads"))}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);
  async function update(id:string,status:string){try{await api(`/admin/leads/${id}`,{method:"PATCH",body:JSON.stringify({status})});load()}catch(e:any){setNotice(e.message)}}
  return <><div className="toolbar"><p className="muted">People who contacted Jay before purchasing.</p><button className="btn ghost" onClick={()=>downloadExcel("jay-sthetics-leads.xlsx",[{name:"Leads",rows:items.map(x=>({Name:x.fullName,Email:x.email,Phone:x.phone||"",Goal:x.fitnessGoal||"",Message:x.message||"",Status:x.status,Created:date(x.createdAt)}))}])}>↓ Excel</button></div>
    <div className="dataTable"><div className="tr head"><span>Name</span><span>Contact</span><span>Goal / message</span><span>Status</span></div>{items.map(x=><div className="tr" key={x.id}><span><b>{x.fullName}</b><small>{date(x.createdAt)}</small></span><span>{x.email}<small>{x.phone||"—"}</small></span><span>{x.fitnessGoal||x.message||"—"}</span><span><select value={x.status} onChange={e=>update(x.id,e.target.value)}><option>NEW</option><option>CONTACTED</option><option>INTERESTED</option><option>CONVERTED</option><option>NOT_INTERESTED</option></select></span></div>)}</div></>
}

function AdminPrograms({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<Program[]>([]);
  const [editing,setEditing]=useState<Program|null>(null);
  const [showNew,setShowNew]=useState(false);

  async function load(){setItems(await api<Program[]>("/admin/programs"))}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);

  const natural=items.filter(p=>p.name.toLowerCase().includes("natural"));
  const enhanced=items.filter(p=>p.name.toLowerCase().includes("enhanced"));
  const other=items.filter(p=>!p.name.toLowerCase().includes("natural")&&!p.name.toLowerCase().includes("enhanced"));

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!editing)return;
    const f=new FormData(e.currentTarget);
    try{
      await api(`/admin/programs/${editing.id}`,{
        method:"PATCH",
        body:JSON.stringify({
          name:f.get("name"),
          description:f.get("description"),
          pricePaise:Number(f.get("rupees"))*100,
          durationDays:Number(f.get("days"))||null,
          isActive:f.get("active")==="on"
        })
      });
      setEditing(null);
      setNotice("Programme updated successfully.");
      load();
    }catch(e:any){setNotice(e.message)}
  }

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    try{
      await api("/admin/programs",{
        method:"POST",
        body:JSON.stringify({
          slug:f.get("slug"),
          name:f.get("name"),
          description:f.get("description"),
          pricePaise:Number(f.get("rupees"))*100,
          durationDays:Number(f.get("days"))
        })
      });
      setShowNew(false);
      setNotice("Programme created.");
      load();
    }catch(e:any){setNotice(e.message)}
  }

  const group=(title:string,subtitle:string,list:Program[])=><section className="programmeGroup">
    <div className="programmeGroupHead">
      <div><span className="groupTag">{title}</span><h2>{title} Coaching</h2><p>{subtitle}</p></div>
      <div className="groupCount">{list.filter(x=>x.isActive).length} active</div>
    </div>
    <div className="programmeRows">
      {list.map(p=><div className="programmeRow" key={p.id}>
        <div className="durationBadge"><b>{p.durationDays?Math.round(p.durationDays/30):"—"}</b><span>MONTHS</span></div>
        <div className="programmeMain">
          <div className="programmeTitleLine"><h3>{p.name}</h3><span className={`statusDot ${p.isActive?"live":"off"}`}>{p.isActive?"LIVE":"HIDDEN"}</span></div>
          <p>{p.description}</p>
        </div>
        <div className="programmePrice"><small>PRICE</small><b>{money(p.pricePaise)}</b></div>
        <button className="btn ghost editBtn" onClick={()=>setEditing(p)}>Edit</button>
      </div>)}
      {!list.length&&<Empty text={`No ${title.toLowerCase()} programmes.`}/>}
    </div>
  </section>;

  return <>
    <div className="programmeTop">
      <div>
        <p className="eyebrow redText">PRICING MANAGEMENT</p>
        <h2>Coaching Programmes</h2>
        <p className="muted">Update prices, durations and descriptions here. Changes appear on the public website automatically.</p>
      </div>
      <button className="btn red" onClick={()=>setShowNew(true)}>+ Add Programme</button>
    </div>

    <div className="programmeSummary">
      <div><small>TOTAL PROGRAMMES</small><b>{items.length}</b></div>
      <div><small>ACTIVE</small><b>{items.filter(p=>p.isActive).length}</b></div>
      <div><small>LOWEST PRICE</small><b>{items.length?money(Math.min(...items.map(p=>p.pricePaise))):"—"}</b></div>
      <div><small>HIGHEST PRICE</small><b>{items.length?money(Math.max(...items.map(p=>p.pricePaise))):"—"}</b></div>
    </div>

    {group("Natural","Natural athlete coaching plans.",natural)}
    {group("Enhanced","Enhanced athlete coaching plans.",enhanced)}
    {other.length>0&&group("Other","Additional coaching products.",other)}

    {editing&&<Dialog title="Edit Programme" wide close={()=>setEditing(null)}>
      <form onSubmit={save} className="programmeEditForm">
        <div className="formGrid">
          <label>Programme name<input name="name" defaultValue={editing.name} required/></label>
          <label>Duration (days)<input name="days" type="number" defaultValue={editing.durationDays||""} required/></label>
        </div>
        <label>Description<textarea name="description" defaultValue={editing.description} required/></label>
        <label>Price (₹)<input name="rupees" type="number" defaultValue={editing.pricePaise/100} required/></label>
        <label className="toggleLine"><input name="active" type="checkbox" defaultChecked={editing.isActive}/> Show this programme on the public website</label>
        <div className="dialogActions"><button type="button" className="btn ghost" onClick={()=>setEditing(null)}>Cancel</button><button className="btn red">Save Changes</button></div>
      </form>
    </Dialog>}

    {showNew&&<Dialog title="New Programme" wide close={()=>setShowNew(false)}>
      <form onSubmit={create} className="programmeEditForm">
        <div className="formGrid">
          <label>Name<input name="name" placeholder="Programme name" required/></label>
          <label>Slug<input name="slug" placeholder="example-3-months" required/></label>
        </div>
        <label>Description<textarea name="description" placeholder="What the client receives" required/></label>
        <div className="formGrid">
          <label>Price (₹)<input name="rupees" type="number" required/></label>
          <label>Duration (days)<input name="days" type="number" required/></label>
        </div>
        <div className="dialogActions"><button type="button" className="btn ghost" onClick={()=>setShowNew(false)}>Cancel</button><button className="btn red">Create Programme</button></div>
      </form>
    </Dialog>}
  </>;
}

function AdminExercises({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<any[]>([]),[show,setShow]=useState(false),[uploading,setUploading]=useState(false),[videoUrl,setVideoUrl]=useState("");
  async function load(){setItems(await api<any[]>("/admin/exercises"))}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);
  async function uploadVideo(file:File){setUploading(true);try{const fd=new FormData();fd.append("video",file);const r=await api<any>("/admin/exercise-video",{method:"POST",body:fd});setVideoUrl(r.videoUrl);setNotice("Video uploaded for local development.")}catch(e:any){setNotice(e.message)}finally{setUploading(false)}}
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/admin/exercises",{method:"POST",body:JSON.stringify({name:f.get("name"),muscleGroup:f.get("muscleGroup"),instructions:f.get("instructions"),formCues:String(f.get("formCues")||"").split("\n").map(x=>x.trim()).filter(Boolean),videoUrl:videoUrl||String(f.get("videoUrl")||"")||undefined})});setShow(false);setVideoUrl("");setNotice("Exercise added.");load()}catch(e:any){setNotice(e.message)}}
  async function alternative(id:string,alt:string){if(!alt)return;try{await api(`/admin/exercises/${id}/alternatives`,{method:"POST",body:JSON.stringify({alternativeExerciseId:alt})});setNotice("Alternative added.");load()}catch(e:any){setNotice(e.message)}}
  return <><div className="toolbar"><p className="muted">Videos uploaded here are local-dev files. Production should use Cloudinary/S3/R2.</p><button className="btn red" onClick={()=>setShow(true)}>+ Add Exercise</button></div>
    <div className="libraryGrid">{items.map(ex=><article className="exerciseCard" key={ex.id}><div className="videoBox">{ex.videoUrl?<ProtectedVideo src={ex.videoUrl}/>:<span>No video</span>}</div><div className="exerciseBody"><div className="pill">{ex.muscleGroup}</div><h3>{ex.name}</h3><p>{ex.instructions}</p><ul>{ex.formCues?.map((c:string)=><li key={c}>{c}</li>)}</ul><small>Alternatives: {ex.alternatives?.map((a:any)=>a.alternativeExercise.name).join(", ")||"None"}</small><select defaultValue="" onChange={e=>alternative(ex.id,e.target.value)}><option value="" disabled>Add alternative…</option>{items.filter(a=>a.id!==ex.id).map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></div></article>)}</div>
    {show&&<Dialog title="Add Exercise" wide close={()=>setShow(false)}><form onSubmit={create}><div className="formGrid"><input name="name" placeholder="Exercise name" required/><input name="muscleGroup" placeholder="Muscle group" required/></div><textarea name="instructions" placeholder="Exercise instructions" required/><textarea name="formCues" placeholder={"Form cues — one per line\nExample: Keep shoulder blades retracted"}/><label className="uploadLabel">Upload demo video<input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={e=>e.target.files?.[0]&&uploadVideo(e.target.files[0])}/></label>{uploading&&<small>Uploading…</small>}{videoUrl&&<small className="successText">Video ready ✓</small>}<input name="videoUrl" placeholder="Or paste external video URL"/><button className="btn red full">Save Exercise</button></form></Dialog>}
  </>
}

function AdminWorkouts({setNotice}:{setNotice:(s:string)=>void}){
  const [plans,setPlans]=useState<any[]>([]),[exercises,setExercises]=useState<any[]>([]),[show,setShow]=useState(false),[addTo,setAddTo]=useState<any|null>(null);
  async function load(){const [p,e]=await Promise.all([api<any[]>("/admin/workout-plans"),api<any[]>("/admin/exercises")]);setPlans(p);setExercises(e)}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/admin/workout-plans",{method:"POST",body:JSON.stringify({name:f.get("name"),description:f.get("description")})});setShow(false);setNotice("Workout plan created.");load()}catch(e:any){setNotice(e.message)}}
  async function addExercise(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/admin/workout-plans/${addTo.id}/exercises`,{method:"POST",body:JSON.stringify({exerciseId:f.get("exerciseId"),dayLabel:f.get("dayLabel"),position:Number(f.get("position")),sets:Number(f.get("sets"))||undefined,reps:f.get("reps"),restSeconds:Number(f.get("restSeconds"))||undefined,notes:f.get("notes")})});setAddTo(null);setNotice("Exercise added to split.");load()}catch(e:any){setNotice(e.message)}}
  return <><div className="toolbar"><p className="muted">Build reusable workout splits, then assign them from a client's profile.</p><button className="btn red" onClick={()=>setShow(true)}>+ New Workout Plan</button></div><div className="planGrid">{plans.map(p=><div className="planCard" key={p.id}><div><h3>{p.name}</h3><p>{p.description||"No description"}</p></div>{p.exercises?.length?p.exercises.map((x:any)=><div className="planRow" key={x.id}><span>{x.dayLabel}</span><b>{x.position}. {x.exercise.name}</b><small>{x.sets||"—"} sets · {x.reps||"—"} reps · {x.restSeconds||"—"}s rest</small></div>):<Empty text="No exercises added yet."/>}<button className="btn ghost full" onClick={()=>setAddTo(p)}>+ Add Exercise</button></div>)}</div>
  {show&&<Dialog title="New Workout Plan" close={()=>setShow(false)}><form onSubmit={create}><input name="name" placeholder="e.g. Push Pull Legs" required/><textarea name="description" placeholder="Description"/><button className="btn red full">Create Plan</button></form></Dialog>}
  {addTo&&<Dialog title={`Add to ${addTo.name}`} close={()=>setAddTo(null)}><form onSubmit={addExercise}><select name="exerciseId" required defaultValue=""><option value="" disabled>Select exercise</option>{exercises.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input name="dayLabel" placeholder="Day label, e.g. Push Day" required/><div className="formGrid"><input name="position" type="number" min="1" placeholder="Order" required/><input name="sets" type="number" min="1" placeholder="Sets"/></div><div className="formGrid"><input name="reps" placeholder="Reps, e.g. 8-12"/><input name="restSeconds" type="number" placeholder="Rest seconds"/></div><textarea name="notes" placeholder="Coach notes"/><button className="btn red full">Add Exercise</button></form></Dialog>}
  </>
}

function AdminNutrition({setNotice}:{setNotice:(s:string)=>void}){
  const [plans,setPlans]=useState<any[]>([]),[show,setShow]=useState(false),[mealFor,setMealFor]=useState<any|null>(null);
  async function load(){setPlans(await api<any[]>("/admin/nutrition-plans"))}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/admin/nutrition-plans",{method:"POST",body:JSON.stringify({name:f.get("name"),calories:Number(f.get("calories"))||undefined,proteinG:Number(f.get("protein"))||undefined,carbsG:Number(f.get("carbs"))||undefined,fatsG:Number(f.get("fats"))||undefined,notes:f.get("notes")})});setShow(false);setNotice("Nutrition plan created.");load()}catch(e:any){setNotice(e.message)}}
  async function meal(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api(`/admin/nutrition-plans/${mealFor.id}/meal-options`,{method:"POST",body:JSON.stringify({mealLabel:f.get("mealLabel"),optionLabel:f.get("optionLabel"),calories:Number(f.get("calories"))||undefined,proteinG:Number(f.get("protein"))||undefined,carbsG:Number(f.get("carbs"))||undefined,fatsG:Number(f.get("fats"))||undefined,foods:String(f.get("foods")).split("\n").map(x=>x.trim()).filter(Boolean)})});setMealFor(null);setNotice("Meal option added.");load()}catch(e:any){setNotice(e.message)}}
  return <><div className="toolbar"><p className="muted">Create macro targets and several interchangeable food options.</p><button className="btn red" onClick={()=>setShow(true)}>+ New Nutrition Plan</button></div><div className="planGrid">{plans.map(p=><div className="planCard" key={p.id}><h3>{p.name}</h3><div className="macroRow"><span>{p.calories||"—"} kcal</span><span>P {p.proteinG||"—"}g</span><span>C {p.carbsG||"—"}g</span><span>F {p.fatsG||"—"}g</span></div>{p.mealOptions?.length?p.mealOptions.map((m:any)=><div className="mealRow" key={m.id}><b>{m.mealLabel} · {m.optionLabel}</b><small>{Array.isArray(m.foods)?m.foods.join(" + "):"Food option"}</small><span>P {m.proteinG||"—"} · C {m.carbsG||"—"} · F {m.fatsG||"—"}</span></div>):<Empty text="No meal alternatives yet."/>}<button className="btn ghost full" onClick={()=>setMealFor(p)}>+ Add Meal Option</button></div>)}</div>
  {show&&<Dialog title="New Nutrition Plan" close={()=>setShow(false)}><form onSubmit={create}><input name="name" placeholder="Plan name" required/><div className="formGrid"><input name="calories" type="number" placeholder="Calories"/><input name="protein" type="number" placeholder="Protein g"/></div><div className="formGrid"><input name="carbs" type="number" placeholder="Carbs g"/><input name="fats" type="number" placeholder="Fats g"/></div><textarea name="notes" placeholder="Coach notes"/><button className="btn red full">Create</button></form></Dialog>}
  {mealFor&&<Dialog title={`Meal option · ${mealFor.name}`} close={()=>setMealFor(null)}><form onSubmit={meal}><div className="formGrid"><input name="mealLabel" placeholder="e.g. Breakfast" required/><input name="optionLabel" placeholder="Option A" required/></div><textarea name="foods" placeholder={"Foods — one per line\n60g oats\n1 scoop whey\n2 eggs"} required/><div className="formGrid four"><input name="calories" type="number" placeholder="kcal"/><input name="protein" type="number" placeholder="P"/><input name="carbs" type="number" placeholder="C"/><input name="fats" type="number" placeholder="F"/></div><button className="btn red full">Add Option</button></form></Dialog>}
  </>
}

function AdminCheckins(){
  const [items,setItems]=useState<any[]>([]);
  useEffect(()=>{api<any[]>("/admin/check-ins").then(setItems)},[]);
  const exportRows=items.map(c=>({Client:c.user.fullName,Email:c.user.email,Date:new Date(c.createdAt).toLocaleDateString(),Weight_kg:c.weightKg?Number(c.weightKg):null,Body_Fat_Percent:c.bodyFat?Number(c.bodyFat):null,Sleep_Hours:c.sleepHours?Number(c.sleepHours):null,Energy_1_to_10:c.energyLevel??null,Diet_Adherence_Percent:c.dietAdherence??null,Notes:c.notes||""}));
  return <><div className="toolbar"><p className="muted">Weekly client progress submissions.</p><button className="btn ghost" onClick={()=>downloadExcel("jay-sthetics-checkins.xlsx",[{name:"Weekly Check-ins",rows:exportRows}])}>↓ Download Excel</button></div><div className="dataTable"><div className="tr checkHead"><span>Client</span><span>Date</span><span>Weight</span><span>Sleep</span><span>Energy</span><span>Adherence</span></div>{items.map(c=><div className="tr checkRow" key={c.id}><span><b>{c.user.fullName}</b><small>{c.user.email}</small></span><span>{new Date(c.createdAt).toLocaleDateString()}</span><span>{c.weightKg?`${c.weightKg} kg`:"—"}</span><span>{c.sleepHours?`${c.sleepHours}h`:"—"}</span><span>{c.energyLevel||"—"}/10</span><span>{c.dietAdherence??"—"}%</span></div>)}</div></>
}

function AdminCalls({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<any[]>([]);
  async function load(){setItems(await api<any[]>("/admin/appointments"))}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);
  async function status(id:string,status:string){try{await api(`/admin/appointments/${id}`,{method:"PATCH",body:JSON.stringify({status})});setNotice("Call updated.");load()}catch(e:any){setNotice(e.message)}}
  const exportRows=items.map(c=>({Name:c.fullName,Email:c.email,Phone:c.phone||"",Requested_Date_Time:date(c.preferredAt),Reason:c.reason||"",Status:c.status,Meeting_Link:c.meetingUrl||""}));
  return <><div className="toolbar"><p className="muted">Consultation and coaching call requests.</p><button className="btn ghost" onClick={()=>downloadExcel("jay-sthetics-calls.xlsx",[{name:"Calls",rows:exportRows}])}>↓ Download Excel</button></div><div className="dataTable"><div className="tr head"><span>Client</span><span>Contact</span><span>Requested time</span><span>Status</span></div>{items.map(c=><div className="tr" key={c.id}><span><b>{c.fullName}</b><small>{c.reason||"No reason"}</small></span><span>{c.email}<small>{c.phone||"—"}</small></span><span>{date(c.preferredAt)}</span><span><select value={c.status} onChange={e=>status(c.id,e.target.value)}><option>REQUESTED</option><option>CONFIRMED</option><option>RESCHEDULED</option><option>COMPLETED</option><option>CANCELLED</option></select></span></div>)}</div></>
}

function AdminMessages(){
  const [clients,setClients]=useState<any[]>([]),[selected,setSelected]=useState<any|null>(null),[messages,setMessages]=useState<any[]>([]);
  useEffect(()=>{api<any[]>("/admin/conversations").then(setClients)},[]);
  async function open(c:any){setSelected(c);setMessages(await api<any[]>(`/messages/${c.id}`))}
  async function send(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const f=new FormData(e.currentTarget);await api("/messages",{method:"POST",body:JSON.stringify({receiverId:selected.id,body:f.get("body")})});(e.currentTarget as HTMLFormElement).reset();open(selected)}
  return <div className="chatLayout"><div className="conversationList">{clients.map(c=><button key={c.id} className={selected?.id===c.id?"selected":""} onClick={()=>open(c)}><b>{c.fullName}</b><small>{c.email}</small></button>)}</div><div className="chatPanel">{selected?<><div className="chatTitle"><b>{selected.fullName}</b></div><div className="messages">{messages.map(m=><div key={m.id} className={`bubble ${m.senderId===selected.id?"theirs":"mine"}`}>{m.body}<small>{date(m.createdAt)}</small></div>)}</div><form className="chatForm" onSubmit={send}><input name="body" placeholder="Message client…" required/><button className="btn red">Send</button></form></>:<Empty text="Choose a client to open the conversation."/>}</div></div>
}

function AdminPayments(){
  const [items,setItems]=useState<any[]>([]);
  const [clients,setClients]=useState<any[]>([]);
  const [calls,setCalls]=useState<any[]>([]);
  const [checkins,setCheckins]=useState<any[]>([]);

  useEffect(()=>{
    Promise.all([
      api<any[]>("/admin/payments"),
      api<any>("/admin/clients?limit=100"),
      api<any[]>("/admin/appointments"),
      api<any[]>("/admin/check-ins")
    ]).then(([p,c,ca,ch])=>{
      setItems(p);
      setClients(c.items||[]);
      setCalls(ca);
      setCheckins(ch);
    });
  },[]);

  const paymentRows=items.map(p=>({
    Payment_ID:p.id,
    Client:p.user.fullName,
    Email:p.user.email,
    Programme:p.subscription?.program?.name||"",
    Amount_INR:p.amountPaise/100,
    Currency:p.currency,
    Status:p.status,
    Razorpay_Order_ID:p.razorpayOrderId||"",
    Razorpay_Payment_ID:p.razorpayPaymentId||"",
    Date:new Date(p.createdAt).toLocaleString()
  }));

  const clientRows=clients.map(c=>({
    Client_ID:c.id,
    Name:c.fullName,
    Email:c.email,
    Phone:c.phone||"",
    Account_Status:c.isActive?"Active":"Disabled",
    Programme:c.subscriptions?.[0]?.program?.name||"Not assigned",
    Subscription_Status:c.subscriptions?.[0]?.status||"No subscription",
    Joined:new Date(c.createdAt).toLocaleDateString()
  }));

  const callRows=calls.map(c=>({
    Name:c.fullName,
    Email:c.email,
    Phone:c.phone||"",
    Requested_Date_Time:date(c.preferredAt),
    Reason:c.reason||"",
    Status:c.status,
    Meeting_Link:c.meetingUrl||""
  }));

  const checkinRows=checkins.map(c=>({
    Client:c.user.fullName,
    Email:c.user.email,
    Date:new Date(c.createdAt).toLocaleDateString(),
    Weight_kg:c.weightKg?Number(c.weightKg):null,
    Body_Fat_Percent:c.bodyFat?Number(c.bodyFat):null,
    Sleep_Hours:c.sleepHours?Number(c.sleepHours):null,
    Energy_1_to_10:c.energyLevel??null,
    Diet_Adherence_Percent:c.dietAdherence??null,
    Notes:c.notes||""
  }));

  function downloadFullReport(){
    downloadExcel(`jay-sthetics-admin-report-${new Date().toISOString().slice(0,10)}.xlsx`,[
      {name:"Payments",rows:paymentRows},
      {name:"Clients",rows:clientRows},
      {name:"Calls",rows:callRows},
      {name:"Weekly Check-ins",rows:checkinRows}
    ]);
  }

  return <>
    <div className="paymentsHeader">
      <div><p className="eyebrow redText">FINANCIAL RECORDS</p><h2>Payments</h2><p className="muted">Download payment-only records or one complete Excel workbook containing key business data.</p></div>
      <div className="toolbarActions">
        <button className="btn ghost" onClick={()=>downloadExcel("jay-sthetics-payments.xlsx",[{name:"Payments",rows:paymentRows}])}>↓ Payments Excel</button>
        <button className="btn red" onClick={downloadFullReport}>↓ Full Admin Report</button>
      </div>
    </div>

    <div className="programmeSummary paymentStats">
      <div><small>TOTAL RECORDS</small><b>{items.length}</b></div>
      <div><small>SUCCESSFUL</small><b>{items.filter(p=>p.status==="SUCCESS").length}</b></div>
      <div><small>PENDING</small><b>{items.filter(p=>["CREATED","PENDING"].includes(p.status)).length}</b></div>
      <div><small>SUCCESSFUL REVENUE</small><b>{money(items.filter(p=>p.status==="SUCCESS").reduce((a,p)=>a+p.amountPaise,0))}</b></div>
    </div>

    <div className="dataTable"><div className="tr payHead"><span>Client</span><span>Programme</span><span>Amount</span><span>Status</span><span>Date</span></div>{items.map(p=><div className="tr payRow" key={p.id}><span>{p.user.fullName}<small>{p.user.email}</small></span><span>{p.subscription?.program?.name||"—"}</span><span>{money(p.amountPaise)}</span><span><i className={`paymentStatus ${p.status.toLowerCase()}`}>{p.status}</i></span><span>{new Date(p.createdAt).toLocaleDateString()}</span></div>)}</div>
  </>;
}

function AdminSettings({setNotice}:{setNotice:(s:string)=>void}){
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const [items,setItems]=useState<any[]>([]);
  async function load(){setItems(await api<any[]>("/admin/availability"))}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/admin/availability",{method:"POST",body:JSON.stringify({dayOfWeek:Number(f.get("day")),startTime:f.get("start"),endTime:f.get("end"),timezone:"Asia/Kolkata"})});setNotice("Call hours added.");load()}catch(e:any){setNotice(e.message)}}
  async function toggle(x:any){await api(`/admin/availability/${x.id}`,{method:"PATCH",body:JSON.stringify({isActive:!x.isActive})});load()}
  return <><div className="settingsCard"><h2>Coaching call hours</h2><p className="muted">Clients with active subscriptions can see these hours.</p><form className="availabilityForm" onSubmit={create}><select name="day">{days.map((d,i)=><option value={i} key={d}>{d}</option>)}</select><input name="start" type="time" required/><input name="end" type="time" required/><button className="btn red">Add Hours</button></form>{items.map(x=><div className="availabilityRow" key={x.id}><b>{days[x.dayOfWeek]}</b><span>{x.startTime} – {x.endTime}</span><small>{x.timezone}</small><button className="btn ghost" onClick={()=>toggle(x)}>{x.isActive?"Disable":"Enable"}</button></div>)}</div></>
}

function ClientPanel({user,logout}:{user:User;logout:()=>void}){
  const tabs=["dashboard","onboarding","training","nutrition","progress","weekly check-in","chat","calls"];
  const [tab,setTab]=useState("dashboard"),[data,setData]=useState<any>(null),[notice,setNotice]=useState("");
  useEffect(()=>{load()},[tab]);
  async function load(){try{
    if(tab==="dashboard")setData(await api("/client/dashboard"));
    if(tab==="onboarding")setData(await api("/client/onboarding"));
    if(tab==="training")setData(await api("/client/training"));
    if(tab==="nutrition")setData(await api("/client/nutrition"));
    if(tab==="progress")setData(await api("/client/progress"));
    if(tab==="calls")setData(await api("/client/availability"));
  }catch(e:any){setData({error:e.message})}}
  async function onboarding(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/client/onboarding",{method:"PATCH",body:JSON.stringify({dateOfBirth:f.get("dob"),heightCm:Number(f.get("height")),weightKg:Number(f.get("weight")),fitnessGoal:f.get("goal"),trainingExperience:f.get("experience"),phone:f.get("phone")})});setNotice("Coaching profile saved.");setData(await api("/client/onboarding"))}catch(e:any){setNotice(e.message)}}
  async function checkin(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const f=new FormData(form);try{
    let photoUrls:string[]=[];
    const input=form.elements.namedItem("photos") as HTMLInputElement|null;
    if(input?.files?.length){
      const upload=new FormData();
      Array.from(input.files).slice(0,3).forEach(file=>upload.append("photos",file));
      const r=await api<{photoUrls:string[]}>("/client/check-in-photos",{method:"POST",body:upload});
      photoUrls=r.photoUrls;
    }
    await api("/client/check-ins",{method:"POST",body:JSON.stringify({weightKg:Number(f.get("weight"))||undefined,sleepHours:Number(f.get("sleep"))||undefined,energyLevel:Number(f.get("energy"))||undefined,dietAdherence:Number(f.get("adherence"))||undefined,trainingPerformance:f.get("performance")||undefined,stepsCardio:f.get("steps")||undefined,issues:f.get("issues")||undefined,questions:f.get("questions")||undefined,notes:f.get("notes")||undefined,photoUrls})});
    setNotice("Weekly check-in submitted.");form.reset()
  }catch(e:any){setNotice(e.message)}}
  return <div className="appShell"><Sidebar items={tabs} tab={tab} setTab={setTab} logout={logout}/><main className="dash premiumDash"><div className="dashTop premiumTop"><div><small className="redText">jay.__sthetics · CLIENT</small><h1>{tab.toUpperCase()}</h1><p>Your coaching, progress and communication in one place.</p></div><div className="topRight"><div className="topStatus"><span></span>Active</div><div className="avatar premiumAvatar">{user.fullName?.split(" ").map((x:string)=>x[0]).join("").slice(0,2)}</div></div></div>{notice&&<div className="inlineNotice">{notice}</div>}
    {data?.error&&<Locked message={data.error}/>}
    {tab==="dashboard"&&!data?.error&&<ClientDashboard data={data}/>}
    {tab==="onboarding"&&!data?.error&&<div className="settingsCard onboardingCard"><h2>My Coaching Profile</h2><p className="muted">Complete these details so Jay can personalize your plan.</p><form onSubmit={onboarding}><div className="formGrid"><label>Date of birth<input name="dob" type="date" defaultValue={data?.clientProfile?.dateOfBirth?String(data.clientProfile.dateOfBirth).slice(0,10):""} required/></label><label>Contact number<input name="phone" defaultValue={data?.phone||""} required/></label></div><div className="formGrid"><label>Height (cm)<input name="height" type="number" step=".1" defaultValue={data?.clientProfile?.heightCm||""} required/></label><label>Weight (kg)<input name="weight" type="number" step=".1" defaultValue={data?.clientProfile?.currentWeightKg||""} required/></label></div><label>Goal<textarea name="goal" defaultValue={data?.clientProfile?.fitnessGoal||""} required/></label><label>Training experience<input name="experience" defaultValue={data?.clientProfile?.trainingExperience||data?.clientProfile?.experienceLevel||""} required/></label><button className="btn red">Save Details</button></form></div>}
    {tab==="training"&&!data?.error&&<ClientTraining data={data}/>}
    {tab==="nutrition"&&!data?.error&&<ClientNutrition data={data}/>}
    {tab==="progress"&&!data?.error&&<ClientProgress data={data}/>}
    {tab==="weekly check-in"&&<div className="settingsCard"><h2>Weekly Check-In</h2><form onSubmit={checkin}><div className="formGrid"><input name="weight" type="number" step=".1" placeholder="Current weight kg"/><select name="performance" defaultValue=""><option value="" disabled>Training performance</option><option value="BETTER">Better</option><option value="SAME">Same</option><option value="WORSE">Worse</option></select></div><div className="formGrid"><input name="adherence" type="number" min="0" max="100" placeholder="Diet adherence %"/><input name="energy" type="number" min="1" max="10" placeholder="Energy 1–10"/></div><div className="formGrid"><input name="sleep" type="number" step=".1" placeholder="Average sleep hours"/><input name="steps" placeholder="Steps / cardio completed"/></div><textarea name="issues" placeholder="Any problems with training or diet?"/><textarea name="questions" placeholder="Anything you want Jay to know or ask?"/><label className="uploadLabel">Progress photos — front / side / back<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple/></label><textarea name="notes" placeholder="Other weekly notes (optional)"/><button className="btn red">Submit Check-In</button></form></div>}
    {tab==="chat"&&<ClientChat/>}
    {tab==="calls"&&<ClientCalls/>}
  </main></div>
}

function ClientDashboard({data}:any){
  const sub=data?.subscriptions?.[0];
  return <div className="clientHome">
    <div className="clientWelcome">
      <div><span>WELCOME BACK</span><h2>{data?.fullName?.split(" ")[0]}, stay consistent.</h2><p>Your programme, check-ins and coaching support are all here.</p></div>
      <div className="programStatusCard"><small>CURRENT PROGRAMME</small><b>{sub?.program?.name||"No active programme"}</b><span className={`statusDot ${sub?.status==="ACTIVE"?"live":"off"}`}>{sub?.status||"NOT ACTIVE"}</span></div>
    </div>
    <div className="metricGrid premiumMetrics clientMetrics">
      <div className="metric premiumMetric"><small>PROGRAMME</small><b>{sub?.program?.name||"—"}</b><p>Assigned coaching plan</p></div>
      <div className="metric premiumMetric"><small>STATUS</small><b>{sub?.status||"—"}</b><p>Subscription access</p></div>
      <div className="metric premiumMetric"><small>RECENT CHECK-INS</small><b>{data?.checkIns?.length||0}</b><p>Latest coaching updates</p></div>
    </div>
    <div className="clientActionGrid">
      <div className="actionCard"><span>01</span><h3>Training</h3><p>Open your current workout split and exercise demonstrations.</p></div>
      <div className="actionCard"><span>02</span><h3>Nutrition</h3><p>Review calories, macros and meal alternatives.</p></div>
      <div className="actionCard"><span>03</span><h3>Weekly Check-in</h3><p>Submit progress, adherence and photos for Jay.</p></div>
      <div className="actionCard"><span>04</span><h3>Coach Support</h3><p>Use private messages and available call slots.</p></div>
    </div>
  </div>;
}
function ClientTraining({data}:any){return <div className="planGrid">{data?.length?data.map((a:any)=><div className="planCard" key={a.id}><h2>{a.workoutPlan.name}</h2>{a.workoutPlan.exercises.map((x:any)=><div className="clientExercise" key={x.id}><div><span className="pill">{x.dayLabel}</span><h3>{x.exercise.name}</h3><p>{x.sets||"—"} sets × {x.reps||"—"} · Rest {x.restSeconds||"—"} sec</p><p>{x.exercise.instructions}</p><ul>{x.exercise.formCues.map((c:string)=><li key={c}>{c}</li>)}</ul>{x.exercise.alternatives?.length>0&&<small>Alternatives: {x.exercise.alternatives.map((alt:any)=>alt.alternativeExercise.name).join(", ")}</small>}</div>{x.exercise.videoUrl&&<ProtectedVideo src={x.exercise.videoUrl}/>}</div>)}</div>):<Empty text="Jay hasn't assigned a workout plan yet."/>}</div>}
function ClientNutrition({data}:any){return <div className="planGrid">{data?.length?data.map((a:any)=><div className="planCard" key={a.id}><h2>{a.nutritionPlan.name}</h2><div className="macroRow"><span>{a.nutritionPlan.calories} kcal</span><span>P {a.nutritionPlan.proteinG}g</span><span>C {a.nutritionPlan.carbsG}g</span><span>F {a.nutritionPlan.fatsG}g</span></div>{a.nutritionPlan.mealOptions.map((m:any)=><div className="mealRow" key={m.id}><b>{m.mealLabel} · {m.optionLabel}</b><small>{Array.isArray(m.foods)?m.foods.join(" + "):""}</small><span>{m.calories||"—"} kcal · P {m.proteinG||"—"} · C {m.carbsG||"—"} · F {m.fatsG||"—"}</span></div>)}</div>):<Empty text="Jay hasn't assigned a nutrition plan yet."/>}</div>}
function ClientProgress({data}:any){
  const weighted=(data?.checkIns||[]).filter((c:any)=>c.weightKg).map((c:any)=>({date:new Date(c.createdAt),weight:Number(c.weightKg)}));
  return <><h2>Progress History</h2><div className="metricGrid"><div className="metric"><small>MEASUREMENTS</small><b>{data?.measurements?.length||0}</b></div><div className="metric"><small>STRENGTH RECORDS</small><b>{data?.strength?.length||0}</b></div><div className="metric"><small>CHECK-INS</small><b>{data?.checkIns?.length||0}</b></div></div>
    <WeightTrend points={weighted}/>
    <div className="history">{data?.checkIns?.slice().reverse().map((c:any)=><div className="historyRow progressHistory" key={c.id}><span>{new Date(c.createdAt).toLocaleDateString()}</span><b>{c.weightKg?`${c.weightKg} kg`:"—"}</b><span>{c.notes||c.questions||"Weekly check-in"}</span>{c.photoUrls?.length>0&&<div className="progressPhotos">{c.photoUrls.map((u:string)=><ProtectedImage key={u} src={u}/>)}</div>}</div>)}</div>
  </>;
}




function WeightTrend({points}:{points:{date:Date;weight:number}[]}){
  if(points.length<2)return <div className="empty">Submit at least two weighted check-ins to see a weight trend chart.</div>;
  const w=720,h=220,pad=30;
  const values=points.map(p=>p.weight), min=Math.min(...values),max=Math.max(...values);
  const range=Math.max(max-min,1);
  const coords=points.map((p,i)=>({x:pad+(i*(w-pad*2))/Math.max(points.length-1,1),y:h-pad-((p.weight-min)/range)*(h-pad*2)}));
  const line=coords.map(p=>`${p.x},${p.y}`).join(" ");
  return <div className="trendCard"><div className="trendHead"><b>Body Weight Trend</b><span>{points[0].weight} kg → {points[points.length-1].weight} kg</span></div><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Body weight trend"><polyline points={line} fill="none" stroke="currentColor" strokeWidth="3"/>{coords.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="5" fill="currentColor"/>)}</svg></div>
}

function ProtectedVideo({src}:{src:string}){
  const [url,setUrl]=useState<string>("");
  useEffect(()=>{let objectUrl="";if(!src)return;
    const protectedSrc=src.startsWith("/uploads/")?`/api/media/${src.split("/").pop()}`:src;
    if(!protectedSrc.startsWith("/api/")){setUrl(protectedSrc);return;}
    apiBlob(protectedSrc.replace(/^\/api/,"")).then(blob=>{objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(()=>{});
    return()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[src]);
  return url?<video controls src={url}/>:<div className="mediaLoading">Loading protected video…</div>;
}
function ProtectedImage({src}:{src:string}){
  const [url,setUrl]=useState<string>("");
  useEffect(()=>{let objectUrl="";if(!src)return;
    const protectedSrc=src.startsWith("/uploads/")?`/api/media/${src.split("/").pop()}`:src;
    if(!protectedSrc.startsWith("/api/")){setUrl(protectedSrc);return;}
    apiBlob(protectedSrc.replace(/^\/api/,"")).then(blob=>{objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(()=>{});
    return()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[src]);
  return url?<img src={url} alt="Progress"/>:<div className="mediaLoading">Loading…</div>;
}

function ClientChat(){
  const [coach,setCoach]=useState<any|null>(null),[messages,setMessages]=useState<any[]>([]),[error,setError]=useState("");
  async function load(){
    try{const c=await api<any>("/client/coach");setCoach(c);setMessages(await api<any[]>(`/messages/${c.id}`));setError("")}
    catch(e:any){setError(e.message)}
  }
  useEffect(()=>{load();const id=setInterval(load,10000);return()=>clearInterval(id)},[]);
  async function send(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!coach)return;const f=new FormData(e.currentTarget);try{await api("/messages",{method:"POST",body:JSON.stringify({receiverId:coach.id,body:f.get("body")})});e.currentTarget.reset();load()}catch(e:any){setError(e.message)}}
  if(error)return <Locked message={error}/>;
  return <div className="clientChat"><div className="chatTitle"><b>{coach?`Chat with ${coach.fullName}`:"Loading coach…"}</b><small>Messages refresh automatically.</small></div><div className="messages">{messages.map(m=><div key={m.id} className={`bubble ${m.senderId===coach?.id?"theirs":"mine"}`}>{m.body}<small>{date(m.createdAt)}</small></div>)}</div><form className="chatForm" onSubmit={send}><input name="body" placeholder="Ask Jay about training, diet or your check-in…" required/><button className="btn red">Send</button></form></div>;
}

function ClientCalls(){
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const [availability,setAvailability]=useState<any[]>([]),[calls,setCalls]=useState<any[]>([]),[callInfo,setCallInfo]=useState<any>(null),[status,setStatus]=useState("");
  async function load(){try{const [a,c,i]=await Promise.all([api<any[]>("/client/availability"),api<any[]>("/client/calls"),api<any>("/client/call-info")]);setAvailability(a);setCalls(c);setCallInfo(i)}catch(e:any){setStatus(e.message)}}
  useEffect(()=>{load()},[]);
  async function request(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/client/calls",{method:"POST",body:JSON.stringify({preferredAt:new Date(`${f.get("date")}T${f.get("time")}:00+05:30`).toISOString(),reason:f.get("reason")})});setStatus("Call requested.");e.currentTarget.reset();load()}catch(e:any){setStatus(e.message)}}
  return <div className="callsLayout"><div className="settingsCard"><h2>Jay's coaching call hours</h2>{availability.length?availability.map(x=><div className="availabilityRow" key={x.id}><b>{days[x.dayOfWeek]}</b><span>{x.startTime} – {x.endTime}</span><small>{x.timezone}</small></div>):<Empty text="No call hours configured yet."/>}{callInfo?.availableNow&&callInfo.phone?<a className="btn red full directCall" href={`tel:${callInfo.phone}`}>Call Jay Now</a>:<p className="muted callReason">{callInfo?.reason||""}</p>}</div>
    <div className="settingsCard"><h2>Request a coaching call</h2><form onSubmit={request}><div className="formGrid"><label>Date<input name="date" type="date" required/></label><label>Time (IST)<input name="time" type="time" required/></label></div><label>Reason<textarea name="reason" placeholder="What do you want to discuss?"/></label><button className="btn red">Request Call</button></form>{status&&<div className="inlineNotice">{status}</div>}<h3>My call requests</h3>{calls.length?calls.map(c=><div className="managementRow" key={c.id}><div><b>{date(c.preferredAt)}</b><small>{c.reason||"Coaching call"}</small></div><span>{c.status}</span></div>):<Empty text="No call requests yet."/>}</div></div>;
}


function ProgramsPage({programs,user,chooseProgram}:{programs:Program[];user:User|null;chooseProgram:(p:Program)=>void}){
  const active=programs.filter(p=>p.isActive!==false);
  const natural=active.filter(p=>p.name.toLowerCase().includes("natural"));
  const enhanced=active.filter(p=>p.name.toLowerCase().includes("enhanced"));

  function card(p:Program){
    const months=p.durationDays?Math.round(p.durationDays/30):null;
    return <article className="fullProgramCard" key={p.id}>
      <div className="fullProgramTop">
        <div>
          <span className="programType">{p.name.toLowerCase().includes("natural")?"NATURAL TRAINING":"ENHANCED TRAINING"}</span>
          <h2>{months?`${months} Months`:p.name}</h2>
        </div>
        <div className="fullProgramPrice">{money(p.pricePaise)}</div>
      </div>
      <p>{p.description}</p>
      <div className="programIncludes">
        <span>✓ Personal client dashboard</span>
        <span>✓ Customized workout programme</span>
        <span>✓ Exercise form videos & alternatives</span>
        <span>✓ Diet plan + macro-based meal options</span>
        <span>✓ Weekly check-ins</span>
        <span>✓ Progress tracking</span>
        <span>✓ Client-to-coach messaging</span>
        <span>✓ Coaching call access during available hours</span>
      </div>
      <button className="btn red full programJoin" onClick={()=>chooseProgram(p)}>
        {user?.role==="CLIENT"?"Continue to Checkout":"Join Coaching"}
      </button>
    </article>
  }

  return <div className="programsPage">
    <header className="simpleHeader">
      <a className="brand" href="/"><b>jay.</b><span>__sthetics</span></a>
      <div className="simpleHeaderActions">
        {user?.role==="CLIENT"?<a className="btn ghost" href="/dashboard">My Dashboard</a>:<a className="btn ghost" href="/dashboard">Client Login</a>}
        <a className="btn ghost" href="/">Home</a>
      </div>
    </header>

    <section className="programsHero">
      <p className="eyebrow redText">ONLINE COACHING</p>
      <h1>CHOOSE YOUR <span>PROGRAMME.</span></h1>
      <p>Choose the coaching duration that fits your goal. Your dashboard and premium coaching tools unlock after payment is verified.</p>
    </section>

    <main className="programsMain">
      <section className="programCategory">
        <div className="programCategoryTitle"><span>01</span><div><h2>Natural Training</h2><p>Structured coaching for natural athletes.</p></div></div>
        <div className="fullProgramGrid">{natural.map(card)}</div>
      </section>
      <section className="programCategory">
        <div className="programCategoryTitle"><span>02</span><div><h2>Enhanced Training</h2><p>Detailed coaching and progress management for enhanced athletes.</p></div></div>
        <div className="fullProgramGrid">{enhanced.map(card)}</div>
      </section>
    </main>
  </div>;
}

function SignupPage({program,register,login,notice}:{program:Program|null;register:(e:FormEvent<HTMLFormElement>)=>void;login:(e:FormEvent<HTMLFormElement>)=>void;notice?:string}){
  const [mode,setMode]=useState<"signup"|"login">("signup");

  return <div className="signupPage">
    <div className="signupBrandPanel">
      <a className="brand" href="/"><b>jay.</b><span>__sthetics</span></a>
      <div className="signupBrandContent">
        <p className="eyebrow">YOUR COACHING.<br/><i>ONE PLATFORM.</i></p>
        <h1>START<br/><span>STRONG.</span></h1>
        <p>Create your client account, complete payment, and Jay can begin building your coaching plan.</p>
      </div>
    </div>

    <div className="signupFormPanel">
      <div className="signupBox">
        <a className="brand mobileAuthBrand" href="/"><b>jay.</b><span>__sthetics</span></a>
        {program?<div className="selectedProgramCheckout">
          <small>SELECTED PROGRAMME</small>
          <div><b>{program.name}</b><strong>{money(program.pricePaise)}</strong></div>
          <a href="/programs">Change programme</a>
        </div>:<div className="selectedProgramCheckout missing"><small>NO PROGRAMME SELECTED</small><p>Choose a coaching programme before creating your account.</p><a className="btn red full" href="/programs">View Programmes</a></div>}

        {notice&&<div className="authError signupError">{notice}</div>}
        {program&&<>
          <div className="authModeTabs"><button className={mode==="signup"?"active":""} onClick={()=>setMode("signup")}>Create Account</button><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>Sign In</button></div>
          {mode==="signup"?<form className="authForm" onSubmit={register}>
            <label>Full name<input name="fullName" placeholder="Your full name" required/></label>
            <label>Email address<input name="email" type="email" placeholder="name@example.com" required/></label>
            <label>Phone number<input name="phone" placeholder="+91..." required/></label>
            <label>Create password<PasswordField placeholder="Minimum 8 characters" autoComplete="new-password" minLength={8}/></label>
            <button className="btn red authSubmit">Create Account & Continue</button>
          </form>:<form className="authForm" onSubmit={login}>
            <label>Email address<input name="email" type="email" placeholder="name@example.com" required/></label>
            <label>Password<PasswordField placeholder="Your password" autoComplete="current-password"/></label>
            <div className="authOptions"><span>Your account is protected</span><a href="/forgot-password">Forgot password?</a></div>
            <button className="btn red authSubmit">Sign In & Continue</button>
          </form>}
          <p className="authSecurity">🔒 You will review the programme again before payment.</p>
        </>}
      </div>
    </div>
  </div>;
}

function CheckoutPage({user}:{user:User}){
  const params=new URLSearchParams(location.search);
  const programId=params.get("programId");
  const [program,setProgram]=useState<Program|null>(null);
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    api<Program[]>("/programs").then(items=>{
      const p=items.find(x=>x.id===programId);
      if(p)setProgram(p); else setStatus("Programme not found.");
    }).catch((e:any)=>setStatus(e.message));
  },[programId]);

  function loadRazorpay():Promise<boolean>{
    return new Promise(resolve=>{
      if((window as any).Razorpay)return resolve(true);
      const script=document.createElement("script");
      script.src="https://checkout.razorpay.com/v1/checkout.js";
      script.onload=()=>resolve(true);
      script.onerror=()=>resolve(false);
      document.body.appendChild(script);
    });
  }

  async function pay(){
    if(!program)return;
    setBusy(true); setStatus("");
    try{
      const ready=await loadRazorpay();
      if(!ready)throw new Error("Could not load Razorpay checkout. Check your internet connection.");

      const created=await api<any>("/payments/create-order",{
        method:"POST",
        body:JSON.stringify({programId:program.id})
      });

      const options={
        key:created.keyId,
        amount:created.order.amount,
        currency:created.order.currency,
        name:"jay.__sthetics",
        description:program.name,
        order_id:created.order.id,
        prefill:{name:user.fullName,email:user.email},
        theme:{color:"#e11d1d"},
        handler:async(response:any)=>{
          try{
            await api("/payments/verify",{method:"POST",body:JSON.stringify(response)});
            setStatus("Payment successful. Your coaching access is now active.");
            setTimeout(()=>location.href="/dashboard",900);
          }catch(e:any){setStatus(e.message||"Payment verification failed.")}
        },
        modal:{ondismiss:()=>setBusy(false)}
      };

      const rz=new (window as any).Razorpay(options);
      rz.on("payment.failed",(response:any)=>{
        setStatus(response?.error?.description||"Payment failed. Please try again.");
        setBusy(false);
      });
      rz.open();
    }catch(e:any){
      const msg=e?.message||"Unable to start payment.";
      if(msg.toLowerCase().includes("razorpay keys")){
        setStatus("Razorpay is not connected yet. Add Jay's Razorpay TEST or LIVE API keys in apps/api/.env to enable payment.");
      }else{
        setStatus(msg);
      }
      setBusy(false);
    }
  }


  async function mockPay(){
    if(!program)return;
    setBusy(true); setStatus("");
    try{
      await api("/payments/mock-success",{method:"POST",body:JSON.stringify({programId:program.id})});
      setStatus("Development test payment successful. Coaching access is active.");
      setTimeout(()=>location.href="/dashboard",800);
    }catch(e:any){
      setStatus(e?.message||"Mock payment failed.");
      setBusy(false);
    }
  }

  if(!program)return <div className="checkoutPage"><div className="checkoutCard"><div className="brand"><b>jay.</b><span>__sthetics</span></div><h2>Checkout</h2><p>{status||"Loading programme…"}</p><a className="btn ghost" href="/programs">Back to programmes</a></div></div>;

  return <div className="checkoutPage">
    <div className="checkoutShell">
      <div className="checkoutBrand"><a className="brand" href="/"><b>jay.</b><span>__sthetics</span></a><a href="/dashboard">Dashboard</a></div>
      <div className="checkoutGrid">
        <section className="checkoutSummary">
          <p className="eyebrow redText">SECURE CHECKOUT</p>
          <h1>Complete your coaching enrollment</h1>
          <p className="muted">Your paid coaching features stay locked until Razorpay confirms the payment.</p>
          <div className="checkoutBenefits">
            {["Personal client dashboard","Workout plan + form videos","Exercise alternatives","Nutrition & macro options","Weekly check-ins","Progress tracking","Coach chat & call access"].map(x=><div key={x}>✓ {x}</div>)}
          </div>
        </section>
        <aside className="orderCard">
          <small>YOUR PROGRAMME</small>
          <h2>{program.name}</h2>
          <p>{program.description}</p>
          <div className="orderMeta"><span>Duration</span><b>{program.durationDays?`${Math.round(program.durationDays/30)} months`:"Coaching plan"}</b></div>
          <div className="orderTotal"><span>Total</span><b>{money(program.pricePaise)}</b></div>
          <button className="btn red full payButton" disabled={busy} onClick={pay}>{busy?"Opening payment…":`Pay ${money(program.pricePaise)}`}</button>
          <button className="btn ghost full mockPayButton" disabled={busy} onClick={mockPay}>Use Development Test Payment</button>
          <div className="mockWarning">Local testing only — no real money is charged.</div>
          <div className="paymentMethods">UPI · Cards · Net Banking · Razorpay</div>
          {status&&<div className="paymentMessage">{status}</div>}
          <a className="changePlan" href="/programs">← Change programme</a>
        </aside>
      </div>
    </div>
  </div>;
}

function Dialog({title,close,children,wide=false}:{title:string;close:()=>void;children:any;wide?:boolean}){return <div className="modal" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className={`modalCard ${wide?"wide":""}`}><button className="close" onClick={close}>×</button><h2>{title}</h2>{children}</div></div>}
function Info({k,v}:{k:string;v:any}){return <div className="info"><small>{k}</small><b>{v}</b></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function Locked({message}:{message:string}){return <div className="lockedBox"><span>🔒</span><h2>Active subscription required</h2><p>{message}</p><p className="muted">Choose a programme and complete payment to unlock training, nutrition, progress and coaching features.</p><a className="btn red" href="/programs">Choose Programme & Pay</a></div>}
