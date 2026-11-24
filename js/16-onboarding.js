// ─── DRIVER ONBOARDING (phase-onboarding.sql; design: onboarding-design.md) ───
// One case (CVN-nnnn) per driver joining a client's car scheme: new starter,
// existing employee opting in / changing role, or returning. Each case gets a
// checklist (covase_onboarding_steps) built from the client's policy in
// covase_config 'onboarding_policies'. Phase 1 (Simon, 23 Nov 2026): paste-email
// intake (n8n covase-onboarding-read → Claude), Dynamics search / create
// (covase-contact-lookup / covase-contact-create), Driving for Business and
// short-hire emails with real attachments (covase-driver-email, Graph, from
// Simon's own mailbox by default), and a pre-filled short-hire booking.
// Steps of kind 'browser' with status 'ready' are the queue the Drivetech
// browser skills will work through (phase 3); until then they're ticked by hand.
const ONB_N8N={
  calendar:'https://covase.app.n8n.cloud/webhook/covase-calendar-entry',
  read:'https://covase.app.n8n.cloud/webhook/covase-onboarding-read',
  create:'https://covase.app.n8n.cloud/webhook/covase-contact-create',
  email:'https://covase.app.n8n.cloud/webhook/covase-driver-email'
};
const ONB_TYPES=[['new_starter','New starter'],['opt_in','Opting in / role change'],['returning','Returning starter']];
const ONB_BASIS=[['perm','Permanent'],['fixed_term','Fixed term']];
const ONB_ROUTES=[['undecided','Not decided yet'],['short_hire','Short hire'],['existing_vehicle','Existing fleet vehicle'],['new_lease','New lease car']];
const ONB_VTYPES=[['car','Car'],['lcv','Van (LCV)']];
const ONB_KINDS=[['auto','Covase Tools does it'],['browser','Claude browser skill'],['manual','You do it'],['driver','Waiting on driver']];
const ONB_WHEN=[['','Always'],['route=short_hire','Short hire only'],['route=existing_vehicle','Existing vehicle only'],['route!=short_hire','Not short hire'],['type=new_starter','New starters only']];
const ONB_SENDERS=['simon.homer@covase.co.uk','rentals@covase.co.uk','logistics@covase.co.uk'];
const ONB_LANES=[['new','New'],['progress','In progress'],['driver','Waiting on driver'],['done','Done']];

// Default Woodland Trust policy — Simon's wording (20–23 Nov 2026), aligned so the
// two emails read as a pair. Saved to covase_config the first time he presses Save.
const ONB_DEFAULT_POLICIES=[{
  key:'wt',name:'Woodland Trust',account_id:'acc-s006',sender:'simon.homer@covase.co.uk',cc:'',calendar_name:'Woodland Trust',
  steps:[
    {key:'dynamics',label:'Driver in Dynamics',kind:'auto',when:''},
    {key:'drivetech_add',label:'Add to Drivetech (Fleet Risk Manager)',kind:'browser',when:''},
    {key:'dfb_email',label:'Driving for Business email',kind:'auto',when:''},
    {key:'calendar',label:'Woodland Trust calendar entry',kind:'manual',when:''},
    {key:'vehicle',label:'Vehicle arranged',kind:'auto',when:''},
    {key:'short_hire_email',label:'Short-hire email',kind:'auto',when:'route=short_hire'},
    {key:'dynamics_swap',label:'Car updated in Dynamics (driver + note)',kind:'manual',when:'route=existing_vehicle'},
    {key:'sheet',label:'Starters/leavers sheet updated',kind:'manual',when:''},
    {key:'agreement',label:'Signed driver agreement returned',kind:'driver',when:''},
    {key:'licence',label:'Driving licence check passed',kind:'driver',when:''}
  ],
  route_paragraphs:{
    short_hire:"In the meantime I'm arranging a temporary hire car for you from {startDate}. I'll email you separately with the delivery details once it's booked.",
    existing_vehicle:"You'll be taking over the {vehicle}. I'll be in touch to arrange the handover.",
    new_lease:'',undecided:''
  },
  emails:{
    dfb:{subject:'Woodland Trust company vehicle – {fullName}',body:
`Dear {name}

We understand that you will soon be eligible for a company vehicle. Covase is the Woodland Trust's fleet management partner. We manage the Trust's fleet including driver liaison, ordering of new vehicles, organising vehicle deliveries and booking collections. We are your point of contact for Benefit in Kind queries, driving licence checks and any other "in-life" vehicle questions. We're here Monday to Friday 9:00 - 17:30 on 0345 369 7100.

{vehicleParagraph}

Before you drive on company business, we need two things from you:

1. A signed and returned Woodland Trust Driver Agreement. All Woodland Trust drivers (and nominated spouses/partners) must sign and return this document via email to us as soon as possible.
2. An online driving licence check. You will shortly receive an email from our partner, DriveTech (part of the AA), to complete your driving licence check. This is a compulsory requirement to verify that you can legally drive in the UK on company business. It will take less than 10 minutes to complete.

The DriveTech email entitled "Driving for Work Risk Management" will explain how to complete the driving licence check but in summary:

* DriveTech will supply you with a unique 16-digit registration key to register online.
* Add your driving licence details and consent to DriveTech using those details to complete the check. (This online mandate is sometimes referred to as their Licence Check Document).
* Typically, the check will be processed within 48 hours.
* If you need to licence check an additional person e.g. for a spouse driving your company car, please refer to the attached guide for nominee licence checks.

You will be asked to complete a driving licence check at least annually, so please keep your DriveTech log in details on file.

Please note that the email from DriveTech will ask you to complete your registration with them using your work email address. If you do not yet have a company email address, it is ok to use your personal one to complete the sign-up process.

Also attached to this email is the Trust's current insurance certificate, should you need it for reference.

Should you have any questions, please call Covase on 0345 369 7100.`},
    short_hire:{subject:'Your temporary hire car – {deliveryDate}',body:
`Hi {name}

Further to my earlier email about the Woodland Trust car scheme, I can confirm I have booked a short hire for delivery on {deliveryDate} from {deliveryTime} to {deliveryAddress}.

{keepSentence}

Your vehicle may only be with you for a short period but there are some things you should bear in mind to avoid unwanted additional charges:

1. Please inspect the vehicle for any damage on delivery, before signing the delivery documentation. Any damage not documented will be classified as happening during the hire and will be charged back to you. If you do see damage, note this on the paperwork and take pictures for proof. If you are unsure, email the photos to Covase ASAP and we will review.
2. Regardless of if you see damage yourself, it is imperative that you take photos of the interior and exterior condition of the vehicle immediately upon delivery and prior to collection, and email it to admin@covase.co.uk
3. Likewise, inspect the vehicle for damage when it is collected, before signing the collection paperwork. That way, if there is any new damage noted back at the depot you'll know if it happened before or after its collection from you and therefore who is responsible for the repair.
4. All repair costs will be recharged. These include punctures, windscreens/chips, dents/scratches/stone chips, damaged tyres, cigarette burns and other internal damage, replacement keys etc. Alert Covase as soon as possible if you cause damage to the vehicle.
5. With longer hires (generally 28+ days) you will be periodically asked to give mileage updates. Typically, there is a dash/windscreen sticker to this end. High mileage can prompt a vehicle swap.
6. All vehicles should be returned with the same fuel level they were delivered with. Therefore please take note of the fuel level that the vehicle was delivered with. (Delivery and collection fuel are the hirer's responsibility. If your vehicle does not have the same fuel level as delivery, upon collection, the fuel deficit will be charged by the rental company at premium refuelling rates.)
7. All vehicles should be returned in full working order in a clean condition (inside and out). Any regular checks you would do on your own vehicle should also be done for a rental vehicle, such as tyre pressure, AdBlue, oil and water levels. If any warning lights come on – these must be actioned accordingly. The hirer is accountable for any damage to the vehicle due to poor driver maintenance as well as any down-time of the vehicle thereafter.
8. Don't forget to pay your congestion charges and any tolls while driving the vehicle.
9. If you need to cancel your rental car's delivery, or change a collection time/date, contact us ASAP.
10. If you wish to terminate this hire you must contact Covase. If you liaise with the rental company directly to terminate the hire and/or drop the vehicle off without telling Covase, additional hire costs will apply.

Your rental vehicle has breakdown cover. In the event of a breakdown, vehicle fault or accident, please contact the number you have been given from your rental supplier for immediate 24/7 assistance.

A reminder that before you drive on company business we need your signed Driver Agreement and your DriveTech licence check (see my earlier email). If you haven't done these yet, please do so as soon as possible.

If you have any questions, please do not hesitate to contact me.`}
  },
  keep_sentences:[
    'The plan is to keep you in this vehicle for a week or two until a spare fleet car becomes available. I\'ll contact you when that is ready.',
    'The plan is to keep you in this vehicle until your new car is delivered. I\'ll contact you when that is ready.'
  ],
  // Document rules: vehicle any|car|lcv; routes any|fleet (existing/new lease car)|short_hire. doc_id filled on upload.
  docs:[]
}];

let onbPolicies=null,onbCases=[],onbSteps=[],onbNominees=[],onbLoaded=false;
let onbEditId=null,onbDraft=null,onbPolDraft=null,onbPolIdx=0,onbHireFor=null,onbEmailCtx=null,onbDynResults=[];

// n8n checks this sign-in token on every onboarding web call (Simon, 24 Nov 2026).
async function onbToken(){await covaseAuthWait();return covaseAuthToken();}
function onbLbl(list,v){return (list.find(x=>x[0]===v)||[0,v||''])[1];}
function onbDays(d){if(!d)return null;const t=Date.parse(String(d).slice(0,10)+'T00:00:00');if(isNaN(t))return null;const n=new Date();n.setHours(0,0,0,0);return Math.round((t-n.getTime())/864e5);}
function onbName(c){return [c.first_name,c.last_name].filter(Boolean).join(' ')||'(no name yet)';}
function onbCallName(c){return (c.preferred_name||c.first_name||'').trim()||onbName(c);}
function onbPolicy(c){const ps=onbPolicies||ONB_DEFAULT_POLICIES;return ps.find(p=>p.key===c.policy_key)||ps.find(p=>c.account_id&&p.account_id===c.account_id)||null;}
function onbStepsOf(id){return onbSteps.filter(s=>s.case_id===id).sort((a,b)=>a.sort_order-b.sort_order);}
function onbApplies(step,c){
  const w=step.when||'';if(!w)return true;
  const m=w.match(/^(route|type)(!?=)(.+)$/);if(!m)return true;
  const v=m[1]==='route'?c.vehicle_route:c.case_type;
  return m[2]==='='?v===m[3]:v!==m[3];
}
function onbLane(c){
  if(c.status==='done')return 'done';
  const st=onbStepsOf(c.id).filter(s=>s.status!=='skipped');
  if(!st.some(s=>s.status==='done'))return 'new';
  if(st.filter(s=>s.kind!=='driver').every(s=>s.status==='done'))return 'driver';
  return 'progress';
}

lsInjectView('view-onboarding',`
  <div class="topbar">
    <h1>Driver onboarding</h1>
    <input class="search-box" type="text" id="onb-search" placeholder="Search driver, client, ref…" oninput="renderOnboarding()">
    <button class="topbar-btn" onclick="openOnbPolicies()">⚙ Client policies</button>
    <button class="topbar-btn" onclick="loadOnboarding()">↻ Refresh</button>
    <button class="topbar-btn primary" onclick="openNewOnb()">+ New case</button>
  </div>
  <div class="stats-row">
    <div class="stat-card stat-covase"><div class="stat-label">Open cases</div><div class="stat-val" id="onb-s-open">—</div></div>
    <div class="stat-card stat-orange"><div class="stat-label">Starting within 7 days</div><div class="stat-val" id="onb-s-soon">—</div><div class="stat-sub">not yet cleared</div></div>
    <div class="stat-card stat-indigo"><div class="stat-label">Waiting on drivers</div><div class="stat-val" id="onb-s-driver">—</div></div>
    <div class="stat-card stat-green"><div class="stat-label">Done (30 days)</div><div class="stat-val" id="onb-s-done">—</div></div>
  </div>
  <div class="content">
    <div id="claude-todo" class="onb-todo"></div>
    <div id="onb-kanban" class="kanban" style="grid-template-columns:repeat(4,minmax(230px,1fr))"><div class="loading">Loading cases…</div></div>
  </div>`);

async function onbLoadPolicies(){
  try{const r=await sbReq('covase_config?key=eq.onboarding_policies&select=value');const v=r&&r[0]?r[0].value:null;onbPolicies=Array.isArray(v)&&v.length?v:JSON.parse(JSON.stringify(ONB_DEFAULT_POLICIES));}
  catch(e){onbPolicies=JSON.parse(JSON.stringify(ONB_DEFAULT_POLICIES));}
}
async function loadOnboarding(){
  const el=document.getElementById('onb-kanban');if(!el||needsSetup(el))return;
  try{
    await lsEnsureCrm();await onbLoadPolicies();
    const [c,s,n]=await Promise.all([
      sbReq('covase_onboarding_cases?order=start_date.asc.nullslast,created_at.desc&limit=1000'),
      sbReq('covase_onboarding_steps?order=sort_order.asc&limit=10000'),
      sbReq('covase_onboarding_nominees?limit=5000')]);
    onbCases=c||[];onbSteps=s||[];onbNominees=n||[];onbLoaded=true;
    renderOnboarding();
    if(onbEditId&&document.getElementById('onb-modal').classList.contains('open'))onbRenderChecklist();
  }catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-title">Couldn't load onboarding cases</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}
function renderOnboarding(){
  const wrap=document.getElementById('onb-kanban');if(!wrap)return;
  const q=(document.getElementById('onb-search')?.value||'').toLowerCase().trim();
  const rows=onbCases.filter(c=>c.status!=='cancelled').filter(c=>!q||[c.case_ref,onbName(c),c.preferred_name,c.client_name,c.job_title,c.email].join(' ').toLowerCase().includes(q));
  const monthAgo=new Date(Date.now()-30*864e5).toISOString();
  wrap.innerHTML=ONB_LANES.map(([key,label])=>{
    let items=rows.filter(c=>onbLane(c)===key);
    if(key==='done')items=items.filter(c=>(c.completed_at||c.updated_at||'')>=monthAgo);
    const body=items.length?items.map(onbCard).join(''):'<div class="kan-col-empty">Nothing here</div>';
    return `<div class="kan-col"><div class="kan-col-header"><span class="kan-col-title">${esc(label)}</span><span class="kan-col-count">${items.length}</span></div><div class="kan-col-body">${body}</div></div>`;
  }).join('');
  const open=onbCases.filter(c=>c.status==='open');
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('onb-s-open',open.length);
  set('onb-s-soon',open.filter(c=>{const d=onbDays(c.start_date);return d!=null&&d<=7&&onbLane(c)!=='driver';}).length);
  set('onb-s-driver',open.filter(c=>onbLane(c)==='driver').length);
  set('onb-s-done',onbCases.filter(c=>c.status==='done'&&(c.completed_at||'')>=monthAgo).length);
  const b=document.getElementById('badge-onboarding');if(b)b.textContent=open.length||'0';
  renderClaudeTodo();
}

// ── Claude's to-do list ──
// Read and worked by the Drivetech browser skills in Simon's own browser
// (brief: drivetech-skill-brief.md). Deliberately plain and stable: each job is a
// .claude-job block with data-job / data-case-ref, labelled fields, an inline
// note box and clearly named buttons -- no pop-up dialogs, which browser
// automation handles badly. Deep link: covase-platform.html#claude-todo
function onbJobs(){
  const open=onbCases.filter(c=>c.status==='open');
  const add=[],check=[];
  open.forEach(c=>{
    const st=onbStepsOf(c.id),dt=st.find(s=>s.step_key==='drivetech_add'),lic=st.find(s=>s.step_key==='licence');
    if(dt&&['ready','in_progress'].includes(dt.status))add.push({c,s:dt});
    if(lic&&!['done','skipped'].includes(lic.status)&&(!dt||['done','skipped'].includes(dt.status)))check.push({c,s:lic});
  });
  return {add,check};
}
function onbJobFields(c){
  const f=[['Case',c.case_ref],['Client',c.client_name],['First name',c.first_name],['Surname',c.last_name],['Preferred name',c.preferred_name],['Email',c.email],['Mobile',c.mobile],['Job title',c.job_title],['Start date',fmtUK(c.start_date)],['Vehicle',onbLbl(ONB_VTYPES,c.vehicle_type)]];
  return '<dl class="claude-fields">'+f.filter(x=>x[1]).map(([k,v])=>`<dt>${esc(k)}</dt><dd data-field="${esc(k.toLowerCase().replace(/ /g,'_'))}">${esc(v)}</dd>`).join('')+'</dl>';
}
function renderClaudeTodo(){
  const el=document.getElementById('claude-todo');if(!el)return;
  const {add,check}=onbJobs();
  const noms=c=>onbNominees.filter(n=>n.case_id===c.id);
  const addHtml=add.map(({c,s})=>`<div class="claude-job" data-job="drivetech_add" data-case-ref="${esc(c.case_ref)}" data-step-id="${esc(s.id)}">
      <div class="claude-job-title">Add to Drivetech — ${esc(onbName(c))} <span class="onb-hint">${s.status==='in_progress'?'· started':''}</span></div>
      ${onbJobFields(c)}
      ${s.error?`<div class="onb-hint">Last problem: ${esc(s.error)}</div>`:''}
      <input class="claude-note" id="cjn-${esc(s.id)}" placeholder="Note (what happened)">
      <div class="claude-actions">
        <button class="btn btn-edit" onclick="claudeJob('${esc(s.id)}','start')">Started</button>
        <button class="btn btn-edit" onclick="claudeJob('${esc(s.id)}','done')">Done – driver added</button>
        <button class="btn btn-danger" onclick="claudeJob('${esc(s.id)}','problem')">Problem</button>
      </div></div>`).join('');
  const checkHtml=check.map(({c,s})=>`<div class="claude-job" data-job="licence_check" data-case-ref="${esc(c.case_ref)}" data-step-id="${esc(s.id)}">
      <div class="claude-job-title">Check licence — ${esc(onbName(c))}</div>
      ${onbJobFields(c)}
      ${s.result?`<div class="onb-hint">Last result: ${esc(s.result)}</div>`:''}
      ${noms(c).length?'<div class="onb-hint">Nominees on file: '+noms(c).map(n=>esc(n.name+' ('+(n.check_status||'unknown')+')')).join(', ')+'</div>':''}
      <input class="claude-note" id="cjn-${esc(s.id)}" placeholder="Note (what Drivetech shows)">
      <div class="claude-actions">
        <button class="btn btn-edit" onclick="claudeJob('${esc(s.id)}','passed')">Licence check passed</button>
        <button class="btn btn-edit" onclick="claudeJob('${esc(s.id)}','waiting')">Not complete yet</button>
        <button class="btn btn-danger" onclick="claudeJob('${esc(s.id)}','problem')">Problem</button>
      </div>
      <div class="claude-nominee">
        <input class="claude-nom-name" id="cjnn-${esc(s.id)}" placeholder="Nominee name">
        <input class="claude-nom-status" id="cjns-${esc(s.id)}" placeholder="Nominee check status">
        <button class="btn btn-edit" onclick="claudeNominee('${esc(c.id)}','${esc(s.id)}')">Save nominee</button>
      </div></div>`).join('');
  const total=add.length+check.length;
  if(window._onbTodoOpen==null)window._onbTodoOpen=location.hash==='#claude-todo';
  el.innerHTML=`<details class="onb-todo-box" ontoggle="window._onbTodoOpen=this.open"${window._onbTodoOpen?' open':''}>
    <summary>🤖 Claude's to-do list <span class="kan-col-count">${total}</span> <span class="onb-hint">· Drivetech jobs for the browser skill</span></summary>
    <div class="onb-todo-cols">
      <div><div class="form-section-label">Add to Drivetech (${add.length})</div>${addHtml||'<div class="onb-hint">Nothing waiting. A driver appears here when you click 🤖 Ready for Claude on their case.</div>'}</div>
      <div><div class="form-section-label">Licence checks to look up (${check.length})</div>${checkHtml||'<div class="onb-hint">Nothing waiting. Drivers appear here once they are added to Drivetech, until their check has passed.</div>'}</div>
    </div></details>`;
}
async function claudeJob(stepId,action){
  const s=onbSteps.find(x=>x.id===stepId);if(!s)return;
  const note=(document.getElementById('cjn-'+stepId)?.value||'').trim();
  const today=fmtUK(new Date().toISOString().slice(0,10));
  const map={
    start:['in_progress',undefined,{}],
    done:['done',note||'Added to Drivetech',{}],
    problem:['failed',undefined,{error:(note||'Problem – see Drivetech')+' ('+today+')'}],
    passed:['done',note||'Licence check passed',{}],
    waiting:['todo',(note||'Not complete')+' as of '+today,{}]
  };
  const [status,result,extra]=map[action]||[];if(!status)return;
  await onbSetStep(s.case_id,s.step_key,status,result,{...extra,...(status==='done'?{done_by:'Claude'}:{})});
  toast(action==='waiting'?'Recorded – still waiting':'Recorded','success');
}
async function claudeNominee(caseId,stepId){
  const name=(document.getElementById('cjnn-'+stepId)?.value||'').trim(),status=(document.getElementById('cjns-'+stepId)?.value||'').trim();
  if(!name){toast('Nominee name needed','error');return;}
  try{
    const now=new Date().toISOString();
    const r=await sbReq('covase_onboarding_nominees?on_conflict=case_id,name',{method:'POST',body:{case_id:caseId,name,check_status:status||null,checked_at:now,updated_at:now},prefer:'resolution=merge-duplicates,return=representation'});
    const row=Array.isArray(r)?r[0]:r;const i=onbNominees.findIndex(n=>n.case_id===caseId&&n.name===name);if(i>=0)onbNominees[i]=row;else onbNominees.push(row);
    toast('Nominee saved','success');renderClaudeTodo();if(onbEditId===caseId)onbRenderChecklist();
  }catch(e){toast('Save failed: '+e.message,'error');}
}
// Deep link for the browser skill: …/covase-platform.html#claude-todo
setTimeout(()=>{if(location.hash==='#claude-todo'){const it=document.querySelector('[data-view=onboarding]');showView('onboarding',it);}},1200);
function onbCard(c){
  const st=onbStepsOf(c.id).filter(s=>s.status!=='skipped'),done=st.filter(s=>s.status==='done').length;
  const d=onbDays(c.start_date);
  const late=c.status==='open'&&d!=null&&d<=7&&st.some(s=>s.kind==='driver'&&s.status!=='done');
  const when=c.start_date?('Starts '+fmtUK(c.start_date)+(d!=null&&c.status==='open'?(d<0?' · started':d===0?' · today':' · '+d+' day'+(d===1?'':'s')):'')):'Start date not set';
  const problem=st.some(s=>s.status==='failed');
  return `<div class="mv-kan-wrap"><div class="kan-card onb-card${late?' onb-late':''}" onclick="openEditOnb('${esc(c.id)}')">
    <div class="kan-card-grid">
      <div class="kan-card-l1">${esc(onbName(c))}</div><div class="kan-card-r">${esc(c.case_ref||'')}</div>
      <div class="kan-card-l2">${esc(c.client_name||'No client')} · ${esc(onbLbl(ONB_TYPES,c.case_type))}</div><div class="kan-card-r">${esc(onbLbl(ONB_ROUTES,c.vehicle_route))}</div>
      <div class="kan-card-l3">${esc(when)}</div>
      <div class="kan-card-l4"><div class="onb-progress"><span style="width:${st.length?Math.round(done/st.length*100):0}%"></span></div>${done}/${st.length} steps${problem?' · <strong style="color:var(--red,#c0392b)">⚠ problem</strong>':''}</div>
    </div></div></div>`;
}

// ── Case window ──
lsInjectModal('onb-modal',`
  <div class="modal-header"><div class="modal-title" id="onb-modal-title">New onboarding case</div><button class="modal-close" onclick="closeOnbModal()">✕</button></div>
  <div class="modal-body">
    <div id="onb-paste-wrap">
      <div class="form-section-label">Client's email</div>
      <div class="form-field"><textarea id="onb-paste" style="min-height:110px" placeholder="Paste the client's email here (include the To/Cc lines if you can) and click Read — or just fill in the details below."></textarea></div>
      <div style="display:flex;gap:8px;align-items:center;margin:-4px 0 10px"><button class="btn btn-edit" id="onb-read-btn" onclick="onbReadEmail()">✨ Read email</button><span id="onb-read-status" style="font-size:12px;color:var(--n500)"></span></div>
    </div>
    <div class="onb-cols">
      <div>
        <div class="form-section-label">Case</div>
        <div class="form-row">
          <div class="form-field"><label>Client *</label><select id="onb-account" onchange="onbAccountChanged()"></select></div>
          <div class="form-field"><label>Type</label><select id="onb-type">${lsOptions(ONB_TYPES)}</select></div>
        </div>
        <div class="form-row trio">
          <div class="form-field"><label>Start date</label><input type="date" id="onb-start"></div>
          <div class="form-field"><label>Basis</label><select id="onb-basis">${lsOptions(ONB_BASIS,'','—')}</select></div>
          <div class="form-field"><label>Job title</label><input id="onb-job"></div>
        </div>
        <div class="form-section-label">Driver <span style="font-weight:400;color:var(--n400)">· * needed before Dynamics</span></div>
        <div class="form-row trio">
          <div class="form-field"><label>First name *</label><input id="onb-first"></div>
          <div class="form-field"><label>Surname *</label><input id="onb-last"></div>
          <div class="form-field"><label>Preferred name</label><input id="onb-pref"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label>Email *</label><input id="onb-email" type="email"></div>
          <div class="form-field"><label>Mobile *</label><input id="onb-mobile" type="tel"></div>
        </div>
        <div class="form-row"><div class="form-field"><label>Address line 1</label><input id="onb-a1"></div><div class="form-field"><label>Address line 2</label><input id="onb-a2"></div></div>
        <div class="form-row trio"><div class="form-field"><label>Town</label><input id="onb-town"></div><div class="form-field"><label>County</label><input id="onb-county"></div><div class="form-field"><label>Postcode</label><input id="onb-pc" style="text-transform:uppercase"></div></div>
        <div class="form-section-label">Vehicle</div>
        <div class="form-row">
          <div class="form-field"><label>How they get a vehicle</label><select id="onb-route">${lsOptions(ONB_ROUTES)}</select></div>
          <div class="form-field"><label>Car or van</label><select id="onb-vtype">${lsOptions(ONB_VTYPES)}</select></div>
        </div>
        <div class="form-row"><div class="form-field"><label>Registration (existing vehicle)</label><input id="onb-reg" style="text-transform:uppercase" placeholder="e.g. AB12CDE"></div><div class="form-field"><label>Make / model</label><input id="onb-vdesc"></div></div>
        <div class="form-field"><label>Notes</label><textarea id="onb-notes"></textarea></div>
      </div>
      <div id="onb-check-col" style="display:none">
        <div class="form-section-label">Checklist</div>
        <div id="onb-checklist"></div>
        <div id="onb-nominees"></div>
      </div>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn-secondary-modal" id="onb-docs-btn" style="margin-right:auto;display:none" onclick="openDocs('onboarding',onbEditId,document.getElementById('onb-modal-title').textContent)">📎 Documents</button>
    <button class="btn-secondary-modal" id="onb-cancel-case" style="display:none" onclick="onbCancelCase()">Cancel case</button>
    <button class="btn-secondary-modal" onclick="closeOnbModal()">Close</button>
    <button class="btn-primary-modal" onclick="saveOnb()">Save</button>
  </div>`,true);

function onbClientOptions(sel){
  const ids=new Set((onbPolicies||[]).map(p=>p.account_id).filter(Boolean));
  const list=(allAccounts||[]).filter(a=>ids.has(a.id)||a.type==='client'||a.type==='both').sort((a,b)=>(ids.has(b.id)-ids.has(a.id))||String(a.company_name).localeCompare(b.company_name));
  return lsOptions(list.map(a=>[a.id,a.company_name]),sel,'— select —');
}
function onbFill(c){
  c=c||{};const f=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??'';};
  document.getElementById('onb-account').innerHTML=onbClientOptions(c.account_id);
  f('onb-type',c.case_type||'new_starter');f('onb-start',c.start_date);f('onb-basis',c.basis);f('onb-job',c.job_title);
  f('onb-first',c.first_name);f('onb-last',c.last_name);f('onb-pref',c.preferred_name);f('onb-email',c.email);f('onb-mobile',c.mobile);
  f('onb-a1',c.address_line1);f('onb-a2',c.address_line2);f('onb-town',c.town);f('onb-county',c.county);f('onb-pc',c.postcode);
  f('onb-route',c.vehicle_route||'undecided');f('onb-vtype',c.vehicle_type||'car');f('onb-reg',c.vehicle_reg);f('onb-vdesc',c.vehicle_desc);f('onb-notes',c.notes);
}
function onbRead(){
  const g=id=>(document.getElementById(id)?.value||'').trim()||null;
  const acc=(allAccounts||[]).find(a=>a.id===g('onb-account'));
  return {account_id:g('onb-account'),client_name:acc?acc.company_name:null,case_type:g('onb-type')||'new_starter',start_date:g('onb-start'),basis:g('onb-basis'),job_title:g('onb-job'),
    first_name:g('onb-first'),last_name:g('onb-last'),preferred_name:g('onb-pref'),email:g('onb-email'),mobile:g('onb-mobile'),
    address_line1:g('onb-a1'),address_line2:g('onb-a2'),town:g('onb-town'),county:g('onb-county'),postcode:(g('onb-pc')||'').toUpperCase()||null,
    vehicle_route:g('onb-route')||'undecided',vehicle_type:g('onb-vtype')||'car',vehicle_reg:(g('onb-reg')||'').replace(/\s+/g,'').toUpperCase()||null,vehicle_desc:g('onb-vdesc'),notes:g('onb-notes')};
}
function onbAccountChanged(){}
async function openNewOnb(){
  if(!onbPolicies)await onbLoadPolicies();await lsEnsureCrm();
  onbEditId=null;onbHireFor=null;
  document.getElementById('onb-modal-title').textContent='New onboarding case';
  document.getElementById('onb-paste-wrap').style.display='';document.getElementById('onb-paste').value='';document.getElementById('onb-read-status').textContent='';
  document.getElementById('onb-check-col').style.display='none';document.getElementById('onb-docs-btn').style.display='none';document.getElementById('onb-cancel-case').style.display='none';
  const def=(onbPolicies||[])[0];onbFill({account_id:def?def.account_id:''});
  document.getElementById('onb-modal').classList.add('open');
}
function openEditOnb(id){
  const c=onbCases.find(x=>x.id===id);if(!c)return;
  onbEditId=id;
  document.getElementById('onb-modal-title').textContent=(c.case_ref?c.case_ref+' — ':'')+onbName(c);
  document.getElementById('onb-paste-wrap').style.display='none';
  document.getElementById('onb-check-col').style.display='';document.getElementById('onb-docs-btn').style.display='';document.getElementById('onb-cancel-case').style.display=c.status==='open'?'':'none';
  onbFill(c);onbRenderChecklist();
  document.getElementById('onb-modal').classList.add('open');
  onbSyncSteps(c).then(()=>{if(onbEditId===id)onbRenderChecklist();renderOnboarding();}).catch(()=>{});
}
function closeOnbModal(){document.getElementById('onb-modal').classList.remove('open');onbEditId=null;}

async function onbReadEmail(){
  const text=document.getElementById('onb-paste').value.trim();if(!text){toast('Paste the email first','error');return;}
  const st=document.getElementById('onb-read-status'),btn=document.getElementById('onb-read-btn');
  st.textContent='Reading…';btn.disabled=true;
  try{
    const r=await fetch(ONB_N8N.read,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:await onbToken(),text,clients:(allAccounts||[]).filter(a=>a.type==='client'||a.type==='both').map(a=>a.company_name)})});
    if(!r.ok)throw new Error(r.status===404?'the email reader is not switched on in n8n yet':'HTTP '+r.status);
    const j=await r.json();const d=j.data||{};
    const set=(id,v)=>{if(v!=null&&v!==''){const e=document.getElementById(id);if(e&&!e.value)e.value=v;}};
    if(d.clientName){const a=(allAccounts||[]).find(x=>String(x.company_name).toLowerCase()===String(d.clientName).toLowerCase())||(allAccounts||[]).find(x=>String(x.company_name).toLowerCase().includes(String(d.clientName).toLowerCase().replace(/^the\s+/,'')));if(a)document.getElementById('onb-account').value=a.id;}
    if(d.caseType)document.getElementById('onb-type').value=d.caseType;
    set('onb-start',d.startDate);if(d.basis)document.getElementById('onb-basis').value=d.basis;set('onb-job',d.jobTitle);
    set('onb-first',d.firstName);set('onb-last',d.lastName);set('onb-pref',d.preferredName);set('onb-email',d.email);set('onb-mobile',d.mobile);
    set('onb-a1',d.address1);set('onb-a2',d.address2);set('onb-town',d.town);set('onb-county',d.county);set('onb-pc',d.postcode);
    if(d.needsTempCar===true)document.getElementById('onb-route').value='short_hire';
    if(d.vehicleType)document.getElementById('onb-vtype').value=d.vehicleType;
    const extra=[d.summary,d.notes].filter(Boolean).join(' ');if(extra)set('onb-notes',extra);
    const missing=[['firstName','first name'],['lastName','surname'],['email','email'],['mobile','mobile']].filter(([k])=>!d[k]).map(x=>x[1]);
    st.innerHTML=(d.urgent?'<strong style="color:var(--orange,#d35400)">Urgent.</strong> ':'')+'Read. '+(missing.length?'Not in the email: '+esc(missing.join(', '))+' — check before Dynamics.':'Check the details below.');
  }catch(e){st.textContent="Couldn't read it — "+e.message+'. Fill the details in by hand.';}
  finally{btn.disabled=false;}
}

async function saveOnb(){
  const v=onbRead();if(!v.account_id){toast('Choose the client','error');return;}
  if(!v.first_name&&!v.last_name){toast('Add at least the driver\'s name','error');return;}
  const now=new Date().toISOString();
  try{
    if(onbEditId){
      const prev=onbCases.find(x=>x.id===onbEditId)||{};
      await sbReq(`covase_onboarding_cases?id=eq.${encodeURIComponent(onbEditId)}`,{method:'PATCH',body:{...v,updated_at:now},prefer:'return=minimal'});
      Object.assign(prev,v);await onbSyncSteps(prev);toast('Case saved','success');onbRenderChecklist();renderOnboarding();
    }else{
      const pol=(onbPolicies||[]).find(p=>p.account_id===v.account_id)||null;
      const body={...v,policy_key:pol?pol.key:null,source_email:document.getElementById('onb-paste').value.trim()||null};
      const res=await sbReq('covase_onboarding_cases',{method:'POST',body});
      const c=Array.isArray(res)?res[0]:res;onbCases.push(c);
      await onbSyncSteps(c);
      toast(c.case_ref+' opened','success');openEditOnb(c.id);renderOnboarding();
      if(!pol)toast('No onboarding policy for this client yet — add one under ⚙ Client policies','info');
    }
  }catch(e){toast('Save failed: '+e.message,'error');}
}
// Create the policy's applicable steps; steps that no longer apply (e.g. route
// changed) and were never done become 'skipped'; ones that apply again come back.
async function onbSyncSteps(c){
  const pol=onbPolicy(c);if(!pol)return;
  const have=onbStepsOf(c.id),add=[],patch=[];
  pol.steps.forEach((s,i)=>{
    const ex=have.find(x=>x.step_key===s.key),ok=onbApplies(s,c);
    if(!ex&&ok)add.push({case_id:c.id,step_key:s.key,label:s.label,kind:s.kind,sort_order:i});
    else if(ex&&!ok&&ex.status!=='done'&&ex.status!=='skipped')patch.push([ex,{status:'skipped'}]);
    else if(ex&&ok&&ex.status==='skipped'&&ex.result!=='not needed')patch.push([ex,{status:'todo'}]);
    // Policy edits (name, who does it, order) reach cases already open (Simon, 24 Nov 2026).
    if(ex&&(ex.label!==s.label||ex.kind!==s.kind||ex.sort_order!==i)){const pp=patch.find(x=>x[0]===ex);const b={label:s.label,kind:s.kind,sort_order:i};if(pp)Object.assign(pp[1],b);else patch.push([ex,b]);}
  });
  if(add.length){const r=await sbReq('covase_onboarding_steps',{method:'POST',body:add});onbSteps.push(...(r||[]));}
  for(const [ex,b] of patch){await sbReq(`covase_onboarding_steps?id=eq.${encodeURIComponent(ex.id)}`,{method:'PATCH',body:{...b,updated_at:new Date().toISOString()},prefer:'return=minimal'});Object.assign(ex,b);}
}
async function onbSetStep(caseId,key,status,result,extra){
  const s=onbStepsOf(caseId).find(x=>x.step_key===key);if(!s)return;
  const body={status,updated_at:new Date().toISOString(),...(extra||{})};
  if(result!==undefined)body.result=result;
  if(status==='done'){body.done_at=body.updated_at;body.done_by=body.done_by||'Simon';body.error=null;}
  try{await sbReq(`covase_onboarding_steps?id=eq.${encodeURIComponent(s.id)}`,{method:'PATCH',body,prefer:'return=minimal'});Object.assign(s,body);}
  catch(e){toast('Update failed: '+e.message,'error');return;}
  await onbMaybeComplete(caseId);
  if(onbEditId===caseId)onbRenderChecklist();renderOnboarding();
}
async function onbMaybeComplete(caseId){
  const c=onbCases.find(x=>x.id===caseId);if(!c||c.status!=='open')return;
  const st=onbStepsOf(caseId).filter(s=>s.status!=='skipped');
  if(st.length&&st.every(s=>s.status==='done')){
    const now=new Date().toISOString();
    await sbReq(`covase_onboarding_cases?id=eq.${encodeURIComponent(caseId)}`,{method:'PATCH',body:{status:'done',completed_at:now,updated_at:now},prefer:'return=minimal'});
    c.status='done';c.completed_at=now;toast(c.case_ref+' complete — everything is done','success');
  }
}
async function onbCancelCase(){
  const c=onbCases.find(x=>x.id===onbEditId);if(!c)return;
  if(!confirm('Cancel '+c.case_ref+' for '+onbName(c)+'? It drops off the board (nothing is deleted).'))return;
  try{await sbReq(`covase_onboarding_cases?id=eq.${encodeURIComponent(c.id)}`,{method:'PATCH',body:{status:'cancelled',updated_at:new Date().toISOString()},prefer:'return=minimal'});c.status='cancelled';closeOnbModal();renderOnboarding();toast('Case cancelled','success');}
  catch(e){toast('Failed: '+e.message,'error');}
}

// ── Checklist ──
function onbRenderChecklist(){
  const c=onbCases.find(x=>x.id===onbEditId),el=document.getElementById('onb-checklist');if(!c||!el)return;
  const st=onbStepsOf(c.id);
  if(!st.length){el.innerHTML='<div class="notes-box">No checklist — this client has no onboarding policy yet. Add one under ⚙ Client policies, then save the case again.</div>';}
  else el.innerHTML=st.map(s=>onbStepRow(c,s)).join('');
  const noms=onbNominees.filter(n=>n.case_id===c.id),nel=document.getElementById('onb-nominees');
  if(nel)nel.innerHTML=noms.length?'<div class="form-section-label">Nominees (from Drivetech)</div>'+noms.map(n=>`<div class="onb-step"><div class="onb-step-main"><div class="onb-step-label">${esc(n.name)}</div><div class="onb-step-res">${esc(n.check_status||'unknown')}${n.checked_at?' · checked '+esc(fmtUK(String(n.checked_at).slice(0,10))):''}</div></div></div>`).join(''):'';
}
function onbStepRow(c,s){
  const icon={done:'✅',skipped:'—',failed:'⚠️',ready:'🤖',in_progress:'⏳',todo:'⬜'}[s.status]||'⬜';
  const id=esc(c.id),k=esc(s.step_key);
  const doneBtn=`<button class="btn btn-edit" onclick="onbSetStep('${id}','${k}','done')">✓ Done</button>`;
  const undo=`<button class="btn btn-edit" title="Mark as not done" onclick="onbSetStep('${id}','${k}','todo')">↺</button>`;
  const skip=`<button class="btn btn-edit" title="Not needed for this driver" onclick="onbSetStep('${id}','${k}','skipped','not needed')">Not needed</button>`;
  let act='';
  if(s.status==='done'||s.status==='skipped')act=undo;
  else switch(s.step_key){
    case 'dynamics':act=`<button class="btn btn-edit" onclick="onbDynSearch()">🔍 Find in Dynamics</button><button class="btn btn-edit" onclick="onbDynCreate()">+ Create in Dynamics</button>`;break;
    case 'dfb_email':act=`<button class="btn btn-edit" onclick="onbOpenEmail('dfb')">✉ Preview &amp; send</button>`+doneBtn;break;
    case 'short_hire_email':act=c.hire_id?`<button class="btn btn-edit" onclick="onbOpenEmail('short_hire')">✉ Preview &amp; send</button>`+doneBtn:'<span class="onb-hint">Book the short hire first</span>';break;
    case 'vehicle':
      if(c.vehicle_route==='short_hire')act=c.hire_id?`<button class="btn btn-edit" onclick="onbOpenHire()">Open booking</button>`+doneBtn:`<button class="btn btn-edit" onclick="onbBookHire()">🚗 Book short hire</button>`;
      else if(c.vehicle_route==='existing_vehicle')act=c.vehicle_reg?doneBtn:'<span class="onb-hint">Add the registration and save</span>';
      else act='<span class="onb-hint">Choose how they get a vehicle and save</span>'+doneBtn;
      break;
    case 'calendar':act=s.kind==='auto'?`<button class="btn btn-edit" onclick="onbOpenCalendar()">📅 Add to calendar</button>`+doneBtn:doneBtn;break;
    case 'agreement':act=`<label class="btn btn-edit" style="cursor:pointer">📎 Upload signed copy<input type="file" style="display:none" onchange="onbUploadAgreement(this.files);this.value=''"></label>`+doneBtn;break;
    default:
      if(s.kind==='browser'&&s.status!=='ready')act=`<button class="btn btn-edit" title="Put it on Claude's to-do list" onclick="onbSetStep('${id}','${k}','ready')">🤖 Ready for Claude</button>`+doneBtn;
      else if(s.kind==='browser')act=`<button class="btn btn-edit" onclick="onbSetStep('${id}','${k}','todo')">Take back</button>`+doneBtn;
      else act=doneBtn;
  }
  if(s.status!=='done'&&s.status!=='skipped'&&!['dynamics'].includes(s.step_key))act+=skip;
  const res=[s.status==='ready'?'On Claude\'s to-do list':'',s.result&&s.result!=='not needed'?s.result:'',s.status==='done'&&s.done_at?fmtUK(String(s.done_at).slice(0,10)):'',s.error?'⚠ '+s.error:''].filter(Boolean).join(' · ');
  return `<div class="onb-step onb-st-${esc(s.status)}"><div class="onb-step-ico">${icon}</div><div class="onb-step-main"><div class="onb-step-label">${esc(s.label||s.step_key)} <span class="onb-kind">${esc(onbLbl(ONB_KINDS,s.kind))}</span></div>${res?`<div class="onb-step-res">${esc(res)}</div>`:''}${s.step_key==='dynamics'&&s.status!=='done'?'<div id="onb-dyn-results"></div>':''}</div><div class="onb-step-act">${act}</div></div>`;
}

// ── Dynamics ──
async function onbSaveFirst(){
  // Steps act on the saved case; save any edits in the form first.
  const c=onbCases.find(x=>x.id===onbEditId);if(!c)return null;
  const v=onbRead();const changed=Object.keys(v).some(k=>(v[k]??null)!==(c[k]??null));
  if(changed){await sbReq(`covase_onboarding_cases?id=eq.${encodeURIComponent(c.id)}`,{method:'PATCH',body:{...v,updated_at:new Date().toISOString()},prefer:'return=minimal'});Object.assign(c,v);await onbSyncSteps(c);}
  return c;
}
async function onbDynSearch(){
  const c=await onbSaveFirst();if(!c)return;
  const el=document.getElementById('onb-dyn-results');if(!el)return;
  const qs=[c.email,[c.first_name,c.last_name].filter(Boolean).join(' '),c.last_name].filter(Boolean);
  if(!qs.length){toast('Add the driver\'s name or email first','error');return;}
  el.innerHTML='<div class="onb-hint">Searching Dynamics…</div>';
  const seen=new Set();onbDynResults=[];
  try{
    for(const q of qs){
      const r=await fetch(getConfig().n8nContact+'?q='+encodeURIComponent(q.replace(/'/g,"''")),{mode:'cors'});
      const data=await r.json();(Array.isArray(data)?data:[]).forEach(d=>{if(d.contactId&&!seen.has(d.contactId)){seen.add(d.contactId);onbDynResults.push(d);}});
      if(onbDynResults.length)break;
    }
    el.innerHTML=onbDynResults.length?onbDynResults.slice(0,8).map((d,i)=>`<div class="onb-dyn-row"><div><strong>${esc(d.fullName)}</strong> · ${esc(d.accountName||'no account')}<div class="onb-hint">${esc([d.email,d.mobile,d.jobTitle].filter(Boolean).join(' · '))}</div></div><button class="btn btn-edit" onclick="onbDynPick(${i})">Use this</button></div>`).join('')
      :'<div class="onb-hint">Not found in Dynamics — use + Create in Dynamics.</div>';
  }catch(e){el.innerHTML='<div class="onb-hint">⚠ Dynamics search failed — '+esc(e.message)+'</div>';}
}
async function onbLinkContact(c,d){
  // Mirror into Covase Tools contacts (reuses the hire screen's helper) and link.
  const row=await createContactFromDynamics({...d,firstName:d.firstName||c.first_name,lastName:d.lastName||c.last_name,email:d.email||c.email,mobile:d.mobile||c.mobile,jobTitle:d.jobTitle||c.job_title},c.account_id);
  const body={dynamics_contact_id:d.contactId,contact_id:row?row.id:null,updated_at:new Date().toISOString()};
  // Fill gaps on the case from Dynamics (never overwrite what's typed).
  [['email','email'],['mobile','mobile'],['address_line1','address1'],['address_line2','address2'],['town','town'],['county','county'],['postcode','postcode']].forEach(([k,dk])=>{if(!c[k]&&d[dk])body[k]=d[dk];});
  await sbReq(`covase_onboarding_cases?id=eq.${encodeURIComponent(c.id)}`,{method:'PATCH',body,prefer:'return=minimal'});
  Object.assign(c,body);onbFill(c);
}
async function onbDynPick(i){
  const c=onbCases.find(x=>x.id===onbEditId),d=onbDynResults[i];if(!c||!d)return;
  const acc=(allAccounts||[]).find(a=>a.id===c.account_id);
  if(acc&&acc.dynamics_id&&d.accountId&&d.accountId!==acc.dynamics_id&&!confirm(d.fullName+' is under '+(d.accountName||'another account')+' in Dynamics, not '+acc.company_name+'. Use them anyway?'))return;
  try{await onbLinkContact(c,d);await onbSetStep(c.id,'dynamics','done','Found: '+d.fullName);}
  catch(e){toast('Link failed: '+e.message,'error');}
}
async function onbDynCreate(){
  const c=await onbSaveFirst();if(!c)return;
  const miss=[['first_name','first name'],['last_name','surname'],['email','email'],['mobile','mobile']].filter(([k])=>!c[k]).map(x=>x[1]);
  if(miss.length){toast('Needed first: '+miss.join(', '),'error');return;}
  const acc=(allAccounts||[]).find(a=>a.id===c.account_id);
  if(!acc||!acc.dynamics_id){toast(((acc&&acc.company_name)||'This client')+' has no Dynamics link, so the driver can\'t be filed under it','error');return;}
  if(!confirm('Create '+onbName(c)+' in Dynamics under '+acc.company_name+'?\n\nSearch first if they might already be there (existing employees usually are).'))return;
  try{
    const r=await fetch(ONB_N8N.create,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:await onbToken(),firstName:c.first_name,lastName:c.last_name,preferredName:c.preferred_name,email:c.email,mobile:c.mobile,jobTitle:c.job_title,address1:c.address_line1,address2:c.address_line2,town:c.town,county:c.county,postcode:c.postcode,accountId:acc.dynamics_id})});
    if(r.status===404)throw new Error('the Dynamics create workflow is not switched on in n8n yet');
    const j=await r.json().catch(()=>({}));if(!r.ok||!j.contactId)throw new Error(j.message||('HTTP '+r.status));
    await onbLinkContact(c,{contactId:j.contactId,fullName:j.fullName||onbName(c),firstName:c.first_name,lastName:c.last_name,email:c.email,mobile:c.mobile,accountId:acc.dynamics_id});
    await onbSetStep(c.id,'dynamics','done','Created in Dynamics');
  }catch(e){toast('Dynamics create failed: '+e.message,'error');}
}

// ── Short hire ──
async function onbBookHire(){
  const c=await onbSaveFirst();if(!c)return;
  onbHireFor=c.id;closeOnbModal();
  await openNewHire();
  const f=(id,v)=>{const e=document.getElementById(id);if(e&&v)e.value=v;};
  f('hf-account',c.account_id);if(typeof updateHireD365Link==='function')try{updateHireD365Link('account');}catch(e){}
  f('hf-driver',onbName(c));f('hf-driver-contact-id',c.contact_id);f('hf-driver-dynamics-id',c.dynamics_contact_id);f('hf-mobile',c.mobile);
  f('hf-addr1',c.address_line1);f('hf-addr2',c.address_line2);f('hf-town',c.town);f('hf-county',c.county);f('hf-postcode',c.postcode);
  f('hf-start',c.start_date);
  const n=document.getElementById('hf-notes');if(n&&!n.value)n.value='Onboarding '+(c.case_ref||'')+' – '+onbLbl(ONB_TYPES,c.case_type).toLowerCase()+(c.job_title?', '+c.job_title:'');
  toast('Booking pre-filled from '+c.case_ref+' — finish it and save','info');
}
// When a hire is saved while onbHireFor is set, link the new booking to the case.
{const _saveHire=saveHire;saveHire=async function(){
  const wasNew=!editHireId,before=(allHires||[])[0]&&allHires[0].id;
  await _saveHire.apply(this,arguments);
  if(!onbHireFor||!wasNew)return;
  const h=(allHires||[])[0];if(!h||h.id===before)return;
  const caseId=onbHireFor;onbHireFor=null;
  try{await sbReq(`covase_onboarding_cases?id=eq.${encodeURIComponent(caseId)}`,{method:'PATCH',body:{hire_id:h.id,updated_at:new Date().toISOString()},prefer:'return=minimal'});
    const c=onbCases.find(x=>x.id===caseId);if(c)c.hire_id=h.id;
    await onbSetStep(caseId,'vehicle','done','Short hire booked'+(h.job_ref?' '+h.job_ref:''));
    toast('Booking linked to the onboarding case','success');}
  catch(e){toast('Booking saved but not linked to the case: '+e.message,'error');}
};}
async function onbOpenHire(){const c=onbCases.find(x=>x.id===onbEditId);if(!c||!c.hire_id)return;closeOnbModal();if(!hiresLoaded){await loadHires();}openHireById(c.hire_id);}
async function onbUploadAgreement(files){
  if(!onbEditId||!files||!files.length)return;
  const n=await uploadDocsTo('onboarding',onbEditId,files,'signed_contract');
  if(n)await onbSetStep(onbEditId,'agreement','done','Signed copy on file');
}

// ── Emails ──
lsInjectModal('onb-email-modal',`
  <div class="modal-header"><div class="modal-title" id="onb-em-title">Email</div><button class="modal-close" onclick="document.getElementById('onb-email-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body">
    <div class="form-row"><div class="form-field"><label>From</label><select id="onb-em-from">${lsOptions(ONB_SENDERS)}</select></div><div class="form-field"><label>To</label><input id="onb-em-to"></div></div>
    <div class="form-row"><div class="form-field"><label>Cc</label><input id="onb-em-cc" placeholder="(optional, comma separated)"></div><div class="form-field" id="onb-em-keep-wrap" style="display:none"><label>How long they keep the hire car</label><select id="onb-em-keep" onchange="onbEmailBuild()"></select></div></div>
    <div class="form-field"><label>Subject</label><input id="onb-em-subject"></div>
    <div class="form-field"><label>Message <span style="font-weight:400;color:var(--n400)">· blank line = new paragraph; lines starting "1." or "*" become lists</span></label><textarea id="onb-em-body" style="min-height:320px;font-size:13px;line-height:1.5"></textarea></div>
    <div class="form-field"><label>Signature <span style="font-weight:400;color:var(--n400)">· from the client policy</span></label><div id="onb-em-sig" class="onb-sig onb-sig-preview"></div></div>
    <div class="form-section-label">Attachments</div>
    <div id="onb-em-atts"></div>
  </div>
  <div class="modal-footer">
    <button class="btn-secondary-modal" style="margin-right:auto" onclick="onbEmailBuild()">↻ Rebuild from template</button>
    <button class="btn-secondary-modal" onclick="document.getElementById('onb-email-modal').classList.remove('open')">Cancel</button>
    <button class="btn-primary-modal" id="onb-em-send" onclick="onbEmailSend()">Send</button>
  </div>`,true);

// Signature HTML pasted from Outlook: keep formatting, drop anything that runs
// code or points at the sender's own computer (file:/blob: pictures can't be sent).
function onbCleanSig(html){
  if(!html)return '';
  const d=document.createElement('div');d.innerHTML=String(html);
  d.querySelectorAll('script,style,meta,link,iframe,object,embed,form,input,button,o\\:p').forEach(x=>x.remove());
  d.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(a=>{const n=a.name.toLowerCase(),v=String(a.value||'').trim().toLowerCase();
    if(n.startsWith('on')||((n==='href'||n==='src')&&/^(javascript|vbscript|file|blob):/.test(v))||n==='contenteditable')el.removeAttribute(a.name);});
    if(el.tagName==='IMG'&&!el.getAttribute('src'))el.remove();
    // Outlook pastes <p class=MsoNormal> with paragraph spacing that mail programs apply but the
    // editing box doesn't, so gaps doubled in received mail (Simon, 24 Nov 2026). Zero it out.
    if(/^(P|DIV|H[1-6])$/.test(el.tagName)){el.style.margin='0';el.style.marginTop='0';el.style.marginBottom='0';}});
  const out=d.innerHTML.trim();
  return /^(<br\s*\/?>|\s|&nbsp;)*$/i.test(out)?'':out;
}
function onbFill1(tpl,vars){return String(tpl||'').replace(/\{(\w+)\}/g,(m,k)=>vars[k]!=null?vars[k]:m);}
function onbLongDate(d){if(!d)return '';const t=new Date(String(d).slice(0,10)+'T00:00:00');return isNaN(t)?fmtUK(d):t.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});}
async function onbOpenEmail(kind){
  const c=await onbSaveFirst();if(!c)return;const pol=onbPolicy(c);
  if(!pol){toast('No onboarding policy for this client','error');return;}
  if(!c.email){toast('Add the driver\'s email first','error');return;}
  let hire=null;
  if(kind==='short_hire'){try{const r=await sbReq(`covase_hires?id=eq.${encodeURIComponent(c.hire_id)}`);hire=r&&r[0];}catch(e){}if(!hire){toast('Couldn\'t load the booking','error');return;}}
  onbEmailCtx={kind,caseId:c.id,hire};
  document.getElementById('onb-em-title').textContent=(kind==='dfb'?'Driving for Business email':'Short-hire email')+' — '+onbName(c);
  document.getElementById('onb-em-from').value=pol.sender||ONB_SENDERS[0];
  document.getElementById('onb-em-to').value=c.email;document.getElementById('onb-em-cc').value=pol.cc||'';
  const kw=document.getElementById('onb-em-keep-wrap'),ks=document.getElementById('onb-em-keep');
  if(kind==='short_hire'){kw.style.display='';ks.innerHTML=(pol.keep_sentences||[]).map((s,i)=>`<option value="${i}">${esc(s.length>70?s.slice(0,70)+'…':s)}</option>`).join('')+'<option value="none">(leave it out — write your own)</option>';}
  else kw.style.display='none';
  onbEmailBuild();
  document.getElementById('onb-em-sig').innerHTML=onbCleanSig(pol.signature_html||'')||'<span class="onb-hint">No signature set — add one under ⚙ Client policies.</span>';
  document.getElementById('onb-email-modal').classList.add('open');
}
function onbEmailDocs(c,pol,kind){
  const fleet=['existing_vehicle','new_lease'].includes(c.vehicle_route);
  return (pol.docs||[]).filter(d=>d.doc_id&&(d.emails||'dfb')===kind&&(!d.vehicle||d.vehicle==='any'||d.vehicle===c.vehicle_type)&&(!d.routes||d.routes==='any'||(d.routes==='fleet'&&fleet)||d.routes===c.vehicle_route));
}
function onbEmailBuild(){
  const ctx=onbEmailCtx;if(!ctx)return;const c=onbCases.find(x=>x.id===ctx.caseId),pol=onbPolicy(c);if(!c||!pol)return;
  const tpl=(pol.emails||{})[ctx.kind]||{subject:'',body:''};
  const vehicle=[c.vehicle_desc,c.vehicle_reg?'('+c.vehicle_reg+')':''].filter(Boolean).join(' ')||'company car';
  const vars={name:onbCallName(c),firstName:c.first_name||'',fullName:onbName(c),client:c.client_name||'',startDate:onbLongDate(c.start_date)||'your start date',vehicle,ref:c.case_ref||''};
  vars.vehicleParagraph=onbFill1((pol.route_paragraphs||{})[c.vehicle_route]||'',vars);
  if(ctx.hire){const h=ctx.hire;
    vars.deliveryDate=onbLongDate(h.start_date)||'[date]';
    const tm=String(h.preferred_start_time||'').match(/^(\d{1,2}):(\d{2})/);
    vars.deliveryTime=tm?((+tm[1]%12||12)+(tm[2]!=='00'?':'+tm[2]:'')+(+tm[1]<12?'am':'pm')):'[time]';
    vars.deliveryAddress=[h.delivery_address_line1,h.delivery_town,h.delivery_postcode].filter(Boolean).join(', ')||'your home address';
    const k=document.getElementById('onb-em-keep').value;vars.keepSentence=k==='none'?'':((pol.keep_sentences||[])[+k]||'');}
  document.getElementById('onb-em-subject').value=onbFill1(tpl.subject,vars); // no case ref: drivers don't need it (Simon, 24 Nov 2026); replies can be matched on the driver's email
  document.getElementById('onb-em-body').value=onbFill1(tpl.body,vars).replace(/\n{3,}/g,'\n\n').trim();
  const docs=onbEmailDocs(c,pol,ctx.kind);
  document.getElementById('onb-em-atts').innerHTML=docs.length?docs.map(d=>`<label class="onb-att"><input type="checkbox" class="onb-att-cb" value="${esc(d.doc_id)}" checked> 📄 ${esc(d.label||d.file_name)}</label>`).join(''):'<div class="onb-hint">No attachments for this driver under the policy.</div>';
}
// Plain text → simple HTML: paragraphs, numbered and bulleted lists.
function onbTextToHtml(t){
  return String(t||'').split(/\n\s*\n/).map(block=>{
    const lines=block.split('\n').map(l=>l.trim()).filter(Boolean);if(!lines.length)return '';
    if(lines.every(l=>/^\d+[.)]\s/.test(l)))return '<ol>'+lines.map(l=>'<li>'+esc(l.replace(/^\d+[.)]\s+/,''))+'</li>').join('')+'</ol>';
    if(lines.every(l=>/^[*•-]\s/.test(l)))return '<ul>'+lines.map(l=>'<li>'+esc(l.replace(/^[*•-]\s+/,''))+'</li>').join('')+'</ul>';
    return '<p>'+lines.map(esc).join('<br>')+'</p>';
  }).join('\n').replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g,'<a href="mailto:$1">$1</a>');
}
async function onbSignedUrl(path){
  const r=await fetch(`${getConfig().url}/storage/v1/object/sign/documents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:docHeaders({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:600})});
  const j=await r.json();if(!r.ok||!j.signedURL)throw new Error(j.message||j.error||('HTTP '+r.status));
  return `${getConfig().url}/storage/v1${j.signedURL}`;
}
async function onbEmailSend(){
  const ctx=onbEmailCtx;if(!ctx)return;const c=onbCases.find(x=>x.id===ctx.caseId);if(!c)return;
  const to=document.getElementById('onb-em-to').value.trim(),subject=document.getElementById('onb-em-subject').value.trim(),text=document.getElementById('onb-em-body').value;
  if(!to||!subject){toast('To and subject are needed','error');return;}
  if(/\{\w+\}|\[(date|time)\]/.test(text+subject)&&!confirm('The email still has a gap to fill in ({…} or [date]/[time]). Send anyway?'))return;
  const ids=[...document.querySelectorAll('.onb-att-cb:checked')].map(x=>x.value);
  const btn=document.getElementById('onb-em-send');btn.disabled=true;btn.textContent='Sending…';
  try{
    let docs=[];
    if(ids.length){docs=await sbReq(`covase_documents?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,storage_path,file_name,mime_type`);}
    const attachments=[];for(const d of docs)attachments.push({name:d.file_name,contentType:d.mime_type||'application/pdf',url:await onbSignedUrl(d.storage_path)});
    const from=document.getElementById('onb-em-from').value,cc=document.getElementById('onb-em-cc').value.trim();
    const r=await fetch(ONB_N8N.email,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:await onbToken(),from,to,cc,subject,bodyHtml:'<div style="font-family:Arial,sans-serif;font-size:14px">'+onbTextToHtml(text)+'</div>'+(onbCleanSig((onbPolicy(c)||{}).signature_html||'')?'<br>'+onbCleanSig(onbPolicy(c).signature_html):''),attachments})});
    if(r.status===404)throw new Error('the email sender is not switched on in n8n yet');
    const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.message||('HTTP '+r.status));
    const entry={key:ctx.kind,subject,to,cc:cc||null,from,sent_at:new Date().toISOString(),attachments:docs.map(d=>d.file_name)};
    const emails=[...(c.emails||[]),entry];
    await sbReq(`covase_onboarding_cases?id=eq.${encodeURIComponent(c.id)}`,{method:'PATCH',body:{emails,updated_at:entry.sent_at},prefer:'return=minimal'});c.emails=emails;
    document.getElementById('onb-email-modal').classList.remove('open');
    await onbSetStep(c.id,ctx.kind==='dfb'?'dfb_email':'short_hire_email','done','Sent to '+to+(docs.length?' with '+docs.length+' attachment'+(docs.length===1?'':'s'):''));
    toast('Email sent','success');
  }catch(e){toast('Send failed: '+e.message,'error');}
  finally{btn.disabled=false;btn.textContent='Send';}
}

// ── Calendar entry (n8n covase-calendar-entry → Graph, Simon's own calendars) ──
lsInjectModal('onb-cal-modal',`
  <div class="modal-header"><div class="modal-title">Add to calendar</div><button class="modal-close" onclick="document.getElementById('onb-cal-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body">
    <div class="form-row"><div class="form-field"><label>Calendar</label><input id="onb-cal-name"></div><div class="form-field"><label>Date (all day)</label><input type="date" id="onb-cal-date"></div></div>
    <div class="form-field"><label>Title</label><input id="onb-cal-subject"></div>
    <div class="form-field"><label>Notes</label><textarea id="onb-cal-notes" style="min-height:160px"></textarea></div>
  </div>
  <div class="modal-footer"><button class="btn-secondary-modal" onclick="document.getElementById('onb-cal-modal').classList.remove('open')">Cancel</button><button class="btn-primary-modal" id="onb-cal-go" onclick="onbCalendarSend()">Add to calendar</button></div>`);
async function onbOpenCalendar(){
  const c=await onbSaveFirst();if(!c)return;const pol=onbPolicy(c)||{};
  const vehicle=c.vehicle_route==='short_hire'?'short hire':c.vehicle_route==='existing_vehicle'?('fleet car'+(c.vehicle_reg?' '+c.vehicle_reg:'')):onbLbl(ONB_ROUTES,c.vehicle_route).toLowerCase();
  document.getElementById('onb-cal-name').value=pol.calendar_name||(ONB_DEFAULT_POLICIES.find(d=>d.key===pol.key)||{}).calendar_name||'';
  document.getElementById('onb-cal-date').value=c.start_date||'';
  document.getElementById('onb-cal-subject').value=[onbLbl(ONB_TYPES,c.case_type)+': '+onbName(c),vehicle].filter(Boolean).join(' – ')+(c.case_ref?' ('+c.case_ref+')':'');
  document.getElementById('onb-cal-notes').value=[
    'Client: '+(c.client_name||''),c.job_title?'Role: '+c.job_title:'',c.basis?'Basis: '+onbLbl(ONB_BASIS,c.basis):'',
    'Driver: '+onbName(c)+(c.preferred_name?' (known as '+c.preferred_name+')':''),c.email?'Email: '+c.email:'',c.mobile?'Mobile: '+c.mobile:'',
    'Vehicle: '+onbLbl(ONB_ROUTES,c.vehicle_route)+' · '+onbLbl(ONB_VTYPES,c.vehicle_type)+(c.vehicle_reg?' · '+c.vehicle_reg:''),
    '','Covase Tools case '+(c.case_ref||'')].filter((x,i)=>x!==''||i>0).join('\n');
  document.getElementById('onb-cal-modal').classList.add('open');
}
async function onbCalendarSend(){
  const c=onbCases.find(x=>x.id===onbEditId);if(!c)return;
  const g=id=>document.getElementById(id).value.trim();
  if(!g('onb-cal-name')||!g('onb-cal-date')||!g('onb-cal-subject')){toast('Calendar, date and title are needed','error');return;}
  const b=document.getElementById('onb-cal-go');b.disabled=true;
  try{
    await covaseAuthWait();
    const r=await fetch(ONB_N8N.calendar,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:covaseAuthToken(),calendar:g('onb-cal-name'),date:g('onb-cal-date'),subject:g('onb-cal-subject'),body:'<div style="font-family:Arial,sans-serif;font-size:13px">'+esc(document.getElementById('onb-cal-notes').value).replace(/\n/g,'<br>')+'</div>'})});
    if(r.status===404)throw new Error('the calendar workflow is not switched on in n8n yet');
    const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.message||j.error||('HTTP '+r.status));
    document.getElementById('onb-cal-modal').classList.remove('open');
    await onbSetStep(c.id,'calendar','done','In '+g('onb-cal-name')+' calendar for '+fmtUK(g('onb-cal-date')));
    toast('Added to your '+g('onb-cal-name')+' calendar','success');
  }catch(e){toast('Couldn\'t add it: '+e.message,'error');}
  finally{b.disabled=false;}
}

// ── Client policies ──
lsInjectModal('onb-pol-modal',`
  <div class="modal-header"><div class="modal-title">Onboarding policies</div><button class="modal-close" onclick="document.getElementById('onb-pol-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body">
    <div class="form-row"><div class="form-field"><label>Policy</label><select id="onb-pol-pick" onchange="onbPolPick(this.value)"></select></div><div class="form-field" style="align-self:end"><button class="btn btn-edit" onclick="onbPolAdd()">+ Add a client policy</button></div></div>
    <div id="onb-pol-body"></div>
  </div>
  <div class="modal-footer">
    <button class="btn-secondary-modal" onclick="document.getElementById('onb-pol-modal').classList.remove('open')">Close</button>
    <button class="btn-primary-modal" onclick="onbPolSave()">Save policies</button>
  </div>`,true);

async function openOnbPolicies(){
  if(!onbPolicies)await onbLoadPolicies();await lsEnsureCrm();
  onbPolDraft=JSON.parse(JSON.stringify(onbPolicies));onbPolIdx=0;onbPolRender();
  document.getElementById('onb-pol-modal').classList.add('open');
}
function onbPolPick(i){onbPolCollect();onbPolIdx=+i;onbPolRender();}
function onbPolAdd(){onbPolCollect();const name=prompt('Client name for the new policy?');if(!name)return;
  const base=JSON.parse(JSON.stringify(ONB_DEFAULT_POLICIES[0]));base.key='p'+Date.now().toString(36);base.name=name;base.account_id='';base.docs=[];
  onbPolDraft.push(base);onbPolIdx=onbPolDraft.length-1;onbPolRender();}
function onbPolRender(){
  const p=onbPolDraft[onbPolIdx];
  document.getElementById('onb-pol-pick').innerHTML=onbPolDraft.map((x,i)=>`<option value="${i}"${i===onbPolIdx?' selected':''}>${esc(x.name)}</option>`).join('');
  if(!p){document.getElementById('onb-pol-body').innerHTML='';return;}
  const stepRows=p.steps.map((s,i)=>`<div class="onb-pol-step">
      <input class="onb-ps-label" value="${esc(s.label)}" data-i="${i}">
      <select class="onb-ps-kind">${lsOptions(ONB_KINDS,s.kind)}</select>
      <select class="onb-ps-when">${lsOptions(ONB_WHEN,s.when||'')}</select>
      <button class="btn btn-edit" title="Move up" onclick="onbPolMove(${i},-1)">↑</button>
      <button class="btn btn-danger" title="Remove" onclick="onbPolDelStep(${i})">✕</button></div>`).join('');
  const docRows=(p.docs||[]).map((d,i)=>`<div class="onb-pol-step">
      <span class="onb-pd-name">📄 ${esc(d.file_name||d.label)}</span>
      <select class="onb-pd-emails" title="Which email it goes with">${lsOptions([['dfb','Driving for Business email'],['short_hire','Short-hire email']],d.emails||'dfb')}</select>
      <select class="onb-pd-vehicle" title="Car or van">${lsOptions([['any','Car or van'],['car','Cars only'],['lcv','Vans only']],d.vehicle||'any')}</select>
      <select class="onb-pd-routes" title="Which vehicle route">${lsOptions([['any','Any vehicle route'],['fleet','Fleet / lease car only'],['short_hire','Short hire only']],d.routes||'any')}</select>
      <button class="btn btn-edit" onclick="onbPolOpenDoc('${esc(d.doc_id)}')">Open</button>
      <button class="btn btn-danger" title="Stop sending this file" onclick="onbPolDelDoc(${i})">✕</button></div>`).join('');
  const rp=p.route_paragraphs||{};
  document.getElementById('onb-pol-body').innerHTML=`
    <div class="form-row trio">
      <div class="form-field"><label>Name</label><input id="onb-pol-name" value="${esc(p.name)}"></div>
      <div class="form-field"><label>Client account</label><select id="onb-pol-acc">${lsAccountOptions(['client','both'],p.account_id)}</select></div>
      <div class="form-field"><label>Emails come from</label><select id="onb-pol-sender">${lsOptions(ONB_SENDERS,p.sender)}</select></div>
    </div>
    <div class="form-field"><label>Outlook calendar for entries</label><input id="onb-pol-cal" value="${esc(p.calendar_name||(ONB_DEFAULT_POLICIES.find(d=>d.key===p.key)||{}).calendar_name||'')}" placeholder="e.g. Woodland Trust (must match the calendar name in your Outlook)"></div>
    <div class="form-field"><label>Always copy in (optional)</label><input id="onb-pol-cc" value="${esc(p.cc||'')}" placeholder="comma separated"></div>
    <div class="form-field"><label>Email signature (added under every email from this policy)</label><div id="onb-pol-sig" class="onb-sig" contenteditable="true">${onbCleanSig(p.signature_html||'')}</div>
      <div class="onb-hint">Copy your signature from an email you've sent in Outlook and paste it here. Text, links and formatting come across. A logo shows if it's a picture from a website; a pasted picture from your computer may not, so check a test email.</div></div>
    <div class="form-section-label">Steps, in order</div>
    <div id="onb-pol-steps">${stepRows}</div>
    <button class="btn btn-edit" onclick="onbPolAddStep()">+ Add step</button>
    <div class="form-section-label">Documents</div>
    <div class="onb-hint" style="margin-bottom:6px">Uploaded once, attached automatically to the right drivers. Kept privately in Covase Tools.</div>
    <div id="onb-pol-docs">${docRows||'<div class="onb-hint">None yet.</div>'}</div>
    <label class="btn btn-edit" style="cursor:pointer;margin-top:6px">📎 Upload documents<input type="file" multiple accept="application/pdf,.doc,.docx" style="display:none" onchange="onbPolUpload(this.files);this.value=''"></label>
    <div class="form-section-label">Driving for Business email</div>
    <div class="onb-hint">Fill-ins: {name} (preferred, else first name) {firstName} {fullName} {startDate} {vehicle} {vehicleParagraph} {client}</div>
    <div class="form-field"><label>Subject</label><input id="onb-pol-dfb-s" value="${esc(p.emails.dfb.subject)}"></div>
    <div class="form-field"><label>Message</label><textarea id="onb-pol-dfb-b" style="min-height:220px">${esc(p.emails.dfb.body)}</textarea></div>
    <div class="form-field"><label>{vehicleParagraph} — short hire</label><textarea id="onb-pol-rp-sh">${esc(rp.short_hire||'')}</textarea></div>
    <div class="form-field"><label>{vehicleParagraph} — existing fleet vehicle</label><textarea id="onb-pol-rp-ev">${esc(rp.existing_vehicle||'')}</textarea></div>
    <div class="form-field"><label>{vehicleParagraph} — new lease car</label><textarea id="onb-pol-rp-nl">${esc(rp.new_lease||'')}</textarea></div>
    <div class="form-section-label">Short-hire email</div>
    <div class="onb-hint">Extra fill-ins from the booking: {deliveryDate} {deliveryTime} {deliveryAddress} {keepSentence}</div>
    <div class="form-field"><label>Subject</label><input id="onb-pol-sh-s" value="${esc(p.emails.short_hire.subject)}"></div>
    <div class="form-field"><label>Message</label><textarea id="onb-pol-sh-b" style="min-height:220px">${esc(p.emails.short_hire.body)}</textarea></div>
    <div class="form-field"><label>{keepSentence} choices (one per line)</label><textarea id="onb-pol-keep">${esc((p.keep_sentences||[]).join('\n'))}</textarea></div>`;
}
function onbPolCollect(){
  const p=onbPolDraft&&onbPolDraft[onbPolIdx];if(!p||!document.getElementById('onb-pol-name'))return;
  const g=id=>document.getElementById(id).value;
  p.name=g('onb-pol-name').trim()||p.name;p.calendar_name=g('onb-pol-cal').trim();p.signature_html=onbCleanSig((document.getElementById('onb-pol-sig')||{}).innerHTML||'');p.account_id=g('onb-pol-acc');p.sender=g('onb-pol-sender');p.cc=g('onb-pol-cc').trim();
  p.steps=[...document.querySelectorAll('#onb-pol-steps .onb-pol-step')].map((row,i)=>({key:p.steps[i].key,label:row.querySelector('.onb-ps-label').value.trim()||p.steps[i].label,kind:row.querySelector('.onb-ps-kind').value,when:row.querySelector('.onb-ps-when').value}));
  [...document.querySelectorAll('#onb-pol-docs .onb-pol-step')].forEach((row,i)=>{const d=p.docs[i];if(!d)return;d.emails=row.querySelector('.onb-pd-emails').value;d.vehicle=row.querySelector('.onb-pd-vehicle').value;d.routes=row.querySelector('.onb-pd-routes').value;});
  p.emails={dfb:{subject:g('onb-pol-dfb-s'),body:g('onb-pol-dfb-b')},short_hire:{subject:g('onb-pol-sh-s'),body:g('onb-pol-sh-b')}};
  p.route_paragraphs={short_hire:g('onb-pol-rp-sh'),existing_vehicle:g('onb-pol-rp-ev'),new_lease:g('onb-pol-rp-nl'),undecided:''};
  p.keep_sentences=g('onb-pol-keep').split('\n').map(s=>s.trim()).filter(Boolean);
}
function onbPolMove(i,d){onbPolCollect();const s=onbPolDraft[onbPolIdx].steps,j=i+d;if(j<0||j>=s.length)return;[s[i],s[j]]=[s[j],s[i]];onbPolRender();}
function onbPolDelStep(i){onbPolCollect();const s=onbPolDraft[onbPolIdx].steps;if(!confirm('Remove "'+s[i].label+'" from new cases? Existing cases keep it.'))return;s.splice(i,1);onbPolRender();}
function onbPolAddStep(){onbPolCollect();const l=prompt('Step name?');if(!l)return;onbPolDraft[onbPolIdx].steps.push({key:'s'+Date.now().toString(36),label:l,kind:'manual',when:''});onbPolRender();}
function onbPolDelDoc(i){onbPolCollect();const d=onbPolDraft[onbPolIdx].docs;if(!confirm('Stop attaching '+(d[i].file_name||'this file')+'? (The file is kept.)'))return;d.splice(i,1);onbPolRender();}
async function onbPolUpload(files){
  onbPolCollect();const p=onbPolDraft[onbPolIdx];if(!files||!files.length)return;
  const n=await uploadDocsTo('onboarding_policy',p.key,files,'other');if(!n)return;
  const names=[...files].map(f=>f.name);
  (window._lastDocIds||[]).forEach((id,i)=>{const nm=names[i]||'file';const lc=nm.toLowerCase();
    p.docs=p.docs||[];p.docs.push({doc_id:id,file_name:nm,emails:'dfb',vehicle:/\blcv\b|\bvan\b/.test(lc)?'lcv':(/\bcar\b/.test(lc)&&/(agreement|insurance|certificate)/.test(lc)?'car':'any'),routes:/lex|essential/.test(lc)?'fleet':'any'});});
  onbPolRender();toast(n+' uploaded — check who each one goes to, then Save policies','success');
}
async function onbPolOpenDoc(id){const w=window.open('','_blank');try{const r=await sbReq(`covase_documents?id=eq.${encodeURIComponent(id)}&select=storage_path`);const u=await onbSignedUrl(r[0].storage_path);if(w)w.location=u;}catch(e){if(w)w.close();toast("Couldn't open — "+e.message,'error');}}
async function onbPolSave(){
  onbPolCollect();
  try{await sbReq('covase_config',{method:'POST',body:{key:'onboarding_policies',value:onbPolDraft,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});
    onbPolicies=JSON.parse(JSON.stringify(onbPolDraft));toast('Policies saved — new cases use them; existing cases pick up new steps when saved','success');
    document.getElementById('onb-pol-modal').classList.remove('open');}
  catch(e){toast('Save failed: '+e.message,'error');}
}

window.EXTRA_VIEW_LOADERS=Object.assign(window.EXTRA_VIEW_LOADERS||{},{onboarding:loadOnboarding});
RT_TABLES.covase_onboarding_cases=()=>{if(onbLoaded)loadOnboarding();};
RT_TABLES.covase_onboarding_steps=()=>{if(onbLoaded)loadOnboarding();};
RT_TABLES.covase_onboarding_nominees=()=>{if(onbLoaded)loadOnboarding();};
{const prevCfg=RT_TABLES.covase_config;RT_TABLES.covase_config=()=>{prevCfg&&prevCfg();if(onbLoaded)onbLoadPolicies();};}
// Sidebar badge (open cases) without visiting the screen.
setTimeout(async()=>{try{const c=getConfig();if(!c.url||!c.key)return;const r=await sbReq('covase_onboarding_cases?status=eq.open&select=id');const b=document.getElementById('badge-onboarding');if(b)b.textContent=(r||[]).length;}catch(e){}},2500);
