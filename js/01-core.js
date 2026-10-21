// ─── CONFIG ───
const DEFAULT_N8N_CLIENT='https://covase.app.n8n.cloud/webhook/covase-client-lookup';
const DEFAULT_N8N_CONTACT='https://covase.app.n8n.cloud/webhook/covase-contact-lookup';
const DEFAULT_N8N_VEHICLE='https://covase.app.n8n.cloud/webhook/covase-vehicle-lookup';
const DEFAULT_N8N_SUPPLIER='https://covase.app.n8n.cloud/webhook/covase-supplier-booking-request';
const DEFAULT_N8N_MANUAL_REPLY='https://covase.app.n8n.cloud/webhook/covase-supplier-manual-reply';
const DEFAULT_N8N_REPLY_CHECK='https://covase.app.n8n.cloud/webhook/covase-supplier-reply-check';
const D365_HOST='https://covase.crm11.dynamics.com';
function getConfig(){return{
  url:localStorage.getItem('covase_sb_url')||'',
  key:localStorage.getItem('covase_sb_key')||'',
  n8nClient:localStorage.getItem('covase_n8n_webhook')||DEFAULT_N8N_CLIENT,
  n8nContact:localStorage.getItem('covase_n8n_contact_webhook')||DEFAULT_N8N_CONTACT,
  n8nVehicle:localStorage.getItem('covase_n8n_vehicle_webhook')||DEFAULT_N8N_VEHICLE,
  n8nSupplierBooking:localStorage.getItem('covase_n8n_supplier_webhook')||DEFAULT_N8N_SUPPLIER,
  n8nManualReply:localStorage.getItem('covase_n8n_manual_webhook')||DEFAULT_N8N_MANUAL_REPLY,
  n8nReplyCheck:localStorage.getItem('covase_n8n_replycheck_webhook')||DEFAULT_N8N_REPLY_CHECK
};}
function d365Url(entity,id){if(!id)return null;return `${D365_HOST}/main.aspx?pagetype=entityrecord&etn=${entity}&id=${encodeURIComponent(id)}`;}
function saveConfig(){
  const url=document.getElementById('sb-url').value.trim(),key=document.getElementById('sb-key').value.trim();
  if(!url||!key){toast('Enter Supabase URL and key','error');return;}
  localStorage.setItem('covase_sb_url',url);localStorage.setItem('covase_sb_key',key);
  const nc=document.getElementById('n8n-client-url').value.trim();
  const nt=document.getElementById('n8n-contact-url').value.trim();
  const nv=document.getElementById('n8n-vehicle-url').value.trim();
  const nsb=document.getElementById('n8n-supplier-url').value.trim();
  if(nc)localStorage.setItem('covase_n8n_webhook',nc);else localStorage.removeItem('covase_n8n_webhook');
  if(nt)localStorage.setItem('covase_n8n_contact_webhook',nt);else localStorage.removeItem('covase_n8n_contact_webhook');
  if(nv)localStorage.setItem('covase_n8n_vehicle_webhook',nv);else localStorage.removeItem('covase_n8n_vehicle_webhook');
  if(nsb)localStorage.setItem('covase_n8n_supplier_webhook',nsb);else localStorage.removeItem('covase_n8n_supplier_webhook');
  const nmr=document.getElementById('n8n-manual-url').value.trim();
  if(nmr)localStorage.setItem('covase_n8n_manual_webhook',nmr);else localStorage.removeItem('covase_n8n_manual_webhook');
  const nrc=document.getElementById('n8n-replycheck-url').value.trim();
  if(nrc)localStorage.setItem('covase_n8n_replycheck_webhook',nrc);else localStorage.removeItem('covase_n8n_replycheck_webhook');
  const orsKey=document.getElementById('ors-key')?.value?.trim();
  if(orsKey)localStorage.setItem('covase_ors_api_key',orsKey);else localStorage.removeItem('covase_ors_api_key');
  const ipcKey=(document.getElementById('idealpc-key')?.value||'').trim();
  if(ipcKey)localStorage.setItem('covase_idealpc_key',ipcKey);else localStorage.removeItem('covase_idealpc_key');
  const tileUrl=(document.getElementById('tile-url')?.value||'').trim();
  if(tileUrl)localStorage.setItem('covase_tile_url',tileUrl);else localStorage.removeItem('covase_tile_url');
  const tileAttr=(document.getElementById('tile-attr')?.value||'').trim();
  if(tileAttr)localStorage.setItem('covase_tile_attribution',tileAttr);else localStorage.removeItem('covase_tile_attribution');
  document.getElementById('config-panel').classList.remove('open');
  toast('Saved — reloading…','success');setTimeout(()=>location.reload(),400);
}
function toggleConfig(){
  const p=document.getElementById('config-panel');
  const opening=!p.classList.contains('open');
  p.classList.toggle('open');
  const c=getConfig();
  document.getElementById('sb-url').value=c.url;document.getElementById('sb-key').value=c.key;
  document.getElementById('n8n-client-url').value=c.n8nClient===DEFAULT_N8N_CLIENT?'':c.n8nClient;
  document.getElementById('n8n-contact-url').value=c.n8nContact===DEFAULT_N8N_CONTACT?'':c.n8nContact;
  document.getElementById('n8n-vehicle-url').value=c.n8nVehicle===DEFAULT_N8N_VEHICLE?'':c.n8nVehicle;
  document.getElementById('n8n-supplier-url').value=c.n8nSupplierBooking===DEFAULT_N8N_SUPPLIER?'':c.n8nSupplierBooking;
  document.getElementById('n8n-manual-url').value=c.n8nManualReply===DEFAULT_N8N_MANUAL_REPLY?'':c.n8nManualReply;
  document.getElementById('n8n-replycheck-url').value=c.n8nReplyCheck===DEFAULT_N8N_REPLY_CHECK?'':c.n8nReplyCheck;
  const orsField=document.getElementById('ors-key');if(orsField)orsField.value=localStorage.getItem('covase_ors_api_key')||'';
  const ipcField=document.getElementById('idealpc-key');if(ipcField)ipcField.value=localStorage.getItem('covase_idealpc_key')||'';
  const tileField=document.getElementById('tile-url');if(tileField)tileField.value=localStorage.getItem('covase_tile_url')||'';
  const tileAttrField=document.getElementById('tile-attr');if(tileAttrField)tileAttrField.value=localStorage.getItem('covase_tile_attribution')||'';
  if(opening)setTimeout(()=>p.scrollIntoView({block:'end',behavior:'smooth'}),0);
}

// ─── DYNAMICS 365 LOOKUP (via n8n) ───
let _dynAccountResults=[], _dynDriverResults=[], _dynAccountTimer=null, _dynDriverTimer=null;

function hireLookupToggle(which){
  if(which==='account'){
    const search=document.getElementById('hf-account-search');
    const open=search.style.display==='none';
    search.style.display=open?'block':'none';
    if(open){search.value='';search.focus();}
    else{document.getElementById('hf-account-results').classList.remove('open');}
  }
}

function updateHireD365Link(which){
  if(which==='account'){
    const id=document.getElementById('hf-account').value;
    const chip=document.getElementById('hf-account-d365');
    const acc=(allAccounts||[]).find(a=>a.id===id);
    const dyn=acc&&acc.dynamics_id?d365Url('account',acc.dynamics_id):null;
    if(dyn){chip.href=dyn;chip.style.display='inline-flex';}
    else{chip.removeAttribute('href');chip.style.display='none';}
  }else if(which==='driver'){
    const dynId=document.getElementById('hf-driver-dynamics-id').value;
    const chip=document.getElementById('hf-driver-d365');
    const dyn=dynId?d365Url('contact',dynId):null;
    if(dyn){chip.href=dyn;chip.style.display='inline-flex';}
    else{chip.removeAttribute('href');chip.style.display='none';}
  }
}

async function lookupDynamicsAccount(q){
  clearTimeout(_dynAccountTimer);
  const res=document.getElementById('hf-account-results');
  if(!q||q.length<2){res.classList.remove('open');return;}
  const url=getConfig().n8nClient;
  if(!url){res.innerHTML='<div class="lookup-status">⚙ Set client lookup webhook in Settings</div>';res.classList.add('open');return;}
  res.innerHTML='<div class="lookup-status">Searching Dynamics…</div>';res.classList.add('open');
  _dynAccountTimer=setTimeout(async()=>{
    try{
      const r=await fetch(`${url}?q=${encodeURIComponent(q)}`,{mode:'cors'});
      const data=await r.json();
      if(!Array.isArray(data)||!data.length){res.innerHTML='<div class="lookup-status">No matches in Dynamics</div>';return;}
      _dynAccountResults=data.slice(0,8);
      res.innerHTML=_dynAccountResults.map((c,i)=>{
        const local=(allAccounts||[]).find(a=>a.dynamics_id===c.accountId);
        const badge=local?'<span style="color:var(--covase);font-size:9px;font-weight:700;margin-left:6px">● in Covase</span>':'<span style="color:var(--n400);font-size:9px;margin-left:6px">new</span>';
        const addr=(c.address||'').split('\n')[0]||'';
        return `<div class="lookup-item" onclick="selectDynamicsAccount(${i})"><strong>${esc(c.name||'')}${badge}</strong><div class="meta">${esc(addr)}${c.paymentTerms?' · '+esc(c.paymentTerms):''}</div></div>`;
      }).join('');
    }catch(e){res.innerHTML='<div class="lookup-status">⚠ Lookup failed — check webhook</div>';}
  },350);
}

async function selectDynamicsAccount(idx){
  const c=_dynAccountResults[idx];if(!c)return;
  document.getElementById('hf-account-results').classList.remove('open');
  document.getElementById('hf-account-search').style.display='none';
  // 1) Try match by dynamics_id on existing covase_accounts
  let local=(allAccounts||[]).find(a=>a.dynamics_id===c.accountId);
  if(local){
    document.getElementById('hf-account').value=local.id;
    updateHireD365Link('account');
    toast('Matched to existing Covase account','success');
    return;
  }
  // 2) No match — offer to create new covase_accounts row
  if(!confirm(`"${c.name}" isn't in Covase accounts yet. Create it now?`))return;
  try{
    const payload={
      id:'acc-'+Date.now(),
      company_name:c.name,
      type:'client',
      status:'active',
      address:c.address||null,
      contact_email:c.email||null,
      contact_phone:c.phone||null,
      payment_terms:c.paymentTerms||'28 days',
      payment_method:'BACS',
      account_manager:'Simon Homer',
      dynamics_id:c.accountId,
      updated_at:new Date().toISOString()
    };
    const res=await sbReq('covase_accounts',{method:'POST',body:payload});
    const row=Array.isArray(res)?res[0]:res||payload;
    allAccounts.push(row);
    populateHireAccountDropdown();
    document.getElementById('hf-account').value=row.id;
    updateHireD365Link('account');
    toast('Account created from Dynamics','success');
  }catch(e){toast('Create failed: '+e.message,'error');}
}

async function lookupDynamicsDriver(q){
  clearTimeout(_dynDriverTimer);
  const res=document.getElementById('hf-driver-results');
  // Clear link if user is editing away from a matched driver
  const hiddenName=(document.getElementById('hf-driver-contact-id').value||document.getElementById('hf-driver-dynamics-id').value);
  if(hiddenName&&q!==(window._lastSelectedDriverName||'')){
    document.getElementById('hf-driver-contact-id').value='';
    document.getElementById('hf-driver-dynamics-id').value='';
    window._pendingDriverContact=null;
    updateHireD365Link('driver');
  }
  if(!q||q.length<2){res.classList.remove('open');return;}
  const url=getConfig().n8nContact;
  if(!url){res.innerHTML='<div class="lookup-status">⚙ Set contact lookup webhook in Settings</div>';res.classList.add('open');return;}
  res.innerHTML='<div class="lookup-status">Searching Dynamics…</div>';res.classList.add('open');
  _dynDriverTimer=setTimeout(async()=>{
    try{
      const r=await fetch(`${url}?q=${encodeURIComponent(q)}`,{mode:'cors'});
      const data=await r.json();
      // Also surface local covase_contacts matches (by name) that aren't in Dynamics
      const local=(allContacts||[]).filter(ct=>{
        const fn=((ct.first_name||'')+' '+(ct.last_name||'')).toLowerCase();
        return fn.includes(q.toLowerCase());
      }).slice(0,4);
      const merged=[];
      if(Array.isArray(data))data.slice(0,8).forEach(d=>merged.push({src:'dyn',d}));
      local.forEach(ct=>{if(!merged.some(m=>m.src==='dyn'&&m.d.contactId===ct.dynamics_id))merged.push({src:'local',d:ct});});
      if(!merged.length){res.innerHTML='<div class="lookup-status">No matches</div>';return;}
      _dynDriverResults=merged;
      res.innerHTML=merged.map((m,i)=>{
        if(m.src==='dyn'){
          const matched=(allContacts||[]).find(ct=>ct.dynamics_id===m.d.contactId);
          const badge=matched?'<span style="color:var(--covase);font-size:9px;font-weight:700;margin-left:6px">● in Covase</span>':'<span style="color:var(--n400);font-size:9px;margin-left:6px">Dynamics</span>';
          const meta=[m.d.jobTitle,m.d.accountName,m.d.email].filter(Boolean).join(' · ');
          return `<div class="lookup-item" onclick="selectDynamicsDriver(${i})"><strong>${esc(m.d.fullName||'')}${badge}</strong><div class="meta">${esc(meta)}</div></div>`;
        }else{
          const ct=m.d;const fn=((ct.first_name||'')+' '+(ct.last_name||'')).trim();
          const acc=(allAccounts||[]).find(a=>a.id===ct.account_id);
          const meta=[ct.job_description,acc&&acc.company_name,ct.email].filter(Boolean).join(' · ');
          return `<div class="lookup-item" onclick="selectDynamicsDriver(${i})"><strong>${esc(fn)}<span style="color:var(--n400);font-size:9px;font-weight:700;margin-left:6px">● Covase only</span></strong><div class="meta">${esc(meta)}</div></div>`;
        }
      }).join('');
    }catch(e){res.innerHTML='<div class="lookup-status">⚠ Lookup failed — check webhook</div>';}
  },350);
}

// Best-effort delivery-address prefill from a Dynamics driver payload.
// Defensive: tries several common field names so the platform doesn't break
// if n8n changes the field shape later. Empty source → no-op (don't clobber
// what the user may have typed).
function prefillDeliveryFromDynamics(d){
  if(!d)return;
  const pick=(...keys)=>{for(const k of keys){if(d[k]!=null&&d[k]!=='')return String(d[k]);}return '';};
  const line1=pick('address1','addressLine1','address1_line1','street','streetAddress');
  const line2=pick('address2','addressLine2','address1_line2','address1_line3');
  const town =pick('town','city','address1_city');
  const cnty =pick('county','address1_stateorprovince','stateOrProvince','state','address1_county');
  const post =pick('postcode','postCode','postal_code','address1_postalcode','zip');
  const mob  =pick('mobile','mobilePhone','mobilephone','phone','telephone1');
  // Only overwrite fields we have data for — preserves anything user already typed
  if(line1)document.getElementById('hf-addr1').value=line1;
  if(line2)document.getElementById('hf-addr2').value=line2;
  if(town) document.getElementById('hf-town').value=town;
  if(cnty) document.getElementById('hf-county').value=cnty;
  if(post) document.getElementById('hf-postcode').value=post.toUpperCase();
  if(mob)  document.getElementById('hf-mobile').value=mob;
  // Visual cue
  const tag=document.getElementById('hf-delivery-source');
  if(tag&&(line1||town||cnty||post))tag.textContent='✓ Filled from Dynamics — edit if needed';
}
// Resolve the account a Dynamics-matched driver should belong to: prefer the
// Dynamics parent account (if it exists in Covase), else the customer picked on
// the form. covase_contacts.account_id is NOT NULL so we need a value.
function resolveDriverAccountId(d,accountSelectId){
  let accId=null;
  if(d&&d.accountId){const a=(allAccounts||[]).find(x=>x.dynamics_id===d.accountId);if(a)accId=a.id;}
  if(!accId)accId=document.getElementById(accountSelectId||'hf-account')?.value||null;
  return accId;
}
// Create (or return existing) covase_contacts row from a Dynamics contact payload.
async function createContactFromDynamics(d,accId){
  if(!d||!accId)return null;
  const existing=(allContacts||[]).find(ct=>ct.dynamics_id===d.contactId);
  if(existing)return existing;
  const fn=d.fullName||((d.firstName||'')+' '+(d.lastName||'')).trim();
  const payload={
    id:'ct-'+Date.now(),
    first_name:d.firstName||fn.split(' ')[0]||fn,
    last_name:d.lastName||fn.split(' ').slice(1).join(' ')||null,
    account_id:accId,
    email:d.email||null,
    mobile:d.mobile||null,
    job_description:d.jobTitle||null,
    contact_type:'driver',
    employee_status:'employed',
    address_type:'home',
    dynamics_id:d.contactId,
    updated_at:new Date().toISOString()
  };
  try{
    const res=await sbReq('covase_contacts',{method:'POST',body:payload});
    const row=Array.isArray(res)?res[0]:res||payload;
    allContacts.push(row);
    return row;
  }catch(e){toast('Contact save failed: '+e.message,'error');return null;}
}
async function selectDynamicsDriver(idx){
  const m=_dynDriverResults[idx];if(!m)return;
  document.getElementById('hf-driver-results').classList.remove('open');
  window._pendingDriverContact=null;
  if(m.src==='local'){
    const ct=m.d;const fn=((ct.first_name||'')+' '+(ct.last_name||'')).trim();
    document.getElementById('hf-driver').value=fn;
    document.getElementById('hf-driver-contact-id').value=ct.id;
    document.getElementById('hf-driver-dynamics-id').value=ct.dynamics_id||'';
    if(ct.mobile)document.getElementById('hf-mobile').value=ct.mobile;
    window._lastSelectedDriverName=fn;
    updateHireD365Link('driver');
    return;
  }
  // src=dyn — match to an existing contact, create now, or stash for hire-save.
  const d=m.d;const fn=d.fullName||((d.firstName||'')+' '+(d.lastName||'')).trim();
  document.getElementById('hf-driver').value=fn;
  document.getElementById('hf-driver-dynamics-id').value=d.contactId||'';
  window._lastSelectedDriverName=fn;
  prefillDeliveryFromDynamics(d);
  const local=(allContacts||[]).find(ct=>ct.dynamics_id===d.contactId);
  if(local){
    document.getElementById('hf-driver-contact-id').value=local.id;
    document.getElementById('hf-driver-dynamics-id').value=local.dynamics_id||d.contactId;
    updateHireD365Link('driver');
    toast('Matched to existing Covase contact','success');
    return;
  }
  const accId=resolveDriverAccountId(d,'hf-account');
  if(accId){
    const row=await createContactFromDynamics(d,accId);
    if(row){document.getElementById('hf-driver-contact-id').value=row.id;document.getElementById('hf-driver-dynamics-id').value=row.dynamics_id||d.contactId;updateHireD365Link('driver');toast('Contact created from Dynamics','success');}
  }else{
    // No account yet — remember the driver and save the contact when the hire is saved.
    window._pendingDriverContact=d;
    updateHireD365Link('driver');
    toast('Driver captured — saved to Contacts when you save the hire','success');
  }
}

// Close any open lookup dropdown on outside click
document.addEventListener('click',e=>{
  if(!e.target.closest('.lookup-wrap')){
    document.querySelectorAll('.lookup-results.open').forEach(el=>el.classList.remove('open'));
  }
});

// ─── SUPABASE ───
async function sbReq(path,opts={}){
  const{url,key}=getConfig();
  const r=await fetch(`${url}/rest/v1/${path}`,{
    headers:{'apikey':key,'Authorization':`Bearer ${key}`,'Content-Type':'application/json','Prefer':opts.prefer||'return=representation',...(opts.headers||{})},
    method:opts.method||'GET',body:opts.body?JSON.stringify(opts.body):undefined
  });
  if(!r.ok)throw new Error(await r.text());
  const t=await r.text();return t?JSON.parse(t):[];
}
function needsSetup(el){
  const c=getConfig();
  if(c.url&&c.key)return false;
  el.innerHTML=`<div class="setup-prompt"><div class="setup-card"><h2>Connect Supabase</h2><p>Enter your project URL and anon key.</p><label>Project URL</label><input id="su-url" placeholder="https://xxx.supabase.co"><label>Anon Key</label><input type="password" id="su-key" placeholder="eyJ…"><button class="setup-submit" onclick="quickSetup()">Connect</button></div></div>`;
  return true;
}
function quickSetup(){
  const url=document.getElementById('su-url')?.value.trim(),key=document.getElementById('su-key')?.value.trim();
  if(!url||!key){toast('Fill in both fields','error');return;}
  localStorage.setItem('covase_sb_url',url);localStorage.setItem('covase_sb_key',key);
  loadCurrentView();
}

// ─── VIEW MANAGEMENT ───
let currentViewId='received';
function showView(id,el){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(n=>n.classList.remove('active'));
  const v=document.getElementById('view-'+id);if(v)v.classList.add('active');
  if(el)el.classList.add('active');
  currentViewId=id;loadCurrentView();
}
function loadCurrentView(){
  const loaders={'received':loadInvoices,'outgoing':loadOutgoing,'hires-pipeline':loadHires,'hires-active':loadHires,'hires-all':loadHires,'hires-recharge':loadHires,'movements':loadMovements,'claims':loadClaims,'fines':loadFines,'supplier-replies':loadSupplierReplies,'accounts':loadAccounts,'contacts':loadContacts,'vehicles':loadVehicles};
  if(loaders[currentViewId])loaders[currentViewId]();
}

