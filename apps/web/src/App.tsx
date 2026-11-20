import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { api, apiBlob, API_ORIGIN } from "./lib/api";
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
const loadUser=()=>{try{return JSON.parse(sessionStorage.getItem("user")||"null") as User|null}catch{return null}};
const money=(paise:number)=>`₹${(paise/100).toLocaleString("en-IN")}`;
const date=(v:string)=>new Date(v).toLocaleString("en-US",{
  month:"short",
  day:"numeric",
  year:"numeric",
  hour:"numeric",
  minute:"2-digit",
  hour12:true
});

const time12=(value:string)=>{
  if(!value)return "—";

  const [h,m]=value.split(":").map(Number);

  const d=new Date();
  d.setHours(h||0,m||0,0,0);

  return d.toLocaleTimeString("en-US",{
    hour:"numeric",
    minute:"2-digit",
    hour12:true
  });
};

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

  const [galleryIndex,setGalleryIndex]=useState(0);
  const [galleryTouchStart,setGalleryTouchStart]=useState<number|null>(null);

  const path=location.pathname;

  useEffect(()=>{
    api<Program[]>("/programs")
      .then(setPrograms)
      .catch(()=>{})
  },[]);

  useEffect(()=>{
    if(path!=="/") return;

    const timer=window.setInterval(()=>{
      setGalleryIndex(current=>(current+1)%4);
    },5000);

    return ()=>window.clearInterval(timer);
  },[path]);

  useEffect(()=>{
    if(
      path==="/" &&
      new URLSearchParams(location.search).get("talk")==="1"
    ){
      setModal("call");
    }
  },[path]);

  useEffect(()=>{
    if(path!=="/") return;

    const reduceMotion=window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const selectors=[
      ".publicPage .homeSectionHeading",
      ".publicPage .homeValueCard",
      ".publicPage .homeGalleryIntro",
      ".publicPage .homeIcnCarousel",
      ".publicPage .homeSocialCue",
      ".publicPage .homeSocialLink",
      ".publicPage .homeAboutPortrait",
      ".publicPage .homeAboutEditorialCopy",
      ".publicPage .homeFinalCtaInner"
    ];

    const elements=Array.from(
      document.querySelectorAll<HTMLElement>(
        selectors.join(",")
      )
    );

    document
      .querySelectorAll<HTMLElement>(".homeValueCard")
      .forEach((el,index)=>{
        el.style.setProperty(
          "--home-motion-delay",
          `${index*75}ms`
        );
      });

    document
      .querySelectorAll<HTMLElement>(".homeSocialLink")
      .forEach((el,index)=>{
        el.style.setProperty(
          "--home-motion-delay",
          `${index*90}ms`
        );
      });

    if(reduceMotion){
      elements.forEach(el=>{
        el.classList.add(
          "homeMotionTarget",
          "homeMotionVisible"
        );
      });
      return;
    }

    elements.forEach(el=>{
      el.classList.add("homeMotionTarget");
    });

    const observer=new IntersectionObserver(
      entries=>{
        entries.forEach(entry=>{
          if(!entry.isIntersecting)return;

          entry.target.classList.add(
            "homeMotionVisible"
          );

          observer.unobserve(entry.target);
        });
      },
      {
        threshold:.12,
        rootMargin:"0px 0px -6% 0px"
      }
    );

    elements.forEach(el=>observer.observe(el));

    return ()=>observer.disconnect();
  },[path]);

  function session(token:string,u:User,next?:string){
    // Remove legacy shared login values.
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    // Keep each browser tab logged into its own account.
    sessionStorage.setItem("token",token);
    sessionStorage.setItem("user",JSON.stringify(u));

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
    e.preventDefault();

    const f=new FormData(e.currentTarget);

    const requestedDate=String(
      f.get("date")||""
    );

    const requestedTime=String(
      f.get("time")||""
    );

    const reason=String(
      f.get("reason")||""
    ).trim();

    const message=[
      "Talk to Jay / consultation request",
      requestedDate&&requestedTime
        ?`Preferred call: ${requestedDate} at ${requestedTime} IST`
        :"",
      reason
        ?`What they want to discuss: ${reason}`
        :""
    ].filter(Boolean).join("\n");

    try{
      await api("/leads",{
        method:"POST",
        body:JSON.stringify({
          fullName:f.get("fullName"),
          email:f.get("email"),
          phone:f.get("phone"),
          fitnessGoal:"Consultation / Custom Coaching",
          message
        })
      });

      setNotice(
        "Request sent. Jay can contact you directly."
      );

      setModal(null);
    }catch(e:any){
      setNotice(e.message);
    }
  }

  function logout(){
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    // Clean old authentication values if they still exist.
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    location.href="/";
  }

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
      <div className="actions">
        {user?.role==="CLIENT"
          ?<a className="btn ghost" href="/dashboard">
            My Dashboard
          </a>
          :<button
            className="btn ghost"
            onClick={()=>setModal("login")}
          >
            Client Login
          </button>
        }

        <button
          className="btn red"
          onClick={()=>setModal("call")}
        >
          Talk to Jay
        </button>
      </div>
    </header>
    {notice&&<div className="notice" onClick={()=>setNotice("")}>{notice} ×</div>}
    <main>
      <section className="hero" id="home">
        <div className="heroFadeShow" aria-hidden="true">
          <img src="/assets/hero-fade/jay-hero-fade-1.jpeg" alt=""/>
          <img src="/assets/hero-fade/jay-hero-fade-2.jpeg" alt=""/>
          <img src="/assets/hero-fade/jay-hero-fade-3.jpeg" alt=""/>
          <img src="/assets/hero-fade/jay-hero-fade-4.jpeg" alt=""/>
        </div>

        <div className="heroFadeShade" aria-hidden="true"></div>

        <div className="heroInner">
        <p className="eyebrow">TRANSFORM YOUR <i>BODY.</i><br/>ELEVATE YOUR <i>LIFE.</i></p>
        <h1>jay.<br/><span>__sthetics</span></h1><h2>Online Coaching. Real Results.</h2>
        <p className="muted">Personalized training, nutrition, weekly check-ins and direct coaching support in one platform.</p>
        <div className="heroButtons">
          <button
            className="btn red"
            onClick={()=>setModal("call")}
          >
            Talk to Jay →
          </button>

          <a
            className="btn ghost"
            href="/programs"
          >
            View Coaching Options
          </a>
        </div>
      </div>
      </section>

      <section className="homeValueSection">
        <div className="homeSectionInner">
          <div className="homeSectionHeading">
            <p className="eyebrow redText">
              1:1 ONLINE COACHING
            </p>

            <h2>
              EVERYTHING YOU NEED.<br/>
              <span>BUILT AROUND YOU.</span>
            </h2>

            <p>
              A complete coaching system combining structured
              training, practical nutrition, accountability and
              measurable progress.
            </p>
          </div>

          <div className="homeValueGrid">
            {[
              ["01","Training","Programming designed around your experience, physique and goals."],
              ["02","Nutrition","Practical nutrition targets and meal options you can actually follow."],
              ["03","Weekly Check-ins","Regular progress reviews so adjustments are made when they matter."],
              ["04","Progress Tracking","Track bodyweight, measurements, performance and overall progress."],
              ["05","Direct Support","Private communication with Jay throughout your coaching journey."],
              ["06","Accountability","A structured system that keeps you consistent and moving forward."]
            ].map(([number,title,copy])=>
              <article className="homeValueCard" key={title}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            )}
          </div>
        </div>
      </section>


      <section className="homeGallerySection homeIcnGallery">
        <div className="homeGalleryIntro">
          <h2>ICN 2025 <span className="homeIcnCity">HYDERABAD</span></h2>
          <p>Classic Physique — Silver Medal ×2 · Posing Champion</p>
        </div>

        <div
          className="homeIcnCarousel homeIcnManual"
          aria-label="Jay ICN 2025 gallery"
          onTouchStart={e=>setGalleryTouchStart(e.touches[0].clientX)}
          onTouchEnd={e=>{
            if(galleryTouchStart===null)return;
            const delta=e.changedTouches[0].clientX-galleryTouchStart;

            if(Math.abs(delta)>45){
              setGalleryIndex(current=>
                delta<0
                  ?(current+1)%4
                  :(current+3)%4
              );
            }

            setGalleryTouchStart(null);
          }}
        >
          <button
            className="homeIcnArrow homeIcnArrowLeft"
            type="button"
            aria-label="Previous photo"
            onClick={()=>setGalleryIndex(current=>(current+3)%4)}
          >
            ‹
          </button>

          <div
            className="homeIcnTrack"
            style={{
              transform:`translateX(calc(${galleryIndex} * (-1 * (clamp(300px,30vw,420px) + 20px))))`
            }}
          >
            {[
              "/assets/icn-2025/icn-2025-1.jpeg",
              "/assets/icn-2025/icn-2025-2.jpeg",
              "/assets/icn-2025/icn-2025-3.jpeg",
              "/assets/icn-2025/icn-2025-4.jpeg"
            ].map((src,index)=>
              <figure className="homeIcnCard" key={src}>
                <img
                  src={src}
                  alt={`Jay at ICN 2025 ${index+1}`}
                  loading={index===0?"eager":"lazy"}
                />
              </figure>
            )}
          </div>

          <button
            className="homeIcnArrow homeIcnArrowRight"
            type="button"
            aria-label="Next photo"
            onClick={()=>setGalleryIndex(current=>(current+1)%4)}
          >
            ›
          </button>

          <div className="homeIcnDots" aria-label="Gallery navigation">
            {[0,1,2,3].map(index=>
              <button
                type="button"
                key={index}
                className={galleryIndex===index?"active":""}
                aria-label={`Go to photo ${index+1}`}
                onClick={()=>setGalleryIndex(index)}
              />
            )}
          </div>
        </div>
      </section>


      <section className="homeSocialBridge" aria-label="Jay social links">
        <div className="homeSocialCue">
          <span className="homeSocialEyebrow">
            SOCIALS & CONTACT
          </span>

          <h3>
            CONNECT WITH JAY
          </h3>

          <p>
            Choose a platform below
          </p>
        </div>

        <div className="homeSocialBridgeInner">

          <a
            className="homeSocialLink"
            href="https://www.instagram.com/jay.__sthetics?bqrl=MXFiMzN0NDBoY2JiNA%3D%3D&utm_source=qr"
            target="_blank"
            rel="noreferrer"
            aria-label="Jay Sthetics on Instagram"
          >
            <span className="homeSocialIcon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="1"/>
              </svg>
            </span>

            <span>
              <small>FOLLOW</small>
              <strong>Instagram</strong>
            </span>
          </a>

          <a
            className="homeSocialLink"
            href="mailto:jaystheticscoaching@gmail.com"
            aria-label="Email Jay Sthetics Coaching"
          >
            <span className="homeSocialIcon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2"/>
                <path d="M4 7l8 6 8-6"/>
              </svg>
            </span>

            <span>
              <small>CONTACT</small>
              <strong>Gmail</strong>
            </span>
          </a>

          <a
            className="homeSocialLink"
            href="https://youtube.com/@jay_sthetics?si=L1JB9tAZff03qh3H"
            target="_blank"
            rel="noreferrer"
            aria-label="Jay Sthetics on YouTube"
          >
            <span className="homeSocialIcon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2.5" y="5" width="19" height="14" rx="4"/>
                <path d="M10 9l6 3-6 3z"/>
              </svg>
            </span>

            <span>
              <small>WATCH</small>
              <strong>YouTube</strong>
            </span>
          </a>

        </div>
      </section>

      <section
        className="homeAboutSection homeAboutEditorial"
        id="about"
      >
        <div className="homeAboutEditorialInner">
          <div className="homeAboutPortrait">
            <img
              src="/assets/jay-about-portrait.jpg"
              alt="Jay"
              loading="lazy"
            />
          </div>

          <div className="homeAboutEditorialCopy">
            <p className="eyebrow">
              WHO IS JAY?
            </p>

            <h2>
              COACH.<br/>
              ATHLETE.<br/>
              MENTOR.
            </h2>

            <p>
              Jay's coaching is built around structure,
              consistency and measurable progress.
            </p>

            <p>
              Every client gets direct guidance across training,
              nutrition, weekly check-ins and accountability —
              all managed in one place.
            </p>

            <p>
              The goal is simple: build a plan you can execute,
              measure and improve over time.
            </p>

            <strong className="homeAboutStatement">
              No generic plans. No unnecessary complexity.
              Just focused coaching built around you.
            </strong>

            <div className="homeAboutEditorialActions">
              <button
                className="btn red"
                onClick={()=>setModal("call")}
              >
                Start Your Journey
              </button>

              <a className="btn ghost" href="/programs">
                View Coaching
              </a>
            </div>
          </div>
        </div>
      </section>

      <section
        className="homeFinalCta"
        id="contact"
      >
        <div className="homeFinalCtaInner">
          <p className="eyebrow">
            READY WHEN YOU ARE
          </p>

          <h2>
            BUILD YOUR<br/>
            <span>BEST PHYSIQUE.</span>
          </h2>

          <p>
            Speak directly with Jay about your goal and find
            the coaching option that fits you.
          </p>

          <div className="homeFinalActions">
            <button
              className="btn red"
              onClick={()=>setModal("call")}
            >
              Talk to Jay →
            </button>

            <a
              className="btn ghost"
              href="/programs"
            >
              Explore Coaching
            </a>
          </div>
        </div>
      </section>
    </main>
    <footer><div className="brand"><b>jay.</b><span>__sthetics</span></div><span>© 2026 jay.__sthetics</span></footer>
    {modal&&<div className="modal" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><div className="modalCard"><button className="close" onClick={()=>setModal(null)}>×</button>
      {modal==="login"&&<><div className="modalAuthHead"><span>WELCOME BACK</span><h2>Client Login</h2><p>Access your training, nutrition, progress and coaching support.</p></div><form className="authForm compact" onSubmit={login}><label>Email address<input name="email" type="email" placeholder="name@example.com" autoComplete="email" required/></label><label>Password<PasswordField placeholder="Enter your password" autoComplete="current-password"/></label><div className="authOptions"><span>Your account is protected</span><a href="/forgot-password">Forgot password?</a></div><button className="btn red full authSubmit">Sign In</button></form><div className="modalLoginFooter"><span>Don't have an account?</span><button onClick={()=>{setModal(null);location.href="/programs"}}>View programmes</button></div></>}
      {modal==="signup"&&<><h2>Start Coaching</h2>{selectedProgram&&<div className="selectedPlanMini"><small>SELECTED PROGRAMME</small><b>{selectedProgram.name}</b><span>{money(selectedProgram.pricePaise)}</span></div>}<form onSubmit={register}><input name="fullName" placeholder="Full name" required/><input name="email" type="email" placeholder="Email" required/><input name="phone" placeholder="Phone" required/><PasswordField placeholder="Create password" autoComplete="new-password" minLength={8}/><button className="btn red full">Create Account</button></form>{selectedProgram&&<div className="modalLoginFooter"><span>Already have an account?</span><button onClick={()=>setModal("login")}>Sign in instead</button></div>}</>}
      {modal==="call"&&<><div className="modalAuthHead"><span>PERSONAL CONSULTATION</span><h2>Talk to Jay</h2><p>Tell Jay what you're looking for and choose a preferred time to be contacted. Your enquiry will appear directly in Jay's Leads section.</p></div><form className="authForm compact" onSubmit={schedulePublicCall}><label>Full name<input name="fullName" required/></label><label>Email<input name="email" type="email" required/></label><label>Phone<input name="phone" required/></label><div className="formGrid"><label>Date<input name="date" type="date" required/></label><label>Time (IST)<input name="time" type="time" required/></label></div><label>What do you want to discuss?<textarea name="reason" placeholder="Your goal, preferred duration, questions or anything Jay should know."/></label><button className="btn red full">Send Request to Jay</button></form></>}
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
  const [adminUnread,setAdminUnread]=useState(0);

  useEffect(()=>{
    async function refreshUnread(){
      try{
        const rows=await api<any[]>("/admin/conversations");
        setAdminUnread(
          rows.reduce((sum:number,c:any)=>sum+(c.unreadCount||0),0)
        );
      }catch{}
    }

    refreshUnread();
    const id=setInterval(refreshUnread,3000);

    return()=>clearInterval(id);
  },[]);

  return <div className="appShell">
    <Sidebar
      items={adminTabs}
      tab={tab}
      setTab={setTab}
      logout={logout}
      badges={{messages:adminUnread}}
    />
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
      {tab==="check-ins"&&
        <AdminCheckins
          setNotice={setNotice}
        />
      }
      {tab==="calls"&&<AdminCalls setNotice={setNotice}/>}
      {tab==="messages"&&<AdminMessages/>}
      {tab==="payments"&&<AdminPayments/>}
      {tab==="settings"&&<AdminSettings setNotice={setNotice}/>}
    </main>
  </div>
}

function Sidebar({
  items,
  tab,
  setTab,
  logout,
  badges={}
}:{
  items:string[];
  tab:string;
  setTab:(x:string)=>void;
  logout:()=>void;
  badges?:Record<string,number>;
}){
  const [mobileOpen,setMobileOpen]=useState(false);

  const icon=(x:string)=>({
    overview:"◫",
    clients:"◉",
    leads:"◎",
    programs:"▦",
    "exercise library":"✦",
    "workout plans":"⌁",
    "workout plan":"⌁",
    nutrition:"◇",
    "check-ins":"✓",
    calls:"☎",
    messages:"✉",
    payments:"▣",
    settings:"⚙",
    dashboard:"◫",
    onboarding:"◎",
    training:"⌁",
    progress:"↗",
    "weekly check-in":"✓",
    chat:"✉"
  } as Record<string,string>)[x]||"•";

  function selectTab(x:string){
    setTab(x);
    setMobileOpen(false);
  }

  return <>
    <div className="mobileAppHeader">
      <div className="mobileAppIdentity">
        <div className="brand">
          <b>jay.</b><span>__sthetics</span>
        </div>

        <small>
          {tab.split("-").join(" ")}
        </small>
      </div>

      <button
        type="button"
        className="mobileMenuTrigger"
        aria-label="Open navigation"
        onClick={()=>setMobileOpen(true)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>

    {mobileOpen&&
      <button
        type="button"
        className="mobileNavOverlay"
        aria-label="Close navigation"
        onClick={()=>setMobileOpen(false)}
      />
    }

    <aside
      className={`sidebar premiumSidebar ${
        mobileOpen ? "mobileSidebarOpen" : ""
      }`}
    >
      <div className="sidebarBrandWrap">
        <div className="brand">
          <b>jay.</b><span>__sthetics</span>
        </div>

        <small>COACHING PLATFORM</small>

        <button
          type="button"
          className="mobileSidebarClose"
          aria-label="Close navigation"
          onClick={()=>setMobileOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="sidebarNav">
        {items.map(x=>
          <button
            key={x}
            className={tab===x?"sideActive":""}
            onClick={()=>selectTab(x)}
          >
            <span className="sideIcon">
              {icon(x)}
            </span>

            <span className="sideLabel">
              {x}
            </span>

            {!!badges[x]&&
              <span className="messageBadge">
                {badges[x]>99?"99+":badges[x]}
              </span>
            }
          </button>
        )}
      </div>

      <div className="sidebarFooter">
        <button
          className="logoutBtn"
          onClick={logout}
        >
          <span>↪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  </>
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

function ProfilePhoto({src,name,size=52}:{src?:string|null;name?:string;size?:number}){
  const [url,setUrl]=useState("");

  useEffect(()=>{
    let objectUrl="";

    if(!src){
      setUrl("");
      return;
    }

    const protectedSrc=src.startsWith("/uploads/")
      ? `/api/media/${src.split("/").pop()}`
      : src;

    if(!protectedSrc.startsWith("/api/")){
      setUrl(protectedSrc);
      return;
    }

    apiBlob(protectedSrc.replace(/^\/api/,""))
      .then(blob=>{
        objectUrl=URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(()=>setUrl(""));

    return()=>{
      if(objectUrl) URL.revokeObjectURL(objectUrl);
    };
  },[src]);

  if(url){
    return <img
      src={url}
      alt={name||"Client"}
      style={{
        width:size,
        height:size,
        borderRadius:"50%",
        objectFit:"cover",
        flex:"0 0 auto"
      }}
    />;
  }

  return <div
    className="clientInitial"
    style={{
      width:size,
      height:size,
      minWidth:size,
      display:"flex",
      alignItems:"center",
      justifyContent:"center"
    }}
  >
    {name?.[0]?.toUpperCase()||"?"}
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
  async function assignProgram(
    programId:string,
    startsAt?:string,
    endsAt?:string
  ){
    if(!selected||!programId)return;

    await api(`/admin/clients/${selected.id}/subscription`,{
      method:"POST",
      body:JSON.stringify({
        programId,
        status:"ACTIVE",
        startsAt:startsAt||undefined,
        endsAt:endsAt||undefined
      })
    });

    setNotice("Programme assigned.");
    refresh();
  }

  async function assignExistingClient(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!selected)return;

    const form=e.currentTarget;
    const f=new FormData(form);

    try{
      await assignProgram(
        String(f.get("programId")||""),
        String(f.get("startsAt")||""),
        String(f.get("endsAt")||"")
      );

      form.reset();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function updateActiveSubscriptionDates(
    subscriptionId:string,
    startsAt:string,
    endsAt:string
  ){
    try{
      await api(`/admin/subscriptions/${subscriptionId}/dates`,{
        method:"PATCH",
        body:JSON.stringify({
          startsAt,
          endsAt
        })
      });

      setNotice("Active subscription dates updated.");
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }
  async function createCustomOffer(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!selected)return;

    const form=e.currentTarget;
    const f=new FormData(form);

    try{
      const result=await api<any>(
        `/admin/clients/${selected.id}/custom-plan`,
        {
          method:"POST",
          body:JSON.stringify({
            coachingType:f.get("coachingType"),
            durationMonths:Number(f.get("durationMonths")),
            priceRupees:Number(f.get("priceRupees")),
            description:String(f.get("description")||"")
          })
        }
      );

      setNotice(
        `Custom offer created: ${money(result.pricePaise)}`
      );

      form.reset();
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function updateCustomOffer(
    offerId:string,
    e:FormEvent<HTMLFormElement>
  ){
    e.preventDefault();

    const f=new FormData(e.currentTarget);

    try{
      await api(`/admin/custom-plans/${offerId}`,{
        method:"PATCH",
        body:JSON.stringify({
          durationMonths:Number(f.get("durationMonths")),
          priceRupees:Number(f.get("priceRupees")),
          description:String(f.get("description")||"")
        })
      });

      setNotice("Custom offer updated.");
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function disableCustomOffer(offerId:string){
    if(!window.confirm(
      "Disable this custom checkout offer?"
    ))return;

    try{
      await api(`/admin/custom-plans/${offerId}`,{
        method:"PATCH",
        body:JSON.stringify({
          isActive:false
        })
      });

      setNotice("Custom offer disabled.");
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteCustomOffer(offerId:string){
    if(!window.confirm(
      "Delete this unused custom offer permanently? Used offers are protected."
    ))return;

    try{
      await api(`/admin/custom-plans/${offerId}`,{
        method:"DELETE"
      });

      setNotice("Custom offer deleted.");
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function copyCustomCheckout(programId:string){
    const url=
      `${location.origin}/checkout?programId=${programId}`;

    try{
      await navigator.clipboard.writeText(url);
      setNotice("Private checkout link copied.");
    }catch{
      setNotice(url);
    }
  }

  async function deleteClient(){
    if(!selected)return;

    if(!window.confirm(
      `Delete ${selected.fullName}? Paid clients with successful payment history will automatically be protected from permanent deletion.`
    ))return;

    if(!window.confirm(
      "Final confirmation: permanently delete this unpaid/demo client?"
    ))return;

    try{
      await api(`/admin/clients/${selected.id}`,{
        method:"DELETE"
      });

      setNotice("Client deleted.");
      setSelected(null);
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteCheckIn(id:string){
    if(!window.confirm(
      "Delete this check-in permanently?"
    ))return;

    try{
      await api(`/admin/check-ins/${id}`,{
        method:"DELETE"
      });

      setNotice("Check-in deleted.");
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteNote(id:string){
    if(!selected)return;

    if(!window.confirm(
      "Delete this private coach note?"
    ))return;

    try{
      await api(
        `/admin/clients/${selected.id}/notes/${id}`,
        {
          method:"DELETE"
        }
      );

      setNotice("Note deleted.");
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteWorkoutAssignment(id:string){
    if(!selected)return;

    if(!window.confirm(
      "Remove this workout assignment from the client?"
    ))return;

    try{
      await api(
        `/admin/clients/${selected.id}/workouts/${id}`,
        {
          method:"DELETE"
        }
      );

      setNotice("Workout assignment removed.");
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteNutritionAssignment(id:string){
    if(!selected)return;

    if(!window.confirm(
      "Remove this nutrition assignment from the client?"
    ))return;

    try{
      await api(
        `/admin/clients/${selected.id}/nutrition/${id}`,
        {
          method:"DELETE"
        }
      );

      setNotice("Nutrition assignment removed.");
      refresh();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function assignWorkout(workoutPlanId:string){if(!selected||!workoutPlanId)return;await api(`/admin/clients/${selected.id}/workout`,{method:"POST",body:JSON.stringify({workoutPlanId})});setNotice("Workout assigned.");refresh()}
  async function assignNutrition(nutritionPlanId:string){if(!selected||!nutritionPlanId)return;await api(`/admin/clients/${selected.id}/nutrition`,{method:"POST",body:JSON.stringify({nutritionPlanId})});setNotice("Nutrition assigned.");refresh()}
  async function saveProfile(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const f=new FormData(e.currentTarget);try{await api(`/admin/clients/${selected.id}/profile`,{method:"PATCH",body:JSON.stringify({fullName:f.get("fullName"),phone:f.get("phone"),dateOfBirth:f.get("dob"),heightCm:Number(f.get("height")),currentWeightKg:Number(f.get("weight")),fitnessGoal:f.get("goal"),trainingExperience:f.get("experience")})});setNotice("Client details updated.");refresh()}catch(e:any){setNotice(e.message)}}
  async function addNote(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const f=new FormData(e.currentTarget);await api(`/admin/clients/${selected.id}/notes`,{method:"POST",body:JSON.stringify({body:f.get("body")})});e.currentTarget.reset();setNotice("Private note saved.");refresh()}
  return <div>
    <div className="toolbar"><div className="search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, email or phone"/><button className="btn ghost" onClick={()=>load()}>Search</button></div><div className="toolbarActions"><button className="btn ghost" onClick={()=>downloadExcel("jay-sthetics-clients.xlsx",[{name:"Clients",rows:clients.map(c=>({Client_ID:c.id,Name:c.fullName,Email:c.email,Phone:c.phone||"",Account_Status:c.isActive?"Active":"Disabled",Programme:c.subscriptions?.[0]?.program?.name||"Not assigned",Subscription_Status:c.subscriptions?.[0]?.status||"No subscription",Joined:new Date(c.createdAt).toLocaleDateString()}))}])}>↓ Excel</button><button className="btn red" onClick={()=>setShowNew(true)}>+ Add Client</button></div></div>
    <div className="dataTable premiumTable"><div className="tr head"><span>Client</span><span>Contact</span><span>Programme</span><span>Access</span></div>{clients.map(c=><button className="tr rowButton" key={c.id} onClick={()=>open(c.id)}><span style={{display:"flex",alignItems:"center",gap:"10px"}}>
  <ProfilePhoto
    src={c.clientProfile?.profilePhotoUrl}
    name={c.fullName}
    size={42}
  />
  <span>
    <b>{c.fullName}</b>
    <small>{date(c.createdAt)}</small>
  </span>
</span><span>{c.email}<small>{c.phone||"No phone"}</small></span><span>{c.subscriptions?.[0]?.program?.name||"Not assigned"}</span><span>{c.subscriptions?.[0]?.status||"NO PLAN"}</span></button>)}</div>
    {showNew&&<Dialog title="Create Client" close={()=>setShowNew(false)}><form onSubmit={create}><input name="fullName" placeholder="Full name" required/><input name="email" type="email" placeholder="Email" required/><input name="phone" placeholder="Phone"/><input name="goal" placeholder="Fitness goal"/><input name="password" placeholder="Temporary password" minLength={8} required/><button className="btn red full">Create Client</button></form></Dialog>}
    {selected&&<div className="clientWorkspaceOverlay"><div className="clientWorkspace"><div className="clientWorkspaceTop"><button className="backClient" onClick={()=>setSelected(null)}>← Back to clients</button><div className="clientIdentity">
  <ProfilePhoto
    src={selected.clientProfile?.profilePhotoUrl}
    name={selected.fullName}
    size={64}
  />

  <div>
    <h2>{selected.fullName}</h2>
    <p>{selected.email}</p>

    {selected.phone?
      <div style={{display:"flex",alignItems:"center",gap:"10px",marginTop:"6px"}}>
        <span>{selected.phone}</span>
        <a
          className="btn ghost"
          href={`tel:${selected.phone}`}
          style={{padding:"6px 10px"}}
        >
          Call Client
        </a>
      </div>
      :
      <p>No phone</p>
    }
  </div>
</div>

<div className="clientTopActions">
  <div className="clientAccessBadge">
    {selected.subscriptions?.[0]?.status||"NO PLAN"}
  </div>

  <button
    type="button"
    className="btn dangerBtn"
    onClick={deleteClient}
  >
    Delete Client
  </button>
</div></div>
      <div className="clientTabs">{["overview","profile","subscription","workout","nutrition","check-ins","calls","payments","notes"].map(t=><button key={t} className={clientTab===t?"active":""} onClick={()=>setClientTab(t)}>{t}</button>)}</div><div className="clientWorkspaceBody">
      {clientTab==="overview"&&<div className="clientOverviewGrid"><div className="clientHeroCard"><small>COACHING STATUS</small><h2>{selected.subscriptions?.[0]?.program?.name||"No programme assigned"}</h2><p>{selected.subscriptions?.[0]?.status||"No coaching access yet."}</p></div><Info k="Goal" v={selected.clientProfile?.fitnessGoal||"Not added"}/><Info k="Weight" v={selected.clientProfile?.currentWeightKg?`${selected.clientProfile.currentWeightKg} kg`:"Not added"}/><Info k="Height" v={selected.clientProfile?.heightCm?`${selected.clientProfile.heightCm} cm`:"Not added"}/><Info k="Experience" v={selected.clientProfile?.trainingExperience||selected.clientProfile?.experienceLevel||"Not added"}/></div>}
      {clientTab==="profile"&&<div className="clientSection"><h3>Client Details</h3><form onSubmit={saveProfile} className="profileForm"><div className="formGrid"><label>Full name<input name="fullName" defaultValue={selected.fullName} required/></label><label>Contact number<input name="phone" defaultValue={selected.phone||""} required/></label></div><div className="formGrid"><label>Date of birth<input name="dob" type="date" defaultValue={selected.clientProfile?.dateOfBirth?String(selected.clientProfile.dateOfBirth).slice(0,10):""} required/></label><label>Height (cm)<input name="height" type="number" step=".1" defaultValue={selected.clientProfile?.heightCm||""} required/></label></div><div className="formGrid"><label>Weight (kg)<input name="weight" type="number" step=".1" defaultValue={selected.clientProfile?.currentWeightKg||""} required/></label><label>Training experience<input name="experience" defaultValue={selected.clientProfile?.trainingExperience||selected.clientProfile?.experienceLevel||""} required/></label></div><label>Goal<textarea name="goal" defaultValue={selected.clientProfile?.fitnessGoal||""} required/></label><button className="btn red">Save Details</button></form></div>}
      {clientTab==="subscription"&&
  <div className="clientSection">
    <h3>Subscription</h3>

    <p className="muted">
      Activate an existing coaching customer without creating a Razorpay payment.
    </p>

    <form
      onSubmit={assignExistingClient}
      style={{
        padding:"18px",
        border:"1px solid rgba(255,255,255,.08)",
        borderRadius:"14px",
        marginBottom:"24px"
      }}
    >
      <label>
        Programme
        <select
          className="largeSelect"
          name="programId"
          defaultValue=""
          required
        >
          <option value="" disabled>
            Choose programme…
          </option>

          {programs.filter(
            p=>
              p.isActive &&
              !p.slug.startsWith("custom-")
          ).map(p=>
            <option key={p.id} value={p.id}>
              {p.name} · {money(p.pricePaise)}
            </option>
          )}
        </select>
      </label>

      <div className="formGrid" style={{marginTop:"12px"}}>
        <label>
          Coaching start date
          <input
            name="startsAt"
            type="date"
            required
          />
        </label>

        <label>
          Coaching end date
          <input
            name="endsAt"
            type="date"
            required
          />
        </label>
      </div>

      <button
        className="btn red"
        type="submit"
        style={{marginTop:"12px"}}
      >
        Activate Existing Client
      </button>
    </form>

    <div className="customOfferAdmin">
      <div className="customOfferAdminHead">
        <small className="redText">
          PRIVATE CLIENT OFFER
        </small>

        <h3>
          Custom Coaching Plan
        </h3>

        <p className="muted">
          Create a custom duration and agreed price for this
          specific client. These offers never appear publicly.
        </p>
      </div>

      <form
        onSubmit={createCustomOffer}
        className="customOfferForm"
      >
        <div className="formGrid">
          <label>
            Coaching type

            <select
              name="coachingType"
              defaultValue="NATURAL"
              required
            >
              <option value="NATURAL">
                Natural Coaching
              </option>

              <option value="ENHANCED">
                Enhanced Coaching
              </option>
            </select>
          </label>

          <label>
            Duration (months)

            <input
              name="durationMonths"
              type="number"
              min="1"
              max="24"
              placeholder="2, 4, 5..."
              required
            />
          </label>
        </div>

        <label>
          Agreed price (₹)

          <input
            name="priceRupees"
            type="number"
            min="1"
            placeholder="12000"
            required
          />
        </label>

        <label>
          Offer description

          <textarea
            name="description"
            placeholder="Custom coaching details..."
          />
        </label>

        <button
          className="btn red"
          type="submit"
        >
          Create Private Checkout Offer
        </button>
      </form>

      {!!selected.customOffers?.length&&
        <div className="customOfferList">
          <h4>
            Custom Offers for {selected.fullName}
          </h4>

          {selected.customOffers.map((offer:any)=>{
            const months=
              offer.durationDays
                ?Math.round(offer.durationDays/30)
                :0;

            return <div
              className="customOfferCard"
              key={offer.id}
            >
              <div className="customOfferTitle">
                <div>
                  <span
                    className={`offerStatus ${
                      offer.isActive
                        ?"active"
                        :"inactive"
                    }`}
                  >
                    {offer.isActive
                      ?"ACTIVE OFFER"
                      :"DISABLED"
                    }
                  </span>

                  <h4>
                    {offer.name}
                  </h4>

                  <p>
                    {offer.description}
                  </p>
                </div>

                <strong>
                  {money(offer.pricePaise)}
                </strong>
              </div>

              <form
                className="customOfferEdit"
                onSubmit={e=>
                  updateCustomOffer(
                    offer.id,
                    e
                  )
                }
              >
                <div className="formGrid">
                  <label>
                    Duration (months)

                    <input
                      name="durationMonths"
                      type="number"
                      min="1"
                      max="24"
                      defaultValue={months}
                      required
                    />
                  </label>

                  <label>
                    Price (₹)

                    <input
                      name="priceRupees"
                      type="number"
                      min="1"
                      defaultValue={
                        offer.pricePaise/100
                      }
                      required
                    />
                  </label>
                </div>

                <label>
                  Description

                  <textarea
                    name="description"
                    defaultValue={
                      offer.description
                    }
                  />
                </label>

                <div className="customOfferActions">
                  <button
                    className="btn ghost"
                    type="submit"
                  >
                    Save Changes
                  </button>

                  {offer.isActive&&
                    <button
                      className="btn red"
                      type="button"
                      onClick={()=>
                        copyCustomCheckout(
                          offer.id
                        )
                      }
                    >
                      Copy Checkout Link
                    </button>
                  }

                  {offer.isActive&&
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={()=>
                        disableCustomOffer(
                          offer.id
                        )
                      }
                    >
                      Disable Offer
                    </button>
                  }

                  <button
                    className="btn dangerBtn"
                    type="button"
                    onClick={()=>
                      deleteCustomOffer(
                        offer.id
                      )
                    }
                  >
                    Delete Offer
                  </button>
                </div>
              </form>
            </div>
          })}
        </div>
      }
    </div>

    <h3>Subscription History</h3>

    {selected.subscriptions?.length?
      selected.subscriptions.map((x:any)=>
        <div
          className="managementRow"
          key={x.id}
          style={{
            alignItems:"flex-start",
            gap:"16px"
          }}
        >
          <div style={{flex:1}}>
            <b>{x.program.name}</b>
            <small>Status: {x.status}</small>

            <small>
              Start:{" "}
              {x.startsAt
                ? new Date(x.startsAt).toLocaleDateString()
                : "Not set"}
            </small>

            <small>
              End:{" "}
              {x.endsAt
                ? new Date(x.endsAt).toLocaleDateString()
                : "Not set"}
            </small>
          </div>

          {x.status==="ACTIVE"&&
            <form
              onSubmit={e=>{
                e.preventDefault();

                const f=new FormData(e.currentTarget);

                updateActiveSubscriptionDates(
                  x.id,
                  String(f.get("startsAt")||""),
                  String(f.get("endsAt")||"")
                );
              }}
              style={{
                display:"grid",
                gap:"8px",
                minWidth:"220px"
              }}
            >
              <label>
                <small>Start date</small>
                <input
                  name="startsAt"
                  type="date"
                  defaultValue={
                    x.startsAt
                      ? String(x.startsAt).slice(0,10)
                      : ""
                  }
                  required
                />
              </label>

              <label>
                <small>End date</small>
                <input
                  name="endsAt"
                  type="date"
                  defaultValue={
                    x.endsAt
                      ? String(x.endsAt).slice(0,10)
                      : ""
                  }
                  required
                />
              </label>

              <button
                className="btn ghost"
                type="submit"
              >
                Update Active Dates
              </button>
            </form>
          }
        </div>
      )
      :
      <Empty text="No subscription history yet."/>
    }
  </div>
}
      {clientTab==="workout"&&
        <div className="clientSection">
          <h3>Workout</h3>

          <select
            className="largeSelect"
            defaultValue=""
            onChange={e=>
              assignWorkout(e.target.value)
            }
          >
            <option value="" disabled>
              Assign workout plan…
            </option>

            {workouts.map(x=>
              <option
                key={x.id}
                value={x.id}
              >
                {x.name}
              </option>
            )}
          </select>

          {selected.workouts?.map((x:any)=>
            <div
              className="managementRow"
              key={x.id}
            >
              <div>
                <b>
                  {x.workoutPlan.name}
                </b>

                <small>
                  {new Date(
                    x.assignedAt
                  ).toLocaleDateString()}
                </small>
              </div>

              <button
                className="btn dangerBtn"
                onClick={()=>
                  deleteWorkoutAssignment(
                    x.id
                  )
                }
              >
                Remove
              </button>
            </div>
          )}
        </div>
      }
      {clientTab==="nutrition"&&
        <div className="clientSection">
          <h3>Nutrition</h3>

          <select
            className="largeSelect"
            defaultValue=""
            onChange={e=>
              assignNutrition(
                e.target.value
              )
            }
          >
            <option value="" disabled>
              Assign nutrition plan…
            </option>

            {nutrition.map(x=>
              <option
                key={x.id}
                value={x.id}
              >
                {x.name} · {x.calories||"—"} kcal
              </option>
            )}
          </select>

          {selected.nutrition?.map((x:any)=>
            <div
              className="managementRow"
              key={x.id}
            >
              <div>
                <b>
                  {x.nutritionPlan.name}
                </b>

                <small>
                  {x.nutritionPlan.calories||"—"} kcal
                </small>
              </div>

              <button
                className="btn dangerBtn"
                onClick={()=>
                  deleteNutritionAssignment(
                    x.id
                  )
                }
              >
                Remove
              </button>
            </div>
          )}
        </div>
      }

      {clientTab==="check-ins"&&
  <div className="clientSection">
    <h3>Weekly Check-ins</h3>

    {selected.checkIns?.length?
      selected.checkIns.map((x:any)=>
        <div
          className="checkinCard"
          key={x.id}
        >
          <div className="recordDeleteTop">
            <span></span>

            <button
              type="button"
              className="btn dangerBtn"
              onClick={()=>
                deleteCheckIn(x.id)
              }
            >
              Delete Check-in
            </button>
          </div>

          <b>
            {new Date(x.createdAt).toLocaleDateString()} · {x.weightKg?`${x.weightKg} kg`:"Check-in"}
          </b>

          <p>
            Training: {x.trainingPerformance||"—"} ·
            Diet: {x.dietAdherence??"—"}% ·
            Energy: {x.energyLevel??"—"}/10 ·
            Sleep: {x.sleepHours??"—"}h
          </p>

          <p>
            {x.stepsCardio||""} {x.issues||""} {x.questions||""} {x.notes||""}
          </p>

          {!!x.photoUrls?.length&&
            <div className="progressPhotos" style={{marginTop:"14px"}}>
              {x.photoUrls.map((u:string)=>
                <ProtectedImage key={u} src={u}/>
              )}
            </div>
          }
        </div>
      )
      :
      <Empty text="No check-ins yet."/>
    }
  </div>
}
      {clientTab==="calls"&&<div className="clientSection"><h3>Calls</h3>{selected.appointments?.length?selected.appointments.map((x:any)=><div className="managementRow" key={x.id}><b>{date(x.preferredAt)}</b><span>{x.status}</span></div>):<Empty text="No calls yet."/>}</div>}
      {clientTab==="payments"&&<div className="clientSection"><h3>Payments</h3>{selected.payments?.length?selected.payments.map((x:any)=><div className="managementRow" key={x.id}><b>{money(x.amountPaise)}</b><span>{x.status}</span><small>{new Date(x.createdAt).toLocaleDateString()}</small></div>):<Empty text="No payments yet."/>}</div>}
      {clientTab==="notes"&&<div className="clientSection"><h3>Private Coach Notes</h3><p className="muted">Only Jay can see these.</p><form onSubmit={addNote} className="noteComposer"><textarea name="body" placeholder="Add a private note…" required/><button className="btn red">Save Note</button></form><div className="noteList">{selected.notes?.length
  ?selected.notes.map((x:any)=>
    <div
      className="coachNote"
      key={x.id}
    >
      <div className="recordDeleteTop">
        <small>
          {date(x.createdAt)}
        </small>

        <button
          type="button"
          className="btn dangerBtn"
          onClick={()=>
            deleteNote(x.id)
          }
        >
          Delete
        </button>
      </div>

      <p>
        {x.body}
      </p>
    </div>
  )
  :<Empty text="No private notes yet."/>
}</div></div>}
      </div></div></div>}
  </div>
}


function AdminLeads({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<any[]>([]);

  async function load(){
    setItems(await api<any[]>("/admin/leads"));
  }

  useEffect(()=>{
    load().catch(e=>setNotice(e.message));
  },[]);

  async function update(id:string,status:string){
    try{
      await api(`/admin/leads/${id}`,{
        method:"PATCH",
        body:JSON.stringify({status})
      });

      setNotice("Lead status updated.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function remove(id:string){
    if(!window.confirm(
      "Delete this lead enquiry permanently?"
    ))return;

    try{
      await api(
        `/admin/leads/${id}`,
        {
          method:"DELETE"
        }
      );

      setNotice("Lead deleted.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  const newCount=items.filter(x=>x.status==="NEW").length;
  const interestedCount=items.filter(x=>x.status==="INTERESTED").length;
  const convertedCount=items.filter(x=>x.status==="CONVERTED").length;

  return <>
    <div className="toolbar">
      <div>
        <h2 style={{margin:"0 0 6px"}}>Lead Enquiries</h2>
        <p className="muted" style={{margin:0}}>
          Manage people who contacted Jay before purchasing a coaching programme.
        </p>
      </div>

      <button
        className="btn ghost"
        onClick={()=>downloadExcel(
          "jay-sthetics-leads.xlsx",
          [{
            name:"Leads",
            rows:items.map(x=>({
              Name:x.fullName,
              Email:x.email,
              Phone:x.phone||"",
              Goal:x.fitnessGoal||"",
              Message:x.message||"",
              Status:x.status,
              Created:date(x.createdAt)
            }))
          }]
        )}
      >
        ↓ Download Excel
      </button>
    </div>

    <div
      style={{
        display:"grid",
        gridTemplateColumns:"repeat(3,minmax(0,1fr))",
        gap:"14px",
        margin:"20px 0 24px"
      }}
    >
      <div className="metric premiumMetric">
        <small>NEW LEADS</small>
        <b>{newCount}</b>
        <p>Waiting for first contact</p>
      </div>

      <div className="metric premiumMetric">
        <small>INTERESTED</small>
        <b>{interestedCount}</b>
        <p>Potential coaching clients</p>
      </div>

      <div className="metric premiumMetric">
        <small>CONVERTED</small>
        <b>{convertedCount}</b>
        <p>Joined coaching</p>
      </div>
    </div>

    {items.length?
      <div style={{display:"grid",gap:"14px"}}>
        {items.map(x=>
          <article
            key={x.id}
            className="leadEnquiryCard"
            style={{
              border:"1px solid rgba(255,255,255,.10)",
              borderRadius:"16px",
              background:"rgba(255,255,255,.025)",
              padding:"20px",
              display:"grid",
              gridTemplateColumns:"minmax(0,1fr) auto",
              gap:"20px"
            }}
          >
            <div>
              <div
                style={{
                  display:"flex",
                  alignItems:"center",
                  gap:"12px",
                  flexWrap:"wrap",
                  marginBottom:"14px"
                }}
              >
                <div
                  className="clientInitial"
                  style={{
                    width:"46px",
                    height:"46px",
                    minWidth:"46px",
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"center"
                  }}
                >
                  {x.fullName?.[0]?.toUpperCase()||"?"}
                </div>

                <div>
                  <h3 style={{margin:"0 0 4px"}}>{x.fullName}</h3>
                  <small className="muted">
                    Enquiry received {date(x.createdAt)}
                  </small>
                </div>
              </div>

              <div
                className="leadContactGrid"
                style={{
                  display:"grid",
                  gridTemplateColumns:"repeat(2,minmax(0,1fr))",
                  gap:"12px",
                  marginBottom:"16px"
                }}
              >
                <div
                  style={{
                    padding:"12px 14px",
                    border:"1px solid rgba(255,255,255,.08)",
                    borderRadius:"10px"
                  }}
                >
                  <small className="muted">EMAIL</small>
                  <div style={{marginTop:"5px",wordBreak:"break-word"}}>
                    {x.email}
                  </div>
                </div>

                <div
                  style={{
                    padding:"12px 14px",
                    border:"1px solid rgba(255,255,255,.08)",
                    borderRadius:"10px"
                  }}
                >
                  <small className="muted">PHONE</small>
                  <div style={{marginTop:"5px"}}>
                    {x.phone||"Not provided"}
                  </div>
                </div>
              </div>

              <div
                className="leadDetailsGrid"
                style={{
                  display:"grid",
                  gridTemplateColumns:"minmax(180px,.7fr) minmax(0,1.3fr)",
                  gap:"12px"
                }}
              >
                <div
                  style={{
                    padding:"14px",
                    border:"1px solid rgba(255,255,255,.08)",
                    borderRadius:"10px"
                  }}
                >
                  <small className="muted">FITNESS GOAL</small>
                  <p style={{margin:"7px 0 0"}}>
                    {x.fitnessGoal||"Not provided"}
                  </p>
                </div>

                <div
                  style={{
                    padding:"14px",
                    border:"1px solid rgba(255,255,255,.08)",
                    borderRadius:"10px"
                  }}
                >
                  <small className="muted">MESSAGE</small>
                  <p
                    style={{
                      margin:"7px 0 0",
                      lineHeight:1.6,
                      whiteSpace:"pre-wrap"
                    }}
                  >
                    {x.message||"No message provided."}
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                minWidth:"190px",
                display:"flex",
                flexDirection:"column",
                gap:"10px"
              }}
            >
              <label>
                <small className="muted">LEAD STATUS</small>
                <select
                  value={x.status}
                  onChange={e=>update(x.id,e.target.value)}
                  style={{marginTop:"6px"}}
                >
                  <option value="NEW">New</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="INTERESTED">Interested</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="NOT_INTERESTED">Not Interested</option>
                </select>
              </label>

              <a
                className="btn ghost full"
                href={`mailto:${x.email}`}
              >
                Email Lead
              </a>

              {x.phone&&
                <a
                  className="btn red full"
                  href={`tel:${x.phone}`}
                >
                  Call Lead
                </a>
              }

              <button
                type="button"
                className="btn dangerBtn full"
                onClick={()=>
                  remove(x.id)
                }
              >
                Delete Lead
              </button>
            </div>
          </article>
        )}
      </div>
      :
      <Empty text="No lead enquiries yet."/>
    }
  </>;
}

function AdminPrograms({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<Program[]>([]);
  const [editing,setEditing]=useState<Program|null>(null);
  const [showNew,setShowNew]=useState(false);
  const [creatingProgram,setCreatingProgram]=useState(false);
  const [programCreateError,setProgramCreateError]=useState("");

  async function load(){setItems(await api<Program[]>("/admin/programs"))}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);

  const publicItems=items.filter(
    p=>!p.slug.startsWith("custom-")
  );

  const natural=publicItems.filter(
    p=>
      p.name.toLowerCase().includes(
        "natural"
      )
  );

  const enhanced=publicItems.filter(
    p=>
      p.name.toLowerCase().includes(
        "enhanced"
      )
  );

  const other=publicItems.filter(
    p=>
      !p.name.toLowerCase().includes(
        "natural"
      ) &&
      !p.name.toLowerCase().includes(
        "enhanced"
      )
  );

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
    e.stopPropagation();

    if(creatingProgram)return;

    const form=e.currentTarget;
    const f=new FormData(form);

    const name=String(f.get("name")||"").trim();

    const slug=String(f.get("slug")||"")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,"-")
      .replace(/^-+|-+$/g,"");

    const description=String(
      f.get("description")||""
    ).trim();

    const rupees=Number(f.get("rupees"));
    const days=Number(f.get("days"));

    setProgramCreateError("");

    if(name.length<2){
      setProgramCreateError(
        "Enter a valid programme name."
      );
      return;
    }

    if(slug.length<2){
      setProgramCreateError(
        "Enter a valid slug, for example natural-3-months."
      );
      return;
    }

    if(description.length<2){
      setProgramCreateError(
        "Enter a programme description."
      );
      return;
    }

    if(!Number.isFinite(rupees)||rupees<=0){
      setProgramCreateError(
        "Enter a valid programme price."
      );
      return;
    }

    if(!Number.isFinite(days)||days<=0){
      setProgramCreateError(
        "Enter a valid duration in days."
      );
      return;
    }

    setCreatingProgram(true);

    try{
      await api("/admin/programs",{
        method:"POST",
        body:JSON.stringify({
          slug,
          name,
          description,
          pricePaise:Math.round(rupees*100),
          durationDays:Math.round(days)
        })
      });

      form.reset();

      setProgramCreateError("");
      setShowNew(false);
      setNotice("Programme created successfully.");

      await load();
    }catch(e:any){
      const message=
        e?.message ||
        "Programme could not be created.";

      setProgramCreateError(message);
      setNotice(message);
    }finally{
      setCreatingProgram(false);
    }
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
        <div className="programmePrice">
          <small>PRICE</small>
          <b>{money(p.pricePaise)}</b>
        </div>

        <div className="programmeRowActions">
          <button
            className="btn ghost editBtn"
            onClick={()=>setEditing(p)}
          >
            Edit
          </button>

        </div>
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
      <div>
        <small>
          TOTAL PROGRAMMES
        </small>
        <b>
          {publicItems.length}
        </b>
      </div>

      <div>
        <small>
          ACTIVE
        </small>
        <b>
          {publicItems.filter(
            p=>p.isActive
          ).length}
        </b>
      </div>

      <div>
        <small>
          LOWEST PRICE
        </small>
        <b>
          {publicItems.length
            ?money(
              Math.min(
                ...publicItems.map(
                  p=>p.pricePaise
                )
              )
            )
            :"—"
          }
        </b>
      </div>

      <div>
        <small>
          HIGHEST PRICE
        </small>
        <b>
          {publicItems.length
            ?money(
              Math.max(
                ...publicItems.map(
                  p=>p.pricePaise
                )
              )
            )
            :"—"
          }
        </b>
      </div>
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

    {showNew&&
      <Dialog
        title="New Programme"
        wide
        close={()=>{
          if(creatingProgram)return;
          setProgramCreateError("");
          setShowNew(false);
        }}
      >
        <form
          onSubmit={create}
          className="programmeEditForm"
          noValidate
        >
          {programCreateError&&
            <div className="programmeFormError">
              <b>Programme not created</b>
              <span>{programCreateError}</span>
            </div>
          }

          <div className="formGrid">
            <label>
              Name
              <input
                name="name"
                placeholder="Programme name"
                autoComplete="off"
              />
            </label>

            <label>
              Slug
              <input
                name="slug"
                placeholder="example-3-months"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <small>
                Lowercase letters and numbers. Spaces will automatically become hyphens.
              </small>
            </label>
          </div>

          <label>
            Description
            <textarea
              name="description"
              placeholder="What the client receives"
            />
          </label>

          <div className="formGrid">
            <label>
              Price (₹)
              <input
                name="rupees"
                type="number"
                inputMode="decimal"
                min="1"
                placeholder="9000"
              />
            </label>

            <label>
              Duration (days)
              <input
                name="days"
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="90"
              />
            </label>
          </div>

          <div className="dialogActions">
            <button
              type="button"
              className="btn ghost"
              disabled={creatingProgram}
              onClick={()=>{
                setProgramCreateError("");
                setShowNew(false);
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn red"
              disabled={creatingProgram}
            >
              {creatingProgram
                ?"Creating…"
                :"Create Programme"
              }
            </button>
          </div>
        </form>
      </Dialog>
    }
  </>;
}

function AdminExercises({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<any[]>([]),[show,setShow]=useState(false),[uploading,setUploading]=useState(false),[videoUrl,setVideoUrl]=useState("");
  async function load(){setItems(await api<any[]>("/admin/exercises"))}
  useEffect(()=>{load().catch(e=>setNotice(e.message))},[]);
  async function uploadVideo(file:File){setUploading(true);try{const fd=new FormData();fd.append("video",file);const r=await api<any>("/admin/exercise-video",{method:"POST",body:fd});setVideoUrl(r.videoUrl);setNotice("Video uploaded. Save the exercise to finish.")}catch(e:any){setNotice(e.message)}finally{setUploading(false)}}
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/admin/exercises",{method:"POST",body:JSON.stringify({name:String(f.get("name")||"").trim()||"Untitled Exercise",muscleGroup:String(f.get("muscleGroup")||"").trim()||"General",instructions:String(f.get("instructions")||"").trim()||"No instructions added yet.",formCues:String(f.get("formCues")||"").split("\n").map(x=>x.trim()).filter(Boolean),videoUrl:videoUrl||String(f.get("videoUrl")||"")||undefined,audience:f.get("audience")||"BOTH"})});setShow(false);setVideoUrl("");setNotice("Exercise added.");load()}catch(e:any){setNotice(e.message)}}
  async function alternative(id:string,alt:string){if(!alt)return;try{await api(`/admin/exercises/${id}/alternatives`,{method:"POST",body:JSON.stringify({alternativeExerciseId:alt})});setNotice("Alternative added.");load()}catch(e:any){setNotice(e.message)}}
  async function changeAudience(id:string,audience:string){
    try{
      await api(`/admin/exercises/${id}`,{
        method:"PATCH",
        body:JSON.stringify({audience})
      });
      setNotice("Exercise audience updated.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }
  async function replaceVideo(id:string,file:File){
    try{
      const fd=new FormData();
      fd.append("video",file);

      await api(`/admin/exercises/${id}/video`,{
        method:"POST",
        body:fd
      });

      setNotice("Exercise video replaced.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteExercise(id:string){
    const confirmed=window.confirm(
      "Delete this entire exercise? This will also remove the uploaded video and remove the exercise from workout plans."
    );

    if(!confirmed)return;

    try{
      await api(`/admin/exercises/${id}`,{
        method:"DELETE"
      });

      setNotice("Exercise deleted.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  return <><div className="toolbar"><p className="muted">Build the exercise video library available to your coaching clients.</p><button className="btn red" onClick={()=>setShow(true)}>+ Add Exercise</button></div>
    <div className="libraryGrid">{items.map(ex=><article className="exerciseCard" key={ex.id}><div className="videoBox">{ex.videoUrl?<ProtectedVideo src={ex.videoUrl}/>:<span>No video</span>}</div><div className="exerciseBody">
  <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
    <div className="pill">{ex.muscleGroup}</div>
    <div className="pill">
      {ex.audience==="NATURAL"?"Natural":ex.audience==="ENHANCED"?"Enhanced":"All Subscribers"}
    </div>
  </div>

  <h3>{ex.name}</h3>

  <div style={{display:"flex",gap:"10px",flexWrap:"wrap",marginBottom:"10px"}}>
    <label className="btn ghost" style={{cursor:"pointer"}}>
      Replace Video
      <input
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm"
        style={{display:"none"}}
        onChange={e=>{
          const file=e.target.files?.[0];
          if(file) replaceVideo(ex.id,file);
          e.currentTarget.value="";
        }}
      />
    </label>

    <button
      type="button"
      className="btn ghost"
      onClick={()=>deleteExercise(ex.id)}
    >
      Delete Exercise
    </button>
  </div>

  <p>{ex.instructions}</p>

  <ul>
    {ex.formCues?.map((c:string)=><li key={c}>{c}</li>)}
  </ul>

  <small>
    Alternatives: {ex.alternatives?.map((a:any)=>a.alternativeExercise.name).join(", ")||"None"}
  </small>

  <label>
    Client visibility
    <select
      value={ex.audience||"BOTH"}
      onChange={e=>changeAudience(ex.id,e.target.value)}
    >
      <option value="BOTH">All subscribers</option>
      <option value="NATURAL">Natural clients only</option>
      <option value="ENHANCED">Enhanced clients only</option>
    </select>
  </label>

  <select defaultValue="" onChange={e=>alternative(ex.id,e.target.value)}>
    <option value="" disabled>Add alternative…</option>
    {items.filter(a=>a.id!==ex.id).map(a=>
      <option value={a.id} key={a.id}>{a.name}</option>
    )}
  </select>
</div></article>)}</div>
    {show&&<Dialog title="Add Exercise" wide close={()=>setShow(false)}><form onSubmit={create}><div className="formGrid"><input name="name" placeholder="Exercise name (optional)"/><input name="muscleGroup" placeholder="Muscle group (optional)"/></div><textarea name="instructions" placeholder="Exercise instructions (optional)"/><textarea name="formCues" placeholder={"Form cues — one per line\nExample: Keep shoulder blades retracted"}/><label>Client visibility<select name="audience" defaultValue="BOTH"><option value="BOTH">All subscribers</option><option value="NATURAL">Natural clients only</option><option value="ENHANCED">Enhanced clients only</option></select></label><label className="uploadLabel">Upload demo video<input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" onChange={e=>e.target.files?.[0]&&uploadVideo(e.target.files[0])}/></label>{uploading&&<small>Uploading…</small>}{videoUrl&&<small className="successText">Video ready ✓</small>}<input name="videoUrl" placeholder="Or paste external video URL"/><button
  className="btn red full"
  disabled={uploading}
>
  {uploading ? "Uploading video…" : "Save Exercise"}
</button></form></Dialog>}
  </>
}

function AdminWorkouts({setNotice}:{setNotice:(s:string)=>void}){
  const [plans,setPlans]=useState<any[]>([]);
  const [exercises,setExercises]=useState<any[]>([]);
  const [show,setShow]=useState(false);
  const [addTo,setAddTo]=useState<any|null>(null);
  const [editingPlan,setEditingPlan]=useState<any|null>(null);
  const [editingExercise,setEditingExercise]=useState<any|null>(null);

  async function load(){
    const [p,e]=await Promise.all([
      api<any[]>("/admin/workout-plans"),
      api<any[]>("/admin/exercises")
    ]);

    setPlans(p);
    setExercises(e);
  }

  useEffect(()=>{
    load().catch(e=>setNotice(e.message));
  },[]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    const f=new FormData(e.currentTarget);

    try{
      await api("/admin/workout-plans",{
        method:"POST",
        body:JSON.stringify({
          name:f.get("name"),
          description:f.get("description")
        })
      });

      setShow(false);
      setNotice("Workout plan created.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function savePlan(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!editingPlan)return;

    const f=new FormData(e.currentTarget);

    try{
      await api(`/admin/workout-plans/${editingPlan.id}`,{
        method:"PATCH",
        body:JSON.stringify({
          name:f.get("name"),
          description:f.get("description")
        })
      });

      setEditingPlan(null);
      setNotice("Workout plan updated.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function addExercise(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!addTo)return;

    const f=new FormData(e.currentTarget);

    try{
      await api(`/admin/workout-plans/${addTo.id}/exercises`,{
        method:"POST",
        body:JSON.stringify({
          exerciseId:f.get("exerciseId"),
          dayLabel:String(f.get("dayLabel")||"").trim(),
          position:Number(f.get("position")),
          sets:String(f.get("sets")||"").trim()||undefined,
          reps:String(f.get("reps")||"").trim()||undefined,
          restSeconds:String(f.get("restSeconds")||"").trim()||undefined,
          notes:String(f.get("notes")||"").trim()||undefined
        })
      });

      setAddTo(null);
      setNotice("Exercise added to workout plan.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function saveWorkoutExercise(
    e:FormEvent<HTMLFormElement>
  ){
    e.preventDefault();

    if(!editingExercise)return;

    const f=new FormData(e.currentTarget);

    try{
      await api(
        `/admin/workout-plans/${editingExercise.planId}/exercises/${editingExercise.id}`,
        {
          method:"PATCH",
          body:JSON.stringify({
            exerciseId:f.get("exerciseId"),
            dayLabel:String(f.get("dayLabel")||"").trim(),
            position:Number(f.get("position")),
            sets:String(f.get("sets")||"").trim()||undefined,
            reps:String(f.get("reps")||"").trim()||undefined,
            restSeconds:String(f.get("restSeconds")||"").trim()||undefined,
            notes:String(f.get("notes")||"").trim()||undefined
          })
        }
      );

      setEditingExercise(null);
      setNotice("Workout exercise updated.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteWorkoutExercise(
    planId:string,
    itemId:string
  ){
    if(!window.confirm(
      "Remove this exercise from the workout plan?"
    ))return;

    try{
      await api(
        `/admin/workout-plans/${planId}/exercises/${itemId}`,
        {method:"DELETE"}
      );

      setNotice("Exercise removed from workout plan.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteWorkoutPlan(planId:string){
    if(!window.confirm(
      "Delete this entire workout plan? Any assignments using this plan will also be removed."
    ))return;

    try{
      await api(`/admin/workout-plans/${planId}`,{
        method:"DELETE"
      });

      setNotice("Workout plan deleted.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  return <>
    <div className="toolbar">
      <div>
        <h2 style={{margin:"0 0 6px"}}>
          Workout Plans
        </h2>

        <p className="muted" style={{margin:0}}>
          Build detailed workout prescriptions and assign them
          to clients.
        </p>
      </div>

      <button
        className="btn red"
        onClick={()=>setShow(true)}
      >
        + New Workout Plan
      </button>
    </div>

    <div className="planGrid workoutPlanGrid">
      {plans.map(p=>
        <article
          className="planCard workoutPlanCard"
          key={p.id}
        >
          <div className="workoutPlanHeader">
            <div>
              <small className="redText">
                WORKOUT PLAN
              </small>

              <h2>{p.name}</h2>

              <p className="workoutPlanDescription">
                {p.description||
                  "No plan description added yet."}
              </p>
            </div>

            <div
              style={{
                display:"flex",
                gap:"8px",
                flexWrap:"wrap"
              }}
            >
              <button
                className="btn ghost"
                type="button"
                onClick={()=>setEditingPlan(p)}
              >
                Edit Plan
              </button>

              <button
                className="btn ghost dangerButton"
                type="button"
                onClick={()=>deleteWorkoutPlan(p.id)}
              >
                Delete Plan
              </button>
            </div>
          </div>

          <div className="workoutPlanExerciseList">
            {p.exercises?.length
              ?p.exercises.map((x:any)=>
                <div
                  className="workoutDetailCard"
                  key={x.id}
                >
                  <div className="workoutDetailTop">
                    <div>
                      <span className="pill">
                        {x.dayLabel}
                      </span>

                      <h3>
                        <span className="exercisePosition">
                          {x.position}.
                        </span>{" "}
                        {x.exercise.name}
                      </h3>
                    </div>

                    <div
                      style={{
                        display:"flex",
                        gap:"7px",
                        flexWrap:"wrap"
                      }}
                    >
                      <button
                        type="button"
                        className="workoutDeleteButton"
                        onClick={()=>setEditingExercise({
                          ...x,
                          planId:p.id
                        })}
                      >
                        Edit Exercise
                      </button>

                      <button
                        type="button"
                        className="workoutDeleteButton"
                        onClick={()=>deleteWorkoutExercise(
                          p.id,
                          x.id
                        )}
                      >
                        Delete Exercise
                      </button>
                    </div>
                  </div>

                  <div className="workoutPrescriptionGrid">
                    <div>
                      <small>SETS</small>
                      <b>{x.sets||"—"}</b>
                    </div>

                    <div>
                      <small>REPS</small>
                      <b>{x.reps||"—"}</b>
                    </div>

                    <div>
                      <small>REST</small>
                      <b>{x.restSeconds||"—"}</b>
                    </div>
                  </div>

                  {x.notes&&
                    <div className="workoutCoachNotes">
                      <small>COACH INSTRUCTIONS</small>
                      <p>{x.notes}</p>
                    </div>
                  }
                </div>
              )
              :<Empty text="No exercises added yet."/>
            }
          </div>

          <button
            className="btn ghost full"
            onClick={()=>setAddTo(p)}
          >
            + Add Exercise
          </button>
        </article>
      )}
    </div>


    {show&&
      <Dialog
        title="New Workout Plan"
        wide
        close={()=>setShow(false)}
      >
        <form onSubmit={create}>
          <label>
            Workout plan name
            <input
              name="name"
              placeholder="e.g. Push Pull Legs — Phase 1"
              required
            />
          </label>

          <label>
            Plan description
            <textarea
              name="description"
              rows={7}
              placeholder="Weekly structure, progression, intensity guidance and coaching notes."
            />
          </label>

          <button className="btn red full">
            Create Plan
          </button>
        </form>
      </Dialog>
    }


    {editingPlan&&
      <Dialog
        title="Edit Workout Plan"
        wide
        close={()=>setEditingPlan(null)}
      >
        <form onSubmit={savePlan}>
          <label>
            Workout plan name
            <input
              name="name"
              defaultValue={editingPlan.name}
              required
            />
          </label>

          <label>
            Plan description
            <textarea
              name="description"
              rows={7}
              defaultValue={editingPlan.description||""}
            />
          </label>

          <div className="dialogActions">
            <button
              type="button"
              className="btn ghost"
              onClick={()=>setEditingPlan(null)}
            >
              Cancel
            </button>

            <button className="btn red">
              Save Changes
            </button>
          </div>
        </form>
      </Dialog>
    }


    {addTo&&
      <Dialog
        title={`Add Exercise — ${addTo.name}`}
        wide
        close={()=>setAddTo(null)}
      >
        <form onSubmit={addExercise}>
          <label>
            Exercise
            <select
              name="exerciseId"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select exercise
              </option>

              {exercises.map(x=>
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              )}
            </select>
          </label>

          <div className="formGrid">
            <label>
              Day / section
              <input
                name="dayLabel"
                placeholder="e.g. Push Day"
                required
              />
            </label>

            <label>
              Display order
              <input
                name="position"
                type="number"
                min="1"
                required
              />
            </label>
          </div>

          <div className="formGrid">
            <label>
              Sets
              <input name="sets"/>
            </label>

            <label>
              Reps
              <input name="reps"/>
            </label>
          </div>

          <label>
            Rest
            <input name="restSeconds"/>
          </label>

          <label>
            Detailed coaching instructions
            <textarea name="notes" rows={7}/>
          </label>

          <button className="btn red full">
            Add Exercise
          </button>
        </form>
      </Dialog>
    }


    {editingExercise&&
      <Dialog
        title="Edit Workout Exercise"
        wide
        close={()=>setEditingExercise(null)}
      >
        <form onSubmit={saveWorkoutExercise}>
          <label>
            Exercise
            <select
              name="exerciseId"
              defaultValue={editingExercise.exerciseId}
              required
            >
              {exercises.map(x=>
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              )}
            </select>
          </label>

          <div className="formGrid">
            <label>
              Day / section
              <input
                name="dayLabel"
                defaultValue={editingExercise.dayLabel}
                required
              />
            </label>

            <label>
              Display order
              <input
                name="position"
                type="number"
                min="1"
                defaultValue={editingExercise.position}
                required
              />
            </label>
          </div>

          <div className="formGrid">
            <label>
              Sets
              <input
                name="sets"
                defaultValue={editingExercise.sets||""}
              />
            </label>

            <label>
              Reps
              <input
                name="reps"
                defaultValue={editingExercise.reps||""}
              />
            </label>
          </div>

          <label>
            Rest
            <input
              name="restSeconds"
              defaultValue={
                editingExercise.restSeconds||""
              }
            />
          </label>

          <label>
            Detailed coaching instructions
            <textarea
              name="notes"
              rows={7}
              defaultValue={editingExercise.notes||""}
            />
          </label>

          <div className="dialogActions">
            <button
              type="button"
              className="btn ghost"
              onClick={()=>setEditingExercise(null)}
            >
              Cancel
            </button>

            <button className="btn red">
              Save Exercise
            </button>
          </div>
        </form>
      </Dialog>
    }
  </>;
}


function AdminNutrition({setNotice}:{setNotice:(s:string)=>void}){
  const [plans,setPlans]=useState<any[]>([]);
  const [show,setShow]=useState(false);
  const [mealFor,setMealFor]=useState<any|null>(null);
  const [editingPlan,setEditingPlan]=useState<any|null>(null);
  const [editingMeal,setEditingMeal]=useState<any|null>(null);

  async function load(){
    setPlans(
      await api<any[]>("/admin/nutrition-plans")
    );
  }

  useEffect(()=>{
    load().catch(e=>setNotice(e.message));
  },[]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    const f=new FormData(e.currentTarget);

    try{
      await api("/admin/nutrition-plans",{
        method:"POST",
        body:JSON.stringify({
          name:f.get("name"),
          calories:Number(f.get("calories"))||undefined,
          proteinG:Number(f.get("protein"))||undefined,
          carbsG:Number(f.get("carbs"))||undefined,
          fatsG:Number(f.get("fats"))||undefined,
          notes:f.get("notes")
        })
      });

      setShow(false);
      setNotice("Nutrition plan created.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function savePlan(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!editingPlan)return;

    const f=new FormData(e.currentTarget);

    try{
      await api(
        `/admin/nutrition-plans/${editingPlan.id}`,
        {
          method:"PATCH",
          body:JSON.stringify({
            name:f.get("name"),
            calories:Number(f.get("calories"))||undefined,
            proteinG:Number(f.get("protein"))||undefined,
            carbsG:Number(f.get("carbs"))||undefined,
            fatsG:Number(f.get("fats"))||undefined,
            notes:f.get("notes")
          })
        }
      );

      setEditingPlan(null);
      setNotice("Nutrition plan updated.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deletePlan(id:string){
    if(!window.confirm(
      "Delete this nutrition plan? Any client assignments using it will also be removed."
    ))return;

    try{
      await api(`/admin/nutrition-plans/${id}`,{
        method:"DELETE"
      });

      setNotice("Nutrition plan deleted.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function meal(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!mealFor)return;

    const f=new FormData(e.currentTarget);

    try{
      await api(
        `/admin/nutrition-plans/${mealFor.id}/meal-options`,
        {
          method:"POST",
          body:JSON.stringify({
            mealLabel:f.get("mealLabel"),
            optionLabel:f.get("optionLabel"),
            calories:Number(f.get("calories"))||undefined,
            proteinG:Number(f.get("protein"))||undefined,
            carbsG:Number(f.get("carbs"))||undefined,
            fatsG:Number(f.get("fats"))||undefined,
            foods:String(f.get("foods"))
              .split("\n")
              .map(x=>x.trim())
              .filter(Boolean)
          })
        }
      );

      setMealFor(null);
      setNotice("Meal option added.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function saveMeal(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!editingMeal)return;

    const f=new FormData(e.currentTarget);

    try{
      await api(
        `/admin/nutrition-plans/${editingMeal.planId}/meal-options/${editingMeal.id}`,
        {
          method:"PATCH",
          body:JSON.stringify({
            mealLabel:f.get("mealLabel"),
            optionLabel:f.get("optionLabel"),
            calories:Number(f.get("calories"))||undefined,
            proteinG:Number(f.get("protein"))||undefined,
            carbsG:Number(f.get("carbs"))||undefined,
            fatsG:Number(f.get("fats"))||undefined,
            foods:String(f.get("foods"))
              .split("\n")
              .map(x=>x.trim())
              .filter(Boolean)
          })
        }
      );

      setEditingMeal(null);
      setNotice("Meal option updated.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function deleteMeal(
    planId:string,
    mealId:string
  ){
    if(!window.confirm(
      "Delete this meal option?"
    ))return;

    try{
      await api(
        `/admin/nutrition-plans/${planId}/meal-options/${mealId}`,
        {method:"DELETE"}
      );

      setNotice("Meal option deleted.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function uploadPdf(id:string,file:File){
    try{
      const fd=new FormData();
      fd.append("pdf",file);

      await api(`/admin/nutrition-plans/${id}/pdf`,{
        method:"POST",
        body:fd
      });

      setNotice("Diet plan PDF uploaded.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function removePdf(id:string){
    if(!window.confirm(
      "Remove this diet plan PDF? The nutrition plan and meal options will stay."
    ))return;

    try{
      await api(`/admin/nutrition-plans/${id}/pdf`,{
        method:"DELETE"
      });

      setNotice("Diet plan PDF removed.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  return <>
    <div className="toolbar">
      <p className="muted">
        Create macro targets and several interchangeable
        food options.
      </p>

      <button
        className="btn red"
        onClick={()=>setShow(true)}
      >
        + New Nutrition Plan
      </button>
    </div>

    <div className="planGrid">
      {plans.map(p=>
        <div className="planCard" key={p.id}>
          <div
            style={{
              display:"flex",
              justifyContent:"space-between",
              gap:"12px",
              alignItems:"flex-start"
            }}
          >
            <h3>{p.name}</h3>

            <div
              style={{
                display:"flex",
                gap:"7px",
                flexWrap:"wrap"
              }}
            >
              <button
                type="button"
                className="btn ghost"
                onClick={()=>setEditingPlan(p)}
              >
                Edit Plan
              </button>

              <button
                type="button"
                className="btn ghost dangerButton"
                onClick={()=>deletePlan(p.id)}
              >
                Delete Plan
              </button>
            </div>
          </div>

          <div className="macroRow">
            <span>
              {p.calories||"—"} kcal
            </span>
            <span>
              P {p.proteinG||"—"}g
            </span>
            <span>
              C {p.carbsG||"—"}g
            </span>
            <span>
              F {p.fatsG||"—"}g
            </span>
          </div>

          {p.mealOptions?.length
            ?p.mealOptions.map((m:any)=>
              <div className="mealRow" key={m.id}>
                <div
                  style={{
                    display:"flex",
                    justifyContent:"space-between",
                    gap:"10px",
                    alignItems:"flex-start"
                  }}
                >
                  <b>
                    {m.mealLabel} · {m.optionLabel}
                  </b>

                  <div
                    style={{
                      display:"flex",
                      gap:"6px",
                      flexWrap:"wrap"
                    }}
                  >
                    <button
                      type="button"
                      className="workoutDeleteButton"
                      onClick={()=>setEditingMeal({
                        ...m,
                        planId:p.id
                      })}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="workoutDeleteButton"
                      onClick={()=>deleteMeal(
                        p.id,
                        m.id
                      )}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <small>
                  {Array.isArray(m.foods)
                    ?m.foods.join(" + ")
                    :"Food option"}
                </small>

                <span>
                  P {m.proteinG||"—"} ·
                  C {m.carbsG||"—"} ·
                  F {m.fatsG||"—"}
                </span>
              </div>
            )
            :<Empty text="No meal alternatives yet."/>
          }

          <div
            style={{
              display:"flex",
              gap:"10px",
              flexWrap:"wrap",
              marginTop:"14px"
            }}
          >
            <label
              className="btn ghost"
              style={{cursor:"pointer"}}
            >
              {p.pdfUrl
                ?"Replace Diet PDF"
                :"Upload Diet PDF"}

              <input
                type="file"
                accept="application/pdf,.pdf"
                style={{display:"none"}}
                onChange={e=>{
                  const file=e.target.files?.[0];

                  if(file){
                    uploadPdf(p.id,file);
                  }

                  e.currentTarget.value="";
                }}
              />
            </label>

            {p.pdfUrl&&
              <button
                type="button"
                className="btn ghost"
                onClick={()=>removePdf(p.id)}
              >
                Remove PDF
              </button>
            }
          </div>

          <button
            className="btn ghost full"
            onClick={()=>setMealFor(p)}
          >
            + Add Meal Option
          </button>
        </div>
      )}
    </div>


    {show&&
      <Dialog
        title="New Nutrition Plan"
        close={()=>setShow(false)}
      >
        <form onSubmit={create}>
          <input
            name="name"
            placeholder="Plan name"
            required
          />

          <div className="formGrid">
            <input
              name="calories"
              type="number"
              placeholder="Calories"
            />

            <input
              name="protein"
              type="number"
              placeholder="Protein g"
            />
          </div>

          <div className="formGrid">
            <input
              name="carbs"
              type="number"
              placeholder="Carbs g"
            />

            <input
              name="fats"
              type="number"
              placeholder="Fats g"
            />
          </div>

          <textarea
            name="notes"
            placeholder="Coach notes"
          />

          <button className="btn red full">
            Create
          </button>
        </form>
      </Dialog>
    }


    {editingPlan&&
      <Dialog
        title="Edit Nutrition Plan"
        close={()=>setEditingPlan(null)}
      >
        <form onSubmit={savePlan}>
          <input
            name="name"
            defaultValue={editingPlan.name}
            required
          />

          <div className="formGrid">
            <input
              name="calories"
              type="number"
              defaultValue={editingPlan.calories||""}
              placeholder="Calories"
            />

            <input
              name="protein"
              type="number"
              defaultValue={editingPlan.proteinG||""}
              placeholder="Protein g"
            />
          </div>

          <div className="formGrid">
            <input
              name="carbs"
              type="number"
              defaultValue={editingPlan.carbsG||""}
              placeholder="Carbs g"
            />

            <input
              name="fats"
              type="number"
              defaultValue={editingPlan.fatsG||""}
              placeholder="Fats g"
            />
          </div>

          <textarea
            name="notes"
            defaultValue={
              editingPlan.content?.notes||""
            }
            placeholder="Coach notes"
          />

          <div className="dialogActions">
            <button
              type="button"
              className="btn ghost"
              onClick={()=>setEditingPlan(null)}
            >
              Cancel
            </button>

            <button className="btn red">
              Save Changes
            </button>
          </div>
        </form>
      </Dialog>
    }


    {mealFor&&
      <Dialog
        title={`Meal option · ${mealFor.name}`}
        close={()=>setMealFor(null)}
      >
        <form onSubmit={meal}>
          <div className="formGrid">
            <input
              name="mealLabel"
              placeholder="e.g. Breakfast"
              required
            />

            <input
              name="optionLabel"
              placeholder="Option A"
              required
            />
          </div>

          <textarea
            name="foods"
            placeholder={
              "Foods — one per line\n60g oats\n1 scoop whey\n2 eggs"
            }
            required
          />

          <div className="formGrid four">
            <input
              name="calories"
              type="number"
              placeholder="kcal"
            />
            <input
              name="protein"
              type="number"
              placeholder="P"
            />
            <input
              name="carbs"
              type="number"
              placeholder="C"
            />
            <input
              name="fats"
              type="number"
              placeholder="F"
            />
          </div>

          <button className="btn red full">
            Add Option
          </button>
        </form>
      </Dialog>
    }


    {editingMeal&&
      <Dialog
        title="Edit Meal Option"
        close={()=>setEditingMeal(null)}
      >
        <form onSubmit={saveMeal}>
          <div className="formGrid">
            <input
              name="mealLabel"
              defaultValue={editingMeal.mealLabel}
              required
            />

            <input
              name="optionLabel"
              defaultValue={editingMeal.optionLabel}
              required
            />
          </div>

          <textarea
            name="foods"
            defaultValue={
              Array.isArray(editingMeal.foods)
                ?editingMeal.foods.join("\n")
                :""
            }
            required
          />

          <div className="formGrid four">
            <input
              name="calories"
              type="number"
              defaultValue={editingMeal.calories||""}
              placeholder="kcal"
            />

            <input
              name="protein"
              type="number"
              defaultValue={editingMeal.proteinG||""}
              placeholder="P"
            />

            <input
              name="carbs"
              type="number"
              defaultValue={editingMeal.carbsG||""}
              placeholder="C"
            />

            <input
              name="fats"
              type="number"
              defaultValue={editingMeal.fatsG||""}
              placeholder="F"
            />
          </div>

          <div className="dialogActions">
            <button
              type="button"
              className="btn ghost"
              onClick={()=>setEditingMeal(null)}
            >
              Cancel
            </button>

            <button className="btn red">
              Save Meal
            </button>
          </div>
        </form>
      </Dialog>
    }
  </>;
}


function AdminCheckins({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<any[]>([]);

  async function load(){
    setItems(await api<any[]>("/admin/check-ins"));
  }

  useEffect(()=>{
    load().catch(e=>setNotice(e.message));
  },[]);

  async function remove(id:string){
    if(!window.confirm(
      "Delete this check-in permanently?"
    ))return;

    try{
      await api(`/admin/check-ins/${id}`,{
        method:"DELETE"
      });

      setNotice("Check-in deleted.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  const exportRows=items.map(c=>({
    Client:c.user.fullName,
    Email:c.user.email,
    Date:new Date(c.createdAt).toLocaleDateString(),
    Weight_kg:c.weightKg?Number(c.weightKg):null,
    Body_Fat_Percent:c.bodyFat?Number(c.bodyFat):null,
    Sleep_Hours:c.sleepHours?Number(c.sleepHours):null,
    Energy_1_to_10:c.energyLevel??null,
    Diet_Adherence_Percent:c.dietAdherence??null,
    Training_Performance:c.trainingPerformance||"",
    Steps_Cardio:c.stepsCardio||"",
    Training_or_Diet_Issues:c.issues||"",
    Questions_for_Jay:c.questions||"",
    Notes:c.notes||""
  }));

  const performanceLabel=(value?:string)=>{
    if(value==="BETTER")return "Better than last week";
    if(value==="SAME")return "About the same";
    if(value==="WORSE")return "Worse than last week";
    return "Not provided";
  };

  return <>
    <div className="checkinAdminHeader">
      <div>
        <p className="eyebrow redText">
          CLIENT REPORTING
        </p>

        <h2>Weekly Check-ins</h2>

        <p className="muted">
          Review each client's full weekly report, coaching
          questions, adherence and progress photos.
        </p>
      </div>

      <button
        className="btn ghost"
        onClick={()=>downloadExcel(
          "jay-sthetics-checkins.xlsx",
          [{
            name:"Weekly Check-ins",
            rows:exportRows
          }]
        )}
      >
        ↓ Download Excel
      </button>
    </div>

    {items.length?
      <div className="adminCheckinList">
        {items.map(c=>
          <article
            className="adminCheckinCard"
            key={c.id}
          >
            <div className="adminCheckinTop">
              <div className="adminCheckinIdentity">
                <div className="adminCheckinAvatar">
                  {c.user.fullName
                    ?.split(" ")
                    .map((x:string)=>x[0])
                    .join("")
                    .slice(0,2)
                  }
                </div>

                <div>
                  <small className="redText">
                    WEEKLY CHECK-IN
                  </small>

                  <h3>{c.user.fullName}</h3>

                  <p>{c.user.email}</p>
                </div>
              </div>

              <div className="adminCheckinDate">
                <small>SUBMITTED</small>
                <b>
                  {new Date(
                    c.createdAt
                  ).toLocaleDateString()}
                </b>
              </div>
            </div>

            <div className="adminCheckinMetrics">
              <div>
                <small>WEIGHT</small>
                <strong>
                  {c.weightKg
                    ?`${c.weightKg} kg`
                    :"—"
                  }
                </strong>
              </div>

              <div>
                <small>BODY FAT</small>
                <strong>
                  {c.bodyFat
                    ?`${c.bodyFat}%`
                    :"—"
                  }
                </strong>
              </div>

              <div>
                <small>SLEEP</small>
                <strong>
                  {c.sleepHours
                    ?`${c.sleepHours} hrs`
                    :"—"
                  }
                </strong>
              </div>

              <div>
                <small>ENERGY</small>
                <strong>
                  {c.energyLevel
                    ?`${c.energyLevel}/10`
                    :"—"
                  }
                </strong>
              </div>

              <div>
                <small>DIET ADHERENCE</small>
                <strong>
                  {c.dietAdherence!==null &&
                   c.dietAdherence!==undefined
                    ?`${c.dietAdherence}%`
                    :"—"
                  }
                </strong>
              </div>

              <div>
                <small>TRAINING</small>
                <strong>
                  {performanceLabel(
                    c.trainingPerformance
                  )}
                </strong>
              </div>
            </div>

            <div className="adminCheckinAnswers">

              <div className="checkinAnswerBlock">
                <small>STEPS / CARDIO</small>
                <p>
                  {c.stepsCardio||
                    "No steps or cardio information provided."
                  }
                </p>
              </div>

              <div className="checkinAnswerBlock">
                <small>TRAINING / DIET PROBLEMS</small>
                <p>
                  {c.issues||
                    "No problems reported this week."
                  }
                </p>
              </div>

              <div className="checkinAnswerBlock highlight">
                <small>QUESTIONS FOR JAY</small>
                <p>
                  {c.questions||
                    "No questions submitted."
                  }
                </p>
              </div>

              <div className="checkinAnswerBlock">
                <small>OTHER WEEKLY NOTES</small>
                <p>
                  {c.notes||
                    "No additional notes."
                  }
                </p>
              </div>

            </div>

            {!!c.photoUrls?.length&&
              <div className="adminCheckinPhotos">
                <div className="checkinSectionTitle">
                  <small>PROGRESS PHOTOS</small>
                  <span>
                    {c.photoUrls.length} photo{
                      c.photoUrls.length===1?"":"s"
                    }
                  </span>
                </div>

                <div className="progressPhotos">
                  {c.photoUrls.map((u:string)=>
                    <ProtectedImage
                      key={u}
                      src={u}
                    />
                  )}
                </div>
              </div>
            }

            <div className="adminCheckinFooter">
              <button
                type="button"
                className="btn dangerBtn"
                onClick={()=>remove(c.id)}
              >
                Delete Check-in
              </button>
            </div>
          </article>
        )}
      </div>
      :
      <Empty text="No weekly check-ins have been submitted yet."/>
    }
  </>;
}

function AdminCalls({setNotice}:{setNotice:(s:string)=>void}){
  const [items,setItems]=useState<any[]>([]);

  async function load(){
    setItems(
      await api<any[]>(
        "/admin/appointments"
      )
    );
  }

  useEffect(()=>{
    load().catch(
      e=>setNotice(e.message)
    );
  },[]);

  async function status(
    id:string,
    status:string
  ){
    try{
      await api(
        `/admin/appointments/${id}`,
        {
          method:"PATCH",
          body:JSON.stringify({
            status
          })
        }
      );

      setNotice("Call updated.");
      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  async function remove(id:string){
    if(!window.confirm(
      "Delete this call record?"
    ))return;

    try{
      await api(
        `/admin/appointments/${id}`,
        {
          method:"DELETE"
        }
      );

      setNotice(
        "Call record deleted."
      );

      load();
    }catch(e:any){
      setNotice(e.message);
    }
  }

  const exportRows=items.map(c=>({
    Name:c.fullName,
    Email:c.email,
    Phone:c.phone||"",
    Requested_Date_Time:
      date(c.preferredAt),
    Reason:c.reason||"",
    Status:c.status,
    Meeting_Link:
      c.meetingUrl||""
  }));

  return <>
    <div className="toolbar">
      <p className="muted">
        Coaching calls for existing clients.
        Public Talk to Jay enquiries are under Leads.
      </p>

      <button
        className="btn ghost"
        onClick={()=>downloadExcel(
          "jay-sthetics-calls.xlsx",
          [{
            name:"Calls",
            rows:exportRows
          }]
        )}
      >
        ↓ Download Excel
      </button>
    </div>

    <div className="dataTable">
      <div className="tr callHeadDelete">
        <span>Client</span>
        <span>Contact</span>
        <span>Requested time</span>
        <span>Status</span>
        <span>Action</span>
      </div>

      {items.map(c=>
        <div
          className="tr callRowDelete"
          key={c.id}
        >
          <span>
            <b>
              {c.fullName}
            </b>

            <small>
              {c.reason||"No reason"}
            </small>
          </span>

          <span>
            {c.email}

            <small>
              {c.phone||"—"}
            </small>
          </span>

          <span>
            {date(c.preferredAt)}
          </span>

          <span>
            <select
              value={c.status}
              onChange={e=>
                status(
                  c.id,
                  e.target.value
                )
              }
            >
              <option>REQUESTED</option>
              <option>CONFIRMED</option>
              <option>RESCHEDULED</option>
              <option>COMPLETED</option>
              <option>CANCELLED</option>
            </select>
          </span>

          <span>
            <button
              className="btn dangerBtn"
              onClick={()=>
                remove(c.id)
              }
            >
              Delete
            </button>
          </span>
        </div>
      )}
    </div>
  </>;
}

function AdminMessages(){
  const [clients,setClients]=useState<any[]>([]);
  const [selected,setSelected]=useState<any|null>(null);
  const [messages,setMessages]=useState<any[]>([]);
  const [sending,setSending]=useState(false);

  async function refreshClients(){
    try{
      setClients(await api<any[]>("/admin/conversations"));
    }catch{}
  }

  async function refreshMessages(client:any){
    if(!client)return;

    try{
      const rows=await api<any[]>(`/messages/${client.id}`);
      setMessages(rows);
    }catch{}
  }

  useEffect(()=>{
    refreshClients();

    const id=setInterval(()=>{
      refreshClients();
    },3000);

    return()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    if(!selected)return;

    refreshMessages(selected);

    const id=setInterval(()=>{
      refreshMessages(selected);
    },3000);

    return()=>clearInterval(id);
  },[selected?.id]);

  async function open(c:any){
    setSelected(c);
    await refreshMessages(c);
    await refreshClients();
  }

  async function send(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    if(!selected||sending)return;

    const form=e.currentTarget;
    const f=new FormData(form);
    const body=String(f.get("body")||"").trim();

    if(!body)return;

    try{
      setSending(true);

      const created=await api<any>("/messages",{
        method:"POST",
        body:JSON.stringify({
          receiverId:selected.id,
          body
        })
      });

      form.reset();

      setMessages(prev=>[
        ...prev.filter(m=>m.id!==created.id),
        created
      ]);

      await refreshClients();
    }catch(e:any){
      alert(e.message);
    }finally{
      setSending(false);
    }
  }

  return <div className="chatLayout">
    <div className="conversationList">
      {clients.map(c=>
        <button
          key={c.id}
          className={selected?.id===c.id?"selected":""}
          onClick={()=>open(c)}
        >
          <div className="conversationName">
            <b>{c.fullName}</b>
            {!!c.unreadCount&&
              <span className="messageBadge">{c.unreadCount}</span>
            }
          </div>

          <small>{c.email}</small>
        </button>
      )}
    </div>

    <div className="chatPanel">
      {selected?<>
        <div className="chatTitle">
          <b>{selected.fullName}</b>
          <small>Updates automatically</small>
        </div>

        <div className="messages">
          {messages.map(m=>
            <div
              key={m.id}
              className={`bubble ${m.senderId===selected.id?"theirs":"mine"}`}
            >
              {m.body}
              <small>{date(m.createdAt)}</small>
            </div>
          )}
        </div>

        <form className="chatForm" onSubmit={send}>
          <input
            name="body"
            placeholder="Message client…"
            autoComplete="off"
            required
          />

          <button className="btn red" disabled={sending}>
            {sending?"Sending…":"Send"}
          </button>
        </form>
      </>:<Empty text="Choose a client to open the conversation."/>}
    </div>
  </div>;
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
  return <><div className="settingsCard"><h2>Coaching call hours</h2><p className="muted">Clients with active subscriptions can see these hours.</p><form className="availabilityForm" onSubmit={create}><select name="day">{days.map((d,i)=><option value={i} key={d}>{d}</option>)}</select><input name="start" type="time" required/><input name="end" type="time" required/><button className="btn red">Add Hours</button></form>{items.map(x=><div className="availabilityRow" key={x.id}><b>{days[x.dayOfWeek]}</b><span>{time12(x.startTime)} – {time12(x.endTime)}</span><small>{x.timezone}</small><button className="btn ghost" onClick={()=>toggle(x)}>{x.isActive?"Disable":"Enable"}</button></div>)}</div></>
}

function ClientPanel({user,logout}:{user:User;logout:()=>void}){
  const tabs=[
    "dashboard",
    "onboarding",
    "workout plan",
    "exercise library",
    "nutrition",
    "weekly check-in",
    "chat",
    "calls"
  ];
  const [tab,setTab]=useState("dashboard"),[data,setData]=useState<any>(null),[notice,setNotice]=useState("");
  const [clientUnread,setClientUnread]=useState(0);

  useEffect(()=>{load()},[tab]);

  useEffect(()=>{
    async function refreshUnread(){
      try{
        const r=await api<{count:number}>("/messages/unread-count");
        setClientUnread(r.count||0);
      }catch{}
    }

    refreshUnread();

    const id=setInterval(refreshUnread,3000);

    return()=>clearInterval(id);
  },[]);
  async function load(){try{
    if(tab==="dashboard")setData(await api("/client/dashboard"));
    if(tab==="onboarding")setData(await api("/client/onboarding"));

    if(tab==="workout plan"){
      setData(await api("/client/training"));
    }

    if(tab==="exercise library"){
      setData(null);
    }

    if(tab==="nutrition"){
      setData(await api("/client/nutrition"));
    }

    if(tab==="calls"){
      setData(await api("/client/availability"));
    }
  }catch(e:any){setData({error:e.message})}}
  async function onboarding(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/client/onboarding",{method:"PATCH",body:JSON.stringify({dateOfBirth:f.get("dob"),heightCm:Number(f.get("height")),weightKg:Number(f.get("weight")),fitnessGoal:f.get("goal"),trainingExperience:f.get("experience"),phone:f.get("phone")})});setNotice("Coaching profile saved.");setData(await api("/client/onboarding"))}catch(e:any){setNotice(e.message)}}
  async function uploadProfilePhoto(file:File){
    try{
      const fd=new FormData();
      fd.append("photo",file);

      await api("/client/profile-photo",{
        method:"POST",
        body:fd
      });

      setNotice("Profile photo updated.");
      setData(await api("/client/onboarding"));
    }catch(e:any){
      setNotice(e.message);
    }
  }
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
  return <div className="appShell"><Sidebar items={tabs} tab={tab} setTab={setTab} logout={logout} badges={{chat:clientUnread}}/><main className="dash premiumDash"><div className="dashTop premiumTop"><div><small className="redText">jay.__sthetics · CLIENT</small><h1>{tab.toUpperCase()}</h1></div><div className="topRight"><div className="topStatus"><span></span>Active</div><div className="avatar premiumAvatar">{user.fullName?.split(" ").map((x:string)=>x[0]).join("").slice(0,2)}</div></div></div>{notice&&<div className="inlineNotice">{notice}</div>}
    {data?.error&&<Locked message={data.error}/>}
    {tab==="dashboard"&&!data?.error&&<ClientDashboard data={data}/>}
    {tab==="onboarding"&&!data?.error&&<div className="settingsCard onboardingCard">
  <h2>My Coaching Profile</h2>
  <p className="muted">Complete these details so Jay can personalize your plan.</p>

  <div style={{display:"flex",alignItems:"center",gap:"16px",margin:"18px 0"}}>
    <ProfilePhoto
      src={data?.clientProfile?.profilePhotoUrl}
      name={data?.fullName}
      size={82}
    />

    <label className="btn ghost" style={{cursor:"pointer"}}>
      {data?.clientProfile?.profilePhotoUrl?"Replace Profile Photo":"Upload Profile Photo"}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{display:"none"}}
        onChange={e=>{
          const file=e.target.files?.[0];
          if(file) uploadProfilePhoto(file);
          e.currentTarget.value="";
        }}
      />
    </label>
  </div>

  <form onSubmit={onboarding}><div className="formGrid"><label>Date of birth<input name="dob" type="date" defaultValue={data?.clientProfile?.dateOfBirth?String(data.clientProfile.dateOfBirth).slice(0,10):""} required/></label><label>Contact number<input name="phone" defaultValue={data?.phone||""} required/></label></div><div className="formGrid"><label>Height (cm)<input name="height" type="number" step=".1" defaultValue={data?.clientProfile?.heightCm||""} required/></label><label>Weight (kg)<input name="weight" type="number" step=".1" defaultValue={data?.clientProfile?.currentWeightKg||""} required/></label></div><label>Goal<textarea name="goal" defaultValue={data?.clientProfile?.fitnessGoal||""} required/></label><label>Training experience<input name="experience" defaultValue={data?.clientProfile?.trainingExperience||data?.clientProfile?.experienceLevel||""} required/></label><button className="btn red">Save Details</button></form></div>}
    {tab==="workout plan"&&!data?.error&&
      <ClientTraining data={data}/>
    }

    {tab==="exercise library"&&
      <ClientExerciseLibrary/>
    }

    {tab==="nutrition"&&!data?.error&&
      <ClientNutrition
        data={data}
        clientName={user.fullName}
      />
    }
    {tab==="weekly check-in"&&<div className="settingsCard"><h2>Weekly Check-In</h2><form onSubmit={checkin}><div className="formGrid"><input name="weight" type="number" step=".1" placeholder="Current weight kg"/><select name="performance" defaultValue=""><option value="" disabled>Training performance</option><option value="BETTER">Better</option><option value="SAME">Same</option><option value="WORSE">Worse</option></select></div><div className="formGrid"><input name="adherence" type="number" min="0" max="100" placeholder="Diet adherence %"/><input name="energy" type="number" min="1" max="10" placeholder="Energy 1–10"/></div><div className="formGrid"><input name="sleep" type="number" step=".1" placeholder="Average sleep hours"/><input name="steps" placeholder="Steps / cardio completed"/></div><textarea name="issues" placeholder="Any problems with training or diet?"/><textarea name="questions" placeholder="Anything you want Jay to know or ask?"/><label className="uploadLabel">Progress photos — front / side / back<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple/></label><textarea name="notes" placeholder="Other weekly notes (optional)"/><button className="btn red">Submit Check-In</button></form></div>}
    {tab==="chat"&&<ClientChat/>}
    {tab==="calls"&&<ClientCalls/>}
  </main></div>
}

function ClientDashboard({data}:any){
  const sub=data?.subscriptions?.[0];

  const endDate=sub?.endsAt?new Date(sub.endsAt):null;
  const now=new Date();

  const daysRemaining=endDate
    ? Math.max(0,Math.ceil((endDate.getTime()-now.getTime())/(1000*60*60*24)))
    : null;

  const expired=!!endDate&&endDate.getTime()<=now.getTime();

  const renewalMessage=
    expired
      ?"Your coaching programme has ended. Renew to restore access."
      :daysRemaining!==null&&daysRemaining<=7
        ?"Renew soon to avoid interruption to your coaching access."
        :daysRemaining!==null&&daysRemaining<=14
          ?"Your programme is approaching its renewal date."
          :"Your programme is currently active.";

  return <div className="clientHome">
    <div className="clientWelcome">
      <div>
        <span>WELCOME BACK</span>
        <h2>{data?.fullName?.split(" ")[0]}, stay consistent.</h2>
        <p>Your programme, check-ins and coaching support are all here.</p>
      </div>

      <div className="programStatusCard">
        <small>CURRENT PROGRAMME</small>
        <b>{sub?.program?.name||"No active programme"}</b>
        <span className={`statusDot ${sub?.status==="ACTIVE"?"live":"off"}`}>
          {sub?.status||"NOT ACTIVE"}
        </span>
      </div>
    </div>

    <div className="metricGrid premiumMetrics clientMetrics">
      <div className="metric premiumMetric">
        <small>PROGRAMME</small>
        <b>{sub?.program?.name||"—"}</b>
        <p>Assigned coaching plan</p>
      </div>

      <div className="metric premiumMetric">
        <small>STATUS</small>
        <b>{sub?.status||"—"}</b>
        <p>Subscription access</p>
      </div>

      <div className="metric premiumMetric">
        <small>RECENT CHECK-INS</small>
        <b>{data?.checkIns?.length||0}</b>
        <p>Latest coaching updates</p>
      </div>
    </div>

    {sub&&
      <div className="settingsCard" style={{marginTop:"22px"}}>
        <small className="redText">SUBSCRIPTION</small>
        <h2 style={{marginBottom:"8px"}}>
          {expired
            ?"Programme Ended"
            :daysRemaining!==null
              ?`${daysRemaining} ${daysRemaining===1?"Day":"Days"} Remaining`
              :"Active Programme"
          }
        </h2>

        <p>
          <b>{sub.program?.name}</b>
        </p>

        {endDate&&
          <p className="muted">
            {expired?"Ended":"Ends"} on{" "}
            {endDate.toLocaleDateString("en-US",{
              month:"long",
              day:"numeric",
              year:"numeric"
            })}
          </p>
        }

        <p>{renewalMessage}</p>

        {(expired||(daysRemaining!==null&&daysRemaining<=30))&&
          <a
            className="btn red"
            href="/programs"
            style={{display:"inline-flex",marginTop:"8px"}}
          >
            Renew Programme
          </a>
        }
      </div>
    }

  </div>;
}

function ClientTraining({data}:any){
  return <div className="clientWorkoutPage">
    <div className="clientPageIntro">
      <small className="redText">
        YOUR COACHING
      </small>

      <h2>Workout Plan</h2>

      <p className="muted">
        Your assigned training programme and Jay's workout
        instructions.
      </p>
    </div>

    <div className="planGrid workoutPlanGrid">
      {data?.length?
        data.map((a:any)=>
          <article
            className="planCard workoutPlanCard clientWorkoutPlan"
            key={a.id}
          >
            <div className="workoutPlanHeader">
              <div>
                <small className="redText">
                  ASSIGNED WORKOUT
                </small>

                <h2>
                  {a.workoutPlan.name}
                </h2>

                {a.workoutPlan.description&&
                  <p className="workoutPlanDescription">
                    {a.workoutPlan.description}
                  </p>
                }
              </div>
            </div>

            <div className="workoutPlanExerciseList">
              {a.workoutPlan.exercises?.length?
                a.workoutPlan.exercises.map((x:any)=>
                  <div
                    className="workoutDetailCard clientWorkoutPrescription"
                    key={x.id}
                  >
                    <div className="workoutDetailTop">
                      <div>
                        <span className="pill">
                          {x.dayLabel}
                        </span>

                        <h3>
                          <span className="exercisePosition">
                            {x.position}.
                          </span>{" "}
                          {x.exercise?.name||
                            x.exerciseName||
                            "Exercise"
                          }
                        </h3>
                      </div>
                    </div>

                    <div className="workoutPrescriptionGrid">
                      <div>
                        <small>SETS</small>
                        <b>{x.sets||"—"}</b>
                      </div>

                      <div>
                        <small>REPS</small>
                        <b>{x.reps||"—"}</b>
                      </div>

                      <div>
                        <small>REST</small>
                        <b>{x.restSeconds||"—"}</b>
                      </div>
                    </div>

                    {x.notes&&
                      <div className="workoutCoachNotes">
                        <small>
                          JAY'S INSTRUCTIONS
                        </small>

                        <p>{x.notes}</p>
                      </div>
                    }
                  </div>
                )
                :
                <Empty text="No exercises have been added to this workout plan yet."/>
              }
            </div>
          </article>
        )
        :
        <Empty text="Jay hasn't assigned a workout plan yet."/>
      }
    </div>
  </div>;
}

function ClientExerciseLibrary(){
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");

  const filteredItems=items.filter((ex:any)=>{
    const q=query.trim().toLowerCase();

    if(!q)return true;

    const searchable=[
      ex.name,
      ex.muscleGroup,
      ex.instructions,
      ...(ex.formCues||[]),
      ...(ex.alternatives||[])
        .map((a:any)=>a.alternativeExercise?.name)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(q);
  });

  useEffect(()=>{
    api<any[]>("/client/exercise-library")
      .then(rows=>{
        setItems(rows);
        setError("");
      })
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false));
  },[]);

  return <div className="clientExerciseLibraryPage">
    <div className="clientPageIntro">
      <small className="redText">
        COACHING LIBRARY
      </small>

      <h2>Exercise Library</h2>

      <p className="muted">
        Browse Jay's exercise demonstrations, technique
        instructions and form cues separately from your
        assigned workout plan.
      </p>

      <div className="clientExerciseSearch">
        <span>⌕</span>

        <input
          type="search"
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Search exercise name, description, muscle group or form cue..."
          aria-label="Search exercise library"
        />

        {query&&
          <button
            type="button"
            onClick={()=>setQuery("")}
            aria-label="Clear exercise search"
          >
            ×
          </button>
        }
      </div>
    </div>

    {loading&&<p className="muted">Loading exercise library…</p>}

    {!loading&&error&&<Locked message={error}/>}

    {!loading&&!error&&(
      filteredItems.length?
      <div className="libraryGrid">
        {filteredItems.map(ex=>
          <article className="exerciseCard" key={ex.id}>
            <div className="videoBox">
              {ex.videoUrl?
                <ProtectedVideo src={ex.videoUrl}/>
                :
                <span>No video</span>
              }
            </div>

            <div className="exerciseBody">
              <div className="pill">{ex.muscleGroup}</div>

              <h3>{ex.name}</h3>

              <p>{ex.instructions}</p>

              {!!ex.formCues?.length&&
                <ul>
                  {ex.formCues.map((cue:string)=>
                    <li key={cue}>{cue}</li>
                  )}
                </ul>
              }

              {!!ex.alternatives?.length&&
                <small>
                  Alternatives: {
                    ex.alternatives
                      .map((a:any)=>a.alternativeExercise?.name)
                      .filter(Boolean)
                      .join(", ")
                  }
                </small>
              }
            </div>
          </article>
        )}
      </div>
      :
      <Empty
        text={
          query
            ?"No exercises matched your search."
            :"No exercise videos are available for your programme yet."
        }
      />
    )}
  </div>;
}

function DietPdfButton({src}:{src:string}){
  const [opening,setOpening]=useState(false);

  async function openPdf(){
    try{
      setOpening(true);

      const protectedSrc=src.startsWith("/uploads/")
        ? `/api/media/${src.split("/").pop()}`
        : src;

      if(protectedSrc.startsWith("/api/")){
        const blob=await apiBlob(protectedSrc.replace(/^\/api/,""));
        const url=URL.createObjectURL(blob);
        window.open(url,"_blank","noopener,noreferrer");
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }else{
        window.open(protectedSrc,"_blank","noopener,noreferrer");
      }
    }finally{
      setOpening(false);
    }
  }

  return <button className="btn red" type="button" onClick={openPdf} disabled={opening}>
    {opening?"Opening PDF…":"View Diet Plan PDF"}
  </button>;
}

function ClientNutrition({
  data,
  clientName
}:{
  data:any;
  clientName:string;
}){
  const displayName=clientName?.trim()||"Your";
  const dietTitle=displayName.endsWith("s")
    ?`${displayName}' Diet Plan`
    :`${displayName}'s Diet Plan`;

  return <div className="planGrid">
    {data?.length?
      data.map((a:any)=>
        <div className="planCard" key={a.id}>
          <h2>{dietTitle}</h2>

          <div className="macroRow">
            <span>{a.nutritionPlan.calories||"—"} kcal</span>
            <span>P {a.nutritionPlan.proteinG||"—"}g</span>
            <span>C {a.nutritionPlan.carbsG||"—"}g</span>
            <span>F {a.nutritionPlan.fatsG||"—"}g</span>
          </div>

          {a.nutritionPlan.pdfUrl&&
            <div style={{margin:"16px 0"}}>
              <DietPdfButton src={a.nutritionPlan.pdfUrl}/>
            </div>
          }

          {a.nutritionPlan.mealOptions.map((m:any)=>
            <div className="mealRow" key={m.id}>
              <b>{m.mealLabel} · {m.optionLabel}</b>
              <small>{Array.isArray(m.foods)?m.foods.join(" + "):""}</small>
              <span>{m.calories||"—"} kcal · P {m.proteinG||"—"} · C {m.carbsG||"—"} · F {m.fatsG||"—"}</span>
            </div>
          )}
        </div>
      )
      :
      <Empty text="Jay hasn't assigned a nutrition plan yet."/>
    }
  </div>;
}
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
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;

    async function load(){
      if(!src)return;

      const protectedSrc=src.startsWith("/uploads/")
        ? `/api/media/${src.split("/").pop()}`
        : src;

      if(!protectedSrc.startsWith("/api/")){
        setUrl(protectedSrc);
        return;
      }

      const filename=protectedSrc.split("/").pop();

      if(!filename){
        setError("Video unavailable.");
        return;
      }

      try{
        const result=await api<{token:string}>(
          `/media/${encodeURIComponent(filename)}/access`
        );

        if(cancelled)return;

        setUrl(
          `${API_ORIGIN}/api/media/${encodeURIComponent(filename)}?mt=${encodeURIComponent(result.token)}`
        );
      }catch(e:any){
        if(!cancelled){
          setError(e.message||"Video could not be loaded.");
        }
      }
    }

    load();

    return()=>{
      cancelled=true;
    };
  },[src]);

  if(error){
    return <div className="mediaLoading">{error}</div>;
  }

  return url?
    <video
      controls
      playsInline
      preload="metadata"
      crossOrigin="anonymous"
      src={url}
      onError={e=>{
        const media=e.currentTarget;
        const code=media.error?.code;

        setError(
          code===4
            ?"This video format is not supported on this device."
            :"Video could not be played on this device."
        );
      }}
    />
    :
    <div className="mediaLoading">
      Loading protected video…
    </div>;
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
  const [coach,setCoach]=useState<any|null>(null),[messages,setMessages]=useState<any[]>([]),[error,setError]=useState(""),[sending,setSending]=useState(false);
  async function load(showError=true){
    try{
      const c=await api<any>("/client/coach");
      setCoach(c);
      setMessages(await api<any[]>(`/messages/${c.id}`));
      setError("");
    }catch(e:any){
      if(showError && !coach) setError(e.message);
    }
  }
  useEffect(()=>{load();const id=setInterval(()=>load(false),10000);return()=>clearInterval(id)},[]);
  async function send(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!coach||sending)return;
    const form=e.currentTarget;
    const f=new FormData(form);
    const body=String(f.get("body")||"").trim();
    if(!body)return;
    try{
      setSending(true);
      await api("/messages",{method:"POST",body:JSON.stringify({receiverId:coach.id,body})});
      form.reset();
      await load(false);
    }catch(e:any){
      setError(e.message);
    }finally{
      setSending(false);
    }
  }
  if(error && !coach)return <Locked message={error}/>;
  return <div className="clientChat"><div className="chatTitle"><b>{coach?`Chat with ${coach.fullName}`:"Loading coach…"}</b><small>Messages refresh automatically.</small></div><div className="messages">{messages.map(m=><div key={m.id} className={`bubble ${m.senderId===coach?.id?"theirs":"mine"}`}>{m.body}<small>{date(m.createdAt)}</small></div>)}</div><form className="chatForm" onSubmit={send}><input name="body" placeholder="Ask Jay about training, diet or your check-in…" required/><button className="btn red" disabled={sending}>{sending?"Sending…":"Send"}</button></form></div>;
}

function ClientCalls(){
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const [availability,setAvailability]=useState<any[]>([]),[calls,setCalls]=useState<any[]>([]),[callInfo,setCallInfo]=useState<any>(null),[status,setStatus]=useState("");
  async function load(){try{const [a,c,i]=await Promise.all([api<any[]>("/client/availability"),api<any[]>("/client/calls"),api<any>("/client/call-info")]);setAvailability(a);setCalls(c);setCallInfo(i)}catch(e:any){setStatus(e.message)}}
  useEffect(()=>{load()},[]);
  async function request(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/client/calls",{method:"POST",body:JSON.stringify({preferredAt:new Date(`${f.get("date")}T${f.get("time")}:00+05:30`).toISOString(),reason:f.get("reason")})});setStatus("Call requested.");e.currentTarget.reset();load()}catch(e:any){setStatus(e.message)}}
  return <div className="callsLayout"><div className="settingsCard"><h2>Jay's coaching call hours</h2>{availability.length?availability.map(x=><div className="availabilityRow" key={x.id}><b>{days[x.dayOfWeek]}</b><span>{time12(x.startTime)} – {time12(x.endTime)}</span><small>{x.timezone}</small></div>):<Empty text="No call hours configured yet."/>}{callInfo?.availableNow&&callInfo.phone?<a className="btn red full directCall" href={`tel:${callInfo.phone}`}>Call Jay Now</a>:<p className="muted callReason">{callInfo?.reason||""}</p>}</div>
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
        <div className="programCategoryTitle">
          <span>02</span>

          <div>
            <h2>Enhanced Training</h2>
            <p>
              Detailed coaching and progress management
              for enhanced athletes.
            </p>
          </div>
        </div>

        <div className="fullProgramGrid">
          {enhanced.map(card)}
        </div>
      </section>

      <section
        className="programCategory customCoachingSection"
      >
        <div className="programCategoryTitle">
          <span>03</span>

          <div>
            <h2>Custom Coaching</h2>
            <p>
              A coaching timeline built around your
              specific situation.
            </p>
          </div>
        </div>

        <article className="customCoachingCard">
          <div>
            <span className="programType">
              PERSONALIZED COACHING
            </span>

            <h2>
              Need a different duration?
            </h2>

            <p>
              Looking for 2 months, 4 months, contest prep,
              or another custom timeline? Speak directly
              with Jay first. Jay can agree the duration,
              coaching type and price with you, then create
              a private checkout specifically for your account.
            </p>

            <div className="customCoachingPoints">
              <span>
                ✓ Flexible coaching duration
              </span>

              <span>
                ✓ Natural or enhanced coaching
              </span>

              <span>
                ✓ Pricing discussed directly with Jay
              </span>

              <span>
                ✓ Private client-specific checkout
              </span>
            </div>
          </div>

          <div className="customCoachingAction">
            <small>
              CUSTOM COACHING
            </small>

            <strong>
              Talk to Jay
            </strong>

            <p>
              Duration and pricing are decided after
              discussing your requirements.
            </p>

            <a
              className="btn red full"
              href="/?talk=1"
            >
              Talk to Jay →
            </a>
          </div>
        </article>
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
    if(!programId){
      setStatus("Programme not found.");
      return;
    }

    api<Program>(`/payments/program/${programId}`)
      .then(setProgram)
      .catch((e:any)=>setStatus(e.message));
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
          <div className="paymentMethods">UPI · Cards · Net Banking · Razorpay</div>
          {status&&<div className="paymentMessage">{status}</div>}
          <a className="changePlan" href="/programs">← Change programme</a>
        </aside>
      </div>
    </div>
  </div>;
}

function Dialog({title,close,children,wide=false}:{title:string;close:()=>void;children:any;wide?:boolean}){
  return <div
    className="modal"
    onMouseDown={e=>e.target===e.currentTarget&&close()}
  >
    <div className={`modalCard ${wide?"wide":""}`}>
      <button
        type="button"
        className="close"
        aria-label="Close dialog"
        onClick={e=>{
          e.preventDefault();
          e.stopPropagation();
          close();
        }}
      >
        ×
      </button>

      <h2>{title}</h2>
      {children}
    </div>
  </div>;
}
function Info({k,v}:{k:string;v:any}){return <div className="info"><small>{k}</small><b>{v}</b></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function Locked({message}:{message:string}){return <div className="lockedBox"><span>🔒</span><h2>Active subscription required</h2><p>{message}</p><p className="muted">Choose a programme and complete payment to unlock training, nutrition, progress and coaching features.</p><a className="btn red" href="/programs">Choose Programme & Pay</a></div>}
