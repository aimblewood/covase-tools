// ─── ACCIDENT MANAGEMENT (FMG claims) ───
// FMG is the system of record: we import their nightly DataSummary export,
// upsert by claim reference, match to our accounts/contacts/vehicles/hires,
// and monitor with alerts. No platform-side editing of FMG data.
let allClaims=[],claimsLoaded=false,claimView='kanban';
// FMG header → our column. type: s=string, i=int, n=numeric, d=datetime
const FMG_CLAIM_MAP=[
  ['Claim Reference','claim_reference','s'],['Incident Date','incident_date','d'],['Reported Date','reported_date','d'],
  ['Days To Report','days_to_report','i'],['Vehicle Registration','vehicle_reg','s'],['Vehicle Make','vehicle_make','s'],
  ['Vehicle Model','vehicle_model','s'],['Vehicle Mileage','vehicle_mileage','i'],['Vehicle Type','vehicle_type','s'],
  ['Insurer Reference','insurer_reference','s'],['Driver Name','driver_name','s'],['Driver Type','driver_type','s'],
  ['Fault Type','fault_type','s'],['Driveable?','driveable','s'],['Incident Type','incident_type','s'],
  ['Incident Category','incident_category','s'],['Incident Location','incident_location','s'],
  ['Incident Circumstances','incident_circumstances','s'],['Purpose Of Use','purpose_of_use','s'],['Speed','speed','i'],
  ['Weather Conditions','weather_conditions','s'],['Damage Notes','damage_notes','s'],['Injuries Sustained','injuries_sustained','s'],
  ['Third Party Involved','third_party_involved','s'],['Replacement Type','replacement_type','s'],
  ['Booking In Date','booking_in_date','d'],['Estimated Completion Date','estimated_completion_date','d'],
  ['Actual Completion Date','actual_completion_date','d'],['Vehicle Off Road Time','vehicle_off_road_days','i'],
  ['Repair Status','repair_status','s'],['ULR Quantified','ulr_quantified','n'],['ULR Total','ulr_total','n'],
  ['ULR Status','ulr_status','s'],['Repairs Supplier','repairs_supplier','s'],['Original Estimate','original_estimate','n'],
  ['Agreed Estimate','agreed_estimate','n'],['Body Repairs Total','body_repairs_total','n'],['Salvage Total','salvage_total','n'],
  ['Hire Total','hire_total','n'],['Glass Total','glass_total','n'],['Recovery Total','recovery_total','n'],
  ['Other Total','other_total','n'],['Total Net Costs','total_net_costs','n'],['Client Net Total','client_net_total','n'],
  ['Insurer Net Total','insurer_net_total','n'],['Client VAT Total','client_vat_total','n'],['AD Paid','ad_paid','n'],
  ['AD Outstanding','ad_outstanding','n'],['AD Total','ad_total','n'],['TP Paid','tp_paid','n'],['TP Outstanding','tp_outstanding','n'],
  ['TP Total','tp_total','n'],['Total Insurer Cost','total_insurer_cost','n'],['Group','client_group','s'],['Company','company','s'],
  ['Branch','branch','s'],['Cost Centre','cost_centre','s'],['Vehicle Sparefield 1','spare_1','s'],['Vehicle Sparefield 2','spare_2','s'],
  ['Vehicle Sparefield 3','spare_3','s'],['Vehicle Sparefield 4','spare_4','s'],['Vehicle Sparefield 5','spare_5','s']
];
// Alert thresholds (days). Tune here — surfaced in card chips + dashboard.
const CLAIM_ALERT_CFG={notBookedInDays:7,vorDays:14,ulrOpenDays:45,lateReportDays:3};
// First-name equivalence for driver matching: common UK nicknames map to a
// canonical form; a ≥3-char prefix also matches (Dan→Daniel, Seb→Sebastian).
const CLAIM_NICKNAMES={dave:'david',davey:'david',mike:'michael',mick:'michael',micky:'michael',bob:'robert',bobby:'robert',rob:'robert',robbie:'robert',bill:'william',billy:'william',will:'william',jim:'james',jimmy:'james',jamie:'james',jack:'john',johnny:'john',jon:'jonathan',jonny:'jonathan',tony:'anthony',andy:'andrew',drew:'andrew',matt:'matthew',nick:'nicholas',nicky:'nicholas',pete:'peter',phil:'philip',steve:'stephen',stevie:'stephen',stu:'stuart',stew:'stuart',rich:'richard',rick:'richard',ricky:'richard',dick:'richard',ed:'edward',eddie:'edward',ted:'edward',teddy:'edward',ben:'benjamin',benny:'benjamin',alex:'alexander',fred:'frederick',freddie:'frederick',harry:'henry',hal:'henry',greg:'gregory',jeff:'jeffrey',geoff:'geoffrey',ken:'kenneth',kenny:'kenneth',ray:'raymond',ron:'ronald',ronnie:'ronald',terry:'terence',tel:'terence',vince:'vincent',gaz:'gary',baz:'barry',tom:'thomas',tommy:'thomas',dan:'daniel',danny:'daniel',seb:'sebastian',chris:'christopher',kit:'christopher',abi:'abigail',abby:'abigail',becky:'rebecca',becca:'rebecca',beth:'elizabeth',liz:'elizabeth',lizzie:'elizabeth',libby:'elizabeth',betty:'elizabeth',cathy:'catherine',cath:'catherine',kate:'katherine',katie:'katherine',kathy:'katherine',kath:'katherine',jen:'jennifer',jenny:'jennifer',jess:'jessica',jo:'joanne',mandy:'amanda',maggie:'margaret',meg:'margaret',peggy:'margaret',pat:'patricia',trish:'patricia',tricia:'patricia',sue:'susan',susie:'susan',suzy:'susan',vicky:'victoria',tori:'victoria',debbie:'deborah',deb:'deborah',steph:'stephanie'};
function clmFirstTok(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim().split(' ')[0]||'';}
function clmLastTok(s){const t=String(s||'').toLowerCase().replace(/\s+/g,' ').trim().split(' ').filter(Boolean);return t.length?t[t.length-1]:'';}
function clmFirstNamesMatch(a,b){
  if(!a||!b)return false;
  if(a===b)return true;
  const ca=CLAIM_NICKNAMES[a]||a,cb=CLAIM_NICKNAMES[b]||b;
  if(ca===cb)return true;
  // Prefix rule = abbreviation: shorter ≥3 chars AND at least 2 chars shorter
  // than the longer (Dan→Daniel yes; Paul→Paula no — that's a different name).
  const pref=(x,y)=>x.length>=3&&y.length-x.length>=2&&y.startsWith(x);
  if(pref(a,b)||pref(b,a)||pref(ca,cb)||pref(cb,ca))return true;
  return false;
}
// UK plate spaced variant: 'DG72LVR' → 'DG72 LVR' (Dynamics stores some with a space)
function clmRegVariant(rg){const m=String(rg||'').match(/^([A-Z]{2}\d{2})([A-Z]{3})$/);return m?m[1]+' '+m[2]:null;}
function claimType(c){const t=(c.incident_type||'').toLowerCase();if(t==='glass only')return 'glass';if(t==='reference claim')return 'reference';return 'damage';}
function claimUlrOpen(c){return !!(c.ulr_status&&c.ulr_status!=='File Closed');}
function claimStage(c){
  const ty=claimType(c);
  if(ty==='glass')return c.actual_completion_date?'completed':(c.booking_in_date?'booked':'reported');
  if(ty==='reference')return claimUlrOpen(c)?'open':'closed';
  const rs=c.repair_status||'';
  if(rs.indexOf('Closed')===0)return 'closed';
  if(c.actual_completion_date)return 'completed';
  if(rs==='Off Road')return 'offroad';
  if(rs==='Booked In'||c.booking_in_date)return 'booked';
  return 'reported';
}
function claimOpen(c){return !['closed','completed'].includes(claimStage(c))||(claimType(c)==='damage'&&claimStage(c)==='completed');}
const CLAIM_LANES={
  damage:[{key:'reported',label:'Reported'},{key:'booked',label:'Booked in'},{key:'offroad',label:'Off road'},{key:'completed',label:'Completed'},{key:'closed',label:'Closed'}],
  glass:[{key:'reported',label:'Reported'},{key:'booked',label:'Booked'},{key:'completed',label:'Completed'}],
  reference:[{key:'open',label:'ULR open'},{key:'closed',label:'Closed'}]
};
function daysSince(v){if(!v)return null;const d=new Date(v);if(isNaN(d))return null;return Math.floor((Date.now()-d.getTime())/86400000);}
function claimAlerts(c){
  const out=[];const st=claimStage(c);const ty=claimType(c);const closed=['closed','completed'].includes(st);
  if(ty==='damage'&&st==='reported'){const n=daysSince(c.reported_date);if(n!=null&&n>CLAIM_ALERT_CFG.notBookedInDays)out.push({key:'slow',label:'Not booked in '+n+'d',cls:''});}
  if(ty==='damage'&&st==='offroad'){const n=c.vehicle_off_road_days!=null?c.vehicle_off_road_days:daysSince(c.booking_in_date||c.reported_date);if(n!=null&&n>CLAIM_ALERT_CFG.vorDays)out.push({key:'vor',label:'Off road '+n+'d',cls:''});}
  if(!closed&&c.estimated_completion_date&&!c.actual_completion_date&&new Date(c.estimated_completion_date)<new Date())out.push({key:'overdue',label:'Overdue completion',cls:''});
  if(c.fault_type==='Third Party'&&claimUlrOpen(c)){const n=daysSince(c.incident_date);if(n!=null&&n>CLAIM_ALERT_CFG.ulrOpenDays)out.push({key:'ulr',label:'ULR open '+n+'d',cls:'warn'});}
  if((c.days_to_report||0)>=CLAIM_ALERT_CFG.lateReportDays)out.push({key:'late',label:'Reported +'+c.days_to_report+'d late',cls:'info'});
  return out;
}
function claimEscalations(c){return claimAlerts(c).filter(a=>a.key!=='late');}
async function loadClaims(){
  const kb=document.getElementById('claims-kanban');
  try{
    allClaims=await sbReq('covase_claims?order=incident_date.desc&limit=1000');
    claimsLoaded=true;
    if(!Array.isArray(allAccounts)||!allAccounts.length){try{allAccounts=await sbReq('covase_accounts?order=company_name.asc&limit=500');}catch(e){}}
    updateClaimStats();applyClaimViewVis();renderClaimsView();
  }catch(e){if(kb)kb.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🚨</div><div class="empty-title">Load failed</div><div class="empty-sub">'+esc(e.message||'')+' (is phase-accident-claims.sql applied?)</div></div>';}
}
function updateClaimStats(){
  const open=(allClaims||[]).filter(claimOpen);
  const offroad=(allClaims||[]).filter(c=>claimStage(c)==='offroad');
  const alerts=(allClaims||[]).reduce((s,c)=>s+claimEscalations(c).length,0);
  const cost=(allClaims||[]).reduce((s,c)=>s+(parseFloat(c.total_net_costs)||0),0);
  const clientCost=(allClaims||[]).reduce((s,c)=>s+(parseFloat(c.client_net_total)||0),0);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('sc-open',open.length);set('sc-offroad',offroad.length);set('sc-alerts',alerts);set('sc-cost',fmtMoney(cost||null));
  const sub=document.getElementById('sc-cost-sub');if(sub)sub.textContent='client share '+fmtMoney(clientCost||0);
  const b=document.getElementById('badge-claims');if(b)b.textContent=String(open.length||0);
}
function applyClaimViewVis(){
  const kb=document.getElementById('claims-kanban'),db=document.getElementById('claims-dashboard');
  if(kb)kb.style.display=claimView==='kanban'?'':'none';
  if(db)db.style.display=claimView==='dashboard'?'':'none';
  const ts=document.getElementById('claim-type-sel');if(ts)ts.style.display=claimView==='kanban'?'':'none';
}
function setClaimView(v){claimView=v;document.querySelectorAll('#claim-view-seg .seg-btn').forEach(b=>b.classList.toggle('active',b.getAttribute('data-cv')===v));applyClaimViewVis();renderClaimsView();}
function claimsFiltered(){
  const q=(document.getElementById('claim-search')?.value||'').toLowerCase().trim();
  let rows=(allClaims||[]).slice();
  if(q)rows=rows.filter(c=>[c.claim_reference,c.vehicle_reg,c.driver_name,c.client_group,c.company,c.vehicle_make,c.vehicle_model,c.insurer_reference,c.repairs_supplier].map(x=>String(x||'').toLowerCase()).join(' ').includes(q));
  return rows;
}
function renderClaimsView(){if(claimView==='dashboard')renderClaimsDashboard();else renderClaimsKanban();}
function claimAccountName(c){if(c.client_account_id){const a=(allAccounts||[]).find(x=>x.id===c.client_account_id);if(a)return a.company_name;}return c.company||c.client_group||'—';}
function renderClaimsKanban(){
  const wrap=document.getElementById('claims-kanban');if(!wrap)return;
  const ty=document.getElementById('claim-type-sel')?.value||'damage';
  const lanes=CLAIM_LANES[ty];
  wrap.style.gridTemplateColumns='repeat('+lanes.length+',1fr)';
  const rows=claimsFiltered().filter(c=>claimType(c)===ty);
  const buckets={};lanes.forEach(l=>buckets[l.key]=[]);
  rows.forEach(c=>{const s=claimStage(c);(buckets[s]||(buckets[s]=[])).push(c);});
  wrap.innerHTML=lanes.map(l=>{
    const items=buckets[l.key]||[];
    const body=items.length?items.map(c=>claimCard(c)).join(''):'<div class="kan-col-empty">Nothing here</div>';
    return '<div class="kan-col"><div class="kan-col-header"><span class="kan-col-title">'+esc(l.label)+'</span><span class="kan-col-count">'+items.length+'</span></div><div class="kan-col-body">'+body+'</div></div>';
  }).join('');
  if(!rows.length&&!(allClaims||[]).length)wrap.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🚨</div><div class="empty-title">No claims yet</div><div class="empty-sub">Import the FMG DataSummary file to get started.</div></div>';
}
function claimCard(c){
  const alerts=claimAlerts(c);
  const chips=alerts.map(a=>'<span class="clm-alert '+a.cls+'">'+esc(a.label)+'</span>').join(' ');
  const cost=parseFloat(c.total_net_costs)||0;
  const unmatched=!c.client_account_id;
  return '<div class="kan-card" onclick="openClaimDetail(\''+esc(c.id)+'\')">'
    +'<div class="kan-card-grid">'
    +'<div class="kan-card-l1">'+esc(claimAccountName(c))+'</div>'
    +'<div class="kan-card-r1">'+esc(c.claim_reference||'')+'</div>'
    +'<div class="kan-card-l2">'+esc(c.driver_name||'—')+'</div>'
    +'<div class="kan-card-r2">'+(cost?fmtMoney(cost):'')+'</div>'
    +'<div class="kan-card-l3">'+esc([c.vehicle_reg,[c.vehicle_make,c.vehicle_model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')||'—')+'</div>'
    +'<div class="kan-card-l4">'+esc((c.incident_date?fmtUK(String(c.incident_date).slice(0,10)):'—')+(c.incident_category?' · '+c.incident_category:''))+'</div>'
    +(chips?'<div style="grid-column:1/-1;margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">'+chips+'</div>':'')
    +(unmatched?'<div style="grid-column:1/-1;margin-top:3px"><span class="clm-match miss">⚠ no account match</span></div>':'')
    +'</div></div>';
}
// ── Detail modal: every FMG field, grouped ──
const CLAIM_DETAIL_SECTIONS=[
  {t:'Incident',f:[['claim_reference','Claim reference','s'],['incident_date','Incident date','dt'],['reported_date','Reported date','dt'],['days_to_report','Days to report','s'],['incident_type','Incident type','s'],['incident_category','Category','s'],['fault_type','Fault','s'],['driveable','Driveable?','s'],['third_party_involved','Third party involved','s'],['injuries_sustained','Injuries','s'],['purpose_of_use','Purpose of use','s'],['speed','Speed (mph)','s'],['weather_conditions','Weather','s'],['incident_location','Location','wide'],['incident_circumstances','Circumstances','wide'],['damage_notes','Damage notes','wide']]},
  {t:'Vehicle & driver',f:[['vehicle_reg','Registration','s'],['vehicle_make','Make','s'],['vehicle_model','Model','s'],['vehicle_type','Vehicle type','s'],['vehicle_mileage','Mileage','s'],['driver_name','Driver','s'],['driver_type','Driver type','s']]},
  {t:'Repair pipeline',f:[['repair_status','Repair status','s'],['repairs_supplier','Repairer','s'],['replacement_type','Replacement vehicle','s'],['booking_in_date','Booked in','dt'],['estimated_completion_date','Est. completion','dt'],['actual_completion_date','Actual completion','dt'],['vehicle_off_road_days','Days off road','s'],['insurer_reference','Insurer ref','s']]},
  {t:'ULR (uninsured loss recovery)',f:[['ulr_status','ULR status','s'],['ulr_quantified','ULR quantified','m'],['ulr_total','ULR total','m']]},
  {t:'Costs',f:[['original_estimate','Original estimate','m'],['agreed_estimate','Agreed estimate','m'],['body_repairs_total','Body repairs','m'],['glass_total','Glass','m'],['hire_total','Hire','m'],['recovery_total','Recovery','m'],['salvage_total','Salvage','m'],['other_total','Other','m'],['total_net_costs','Total net costs','m'],['client_net_total','Client net','m'],['insurer_net_total','Insurer net','m'],['client_vat_total','Client VAT','m'],['ad_paid','AD paid','m'],['ad_outstanding','AD outstanding','m'],['ad_total','AD total','m'],['tp_paid','TP paid','m'],['tp_outstanding','TP outstanding','m'],['tp_total','TP total','m'],['total_insurer_cost','Total insurer cost','m']]},
  {t:'Organisation',f:[['client_group','Group','s'],['company','Company','s'],['branch','Branch','s'],['cost_centre','Cost centre','s']]}
];
function fmtClaimVal(v,kind){
  if(v==null||v==='')return '—';
  if(kind==='dt'){const d=new Date(v);return isNaN(d)?String(v):d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  if(kind==='m')return fmtMoney(parseFloat(v)||0);
  return String(v);
}
async function openClaimDetail(id){
  const c=(allClaims||[]).find(x=>x.id===id);if(!c)return;
  document.getElementById('claim-modal-title').textContent='Claim '+(c.claim_reference||'');
  // Lazy-load reference data so labels + manual-match pickers are populated
  if(!Array.isArray(allContacts)||!allContacts.length){try{allContacts=await sbReq('covase_contacts?order=last_name.asc&limit=2000');}catch(e){}}
  if(!Array.isArray(allVehicles)||!allVehicles.length){try{allVehicles=await sbReq('covase_vehicles?order=created_at.desc&limit=1000');}catch(e){}}
  if(!Array.isArray(allHires)||!allHires.length){try{allHires=await sbReq('covase_hires?order=start_date.desc&limit=500');hiresLoaded=true;}catch(e){}}
  const acc=c.client_account_id?(allAccounts||[]).find(a=>a.id===c.client_account_id):null;
  const drv=c.driver_contact_id?(allContacts||[]).find(x=>x.id===c.driver_contact_id):null;
  const links=[
    acc?'<span class="clm-match ok">✓ Account: '+esc(acc.company_name)+'</span>':'<span class="clm-match miss">Account: unmatched'+(c.client_group||c.company?' ('+esc(c.company||c.client_group)+')':'')+'</span>',
    c.driver_contact_id?'<span class="clm-match ok">✓ Driver: '+esc(drv?(drv.first_name+' '+drv.last_name):'linked')+'</span>':'<span class="clm-match miss">Driver: unmatched</span>',
    c.vehicle_id?'<span class="clm-match ok">✓ Fleet vehicle</span>':(c.hire_id?'<span class="clm-match ok">✓ Rental booking</span>':'<span class="clm-match miss">Vehicle: unmatched</span>')
  ].join(' ');
  const alerts=claimAlerts(c).map(a=>'<span class="clm-alert '+a.cls+'">'+esc(a.label)+'</span>').join(' ');
  let html='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">'+links+'</div>';
  if(alerts)html+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">'+alerts+'</div>';
  // Manual matching — live typeahead over Covase AND Dynamics (same behaviour
  // as the hire/movement lookups). Picking a Dynamics hit creates the local row.
  window._clmStaged={acc:null,drv:null,veh:null};
  window._clmClaimId=c.id;
  const inp=(kind,ph)=>'<div style="position:relative"><input id="clm-link-'+kind+'" placeholder="'+esc(ph)+'" autocomplete="off" oninput="clmLookup(\''+kind+'\',this.value)" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--n200);border-radius:6px"><div id="clm-link-'+kind+'-results" class="lookup-results"></div></div>';
  html+='<div style="border:1px solid var(--n200);border-radius:8px;padding:10px;margin-bottom:6px;background:var(--n50)">'
    +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--n400);font-weight:700;margin-bottom:6px">Manual matching — searches Covase + Dynamics; pick a result, then Save</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">'
    +'<div><label style="font-size:10px;color:var(--n500)">Account</label>'+inp('acc','FMG says: '+(c.company||c.client_group||'—'))+'</div>'
    +'<div><label style="font-size:10px;color:var(--n500)">Driver</label>'+inp('drv','FMG says: '+(c.driver_name||'—'))+'</div>'
    +'<div><label style="font-size:10px;color:var(--n500)">Vehicle (fleet or hire)</label>'+inp('veh','FMG says: '+(c.vehicle_reg||'—'))+'</div>'
    +'<button class="btn btn-secondary" style="font-size:12px;padding:7px 14px;background:var(--covase);color:#fff;border-color:var(--covase)" onclick="saveClaimLinks(\''+esc(c.id)+'\')">Save links</button>'
    +'</div><div style="font-size:10px;color:var(--n400);margin-top:5px">Leave a box blank to keep the current link. Links are Covase-side only — FMG data is untouched.</div></div>';
  html+=CLAIM_DETAIL_SECTIONS.map(sec=>{
    const cells=sec.f.map(([k,label,kind])=>{
      const wide=kind==='wide';
      return '<div class="detail-field"'+(wide?' style="grid-column:1/-1"':'')+'><div class="detail-label">'+esc(label)+'</div><div class="detail-val" style="white-space:pre-wrap">'+esc(fmtClaimVal(c[k],kind))+'</div></div>';
    }).join('');
    return '<div class="form-section-label" style="margin-top:14px">'+esc(sec.t)+'</div><div class="clm-detail-grid">'+cells+'</div>';
  }).join('');
  html+='<div style="font-size:10px;color:var(--n400);margin-top:14px">Last synced from FMG: '+(c.last_synced_at?new Date(c.last_synced_at).toLocaleString('en-GB'):'—')+' · Data is read-only (FMG is the system of record)</div>';
  document.getElementById('claim-modal-body').innerHTML=html;
  document.getElementById('claim-modal').classList.add('open');
}
function closeClaimModal(){document.getElementById('claim-modal').classList.remove('open');}
async function saveClaimLinks(id){
  const c=(allClaims||[]).find(x=>x.id===id);if(!c)return;
  const st=window._clmStaged||{};
  const patch={};
  const typed=k=>(document.getElementById('clm-link-'+k)?.value||'').trim();
  if(st.acc){patch.client_account_id=st.acc;patch.account_matched_via='manual';}
  else if(typed('acc')){toast('Pick the account from the search results','error');return;}
  if(st.drv){patch.driver_contact_id=st.drv;}
  else if(typed('drv')){toast('Pick the driver from the search results','error');return;}
  if(st.veh){if(st.veh.vehicle_id)patch.vehicle_id=st.veh.vehicle_id;else patch.hire_id=st.veh.hire_id;patch.vehicle_matched_via='manual';}
  else if(typed('veh')){toast('Pick the vehicle from the search results','error');return;}
  if(!Object.keys(patch).length){toast('Nothing selected to link','error');return;}
  patch.updated_at=new Date().toISOString();
  try{
    await sbReq('covase_claims?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:patch,prefer:'return=minimal'});
    Object.assign(c,patch);
    toast('Links saved','success');
    updateClaimStats();renderClaimsView();
    openClaimDetail(id); // refresh the modal with the new match chips
  }catch(e){toast('Save failed: '+e.message,'error');}
}
function showClaimMatchReport(){
  const r=window._claimMatchReport;
  if(!r){toast('Run an FMG import first — the report covers the latest import','error');return;}
  document.getElementById('claim-modal-title').textContent='FMG import — match report';
  let html='<div style="font-size:12px;color:var(--n600);margin-bottom:10px">Import at '+new Date(r.when).toLocaleString('en-GB')+' · '+r.total+' claims · matched accounts <strong>'+r.acc+'/'+r.total+'</strong>, drivers <strong>'+r.drv+'/'+r.total+'</strong>, vehicles <strong>'+r.veh+'/'+r.total+'</strong></div>';
  if(r.errors&&r.errors.length)html+='<div style="border:1px solid var(--tl-red-t);border-radius:8px;padding:10px;margin-bottom:10px;background:var(--tl-red-l)"><div style="font-size:11px;font-weight:700;color:var(--tl-red-t);margin-bottom:4px">⚠ Errors during linking (these blocked matches)</div>'+r.errors.map(e=>'<div style="font-size:11px;color:var(--tl-red-t)">'+esc(e)+'</div>').join('')+'</div>';
  if(!r.misses.length)html+='<div style="font-size:13px;color:#0a7a72;font-weight:600">Everything matched 🎉</div>';
  else{
    html+='<div style="font-size:11px;color:var(--n500);margin-bottom:8px">'+r.misses.length+' unmatched link'+(r.misses.length>1?'s':'')+' — open the claim and use Manual matching to fix. Manual links survive re-imports.</div>';
    html+=r.misses.map(m=>'<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--n100)">'
      +'<span class="clm-alert warn" style="min-width:52px;text-align:center">'+esc(m.type)+'</span>'
      +'<div style="flex:1;min-width:0"><div style="font-size:12px"><strong>'+esc(m.ref)+'</strong> · FMG says: <strong>'+esc(m.wanted)+'</strong></div>'
      +'<div style="font-size:11px;color:var(--n500)">'+esc(m.why)+'</div></div>'
      +'<button class="btn btn-secondary" style="font-size:11px;padding:4px 10px" onclick="openClaimDetail(\'clm-'+esc(m.ref)+'\')">Open claim</button>'
      +'</div>').join('');
  }
  document.getElementById('claim-modal-body').innerHTML=html;
  document.getElementById('claim-modal').classList.add('open');
}
// Live Covase + Dynamics typeahead for the manual-match panel
let _clmLookupTimers={},_clmLookupResults={};
async function clmLookup(kind,q){
  window._clmStaged[kind]=null; // editing invalidates any previous pick
  clearTimeout(_clmLookupTimers[kind]);
  const res=document.getElementById('clm-link-'+kind+'-results');if(!res)return;
  if(!q||q.length<2){res.classList.remove('open');return;}
  res.innerHTML='<div class="lookup-status">Searching Covase + Dynamics…</div>';res.classList.add('open');
  _clmLookupTimers[kind]=setTimeout(async()=>{
    const ql=q.toLowerCase();const items=[];const cfg=getConfig();
    const dyn=async url=>{try{const r=await fetch(url+'?q='+encodeURIComponent(q),{mode:'cors'});const j=await r.json();return Array.isArray(j)?j:[];}catch(e){return [];}};
    if(kind==='acc'){
      (allAccounts||[]).filter(a=>(a.company_name||'').toLowerCase().includes(ql)).slice(0,5)
        .forEach(a=>items.push({label:a.company_name,meta:'Covase account',pick:a.id}));
      if(cfg.n8nClient)(await dyn(cfg.n8nClient)).slice(0,5).forEach(a=>{
        if(!(allAccounts||[]).some(x=>x.dynamics_id===a.accountId))items.push({label:a.name,meta:'Dynamics — will create Covase account',dyn:{type:'acc',d:a}});});
    }else if(kind==='drv'){
      (allContacts||[]).filter(ct=>((ct.first_name||'')+' '+(ct.last_name||'')).toLowerCase().includes(ql)).slice(0,5)
        .forEach(ct=>items.push({label:((ct.first_name||'')+' '+(ct.last_name||'')).trim(),meta:'Covase contact',pick:ct.id}));
      if(cfg.n8nContact){
        let dl=await dyn(cfg.n8nContact);
        // Full-name search found nothing? Retry on surname alone — catches
        // nickname variants (searching 'DAVID MACKAY' misses 'Dave Mackay').
        const toks=q.trim().split(/\s+/);
        if(!dl.length&&toks.length>1){const r2=await fetch(cfg.n8nContact+'?q='+encodeURIComponent(toks[toks.length-1]),{mode:'cors'}).then(r=>r.json()).catch(()=>null);if(Array.isArray(r2))dl=r2;}
        dl.slice(0,6).forEach(d=>{
          if(!(allContacts||[]).some(x=>x.dynamics_id===d.contactId))items.push({label:mvDriverName(d),meta:'Dynamics — will create Covase contact'+(d.accountName?' · '+d.accountName:''),dyn:{type:'drv',d:d}});});
      }
    }else{
      const rq=normReg(q);
      (allVehicles||[]).filter(v=>(rq&&normReg(v.reg).includes(rq))||String(v.name||'').toLowerCase().includes(ql)).slice(0,4)
        .forEach(v=>items.push({label:(v.reg||'no reg')+(v.name?' · '+v.name:''),meta:'Covase fleet vehicle',pick:{vehicle_id:v.id}}));
      (allHires||[]).filter(h=>h.hire_status!=='cancelled'&&h.vehicle_reg&&rq&&normReg(h.vehicle_reg).includes(rq)).slice(0,4)
        .forEach(h=>items.push({label:(h.vehicle_reg||'')+' · '+(h.customer||'?'),meta:'Rental booking'+(h.start_date?' · '+fmtUK(h.start_date):''),pick:{hire_id:h.id}}));
      if(cfg.n8nVehicle)(await dyn(cfg.n8nVehicle)).slice(0,5).forEach(v=>{
        if(!(allVehicles||[]).some(x=>x.dynamics_id===v.vehicleId))items.push({label:(v.reg||'')+(v.makeModel?' · '+v.makeModel:''),meta:'Dynamics — will create Covase vehicle',dyn:{type:'veh',d:v}});});
    }
    if(!items.length){res.innerHTML='<div class="lookup-status">No matches in Covase or Dynamics</div>';return;}
    _clmLookupResults[kind]=items;
    res.innerHTML=items.map((it,i)=>'<div class="lookup-item" onclick="clmPick(\''+kind+'\','+i+')"><strong>'+esc(it.label)+'</strong><div class="meta">'+esc(it.meta)+'</div></div>').join('');
  },350);
}
async function clmPick(kind,idx){
  const it=(_clmLookupResults[kind]||[])[idx];if(!it)return;
  const res=document.getElementById('clm-link-'+kind+'-results');
  const input=document.getElementById('clm-link-'+kind);
  const now=new Date().toISOString();
  let staged=it.pick||null;
  if(!staged&&it.dyn){
    const d=it.dyn.d;const claim=(allClaims||[]).find(x=>x.id===window._clmClaimId);
    try{
      if(it.dyn.type==='acc'){
        const np={id:'acc-'+Date.now(),company_name:d.name,type:'client',status:'active',address:d.address||null,contact_email:d.email||null,contact_phone:d.phone||null,payment_terms:d.paymentTerms||'28 days',payment_method:'BACS',account_manager:'Simon Homer',dynamics_id:d.accountId,updated_at:now};
        await sbReq('covase_accounts',{method:'POST',body:np,prefer:'return=minimal'});(allAccounts=allAccounts||[]).push(np);staged=np.id;toast('Account created from Dynamics','success');
      }else if(it.dyn.type==='drv'){
        const fn=mvDriverName(d);
        const np={id:'ct-'+Date.now(),first_name:d.firstName||fn.split(' ')[0]||fn,last_name:d.lastName||fn.split(' ').slice(1).join(' ')||null,account_id:(window._clmStaged&&window._clmStaged.acc)||(claim&&claim.client_account_id)||null,email:d.email||null,mobile:d.mobile||null,job_description:d.jobTitle||null,contact_type:'driver',employee_status:'employed',address_type:'home',dynamics_id:d.contactId,updated_at:now};
        await sbReq('covase_contacts',{method:'POST',body:np,prefer:'return=minimal'});(allContacts=allContacts||[]).push(np);staged=np.id;toast('Contact created from Dynamics','success');
      }else{
        const np={id:'veh-'+Date.now(),reg:d.reg||null,registration:d.reg||null,name:d.makeModel||d.name||null,status:'active',source:'Dynamics (claims match)',dynamics_id:d.vehicleId};
        await sbReq('covase_vehicles',{method:'POST',body:np,prefer:'return=minimal'});(allVehicles=allVehicles||[]).push(np);staged={vehicle_id:np.id};toast('Vehicle created from Dynamics','success');
      }
    }catch(e){toast('Create failed: '+e.message,'error');return;}
  }
  if(kind==='veh'&&typeof staged==='string')staged={vehicle_id:staged};
  window._clmStaged[kind]=staged;
  if(input)input.value=it.label;
  if(res)res.classList.remove('open');
}
// ── Dashboard ──
function clmBar(label,val,max,valTxt){const pct=max?Math.max(2,Math.round(val/max*100)):0;return '<div class="clm-bar-row"><div class="clm-bar-label" title="'+esc(label)+'">'+esc(label)+'</div><div class="clm-bar-track"><div class="clm-bar-fill" style="width:'+pct+'%"></div></div><div class="clm-bar-val">'+esc(valTxt!=null?valTxt:String(val))+'</div></div>';}
function renderClaimsDashboard(){
  const wrap=document.getElementById('claims-dashboard');if(!wrap)return;
  const rows=claimsFiltered();
  if(!rows.length){wrap.innerHTML='<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No claim data</div><div class="empty-sub">Import the FMG DataSummary file first.</div></div>';return;}
  // Escalations
  const escal=[];rows.forEach(c=>claimEscalations(c).forEach(a=>escal.push({c,a})));
  const escHtml=escal.length?escal.map(e=>'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--n100);cursor:pointer" onclick="openClaimDetail(\''+esc(e.c.id)+'\')"><div style="font-size:12px"><strong>'+esc(e.c.claim_reference||'')+'</strong> · '+esc(claimAccountName(e.c))+' · '+esc(e.c.vehicle_reg||'')+'</div><span class="clm-alert '+e.a.cls+'">'+esc(e.a.label)+'</span></div>').join(''):'<div style="font-size:12px;color:var(--n400)">No escalations — all claims progressing normally.</div>';
  // Averages
  const avg=a=>a.length?Math.round(a.reduce((s,x)=>s+x,0)/a.length*10)/10:null;
  const avgReport=avg(rows.map(c=>c.days_to_report).filter(v=>v!=null));
  const avgVor=avg(rows.filter(c=>claimType(c)==='damage'&&claimStage(c)==='closed'&&c.vehicle_off_road_days!=null).map(c=>c.vehicle_off_road_days));
  // Fault split
  const faults={};rows.forEach(c=>{const f=c.fault_type||'Unknown';faults[f]=(faults[f]||0)+1;});
  // By category
  const cats={};rows.forEach(c=>{const k=c.incident_category||'Unknown';cats[k]=(cats[k]||0)+1;});
  const catTop=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8);
  // Cost by client
  const byClient={};rows.forEach(c=>{const k=claimAccountName(c);byClient[k]=(byClient[k]||0)+(parseFloat(c.total_net_costs)||0);});
  const cliTop=Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0,8);
  // Monthly trend (last 12 months)
  const months={};rows.forEach(c=>{if(!c.incident_date)return;const k=String(c.incident_date).slice(0,7);months[k]=(months[k]||0)+1;});
  const mKeys=Object.keys(months).sort().slice(-12);
  // Late reporters
  const late=rows.filter(c=>(c.days_to_report||0)>=CLAIM_ALERT_CFG.lateReportDays).sort((a,b)=>(b.days_to_report||0)-(a.days_to_report||0)).slice(0,8);
  const maxCat=Math.max(...catTop.map(x=>x[1]),1),maxCli=Math.max(...cliTop.map(x=>x[1]),1),maxM=Math.max(...mKeys.map(k=>months[k]),1),maxF=Math.max(...Object.values(faults),1);
  wrap.innerHTML=
    '<div class="clm-dash-card" style="margin-bottom:12px"><div class="clm-dash-title">🚩 Escalations ('+escal.length+')</div>'+escHtml+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    +'<div class="clm-dash-card"><div class="clm-dash-title">Incidents by category</div>'+catTop.map(([k,v])=>clmBar(k,v,maxCat)).join('')+'</div>'
    +'<div class="clm-dash-card"><div class="clm-dash-title">Net cost by client</div>'+cliTop.map(([k,v])=>clmBar(k,v,maxCli,fmtMoney(v))).join('')+'</div>'
    +'<div class="clm-dash-card"><div class="clm-dash-title">Incidents by month</div>'+mKeys.map(k=>clmBar(k.slice(5)+'/'+k.slice(2,4),months[k],maxM)).join('')+'</div>'
    +'<div class="clm-dash-card"><div class="clm-dash-title">Fault split · averages</div>'
      +Object.entries(faults).map(([k,v])=>clmBar(k,v,maxF)).join('')
      +'<div style="font-size:12px;color:var(--n600);margin-top:10px">Avg days to report: <strong>'+(avgReport!=null?avgReport:'—')+'</strong> · Avg days off road (closed repairs): <strong>'+(avgVor!=null?avgVor:'—')+'</strong></div>'
      +(late.length?'<div style="font-size:11px;color:var(--n500);margin-top:8px"><strong>Late reporters:</strong> '+late.map(c=>esc((c.driver_name||'?')+' ('+c.days_to_report+'d)')).join(', ')+'</div>':'')
    +'</div>'
    +'</div>';
}
// ── Import (xlsx via SheetJS, lazy-loaded) + matching + upsert ──
function loadSheetJS(){return new Promise((res,rej)=>{if(window.XLSX)return res();const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=()=>rej(new Error('Could not load spreadsheet library'));document.head.appendChild(s);});}
function normStr(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();}
function normReg(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function claimVal(v,ty){
  if(v==null||v==='')return null;
  if(ty==='d'){if(v instanceof Date&&!isNaN(v))return v.toISOString();const d=new Date(v);return isNaN(d)?null:d.toISOString();}
  if(ty==='i'){const n=parseInt(v,10);return isNaN(n)?null:n;}
  if(ty==='n'){const n=parseFloat(v);return isNaN(n)?null:n;}
  return String(v).trim()||null;
}
async function importClaimsFile(file){
  if(!file)return;
  toast('Reading '+file.name+'…','success');
  try{
    await loadSheetJS();
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const src=XLSX.utils.sheet_to_json(ws,{defval:null});
    // Reference data for matching (fresh)
    let accounts=[],contacts=[],vehicles=[],hires=[];
    try{accounts=await sbReq('covase_accounts?select=id,company_name,dynamics_id&limit=1000');}catch(e){}
    try{contacts=await sbReq('covase_contacts?select=id,first_name,last_name,dynamics_id&limit=3000');}catch(e){}
    try{vehicles=await sbReq('covase_vehicles?select=id,reg,dynamics_id&limit=2000');}catch(e){}
    try{hires=await sbReq('covase_hires?select=id,vehicle_reg,start_date,hire_status&limit=1000');}catch(e){}
    // Account index: exact (ignoring a leading "The ") then unique-contains.
    const stripThe=s=>s.replace(/^the /,'');
    const accIndex=accounts.map(a=>({id:a.id,n:stripThe(normStr(a.company_name))})).filter(a=>a.n);
    const findAccountId=nm=>{const k=stripThe(normStr(nm));if(!k)return null;
      const ex=accIndex.filter(a=>a.n===k);if(ex.length===1)return ex[0].id;if(ex.length)return null;
      const co=accIndex.filter(a=>a.n.includes(k)||k.includes(a.n));return co.length===1?co[0].id:null;};
    // Driver matching: surname must match exactly; first names match directly,
    // via nickname equivalence (Dave=David) or prefix (Dan→Daniel). Unique only.
    const findContactId=nm=>{
      const f=clmFirstTok(nm),l=clmLastTok(nm);if(!f||!l)return null;
      const hits=contacts.filter(ct=>clmLastTok(ct.last_name||'')===l&&clmFirstNamesMatch(clmFirstTok(ct.first_name||''),f));
      return hits.length===1?hits[0].id:null;
    };
    const vehByReg=new Map(vehicles.filter(v=>v.reg).map(v=>[normReg(v.reg),v.id]));
    const hiresByReg={};hires.filter(h=>h.vehicle_reg&&h.hire_status!=='cancelled').forEach(h=>{const k=normReg(h.vehicle_reg);(hiresByReg[k]=hiresByReg[k]||[]).push(h);});
    const existingRows=((await sbReq('covase_claims?select=claim_reference,client_account_id,driver_contact_id,vehicle_id,hire_id,account_matched_via,vehicle_matched_via&limit=5000').catch(()=>[]))||[]);
    const existing=new Set(existingRows.map(r=>r.claim_reference));
    const existingLinks=new Map(existingRows.map(r=>[r.claim_reference,r]));
    const now=new Date().toISOString();
    const payload=[];let skipped=0;
    for(const row of src){
      const ref=row['Claim Reference'];
      if(typeof ref!=='string'||!ref.trim()){skipped++;continue;} // totals/footer rows
      const rec={id:'clm-'+ref.trim(),claim_reference:ref.trim(),raw:row,last_synced_at:now,updated_at:now};
      FMG_CLAIM_MAP.forEach(([hdr,col,ty])=>{if(col!=='claim_reference')rec[col]=claimVal(row[hdr],ty);});
      // Account: Company first (more specific), else Group
      const coId=rec.company?findAccountId(rec.company):null;
      const grId=rec.client_group?findAccountId(rec.client_group):null;
      if(coId){rec.client_account_id=coId;rec.account_matched_via='company';}
      else if(grId){rec.client_account_id=grId;rec.account_matched_via='group';}
      else{rec.client_account_id=null;rec.account_matched_via=null;}
      // Driver: first+last name match (middle names ignored), unambiguous only
      rec.driver_contact_id=rec.driver_name?findContactId(rec.driver_name):null;
      // Vehicle: fleet first, then rental bookings (most recent hire wins)
      const rg=normReg(rec.vehicle_reg);
      const vid=rg?vehByReg.get(rg):null;
      const hs=(rg&&hiresByReg[rg])?hiresByReg[rg].slice().sort((a,b)=>String(b.start_date||'').localeCompare(String(a.start_date||''))):[];
      rec.vehicle_id=vid||null;
      rec.hire_id=hs.length?hs[0].id:null;
      rec.vehicle_matched_via=vid&&hs.length?'both':(vid?'fleet':(hs.length?'hire':null));
      // Preserve links already on the stored claim (incl. manual ones): an
      // import may FILL a missing link but never clears or replaces one.
      const prev=existingLinks.get(rec.claim_reference);
      if(prev){
        if(prev.client_account_id){rec.client_account_id=prev.client_account_id;rec.account_matched_via=prev.account_matched_via;}
        if(prev.driver_contact_id)rec.driver_contact_id=prev.driver_contact_id;
        if(prev.vehicle_id||prev.hire_id){rec.vehicle_id=prev.vehicle_id;rec.hire_id=prev.hire_id;rec.vehicle_matched_via=prev.vehicle_matched_via;}
      }
      payload.push(rec);
    }
    if(!payload.length){toast('No claim rows found in that file','error');return;}
    // ── Dynamics fallback: anything still unmatched gets looked up via the
    // n8n lookup webhooks; hits create local rows (with dynamics_id) and link.
    // This also enriches covase_accounts/contacts/vehicles ahead of detachment.
    const cfg=getConfig();
    const linkErrors=[]; // surfaced in the match report — never swallow silently
    const CAP=25; // max unique Dynamics lookups per import (accounts/drivers; vehicles are bulk)
    const capAcc=new Set(),capDrv=new Set(); // names skipped due to cap — reported honestly
    const fetchJson=async(url)=>{try{const r=await fetch(url,{mode:'cors'});if(!r.ok)return null;const j=await r.json();return Array.isArray(j)?j:null;}catch(e){return null;}};
    let idSeq=0;const newId=p=>p+'-'+Date.now()+'-'+(idSeq++);
    // Accounts
    const accCache=new Map();let accLooks=0;
    for(const rec of payload){
      if(rec.client_account_id)continue;
      const nm=rec.company||rec.client_group;if(!nm||!cfg.n8nClient)continue;
      const key=normStr(nm);
      if(!accCache.has(key)){
        if(accLooks>=CAP){capAcc.add(key);continue;}accLooks++;
        const data=await fetchJson(cfg.n8nClient+'?q='+encodeURIComponent(nm));
        let hit=null;
        if(data&&data.length){const exact=data.filter(a=>normStr(a.name)===key);hit=exact.length===1?exact[0]:(data.length===1?data[0]:null);}
        let id=null;
        if(hit&&hit.accountId){
          const local=accounts.find(a=>a.dynamics_id===hit.accountId);
          if(local)id=local.id;
          else{
            const np={id:newId('acc'),company_name:hit.name||nm,type:'client',status:'active',address:hit.address||null,contact_email:hit.email||null,contact_phone:hit.phone||null,payment_terms:hit.paymentTerms||'28 days',payment_method:'BACS',account_manager:'Simon Homer',dynamics_id:hit.accountId,updated_at:now};
            try{await sbReq('covase_accounts',{method:'POST',body:np,prefer:'return=minimal'});id=np.id;accounts.push(np);}catch(e){linkErrors.push('Account create failed ('+(hit.name||nm)+'): '+e.message);}
          }
        }
        accCache.set(key,id);
      }
      if(accCache.get(key)){rec.client_account_id=accCache.get(key);rec.account_matched_via='dynamics';}
    }
    // Vehicles — ONE bulk Dynamics lookup for ALL unmatched regs. Runs BEFORE
    // drivers so a matched vehicle's driver GUID can tie-break duplicate contacts.
    const vehDrvByRef=new Map(); // claim_reference → Dynamics driver GUID from matched vehicle
    if(cfg.n8nVehicle){
      const want=[...new Set(payload.filter(r=>!r.vehicle_id&&!r.hire_id&&normReg(r.vehicle_reg)).map(r=>normReg(r.vehicle_reg)))];
      const found=new Map();
      for(let i=0;i<want.length;i+=40){
        const data=await fetchJson(cfg.n8nVehicle+'?q='+encodeURIComponent(want.slice(i,i+40).join(',')));
        (data||[]).forEach(v=>{const k=normReg(v.reg);if(!k)return;if(!found.has(k))found.set(k,[]);found.get(k).push(v);});
      }
      const vehCache=new Map();
      for(const rg of want){
        const hits=found.get(rg)||[];
        const hit=hits.length===1?hits[0]:null;
        let id=null;
        if(hit&&hit.vehicleId){
          const local=vehicles.find(v=>v.dynamics_id===hit.vehicleId);
          if(local)id=local.id;
          else{
            const np={id:newId('veh'),reg:hit.reg,registration:hit.reg,name:hit.makeModel||hit.name||null,status:'active',source:'Dynamics (claims import)',dynamics_id:hit.vehicleId};
            try{await sbReq('covase_vehicles',{method:'POST',body:np,prefer:'return=minimal'});id=np.id;vehicles.push(np);}catch(e){linkErrors.push('Vehicle create failed ('+hit.reg+'): '+e.message);}
          }
        }
        vehCache.set(rg,{id:id,driverId:hit?hit.driverId:null});
      }
      payload.forEach(rec=>{
        const v=vehCache.get(normReg(rec.vehicle_reg));
        if(!v)return;
        if(v.driverId)vehDrvByRef.set(rec.claim_reference,v.driverId);
        if(!rec.vehicle_id&&!rec.hire_id&&v.id){rec.vehicle_id=v.id;rec.vehicle_matched_via='dynamics';}
      });
    }
    // Drivers — surname query (full-name contains() fails on nickname variants
    // like DAVID vs Dave); first names match via nickname map or prefix. When
    // Dynamics holds DUPLICATE contacts, tie-break by the claim's account, then
    // by the driver GUID on the claim's matched Dynamics vehicle.
    const ctCands=new Map();let ctLooks=0;
    const ctLocalByDyn=new Map(contacts.filter(c=>c.dynamics_id).map(c=>[c.dynamics_id,c.id]));
    for(const rec of payload){
      if(rec.driver_contact_id)continue;
      const nm=rec.driver_name;if(!nm||!cfg.n8nContact)continue;
      const key=normStr(nm);
      if(!ctCands.has(key)){
        if(ctLooks>=CAP){capDrv.add(key);continue;}ctLooks++;
        const f=clmFirstTok(nm),l=clmLastTok(nm);
        const data=await fetchJson(cfg.n8nContact+'?q='+encodeURIComponent(l||nm));
        ctCands.set(key,(data||[]).filter(d=>{const fn=normStr(d.fullName||((d.firstName||'')+' '+(d.lastName||'')));return clmLastTok(fn)===l&&clmFirstNamesMatch(clmFirstTok(fn),clmFirstTok(nm));}));
      }
      const cands=ctCands.get(key)||[];
      let hit=cands.length===1?cands[0]:null;
      if(!hit&&cands.length>1){
        const accDyn=rec.client_account_id?(accounts.find(a=>a.id===rec.client_account_id)||{}).dynamics_id:null;
        const byAcc=accDyn?cands.filter(d=>d.accountId===accDyn):[];
        if(byAcc.length===1)hit=byAcc[0];
        if(!hit){const vd=vehDrvByRef.get(rec.claim_reference);if(vd){const byVeh=cands.filter(d=>d.contactId===vd);if(byVeh.length===1)hit=byVeh[0];}}
      }
      if(hit&&hit.contactId){
        let id=ctLocalByDyn.get(hit.contactId)||null;
        if(!id){
          const fn2=mvDriverName(hit);
          const np={id:newId('ct'),first_name:hit.firstName||fn2.split(' ')[0],last_name:hit.lastName||fn2.split(' ').slice(1).join(' ')||null,account_id:rec.client_account_id||null,email:hit.email||null,mobile:hit.mobile||null,job_description:hit.jobTitle||null,contact_type:'driver',employee_status:'employed',address_type:'home',dynamics_id:hit.contactId,updated_at:now};
          try{await sbReq('covase_contacts',{method:'POST',body:np,prefer:'return=minimal'});id=np.id;contacts.push(np);ctLocalByDyn.set(hit.contactId,id);}catch(e){linkErrors.push('Contact create failed ('+nm+'): '+e.message);}
        }
        if(id)rec.driver_contact_id=id;
      }
    }
    await sbReq('covase_claims?on_conflict=claim_reference',{method:'POST',body:payload,prefer:'resolution=merge-duplicates,return=minimal'});
    const added=payload.filter(r=>!existing.has(r.claim_reference)).length;
    // Build the match report: what matched, what didn't, and why.
    const misses=[];
    payload.forEach(rec=>{
      if(!rec.client_account_id&&(rec.company||rec.client_group)){const w=rec.company||rec.client_group;misses.push({ref:rec.claim_reference,type:'Account',wanted:w,why:capAcc.has(normStr(w))?'Not looked up in Dynamics — per-import lookup cap reached; re-import to continue':'No unique match in Covase accounts or Dynamics'});}
      if(!rec.driver_contact_id&&rec.driver_name){
        const dk=normStr(rec.driver_name);const dc=(ctCands.get(dk)||[]).length;
        misses.push({ref:rec.claim_reference,type:'Driver',wanted:rec.driver_name,
          why:capDrv.has(dk)?'Not looked up in Dynamics — per-import lookup cap reached; re-import to continue'
            :dc>1?dc+' matching contacts in Dynamics (duplicates?) — account/vehicle tie-breaks could not decide; link manually or merge the duplicates in Dynamics'
            :'No unique surname + first-name match in Covase contacts or Dynamics (nicknames/prefixes tried)'});
      }
      if(!rec.vehicle_id&&!rec.hire_id&&rec.vehicle_reg)misses.push({ref:rec.claim_reference,type:'Vehicle',wanted:rec.vehicle_reg,why:'Reg not found (or ambiguous) in fleet, rental bookings, or Dynamics — spaced variant included in the search'});
    });
    window._claimMatchReport={when:new Date().toISOString(),total:payload.length,
      acc:payload.filter(r=>r.client_account_id).length,drv:payload.filter(r=>r.driver_contact_id).length,
      veh:payload.filter(r=>r.vehicle_id||r.hire_id).length,misses:misses,errors:linkErrors};
    if(linkErrors.length&&typeof console!=='undefined')console.warn('[claims import] link errors:',linkErrors);
    toast('Synced '+payload.length+' claims — '+added+' new. Matched: accounts '+window._claimMatchReport.acc+'/'+payload.length+', drivers '+window._claimMatchReport.drv+'/'+payload.length+', vehicles '+window._claimMatchReport.veh+'/'+payload.length+(misses.length?' — see 📋 Match report':''),'success');
    loadClaims();
  }catch(e){toast('Import failed: '+e.message,'error');}
}

