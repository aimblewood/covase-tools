// ─── HIRES ───
let allHires=[],hiresLoaded=false,hireStatusFilter='all';
// Days actually on hire TO DATE: 0 before the start date; start→today while
// running; start→end once finished. (Planned duration is a different number.)
function daysOn(h){
  if(!h.start_date)return null;
  const start=new Date(h.start_date),today=new Date();
  if(start>today)return 0; // not started yet
  const end=h.end_date&&new Date(h.end_date)<today?new Date(h.end_date):today;
  return Math.max(0,Math.round((end-start)/86400000));
}
function fmtMoney(n){if(n==null||isNaN(n))return'—';return'£'+parseFloat(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtD(d){if(!d)return'—';return new Date(d).toLocaleDateString('en-GB');}
async function loadHires(){
  const el=document.getElementById('hires-active-list');if(needsSetup(el))return;
  if(!hiresLoaded)['hires-active-list','hires-all-list','hires-recharge-list'].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML='<div class="loading">Loading…</div>';});
  try{
    allHires=await sbReq(`covase_hires?order=start_date.desc&limit=500`);
    hiresLoaded=true;
    // Auto-advance: any booked hires whose start_date has arrived become active.
    // Fires once per loadHires() — single PATCH if there are eligible rows, no-op otherwise.
    await autoAdvanceHireStatuses();
    // Also load accounts for the hire modal dropdown if not loaded
    if(!Array.isArray(allAccounts)||!allAccounts.length){try{allAccounts=await sbReq('covase_accounts?order=company_name.asc&limit=500');}catch(e){}}
    updateHireStats();
    renderHireView('hires-active','active-list',h=>['pending','requested','booked','active'].includes(h.hire_status));
    renderHireView('hires-all','all-list',null);
    renderHireView('hires-recharge','recharge-list',h=>h.billing_status==='invoiced-in'&&!h.outgoing_invoice_id);
    renderPipeline();
    updateBadges();
  }
  catch(e){['hires-active-list','hires-all-list','hires-recharge-list'].forEach(id=>{const e2=document.getElementById(id);if(e2)e2.innerHTML=`<div class="empty-state"><div class="empty-icon">✗</div><div class="empty-title">Load failed</div><div class="empty-sub">${esc(e.message||'')}</div></div>`;});}
}
// Auto-advance hire statuses on load: booked -> active once the start date has
// arrived, and active -> offhired the day AFTER the end date has passed. Uses
// local date-string comparison (timezone-safe). A blank end_date means ongoing
// and is never auto-offhired. One bulk PATCH per transition; no-op if nothing due.
async function autoAdvanceHireStatuses(){
  const now=new Date();
  const todayStr=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  const toActivate=(allHires||[]).filter(h=>h.hire_status==='booked'&&h.start_date&&String(h.start_date).slice(0,10)<=todayStr);
  const toOffhire=(allHires||[]).filter(h=>h.hire_status==='active'&&h.end_date&&String(h.end_date).slice(0,10)<todayStr);
  await bulkSetHireStatus(toActivate,'active');
  await bulkSetHireStatus(toOffhire,'offhired');
  // Offhire-tagged bookings: once the requested collection date/time is reached,
  // the booking advances to Off-hired with end_date = collection date.
  const dueOffhire=(allHires||[]).filter(h=>h.offhire_requested_at&&h.collection_date&&!['offhired','cancelled'].includes(h.hire_status)&&new Date(String(h.collection_date).slice(0,10)+'T'+(h.collection_time?String(h.collection_time).slice(0,5):'23:59')).getTime()<=now.getTime());
  for(const h of dueOffhire){
    try{
      const iso=new Date().toISOString();
      await sbReq('covase_hires?id=eq.'+encodeURIComponent(h.id),{method:'PATCH',body:{hire_status:'offhired',end_date:String(h.collection_date).slice(0,10),updated_at:iso},prefer:'return=minimal'});
      h.hire_status='offhired';h.end_date=String(h.collection_date).slice(0,10);h.updated_at=iso;
    }catch(e){}
  }
  if(dueOffhire.length&&typeof console!=='undefined')console.log('[auto-advance] '+dueOffhire.length+' offhire-tagged hire(s) reached collection time -> offhired');
}
async function bulkSetHireStatus(rows,status){
  if(!rows||!rows.length)return;
  const inList=rows.map(h=>`"${String(h.id).replace(/"/g,'\\"')}"`).join(',');
  try{
    await sbReq(`covase_hires?id=in.(${encodeURIComponent(inList)})`,{method:'PATCH',body:{hire_status:status,updated_at:new Date().toISOString()},prefer:'return=minimal'});
    rows.forEach(h=>{h.hire_status=status;h.updated_at=new Date().toISOString();});
    if(typeof console!=='undefined')console.log('[auto-advance] set '+rows.length+' hire(s) -> '+status);
  }catch(e){if(typeof console!=='undefined')console.warn('[auto-advance] failed for '+status,e);}
}
function updateHireStats(){
  const onHire=allHires.filter(h=>h.hire_status==='active');
  const pending=allHires.filter(h=>h.billing_status==='invoiced-in'&&!h.outgoing_invoice_id);
  document.getElementById('sh-active').textContent=onHire.length;
  document.getElementById('sh-recharge').textContent=pending.length;
  const exposure=onHire.reduce((s,h)=>{const d=daysOn(h);return d&&h.cost_per_day?s+d*parseFloat(h.cost_per_day)+suppTotal(h):s;},0);
  document.getElementById('sh-exposure').textContent=fmtMoney(exposure||null);
  // Margin% = upsell/cost on a per-day basis
  const mg=onHire.filter(h=>h.cost_per_day&&h.upsell_per_day);
  document.getElementById('sh-margin').textContent=mg.length?((mg.reduce((s,h)=>(parseFloat(h.upsell_per_day)/parseFloat(h.cost_per_day))*100+s,0)/mg.length).toFixed(1)+'%'):'—';
}
// Sum of supplementary cost amounts (handles old "amount" + new "cost_amount")
function suppTotal(h){
  if(!Array.isArray(h.supplementaries))return 0;
  return h.supplementaries.reduce((s,x)=>s+(parseFloat(x.cost_amount!=null?x.cost_amount:x.amount)||0),0);
}
// Sum of supplementary upsell amounts (new field; 0 for legacy rows)
function suppUpsellTotal(h){
  if(!Array.isArray(h.supplementaries))return 0;
  return h.supplementaries.reduce((s,x)=>s+(parseFloat(x.upsell_amount)||0),0);
}
function setHireFilter(f,btn){hireStatusFilter=f;document.querySelectorAll('#view-hires-all .filter-pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderHireView('hires-all','all-list',null);}

// ─── Pipeline (Kanban) ───
const PIPELINE_COLS=[
  {key:'pending',   label:'Pending'},
  {key:'requested', label:'Requested'},
  {key:'booked',    label:'Booked'},
  {key:'active',    label:'Active'},
  {key:'offhired',  label:'Off-hired'},
  {key:'paid',      label:'Paid'}
];
// How many days back to include in the Off-hired column (number) or 'all'.
let pipeOffhiredWindow='30';
// Advance chain: which hire_status comes next on "→ Move" click
const HIRE_NEXT={requested:'booked',booked:'active',active:'offhired'};
function renderPipeline(){
  const wrap=document.getElementById('kanban-board');if(!wrap)return;
  const showCancelled=document.getElementById('pipe-show-cancelled')?.checked;
  const clientFilter=document.getElementById('pipe-filter-client')?.value||'';
  const sortMode=document.getElementById('pipe-sort')?.value||'default';
  const searchRaw=(document.getElementById('pipe-search')?.value||'').trim();
  const search=searchRaw.toLowerCase();
  // Show / hide the search clear button
  const clrBtn=document.getElementById('pipe-search-clear');if(clrBtn)clrBtn.style.display=searchRaw?'block':'none';
  // Populate client dropdown from current hires (unique customer strings)
  populatePipeClientFilter();
  // Bucket hires by column, applying the client + search filters first
  const buckets={pending:[],requested:[],booked:[],active:[],offhired:[],paid:[],cancelled:[]};
  (allHires||[]).forEach(h=>{
    if(clientFilter){
      // Match by client_account_id if set, else fall back to customer text
      const matches=(h.client_account_id&&h.client_account_id===clientFilter)
                 ||(!h.client_account_id&&(h.customer||'')===clientFilter);
      if(!matches)return;
    }
    if(search){
      // Strip whitespace from reg too so "AB12 CDE" still matches "AB12CDE"
      const reg=String(h.vehicle_reg||'').replace(/\s+/g,'').toLowerCase();
      const ref=String(h.reference||'').toLowerCase();
      const drv=String(h.driver||'').toLowerCase();
      const needle=search.replace(/\s+/g,'');
      const hit=reg.includes(needle)||ref.includes(search)||drv.includes(search);
      if(!hit)return;
    }
    if(h.hire_status==='cancelled'){buckets.cancelled.push(h);return;}
    // Any hire with billing_status='paid' belongs in the Paid column regardless of hire_status
    if(h.billing_status==='paid'){buckets.paid.push(h);return;}
    if(buckets[h.hire_status])buckets[h.hire_status].push(h);
  });
  // Off-hired window filter — only affects the off-hired bucket
  if(pipeOffhiredWindow!=='all'){
    const days=parseInt(pipeOffhiredWindow,10)||30;
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-days);cutoff.setHours(0,0,0,0);
    buckets.offhired=buckets.offhired.filter(h=>{
      if(!h.end_date)return true;       // no end date — show
      const d=new Date(h.end_date);
      return !isNaN(d)&&d>=cutoff;
    });
  }
  // Apply sort per bucket
  if(sortMode==='account_asc'){
    const byName=(a,b)=>(a.customer||'').localeCompare(b.customer||'',undefined,{sensitivity:'base'});
    Object.keys(buckets).forEach(k=>buckets[k].sort(byName));
  }
  const cols=PIPELINE_COLS.map(c=>{
    const items=buckets[c.key]||[];
    const body=items.length
      ? items.map(h=>kanCard(h)).join('')
      : `<div class="kan-col-empty">Nothing here</div>`;
    // Off-hired column gets a small window-filter dropdown next to the count
    const offhiredCtl=c.key==='offhired'
      ? `<select onchange="pipeOffhiredWindow=this.value;renderPipeline()" style="font-size:10px;padding:1px 4px;border:1px solid var(--n200);border-radius:5px;background:#fff;color:var(--n600);margin-left:auto;margin-right:6px" title="Off-hired date window">
           <option value="30"${pipeOffhiredWindow==='30'?' selected':''}>Last 30d</option>
           <option value="60"${pipeOffhiredWindow==='60'?' selected':''}>Last 60d</option>
           <option value="all"${pipeOffhiredWindow==='all'?' selected':''}>All</option>
         </select>`
      : '';
    return `<div class="kan-col">
      <div class="kan-col-header"><span class="kan-col-title">${esc(c.label)}</span>${offhiredCtl}<span class="kan-col-count">${items.length}</span></div>
      <div class="kan-col-body">${body}</div>
    </div>`;
  }).join('');
  let out=cols;
  if(showCancelled&&buckets.cancelled.length){
    out+=`<div class="kan-col" style="grid-column:1/-1;margin-top:14px">
      <div class="kan-col-header"><span class="kan-col-title" style="color:var(--tl-red-t)">Cancelled</span><span class="kan-col-count">${buckets.cancelled.length}</span></div>
      <div class="kan-col-body" style="max-height:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px">${buckets.cancelled.map(h=>kanCard(h)).join('')}</div>
    </div>`;
  }
  wrap.innerHTML=out;
}
// Build the Pipeline "Client" filter dropdown from current hires.
// Uses client_account_id when available (preferred — stable), falls back to customer text for legacy rows.
function populatePipeClientFilter(){
  const sel=document.getElementById('pipe-filter-client');if(!sel)return;
  const current=sel.value;
  // Map of value → label, preferring account_id keys
  const byId=new Map(),byName=new Map();
  (allHires||[]).forEach(h=>{
    if(h.client_account_id){
      if(!byId.has(h.client_account_id))byId.set(h.client_account_id,h.customer||h.client_account_id);
    }else if(h.customer){
      byName.set(h.customer,h.customer);
    }
  });
  // Prefer account names from allAccounts if loaded (keeps labels in sync if renamed)
  if(Array.isArray(allAccounts)){
    allAccounts.forEach(a=>{if(byId.has(a.id))byId.set(a.id,a.company_name||byId.get(a.id));});
  }
  const entries=[...[...byId.entries()].map(([v,l])=>({value:v,label:l})),
                 ...[...byName.entries()].map(([v,l])=>({value:v,label:l}))];
  entries.sort((a,b)=>a.label.localeCompare(b.label,undefined,{sensitivity:'base'}));
  sel.innerHTML='<option value="">All clients</option>'+entries.map(e=>`<option value="${esc(e.value)}">${esc(e.label)}</option>`).join('');
  // Restore selection if still valid
  if(current&&[...sel.options].some(o=>o.value===current))sel.value=current;
}
// ─── Booking (hire) card designer: field catalog + layout ───
function hireStatusLabel(s){const L={pending:'Pending',requested:'Requested',booked:'Booked',active:'On hire',offhired:'Off-hired',cancelled:'Cancelled'};return L[s]||s||'';}
const HIRE_CARD_FIELDS=[
  {key:'customer',label:'Customer',get:h=>h.customer||'—'},
  {key:'driver',label:'Driver',get:h=>h.driver||''},
  {key:'driver_mobile',label:'Driver mobile',get:h=>h.driver_mobile||''},
  {key:'vehicle_reg',label:'Vehicle reg',get:h=>h.vehicle_reg||''},
  {key:'make_model',label:'Make / model',get:h=>h.make_model||''},
  {key:'reg_make',label:'Reg · make/model',get:h=>[h.vehicle_reg||'—',h.make_model||''].filter(Boolean).join(' · ')},
  {key:'reference',label:'Supplier booking ref',get:h=>h.reference||''},
  {key:'job_ref',label:'Job ref',get:h=>h.job_ref||''},
  {key:'supplier',label:'Supplier',get:h=>h.supplier||''},
  {key:'status',label:'Status',get:h=>hireStatusLabel(h.hire_status)},
  {key:'billing',label:'Billing status',get:h=>({'pending':'Billing pending','invoiced-in':'Invoiced in','recharged':'Recharged','paid':'Paid'}[h.billing_status]||'')},
  {key:'start_date',label:'Start date',get:h=>h.start_date?fmtD(h.start_date):''},
  {key:'end_date',label:'End date',get:h=>h.end_date?fmtD(h.end_date):''},
  {key:'dates',label:'Dates (start → end)',get:h=>(h.start_date?fmtD(h.start_date):'?')+' → '+(h.end_date?fmtD(h.end_date):'ongoing')},
  {key:'days_on',label:'Days on hire / starts in',get:h=>{
    if(h.start_date&&new Date(h.start_date)>new Date()){
      return 'Starts in '+Math.ceil((new Date(h.start_date)-new Date())/86400000)+'d';
    }
    const d=daysOn(h);return d!=null?d+'d on hire':'—';
  }},
  {key:'profit',label:'Profit to date (£)',money:true,get:h=>{const d=daysOn(h);return d!=null?fmtMoney(d*(parseFloat(h.upsell_per_day)||0)+suppUpsellTotal(h)):'—';}},
  {key:'cost_per_day',label:'Cost/day (£)',money:true,get:h=>h.cost_per_day!=null?fmtMoney(parseFloat(h.cost_per_day)):''},
  {key:'upsell_per_day',label:'Upsell/day (£)',money:true,get:h=>h.upsell_per_day!=null?fmtMoney(parseFloat(h.upsell_per_day)):''},
  {key:'rft_per_day',label:'RFT/day (£)',money:true,get:h=>h.rft_per_day!=null?fmtMoney(parseFloat(h.rft_per_day)):''},
  {key:'client_rate_day',label:'Client rate/day (£)',money:true,get:h=>{const c=(parseFloat(h.cost_per_day)||0)+(parseFloat(h.upsell_per_day)||0)+(parseFloat(h.rft_per_day)||0);return c?fmtMoney(c):'';}},
  {key:'category',label:'Category',get:h=>h.category||''},
  {key:'fuel_type',label:'Fuel',get:h=>h.fuel_type||''},
  {key:'ev_range',label:'EV range',get:h=>h.ev_range!=null?h.ev_range+' mi':''},
  {key:'tariff',label:'Tariff',get:h=>h.tariff||''},
  {key:'delivery_town',label:'Delivery town',get:h=>h.delivery_town||''},
  {key:'delivery_county',label:'Delivery county',get:h=>h.delivery_county||''},
  {key:'delivery_postcode',label:'Delivery postcode',get:h=>h.delivery_postcode||''},
  {key:'collection',label:'Collection (offhire)',get:h=>h.collection_date?fmtD(h.collection_date)+(h.collection_time?' '+String(h.collection_time).slice(0,5):''):''},
  {key:'preferred_start_time',label:'Preferred start time',get:h=>h.preferred_start_time?String(h.preferred_start_time).slice(0,5):''},
  {key:'notes',label:'Notes',get:h=>h.notes||''}
];
const HIRE_FIELD_MAP=Object.fromEntries(HIRE_CARD_FIELDS.map(f=>[f.key,f]));
const DEFAULT_HIRE_CARD_LAYOUT={title:['customer'],lines:[['driver'],['reg_make'],['reference']],right:['days_on','profit']};
let hireCardLayout=null; // null → default layout (matches the original card)
const HIRECD_SAMPLE={id:'sample',customer:'Woodland Trust',driver:'Jane Doe',driver_mobile:'07700 900123',vehicle_reg:'AB12 CDE',make_model:'Nissan Juke',reference:'FVSL048267',job_ref:'CVB-0042',supplier:'Fourways',hire_status:'active',billing_status:'pending',start_date:'2026-08-10',end_date:null,cost_per_day:28.5,upsell_per_day:6,rft_per_day:2.5,category:'CAR3A',fuel_type:'Petrol',delivery_town:'Grantham',delivery_county:'Lincolnshire',delivery_postcode:'NG31 6PZ',supplementaries:[]};
async function loadHireCardLayout(){
  try{
    const rows=await sbReq('covase_config?key=eq.hire_card_layout&select=value');
    const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;
    if(v&&typeof v==='object'){
      const L=mvcdCloneLayout(v);
      const ok=k=>HIRE_FIELD_MAP[mvKeyBase(k)]||mvIsLabelKey(mvKeyBase(k));
      L.title=L.title.filter(ok);L.right=L.right.filter(k=>HIRE_FIELD_MAP[mvKeyBase(k)]);L.lines=L.lines.map(l=>l.filter(ok));
      hireCardLayout=L;
      if(Array.isArray(allHires)&&allHires.length)loadHires();
    }
  }catch(e){/* covase_config may not exist yet — keep default */}
}
function kanCard(h){
  const bl=h.billing_status||'pending';
  const cls=['kan-card','bill-'+bl,h.hire_status==='cancelled'?'cancelled':''].filter(Boolean).join(' ');
  // Advance button: which action makes sense next?
  const adv=nextAdvance(h);
  const advBtn=adv?`<button class="kan-advance ${adv.cls||''}" onclick="event.stopPropagation();advanceHire('${esc(h.id)}','${adv.action}')" title="${esc(adv.tip||'')}">→ ${esc(adv.label)}</button>`:'';
  const cancelBtn=h.hire_status!=='cancelled'&&h.billing_status!=='paid'?`<button class="kan-cancel" onclick="event.stopPropagation();cancelHire('${esc(h.id)}')" title="Cancel hire">✕</button>`:'';
  // Replacement chain badges.
  const successor=(allHires||[]).find(x=>x.replaces_hire_id===h.id);
  const predecessor=h.replaces_hire_id?(allHires||[]).find(x=>x.id===h.replaces_hire_id):null;
  const replacedBadge=successor?`<span class="kan-replace-pill" title="Replaced by ${esc(successor.vehicle_reg||'—')} on ${fmtD(successor.start_date)}">Replaced → ${esc(successor.vehicle_reg||'—')}</span>`:'';
  const replacesBadge=predecessor?`<span class="kan-replace-pill" title="Replaces ${esc(predecessor.vehicle_reg||'—')} (off-hired ${fmtD(predecessor.end_date)})">← Replaces ${esc(predecessor.vehicle_reg||'—')}</span>`:'';
  const offhireBadge=(h.offhire_requested_at&&!['offhired','cancelled'].includes(h.hire_status))?`<span class="kan-replace-pill" style="background:#b45309;color:#fff" title="Offhire requested — collection ${fmtD(h.collection_date)}${h.collection_time?' '+String(h.collection_time).slice(0,5):''}">📦 Offhire ${fmtD(h.collection_date)}${h.collection_time?' '+String(h.collection_time).slice(0,5):''}</span>`:'';
  const replaceRow=(replacedBadge||replacesBadge||offhireBadge)?`<div class="kan-card-replace-row">${replacedBadge}${replacesBadge}${offhireBadge}</div>`:'';
  // Text content comes from the designed layout (Settings → 🎨 Design cards);
  // badges, billing tint and action buttons stay put regardless of the design.
  const L=hireCardLayout||DEFAULT_HIRE_CARD_LAYOUT;
  const parts=keys=>mvResolvePartsHtml(keys,h,HIRE_FIELD_MAP);
  const titleParts=parts(L.title);
  const title=titleParts.length?titleParts.join(' '):'—';
  const linesHtml=(Array.isArray(L.lines)?L.lines:[]).map((keys,i)=>{const p=parts(keys);return p.length?`<div style="font-size:11px;color:var(--${i===0?'n700':'n500'});margin-top:2px;overflow:hidden;text-overflow:ellipsis">${p.join(' ')}</div>`:'';}).join('');
  const rightHtml=(L.right||[]).map(k=>{
    const bk=mvKeyBase(k);const f=HIRE_FIELD_MAP[bk];if(!f)return '';
    const v=f.get(h);if(v===''||v==null)return '';
    const fs=mvFmtStyle(mvKeyFmt(k));
    if(bk==='profit'){const d=daysOn(h);const p=d!=null?d*(parseFloat(h.upsell_per_day)||0)+suppUpsellTotal(h):null;const pc=p==null?'profit-zero':(p>0?'profit-pos':(p<0?'profit-neg':'profit-zero'));return `<div class="kan-card-r2 ${pc}" style="${fs}" title="Profit to date (upsell × days + supp upsell)">${esc(String(v))}</div>`;}
    if(bk==='days_on')return `<div class="kan-card-r1" style="${fs}">${esc(String(v))}</div>`;
    if(bk==='status'||bk==='billing')return `<div style="font-size:10px;color:var(--n500);margin-top:2px;text-transform:uppercase;letter-spacing:.3px;${fs}">${esc(String(v))}</div>`;
    if(f.money)return `<div style="font-weight:700;font-size:13px;color:var(--covase);${fs}">${esc(String(v))}</div>`;
    return `<div style="font-size:11px;color:var(--n600);margin-top:2px;${fs}">${esc(String(v))}</div>`;
  }).filter(Boolean).join('');
  const right=rightHtml?`<div style="text-align:right;white-space:nowrap;flex-shrink:0">${rightHtml}</div>`:'';
  return `<div class="${cls}" onclick="openEditHire('${esc(h.id)}')">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="kan-card-l1">${title}</div>
        ${linesHtml}
        ${replaceRow}
      </div>
      ${right}
    </div>
    <div class="kan-card-bottom">
      <div class="kan-card-actions" style="margin-left:auto">${advBtn}${cancelBtn}</div>
    </div>
  </div>`;
}
// Decide the next sensible action for a hire
function nextAdvance(h){
  if(h.hire_status==='cancelled')return null;
  if(h.billing_status==='paid')return null;
  // Pending leaves the lane by sending the supplier request (which sets Requested),
  // not by a plain status flip. Button opens the booking so the request can be sent.
  if(h.hire_status==='pending')return {action:'send',label:'Send to supplier',cls:'',tip:'Open booking to send the supplier request'};
  // Operational progression first
  if(HIRE_NEXT[h.hire_status]){
    const lbl={requested:'Book',booked:'On hire',active:'Off-hire'}[h.hire_status];
    return {action:'hire:'+HIRE_NEXT[h.hire_status],label:lbl,tip:'Move hire to '+HIRE_NEXT[h.hire_status]};
  }
  // hire_status is offhired — next action depends on billing_status
  if(h.hire_status==='offhired'){
    if(h.billing_status==='pending')return {action:'bill:invoiced-in',label:'Mark invoiced in',cls:'',tip:'Mark supplier invoice received'};
    if(h.billing_status==='invoiced-in')return {action:'recharge',label:'Recharge',cls:'purple',tip:'Raise client recharge invoice'};
    if(h.billing_status==='recharged')return {action:'bill:paid',label:'Mark paid',cls:'green',tip:'Mark client has paid'};
  }
  return null;
}
async function advanceHire(id,action){
  const h=allHires.find(x=>x.id===id);if(!h)return;
  if(action==='recharge'){rechargeHire(id);return;}
  if(action==='send'){openEditHire(id);return;}
  const patch={updated_at:new Date().toISOString()};
  if(action.startsWith('hire:')){
    patch.hire_status=action.split(':')[1];
    // Convenience: when going to offhired without an end_date, default to today
    if(patch.hire_status==='offhired'&&!h.end_date)patch.end_date=new Date().toISOString().split('T')[0];
  }
  if(action.startsWith('bill:')){
    patch.billing_status=action.split(':')[1];
  }
  try{
    await sbReq(`covase_hires?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch,prefer:'return=minimal'});
    Object.assign(h,patch);
    renderPipeline();updateHireStats();updateBadges();
    toast('Updated','success');
  }catch(e){toast('Failed: '+e.message,'error');}
}
async function cancelHire(id){
  if(!confirm('Cancel this hire?'))return;
  const h=allHires.find(x=>x.id===id);if(!h)return;
  const patch={hire_status:'cancelled',updated_at:new Date().toISOString()};
  try{
    await sbReq(`covase_hires?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch,prefer:'return=minimal'});
    Object.assign(h,patch);
    renderPipeline();updateHireStats();updateBadges();
    toast('Hire cancelled','success');
  }catch(e){toast('Failed: '+e.message,'error');}
}
function updatePipelineBadge(){
  const el=document.getElementById('badge-pipeline');if(!el)return;
  // Count hires that need attention: anything not paid and not cancelled
  const n=(allHires||[]).filter(h=>h.hire_status!=='cancelled'&&h.billing_status!=='paid').length;
  el.textContent=n||'0';
}
function renderHireView(viewId,listSuffix,filterFn){
  const el=document.getElementById(`hires-${listSuffix}`);if(!el)return;
  let hires=allHires;if(filterFn)hires=hires.filter(filterFn);
  if(viewId==='hires-all'&&hireStatusFilter!=='all')hires=hires.filter(h=>h.hire_status===hireStatusFilter||h.billing_status===hireStatusFilter);
  if(!hires.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">🚗</div><div class="empty-title">No hires here</div><div class="empty-sub">Click "+ New Hire" to log a hire.</div></div>`;return;}
  el.innerHTML=hires.map(h=>buildHireCard(h)).join('');
}
function buildHireCard(h){
  const days=daysOn(h);
  const suppC=suppTotal(h),suppU=suppUpsellTotal(h);
  const cpd=parseFloat(h.cost_per_day)||0,upd=parseFloat(h.upsell_per_day)||0;
  // RFT is passthrough: adds to both supplier cost AND client sell, profit-neutral
  const rft=parseFloat(h.rft_per_day)||0;
  const dailyClient=cpd+upd+rft;
  const totalCost=days?days*(cpd+rft)+suppC:null;
  const totalUpsell=days?days*upd+suppU:null;
  const totalSell=totalCost!=null&&totalUpsell!=null?totalCost+totalUpsell:null;
  const margin=totalUpsell;
  const lcLabels={pending:'Pending',requested:'Requested',booked:'Booked',active:'Active',offhired:'Off-hired',cancelled:'Cancelled'};
  const blLabels={'pending':'Pending','invoiced-in':'Invoiced in','recharged':'Recharged','paid':'Paid'};
  const lc=h.hire_status||'booked',bl=h.billing_status||'pending';
  const pClass=margin!=null?(margin>=0?'profit-pos':'profit-neg'):'';
  const invLinked=h.incoming_invoice_id?` <span style="color:var(--covase);font-size:11px" title="Supplier invoice linked">📄</span>`:'';
  const rechBadge=h.outgoing_invoice_id?` <span style="color:var(--purple);font-size:11px" title="Recharge raised">↑</span>`:'';
  return `<div class="hire-card" id="hc-${h.id}">
    <div class="hire-header" onclick="toggleCard('hc-${h.id}')">
      <div><div class="h-customer">${esc(h.customer)}${invLinked}${rechBadge}</div><div class="h-meta">${esc(h.vehicle_reg||'—')} · ${esc(h.driver||'—')} · ${esc(h.supplier||'—')}</div></div>
      <div class="inv-col"><div class="inv-col-label">Start</div><div class="inv-col-val">${fmtD(h.start_date)}</div></div>
      <div class="inv-col"><div class="inv-col-label">End / Days</div><div class="inv-col-val">${h.end_date?fmtD(h.end_date):'<span style="color:var(--tl-orange);font-weight:600">Ongoing</span>'}${days!=null?' · '+days+'d':''}</div></div>
      <div class="inv-col"><div class="inv-col-label">Sell total</div><div class="inv-amount">${fmtMoney(totalSell)}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px"><span class="badge badge-${lc}">${lcLabels[lc]||lc}</span><span class="badge badge-${bl==='invoiced-in'?'invoiced':bl}" style="font-size:9px">${blLabels[bl]||bl}</span></div>
      <div class="expand-arrow">▶</div>
    </div>
    <div class="card-detail">
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">Customer</div><div class="detail-val">${esc(h.customer||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Driver</div><div class="detail-val">${esc(h.driver||'—')}${h.driver_mobile?` <span style="color:var(--n500);font-weight:400;font-size:11px">· ${esc(h.driver_mobile)}</span>`:''}</div></div>
        <div class="detail-field"><div class="detail-label">Job ref</div><div class="detail-val" style="font-weight:700;color:var(--covase)">${esc(h.job_ref||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Booking ref</div><div class="detail-val">${esc(h.reference||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Preferred start time</div><div class="detail-val">${h.preferred_start_time?String(h.preferred_start_time).slice(0,5):'—'}</div></div>
        <div class="detail-field"><div class="detail-label">Reg</div><div class="detail-val">${esc(h.vehicle_reg||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Make / Model</div><div class="detail-val">${esc(h.make_model||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Category</div><div class="detail-val">${esc(h.category||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Fuel</div><div class="detail-val">${esc(h.fuel_type||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Date of registration</div><div class="detail-val">${h.date_of_registration?fmtD(h.date_of_registration):'—'}</div></div>
        <div class="detail-field"><div class="detail-label">P11d value</div><div class="detail-val">${h.p11d_value!=null?fmtMoney(h.p11d_value):'—'}</div></div>
        <div class="detail-field"><div class="detail-label">CO₂ (g/km)</div><div class="detail-val">${h.co2_emissions!=null?h.co2_emissions:'—'}</div></div>
        <div class="detail-field"><div class="detail-label">Engine (cc)</div><div class="detail-val">${h.engine_cc!=null?h.engine_cc:'—'}</div></div>
        <div class="detail-field"><div class="detail-label">EV range (miles)</div><div class="detail-val">${h.ev_range!=null?h.ev_range:'—'}</div></div>
      </div>
      <div class="financials-row">
        <div><span>Days</span><strong>${days??'—'}</strong></div>
        <div><span>Cost/day</span><strong>${cpd?'£'+cpd.toFixed(2):'—'}</strong></div>
        <div><span>Upsell/day</span><strong>${upd?'£'+upd.toFixed(2):'—'}</strong></div>
        <div><span>RFT/day</span><strong>${rft?'£'+rft.toFixed(2):'—'}</strong></div>
        <div><span>Client rate/day</span><strong>${dailyClient?'£'+dailyClient.toFixed(2):'—'}</strong></div>
        <div><span>Total cost</span><strong>${fmtMoney(totalCost)}</strong></div>
        <div><span>Total sell</span><strong>${fmtMoney(totalSell)}</strong></div>
        <div><span>Margin</span><strong class="${pClass}">${fmtMoney(margin)}</strong></div>
      </div>
      ${(h.delivery_address_line1||h.delivery_town||h.delivery_county||h.delivery_postcode)?`<div class="notes-box">📍 Deliver to: ${[h.delivery_address_line1,h.delivery_address_line2,h.delivery_town,h.delivery_county,h.delivery_postcode].filter(Boolean).map(esc).join(', ')}</div>`:''}
      ${Array.isArray(h.supplementaries)&&h.supplementaries.length?`<div class="notes-box">📎 Supplementary: cost ${fmtMoney(suppC)} + upsell ${fmtMoney(suppU)} — ${h.supplementaries.map(s=>{const c=parseFloat(s.cost_amount!=null?s.cost_amount:s.amount)||0;const u=parseFloat(s.upsell_amount)||0;return esc(s.type)+' £'+c.toFixed(2)+(u?'+£'+u.toFixed(2)+' upsell':'')+(s.vat_status==='outside_of_scope'?' (OoS)':'');}).join(', ')}</div>`:''}
      ${h.notes?`<div class="notes-box">${esc(h.notes)}</div>`:''}
      ${h.incoming_invoice_id?`<div style="font-size:11px;color:var(--n400);margin-bottom:12px">📄 Supplier invoice: <span style="color:var(--covase)">${esc(h.incoming_invoice_id)}</span></div>`:''}
      <div class="inline-panel yellow" id="hco-${h.id}">
        <div><label>End date</label><input type="date" id="hco-d-${h.id}" value="${new Date().toISOString().split('T')[0]}"></div>
        <button class="btn btn-close-hire" onclick="doCloseHire('${h.id}')">✓ Off-hire</button>
        <button class="btn btn-link" onclick="togglePanel('hco-${h.id}',false)">Cancel</button>
      </div>
      <div class="action-row">
        <button class="btn btn-edit" onclick="openEditHire('${h.id}')">✎ Edit</button>
        ${lc==='active'?`<button class="btn btn-close-hire" onclick="togglePanel('hco-${h.id}',true)">⊠ Off-hire</button>`:''}
        ${bl==='invoiced-in'&&!h.outgoing_invoice_id?`<button class="btn btn-recharge" onclick="rechargeHire('${h.id}')">↑ Recharge</button>`:''}
        <button class="btn btn-danger" onclick="deleteHire('${h.id}')">✗</button>
      </div>
    </div>
  </div>`;
}
function togglePanel(id,open){const el=document.getElementById(id);if(el)el.classList.toggle('open',open);}
async function doCloseHire(id){
  const d=document.getElementById(`hco-d-${id}`)?.value;if(!d){toast('Enter date','error');return;}
  try{
    await sbReq(`covase_hires?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{end_date:d,hire_status:'offhired'},prefer:'return=minimal'});
    const h=allHires.find(x=>x.id===id);if(h){h.end_date=d;h.hire_status='offhired';}
    updateHireStats();
    renderHireView('hires-active','active-list',h=>['pending','requested','booked','active'].includes(h.hire_status));
    renderHireView('hires-recharge','recharge-list',h=>h.billing_status==='invoiced-in'&&!h.outgoing_invoice_id);
    renderHireView('hires-all','all-list',null);
    updateBadges();
    toast('Hire off-hired','success');
  }catch(e){toast('Failed: '+e.message,'error');}
}
function rechargeHire(id){
  const h=allHires.find(x=>x.id===id);if(!h)return;
  const days=daysOn(h);
  const cpd=parseFloat(h.cost_per_day)||0,upd=parseFloat(h.upsell_per_day)||0,rft=parseFloat(h.rft_per_day)||0;
  const dailyRate=cpd+upd+rft;
  const sellTotal=days?days*dailyRate:0;
  const reg=h.vehicle_reg||'',driver=h.driver||'';
  // Main hire line — Woodland Trust format (client sees all-in rate)
  const hireDesc=`${reg} for ${driver}${dailyRate?' @ £'+dailyRate.toFixed(2)+' per day':''}${days?'\n('+days+' Days – '+fmtD(h.start_date)+' – '+fmtD(h.end_date||'')+')':''}`;
  const vatExempt=(h.vat_status==='outside_of_scope');
  const lineItems=[{desc:hireDesc,amt:sellTotal.toFixed(2),vatExempt}];
  // One line per supplementary — client charge = cost + upsell
  if(Array.isArray(h.supplementaries)){
    h.supplementaries.forEach(s=>{
      const cost=parseFloat(s.cost_amount!=null?s.cost_amount:s.amount)||0;
      const up=parseFloat(s.upsell_amount)||0;
      const amt=cost+up;if(!amt)return;
      const desc=`${reg}${driver?' — '+driver:''} — ${s.type}${s.notes?' ('+s.notes+')':''}`;
      lineItems.push({desc,amt:amt.toFixed(2),vatExempt:(s.vat_status==='outside_of_scope')});
    });
  }
  localStorage.setItem('recharge_selected_items',JSON.stringify(lineItems));localStorage.setItem('recharge_source_hire',id);localStorage.setItem('recharge_client_name',h.customer||'');
  window.open((localStorage.getItem('covase_generator_url')||'covase-invoice-generator.html')+'?recharge_hire='+encodeURIComponent(id),'_blank');
  markHireRecharged(id);
  toast('Opening generator…','success');
}
let editHireId=null;
async function openNewHire(){editHireId=null;document.getElementById('hire-modal-title').textContent='New hire';clearHireForm();document.getElementById('hf-start').value=new Date().toISOString().split('T')[0];populateHireAccountDropdown();const rvBtn=document.getElementById('hf-replace-vehicle-btn');if(rvBtn)rvBtn.style.display='none';const ssB=document.getElementById('hf-send-supplier-btn');if(ssB)ssB.style.display='none';const ssS=document.getElementById('hf-supplier-sent');if(ssS)ssS.textContent='';const tB=document.getElementById('hf-thread-btn');if(tB)tB.style.display='none';document.getElementById('hire-modal').classList.add('open');
  // Ensure contacts are loaded so driver lookup can surface local matches + match by dynamics_id on save-back
  if(!Array.isArray(allContacts)||!allContacts.length){try{allContacts=await sbReq('covase_contacts?order=last_name.asc&limit=2000');}catch(e){}}
}
function openEditHire(id){
  const h=allHires.find(x=>x.id===id);if(!h)return;editHireId=id;
  document.getElementById('hire-modal-title').textContent='Edit hire'+(h.job_ref?' · '+h.job_ref:'');
  clearHireForm();
  populateHireAccountDropdown();
  const f=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??''};
  f('hf-account',h.client_account_id||'');f('hf-driver',h.driver);f('hf-mobile',h.driver_mobile);f('hf-reference',h.reference);f('hf-hire-status',h.hire_status||'booked');f('hf-billing',h.billing_status||'pending');f('hf-reg',h.vehicle_reg);f('hf-makemodel',h.make_model);f('hf-category',h.category);f('hf-fuel',h.fuel_type);f('hf-reg-date',h.date_of_registration);f('hf-p11d',h.p11d_value);f('hf-co2',h.co2_emissions);f('hf-engine-cc',h.engine_cc);f('hf-ev-range',h.ev_range);f('hf-addr1',h.delivery_address_line1);f('hf-addr2',h.delivery_address_line2);f('hf-town',h.delivery_town);f('hf-county',h.delivery_county);f('hf-postcode',h.delivery_postcode);f('hf-supplier',h.supplier);f('hf-supplier-ref',h.supplier_ref);f('hf-start',h.start_date);f('hf-end',h.end_date);f('hf-tariff',h.tariff);f('hf-start-time',h.preferred_start_time?String(h.preferred_start_time).slice(0,5):'');f('hf-cost',h.cost_per_day);f('hf-upsell',h.upsell_per_day);f('hf-rft',h.rft_per_day);f('hf-in-inv',h.incoming_invoice_id);f('hf-out-inv',h.outgoing_invoice_id);f('hf-notes',h.notes);
  // Driver FK + Dynamics id (if contact exists with dynamics_id)
  f('hf-driver-contact-id',h.driver_contact_id||'');
  const driverContact=h.driver_contact_id?(allContacts||[]).find(c=>c.id===h.driver_contact_id):null;
  f('hf-driver-dynamics-id',driverContact?.dynamics_id||'');
  window._lastSelectedDriverName=h.driver||'';
  supps=Array.isArray(h.supplementaries)?h.supplementaries.map(s=>({...s})):[];renderSupps();updateHireRatePreview();
  updateHireD365Link('account');updateHireD365Link('driver');
  // Replace-vehicle button only makes sense on hires that already have a vehicle and aren't done.
  const rvBtn=document.getElementById('hf-replace-vehicle-btn');
  if(rvBtn){
    const eligible=['booked','active'].includes(h.hire_status);
    rvBtn.style.display=eligible?'':'none';
  }
  updateSendSupplierBtn();renderSupplierSentState(h);
  document.getElementById('hire-modal').classList.add('open');
}
function populateHireAccountDropdown(){
  const sel=document.getElementById('hf-account');if(!sel)return;
  const cur=sel.value;
  const clients=(allAccounts||[]).filter(a=>(a.type||'client')==='client').slice().sort((a,b)=>(a.company_name||'').localeCompare(b.company_name||''));
  sel.innerHTML='<option value="">— select —</option>'+clients.map(a=>`<option value="${esc(a.id)}">${esc(a.company_name)}</option>`).join('');
  if(cur)sel.value=cur;
}
function closeHireModal(){document.getElementById('hire-modal').classList.remove('open');}
function clearHireForm(){['hf-driver','hf-driver-contact-id','hf-driver-dynamics-id','hf-mobile','hf-reference','hf-reg','hf-makemodel','hf-reg-date','hf-p11d','hf-co2','hf-engine-cc','hf-ev-range','hf-addr1','hf-addr2','hf-town','hf-county','hf-postcode','hf-supplier-ref','hf-start','hf-end','hf-start-time','hf-cost','hf-upsell','hf-rft','hf-in-inv','hf-out-inv','hf-notes','hf-account-search'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});['hf-category','hf-fuel','hf-supplier','hf-account','hf-tariff'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});document.getElementById('hf-hire-status').value='pending';document.getElementById('hf-billing').value='pending';const tag=document.getElementById('hf-delivery-source');if(tag)tag.textContent='Auto-fills from driver Dynamics record';supps=[];renderSupps();updateHireRatePreview();
  // reset Dynamics UI bits
  const s=document.getElementById('hf-account-search');if(s)s.style.display='none';
  document.querySelectorAll('#hire-modal .lookup-results').forEach(r=>r.classList.remove('open'));
  ['hf-account-d365','hf-driver-d365'].forEach(id=>{const e=document.getElementById(id);if(e){e.style.display='none';e.removeAttribute('href');}});
  window._lastSelectedDriverName='';window._pendingDriverContact=null;
}

// ─── Supplementary charges repeater ───
let supps=[];
const SUPP_TYPES=['Fuel','Fine','Admin fee for fine/penalty','Admin fee for damage','One way charge','Comp for Damage','Delivery','Collection','Delivery/Collection','Other'];
// Backward-compat helpers — read either new (cost_amount/upsell_amount) or old (amount) shape
function suppCost(s){return parseFloat(s.cost_amount!=null?s.cost_amount:s.amount)||0;}
function suppUpsell(s){return parseFloat(s.upsell_amount)||0;}
function addSupp(){supps.push({type:'Fuel',cost_amount:null,upsell_amount:null,vat_status:'full',notes:''});renderSupps();}
function removeSupp(i){supps.splice(i,1);renderSupps();}
function updateSupp(i,field,val){if(!supps[i])return;
  if(field==='cost_amount'||field==='upsell_amount')supps[i][field]=val===''?null:parseFloat(val);
  else supps[i][field]=val;
}
function renderSupps(){
  const wrap=document.getElementById('hf-supps');if(!wrap)return;
  if(!supps.length){wrap.innerHTML='<div style="font-size:11px;color:#9ca3af;padding:6px 0">No supplementary charges. Click "+ Add supplementary" above.</div>';return;}
  wrap.innerHTML=supps.map((s,i)=>{
    // Migrate old single-amount rows on the fly for display
    const cost=s.cost_amount!=null?s.cost_amount:(s.amount!=null?s.amount:'');
    const upsell=s.upsell_amount!=null?s.upsell_amount:'';
    return `
    <div class="form-row" style="align-items:end;gap:8px;margin-bottom:6px">
      <div class="form-field" style="flex:0 0 170px">
        <label>Type</label>
        <select onchange="updateSupp(${i},'type',this.value)">
          ${SUPP_TYPES.map(t=>`<option value="${esc(t)}"${s.type===t?' selected':''}>${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field" style="flex:0 0 100px">
        <label>Cost £</label>
        <input type="number" step="0.01" value="${cost}" placeholder="0.00" onchange="updateSupp(${i},'cost_amount',this.value)">
      </div>
      <div class="form-field" style="flex:0 0 100px">
        <label>Upsell £</label>
        <input type="number" step="0.01" value="${upsell}" placeholder="0.00" onchange="updateSupp(${i},'upsell_amount',this.value)">
      </div>
      <div class="form-field" style="flex:0 0 140px">
        <label>VAT status</label>
        <select onchange="updateSupp(${i},'vat_status',this.value)">
          <option value="full"${s.vat_status==='full'?' selected':''}>Full</option>
          <option value="outside_of_scope"${s.vat_status==='outside_of_scope'?' selected':''}>Outside of scope</option>
        </select>
      </div>
      <div class="form-field" style="flex:1">
        <label>Notes</label>
        <input value="${esc(s.notes||'')}" placeholder="e.g. Shell fuel 12/03" onchange="updateSupp(${i},'notes',this.value)">
      </div>
      <button type="button" class="btn btn-delete" onclick="removeSupp(${i})" style="flex:0 0 auto;margin-bottom:2px">✕</button>
    </div>`;
  }).join('');
}

// Live preview for the rate inputs
function updateHireRatePreview(){
  const c=parseFloat(document.getElementById('hf-cost')?.value)||0;
  const u=parseFloat(document.getElementById('hf-upsell')?.value)||0;
  const rftRaw=document.getElementById('hf-rft')?.value;
  const r=rftRaw!==''&&rftRaw!=null?(parseFloat(rftRaw)||0):0;
  const el=document.getElementById('hf-rate-preview-val');if(!el)return;
  if(!c&&!u&&!r){el.textContent='£0.00 / day';el.style.color='var(--n400)';return;}
  const total=c+u+r;
  // Build the breakdown — only mention RFT if non-zero, to keep it tidy
  const parts=[`cost £${c.toFixed(2)}`,`upsell £${u.toFixed(2)}`];
  if(r)parts.push(`RFT £${r.toFixed(2)}`);
  el.textContent=`£${total.toFixed(2)} / day  (${parts.join(' + ')})`;
  el.style.color='var(--n700)';
}

async function saveHire(){
  const accountId=document.getElementById('hf-account').value;if(!accountId){toast('Customer account required','error');return;}
  const account=(allAccounts||[]).find(a=>a.id===accountId);if(!account){toast('Customer account not found','error');return;}
  // Persist a Dynamics-matched driver that couldn't be saved at match time (no
  // account chosen yet) now that we have the account.
  if(!document.getElementById('hf-driver-contact-id').value&&window._pendingDriverContact){
    const _row=await createContactFromDynamics(window._pendingDriverContact,accountId);
    if(_row){document.getElementById('hf-driver-contact-id').value=_row.id;window._pendingDriverContact=null;}
  }
  // Clean supplementaries: drop rows with no cost AND no upsell
  const cleanSupps=supps
    .filter(s=>{const c=suppCost(s),u=suppUpsell(s);return (c||u);})
    .map(s=>({type:s.type||'Other',cost_amount:suppCost(s),upsell_amount:suppUpsell(s),vat_status:s.vat_status||'full',notes:(s.notes||'').trim()||null}));
  // Strip ALL whitespace from reg + uppercase
  const regClean=(document.getElementById('hf-reg').value||'').replace(/\s+/g,'').toUpperCase()||null;
  const payload={customer:account.company_name,client_account_id:accountId,driver:document.getElementById('hf-driver').value.trim()||null,driver_contact_id:document.getElementById('hf-driver-contact-id').value||null,driver_mobile:document.getElementById('hf-mobile').value.trim()||null,reference:document.getElementById('hf-reference').value.trim()||null,hire_status:document.getElementById('hf-hire-status').value,billing_status:document.getElementById('hf-billing').value,delivery_address_line1:document.getElementById('hf-addr1').value.trim()||null,delivery_address_line2:document.getElementById('hf-addr2').value.trim()||null,delivery_town:document.getElementById('hf-town').value.trim()||null,delivery_county:document.getElementById('hf-county').value.trim()||null,delivery_postcode:(document.getElementById('hf-postcode').value||'').trim().toUpperCase()||null,vehicle_reg:regClean,make_model:document.getElementById('hf-makemodel').value.trim()||null,category:document.getElementById('hf-category').value||null,fuel_type:document.getElementById('hf-fuel').value||null,date_of_registration:document.getElementById('hf-reg-date').value||null,p11d_value:parseFloat(document.getElementById('hf-p11d').value)||null,co2_emissions:parseInt(document.getElementById('hf-co2').value,10)||null,engine_cc:parseInt(document.getElementById('hf-engine-cc').value,10)||null,ev_range:parseInt(document.getElementById('hf-ev-range').value,10)||null,supplier:document.getElementById('hf-supplier').value||null,supplier_ref:document.getElementById('hf-supplier-ref').value.trim()||null,start_date:document.getElementById('hf-start').value||null,end_date:document.getElementById('hf-end').value||null,tariff:document.getElementById('hf-tariff').value||null,preferred_start_time:document.getElementById('hf-start-time').value||null,cost_per_day:parseFloat(document.getElementById('hf-cost').value)||null,upsell_per_day:parseFloat(document.getElementById('hf-upsell').value)||null,rft_per_day:document.getElementById('hf-rft').value!==''?(parseFloat(document.getElementById('hf-rft').value)||0):null,vat_status:'full',supplementaries:cleanSupps,incoming_invoice_id:document.getElementById('hf-in-inv').value.trim()||null,outgoing_invoice_id:document.getElementById('hf-out-inv').value.trim()||null,notes:document.getElementById('hf-notes').value.trim()||null,updated_at:new Date().toISOString()};
  try{
    if(editHireId){await sbReq(`covase_hires?id=eq.${encodeURIComponent(editHireId)}`,{method:'PATCH',body:payload,prefer:'return=minimal'});const idx=allHires.findIndex(x=>x.id===editHireId);if(idx>=0)allHires[idx]={...allHires[idx],...payload};toast('Hire updated','success');}
    else{const res=await sbReq('covase_hires',{method:'POST',body:{...payload,id:'hire-'+Date.now()}});allHires.unshift(Array.isArray(res)?res[0]:res||{...payload,id:'hire-'+Date.now()});toast('Hire saved','success');}
    closeHireModal();hiresLoaded=false;loadHires();
  }catch(e){toast('Save failed: '+e.message,'error');}
}

// ─── Send booking request to supplier ───
// Matches the hire's supplier enum (e.g. "Fourways") to a supplier account by
// name (contains, either direction) so the booking_email can be looked up.
function findSupplierAccount(supplierEnum){
  const s=(supplierEnum||'').toLowerCase().trim();if(!s)return null;
  return (allAccounts||[]).find(a=>(a.type==='supplier')&&(((a.company_name||'').toLowerCase().includes(s))||(s.includes((a.company_name||'').toLowerCase()))))||null;
}
function renderSupplierSentState(h){
  const el=document.getElementById('hf-supplier-sent');if(!el)return;
  const ts=h&&h.supplier_email_sent_at;
  if(ts){const d=new Date(ts);const s=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});el.textContent='✓ Booking request sent '+s;el.style.color='var(--covase)';}
  else{el.textContent='Not yet sent to supplier';el.style.color='var(--n500)';}
}
function updateSendSupplierBtn(){
  const tb=document.getElementById('hf-thread-btn');if(tb)tb.style.display=editHireId?'':'none';
  const btn=document.getElementById('hf-send-supplier-btn');if(!btn)return;
  if(!editHireId){btn.style.display='none';return;}
  btn.style.display='';
  const status=document.getElementById('hf-hire-status').value;
  const supplier=document.getElementById('hf-supplier').value;
  const ohBtn=document.getElementById('hf-offhire-btn');
  if(ohBtn){
    const h=(allHires||[]).find(x=>x.id===editHireId);
    ohBtn.style.display=(editHireId&&['booked','active'].includes(status))?'':'none';
    ohBtn.textContent=(h&&h.offhire_requested_at)?'📦 Offhire (requested)':'📦 Offhire';
  }
  const eligible=['pending','requested','booked'].includes(status)&&!!supplier;
  btn.disabled=!eligible;
  btn.style.opacity=eligible?'':'0.5';
  btn.title=eligible?'Email this booking request to the supplier':'Enabled when status is Pending, Requested or Booked and a supplier is selected';
}
function openSendSupplier(){
  if(!editHireId){toast('Save the hire first, then send','error');return;}
  const h=(allHires||[]).find(x=>x.id===editHireId);if(!h){toast('Hire not found','error');return;}
  const supplierEnum=document.getElementById('hf-supplier').value;
  const acc=findSupplierAccount(supplierEnum);
  const email=acc&&acc.booking_email?acc.booking_email:'';
  const bits=[h.customer,h.vehicle_reg||'no reg yet',h.start_date].filter(Boolean).map(esc).join(' · ');
  document.getElementById('ss-summary').innerHTML='<strong>To: '+esc(supplierEnum||'—')+(email?' &lt;'+esc(email)+'&gt;':'')+'</strong><br>'+bits;
  const warn=document.getElementById('ss-warn'),sendBtn=document.getElementById('ss-send-btn');
  if(!email){warn.style.display='';warn.textContent=acc?('No booking email on the "'+acc.company_name+'" supplier account — add one in CRM → Accounts first.'):('No supplier account matches "'+(supplierEnum||'')+'". Add a supplier account with a booking email in CRM → Accounts.');sendBtn.disabled=true;sendBtn.style.opacity='0.5';}
  else{warn.style.display='none';sendBtn.disabled=false;sendBtn.style.opacity='';}
  document.getElementById('ss-notes').value='';
  ssRebuild(true);
  document.getElementById('send-supplier-modal').classList.add('open');
}
function hireEmailTokens(h,acc,notes){
  const addr=[h.delivery_address_line1,h.delivery_address_line2,h.delivery_town,h.delivery_county,h.delivery_postcode].filter(Boolean).join(', ');
  return {customer:h.customer||'',reference:h.reference||'',hireStatus:h.hire_status||'',driver:h.driver||'',driverMobile:h.driver_mobile||'',startDate:fmtUK(h.start_date),endDate:h.end_date?fmtUK(h.end_date):'TBC',tariff:h.tariff||'',preferredStartTime:h.preferred_start_time?String(h.preferred_start_time).slice(0,5):'',vehicleReg:h.vehicle_reg||'',vehicleMakeModel:h.make_model||'',category:h.category||'',fuelType:h.fuel_type||'',dateOfRegistration:fmtUK(h.date_of_registration),engineCc:h.engine_cc!=null?String(h.engine_cc):'',evRange:h.ev_range!=null?String(h.ev_range):'',co2:h.co2_emissions!=null?String(h.co2_emissions):'',p11d:h.p11d_value!=null?String(h.p11d_value):'',address:addr,addressLine1:h.delivery_address_line1||'',addressLine2:h.delivery_address_line2||'',town:h.delivery_town||'',county:h.delivery_county||'',postcode:h.delivery_postcode||'',supplierName:acc?(acc.company_name||''):'',supplierRef:h.supplier_ref||'',costPerDay:h.cost_per_day!=null?String(h.cost_per_day):'',rftPerDay:h.rft_per_day!=null?String(h.rft_per_day):'',hireNotes:h.notes||'',notes:notes||''};
}
// Render the template into the editable subject/body. Typing in the body sets
// ssDirty so note edits stop clobbering manual work; ↻ link forces a rebuild.
let ssDirty=false;
function ssRebuild(force){
  if(ssDirty&&!force)return;
  const h=(allHires||[]).find(x=>x.id===editHireId);if(!h)return;
  const acc=findSupplierAccount(document.getElementById('hf-supplier').value);
  const rendered=renderBookingTemplate(hireEmailTokens(h,acc,document.getElementById('ss-notes').value.trim()));
  const se=document.getElementById('ss-subject'),be=document.getElementById('ss-body');
  if(se)se.value=rendered.subject;
  if(be)be.innerHTML=rendered.html;
  ssDirty=false;
}
async function doSendSupplier(){
  if(!editHireId)return;
  const h=(allHires||[]).find(x=>x.id===editHireId);if(!h)return;
  const acc=findSupplierAccount(document.getElementById('hf-supplier').value);
  const email=acc&&acc.booking_email;if(!email){toast('No supplier booking email','error');return;}
  const url=getConfig().n8nSupplierBooking;if(!url){toast('Set the supplier booking webhook in Settings','error');return;}
  const subjEdited=(document.getElementById('ss-subject')?.value||'').trim();
  const bodyEdited=document.getElementById('ss-body')?.innerHTML||'';
  if(!subjEdited||!bodyEdited.trim()){toast('Subject and body needed — hit ↻ Rebuild if they are empty','error');return;}
  // Carry a machine-readable booking code in the subject so the reply agent can
  // match the supplier's response back to this exact hire.
  const subjectCoded=subjEdited+' ['+(h.job_ref||('CVB:'+editHireId))+']';
  const payload={to:email,subject:subjectCoded,bodyHtml:bodyEdited,customer:h.customer||''};
  const btn=document.getElementById('ss-send-btn');btn.disabled=true;btn.textContent='Sending…';
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok)throw new Error('Webhook returned '+r.status);
    const now=new Date().toISOString();
    try{await sbReq('covase_hires?id=eq.'+encodeURIComponent(editHireId),{method:'PATCH',body:{supplier_email_sent_at:now,hire_status:'requested'},prefer:'return=minimal'});}catch(e){}
    try{await sbReq('covase_supplier_replies',{method:'POST',body:{id:'sr-out-'+Date.now(),hire_id:editHireId,direction:'outbound',outcome:'booking_request',subject:subjectCoded,raw_body:bodyEdited,from_email:'rentals@covase.co.uk',received_at:now,status:'sent'},prefer:'return=minimal'});}catch(e){}
    const idx=(allHires||[]).findIndex(x=>x.id===editHireId);if(idx>=0){allHires[idx].supplier_email_sent_at=now;allHires[idx].hire_status='requested';}
    const stSel=document.getElementById('hf-hire-status');if(stSel)stSel.value='requested';
    renderSupplierSentState(idx>=0?allHires[idx]:h);
    updateSendSupplierBtn();
    toast('Booking request sent to '+acc.company_name+' — status set to Requested','success');
    closeSendSupplier();
    hiresLoaded=false;loadHires();
  }catch(e){toast('Send failed: '+e.message,'error');}
  finally{btn.disabled=false;btn.textContent='Send request';}
}
function closeSendSupplier(){document.getElementById('send-supplier-modal').classList.remove('open');}

// ─── Offhire: collection request to the supplier (template in covase_config 'offhire_booking_template') ───
const DEFAULT_OFFHIRE_TEMPLATE={
  subject:'Offhire request - {customer} - {vehicleReg}',
  body:'Hi {supplierName},\n\nPlease can you arrange collection / offhire of the following vehicle:\n\nVehicle: {vehicleReg} {makeModel}\nDriver: {driver}\nYour reference: {reference}\n\nCOLLECT FROM\n{collectionAddress}\nContact: {collectionContact} — {collectionPhone}\n\nCollection date: {collectionDate}\nCollection time: {collectionTime}\n\n{notes}\n\nPlease confirm collection.\n\nMany thanks,\nCovase Rentals'
};
let offhireTemplate={...DEFAULT_OFFHIRE_TEMPLATE};
async function loadOffhireTemplate(){try{const rows=await sbReq('covase_config?key=eq.offhire_booking_template&select=value');const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;if(v&&(v.subject||v.body))offhireTemplate={...DEFAULT_OFFHIRE_TEMPLATE,...v};}catch(e){}}
function openOffhireTemplate(){document.getElementById('oht-subject').value=offhireTemplate.subject;document.getElementById('oht-body').value=offhireTemplate.body;const cp=document.getElementById('config-panel');if(cp)cp.classList.remove('open');document.getElementById('offhire-template-modal').classList.add('open');}
function offhireTemplateReset(){document.getElementById('oht-subject').value=DEFAULT_OFFHIRE_TEMPLATE.subject;document.getElementById('oht-body').value=DEFAULT_OFFHIRE_TEMPLATE.body;}
async function saveOffhireTemplate(){
  offhireTemplate={subject:document.getElementById('oht-subject').value,body:document.getElementById('oht-body').value};
  try{await sbReq('covase_config',{method:'POST',body:{key:'offhire_booking_template',value:offhireTemplate,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});toast('Template saved','success');document.getElementById('offhire-template-modal').classList.remove('open');}
  catch(e){toast('Save failed: '+e.message,'error');}
}
function ohToggleSame(){const same=document.getElementById('oh-same').checked;document.getElementById('oh-addr-block').style.display=same?'none':'';if(typeof ohFieldChanged==='function')ohFieldChanged();}
function openOffhire(){
  if(!editHireId){toast('Save the hire first','error');return;}
  const h=(allHires||[]).find(x=>x.id===editHireId);if(!h){toast('Hire not found','error');return;}
  const acc=findSupplierAccount(document.getElementById('hf-supplier').value);
  const email=acc&&acc.booking_email?acc.booking_email:'';
  document.getElementById('oh-summary').innerHTML='<strong>To: '+esc(acc?acc.company_name:'—')+(email?' &lt;'+esc(email)+'&gt;':'')+'</strong><br>'+[h.customer,h.vehicle_reg,h.reference].filter(Boolean).map(esc).join(' · ');
  const warn=document.getElementById('oh-warn'),btn=document.getElementById('oh-send-btn');
  if(!email){warn.style.display='';warn.textContent=acc?('No booking email on "'+acc.company_name+'" — add one in CRM → Accounts.'):'Pick a supplier on the booking first.';btn.disabled=true;btn.style.opacity='0.5';}
  else{warn.style.display='none';btn.disabled=false;btn.style.opacity='';}
  const delAddr=[h.delivery_address_line1,h.delivery_town,h.delivery_county,h.delivery_postcode].filter(Boolean).join(', ');
  document.getElementById('oh-delivery-addr').textContent=delAddr||'no delivery address on record';
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v||'';};
  // Prefill: saved collection details first, else delivery address; contact defaults to the driver
  set('mv-offhire-contact',h.driver||'');set('mv-offhire-phone',h.driver_mobile||'');
  set('mv-offhire-addr1',h.collection_address_line1||h.delivery_address_line1);
  set('mv-offhire-addr2',h.collection_address_line2||h.delivery_address_line2);
  set('mv-offhire-town',h.collection_town||h.delivery_town);
  set('mv-offhire-county',h.collection_county||h.delivery_county);
  set('mv-offhire-postcode',h.collection_postcode||h.delivery_postcode);
  // Same-as-delivery unless a different collection address was previously saved
  const differs=h.collection_postcode&&h.delivery_postcode&&String(h.collection_postcode).replace(/\s/g,'').toUpperCase()!==String(h.delivery_postcode).replace(/\s/g,'').toUpperCase();
  document.getElementById('oh-same').checked=!differs&&!!delAddr;
  ohToggleSame();
  set('oh-date',h.collection_date?String(h.collection_date).slice(0,10):(h.end_date?String(h.end_date).slice(0,10):new Date().toISOString().slice(0,10)));
  set('oh-time',h.collection_time?String(h.collection_time).slice(0,5):'');
  set('oh-notes',h.offhire_notes||'');
  ohRebuild();
  document.getElementById('offhire-modal').classList.add('open');
}
// Build the offhire email tokens from the current modal fields
function ohTokens(){
  const h=(allHires||[]).find(x=>x.id===editHireId);if(!h)return null;
  const acc=findSupplierAccount(document.getElementById('hf-supplier').value);
  const g=id=>(document.getElementById(id)?.value||'').trim();
  const same=document.getElementById('oh-same').checked;
  const col=same
    ?{l1:h.delivery_address_line1||'',l2:h.delivery_address_line2||'',town:h.delivery_town||'',county:h.delivery_county||'',pc:h.delivery_postcode||''}
    :{l1:g('mv-offhire-addr1'),l2:g('mv-offhire-addr2'),town:g('mv-offhire-town'),county:g('mv-offhire-county'),pc:g('mv-offhire-postcode').toUpperCase()};
  return {h:h,acc:acc,col:col,colDate:g('oh-date'),colTime:g('oh-time'),tokens:{
    supplierName:acc?(acc.company_name||''):'',customer:h.customer||'',driver:h.driver||'',
    vehicleReg:h.vehicle_reg||'',makeModel:h.make_model||'',reference:h.reference||'',
    collectionAddress:[col.l1,col.l2,col.town,col.county,col.pc].filter(Boolean).join(', '),
    collectionContact:g('mv-offhire-contact')||h.driver||'—',collectionPhone:g('mv-offhire-phone')||h.driver_mobile||'—',
    collectionDate:g('oh-date')?fmtUK(g('oh-date')):'TBC',collectionTime:g('oh-time')||'anytime',notes:g('oh-notes')
  }};
}
let ohDirty=false;
function ohRebuild(){
  const ctx=ohTokens();if(!ctx)return;
  const se=document.getElementById('oh-subject-line'),be=document.getElementById('oh-body');
  if(se)se.value=fineRender(offhireTemplate.subject,ctx.tokens);
  if(be)be.value=fineRender(offhireTemplate.body,ctx.tokens);
  ohDirty=false;
}
// Field changes above re-render the email live UNTIL the body is hand-edited;
// after that the user's text wins and only the ↻ link overwrites it.
function ohFieldChanged(){if(!ohDirty)ohRebuild();}
async function doOffhireSend(){
  if(!editHireId)return;
  const h=(allHires||[]).find(x=>x.id===editHireId);if(!h)return;
  const acc=findSupplierAccount(document.getElementById('hf-supplier').value);
  const email=acc&&acc.booking_email;if(!email){toast('No supplier booking email','error');return;}
  const url=getConfig().n8nSupplierBooking;if(!url){toast('Set the supplier booking webhook in Settings','error');return;}
  const g=id=>(document.getElementById(id)?.value||'').trim();
  const ctx=ohTokens();if(!ctx)return;
  const col=ctx.col,colDate=ctx.colDate,colTime=ctx.colTime;
  if(!colDate){toast('Set a collection date','error');return;}
  if(!col.l1&&!col.pc){toast('No collection address — untick the box and enter one','error');return;}
  const subjEdited=g('oh-subject-line'),bodyText=g('oh-body');
  if(!subjEdited||!bodyText){toast('Subject and body needed — hit ↻ Rebuild if they are empty','error');return;}
  // Safety net: the email must actually mention the collection address. Catches
  // the body being edited/rendered before the address was filled in.
  const addrMentioned=(col.l1&&bodyText.includes(col.l1))||(col.pc&&bodyText.toUpperCase().includes(col.pc.toUpperCase()));
  if(!addrMentioned&&!confirm('The email body does not mention the collection address ('+(col.l1||col.pc)+').\n\nOK = send anyway.\nCancel = go back (tip: press "↻ Rebuild from details above" to refresh the email, then re-apply any wording changes).'))return;
  const subject=subjEdited+' ['+(h.job_ref||('CVB:'+editHireId))+']';
  const bodyHtml='<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">'+esc(bodyText).replace(/\n/g,'<br>')+'</div>';
  const btn=document.getElementById('oh-send-btn');btn.disabled=true;btn.textContent='Sending…';
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:email,subject:subject,bodyHtml:bodyHtml,customer:h.customer||''})});
    if(!r.ok)throw new Error('Webhook returned '+r.status);
    const now=new Date().toISOString();
    const patch={collection_address_line1:col.l1||null,collection_address_line2:col.l2||null,collection_town:col.town||null,collection_county:col.county||null,collection_postcode:col.pc||null,collection_date:colDate,collection_time:colTime||null,offhire_notes:g('oh-notes')||null,offhire_requested_at:now,updated_at:now};
    try{await sbReq('covase_hires?id=eq.'+encodeURIComponent(editHireId),{method:'PATCH',body:patch,prefer:'return=minimal'});}catch(e){}
    try{await sbReq('covase_supplier_replies',{method:'POST',body:{id:'sr-out-'+Date.now(),hire_id:editHireId,direction:'outbound',outcome:'offhire_request',subject:subject,raw_body:bodyText,from_email:'rentals@covase.co.uk',received_at:now,status:'sent'},prefer:'return=minimal'});}catch(e){}
    Object.assign(h,patch);
    toast('Offhire request sent to '+acc.company_name+' — collection '+fmtUK(colDate)+(colTime?' '+colTime:''),'success');
    document.getElementById('offhire-modal').classList.remove('open');
    hiresLoaded=false;loadHires();
  }catch(e){toast('Send failed: '+e.message,'error');}
  finally{btn.disabled=false;btn.textContent='Send offhire request';}
}

// ─── Supplier booking email template (WYSIWYG; shared via covase_config) ───
const ET_FIELD_GROUPS=[
  {g:'Customer & job',f:[['customer','Customer'],['reference','Booking reference'],['hireStatus','Hire status']]},
  {g:'Driver',f:[['driver','Driver name'],['driverMobile','Driver mobile']]},
  {g:'Dates',f:[['startDate','Start date'],['endDate','End date (blank shows TBC)'],['tariff','Tariff (duration band)'],['preferredStartTime','Preferred delivery time']]},
  {g:'Vehicle',f:[['vehicleReg','Registration'],['vehicleMakeModel','Make / model'],['category','Category'],['fuelType','Fuel type'],['dateOfRegistration','Date of registration'],['engineCc','Engine (cc)'],['evRange','EV range (miles)'],['co2','CO2 (g/km)'],['p11d','P11D value']]},
  {g:'Delivery address',f:[['address','Full address (one line)'],['addressLine1','Address line 1'],['addressLine2','Address line 2'],['town','Town'],['county','County'],['postcode','Postcode']]},
  {g:'Supplier',f:[['supplierName','Supplier name'],['supplierRef','Supplier invoice ref']]},
  {g:'Rates',f:[['costPerDay','Cost/day (supplier)'],['rftPerDay','RFT/day']]},
  {g:'Notes',f:[['hireNotes','Hire notes'],['notes','Note added when sending']]}
];
const DEFAULT_BOOKING_SUBJECT='Booking request - {{customer}} - {{startDate}}';
const DEFAULT_BOOKING_BODY='<p>Hi {{supplierName}},</p><p>Please could you arrange the following vehicle hire on our behalf:</p><p>Our reference: <strong>{{reference}}</strong><br>Customer: <strong>{{customer}}</strong><br>Hire dates: <strong>{{startDate}} to {{endDate}}</strong><br>Vehicle: <strong>{{vehicleReg}} {{vehicleMakeModel}}</strong><br>Driver: <strong>{{driver}} {{driverMobile}}</strong><br>Deliver to: <strong>{{address}}</strong><br>Preferred delivery time: <strong>{{preferredStartTime}}</strong></p><p>{{notes}}</p><p>Please confirm availability and your reservation number.</p><p>Many thanks,<br>Covase Rentals</p>';
let bookingTemplate={subject:DEFAULT_BOOKING_SUBJECT,bodyHtml:DEFAULT_BOOKING_BODY};
let etSavedRange=null;
async function loadBookingTemplate(){
  try{
    const rows=await sbReq('covase_config?key=eq.supplier_booking_template&select=value');
    const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;
    if(v&&(v.subject||v.bodyHtml))bookingTemplate={subject:v.subject||DEFAULT_BOOKING_SUBJECT,bodyHtml:v.bodyHtml||DEFAULT_BOOKING_BODY};
  }catch(e){/* covase_config may not exist yet — keep defaults */}
}
function openEmailTemplate(){
  document.getElementById('et-subject').value=bookingTemplate.subject||DEFAULT_BOOKING_SUBJECT;
  document.getElementById('et-body').innerHTML=bookingTemplate.bodyHtml||DEFAULT_BOOKING_BODY;
  const sel=document.getElementById('et-field-select');
  if(sel&&sel.options.length<=1){ET_FIELD_GROUPS.forEach(grp=>{const og=document.createElement('optgroup');og.label=grp.g;grp.f.forEach(pair=>{const o=document.createElement('option');o.value=pair[0];o.textContent=pair[1]+'  {{'+pair[0]+'}}';og.appendChild(o);});sel.appendChild(og);});}
  document.getElementById('et-preview').style.display='none';
  const cp=document.getElementById('config-panel');if(cp)cp.classList.remove('open');
  etSavedRange=null;
  document.getElementById('email-template-modal').classList.add('open');
}
function closeEmailTemplate(){document.getElementById('email-template-modal').classList.remove('open');}
function etSaveRange(){const s=window.getSelection();if(s&&s.rangeCount){const r=s.getRangeAt(0);const ed=document.getElementById('et-body');if(ed&&ed.contains(r.commonAncestorContainer))etSavedRange=r.cloneRange();}}
function etRestore(){const ed=document.getElementById('et-body');ed.focus();if(etSavedRange){const s=window.getSelection();s.removeAllRanges();s.addRange(etSavedRange);}}
function etCmd(cmd){etRestore();document.execCommand(cmd,false,null);etSaveRange();}
function etSize(v){if(!v)return;etRestore();document.execCommand('fontSize',false,v);etSaveRange();}
function etFont(v){if(!v)return;etRestore();document.execCommand('fontName',false,v);etSaveRange();}
function etColor(c){etRestore();document.execCommand('foreColor',false,c);etSaveRange();}
function etLink(){const u=prompt('Link URL (include https://)');if(!u)return;etRestore();document.execCommand('createLink',false,u);etSaveRange();}
function etField(token){if(!token)return;etRestore();document.execCommand('insertText',false,'{{'+token+'}}');etSaveRange();}
function etResetDefault(){document.getElementById('et-subject').value=DEFAULT_BOOKING_SUBJECT;document.getElementById('et-body').innerHTML=DEFAULT_BOOKING_BODY;document.getElementById('et-preview').style.display='none';}
function sampleTokens(){return{customer:'Woodland Trust',reference:'CV-1042',hireStatus:'booked',driver:'Jane Doe',driverMobile:'07700 900123',startDate:'03/08/2026',endDate:'10/08/2026',tariff:'7-27 days',preferredStartTime:'09:00',vehicleReg:'AB12 CDE',vehicleMakeModel:'Ford Transit Custom',category:'Panel van',fuelType:'Diesel',dateOfRegistration:'01/03/2023',engineCc:'1995',evRange:'248',co2:'165',p11d:'32450',address:'1 High Street, Brighton, East Sussex, BN1 1AA',addressLine1:'1 High Street',addressLine2:'',town:'Brighton',county:'East Sussex',postcode:'BN1 1AA',supplierName:'Fourways',supplierRef:'FVSL048267',costPerDay:'62.50',rftPerDay:'',hireNotes:'Customer prefers morning delivery.',notes:'Tail lift preferred if available.'};}
// Email clients add margins around block elements, so the editor's <div>/<p>
// per-line output comes out double-spaced. Zero the block margins and turn
// empty blocks into a single <br> so the email renders like the editor.
function normalizeEmailHtml(html){
  if(!html)return html;
  let h=html;
  h=h.replace(/<(p|div)\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi,'<br>');
  h=h.replace(/<p\b(?![^>]*style=)/gi,'<p style="margin:0;padding:0"');
  h=h.replace(/<div\b(?![^>]*style=)/gi,'<div style="margin:0;padding:0"');
  return h;
}
function fmtUK(v){if(!v)return '';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?(m[3]+'/'+m[2]+'/'+m[1]):String(v);}
function renderBookingTemplate(t){
  const sub=(bookingTemplate.subject||DEFAULT_BOOKING_SUBJECT).replace(/\{\{(\w+)\}\}/g,(m,k)=>String(t[k]!=null?t[k]:''));
  let body=(bookingTemplate.bodyHtml||DEFAULT_BOOKING_BODY).replace(/\{\{(\w+)\}\}/g,(m,k)=>esc(String(t[k]!=null?t[k]:'')).split('\n').join('<br>'));
  body=normalizeEmailHtml(body);
  const html='<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">'+body+'</div>';
  return{subject:sub,html:html};
}
function etPreview(){
  const prevTpl=bookingTemplate;
  bookingTemplate={subject:document.getElementById('et-subject').value,bodyHtml:document.getElementById('et-body').innerHTML};
  const r=renderBookingTemplate(sampleTokens());
  bookingTemplate=prevTpl;
  const pv=document.getElementById('et-preview');
  pv.innerHTML='<div style="font-size:11px;color:var(--n400);margin-bottom:6px">Subject: <strong>'+esc(r.subject)+'</strong></div>'+r.html;
  pv.style.display='';
}
async function saveEmailTemplate(){
  const subject=document.getElementById('et-subject').value.trim()||DEFAULT_BOOKING_SUBJECT;
  const bodyHtml=document.getElementById('et-body').innerHTML;
  bookingTemplate={subject,bodyHtml};
  try{
    await sbReq('covase_config',{method:'POST',body:{key:'supplier_booking_template',value:{subject,bodyHtml},updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});
    toast('Booking email template saved','success');closeEmailTemplate();
  }catch(e){toast('Save failed: '+e.message+' (is covase_config applied?)','error');}
}

// ─── Reply agent instructions (hire + movement agents, shared via covase_config) ───
const DEFAULT_AGENT_INSTRUCTIONS='Objectives: get each vehicle booking confirmed by the supplier and capture the assigned vehicle details.\n\nProcess:\n- If the supplier is only acknowledging or says they are working on it, send a brief thank-you and take no other action.\n- If they ask a question, flag it for the team to answer.\n- When they confirm, capture the reservation reference and the vehicle details (registration, make/model, P11D, fuel type, CO2, engine cc, date of first registration).\n- If they decline, flag it so we can re-source with another supplier.\n- When they confirm collection of a vehicle we asked them to off-hire, capture the confirmed collection date.\n\nTone of replies: friendly, concise and professional. British English. Sign off as "Covase Rentals".';
const DEFAULT_MOVEMENT_AGENT_INSTRUCTIONS='Objectives: get each vehicle movement job covered by the supplier at a sensible price, and capture their commitment.\n\nProcess:\n- When they confirm they can cover the job, capture their quoted price (ex VAT) and any collection/delivery dates they commit to.\n- If they decline or cannot cover it, flag it so we can re-source with another supplier.\n- If they ask a question (access, keys, timing, fuel), flag it for the team to answer.\n- A bare acknowledgement (checking availability, will come back to us) needs no action.\n\nBritish English throughout.';
const AGENT_KINDS={
  hire:{key:'supplier_agent_instructions',title:'Supplier reply agent — instructions',def:DEFAULT_AGENT_INSTRUCTIONS},
  movement:{key:'movement_agent_instructions',title:'Movement reply agent (logistics@) — instructions',def:DEFAULT_MOVEMENT_AGENT_INSTRUCTIONS}
};
let agentInstructions=DEFAULT_AGENT_INSTRUCTIONS;
let movementAgentInstructions=DEFAULT_MOVEMENT_AGENT_INSTRUCTIONS;
let agentModalKind='hire';
async function loadAgentInstructions(){
  try{
    const rows=await sbReq('covase_config?key=in.(supplier_agent_instructions,movement_agent_instructions)&select=key,value');
    (Array.isArray(rows)?rows:[]).forEach(r=>{
      if(typeof r.value==='string'&&r.value.trim()){
        if(r.key==='supplier_agent_instructions')agentInstructions=r.value;
        if(r.key==='movement_agent_instructions')movementAgentInstructions=r.value;
      }
    });
  }catch(e){}
}
function openAgentInstructions(kind){
  agentModalKind=(kind==='movement')?'movement':'hire';
  const cfg=AGENT_KINDS[agentModalKind];
  document.getElementById('agent-modal-title').textContent=cfg.title;
  document.getElementById('agent-instructions-text').value=(agentModalKind==='movement'?movementAgentInstructions:agentInstructions)||cfg.def;
  const cp=document.getElementById('config-panel');if(cp)cp.classList.remove('open');
  document.getElementById('agent-modal').classList.add('open');
}
function closeAgentInstructions(){document.getElementById('agent-modal').classList.remove('open');}
function resetAgentInstructions(){document.getElementById('agent-instructions-text').value=AGENT_KINDS[agentModalKind].def;}
async function saveAgentInstructions(){
  const cfg=AGENT_KINDS[agentModalKind];
  const text=document.getElementById('agent-instructions-text').value.trim()||cfg.def;
  if(agentModalKind==='movement')movementAgentInstructions=text;else agentInstructions=text;
  try{await sbReq('covase_config',{method:'POST',body:{key:cfg.key,value:text,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});toast('Agent instructions saved — they apply on the next reply the agent reads','success');closeAgentInstructions();}
  catch(e){toast('Save failed: '+e.message+' (is covase_config applied?)','error');}
}

// ─── Supplier replies review queue + correspondence thread ───
let allSupplierReplies=[];
async function loadSupplierReplies(){
  const el=document.getElementById('supplier-replies-list');
  try{
    if(!hiresLoaded){try{allHires=await sbReq('covase_hires?order=start_date.desc&limit=500');hiresLoaded=true;}catch(e){}}
    if(!movementsLoaded){try{await loadMovements();}catch(e){}}
    const rows=await sbReq('covase_supplier_replies?status=in.(needs_review,unmatched)&order=received_at.desc&limit=200');
    allSupplierReplies=Array.isArray(rows)?rows:[];
    const b=document.getElementById('badge-supplier-replies');if(b)b.textContent=String(allSupplierReplies.length);
    renderSupplierReplies();
  }catch(e){if(el)el.innerHTML='<div class="empty-state"><div class="empty-title">Load failed</div><div class="empty-sub">'+esc(e.message)+' (is covase_supplier_replies applied?)</div></div>';}
}
async function checkRepliesNow(){
  const url=getConfig().n8nReplyCheck;if(!url){toast('Set the reply check-now webhook in Settings','error');return;}
  const mvUrl=localStorage.getItem('covase_n8n_movementcheck_webhook')||'https://covase.app.n8n.cloud/webhook/covase-movement-reply-check';
  toast('Checking rentals@ + logistics@ for new replies…','success');
  try{await fetch(url,{method:'GET',mode:'cors'});}catch(e){/* fire-and-forget; the run still triggers */}
  try{await fetch(mvUrl,{method:'GET',mode:'cors'});}catch(e){}
  setTimeout(loadSupplierReplies,6000);
}
function hireLabel(hireId){const h=(allHires||[]).find(x=>x.id===hireId);return h?((h.customer||'?')+' · '+(h.vehicle_reg||'no reg')+' · '+(h.supplier||'?')):(hireId||'—');}
function renderSupplierReplies(){
  const el=document.getElementById('supplier-replies-list');if(!el)return;
  if(!allSupplierReplies.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">✉</div><div class="empty-title">Nothing to review</div><div class="empty-sub">Supplier replies needing action will appear here.</div></div>';return;}
  const chips={confirmed:'#0a7a72',offhire_confirmed:'#0a7a72',declined:'var(--tl-red-t)',needs_info:'#b45309',alternative:'#6d28d9',unclear:'var(--n500)'};
  // Sort newest → oldest so the chronology reads top-to-bottom. Falls back to
  // created_at when a row has no received_at, so nothing floats out of order.
  const rowsSorted=allSupplierReplies.slice().sort((a,b)=>{
    const ta=new Date(a.received_at||a.created_at||0).getTime();
    const tb=new Date(b.received_at||b.created_at||0).getTime();
    return (isNaN(tb)?0:tb)-(isNaN(ta)?0:ta);
  });
  el.innerHTML=rowsSorted.map(r=>{
    const oc=r.outcome||'unclear';
    const whenTxt=(r.received_at||r.created_at)?new Date(r.received_at||r.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    const d=[];
    if(r.reservation_number)d.push('Ref: '+esc(r.reservation_number));
    if(r.vehicle_reg)d.push('Reg: '+esc(r.vehicle_reg));
    if(r.vehicle_makemodel)d.push(esc(r.vehicle_makemodel));
    if(r.fuel_type)d.push(esc(r.fuel_type));
    if(r.co2_emissions!=null)d.push('CO2 '+esc(r.co2_emissions));
    if(r.engine_cc!=null)d.push(esc(r.engine_cc)+'cc');
    if(r.ev_range!=null)d.push('Range '+esc(r.ev_range)+' mi');
    if(r.p11d_value!=null)d.push('P11D £'+esc(r.p11d_value));
    if(r.date_of_registration)d.push('Reg date '+esc(fmtUK(r.date_of_registration)));
    if(r.agreed_start_date||r.agreed_end_date)d.push('Dates '+esc(fmtUK(r.agreed_start_date)||'?')+' → '+esc(fmtUK(r.agreed_end_date)||'?'));
    if(r.price!=null)d.push('Price £'+esc(r.price));
    const isMv=!!r.movement_id;
    const unmatched=(r.status==='unmatched'||(!r.hire_id&&!r.movement_id));
    const hireOpts=(allHires||[]).filter(h=>h.hire_status!=='cancelled').map(h=>'<option value="h:'+esc(h.id)+'">'+esc((h.customer||'?')+' · '+(h.driver||'?')+' · '+(h.vehicle_reg||'no reg')+(h.reference?' · '+h.reference:'')+(h.start_date?' · '+fmtUK(h.start_date):'')+' ['+(h.hire_status||'')+']')+'</option>').join('');
    const mvOpts=(allMovements||[]).filter(m=>!['paid','cancelled'].includes(m.movement_status)).map(m=>'<option value="m:'+esc(m.id)+'">'+esc([(m.job_ref||''),(m.customer||'?'),(m.vehicle_reg||'no reg'),(m.movement_date?fmtUK(m.movement_date):''),'['+(m.movement_status||'')+']'].filter(Boolean).join(' · '))+'</option>').join('');
    const linkOpts='<optgroup label="Hires">'+hireOpts+'</optgroup><optgroup label="Movements">'+mvOpts+'</optgroup>';
    let a='';
    if(unmatched){
      a+='<select id="link-sel-'+r.id+'" style="font-size:12px;padding:5px 8px;border:1px solid var(--n200);border-radius:6px;max-width:300px"><option value="">— link to hire or movement —</option>'+linkOpts+'</select>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px;background:var(--covase);color:#fff;border-color:var(--covase)" onclick="linkUnmatched(\''+r.id+'\')">Link</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="openReplyFromQueue(\''+r.id+'\')">Reply</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="dismissReply(\''+r.id+'\')">Dismiss</button>';
    }else if(isMv){
      if(oc==='confirmed')a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px;background:var(--covase);color:#fff;border-color:var(--covase)" onclick="applyMovementReply(\''+r.id+'\')">Apply to movement</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="openReplyFromQueue(\''+r.id+'\')">Reply</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="openThread(\''+esc(r.movement_id)+'\',\'mv\')">View thread</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="openMovementById(\''+esc(r.movement_id)+'\')">Open movement</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="toggleRelink(\''+r.id+'\')">Re-link</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="dismissReply(\''+r.id+'\')">Dismiss</button>';
    }else{
      if(['confirmed','needs_info','alternative','offhire_confirmed'].includes(oc))a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px;background:var(--covase);color:#fff;border-color:var(--covase)" onclick="applyReply(\''+r.id+'\')">'+(oc==='offhire_confirmed'?'Apply — collection confirmed':'Apply to booking')+'</button>';
      if(oc==='declined')a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="resourceReply(\''+r.id+'\')">Keep Requested · re-source</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="openReplyFromQueue(\''+r.id+'\')">Reply</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="openThread(\''+esc(r.hire_id)+'\')">View thread</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="openHireById(\''+esc(r.hire_id)+'\')">Open hire</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="toggleRelink(\''+r.id+'\')">Re-link</button>';
      a+='<button class="btn btn-secondary" style="font-size:12px;padding:5px 10px" onclick="dismissReply(\''+r.id+'\')">Dismiss</button>';
    }
    const q=r.questions?('<div style="margin-top:6px;color:var(--tl-red-t);font-size:12px"><strong>Question:</strong> '+esc(r.questions)+'</div>'):'';
    const headerLeft=unmatched?('<div style="font-weight:600;color:var(--tl-red-t)">⚠ Unmatched · '+esc(r.from_email||'supplier')+'</div>'):('<div style="font-weight:600">'+esc(isMv?mvJobLabel(r.movement_id):hireLabel(r.hire_id))+'</div>');
    return '<div style="border:1px solid '+(unmatched?'var(--tl-red-t)':'var(--n200)')+';border-radius:10px;padding:14px;margin-bottom:10px;background:#fff">'
      +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'+headerLeft+'<span style="font-size:11px;font-weight:700;color:'+(chips[oc]||'var(--n500)')+';text-transform:uppercase">'+esc(oc)+(r.confidence!=null?' · '+Math.round(r.confidence*100)+'%':'')+'</span></div>'
      +(whenTxt?'<div style="font-size:11px;color:var(--n400);margin-top:3px">🕐 '+esc(whenTxt)+'</div>':'')
      +(unmatched&&r.subject?'<div style="font-size:11px;color:var(--n500);margin-top:2px">Subject: '+esc(r.subject)+'</div>':'')
      +'<div style="font-size:12px;color:var(--n600);margin-top:4px">'+esc(r.summary||'')+'</div>'
      +(d.length?'<div style="font-size:12px;color:var(--n700);margin-top:6px">'+d.join(' · ')+'</div>':'')
      +q
      +attChips(r)
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center">'+a+'</div>'
      +(!unmatched?'<div id="relink-'+r.id+'" style="display:none;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px"><span style="font-size:11px;color:var(--n500)">Wrong job? Link to:</span><select id="link-sel-'+r.id+'" style="font-size:12px;padding:5px 8px;border:1px solid var(--n200);border-radius:6px;max-width:300px"><option value="">— choose hire or movement —</option>'+linkOpts+'</select><button class="btn btn-secondary" style="font-size:12px;padding:5px 10px;background:var(--covase);color:#fff;border-color:var(--covase)" onclick="linkUnmatched(\''+r.id+'\')">Re-link</button></div>':'')
      +'</div>';
  }).join('');
}
function openHireById(hireId){if((allHires||[]).some(x=>x.id===hireId))openEditHire(hireId);else toast('Open Short Hires first, then retry','error');}
async function applyReply(id){
  const r=allSupplierReplies.find(x=>x.id===id);if(!r)return;
  if(!r.hire_id){toast('No hire linked to this reply','error');return;}
  const now=new Date().toISOString();
  if(r.outcome==='offhire_confirmed'){
    // Collection confirmed: record any supplier-stated date/time; the booking
    // only moves to Off-hired when the collection date/time actually arrives.
    const p={updated_at:now};
    if(r.agreed_end_date)p.collection_date=r.agreed_end_date;
    try{
      await sbReq('covase_hires?id=eq.'+encodeURIComponent(r.hire_id),{method:'PATCH',body:p,prefer:'return=minimal'});
      await sbReq('covase_supplier_replies?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:{status:'applied'},prefer:'return=minimal'});
      toast('Collection confirmed'+(r.agreed_end_date?' for '+fmtUK(r.agreed_end_date):'')+' — booking will off-hire when the time arrives','success');
      hiresLoaded=false;loadHires();loadSupplierReplies();
    }catch(e){toast('Apply failed: '+e.message,'error');}
    return;
  }
  const patch={hire_status:'booked',updated_at:now};
  if(r.reservation_number)patch.reference=r.reservation_number;
  if(r.vehicle_reg)patch.vehicle_reg=r.vehicle_reg;
  if(r.vehicle_makemodel)patch.make_model=r.vehicle_makemodel;
  if(r.p11d_value!=null)patch.p11d_value=r.p11d_value;
  if(r.fuel_type)patch.fuel_type=r.fuel_type;
  if(r.co2_emissions!=null)patch.co2_emissions=r.co2_emissions;
  if(r.engine_cc!=null)patch.engine_cc=r.engine_cc;
  if(r.ev_range!=null)patch.ev_range=r.ev_range;
  if(r.date_of_registration)patch.date_of_registration=r.date_of_registration;
  if(r.agreed_start_date)patch.start_date=r.agreed_start_date;
  if(r.agreed_end_date)patch.end_date=r.agreed_end_date;
  try{
    await sbReq('covase_hires?id=eq.'+encodeURIComponent(r.hire_id),{method:'PATCH',body:patch,prefer:'return=minimal'});
    await sbReq('covase_supplier_replies?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:{status:'applied'},prefer:'return=minimal'});
    toast('Booking updated from reply — set to Booked','success');
    hiresLoaded=false;loadHires();loadSupplierReplies();
  }catch(e){toast('Apply failed: '+e.message,'error');}
}
async function resourceReply(id){
  try{await sbReq('covase_supplier_replies?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:{status:'resourced'},prefer:'return=minimal'});toast('Flagged to re-source — hire kept as Requested','success');loadSupplierReplies();}
  catch(e){toast('Failed: '+e.message,'error');}
}
async function dismissReply(id){
  try{await sbReq('covase_supplier_replies?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:{status:'dismissed'},prefer:'return=minimal'});loadSupplierReplies();}
  catch(e){toast('Failed: '+e.message,'error');}
}
function toggleRelink(id){const el=document.getElementById('relink-'+id);if(el)el.style.display=el.style.display==='none'?'flex':'none';}
async function linkUnmatched(id){
  const sel=document.getElementById('link-sel-'+id);const v=sel?sel.value:'';
  if(!v){toast('Pick a hire or movement to link this email to','error');return;}
  const isMv=v.startsWith('m:');
  const target=v.slice(2);
  const patch=isMv?{movement_id:target,hire_id:null,status:'needs_review'}:{hire_id:target,movement_id:null,status:'needs_review'};
  try{
    await sbReq('covase_supplier_replies?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:patch,prefer:'return=minimal'});
    toast('Linked to '+(isMv?'movement':'booking')+' — now in the review queue','success');loadSupplierReplies();
  }catch(e){toast('Link failed: '+e.message,'error');}
}
async function applyMovementReply(id){
  const r=allSupplierReplies.find(x=>x.id===id);if(!r)return;
  if(!r.movement_id){toast('No movement linked to this reply','error');return;}
  const now=new Date().toISOString();
  const m=(allMovements||[]).find(x=>x.id===r.movement_id);
  const patch={updated_at:now};
  if(!m||m.movement_status==='quoted')patch.movement_status='booked';
  try{
    await sbReq('covase_movements?id=eq.'+encodeURIComponent(r.movement_id),{method:'PATCH',body:patch,prefer:'return=minimal'});
    await sbReq('covase_supplier_replies?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:{status:'applied'},prefer:'return=minimal'});
    toast('Movement confirmed'+(patch.movement_status?' — set to Booked':'')+(r.price!=null?' · supplier quoted £'+r.price+' — check pricing':''),'success');
    movementsLoaded=false;loadMovements();loadSupplierReplies();
  }catch(e){toast('Apply failed: '+e.message,'error');}
}
function openMovementById(id){if((allMovements||[]).some(x=>x.id===id)){showView('movements');openEditMovement(id);}else toast('Movement not found — refresh Movements and retry','error');}
function mvJobLabel(id){
  const m=(allMovements||[]).find(x=>x.id===id);if(!m)return id||'—';
  return '🚚 '+[(m.job_ref||''),(m.customer||''),(m.vehicle_reg||'no reg'),(m.movement_date?fmtUK(m.movement_date):'')].filter(Boolean).join(' · ');
}
function cleanReplyText(t){if(!t)return '';const s=String(t);const cut=s.search(/\bFrom:\s/);return (cut>20?s.slice(0,cut):s).trim();}
function toggleThreadMsg(i){const b=document.getElementById('thread-body-'+i);const c=document.getElementById('thread-chev-'+i);if(!b)return;const open=b.style.display==='none';b.style.display=open?'block':'none';if(c)c.textContent=open?'▾':'▸';}
async function openThread(id,kind){
  kind=(kind==='mv')?'mv':'hire';
  if(!id){toast('Nothing linked','error');return;}
  document.getElementById('thread-title').textContent='Correspondence — '+(kind==='mv'?mvJobLabel(id):hireLabel(id));
  const body=document.getElementById('thread-body');body.innerHTML='<div class="loading">Loading…</div>';
  document.getElementById('thread-modal').classList.add('open');
  try{
    const col=kind==='mv'?'movement_id':'hire_id';
    const rows=await sbReq('covase_supplier_replies?'+col+'=eq.'+encodeURIComponent(id)+'&order=received_at.asc&limit=200');
    const msgs=Array.isArray(rows)?rows:[];
    window._threadMsgs=msgs;window._threadKind=kind;
    window._threadHireId=kind==='hire'?id:null;window._threadMvId=kind==='mv'?id:null;
    if(!msgs.length){body.innerHTML='<div class="empty-state"><div class="empty-title">No emails yet</div><div class="empty-sub">Requests and replies for this job will show here. Use ✉ New message to start the conversation.</div></div>';return;}
    const last=msgs.length-1;
    body.innerHTML=msgs.map((m,i)=>{
      const outbound=m.direction==='outbound';
      const who=outbound?(kind==='mv'?'Covase Logistics':'Covase Rentals'):(m.from_email||'Supplier');
      const arrow=outbound?'↑':'↓';
      const when=m.received_at?new Date(m.received_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
      const OUT_LABELS={booking_request:'Booking request',movement_request:'Movement request',offhire_request:'Offhire request',acknowledgement_sent:'Acknowledgement',manual_reply:'Reply',chase:'Chase / message'};
      const label=outbound?(OUT_LABELS[m.outcome]||'Sent'):(m.outcome||'reply');
      const snippet=m.summary?m.summary:(outbound?'':cleanReplyText(m.raw_body||'').slice(0,100));
      const content=outbound?(m.raw_body||''):esc(cleanReplyText(m.raw_body||''));
      const open=false;
      return '<div style="border:1px solid var(--n200);border-radius:10px;margin-bottom:8px;overflow:hidden;background:'+(outbound?'var(--covase-l)':'#fff')+'">'
        +'<div onclick="toggleThreadMsg('+i+')" style="cursor:pointer;padding:9px 12px;display:flex;gap:8px;align-items:flex-start">'
          +'<span style="font-size:12px;color:var(--n400);margin-top:1px" id="thread-chev-'+i+'">'+(open?'▾':'▸')+'</span>'
          +'<div style="flex:1;min-width:0">'
            +'<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--n500)"><span><strong>'+arrow+' '+esc(who)+'</strong> · '+esc(label)+'</span><span>'+esc(when)+'</span></div>'
            +(snippet?'<div style="font-size:12px;color:var(--n600);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(snippet)+'</div>':'')
          +'</div>'
        +'</div>'
        +'<div id="thread-body-'+i+'" style="display:'+(open?'block':'none')+';padding:0 12px 12px 32px;border-top:1px solid var(--n100)">'
          +'<div style="font-size:11px;color:var(--n500);margin-top:8px">'+esc(m.subject||'')+'</div>'
          +'<div style="font-size:12px;color:var(--n700);margin-top:6px;white-space:pre-wrap">'+content+'</div>'
          +attChips(m)
        +'</div></div>';
    }).join('');
  }catch(e){body.innerHTML='<div class="empty-state"><div class="empty-title">Load failed</div><div class="empty-sub">'+esc(e.message)+'</div></div>';}
}
function closeThread(){document.getElementById('thread-modal').classList.remove('open');}

// ─── Manual human reply to a supplier (rentals@ for hires, logistics@ for movements) ───
let replyCtx=null;
function openReplyModal(messageId,hireId,sourceReplyId,contextLabel,movementId,toEmail,origSubject){
  if(!messageId){toast('That message has no email id to reply to','error');return;}
  const from=movementId?'logistics@covase.co.uk':'rentals@covase.co.uk';
  replyCtx={mode:'reply',messageId:messageId,hireId:hireId||null,movementId:movementId||null,from:from,sourceReplyId:sourceReplyId||null,subject:origSubject||''};
  document.getElementById('reply-context').textContent=(contextLabel||('Reply for '+hireLabel(hireId)))+' · from '+from+' · in-thread';
  document.getElementById('reply-to').value=toEmail||'';
  document.getElementById('reply-text').value='';
  document.getElementById('reply-modal').classList.add('open');
}
// Suppliers send automated confirmations from unattended addresses — Fourways
// use noreply@fvsl.co.uk — and a reply there is silently binned. Resolve a real
// inbox instead, and refuse to send to one of these at all.
const NOREPLY_RE=/^(no[-._]?reply|do[-._]?not[-._]?reply|mailer[-._]?daemon|postmaster|bounce[sd]?)@/i;
function isNoReplyAddress(e){return NOREPLY_RE.test(String(e||'').trim());}
// The supplier's real booking inbox, from CRM rather than hardcoded: for
// Fourways that is fvs@fvsl.co.uk, the same address composeToSupplier uses.
function supplierAccountForReply(r){
  if(!r)return null;
  if(r.movement_id){
    const m=(allMovements||[]).find(x=>x.id===r.movement_id);
    if(m&&m.supplier_account_id){const a=(allAccounts||[]).find(x=>x.id===m.supplier_account_id);if(a)return a;}
  }
  if(r.hire_id){
    const h=(allHires||[]).find(x=>x.id===r.hire_id);
    if(h&&h.supplier){const a=findSupplierAccount(h.supplier);if(a)return a;}
  }
  // Unmatched rows have no linked job, so fall back to the sender's domain —
  // noreply@fvsl.co.uk still resolves to the Fourways account that way.
  const dom=String((r.from_email||'').split('@')[1]||'').toLowerCase();
  if(dom){
    const a=(allAccounts||[]).find(x=>x.type==='supplier'&&String(x.booking_email||'').toLowerCase().endsWith('@'+dom));
    if(a)return a;
  }
  return null;
}
function replyToFor(r){
  const from=String((r&&r.from_email)||'').trim();
  if(from&&!isNoReplyAddress(from))return from;
  const acc=supplierAccountForReply(r);
  return (acc&&acc.booking_email)||'';
}
// Shared by both reply entry points so the warning wording stays in one place.
function replyTarget(r){
  const to=replyToFor(r);
  let note='';
  if(isNoReplyAddress(r&&r.from_email)){
    note=to?(' \u00b7 \u26a0 sender is no-reply, using '+to):' \u00b7 \u26a0 sender is no-reply and no booking inbox on the supplier account';
  }
  return {to:to,note:note};
}
function openReplyFromQueue(id){
  const r=allSupplierReplies.find(x=>x.id===id);if(!r)return;
  const t=replyTarget(r);
  const label='Reply to '+(r.from_email||'supplier')+' · '+(r.movement_id?mvJobLabel(r.movement_id):hireLabel(r.hire_id))+t.note;
  if(isNoReplyAddress(r.from_email)&&!t.to)toast('That reply came from a no-reply address and the supplier account has no booking email — add one in CRM → Accounts','error');
  openReplyModal(r.message_id,r.hire_id,r.id,label,r.movement_id,t.to,r.subject);
}
function replyFromThread(){
  const msgs=window._threadMsgs||[];const kind=window._threadKind||'hire';
  const id=kind==='mv'?window._threadMvId:window._threadHireId;
  const inbound=msgs.filter(m=>m.direction!=='outbound'&&m.message_id&&String(m.message_id).indexOf('manual-')!==0&&String(m.message_id).indexOf('ack-')!==0);
  const latest=inbound.length?inbound[inbound.length-1]:null;
  if(!latest){threadNewMessage();return;} // nothing to thread onto yet — send a fresh chase instead
  const t=replyTarget({from_email:latest.from_email,hire_id:kind==='hire'?id:null,movement_id:kind==='mv'?id:null});
  openReplyModal(latest.message_id,kind==='hire'?id:null,null,'Reply to '+(latest.from_email||'supplier')+t.note,kind==='mv'?id:null,t.to,latest.subject);
}
function threadNewMessage(){
  const kind=window._threadKind||'hire';
  composeToSupplier(kind==='mv'?window._threadMvId:window._threadHireId,kind);
}
// Fresh email to the supplier (chase/nudge) — no inbound message required.
// Threads on the supplier's side via 'Re:' + the original subject, and always
// carries the job ref so the reply agents can match the answer.
// The job ref is the reply agents' primary match key. A thread subject can be
// inherited from a manual-reply or auto-ack row, which carry no ref, so every
// outbound subject gets checked and re-stamped before it leaves.
function withJobRef(subject,ref){
  if(!ref)return subject;
  const bare=String(ref).replace(/^\[|\]$/g,'');
  return String(subject).indexOf(bare)!==-1?subject:subject+' ['+bare+']';
}
function composeToSupplier(id,kind){
  if(!id){toast('Nothing linked','error');return;}
  let to='',from='',label='',subjBase='',jobRef='';
  if(kind==='mv'){
    const m=(allMovements||[]).find(x=>x.id===id);if(!m){toast('Movement not loaded — open Movements and retry','error');return;}
    const sup=(allAccounts||[]).find(a=>a.id===m.supplier_account_id);
    to=(sup&&sup.booking_email)||'';from='logistics@covase.co.uk';label=mvJobLabel(id);
    jobRef=m.job_ref||('CVM:'+id);
    subjBase='Vehicle movement - '+(m.customer||'')+' ['+jobRef+']';
  }else{
    const h=(allHires||[]).find(x=>x.id===id);if(!h){toast('Booking not loaded — open Bookings and retry','error');return;}
    const acc=findSupplierAccount(h.supplier);
    to=(acc&&acc.booking_email)||'';from='rentals@covase.co.uk';label=hireLabel(id);
    jobRef=h.job_ref||('CVB:'+id);
    subjBase='Booking - '+(h.customer||'')+' ['+jobRef+']';
  }
  if(!to){toast('No booking email on the supplier account — add one in CRM → Accounts','error');return;}
  const msgs=(window._threadMsgs||[]);
  const lastOut=[...msgs].reverse().find(x=>x.direction==='outbound'&&x.subject);
  const inherited=lastOut?(/^re:/i.test(lastOut.subject)?lastOut.subject:'Re: '+lastOut.subject):subjBase;
  const subject=withJobRef(inherited,jobRef);
  replyCtx={mode:'new',to:to,from:from,subject:subject,hireId:kind==='hire'?id:null,movementId:kind==='mv'?id:null,messageId:null,sourceReplyId:null};
  document.getElementById('reply-context').textContent='New message · '+label+' · from '+from;
  document.getElementById('reply-to').value=to;
  document.getElementById('reply-text').value='';
  document.getElementById('reply-modal').classList.add('open');
}
function closeReplyModal(){document.getElementById('reply-modal').classList.remove('open');}
async function doManualReply(){
  if(!replyCtx)return;
  const text=document.getElementById('reply-text').value.trim();
  if(!text){toast('Type a reply first','error');return;}
  const toRaw=(document.getElementById('reply-to')?.value||'').trim();
  const toList=toRaw.split(',').map(s=>s.trim()).filter(Boolean);
  if(!toList.length){toast('Enter at least one recipient address','error');return;}
  const bad=toList.filter(e=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if(bad.length){toast('Invalid address: '+bad.join(', '),'error');return;}
  // Last line of defence: an unattended address can still be typed in by hand.
  const unattended=toList.filter(isNoReplyAddress);
  if(unattended.length){toast('Cannot send to an unattended address: '+unattended.join(', ')+' — use the supplier booking inbox','error');return;}
  const toValue=toList.join(',');
  // Fresh outbound (chase/nudge) — goes via the send webhook, not the Graph reply
  if(replyCtx.mode==='new'){
    const url2=getConfig().n8nSupplierBooking;if(!url2){toast('Set the supplier booking webhook in Settings','error');return;}
    const btn2=document.getElementById('reply-send-btn');btn2.disabled=true;btn2.textContent='Sending…';
    try{
      const bodyHtml='<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">'+esc(text).replace(/\n/g,'<br>')+'</div>';
      const r2=await fetch(url2,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:toValue,from:replyCtx.from,subject:replyCtx.subject,bodyHtml:bodyHtml})});
      if(!r2.ok)throw new Error('Webhook returned '+r2.status);
      const now2=new Date().toISOString();
      try{await sbReq('covase_supplier_replies',{method:'POST',body:{id:'sr-chase-'+Date.now(),hire_id:replyCtx.hireId,movement_id:replyCtx.movementId,direction:'outbound',outcome:'chase',subject:replyCtx.subject,raw_body:text,from_email:replyCtx.from,message_id:'manual-'+Date.now(),received_at:now2,status:'sent'},prefer:'return=minimal'});}catch(e){}
      toast('Message sent from '+replyCtx.from,'success');
      closeReplyModal();
      if(document.getElementById('thread-modal').classList.contains('open'))openThread(replyCtx.movementId||replyCtx.hireId,replyCtx.movementId?'mv':'hire');
    }catch(e){toast('Send failed: '+e.message,'error');}
    finally{btn2.disabled=false;btn2.textContent='Send reply';}
    return;
  }
  const url=getConfig().n8nManualReply;if(!url){toast('Set the manual reply webhook in Settings','error');return;}
  const btn=document.getElementById('reply-send-btn');btn.disabled=true;btn.textContent='Sending…';
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messageId:replyCtx.messageId,hireId:replyCtx.hireId,movementId:replyCtx.movementId,from:replyCtx.from,to:toValue,replyText:text,subject:replyCtx.subject||''})});
    if(!r.ok)throw new Error('Webhook returned '+r.status);
    if(replyCtx.sourceReplyId){try{await sbReq('covase_supplier_replies?id=eq.'+encodeURIComponent(replyCtx.sourceReplyId),{method:'PATCH',body:{status:'replied'},prefer:'return=minimal'});}catch(e){}}
    toast('Reply sent from '+(replyCtx.from||'rentals@covase.co.uk'),'success');
    closeReplyModal();loadSupplierReplies();
  }catch(e){toast('Send failed: '+e.message,'error');}
  finally{btn.disabled=false;btn.textContent='Send reply';}
}

// ─── Vehicle replacement ───
// State of the replace-vehicle flow. Mirrors editHireId but is scoped to the
// replacement modal so closing the hire-modal in the middle doesn't lose track.
let replacingHireId=null;
function openReplaceVehicle(){
  if(!editHireId){toast('Open an existing hire first','error');return;}
  const h=allHires.find(x=>x.id===editHireId);if(!h){toast('Hire not found','error');return;}
  if(!['booked','active'].includes(h.hire_status)){
    toast(`Cannot replace vehicle on a ${h.hire_status} hire`,'error');
    return;
  }
  replacingHireId=editHireId;
  const today=new Date().toISOString().split('T')[0];
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??''};
  set('rv-changeover-date',today);
  set('rv-end-date',h.end_date||'');
  set('rv-reg','');set('rv-makemodel','');set('rv-category','');set('rv-fuel','');set('rv-reg-date','');
  set('rv-p11d','');set('rv-co2','');set('rv-engine-cc','');set('rv-ev-range','');
  set('rv-cost',h.cost_per_day||'');
  document.getElementById('hire-modal').classList.remove('open');
  document.getElementById('replace-modal').classList.add('open');
}
function closeReplaceModal(){
  document.getElementById('replace-modal').classList.remove('open');
  replacingHireId=null;
}
async function saveReplacement(){
  if(!replacingHireId){toast('No hire selected to replace','error');return;}
  const old=allHires.find(x=>x.id===replacingHireId);
  if(!old){toast('Original hire not found','error');return;}
  const changeoverDate=document.getElementById('rv-changeover-date').value;
  if(!changeoverDate){toast('Changeover date required','error');return;}
  const newReg=(document.getElementById('rv-reg').value||'').replace(/\s+/g,'').toUpperCase();
  if(!newReg){toast('Replacement vehicle registration required','error');return;}
  const newEndDate=document.getElementById('rv-end-date').value||null;
  const newCost=parseFloat(document.getElementById('rv-cost').value);
  const nowIso=new Date().toISOString();
  // PATCH old row → offhired on the changeover date.
  const oldPatch={hire_status:'offhired',end_date:changeoverDate,updated_at:nowIso};
  // INSERT new row. Booking-level fields are copied from old; vehicle, dates and rate are new.
  const newId='hire-'+Date.now();
  const newRow={
    id:newId,
    // Booking-level (copied — stable across the chain)
    customer:old.customer,client_account_id:old.client_account_id,
    driver:old.driver,driver_contact_id:old.driver_contact_id,driver_mobile:old.driver_mobile,
    reference:old.reference,
    delivery_address_line1:old.delivery_address_line1,delivery_address_line2:old.delivery_address_line2,
    delivery_town:old.delivery_town,delivery_county:old.delivery_county,delivery_postcode:old.delivery_postcode,
    supplier:old.supplier,
    preferred_start_time:old.preferred_start_time,
    upsell_per_day:old.upsell_per_day,rft_per_day:old.rft_per_day,
    vat_status:old.vat_status||'full',
    // Vehicle-level (new — captured by the form)
    vehicle_reg:newReg,
    make_model:document.getElementById('rv-makemodel').value.trim()||null,
    category:document.getElementById('rv-category').value||null,
    fuel_type:document.getElementById('rv-fuel').value||null,
    date_of_registration:document.getElementById('rv-reg-date').value||null,
    p11d_value:parseFloat(document.getElementById('rv-p11d').value)||null,
    co2_emissions:parseInt(document.getElementById('rv-co2').value,10)||null,
    engine_cc:parseInt(document.getElementById('rv-engine-cc').value,10)||null,
    ev_range:parseInt(document.getElementById('rv-ev-range').value,10)||null,
    // Allocation-level (new)
    start_date:changeoverDate,
    end_date:newEndDate,
    cost_per_day:isNaN(newCost)?(old.cost_per_day||null):newCost,
    hire_status:'active',
    billing_status:'pending',
    supplementaries:[],
    incoming_invoice_id:null,outgoing_invoice_id:null,
    supplier_ref:null,
    notes:null,
    replaces_hire_id:old.id,
    updated_at:nowIso
  };
  try{
    await sbReq(`covase_hires?id=eq.${encodeURIComponent(old.id)}`,{method:'PATCH',body:oldPatch,prefer:'return=minimal'});
    const res=await sbReq('covase_hires',{method:'POST',body:newRow});
    const idx=allHires.findIndex(x=>x.id===old.id);
    if(idx>=0)Object.assign(allHires[idx],oldPatch);
    const created=Array.isArray(res)?res[0]:(res||newRow);
    allHires.unshift(created);
    toast('Vehicle replaced','success');
    closeReplaceModal();
    closeHireModal();
    hiresLoaded=false;
    loadHires();
  }catch(e){toast('Replace failed: '+e.message,'error');}
}

async function deleteHire(id){if(!confirm('Remove this hire? Cannot be undone.'))return;try{await sbReq(`covase_hires?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=minimal'});allHires=allHires.filter(x=>x.id!==id);updateHireStats();renderHireView('hires-active','active-list',h=>['pending','requested','booked','active'].includes(h.hire_status));renderHireView('hires-all','all-list',null);renderHireView('hires-recharge','recharge-list',h=>h.billing_status==='invoiced-in'&&!h.outgoing_invoice_id);updateBadges();toast('Hire removed','success');}catch(e){toast('Delete failed: '+e.message,'error');}}

