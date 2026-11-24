// ─── SIGN-IN (logins-plan.md; Supabase Auth, email + password) ───
// Loaded FIRST. Every database call (sbReq) awaits covaseAuthWait() and sends
// the signed-in person's token instead of the shared key, so once the lock is
// on (step 4) only members get data. Until then COVASE_AUTH.required is false:
// the app works exactly as before, and signing in (Settings → Sign in) is
// optional — it just switches calls to your token and unlocks the Users screen.
// Step 4 = set required:true and fill url + anonKey here (the anon key is only
// safe in this public repo once the database is locked).
const COVASE_AUTH={required:false,url:'',anonKey:''};
const COVASE_USER_ADMIN_HOOK='https://covase.app.n8n.cloud/webhook/covase-user-admin';
const COVASE_KEY_MAP={ors_api_key:'covase_ors_api_key',idealpc_key:'covase_idealpc_key',tile_url:'covase_tile_url',tile_attribution:'covase_tile_attribution'};
window.covaseMe=null; // {user_id,email,full_name,role,modules,active}

function covaseAuthBase(){
  const url=(localStorage.getItem('covase_sb_url')||COVASE_AUTH.url||'').replace(/\/+$/,'');
  const key=localStorage.getItem('covase_sb_key')||COVASE_AUTH.anonKey||'';
  return {url,key};
}
function covaseSession(){try{return JSON.parse(localStorage.getItem('covase_session')||'null');}catch(e){return null;}}
function covaseSaveSession(s){if(s)localStorage.setItem('covase_session',JSON.stringify(s));else localStorage.removeItem('covase_session');}
function covaseAuthToken(){const s=covaseSession();return s&&s.access_token&&(s.expires_at||0)*1000>Date.now()+15000?s.access_token:null;}
function covaseStoreTokens(j){
  const s={access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),user:{id:j.user&&j.user.id,email:j.user&&j.user.email}};
  covaseSaveSession(s);
  try{if(window._rtClient&&window._rtClient.realtime)window._rtClient.realtime.setAuth(s.access_token);}catch(e){}
  return s;
}
let _covaseRefreshing=null;
function covaseAuthRefresh(){
  if(_covaseRefreshing)return _covaseRefreshing;
  _covaseRefreshing=(async()=>{
    const s=covaseSession(),{url,key}=covaseAuthBase();
    if(!s||!s.refresh_token||!url||!key)return false;
    try{
      const r=await fetch(url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
      if(!r.ok){if(r.status===400||r.status===401){covaseSaveSession(null);window.covaseMe=null;}return false;}
      covaseStoreTokens(await r.json());return true;
    }catch(e){return false;}
  })().finally(()=>{_covaseRefreshing=null;});
  return _covaseRefreshing;
}
let _covaseWaiters=[];
async function covaseAuthWait(){
  const s=covaseSession();
  if(covaseAuthToken()){
    if(s.expires_at*1000<Date.now()+120000)await covaseAuthRefresh(); // top up early
    return;
  }
  if(s&&s.refresh_token&&await covaseAuthRefresh())return;
  if(!COVASE_AUTH.required)return;
  covaseShowLogin();
  await new Promise(r=>_covaseWaiters.push(r));
}
// Keep the session topped up while the page is open.
setInterval(()=>{const s=covaseSession();if(s&&s.refresh_token&&(s.expires_at||0)*1000<Date.now()+300000)covaseAuthRefresh();},60000);

async function covaseRest(path,opts){
  const {url,key}=covaseAuthBase(),tok=covaseAuthToken();
  const r=await fetch(url+'/rest/v1/'+path,{method:(opts&&opts.method)||'GET',headers:{apikey:key,Authorization:'Bearer '+(tok||key),'Content-Type':'application/json',Prefer:'return=representation'},body:opts&&opts.body?JSON.stringify(opts.body):undefined});
  if(!r.ok)throw new Error(await r.text());const t=await r.text();return t?JSON.parse(t):[];
}
async function covaseLoadMe(){
  const s=covaseSession();if(!s||!s.user||!s.user.id){window.covaseMe=null;return null;}
  const rows=await covaseRest('covase_profiles?user_id=eq.'+encodeURIComponent(s.user.id)+'&select=*');
  window.covaseMe=rows&&rows[0]&&rows[0].active?rows[0]:null;
  return window.covaseMe;
}
// Shared browser keys (ORS, Ideal Postcodes, map tiles): the central copy wins.
async function covaseLoadSharedKeys(){
  try{const rows=await covaseRest('covase_app_settings?key=eq.browser_keys&select=value');const v=rows&&rows[0]&&rows[0].value;
    if(v)Object.entries(COVASE_KEY_MAP).forEach(([k,ls])=>{if(v[k])localStorage.setItem(ls,v[k]);});}catch(e){}
}
async function covaseSignIn(email,password){
  const {url,key}=covaseAuthBase();
  if(!url||!key)throw new Error('This browser has no database connection set up yet');
  const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:String(email).trim().toLowerCase(),password})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(/invalid/i.test(j.error_description||j.msg||j.error||'')?'Email or password not recognised':(j.error_description||j.msg||j.error||'Sign-in failed'));
  covaseStoreTokens(j);
  const me=await covaseLoadMe().catch(()=>null);
  if(!me){await covaseSignOut(true);throw new Error('This login has no access to Covase Tools — ask Simon');}
  await covaseLoadSharedKeys();
  covaseAfterAuthChange();
  const w=_covaseWaiters;_covaseWaiters=[];w.forEach(f=>f());
  covaseHideLogin();
  return me;
}
async function covaseSignOut(quiet){
  const {url,key}=covaseAuthBase(),tok=covaseAuthToken();
  if(tok&&url)fetch(url+'/auth/v1/logout',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+tok}}).catch(()=>{});
  covaseSaveSession(null);window.covaseMe=null;
  if(quiet)return;
  if(COVASE_AUTH.required){location.reload();return;}
  covaseAfterAuthChange();
}
function covaseAfterAuthChange(){
  try{if(typeof renderSidebar==='function'&&typeof sbLayout!=='undefined'&&sbLayout)renderSidebar();}catch(e){}
  try{if(typeof covaseRenderAccountChip==='function')covaseRenderAccountChip();}catch(e){}
}
// Which sidebar modules this person may open. Not signed in (only possible
// before the lock): everything except Users.
function covaseCanSee(k){
  const me=window.covaseMe;
  if(k==='users')return !!(me&&me.role==='admin');
  if(!me||me.role==='admin')return true;
  return !Array.isArray(me.modules)||me.modules.includes(k);
}

// ── Sign-in screen ──
function covaseShowLogin(){
  let el=document.getElementById('auth-overlay');
  if(!el){
    el=document.createElement('div');el.id='auth-overlay';
    el.innerHTML=`<div class="auth-card">
      <button class="auth-close" id="auth-close" onclick="covaseHideLogin()" title="Close">✕</button>
      <div class="auth-brand">Covase Tools</div>
      <div id="auth-signin">
        <label>Email</label><input id="auth-email" type="email" autocomplete="username">
        <label>Password</label><input id="auth-pw" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')covaseLoginSubmit()">
        <button class="auth-btn" id="auth-go" onclick="covaseLoginSubmit()">Sign in</button>
        <div class="auth-msg" id="auth-msg"></div>
        <a class="auth-link" onclick="covaseShowBootstrap(true)">Setting up the first account?</a>
      </div>
      <div id="auth-boot" style="display:none">
        <div class="auth-note">Only for the very first (admin) account. Everyone else is added from the Users screen.</div>
        <label>Your name</label><input id="auth-b-name">
        <label>Email</label><input id="auth-b-email" type="email" autocomplete="username">
        <label>Choose a password (10+ characters)</label><input id="auth-b-pw" type="password" autocomplete="new-password">
        <label>Password again</label><input id="auth-b-pw2" type="password" autocomplete="new-password">
        <button class="auth-btn" id="auth-b-go" onclick="covaseBootstrapSubmit()">Create admin account</button>
        <div class="auth-msg" id="auth-b-msg"></div>
        <a class="auth-link" onclick="covaseShowBootstrap(false)">Back to sign in</a>
      </div>
    </div>`;
    document.body.appendChild(el);
  }
  document.getElementById('auth-close').style.display=COVASE_AUTH.required?'none':'';
  el.classList.add('open');setTimeout(()=>document.getElementById('auth-email')?.focus(),50);
}
function covaseHideLogin(){const el=document.getElementById('auth-overlay');if(el)el.classList.remove('open');}
function covaseShowBootstrap(on){document.getElementById('auth-signin').style.display=on?'none':'';document.getElementById('auth-boot').style.display=on?'':'none';}
async function covaseLoginSubmit(){
  const b=document.getElementById('auth-go'),m=document.getElementById('auth-msg');
  b.disabled=true;m.textContent='Signing in…';
  try{const me=await covaseSignIn(document.getElementById('auth-email').value,document.getElementById('auth-pw').value);
    document.getElementById('auth-pw').value='';m.textContent='';
    if(typeof toast==='function')toast('Signed in as '+(me.full_name||me.email),'success');}
  catch(e){m.textContent=e.message;}
  finally{b.disabled=false;}
}
async function covaseBootstrapSubmit(){
  const g=id=>document.getElementById(id).value,m=document.getElementById('auth-b-msg'),b=document.getElementById('auth-b-go');
  if(g('auth-b-pw')!==g('auth-b-pw2')){m.textContent='The two passwords don\'t match';return;}
  b.disabled=true;m.textContent='Creating…';
  try{
    const r=await fetch(COVASE_USER_ADMIN_HOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'bootstrap',full_name:g('auth-b-name'),email:g('auth-b-email'),password:g('auth-b-pw')})});
    if(r.status===404)throw new Error('The user admin workflow is not switched on in n8n yet');
    const j=await r.json().catch(()=>({}));if(!j.ok)throw new Error(j.error||('HTTP '+r.status));
    await covaseSignIn(g('auth-b-email'),g('auth-b-pw'));
    ['auth-b-pw','auth-b-pw2'].forEach(id=>document.getElementById(id).value='');covaseShowBootstrap(false);
    if(typeof toast==='function')toast('Admin account created — you are signed in','success');
  }catch(e){m.textContent=e.message;}
  finally{b.disabled=false;}
}
// Refresh who-I-am on load (modules can change).
if(covaseSession())setTimeout(()=>{covaseAuthWait().then(()=>covaseLoadMe()).then(()=>{covaseLoadSharedKeys();covaseAfterAuthChange();}).catch(()=>{});},0);
