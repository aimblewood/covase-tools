// ─── FINES & PENALTIES MODULE ───
// Register of motoring fines (Lex notifications → driver comms → nomination →
// COIN reconciliation → WT-sheet export → charging/appeals). Templates +
// dashboard config in covase_config; COIN import parses Lex's xlsx client-side.
let allFines=[],finesLoaded=false,fineView='kanban',fineDashCfg=null;
const FINE_STATUSES=[['new','New'],['driver_notified','Driver notified'],['address_requested','Address requested'],['nominated','Nominated'],['on_coin','On COIN'],['to_be_charged','To be charged'],['charged','Charged'],['query','Query (parked)'],['appeal_upheld','Appeal upheld'],['refunded','Refunded'],['cancelled','Cancelled']];
const FINE_STATUS_LABEL=Object.fromEntries(FINE_STATUSES);
const FINE_OFFENCE_LABEL={parking:'Parking',speeding:'Speeding',toll:'Toll violation',congestion:'Congestion charge',bus_lane:'Bus lane violation',route:'Route restriction',other:'Other'};
const FINE_OPEN=s=>!['charged','refunded','cancelled'].includes(s);
const DEFAULT_FINE_TEMPLATES={
  cc:'jonoliver@woodlandtrust.org.uk,markbevington@woodlandtrust.org.uk',
  apSubject:'Motoring fine received — {regNo}',
  apBody:'Hello {firstName}\n\nSorry to be the bearer of bad news but we have received the attached.\n\nI can confirm that the leasing company (Lex Autolease) has automatically paid the fine at the reduced rate of £{fineAmount}, and this has been recharged to The Woodland Trust along with a £{adminFee} admin fee. The Trust will be in contact with you in due course to confirm when this will be deducted via Payroll.\n\nIf you believe the fine has been issued incorrectly, we strongly encourage you to appeal directly to the issuing authority using the instructions provided on the attached notice.\n\nIf your appeal is successful, please notify us here at Covase and provide:\n• Written confirmation that the appeal was upheld\n• Written confirmation that a refund has been issued back to Lex Autolease\n\nOnce received, we will liaise with Lex to ensure that both the fine and the associated admin fee are credited back to The Trust which will then enable any deduction made by the Trust for their outlay to be returned to you through Payroll.\n\nIf you have any questions or need support with this process, don\'t hesitate to get in touch.\n\nThanks',
  spSubject:'Speeding notice received — {regNo} — please confirm your address',
  spBody:'Hi {firstName}\n\nSorry to be the bearer of bad news but we have received the attached.\n\nThe leasing company (Lex Autolease) will charge The Woodland Trust a £{adminFee} admin fee for processing. The Trust will be in contact with you in due course to confirm when this will be deducted via Payroll.\n\nWe need to nominate you as the driver via the issuer\'s online portal. Therefore please can you confirm your current address for us so we can double check against our files and submit correctly?\n\nThanks'
};
let fineTemplates={...DEFAULT_FINE_TEMPLATES};
async function checkFinesNow(){
  toast('Checking the Lex Fines folder…','success');
  try{await fetch('https://covase.app.n8n.cloud/webhook/covase-fines-check',{method:'GET',mode:'cors'});}catch(e){/* fire-and-forget */}
  setTimeout(loadFines,8000);setTimeout(loadFines,20000); // refresh twice — PDF reads can take 10s+
}
async function loadFineTemplates(){try{const rows=await sbReq('covase_config?key=eq.fines_templates&select=value');const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;if(v&&typeof v==='object')fineTemplates={...DEFAULT_FINE_TEMPLATES,...v};}catch(e){}}
async function loadFines(){
  try{
    allFines=await sbReq('covase_fines?order=created_at.desc&limit=1000');
    finesLoaded=true;
    if(!Array.isArray(allAccounts)||!allAccounts.length){try{allAccounts=await sbReq('covase_accounts?order=company_name.asc&limit=500');}catch(e){}}
    if(!Array.isArray(allContacts)||!allContacts.length){try{allContacts=await sbReq('covase_contacts?order=last_name.asc&limit=2000');}catch(e){}}
    updateFineStats();applyFineViewVis();renderFinesView();
  }catch(e){const el=document.getElementById('fines-register');if(el)el.innerHTML='<div class="empty-state"><div class="empty-icon">🎫</div><div class="empty-title">Load failed</div><div class="empty-sub">'+esc(e.message||'')+' (is phase-fines-penalties.sql applied?)</div></div>';}
}
function fineTotal(f){return (parseFloat(f.fine_amount)||0)+(parseFloat(f.fine_vat)||0)+(parseFloat(f.admin_fee)||0)+(parseFloat(f.admin_fee_vat)||0);}
function updateFineStats(){
  const open=(allFines||[]).filter(f=>FINE_OPEN(f.status));
  const nom=(allFines||[]).filter(f=>['address_requested'].includes(f.status)||(f.offence_type==='speeding'&&['new','driver_notified'].includes(f.status)));
  const yr=Date.now()-365*86400000;
  const cost=(allFines||[]).filter(f=>f.status!=='cancelled'&&(!f.offence_datetime||new Date(f.offence_datetime).getTime()>yr)).reduce((s,f)=>s+fineTotal(f),0);
  const q=(allFines||[]).filter(f=>f.status==='query').length;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('sf-open',open.length);set('sf-nom',nom.length);set('sf-cost',fmtMoney(cost||null));set('sf-query',q);
  const b=document.getElementById('badge-fines');if(b)b.textContent=String((allFines||[]).filter(f=>f.status==='new').length||0);
}
function applyFineViewVis(){
  const m={'register':'fines-register','kanban':'fines-kanban','dashboard':'fines-dashboard','reports':'fines-reports'};
  Object.entries(m).forEach(([k,id])=>{const e=document.getElementById(id);if(e)e.style.display=fineView===k?'':'none';});
}
function setFineView(v){fineView=v;document.querySelectorAll('#fine-view-seg .seg-btn').forEach(b=>b.classList.toggle('active',b.getAttribute('data-fv')===v));applyFineViewVis();renderFinesView();}
function finesFiltered(){
  const q=(document.getElementById('fine-search')?.value||'').toLowerCase().trim();
  const st=document.getElementById('fine-status-filter')?.value||'';
  let rows=(allFines||[]).slice();
  if(st)rows=rows.filter(f=>f.status===st);
  if(q)rows=rows.filter(f=>[f.driver_name,f.vehicle_reg,f.issuer,f.issuer_ref,f.coin_invoice_no,f.location,f.vehicle_desc].map(x=>String(x||'').toLowerCase()).join(' ').includes(q));
  // Sort: 'received' = created_at (when the fine entered the system, via email
  // intake or COIN import); 'offence' = the contravention date on the notice.
  const sort=document.getElementById('fine-sort')?.value||'received_desc';
  const ts=v=>{const t=new Date(v||0).getTime();return isNaN(t)?0:t;};
  const statusOrder=Object.fromEntries((typeof FINE_STATUSES!=='undefined'?FINE_STATUSES:[]).map(([k],i)=>[k,i]));
  const cmp={
    received_desc:(a,b)=>ts(b.created_at)-ts(a.created_at),
    received_asc:(a,b)=>ts(a.created_at)-ts(b.created_at),
    offence_desc:(a,b)=>ts(b.offence_datetime)-ts(a.offence_datetime),
    offence_asc:(a,b)=>ts(a.offence_datetime)-ts(b.offence_datetime),
    amount_desc:(a,b)=>(fineTotal(b)||0)-(fineTotal(a)||0),
    driver_asc:(a,b)=>String(a.driver_name||'zzz').localeCompare(String(b.driver_name||'zzz'),undefined,{sensitivity:'base'}),
    status:(a,b)=>(statusOrder[a.status]??99)-(statusOrder[b.status]??99)||ts(b.created_at)-ts(a.created_at)
  }[sort];
  if(cmp)rows.sort(cmp);
  return rows;
}
function renderFinesView(){
  const sf=document.getElementById('fine-status-filter');
  if(sf&&sf.options.length<2)sf.innerHTML='<option value="">All statuses</option>'+FINE_STATUSES.map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('');
  const so=document.getElementById('fine-sort');
  if(so&&!so.dataset.init){so.dataset.init='1';const saved=localStorage.getItem('covase_fine_sort');if(saved&&[...so.options].some(o=>o.value===saved))so.value=saved;}
  if(fineView==='dashboard')renderFinesDashboard();
  else if(fineView==='reports')renderFinesReports();
  else if(fineView==='kanban')renderFinesKanban();
  else renderFinesRegister();
}
function fineStatusBadge(s){const cls={new:'badge-requested',driver_notified:'badge-booked',address_requested:'badge-ordered',nominated:'badge-booked',on_coin:'badge-invoiced',to_be_charged:'badge-ordered',charged:'badge-paid',query:'badge-cancelled',appeal_upheld:'badge-active',refunded:'badge-paid',cancelled:'badge-cancelled'}[s]||'badge-unknown';return '<span class="badge '+cls+'">'+esc(FINE_STATUS_LABEL[s]||s)+'</span>';}
// ─── Fine card designer: field catalog + layout-driven register cards ───
const fineWhenTxt=f=>f.offence_datetime?new Date(f.offence_datetime).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const FINE_CARD_FIELDS=[
  {key:'driver_reg',label:'Driver · reg',get:f=>(f.driver_name||'Driver unknown')+' · '+(f.vehicle_reg||'—')},
  {key:'driver',label:'Driver',get:f=>f.driver_name||''},
  {key:'reg',label:'Vehicle reg',get:f=>f.vehicle_reg||''},
  {key:'vehicle_desc',label:'Vehicle description',get:f=>f.vehicle_desc||''},
  {key:'client',label:'Client account',get:f=>{const a=(allAccounts||[]).find(x=>x.id===f.client_account_id);return a?a.company_name:'';}},
  {key:'offence',label:'Offence type',get:f=>FINE_OFFENCE_LABEL[f.offence_type]||f.offence_type||''},
  {key:'offence_loc',label:'Offence — location',get:f=>(FINE_OFFENCE_LABEL[f.offence_type]||f.offence_type||'—')+(f.location?' — '+f.location:'')},
  {key:'location',label:'Location',get:f=>f.location||''},
  {key:'notice_class',label:'Notice class',get:f=>({pcn_private:'Private PCN',pcn_authority:'Authority PCN',noip:'NoIP'}[f.notice_class]||'')},
  {key:'offence_when',label:'Offence date/time',get:f=>fineWhenTxt(f)},
  {key:'received',label:'Received (into system)',get:f=>f.created_at?fmtD(String(f.created_at).slice(0,10)):''},
  {key:'source',label:'Source',get:f=>({lex:'Lex email',coin:'COIN import',manual:'Manual'}[f.source]||f.source||'')},
  {key:'issuer',label:'Issuer',get:f=>f.issuer||''},
  {key:'issuer_ref',label:'Issuer ref',get:f=>f.issuer_ref||''},
  {key:'pin',label:'PIN (nomination code)',get:f=>f.pin?'PIN '+f.pin:''},
  {key:'coin_no',label:'COIN invoice no',get:f=>f.coin_invoice_no||''},
  {key:'coin_date',label:'COIN invoice date',get:f=>f.coin_invoice_date?fmtD(String(f.coin_invoice_date).slice(0,10)):''},
  {key:'charge_month',label:'Charge month',get:f=>f.charge_month||''},
  {key:'total',label:'Total (£, incl admin)',money:true,get:f=>fmtMoney(fineTotal(f)||null)},
  {key:'fine_amount',label:'Fine amount (£)',money:true,get:f=>f.fine_amount!=null?fmtMoney(parseFloat(f.fine_amount)):''},
  {key:'full_amount',label:'Full amount (£, undiscounted)',money:true,get:f=>f.full_amount!=null?fmtMoney(parseFloat(f.full_amount)):''},
  {key:'admin_fee',label:'Admin fee (£)',money:true,get:f=>f.admin_fee!=null?fmtMoney(parseFloat(f.admin_fee)):''},
  {key:'status',label:'Status badge',get:f=>FINE_STATUS_LABEL[f.status]||f.status||''},
  {key:'appeal',label:'Appeal status',get:f=>f.appeal_status||''},
  {key:'pdf',label:'📄 PDF indicator',get:f=>f.pdf_url?'📄 Notice attached':''},
  {key:'notified',label:'Driver notified date',get:f=>f.driver_notified_at?'Notified '+fmtUK(String(f.driver_notified_at).slice(0,10)):''},
  {key:'nominated',label:'Nominated date',get:f=>f.nominated_at?'Nominated '+fmtUK(String(f.nominated_at).slice(0,10)):''},
  {key:'exported',label:'Exported to WT sheet',get:f=>f.exported_at?'Exported '+fmtUK(String(f.exported_at).slice(0,10)):''},
  {key:'notes',label:'Notes',get:f=>f.notes||''}
];
const FINE_FIELD_MAP=Object.fromEntries(FINE_CARD_FIELDS.map(f=>[f.key,f]));
const DEFAULT_FINE_CARD_LAYOUT={title:['driver_reg'],lines:[['offence_loc'],['offence_when','issuer','issuer_ref','coin_no','pdf']],right:['total','status']};
let fineCardLayout=null; // null → default layout (matches the original card)
const FINECD_SAMPLE={id:'sample',driver_name:'Jane Doe',vehicle_reg:'AB12 CDE',vehicle_desc:'Nissan Juke',offence_type:'parking',notice_class:'pcn_authority',location:'High St, Merton',offence_datetime:'2026-08-03T15:48:00Z',issuer:'London Borough of Merton',issuer_ref:'MN12345678',source:'lex',fine_amount:80,full_amount:160,admin_fee:15,status:'new',created_at:'2026-08-20',pdf_url:'x',notes:''};
async function loadFineCardLayout(){
  try{
    const rows=await sbReq('covase_config?key=eq.fine_card_layout&select=value');
    const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;
    if(v&&typeof v==='object'){
      const L=mvcdCloneLayout(v);
      const ok=k=>FINE_FIELD_MAP[mvKeyBase(k)]||mvIsLabelKey(mvKeyBase(k));
      L.title=L.title.filter(ok);L.right=L.right.filter(k=>FINE_FIELD_MAP[mvKeyBase(k)]);L.lines=L.lines.map(l=>l.filter(ok));
      fineCardLayout=L;
      if(Array.isArray(allFines)&&allFines.length)renderFinesView();
    }
  }catch(e){/* covase_config may not exist yet — keep default */}
}
function fineCardHtml(f){
  const L=fineCardLayout||DEFAULT_FINE_CARD_LAYOUT;
  const parts=keys=>mvResolvePartsHtml(keys,f,FINE_FIELD_MAP);
  const titleParts=parts(L.title);
  const title=titleParts.length?titleParts.join(' '):'—';
  const linesHtml=(Array.isArray(L.lines)?L.lines:[]).map((keys,i)=>{const p=parts(keys);return p.length?'<div style="font-size:11px;color:var(--'+(i===0?'n600':'n500')+');margin-top:2px">'+p.join(' ')+'</div>':'';}).join('');
  const rightHtml=(L.right||[]).map(k=>{
    const bk=mvKeyBase(k);const fld=FINE_FIELD_MAP[bk];if(!fld)return '';
    const v=fld.get(f);if(v===''||v==null)return '';
    const fs=mvFmtStyle(mvKeyFmt(k));
    if(bk==='status')return '<div style="margin-top:4px;'+fs+'">'+fineStatusBadge(f.status)+'</div>';
    if(fld.money)return '<div style="font-weight:700;font-size:13px;color:var(--covase);'+fs+'">'+esc(String(v))+'</div>';
    return '<div style="font-size:11px;color:var(--n600);margin-top:2px;'+fs+'">'+esc(String(v))+'</div>';
  }).filter(Boolean).join('');
  const right=rightHtml?'<div style="text-align:right;white-space:nowrap;flex-shrink:0">'+rightHtml+'</div>':'';
  return '<div class="card" onclick="openFineModal(\''+esc(f.id)+'\')">'
    +'<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">'
    +'<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px;color:var(--n800)">'+title+'</div>'+linesHtml+'</div>'
    +right+'</div></div>';
}
function renderFinesRegister(){
  const el=document.getElementById('fines-register');if(!el)return;
  const rows=finesFiltered();
  if(!rows.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">🎫</div><div class="empty-title">No fines'+((allFines||[]).length?' match':' yet')+'</div><div class="empty-sub">Import a COIN file or add a fine manually.</div></div>';return;}
  el.innerHTML=rows.map(fineCardHtml).join('');
}
// ── Fines kanban: workflow lanes + drag to change status + per-card advance ──
const FINE_KAN_MAIN=['new','driver_notified','address_requested','nominated','on_coin','to_be_charged','charged'];
const FINE_KAN_PARKED=['query','appeal_upheld','refunded','cancelled'];
const FINE_NEXT={new:'driver_notified',driver_notified:'address_requested',address_requested:'nominated',nominated:'on_coin',on_coin:'to_be_charged',to_be_charged:'charged'};
let fineKanDragId=null;
function fineKanCard(f){
  const next=FINE_NEXT[f.status];
  const advBtn=next?`<button class="kan-advance" onclick="event.stopPropagation();fineSetStatus('${esc(f.id)}','${next}')" title="Move to ${esc(FINE_STATUS_LABEL[next])}">→ ${esc(FINE_STATUS_LABEL[next])}</button>`:'';
  const fnMoveBtn=IS_TOUCH?`<button type="button" class="kan-move" onclick="openTapMove(event,'fine','${esc(f.id)}')" title="Move to another lane">⇄ Move</button>`:'';
  return `<div class="mv-kan-wrap" draggable="true" ondragstart="fineKanDragStart(event,'${esc(f.id)}')" ondragend="fineKanDragEnd(event)">${fineCardHtml(f)}${(advBtn||fnMoveBtn)?`<div class="mv-kan-actions">${fnMoveBtn}${advBtn}</div>`:''}</div>`;
}
function renderFinesKanban(){
  const wrap=document.getElementById('fines-kanban');if(!wrap)return;
  const rows=finesFiltered();
  const buckets={};rows.forEach(f=>{(buckets[f.status]=buckets[f.status]||[]).push(f);});
  const col=(s,extra)=>{
    const items=buckets[s]||[];
    return `<div class="kan-col${extra||''}" ondragover="fineKanAllow(event)" ondragleave="fineKanLeave(event)" ondrop="fineKanDrop(event,'${s}')">
      <div class="kan-col-header"><span class="kan-col-title">${esc(FINE_STATUS_LABEL[s]||s)}</span><span class="kan-col-count">${items.length}</span></div>
      <div class="kan-col-body">${items.map(fineKanCard).join('')||'<div style="font-size:11px;color:var(--n300);text-align:center;padding:14px 0">—</div>'}</div>
    </div>`;
  };
  let out=FINE_KAN_MAIN.map(s=>col(s)).join('');
  const parkedCount=FINE_KAN_PARKED.reduce((n,s)=>n+(buckets[s]||[]).length,0);
  out+=`<div style="grid-column:1/-1;margin-top:6px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${FINE_KAN_PARKED.map(s=>col(s)).join('')}</div>`;
  wrap.innerHTML=out;
}
function fineKanDragStart(e,id){fineKanDragId=id;try{e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';}catch(_){}}
function fineKanDragEnd(e){fineKanDragId=null;document.querySelectorAll('#fines-kanban .kan-col.mvkan-over').forEach(el=>el.classList.remove('mvkan-over'));}
function fineKanAllow(e){e.preventDefault();try{e.dataTransfer.dropEffect='move';}catch(_){}const c=e.currentTarget;if(c&&c.classList)c.classList.add('mvkan-over');}
function fineKanLeave(e){const c=e.currentTarget;if(c&&c.classList)c.classList.remove('mvkan-over');}
async function fineKanDrop(e,status){e.preventDefault();document.querySelectorAll('#fines-kanban .kan-col.mvkan-over').forEach(el=>el.classList.remove('mvkan-over'));const id=fineKanDragId;fineKanDragId=null;if(!id)return;await fineSetStatus(id,status);}
async function fineSetStatus(id,status){
  const f=(allFines||[]).find(x=>x.id===id);if(!f||f.status===status)return;
  const prev=f.status;const now=new Date().toISOString();
  const patch={status:status,updated_at:now};
  // Landing in a milestone stamps its date if not already set (mirrors the modal flows)
  if(status==='driver_notified'&&!f.driver_notified_at)patch.driver_notified_at=now;
  if(status==='address_requested'&&!f.address_requested_at)patch.address_requested_at=now;
  if(status==='nominated'&&!f.nominated_at)patch.nominated_at=now;
  Object.assign(f,patch);
  renderFinesView();updateFineStats();
  try{await sbReq('covase_fines?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:patch,prefer:'return=minimal'});toast('Moved to '+(FINE_STATUS_LABEL[status]||status),'success');}
  catch(e2){f.status=prev;renderFinesView();updateFineStats();toast('Update failed: '+e2.message,'error');}
}
// ── Fine modal ──
let editFineId=null;
function openFineModal(id){
  editFineId=id||null;
  const f=id?(allFines||[]).find(x=>x.id===id):null;
  document.getElementById('fine-modal-title').textContent=f?('Fine — '+(f.vehicle_reg||'')+' '+(f.issuer_ref||'')):'New fine / penalty';
  const ss=document.getElementById('ff-status');
  if(ss.options.length<2)ss.innerHTML=FINE_STATUSES.map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('');
  const cs=document.getElementById('ff-client');
  cs.innerHTML='<option value="">—</option>'+(allAccounts||[]).filter(a=>(a.type||'client')==='client').map(a=>'<option value="'+esc(a.id)+'">'+esc(a.company_name)+'</option>').join('');
  const dl=document.getElementById('ff-driver-list');
  if(dl)dl.innerHTML=(allContacts||[]).map(c=>'<option value="'+esc(((c.first_name||'')+' '+(c.last_name||'')).trim())+'">').join('');
  const v=(id2,val)=>{const e=document.getElementById(id2);if(e)e.value=val==null?'':val;};
  v('ff-status',f?.status||'new');v('ff-offence',f?.offence_type||'parking');v('ff-class',f?.notice_class||'');
  v('ff-issuer',f?.issuer);v('ff-ref',f?.issuer_ref);v('ff-portal',f?.issuer_portal);v('ff-pin',f?.pin);v('ff-location',f?.location);
  v('ff-when',f?.offence_datetime?String(new Date(f.offence_datetime).toISOString()).slice(0,16):'');
  v('ff-reg',f?.vehicle_reg);v('ff-vehdesc',f?.vehicle_desc);v('ff-driver',f?.driver_name);v('ff-client',f?.client_account_id||'');
  v('ff-fine',f?.fine_amount);v('ff-fine-vat',f?.fine_vat);v('ff-admin',f?f.admin_fee:15);v('ff-admin-vat',f?.admin_fee_vat);
  v('ff-coin',f?.coin_invoice_no);v('ff-coin-date',f?.coin_invoice_date?String(f.coin_invoice_date).slice(0,10):'');v('ff-charge-month',f?.charge_month);
  v('ff-appeal',f?.appeal_status||'');v('ff-notes',f?.notes);
  const tl=[];
  if(f?.driver_notified_at)tl.push('Driver notified '+fmtUK(String(f.driver_notified_at).slice(0,10)));
  if(f?.address_requested_at)tl.push('Address requested '+fmtUK(String(f.address_requested_at).slice(0,10)));
  if(f?.nominated_at)tl.push('Nominated '+fmtUK(String(f.nominated_at).slice(0,10)));
  if(f?.exported_at)tl.push('Exported to WT sheet '+fmtUK(String(f.exported_at).slice(0,10)));
  document.getElementById('ff-timeline').textContent=tl.join(' · ');
  document.getElementById('ff-delete-btn').style.display=id?'':'none';
  const pb=document.getElementById('ff-pdf-btn');
  if(pb){if(f&&f.pdf_url){pb.style.display='';pb.href=f.pdf_url;}else pb.style.display='none';}
  document.getElementById('fine-modal').classList.add('open');
}
function closeFineModal(){fpvClose();document.getElementById('fine-modal').classList.remove('open');}
function fineFormPayload(){
  const g=id=>document.getElementById(id)?.value||'';
  const num=id=>{const n=parseFloat(g(id));return isNaN(n)?null:n;};
  const nm=g('ff-driver').trim();
  // link driver contact by name (nickname/prefix aware — reuses claims helpers)
  let dcid=null;
  if(nm){const hits=(allContacts||[]).filter(ct=>clmLastTok(ct.last_name||'')===clmLastTok(nm)&&clmFirstNamesMatch(clmFirstTok(ct.first_name||''),clmFirstTok(nm)));if(hits.length===1)dcid=hits[0].id;}
  const reg=g('ff-reg').replace(/\s+/g,'').toUpperCase()||null;
  const veh=reg?(allVehicles||[]).find(x=>normReg(x.reg)===reg):null;
  return {
    status:g('ff-status')||'new',offence_type:g('ff-offence')||null,notice_class:g('ff-class')||null,
    issuer:g('ff-issuer').trim()||null,issuer_ref:g('ff-ref').trim()||null,issuer_portal:g('ff-portal').trim()||null,pin:g('ff-pin').trim()||null,
    location:g('ff-location').trim()||null,
    offence_datetime:g('ff-when')?new Date(g('ff-when')).toISOString():null,
    vehicle_reg:reg,vehicle_desc:g('ff-vehdesc').trim()||null,
    driver_name:nm||null,driver_contact_id:dcid,vehicle_id:veh?veh.id:null,
    client_account_id:g('ff-client')||null,
    fine_amount:num('ff-fine'),fine_vat:num('ff-fine-vat'),admin_fee:num('ff-admin'),admin_fee_vat:num('ff-admin-vat'),
    coin_invoice_no:g('ff-coin').trim()||null,coin_invoice_date:g('ff-coin-date')||null,charge_month:g('ff-charge-month').trim()||null,
    appeal_status:g('ff-appeal')||null,notes:g('ff-notes').trim()||null,
    updated_at:new Date().toISOString()
  };
}
async function saveFine(){
  const p=fineFormPayload();
  try{
    if(editFineId){
      await sbReq('covase_fines?id=eq.'+encodeURIComponent(editFineId),{method:'PATCH',body:p,prefer:'return=minimal'});
      const i=(allFines||[]).findIndex(x=>x.id===editFineId);if(i>=0)allFines[i]={...allFines[i],...p};
      toast('Fine updated','success');
    }else{
      const id='fp-'+Date.now();
      await sbReq('covase_fines',{method:'POST',body:{...p,id:id},prefer:'return=minimal'});
      allFines.unshift({...p,id:id,created_at:new Date().toISOString()});
      toast('Fine saved','success');
    }
    closeFineModal();updateFineStats();renderFinesView();
  }catch(e){toast('Save failed: '+e.message,'error');}
}
async function deleteFine(){
  if(!editFineId||!confirm('Delete this fine record? Cannot be undone.'))return;
  try{await sbReq('covase_fines?id=eq.'+encodeURIComponent(editFineId),{method:'DELETE',prefer:'return=minimal'});allFines=allFines.filter(x=>x.id!==editFineId);closeFineModal();updateFineStats();renderFinesView();toast('Fine deleted','success');}
  catch(e){toast('Delete failed: '+e.message,'error');}
}
// ── Driver emails (review-first: preview → copy/mail app → mark sent) ──
let _fineEmailKind=null;
function fineTokens(f){
  const first=(f.driver_name||'').trim().split(/\s+/)[0]||'there';
  return {firstName:first,driverName:f.driver_name||'',fineAmount:(parseFloat(f.fine_amount)||0).toFixed(2),adminFee:(parseFloat(f.admin_fee)||15).toFixed(2),regNo:f.vehicle_reg||'',vehicleDesc:f.vehicle_desc||'',issuer:f.issuer||'',location:f.location||'',offenceDate:f.offence_datetime?new Date(f.offence_datetime).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'',ref:f.issuer_ref||'',pin:f.pin||'',portal:f.issuer_portal||''};
}
function fineRender(tpl,t){return String(tpl||'').replace(/\{(\w+)\}/g,(m,k)=>t[k]!=null?t[k]:'');}
function fineEmail(kind){
  const f=editFineId?(allFines||[]).find(x=>x.id===editFineId):null;
  if(!f){toast('Save the fine first','error');return;}
  _fineEmailKind=kind;
  const t=fineTokens(f);
  const subj=fineRender(kind==='speeding'?fineTemplates.spSubject:fineTemplates.apSubject,t);
  let body=fineRender(kind==='speeding'?fineTemplates.spBody:fineTemplates.apBody,t);
  // mailto: cannot attach files — link the stored notice PDF instead.
  // (mailto drafts are plain text, so the URL itself must appear; Outlook
  // renders it clickable automatically.)
  if(f.pdf_url)body+='\n\nYou can view and download a copy of the fine by clicking this link:\n'+f.pdf_url;
  const ct=f.driver_contact_id?(allContacts||[]).find(c=>c.id===f.driver_contact_id):null;
  const to=ct&&ct.email?ct.email:'';
  document.getElementById('fpe-title').textContent=(kind==='speeding'?'Speeding / nomination email':'Auto-pay notification email');
  document.getElementById('fpe-meta').textContent='To: '+(to||'⚠ no email on contact — add one or paste manually')+' · CC: '+(fineTemplates.cc||'—')+' · Subject: '+subj;
  document.getElementById('fpe-body').textContent=body;
  const m=document.getElementById('fpe-mailto');
  m.href='mailto:'+encodeURIComponent(to)+'?cc='+encodeURIComponent(fineTemplates.cc||'')+'&subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
  document.getElementById('fine-email-modal').classList.add('open');
}
function fpeCopy(){const b=document.getElementById('fpe-body').textContent;navigator.clipboard&&navigator.clipboard.writeText(b).then(()=>toast('Email text copied','success'),()=>toast('Copy failed','error'));}
async function fpeMarkSent(){
  const f=(allFines||[]).find(x=>x.id===editFineId);if(!f)return;
  const now=new Date().toISOString();
  const patch=_fineEmailKind==='speeding'?{status:'address_requested',address_requested_at:now,driver_notified_at:f.driver_notified_at||now,updated_at:now}:{status:'driver_notified',driver_notified_at:now,updated_at:now};
  try{await sbReq('covase_fines?id=eq.'+encodeURIComponent(f.id),{method:'PATCH',body:patch,prefer:'return=minimal'});Object.assign(f,patch);document.getElementById('fine-email-modal').classList.remove('open');openFineModal(f.id);updateFineStats();renderFinesView();toast('Marked as sent','success');}
  catch(e){toast('Update failed: '+e.message,'error');}
}
function fineNominationPack(){
  const f=editFineId?(allFines||[]).find(x=>x.id===editFineId):null;
  if(!f){toast('Save the fine first','error');return;}
  const ct=f.driver_contact_id?(allContacts||[]).find(c=>c.id===f.driver_contact_id):null;
  const lines=['NOMINATION PACK — '+(f.issuer_ref||''),'','Issuer: '+(f.issuer||'—'),'Portal: '+(f.issuer_portal||'— (see notice)'),'Notice ref: '+(f.issuer_ref||'—'),'Offence: '+(FINE_OFFENCE_LABEL[f.offence_type]||'—')+' at '+(f.location||'—'),'Date/time: '+(f.offence_datetime?new Date(f.offence_datetime).toLocaleString('en-GB'):'—'),'Vehicle: '+(f.vehicle_reg||'—')+' '+(f.vehicle_desc||''),'','DRIVER','Name: '+(f.driver_name||'—'),'Email: '+(ct&&ct.email?ct.email:'—'),'Mobile: '+(ct&&ct.mobile?ct.mobile:'—'),'Address: '+(ct&&ct.address?ct.address:'⚠ NOT CONFIRMED — request via speeding email'),'Address confirmed: '+(f.address_confirmed_at?fmtUK(String(f.address_confirmed_at).slice(0,10)):'NO')].join('\n');
  document.getElementById('fpe-title').textContent='Nomination pack';
  document.getElementById('fpe-meta').textContent='Submit on the issuer portal, then click "Mark as sent" to set status → Nominated';
  document.getElementById('fpe-body').textContent=lines;
  document.getElementById('fpe-mailto').href='#';
  _fineEmailKind='nominate';
  document.getElementById('fine-email-modal').classList.add('open');
}

// ── In-app PDF viewer: fine modal slides left, notice renders beside it.
// Wheel = zoom (centred on cursor), drag = pan, ‹ › = pages, Fit = fit width.
let fpv={pdf:null,page:1,pages:0,scale:null,timer:null};
function loadPdfJs(){
  return new Promise((res,rej)=>{
    if(window.pdfjsLib)return res();
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';res();};
    s.onerror=()=>rej(new Error('PDF viewer library failed to load'));
    document.head.appendChild(s);
  });
}
async function openFinePdfPanel(e){
  if(e)e.preventDefault();
  const f=editFineId?(allFines||[]).find(x=>x.id===editFineId):null;
  if(!f||!f.pdf_url){toast('No notice stored for this fine','error');return;}
  try{await loadPdfJs();}
  catch(err){window.open(f.pdf_url,'_blank');return;} // graceful fallback
  document.getElementById('fine-modal').classList.add('pdf-open');
  document.getElementById('fine-pdf-panel').style.display='flex';
  document.getElementById('fpv-tab').href=f.pdf_url;
  document.getElementById('fpv-pageinfo').textContent='Loading…';
  fpv={pdf:null,page:1,pages:0,scale:null,timer:null};
  try{
    fpv.pdf=await pdfjsLib.getDocument(f.pdf_url).promise;
    fpv.pages=fpv.pdf.numPages;
    await fpvRender();
  }catch(err){toast('Could not load the notice: '+err.message,'error');fpvClose();}
}
async function fpvRender(){
  if(!fpv.pdf)return;
  const page=await fpv.pdf.getPage(fpv.page);
  const scroll=document.getElementById('fpv-scroll');
  if(fpv.scale==null){const v1=page.getViewport({scale:1});fpv.scale=Math.max(0.2,(scroll.clientWidth-40)/v1.width);}
  const dpr=window.devicePixelRatio||1;
  const vp=page.getViewport({scale:fpv.scale});
  const canvas=document.getElementById('fpv-canvas');
  canvas.width=Math.floor(vp.width*dpr);canvas.height=Math.floor(vp.height*dpr);
  canvas.style.width=Math.floor(vp.width)+'px';canvas.style.height=Math.floor(vp.height)+'px';
  await page.render({canvasContext:canvas.getContext('2d'),viewport:page.getViewport({scale:fpv.scale*dpr})}).promise;
  document.getElementById('fpv-pageinfo').textContent='Page '+fpv.page+' / '+fpv.pages;
  document.getElementById('fpv-zoom').textContent=Math.round(fpv.scale*100)+'%';
}
function fpvPage(d){if(!fpv.pdf)return;const n=fpv.page+d;if(n<1||n>fpv.pages)return;fpv.page=n;fpvRender();}
function fpvZoomTo(s,cx,cy){
  if(!fpv.pdf)return;
  const scroll=document.getElementById('fpv-scroll');
  const old=fpv.scale||1;
  fpv.scale=Math.min(6,Math.max(0.2,s));
  document.getElementById('fpv-zoom').textContent=Math.round(fpv.scale*100)+'%';
  const k=fpv.scale/old;
  const ax=scroll.scrollLeft+(cx!=null?cx:scroll.clientWidth/2);
  const ay=scroll.scrollTop+(cy!=null?cy:scroll.clientHeight/2);
  clearTimeout(fpv.timer);
  fpv.timer=setTimeout(async()=>{
    await fpvRender();
    scroll.scrollLeft=ax*k-(cx!=null?cx:scroll.clientWidth/2);
    scroll.scrollTop=ay*k-(cy!=null?cy:scroll.clientHeight/2);
  },80);
}
function fpvZoomBtn(m){fpvZoomTo((fpv.scale||1)*m);}
function fpvFit(){fpv.scale=null;fpvRender();}
function fpvClose(){
  document.getElementById('fine-modal').classList.remove('pdf-open');
  document.getElementById('fine-pdf-panel').style.display='none';
  fpv.pdf=null;
}
function initFinePdfViewer(){
  const scroll=document.getElementById('fpv-scroll');if(!scroll)return;
  scroll.addEventListener('wheel',e=>{
    if(!fpv.pdf)return;
    e.preventDefault();
    const r=scroll.getBoundingClientRect();
    fpvZoomTo((fpv.scale||1)*(e.deltaY<0?1.12:0.9),e.clientX-r.left,e.clientY-r.top);
  },{passive:false});
  let drag=null;
  scroll.addEventListener('mousedown',e=>{drag={x:e.clientX,y:e.clientY,sl:scroll.scrollLeft,st:scroll.scrollTop};scroll.classList.add('dragging');e.preventDefault();});
  window.addEventListener('mousemove',e=>{if(!drag)return;scroll.scrollLeft=drag.sl-(e.clientX-drag.x);scroll.scrollTop=drag.st-(e.clientY-drag.y);});
  window.addEventListener('mouseup',()=>{drag=null;scroll.classList.remove('dragging');});
}

// ── COIN import: parse Lex's consolidated invoice xlsx, keep Motoring Offences
// rows, pair fine + fee lines, extract issuer/location/date/ref from the text,
// match driver/vehicle, and merge into the register (fills, never overwrites).
function fineClassify(text){
  const t=String(text||'').toLowerCase();
  if(/speed/.test(t))return 'speeding';
  if(/bus lane|bus-lane/.test(t))return 'bus_lane';
  if(/congestion/.test(t))return 'congestion';
  if(/toll|dartford|crossing|tunnel|humber bridge/.test(t))return 'toll';
  if(/route|restricted|red route/.test(t))return 'route';
  if(/parking/.test(t))return 'parking';
  return 'other';
}
function fineParseText(txt){
  const s=String(txt||'').replace(/\s+/g,' ');
  const grab=re=>{const m=s.match(re);return m?m[1].trim():null;};
  const dt=grab(/Date\/Time:\s*(\d{1,2}\s+\w{3}\s+\d{4}\s+\d{1,2}:\d{2})/i);
  let iso=null;
  if(dt){const d=new Date(dt);if(!isNaN(d))iso=d.toISOString();}
  return {
    issuer:grab(/Issued By:\s*([^\/]+?)(?:\/|\(|Location|$)/i),
    location:grab(/Location:\s*(.+?)(?:\s*Date\/Time|\s*Ref|$)/i),
    when:iso,
    driver:(()=>{const d=grab(/Driver:\s*(.+?)(?:\s*Ref|\s*Charge|$)/i);return d&&!/not assigned/i.test(d)?d:null;})(),
    ref:(()=>{let r=grab(/Ref\s*(?:No)?\s*:?\s*([A-Za-z0-9\/-]{4,})/i);if(r)r=r.replace(/\/(Processing|Private|Fee).*$/i,'');return r;})(),
    charge:(()=>{const m=s.match(/Charge:\s*£?([\d,.]+)/i);return m?parseFloat(m[1].replace(/,/g,'')):null;})(),
    fee:(()=>{const m=s.match(/Fee:\s*£?([\d,.]+)/i);return m?parseFloat(m[1].replace(/,/g,'')):null;})()
  };
}
async function importCoinFile(file){
  if(!file)return;
  toast('Reading '+file.name+'…','success');
  try{
    await loadSheetJS();
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const src=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:null});
    const mo=src.filter(r=>/motoring offences/i.test(String(r.DOC_TYPE_DESC||'')));
    if(!mo.length){toast('No Motoring Offences rows found in that file','error');return;}
    const invDate=prompt('COIN invoice date (YYYY-MM-DD)? Leave blank to skip.');
    const chargeMonth=prompt('Charge month for the WT sheet (e.g. "Sep 26")? Leave blank to set later.');
    // group fine + fee lines: key = reg | extracted ref (fallback reg | datetime)
    const groups=new Map();
    mo.forEach(r=>{
      const p=fineParseText(r.INVOICE_TEXT);
      const key=String(r.REG_NO||'')+'|'+(p.ref||p.when||'');
      if(!groups.has(key))groups.set(key,{rows:[],p:p,reg:r.REG_NO,inv:r.INVOICE_NO||r.INVOICE_N||Object.values(r)[0]});
      const g=groups.get(key);g.rows.push(r);
      if(!g.p.ref&&p.ref)g.p=p;
    });
    let added=0,updated=0;
    for(const g of groups.values()){
      const fee=g.rows.find(r=>/fee/i.test(String(r.DOC_TYPE_DESC||'')));
      const fine=g.rows.find(r=>!/fee/i.test(String(r.DOC_TYPE_DESC||'')));
      const base=fine||fee;const p=g.p;
      const reg=String(g.reg||'').replace(/\s+/g,'').toUpperCase()||null;
      const drvName=p.driver||String(base.DRIVER_NAME||'').trim()||null;
      let dcid=null;
      if(drvName){const hits=(allContacts||[]).filter(ct=>clmLastTok(ct.last_name||'')===clmLastTok(drvName)&&clmFirstNamesMatch(clmFirstTok(ct.first_name||''),clmFirstTok(drvName)));if(hits.length===1)dcid=hits[0].id;}
      const veh=reg?(allVehicles||[]).find(x=>normReg(x.reg)===reg):null;
      const otype=fineClassify(String(base.INVOICE_TEXT||''));
      const rec={
        source:'lex',offence_type:otype,
        notice_class:otype==='speeding'?'noip':(/ltd|limited|parking eye|horizon|premier/i.test(p.issuer||'')?'pcn_private':'pcn_authority'),
        issuer:p.issuer,issuer_ref:p.ref,location:p.location,offence_datetime:p.when,
        vehicle_reg:reg,vehicle_desc:String(base.VEHICLE_DESC||'').trim()||null,
        driver_name:drvName,driver_contact_id:dcid,vehicle_id:veh?veh.id:null,
        fine_amount:fine?(parseFloat(fine.NET)||p.charge||null):null,
        fine_vat:fine?(parseFloat(fine.VAT)||0):null,
        admin_fee:fee?(parseFloat(fee.NET)||null):null,
        admin_fee_vat:fee?(parseFloat(fee.VAT)||0):null,
        coin_invoice_no:String(base.INVOICE_NO||base.INVOICE_N||g.inv||'').trim()||null,
        coin_invoice_date:invDate||null,charge_month:chargeMonth||null,
        raw:{rows:g.rows},updated_at:new Date().toISOString()
      };
      // merge: existing record for same ref+reg (or reg+datetime) gets COIN data
      // filled in and moves to on_coin; links are FILLED, never overwritten
      const ex=(allFines||[]).find(x=>(rec.issuer_ref&&x.issuer_ref===rec.issuer_ref&&x.vehicle_reg===reg)||(rec.offence_datetime&&x.vehicle_reg===reg&&x.offence_datetime&&Math.abs(new Date(x.offence_datetime)-new Date(rec.offence_datetime))<60000));
      if(ex){
        const patch={coin_invoice_no:rec.coin_invoice_no,coin_invoice_date:rec.coin_invoice_date,updated_at:rec.updated_at};
        if(!ex.charge_month&&rec.charge_month)patch.charge_month=rec.charge_month;
        ['fine_amount','fine_vat','admin_fee','admin_fee_vat','issuer','location','driver_name','driver_contact_id','vehicle_id','vehicle_desc'].forEach(k=>{if(ex[k]==null&&rec[k]!=null)patch[k]=rec[k];});
        if(['new','driver_notified','address_requested','nominated'].includes(ex.status))patch.status='on_coin';
        try{await sbReq('covase_fines?id=eq.'+encodeURIComponent(ex.id),{method:'PATCH',body:patch,prefer:'return=minimal'});Object.assign(ex,patch);updated++;}catch(e){}
      }else{
        const id='fp-'+Date.now()+'-'+added;
        try{await sbReq('covase_fines',{method:'POST',body:{...rec,id:id,status:'on_coin'},prefer:'return=minimal'});allFines.unshift({...rec,id:id,status:'on_coin',created_at:new Date().toISOString()});added++;}catch(e){toast('Row failed ('+(reg||'?')+'): '+e.message,'error');}
      }
    }
    toast('COIN processed: '+added+' new, '+updated+' matched to existing ('+groups.size+' offences from '+mo.length+' invoice lines)','success');
    updateFineStats();renderFinesView();
  }catch(e){toast('Import failed: '+e.message,'error');}
}
// ── WT Teams sheet export (exact column format; grouped by COIN) ──
async function exportWtSheet(){
  const rows=(allFines||[]).filter(f=>['on_coin','to_be_charged','query'].includes(f.status)&&f.coin_invoice_no);
  if(!rows.length){toast('Nothing to export — no fines in On COIN / To be charged / Query with a COIN number','error');return;}
  await loadSheetJS();
  const byCoin={};rows.forEach(f=>{(byCoin[f.coin_invoice_no]=byCoin[f.coin_invoice_no]||[]).push(f);});
  const aoa=[['Status','COIN','Driver','Type','Date of offence','Invoice','Admin','Admin VAT','Fine/Charge','Fine/Charge VAT']];
  Object.keys(byCoin).sort().forEach(coin=>{
    byCoin[coin].forEach(f=>{
      const status=f.status==='query'?'Parked - SH to query':('To be charged '+(f.charge_month||''));
      const type=(FINE_OFFENCE_LABEL[f.offence_type]||'')+(f.location?' - '+f.location:'');
      aoa.push([status,coin,f.driver_name||'',type,f.offence_datetime?fmtUK(String(new Date(f.offence_datetime).toISOString()).slice(0,10)):'',f.coin_invoice_date?fmtUK(String(f.coin_invoice_date).slice(0,10)):'',parseFloat(f.admin_fee)||'',parseFloat(f.admin_fee_vat)||'',parseFloat(f.fine_amount)||'',parseFloat(f.fine_vat)||'']);
    });
    aoa.push([]); // blank row between COINs, matching the WT sheet convention
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:22},{wch:12},{wch:20},{wch:52},{wch:12},{wch:12},{wch:9},{wch:9},{wch:11},{wch:12}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Fines');
  XLSX.writeFile(wb,'WT-fines-export-'+new Date().toISOString().slice(0,10)+'.xlsx');
  const now=new Date().toISOString();
  const ids=rows.map(f=>'"'+f.id+'"').join(',');
  try{await sbReq('covase_fines?id=in.('+encodeURIComponent(ids)+')',{method:'PATCH',body:{exported_at:now},prefer:'return=minimal'});rows.forEach(f=>f.exported_at=now);}catch(e){}
  toast('Exported '+rows.length+' rows across '+Object.keys(byCoin).length+' COINs','success');
}
// ── Configurable dashboard ──
const DEFAULT_FINE_DASH=[{m:'count',g:'offence_type'},{m:'total',g:'driver'},{m:'total',g:'month'},{m:'count',g:'status'}];
async function loadFineDash(){try{const rows=await sbReq('covase_config?key=eq.fines_dashboard&select=value');const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;fineDashCfg=Array.isArray(v)?v:DEFAULT_FINE_DASH.slice();}catch(e){fineDashCfg=DEFAULT_FINE_DASH.slice();}}
function fineDashSave(){sbReq('covase_config',{method:'POST',body:{key:'fines_dashboard',value:fineDashCfg,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'}).catch(e=>toast('Dashboard save failed: '+e.message,'error'));}
const FINE_METRICS={count:{label:'Number of fines',fn:rows=>rows.length,fmt:v=>String(v)},total:{label:'Total cost (£)',fn:rows=>rows.reduce((s,f)=>s+fineTotal(f),0),fmt:v=>fmtMoney(v)},fines:{label:'Fine amounts (£)',fn:rows=>rows.reduce((s,f)=>s+(parseFloat(f.fine_amount)||0),0),fmt:v=>fmtMoney(v)},admin:{label:'Admin fees (£)',fn:rows=>rows.reduce((s,f)=>s+(parseFloat(f.admin_fee)||0),0),fmt:v=>fmtMoney(v)}};
const FINE_GROUPS={driver:{label:'Driver',key:f=>f.driver_name||'Unknown'},offence_type:{label:'Offence type',key:f=>FINE_OFFENCE_LABEL[f.offence_type]||'Other'},status:{label:'Status',key:f=>FINE_STATUS_LABEL[f.status]||f.status},month:{label:'Month of offence',key:f=>f.offence_datetime?String(f.offence_datetime).slice(0,7):'Unknown'},client:{label:'Client',key:f=>{const a=(allAccounts||[]).find(x=>x.id===f.client_account_id);return a?a.company_name:'—';}},issuer:{label:'Issuer',key:f=>f.issuer||'Unknown'},reg:{label:'Vehicle reg',key:f=>f.vehicle_reg||'—'}};
const FINE_CHART_TYPES={bars:'Bars',columns:'Columns',donut:'Donut',line:'Line',stat:'Stat tile'};
const FINE_PALETTE=['#03d3c6','#6d5ef2','#f59e0b','#ef4444','#10b981','#3b82f6','#ec4899','#8b5cf6','#64748b','#f97316'];
function fineWidgetBody(w,rows){
  const M=FINE_METRICS[w.m]||FINE_METRICS.count,G=FINE_GROUPS[w.g]||FINE_GROUPS.offence_type;
  const t=w.t||'bars';
  if(t==='stat'){
    const v=M.fn(rows);
    return '<div style="font-family:var(--font-head);font-size:34px;font-weight:800;color:var(--covase);margin:6px 0 2px">'+esc(M.fmt(v))+'</div><div style="font-size:11px;color:var(--n500)">across '+rows.length+' fines</div>';
  }
  const by={};rows.forEach(f=>{const k=G.key(f);(by[k]=by[k]||[]).push(f);});
  let entries=Object.entries(by).map(([k,v])=>[k,M.fn(v)]);
  entries=(t==='line'||w.g==='month')?entries.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))):entries.sort((a,b)=>b[1]-a[1]);
  entries=entries.slice(0,t==='donut'?6:(t==='columns'?10:(w.topN||8)));
  if(!entries.length)return '<div style="font-size:12px;color:var(--n400)">No data</div>';
  const max=Math.max(...entries.map(e=>e[1]),1);
  if(t==='columns'){
    return '<div style="display:flex;align-items:flex-end;gap:6px;height:130px;padding-top:6px">'
      +entries.map(([k,v],i)=>'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0"><div style="font-size:9px;color:var(--n500)">'+esc(M.fmt(v))+'</div><div style="width:100%;border-radius:4px 4px 0 0;background:'+FINE_PALETTE[i%FINE_PALETTE.length]+';height:'+Math.max(4,Math.round(v/max*88))+'px"></div><div style="font-size:9px;color:var(--n500);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(k)+'">'+esc(k)+'</div></div>').join('')+'</div>';
  }
  if(t==='donut'){
    const total=entries.reduce((s,e)=>s+e[1],0)||1;
    const R=42,C=2*Math.PI*R;let off=0;
    const segs=entries.map(([k,v],i)=>{
      const len=v/total*C;
      const s='<circle r="'+R+'" cx="60" cy="60" fill="none" stroke="'+FINE_PALETTE[i%FINE_PALETTE.length]+'" stroke-width="16" stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)+'" stroke-dashoffset="'+(-off).toFixed(2)+'" transform="rotate(-90 60 60)"/>';
      off+=len;return s;
    }).join('');
    const legend=entries.map(([k,v],i)=>'<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--n600);margin:2px 0"><span style="width:9px;height:9px;border-radius:2px;background:'+FINE_PALETTE[i%FINE_PALETTE.length]+';flex-shrink:0"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(k)+'">'+esc(k)+'</span><span style="color:var(--n500)">'+esc(M.fmt(v))+' · '+Math.round(v/total*100)+'%</span></div>').join('');
    return '<div style="display:flex;gap:14px;align-items:center"><svg viewBox="0 0 120 120" style="width:120px;height:120px;flex-shrink:0">'+segs+'</svg><div style="flex:1;min-width:0">'+legend+'</div></div>';
  }
  if(t==='line'){
    const W=300,H=110,pad=8;
    const pts=entries.map(([k,v],i)=>{
      const x=entries.length>1?pad+i*(W-2*pad)/(entries.length-1):W/2;
      const y=H-pad-(v/max)*(H-2*pad-14);
      return {x,y,k,v};
    });
    const poly=pts.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
    const dots=pts.map(p=>'<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="#03d3c6"><title>'+esc(p.k)+': '+esc(M.fmt(p.v))+'</title></circle>').join('');
    const step=Math.max(1,Math.ceil(entries.length/6));
    const labels=pts.filter((_,i)=>i%step===0||i===pts.length-1).map(p=>'<text x="'+p.x.toFixed(1)+'" y="'+(H-1)+'" font-size="8" fill="#8b93a7" text-anchor="middle">'+esc(String(p.k).slice(-5))+'</text>').join('');
    return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:130px"><polyline points="'+poly+'" fill="none" stroke="#03d3c6" stroke-width="2"/>'+dots+labels+'</svg>';
  }
  return entries.map(([k,v])=>clmBar(k,v,max,M.fmt(v))).join(''); // bars (default)
}
function renderFinesDashboard(){
  const el=document.getElementById('fines-dashboard');if(!el)return;
  if(!fineDashCfg){loadFineDash().then(renderFinesDashboard);return;}
  const rows=finesFiltered().filter(f=>f.status!=='cancelled');
  const widgets=fineDashCfg.map((w,i)=>{
    const M=FINE_METRICS[w.m]||FINE_METRICS.count,G=FINE_GROUPS[w.g]||FINE_GROUPS.offence_type;
    const title=(w.t==='stat')?M.label:(M.label+' by '+G.label);
    return '<div class="clm-dash-card"><div style="display:flex;justify-content:space-between;align-items:center"><div class="clm-dash-title">'+esc(title)+'</div><span class="x" style="cursor:pointer;color:var(--n300);font-size:12px" title="Remove widget" onclick="fineDashCfg.splice('+i+',1);fineDashSave();renderFinesDashboard()">✕</span></div>'+fineWidgetBody(w,rows)+'</div>';
  }).join('');
  const mOpts=Object.entries(FINE_METRICS).map(([k,m])=>'<option value="'+k+'">'+esc(m.label)+'</option>').join('');
  const gOpts=Object.entries(FINE_GROUPS).map(([k,g])=>'<option value="'+k+'">'+esc(g.label)+'</option>').join('');
  const tOpts=Object.entries(FINE_CHART_TYPES).map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('');
  el.innerHTML='<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><span style="font-size:11px;color:var(--n500);font-weight:700">ADD WIDGET:</span>'
    +'<select id="fdw-m" style="font-size:12px;padding:5px;border:1px solid var(--n200);border-radius:6px">'+mOpts+'</select>'
    +'<span style="font-size:11px;color:var(--n500)">by</span>'
    +'<select id="fdw-g" style="font-size:12px;padding:5px;border:1px solid var(--n200);border-radius:6px">'+gOpts+'</select>'
    +'<span style="font-size:11px;color:var(--n500)">as</span>'
    +'<select id="fdw-t" style="font-size:12px;padding:5px;border:1px solid var(--n200);border-radius:6px">'+tOpts+'</select>'
    +'<button class="topbar-btn" onclick="fineDashCfg.push({m:document.getElementById(\'fdw-m\').value,g:document.getElementById(\'fdw-g\').value,t:document.getElementById(\'fdw-t\').value});fineDashSave();renderFinesDashboard()">＋ Add</button></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+widgets+'</div>';
}
// ── Report builder: pick columns, group with subtotals, sort, save named
// report definitions (shared via covase_config 'fines_reports') → XLSX/PDF ──
const FINE_REPORT_FIELDS=[
  {k:'driver',l:'Driver',get:f=>f.driver_name||'—'},
  {k:'reg',l:'Reg',get:f=>f.vehicle_reg||'—'},
  {k:'type',l:'Type',get:f=>FINE_OFFENCE_LABEL[f.offence_type]||'—'},
  {k:'location',l:'Location',get:f=>f.location||'—'},
  {k:'issuer',l:'Issuer',get:f=>f.issuer||'—'},
  {k:'ref',l:'Ref',get:f=>f.issuer_ref||'—'},
  {k:'offence',l:'Offence date',get:f=>f.offence_datetime?fmtUK(String(new Date(f.offence_datetime).toISOString()).slice(0,10)):'—',sv:f=>String(f.offence_datetime||'')},
  {k:'coin',l:'COIN',get:f=>f.coin_invoice_no||'—'},
  {k:'invdate',l:'Invoice date',get:f=>f.coin_invoice_date?fmtUK(String(f.coin_invoice_date).slice(0,10)):'—',sv:f=>String(f.coin_invoice_date||'')},
  {k:'fine',l:'Fine £',num:1,sum:1,get:f=>parseFloat(f.fine_amount)||0},
  {k:'finevat',l:'Fine VAT £',num:1,sum:1,get:f=>parseFloat(f.fine_vat)||0},
  {k:'admin',l:'Admin £',num:1,sum:1,get:f=>parseFloat(f.admin_fee)||0},
  {k:'adminvat',l:'Admin VAT £',num:1,sum:1,get:f=>parseFloat(f.admin_fee_vat)||0},
  {k:'total',l:'Total £',num:1,sum:1,get:f=>fineTotal(f)},
  {k:'status',l:'Status',get:f=>FINE_STATUS_LABEL[f.status]||f.status},
  {k:'chargemonth',l:'Charge month',get:f=>f.charge_month||'—'},
  {k:'appeal',l:'Appeal',get:f=>f.appeal_status||'—'}
];
const FINE_REPORT_FMAP=Object.fromEntries(FINE_REPORT_FIELDS.map(f=>[f.k,f]));
const FINE_REPORT_DEFAULT_COLS=['driver','reg','type','location','offence','coin','fine','admin','total','status'];
const FINE_REPORT_GROUPS={'':'No grouping',driver:'Driver',type:'Offence type',coin:'COIN',status:'Status',month:'Month of offence'};
let fineSavedReports=null;
function fineGroupKey(f,g){
  if(g==='driver')return f.driver_name||'Unknown';
  if(g==='type')return FINE_OFFENCE_LABEL[f.offence_type]||'Other';
  if(g==='coin')return f.coin_invoice_no||'No COIN';
  if(g==='status')return FINE_STATUS_LABEL[f.status]||f.status;
  if(g==='month')return f.offence_datetime?String(f.offence_datetime).slice(0,7):'Unknown';
  return '';
}
function fineReportDef(){
  const cols=[...document.querySelectorAll('.fr-col:checked')].map(c=>c.value);
  return {
    cols:cols.length?cols:FINE_REPORT_DEFAULT_COLS.slice(),
    group:document.getElementById('fr-group')?.value||'',
    sortK:document.getElementById('fr-sort')?.value||'offence',
    sortDir:document.getElementById('fr-dir')?.value||'desc',
    from:document.getElementById('fr-from')?.value||'',to:document.getElementById('fr-to')?.value||'',
    type:document.getElementById('fr-type')?.value||'',status:document.getElementById('fr-status')?.value||'',
    driver:document.getElementById('fr-driver')?.value||''
  };
}
function fineReportApplyDef(d){
  document.querySelectorAll('.fr-col').forEach(c=>{c.checked=(d.cols||FINE_REPORT_DEFAULT_COLS).includes(c.value);});
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v||'';};
  set('fr-group',d.group);set('fr-sort',d.sortK||'offence');set('fr-dir',d.sortDir||'desc');
  set('fr-from',d.from);set('fr-to',d.to);set('fr-type',d.type);set('fr-status',d.status);set('fr-driver',d.driver);
}
function renderFinesReports(){
  const el=document.getElementById('fines-reports');if(!el)return;
  if(!el.dataset.built){
    el.dataset.built='1';
    const inp='font-size:12px;padding:5px;border:1px solid var(--n200);border-radius:6px';
    const colBoxes=FINE_REPORT_FIELDS.map(f=>'<label style="font-size:11px;color:var(--n600);display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0"><input type="checkbox" class="fr-col" value="'+f.k+'"'+(FINE_REPORT_DEFAULT_COLS.includes(f.k)?' checked':'')+' onchange="fineReportRun()">'+esc(f.l)+'</label>').join('');
    el.innerHTML='<div class="clm-dash-card" style="margin-bottom:12px"><div class="clm-dash-title">Report builder</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:8px">'
      +'<div><label style="font-size:10px;color:var(--n500)">Offence from</label><br><input type="date" id="fr-from" onchange="fineReportRun()" style="'+inp+'"></div>'
      +'<div><label style="font-size:10px;color:var(--n500)">to</label><br><input type="date" id="fr-to" onchange="fineReportRun()" style="'+inp+'"></div>'
      +'<div><label style="font-size:10px;color:var(--n500)">Type</label><br><select id="fr-type" onchange="fineReportRun()" style="'+inp+'"><option value="">All</option>'+Object.entries(FINE_OFFENCE_LABEL).map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('')+'</select></div>'
      +'<div><label style="font-size:10px;color:var(--n500)">Status</label><br><select id="fr-status" onchange="fineReportRun()" style="'+inp+'"><option value="">All</option>'+FINE_STATUSES.map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('')+'</select></div>'
      +'<div><label style="font-size:10px;color:var(--n500)">Driver contains</label><br><input id="fr-driver" oninput="fineReportRun()" style="'+inp+'"></div>'
      +'<div><label style="font-size:10px;color:var(--n500)">Group by</label><br><select id="fr-group" onchange="fineReportRun()" style="'+inp+'">'+Object.entries(FINE_REPORT_GROUPS).map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('')+'</select></div>'
      +'<div><label style="font-size:10px;color:var(--n500)">Sort by</label><br><select id="fr-sort" onchange="fineReportRun()" style="'+inp+'">'+FINE_REPORT_FIELDS.map(f=>'<option value="'+f.k+'"'+(f.k==='offence'?' selected':'')+'>'+esc(f.l)+'</option>').join('')+'</select></div>'
      +'<div><label style="font-size:10px;color:var(--n500)">Direction</label><br><select id="fr-dir" onchange="fineReportRun()" style="'+inp+'"><option value="desc">↓ Desc</option><option value="asc">↑ Asc</option></select></div>'
      +'</div>'
      +'<div style="margin-bottom:8px"><span style="font-size:10px;color:var(--n500);font-weight:700">COLUMNS:</span><br>'+colBoxes+'</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--n100);padding-top:8px">'
      +'<select id="fr-saved" onchange="fineReportLoadSaved()" style="'+inp+'"><option value="">— saved reports —</option></select>'
      +'<input id="fr-name" placeholder="Report name" style="'+inp+'">'
      +'<button class="topbar-btn" onclick="fineReportSave()">💾 Save report</button>'
      +'<button class="topbar-btn" onclick="fineReportDelete()">🗑 Delete</button>'
      +'<span style="flex:1"></span>'
      +'<button class="topbar-btn" onclick="fineReportXlsx()">⬇ XLSX</button>'
      +'<button class="topbar-btn" onclick="fineReportPdf()">🖨 PDF</button>'
      +'</div></div><div id="fr-out"></div>';
    fineLoadSavedReports();
  }
  fineReportRun();
}
async function fineLoadSavedReports(){
  try{const rows=await sbReq('covase_config?key=eq.fines_reports&select=value');const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;fineSavedReports=Array.isArray(v)?v:[];}catch(e){fineSavedReports=[];}
  const sel=document.getElementById('fr-saved');
  if(sel)sel.innerHTML='<option value="">— saved reports —</option>'+fineSavedReports.map((r,i)=>'<option value="'+i+'">'+esc(r.name)+'</option>').join('');
}
function fineSavedPersist(){sbReq('covase_config',{method:'POST',body:{key:'fines_reports',value:fineSavedReports,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'}).catch(e=>toast('Save failed: '+e.message,'error'));}
function fineReportSave(){
  const name=(document.getElementById('fr-name')?.value||'').trim();
  if(!name){toast('Give the report a name first','error');return;}
  const def={name:name,...fineReportDef()};
  const i=(fineSavedReports||[]).findIndex(r=>r.name===name);
  if(i>=0)fineSavedReports[i]=def;else (fineSavedReports=fineSavedReports||[]).push(def);
  fineSavedPersist();fineLoadSavedReports();toast('Report "'+name+'" saved','success');
}
function fineReportLoadSaved(){
  const i=document.getElementById('fr-saved')?.value;
  if(i===''||i==null)return;
  const r=(fineSavedReports||[])[parseInt(i,10)];
  if(!r)return;
  fineReportApplyDef(r);
  const n=document.getElementById('fr-name');if(n)n.value=r.name;
  fineReportRun();
}
function fineReportDelete(){
  const i=document.getElementById('fr-saved')?.value;
  if(i===''||i==null){toast('Pick a saved report to delete','error');return;}
  const r=fineSavedReports[parseInt(i,10)];
  if(!confirm('Delete report "'+r.name+'"?'))return;
  fineSavedReports.splice(parseInt(i,10),1);
  fineSavedPersist();fineLoadSavedReports();toast('Report deleted','success');
}
function fineReportRows(def){
  def=def||fineReportDef();
  let rows=(allFines||[]).filter(f=>f.status!=='cancelled');
  if(def.from)rows=rows.filter(f=>f.offence_datetime&&String(f.offence_datetime).slice(0,10)>=def.from);
  if(def.to)rows=rows.filter(f=>f.offence_datetime&&String(f.offence_datetime).slice(0,10)<=def.to);
  if(def.type)rows=rows.filter(f=>f.offence_type===def.type);
  if(def.status)rows=rows.filter(f=>f.status===def.status);
  if(def.driver)rows=rows.filter(f=>String(f.driver_name||'').toLowerCase().includes(def.driver.toLowerCase()));
  const sf=FINE_REPORT_FMAP[def.sortK]||FINE_REPORT_FMAP.offence;
  const sv=f=>sf.sv?sf.sv(f):sf.get(f);
  rows.sort((a,b)=>{const x=sv(a),y=sv(b);const c=(typeof x==='number'&&typeof y==='number')?x-y:String(x).localeCompare(String(y));return def.sortDir==='asc'?c:-c;});
  return rows;
}
function fineReportTableHtml(rows,forPrint,def){
  def=def||fineReportDef();
  const cols=def.cols.map(k=>FINE_REPORT_FMAP[k]).filter(Boolean);
  const pad='padding:6px 8px;';
  const th=cols.map(c=>'<th style="'+pad+'text-align:'+(c.num?'right':'left')+';white-space:nowrap">'+esc(c.l)+'</th>').join('');
  const cell=(c,f)=>{const v=c.get(f);return '<td style="'+pad+(c.num?'text-align:right;white-space:nowrap':'')+'">'+(c.num?Number(v).toFixed(2):esc(String(v)))+'</td>';};
  const sums=list=>cols.map(c=>c.sum?'<td style="'+pad+'text-align:right;white-space:nowrap">'+list.reduce((s,f)=>s+(Number(c.get(f))||0),0).toFixed(2)+'</td>':'<td style="'+pad+'"></td>').join('');
  let body='';
  if(def.group){
    const groups=new Map();
    rows.forEach(f=>{const k=fineGroupKey(f,def.group);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(f);});
    [...groups.entries()].forEach(([k,list])=>{
      body+='<tr><td colspan="'+cols.length+'" style="'+pad+'background:#f0f1f6;font-weight:700;border-top:1px solid #ddd">'+esc(k)+' <span style="font-weight:400;color:#888">('+list.length+')</span></td></tr>';
      body+=list.map(f=>'<tr style="border-bottom:1px solid #eee">'+cols.map(c=>cell(c,f)).join('')+'</tr>').join('');
      if(cols.some(c=>c.sum))body+='<tr style="font-weight:600;color:#555;border-bottom:1px solid #ddd">'+sums(list).replace('<td style="'+pad+'"></td>','<td style="'+pad+'font-size:10px">Subtotal</td>')+'</tr>';
    });
  }else{
    body=rows.map(f=>'<tr style="border-bottom:1px solid #eee">'+cols.map(c=>cell(c,f)).join('')+'</tr>').join('');
  }
  const foot='<tr style="border-top:2px solid #ccc;font-weight:700"><td style="'+pad+'" colspan="'+Math.max(1,cols.length-cols.filter(c=>c.sum).length)+'">Total ('+rows.length+' fines)</td>'+cols.filter(c=>c.sum).map(c=>'<td style="'+pad+'text-align:right;white-space:nowrap">'+rows.reduce((s,f)=>s+(Number(c.get(f))||0),0).toFixed(2)+'</td>').join('')+'</tr>';
  return '<table style="width:100%;border-collapse:collapse;font-size:'+(forPrint?'11px':'12px')+'"><thead><tr style="border-bottom:2px solid #ccc">'+th+'</tr></thead><tbody>'+body+'</tbody><tfoot>'+foot+'</tfoot></table>';
}
function fineReportRun(){
  const out=document.getElementById('fr-out');if(!out)return;
  const def=fineReportDef();
  const rows=fineReportRows(def);
  out.innerHTML='<div class="clm-dash-card" style="overflow-x:auto">'+(rows.length?fineReportTableHtml(rows,false,def):'<div style="font-size:12px;color:var(--n400)">No fines match the filters.</div>')+'</div>';
}
async function fineReportXlsx(){
  await loadSheetJS();
  const def=fineReportDef();
  const rows=fineReportRows(def);
  const cols=def.cols.map(k=>FINE_REPORT_FMAP[k]).filter(Boolean);
  const aoa=[(def.group?['Group']:[]).concat(cols.map(c=>c.l))];
  rows.forEach(f=>aoa.push((def.group?[fineGroupKey(f,def.group)]:[]).concat(cols.map(c=>c.get(f)))));
  const ws=XLSX.utils.aoa_to_sheet(aoa);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Fines report');
  XLSX.writeFile(wb,'fines-report-'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function fineReportPdf(){
  const def=fineReportDef();
  const rows=fineReportRows(def);
  const name=(document.getElementById('fr-name')?.value||'').trim();
  const w=window.open('','_blank');
  w.document.write('<html><head><title>Fines & penalties report</title></head><body style="font-family:Arial,sans-serif;margin:24px">'
    +'<h2 style="margin:0 0 4px">'+esc(name||'Fines & Penalties report')+'</h2>'
    +'<div style="font-size:12px;color:#666;margin-bottom:14px">Generated '+new Date().toLocaleString('en-GB')+' · '+rows.length+' fines · Covase Ltd</div>'
    +fineReportTableHtml(rows,true,def)
    +'</body></html>');
  w.document.close();w.focus();setTimeout(()=>w.print(),300);
}
// ── Templates editor ──
function openFineTemplates(){
  const v=(id,val)=>{const e=document.getElementById(id);if(e)e.value=val;};
  v('fpt-cc',fineTemplates.cc);v('fpt-ap-subject',fineTemplates.apSubject);v('fpt-ap-body',fineTemplates.apBody);v('fpt-sp-subject',fineTemplates.spSubject);v('fpt-sp-body',fineTemplates.spBody);
  document.getElementById('fine-templates-modal').classList.add('open');
}
function fineTemplatesReset(){const v=(id,val)=>{document.getElementById(id).value=val;};v('fpt-cc',DEFAULT_FINE_TEMPLATES.cc);v('fpt-ap-subject',DEFAULT_FINE_TEMPLATES.apSubject);v('fpt-ap-body',DEFAULT_FINE_TEMPLATES.apBody);v('fpt-sp-subject',DEFAULT_FINE_TEMPLATES.spSubject);v('fpt-sp-body',DEFAULT_FINE_TEMPLATES.spBody);}
async function saveFineTemplates(){
  const g=id=>document.getElementById(id).value;
  fineTemplates={cc:g('fpt-cc').trim(),apSubject:g('fpt-ap-subject'),apBody:g('fpt-ap-body'),spSubject:g('fpt-sp-subject'),spBody:g('fpt-sp-body')};
  try{await sbReq('covase_config',{method:'POST',body:{key:'fines_templates',value:fineTemplates,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});toast('Templates saved','success');document.getElementById('fine-templates-modal').classList.remove('open');}
  catch(e){toast('Save failed: '+e.message,'error');}
}

