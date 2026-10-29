// ─── LEASE FLEET: vehicle stages, vehicle record, POs, allocations, mileage ───
// One stage per vehicle (covase_vehicles.lease_stage) replaces Dynamics'
// process bar + fleet/order/contract statuses. Moving a stage stamps that
// stage's milestone date if it is empty. Vehicles that predate stages get one
// derived from their dates until someone sets it (nothing is written for them).
const LEASE_STAGES=[
  ['order_to_dealer','Order to dealer','order_to_dealer_date'],['order_confirmed','Order confirmed','order_confirmed_date'],
  ['contracts_sent','Contracts sent','contracts_sent_date'],['contracts_signed','Contracts signed','contracts_signed_date'],
  ['delivery_booked','Delivery booked',null],['delivered','Delivered','delivery_date'],
  ['sent_for_payout','Sent for payout','sent_for_payment_date'],['order_complete','Order complete','paid_out_date'],
  ['on_fleet','On fleet',null],['off_hire','Off hire','de_hire_date']];
const STAGE_CHECKLIST={
  order_to_dealer:{email_po:[['po_raised','Purchase order raised'],['po_sent','PO sent to dealer'],['funder_order','Order created on the funder\'s site']],
    online_platform:[['platform_order','Order placed on the dealer\'s platform'],['platform_ref','Platform order number recorded'],['funder_order','Order created on the funder\'s site']],
    funder_placed:[['funder_order','Funder confirmed they have ordered the vehicle']]},
  order_confirmed:[['dealer_confirmed','Signed PO / confirmation back from dealer'],['build_date','Build or delivery date from dealer']],
  contracts_sent:[['contract_downloaded','Contract downloaded from the funder'],['contract_to_client','Contract sent to client for signing']],
  contracts_signed:[['contract_signed','Signed contract back from client'],['contract_to_funder','Signed contract sent to the funder']],
  delivery_booked:[['delivery_driver','Delivery date agreed with driver'],['delivery_dealer','Delivery date agreed with dealer']],
  delivered:[['reg_recorded','Registration and chassis number recorded'],['handover_mileage','Handover mileage recorded'],['driver_allocated','Driver allocated']],
  sent_for_payout:[['payout_docs','Delivery paperwork sent to the funder']],
  order_complete:[['funder_paid','Funder has paid the dealer'],['setup_invoiced','Set-up fee invoiced']],
  on_fleet:[],
  off_hire:[['final_mileage','Final mileage recorded'],['collected','Vehicle collected / returned']]};
function stageLabel(k){return (LEASE_STAGES.find(s=>s[0]===k)||[0,'Not set'])[1];}
function vehicleStage(v){
  if(v.lease_stage)return v.lease_stage;
  if(v.de_hire_date||v.status==='de-hired')return 'off_hire';
  if(v.delivery_date)return 'on_fleet';
  for(let i=LEASE_STAGES.length-1;i>=0;i--){const d=LEASE_STAGES[i][2];if(d&&v[d])return LEASE_STAGES[i][0];}
  return v.status==='ordered'?'order_to_dealer':'on_fleet';
}
function vehicleRegOf(v){return (v.reg||(v.registration&&v.registration!=='TBC'?v.registration:'')||'').toUpperCase();}
function vehicleLabel(v){return [vehicleRegOf(v)||'Reg TBC',[lsMake(v.manufacturer||v.make),v.model].filter(Boolean).join(' ')||v.name||''].filter(Boolean).join(' · ');}
function stageChecklist(v,stage){const c=STAGE_CHECKLIST[stage];if(!c)return [];if(Array.isArray(c))return c;const d=(allAccounts||[]).find(a=>a.id===v.dealer_id);return c[(d&&d.ordering_route)||'email_po']||c.email_po;}
function daysSince(iso){if(!iso)return null;return Math.floor((Date.now()-new Date(iso).getTime())/864e5);}

// ── Fleet board ──
let fleetShowSettled=false,fleetLoaded=false;
lsInjectView('view-fleet',`
  <div class="topbar">
    <h1>Lease fleet</h1>
    <input class="search-box" type="text" id="fleet-search" placeholder="Search reg, client, driver, vehicle…" oninput="renderFleet()">
    <button class="filter-pill" id="fleet-settled-btn" onclick="fleetShowSettled=!fleetShowSettled;this.classList.toggle('active',fleetShowSettled);renderFleet()">Show on fleet &amp; off hire</button>
    <button class="topbar-btn" onclick="loadFleet()">↻ Refresh</button>
  </div>
  <div class="stats-row">
    <div class="stat-card stat-orange"><div class="stat-label">On order</div><div class="stat-val" id="sfl-order">—</div><div class="stat-sub">not yet delivered</div></div>
    <div class="stat-card stat-red"><div class="stat-label">Stuck 14+ days</div><div class="stat-val" id="sfl-stuck">—</div><div class="stat-sub">same stage</div></div>
    <div class="stat-card stat-indigo"><div class="stat-label">Deliveries next 30 days</div><div class="stat-val" id="sfl-deliv">—</div></div>
    <div class="stat-card stat-covase"><div class="stat-label">On fleet</div><div class="stat-val" id="sfl-fleet">—</div></div>
  </div>
  <div class="content"><div id="fleet-kanban" class="kanban" style="overflow-x:auto"><div class="loading">Loading…</div></div></div>`);
async function loadFleet(){
  const el=document.getElementById('fleet-kanban');if(!el||needsSetup(el))return;
  try{await lsEnsureCrm();allVehicles=await sbReq('covase_vehicles?order=created_at.desc&limit=1000');fleetLoaded=true;renderFleet();}
  catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-title">Couldn't load vehicles</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}
function renderFleet(){
  const wrap=document.getElementById('fleet-kanban');if(!wrap)return;
  const q=(document.getElementById('fleet-search')?.value||'').toLowerCase();
  const rows=(allVehicles||[]).filter(v=>v.status!=='cancelled').filter(v=>!q||[vehicleLabel(v),accName(v.account_id),conName(v.driver_id)].join(' ').toLowerCase().includes(q));
  const stages=LEASE_STAGES.filter(s=>fleetShowSettled||!['on_fleet','off_hire'].includes(s[0]));
  wrap.style.gridTemplateColumns=`repeat(${stages.length},minmax(200px,1fr))`;
  wrap.innerHTML=stages.map(([key,label])=>{
    const items=rows.filter(v=>vehicleStage(v)===key);
    return `<div class="kan-col" ondragover="event.preventDefault();this.classList.add('mvkan-over')" ondragleave="this.classList.remove('mvkan-over')" ondrop="fleetDrop(event,'${key}')">
      <div class="kan-col-header"><span class="kan-col-title">${esc(label)}</span><span class="kan-col-count">${items.length}</span></div>
      <div class="kan-col-body">${items.length?items.map(fleetCard).join(''):'<div class="kan-col-empty">Nothing here</div>'}</div></div>`;
  }).join('');
  const all=(allVehicles||[]).filter(v=>v.status!=='cancelled');
  const onOrder=all.filter(v=>!['on_fleet','off_hire'].includes(vehicleStage(v)));
  const soon=Date.now()+30*864e5;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('sfl-order',onOrder.length);set('sfl-stuck',onOrder.filter(v=>v.lease_stage&&daysSince(v.stage_changed_at)>=14).length);
  set('sfl-deliv',onOrder.filter(v=>v.expected_delivery_date&&new Date(v.expected_delivery_date).getTime()<=soon).length);
  set('sfl-fleet',all.filter(v=>vehicleStage(v)==='on_fleet').length);
  const b=document.getElementById('badge-fleet');if(b)b.textContent=onOrder.length||'0';
}
function nextStage(k){const i=LEASE_STAGES.findIndex(s=>s[0]===k);return i>=0&&i<LEASE_STAGES.length-1?LEASE_STAGES[i+1][0]:null;}
function fleetCard(v){
  const st=vehicleStage(v),nx=nextStage(st);const days=v.lease_stage?daysSince(v.stage_changed_at):null;
  const list=stageChecklist(v,st);const done=list.filter(([k])=>(v.stage_checklist||{})[st]?.[k]).length;
  const adv=nx&&st!=='on_fleet'?`<button class="kan-advance" onclick="event.stopPropagation();vehicleSetStage('${esc(v.id)}','${nx}')">→ ${esc(stageLabel(nx))}</button>`:'';
  const move=IS_TOUCH?`<button type="button" class="kan-move" onclick="openTapMove(event,'lease','${esc(v.id)}')">⇄ Move</button>`:'';
  return `<div class="mv-kan-wrap" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${esc(v.id)}')">
    <div class="kan-card${days>=14?' ls-stuck':''}" onclick="openVehicleRecord('${esc(v.id)}')"><div class="kan-card-grid">
      <div class="kan-card-l1">${esc(vehicleRegOf(v)||'Reg TBC')}</div><div class="kan-card-r">${list.length?done+'/'+list.length:''}</div>
      <div class="kan-card-l2">${esc([lsMake(v.manufacturer||v.make),v.model].filter(Boolean).join(' ')||v.name||'')}</div><div class="kan-card-r"></div>
      <div class="kan-card-l3">${esc(accName(v.account_id)||'—')} · ${esc(conName(v.driver_id)||'no driver')}</div>
      ${v.expected_delivery_date&&!['on_fleet','off_hire'].includes(st)?`<div class="kan-card-l4">Delivery ${esc(fmtUK(v.expected_delivery_date))}${days!=null?' · '+days+'d in stage':''}</div>`:(days!=null?`<div class="kan-card-l4">${days}d in stage</div>`:'')}
    </div></div>${(adv||move)?`<div class="mv-kan-actions">${move}${adv}</div>`:''}</div>`;
}
async function fleetDrop(e,stage){e.preventDefault();document.querySelectorAll('.kan-col.mvkan-over').forEach(x=>x.classList.remove('mvkan-over'));const id=e.dataTransfer.getData('text/plain');if(id)await vehicleSetStage(id,stage);}
async function vehicleSetStage(id,stage){
  const v=(allVehicles||[]).find(x=>x.id===id);if(!v)return;
  const now=new Date().toISOString(),today=now.slice(0,10);
  const body={lease_stage:stage,stage_changed_at:now,updated_at:now};
  const dcol=(LEASE_STAGES.find(s=>s[0]===stage)||[])[2];if(dcol&&!v[dcol])body[dcol]=today;
  if(stage==='on_fleet'&&v.status==='ordered')body.status='active';
  if(stage==='off_hire')body.status='de-hired';
  const prev={...v};Object.assign(v,body);renderFleet();if(vrId===id)renderVehicleRecord();
  try{await sbReq(`covase_vehicles?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body,prefer:'return=minimal'});toast('Moved to '+stageLabel(stage),'success');}
  catch(e){Object.keys(v).forEach(k=>delete v[k]);Object.assign(v,prev);renderFleet();if(vrId===id)renderVehicleRecord();toast('Update failed: '+e.message,'error');}
}
async function toggleChecklist(id,stage,key,on){
  const v=(allVehicles||[]).find(x=>x.id===id);if(!v)return;
  const cl=JSON.parse(JSON.stringify(v.stage_checklist||{}));cl[stage]=cl[stage]||{};
  if(on)cl[stage][key]=new Date().toISOString().slice(0,10);else delete cl[stage][key];
  v.stage_checklist=cl;renderVehicleRecord();renderFleet();
  try{await sbReq(`covase_vehicles?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{stage_checklist:cl,updated_at:new Date().toISOString()},prefer:'return=minimal'});}
  catch(e){toast('Checklist not saved: '+e.message,'error');}
}

// ── Vehicle record ──
let vrId=null,vrTab='summary',vrData={pos:[],allocs:[],miles:[],fines:[],claims:[],movements:[]};
lsInjectModal('vehicle-record-modal',`
  <div class="modal-header"><div><div class="modal-title" id="vr-title">Vehicle</div><div id="vr-sub" style="font-size:12px;color:var(--n500);margin-top:2px"></div></div><button class="modal-close" onclick="closeVehicleRecord()">✕</button></div>
  <div class="modal-body" style="padding-top:8px"><div id="vr-stagebar" class="ls-stagebar"></div><div class="seg" id="vr-tabs" style="margin:10px 0 14px;flex-wrap:wrap"></div><div id="vr-body"></div></div>
  <div class="modal-footer"><button class="btn-secondary-modal" style="margin-right:auto" onclick="openDocs('vehicle',vrId,document.getElementById('vr-title').textContent)">📎 Documents</button>
    <button class="btn-secondary-modal" onclick="closeVehicleRecord();openEditVehicle(vrIdLast)">✎ Edit all fields</button><button class="btn-primary-modal" onclick="closeVehicleRecord()">Close</button></div>`,true);
let vrIdLast=null;
async function openVehicleRecord(id){
  await lsEnsureCrm();
  if(!(allVehicles||[]).find(x=>x.id===id)){try{const r=await sbReq(`covase_vehicles?id=eq.${encodeURIComponent(id)}`);if(r[0])allVehicles.unshift(r[0]);}catch(e){}}
  const v=(allVehicles||[]).find(x=>x.id===id);if(!v){toast('Vehicle not found','error');return;}
  vrId=id;vrIdLast=id;vrTab='summary';vrData={pos:[],allocs:[],miles:[],fines:[],claims:[],movements:[]};
  document.getElementById('vehicle-record-modal').classList.add('open');renderVehicleRecord();loadVehicleRecordData();
}
function closeVehicleRecord(){document.getElementById('vehicle-record-modal').classList.remove('open');vrId=null;}
async function loadVehicleRecordData(){
  const id=vrId,v=(allVehicles||[]).find(x=>x.id===id);if(!v)return;const reg=vehicleRegOf(v).replace(/\s+/g,'');
  const safe=p=>p.catch(()=>[]);
  const enc=encodeURIComponent;
  const [pos,allocs,miles,fines,claims,movements]=await Promise.all([
    safe(sbReq(`covase_purchase_orders?vehicle_id=eq.${enc(id)}&order=created_at.desc`)),
    safe(sbReq(`covase_assignments?vehicle_id=eq.${enc(id)}&order=start_date.desc`)),
    safe(sbReq(`covase_mileage_readings?vehicle_id=eq.${enc(id)}&order=reading_date.desc`)),
    reg?safe(sbReq(`covase_fines?vehicle_reg=eq.${enc(reg)}&order=created_at.desc&limit=100`)):[],
    reg?safe(sbReq(`covase_claims?vehicle_reg=eq.${enc(reg)}&order=incident_date.desc&limit=100`)):[],
    reg?safe(sbReq(`covase_movements?vehicle_reg=eq.${enc(reg)}&order=movement_date.desc&limit=100`)):[]]);
  if(vrId!==id)return;vrData={pos,allocs,miles,fines,claims,movements};renderVehicleRecord();
}
const VR_TABS=[['summary','Summary'],['financials','Financials'],['orders','Purchase orders'],['allocations','Driver & allocations'],['mileage','Mileage'],['milestones','Milestones'],['history','Fines, claims & moves']];
function renderVehicleRecord(){
  const v=(allVehicles||[]).find(x=>x.id===vrId);if(!v)return;
  const st=vehicleStage(v);
  document.getElementById('vr-title').textContent=vehicleLabel(v);
  document.getElementById('vr-sub').textContent=[accName(v.account_id),conName(v.driver_id),accName(v.funder_id)&&('Funder: '+accName(v.funder_id))].filter(Boolean).join(' · ');
  const idx=LEASE_STAGES.findIndex(s=>s[0]===st);
  document.getElementById('vr-stagebar').innerHTML=LEASE_STAGES.map(([k,l],i)=>`<button class="ls-step${i<idx?' done':i===idx?' cur':''}" onclick="if(confirm('Move to ${esc(l)}?'))vehicleSetStage('${esc(v.id)}','${k}')">${esc(l)}</button>`).join('')+(v.lease_stage?'':'<div style="font-size:11px;color:var(--n400);margin-top:4px">Stage worked out from the dates — click a stage to set it.</div>');
  document.getElementById('vr-tabs').innerHTML=VR_TABS.map(([k,l])=>`<button class="seg-btn${vrTab===k?' active':''}" onclick="vrTab='${k}';renderVehicleRecord()">${esc(l)}</button>`).join('');
  document.getElementById('vr-body').innerHTML=(VR_RENDER[vrTab]||VR_RENDER.summary)(v,st);
}
const dv=(l,v)=>`<div class="detail-field"><div class="detail-label">${esc(l)}</div><div class="detail-val">${v==null||v===''?'—':esc(String(v))}</div></div>`;
const VR_RENDER={
  summary(v,st){
    const list=stageChecklist(v,st),cl=(v.stage_checklist||{})[st]||{};
    return `${list.length?`<div class="detail-section-head">To do at “${esc(stageLabel(st))}”</div><div class="ls-check">${list.map(([k,l])=>`<label><input type="checkbox" ${cl[k]?'checked':''} onchange="toggleChecklist('${esc(v.id)}','${st}','${k}',this.checked)"> ${esc(l)}${cl[k]?` <span>${esc(fmtUK(cl[k]))}</span>`:''}</label>`).join('')}</div>`:''}
      ${nextStage(st)&&st!=='on_fleet'?`<div class="action-row"><button class="btn btn-recharge" onclick="vehicleSetStage('${esc(v.id)}','${nextStage(st)}')">→ Move to ${esc(stageLabel(nextStage(st)))}</button></div>`:''}
      <div class="detail-section-head">Vehicle</div><div class="detail-grid">
      ${dv('Registration',vehicleRegOf(v))}${dv('Vehicle',[lsMake(v.manufacturer||v.make),v.model,v.derivative].filter(Boolean).join(' '))}${dv('Fuel',v.fuel_type)}${dv('Colour',[v.exterior_colour,v.interior_trim].filter(Boolean).join(' / '))}
      ${dv('P11D',v.p11d_value!=null?lsMoney(v.p11d_value):'')}${dv('CO2',v.co2_emissions??v.co2_gkm)}${dv('EV range',v.ev_range)}${dv('Chassis',v.chassis_number)}
      ${dv('Client',accName(v.account_id))}${dv('Driver',conName(v.driver_id))}${dv('Funder',accName(v.funder_id))}${dv('Dealer',accName(v.dealer_id))}
      ${dv('Funder quote no',v.funders_quote_no)}${dv('Lex 900 number',v.lex_900_number)}${dv('Expected delivery',fmtUK(v.expected_delivery_date))}${dv('Renewal',fmtUK(vehicleRenewal(v)))}</div>
      ${v.order_id?`<div class="action-row"><button class="btn btn-edit" onclick="closeVehicleRecord();showView('orders',document.querySelector('[data-view=orders]'));setTimeout(()=>openEditOrder('${esc(v.order_id)}'),400)">Open the order →</button></div>`:''}`;
  },
  financials(v){const s=leaseSums(v);return `<div class="financials-row">
    <div><span>Term / miles</span><strong>${esc(v.term_months||'—')}m · ${v.annual_mileage?Number(v.annual_mileage).toLocaleString('en-GB'):'—'} pa</strong></div><div><span>Profile</span><strong>${esc(v.payment_profile||'—')}</strong></div>
    <div><span>Finance rental</span><strong>${lsMoney(v.finance_rental)}</strong></div><div><span>Service rental</span><strong>${lsMoney(v.service_rental)}</strong></div>
    <div><span>Total rental</span><strong>${lsMoney(s.total)}</strong></div><div><span>Effective rental</span><strong>${lsMoney(s.effective)}</strong></div></div>
    <div class="financials-row"><div><span>Commission</span><strong>${lsMoney(v.commissions)}</strong></div><div><span>Set-up fee</span><strong>${lsMoney(v.setup_fee)}</strong></div>
    <div><span>Mgmt fee</span><strong>${lsMoney(v.management_fee)}/m</strong></div><div><span>Mgmt fee profit</span><strong>${lsMoney(s.mgmtProfit)}</strong></div>
    <div><span>Other revenue − costs</span><strong>${lsMoney(lsNum(v.other_revenue)-lsNum(v.costs))}</strong></div><div><span>Total profit</span><strong class="${s.profit>0?'profit-pos':s.profit<0?'profit-neg':''}">${lsMoney(s.profit)}</strong></div></div>
    <div style="font-size:11px;color:var(--n400)">Totals are worked out from the figures above; change them with “Edit all fields”.</div>`;},
  orders(v){const d=(allAccounts||[]).find(a=>a.id===v.dealer_id);const route=d&&d.ordering_route||'email_po';
    return `<div class="action-row" style="margin-top:0">${route==='email_po'?`<button class="btn btn-recharge" onclick="openNewPo()">+ New purchase order</button>`:`<span style="font-size:12px;color:var(--n500)">${esc(d.company_name)} takes orders ${route==='online_platform'?'on their online platform':'through the funder'} — no PO needed. Use the checklist on Summary.</span> <button class="btn btn-edit" onclick="openNewPo()">Raise a PO anyway</button>`}</div>
    ${vrData.pos.length?vrData.pos.map(p=>`<div class="ls-quote"><div class="ls-quote-head"><strong>${esc(p.po_number)}</strong> · ${esc(accName(p.dealer_account_id)||'Dealer not set')} · ${lsMoney(p.otr)} <span class="badge badge-${p.status==='confirmed'?'active':p.status==='sent'?'pending':'closed'}">${esc(p.status)}</span></div>
      <div class="action-row"><button class="btn btn-edit" onclick="printPo('${esc(p.id)}')">🖨 Print / PDF</button>${p.status==='draft'?`<button class="btn btn-edit" onclick="poSetStatus('${esc(p.id)}','sent')">Mark sent</button>`:''}${p.status==='sent'?`<button class="btn btn-recharge" onclick="poSetStatus('${esc(p.id)}','confirmed')">Dealer confirmed</button>`:''}${p.status!=='cancelled'&&p.status!=='confirmed'?`<button class="btn btn-danger" onclick="poSetStatus('${esc(p.id)}','cancelled')">Cancel</button>`:''}</div></div>`).join(''):'<div class="empty-sub" style="padding:10px 0">No purchase orders yet.</div>'}`;},
  allocations(v){const cur=vrData.allocs.find(a=>!a.end_date);
    return `<div class="action-row" style="margin-top:0"><button class="btn btn-recharge" onclick="openReallocate()">${cur?'⇄ Reallocate to another driver':'+ Allocate a driver'}</button>${cur?`<button class="btn btn-edit" onclick="endAllocation()">End allocation (vehicle returned)</button>`:''}</div>
    ${!vrData.allocs.length&&v.driver_id?`<div class="notes-box">Driver on the record: ${esc(conName(v.driver_id))}, with no allocation history yet. Allocate them with a start date to begin the history used for P11D reporting.</div>`:''}
    <table class="ls-table"><tr><th>Driver</th><th>From</th><th>To</th><th>Type</th><th>Miles out / in</th><th>Reason</th></tr>
    ${vrData.allocs.map(a=>`<tr><td>${esc(conName(a.contact_id)||a.contact_id)}</td><td>${esc(fmtUK(a.start_date))}</td><td>${a.end_date?esc(fmtUK(a.end_date)):'<strong>current</strong>'}</td><td>${esc(a.allocation_type||'')}</td><td>${a.start_mileage??'—'} / ${a.end_mileage??'—'}</td><td>${esc(a.end_reason||'')}</td></tr>`).join('')||'<tr><td colspan="6" style="color:var(--n400)">No allocations recorded.</td></tr>'}</table>`;},
  mileage(v){const p=mileageProjection(v,vrData.miles);
    return `<div class="form-row trio"><div class="form-field"><label>Date</label><input type="date" id="ml-date" value="${new Date().toISOString().slice(0,10)}"></div><div class="form-field"><label>Odometer (miles)</label><input type="number" id="ml-odo" min="0"></div>
      <div class="form-field"><label>Source</label><select id="ml-src">${lsOptions([['manual','Entered here'],['driver','From the driver'],['mot','MOT record'],['service','Service / repair'],['invoice','Invoice'],['handover','Handover'],['orbis','Orbis (connected car)']],'manual')}</select></div></div>
      <div class="action-row" style="margin-top:0"><button class="btn btn-recharge" onclick="addMileage()">+ Add reading</button></div>
      ${p?`<div class="financials-row"><div><span>Latest</span><strong>${p.latest.toLocaleString('en-GB')} mi</strong></div><div><span>Average</span><strong>${p.perYear.toLocaleString('en-GB')} mi/yr</strong></div><div><span>Projected at end</span><strong>${p.projected.toLocaleString('en-GB')} mi</strong></div><div><span>Allowance</span><strong>${p.allowance?p.allowance.toLocaleString('en-GB'):'—'}</strong></div><div><span>Position</span><strong class="${p.variance>0.1?'profit-neg':p.variance<-0.1?'':'profit-pos'}">${p.allowance?(p.variance>0?'+':'')+Math.round(p.variance*100)+'%':'—'}</strong></div><div><span>Excess cost</span><strong>${p.excessCost?lsMoney(p.excessCost):'—'}</strong></div></div>
        ${Math.abs(p.variance)>0.1&&p.allowance?`<div class="notes-box">⚠ Heading ${p.variance>0?'over':'under'} the contract allowance by more than 10% — worth asking the funder about re-writing the contract.</div>`:''}`:'<div class="empty-sub">Add a reading to see the projection. Readings need a delivery date to project from.</div>'}
      <table class="ls-table"><tr><th>Date</th><th>Odometer</th><th>Source</th></tr>${vrData.miles.map(m=>`<tr><td>${esc(fmtUK(m.reading_date))}</td><td>${Number(m.odometer).toLocaleString('en-GB')}</td><td>${esc(m.source)}</td></tr>`).join('')||'<tr><td colspan="3" style="color:var(--n400)">No readings yet.</td></tr>'}</table>`;},
  milestones(v){const rows=[['Order received','order_received_date'],['Proposal sent','proposal_sent_date'],['Order to dealer','order_to_dealer_date'],['Order confirmed','order_confirmed_date'],['Build date confirmed','build_date_confirmed'],['Expected delivery','expected_delivery_date'],['Contracts sent','contracts_sent_date'],['Signed contracts received','contracts_signed_date'],['Delivery','delivery_date'],['Registration','registration_date'],['Sent for payment','sent_for_payment_date'],['Paid out','paid_out_date'],['De-hire','de_hire_date'],['MOT expiry','mot_expiry']];
    const reg=v.registration_date||v.date_of_registration;
    return `<div class="detail-grid">${rows.map(([l,k])=>dv(l,fmtUK(v[k]))).join('')}${dv('Renewal (delivery + term)',fmtUK(vehicleRenewal(v)))}${dv('1st MOT due (3 yrs from reg)',reg?fmtUK(addMonthsIso(reg,36)):'')}</div>
    <div style="font-size:11px;color:var(--n400)">Moving the stage fills in its date automatically. Change dates with “Edit all fields”.</div>`;},
  history(v){
    const sec=(t,rows,fn)=>`<div class="detail-section-head">${esc(t)} (${rows.length})</div>${rows.length?`<table class="ls-table">${rows.map(fn).join('')}</table>`:'<div class="empty-sub" style="padding:4px 0 10px">None.</div>'}`;
    if(!vehicleRegOf(v))return '<div class="empty-sub">Fines, claims and movements are matched by registration — add the reg first.</div>';
    return sec('Fines & penalties',vrData.fines,f=>`<tr><td>${esc(fmtUK(f.offence_date||f.created_at))}</td><td>${esc(f.issuer||'')}</td><td>${esc(f.driver_name||'')}</td><td>${esc(f.status||'')}</td></tr>`)
      +sec('Accident claims',vrData.claims,c=>`<tr><td>${esc(fmtUK(c.incident_date))}</td><td>${esc(c.claim_reference||'')}</td><td>${esc(c.incident_category||'')}</td><td>${esc(c.driver_name||'')}</td></tr>`)
      +sec('Movements',vrData.movements,m=>`<tr><td>${esc(fmtUK(m.movement_date))}</td><td>${esc(m.job_ref||'')}</td><td>${esc(m.movement_status||'')}</td></tr>`);
  }
};
function addMonthsIso(iso,n){const d=new Date(iso);if(isNaN(d))return '';d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,10);}
function vehicleRenewal(v){if(v.renewal_date)return v.renewal_date;return v.delivery_date&&v.term_months?addMonthsIso(v.delivery_date,parseInt(v.term_months)):'';}
function mileageProjection(v,miles){
  if(!miles.length)return null;
  const sorted=miles.slice().sort((a,b)=>String(b.reading_date).localeCompare(String(a.reading_date))||b.odometer-a.odometer);
  const latest=sorted[0],first=sorted[sorted.length-1];
  // rate from the spread of readings when they cover 30+ days, else from delivery (odometer ~0)
  let miles_,days;
  const span=(new Date(latest.reading_date)-new Date(first.reading_date))/864e5;
  if(sorted.length>1&&span>=30){miles_=latest.odometer-first.odometer;days=span;}
  else if(v.delivery_date){miles_=latest.odometer;days=(new Date(latest.reading_date)-new Date(v.delivery_date))/864e5;}
  else return null;
  if(!(days>=30)||miles_<0)return null;
  const perYear=Math.round(miles_/days*365);
  const term=parseInt(v.term_months)||0;const allowance=(parseInt(v.annual_mileage)||0)*term/12||parseInt(v.contract_mileage)||0;
  const projected=Math.round(perYear*term/12);
  const variance=allowance?(projected-allowance)/allowance:0;
  const excessCost=allowance&&projected>allowance&&v.excess_mileage_ppm?lsRound((projected-allowance)*lsNum(v.excess_mileage_ppm)):0;
  return {latest:latest.odometer,perYear,projected,allowance,variance,excessCost};
}
async function addMileage(){
  const odo=parseInt(document.getElementById('ml-odo').value);if(isNaN(odo)){toast('Enter the odometer reading','error');return;}
  const last=vrData.miles[0];if(last&&odo<last.odometer&&!confirm(`That's lower than the last reading (${last.odometer}). Save anyway?`))return;
  try{await sbReq('covase_mileage_readings',{method:'POST',body:{vehicle_id:vrId,reading_date:document.getElementById('ml-date').value,odometer:odo,source:document.getElementById('ml-src').value},prefer:'return=minimal'});toast('Reading added','success');loadVehicleRecordData();}
  catch(e){toast('Save failed: '+e.message,'error');}
}

// ── Allocations ──
lsInjectModal('realloc-modal',`
  <div class="modal-header"><div class="modal-title">Allocate driver</div><button class="modal-close" onclick="document.getElementById('realloc-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body">
    <div class="form-row"><div class="form-field"><label>New driver *</label><select id="ra-driver"></select></div><div class="form-field"><label>From date *</label><input type="date" id="ra-date"></div></div>
    <div class="form-row trio"><div class="form-field"><label>Type</label><select id="ra-type">${lsOptions([['permanent','Permanent'],['temporary','Temporary'],['pool','Pool vehicle']],'permanent')}</select></div>
      <div class="form-field"><label>Handover mileage</label><input type="number" id="ra-miles" min="0"></div>
      <div class="form-field" id="ra-reason-wrap"><label>Why the last driver handed it on</label><select id="ra-reason">${lsOptions(['Driver swap','Driver left','Novation','Other'],'Driver swap')}</select></div></div>
    <div class="form-field"><label>Notes</label><input id="ra-notes"></div>
    <div style="font-size:11px;color:var(--n400)">The current allocation ends the day before; the handover mileage also goes into the mileage log.</div>
  </div>
  <div class="modal-footer"><button class="btn-secondary-modal" onclick="document.getElementById('realloc-modal').classList.remove('open')">Cancel</button><button class="btn-primary-modal" onclick="saveReallocation()">Save allocation</button></div>`);
function openReallocate(){
  const v=(allVehicles||[]).find(x=>x.id===vrId);const cur=vrData.allocs.find(a=>!a.end_date);
  document.getElementById('ra-driver').innerHTML=lsContactOptions(v.account_id,!cur&&!vrData.allocs.length?v.driver_id:'');
  document.getElementById('ra-date').value=!cur&&!vrData.allocs.length&&v.delivery_date?v.delivery_date:new Date().toISOString().slice(0,10);
  document.getElementById('ra-reason-wrap').style.display=cur?'':'none';document.getElementById('ra-miles').value='';document.getElementById('ra-notes').value='';
  document.getElementById('realloc-modal').classList.add('open');
}
async function saveReallocation(){
  const driver=document.getElementById('ra-driver').value,date=document.getElementById('ra-date').value;if(!driver||!date){toast('Choose the driver and date','error');return;}
  const miles=document.getElementById('ra-miles').value?parseInt(document.getElementById('ra-miles').value):null;
  const cur=vrData.allocs.find(a=>!a.end_date);
  if(cur&&date<=cur.start_date){toast('The new allocation must start after '+fmtUK(cur.start_date),'error');return;}
  try{
    if(cur){const end=addDaysIso(date,-1);await sbReq(`covase_assignments?id=eq.${encodeURIComponent(cur.id)}`,{method:'PATCH',body:{end_date:end<=cur.start_date?date:end,end_reason:document.getElementById('ra-reason').value,end_mileage:miles,updated_at:new Date().toISOString()},prefer:'return=minimal'});}
    await sbReq('covase_assignments',{method:'POST',body:{vehicle_id:vrId,contact_id:driver,start_date:date,allocation_type:document.getElementById('ra-type').value,start_mileage:miles,notes:document.getElementById('ra-notes').value||null},prefer:'return=minimal'});
    if(miles!=null)await sbReq('covase_mileage_readings',{method:'POST',body:{vehicle_id:vrId,reading_date:date,odometer:miles,source:'handover'},prefer:'return=minimal'}).catch(()=>{});
    await sbReq(`covase_vehicles?id=eq.${encodeURIComponent(vrId)}`,{method:'PATCH',body:{driver_id:driver,updated_at:new Date().toISOString()},prefer:'return=minimal'});
    const v=(allVehicles||[]).find(x=>x.id===vrId);if(v)v.driver_id=driver;
    document.getElementById('realloc-modal').classList.remove('open');toast('Allocation saved','success');loadVehicleRecordData();renderFleet();
  }catch(e){toast('Save failed: '+e.message,'error');}
}
function addDaysIso(iso,n){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
async function endAllocation(){
  const cur=vrData.allocs.find(a=>!a.end_date);if(!cur)return;
  const date=prompt('Date the vehicle was returned (YYYY-MM-DD)',new Date().toISOString().slice(0,10));if(!date)return;
  if(date<=cur.start_date){toast('Must be after '+fmtUK(cur.start_date),'error');return;}
  try{await sbReq(`covase_assignments?id=eq.${encodeURIComponent(cur.id)}`,{method:'PATCH',body:{end_date:date,end_reason:'Vehicle returned',updated_at:new Date().toISOString()},prefer:'return=minimal'});toast('Allocation ended','success');loadVehicleRecordData();}
  catch(e){toast('Save failed: '+e.message,'error');}
}

// ── Purchase orders ──
function addrBlock(o){return fmtAddressLines(o||{});}
function funderAddresses(funderId){return (window._acctAddrCache||{})[funderId]||[];}
async function openNewPo(){
  const v=(allVehicles||[]).find(x=>x.id===vrId);if(!v)return;
  let regAddr='',invAddr='';
  if(v.funder_id){try{const rows=await sbReq(`covase_account_addresses?account_id=eq.${encodeURIComponent(v.funder_id)}`);
    const reg=rows.find(r=>r.kind==='registration'),inv=rows.find(r=>r.kind==='invoice');
    const fn=accName(v.funder_id);
    if(reg)regAddr=[fn+(reg.reference?' Fleet Number '+reg.reference:''),addrBlock(reg)].join('\n');
    if(inv)invAddr=[fn,addrBlock(inv)].join('\n');}catch(e){}}
  const drv=(allContacts||[]).find(c=>c.id===v.driver_id)||{};
  const body={vehicle_id:v.id,order_id:v.order_id||null,dealer_account_id:v.dealer_id||null,funder_account_id:v.funder_id||null,
    vehicle_description:[lsMake(v.manufacturer||v.make),v.model,v.derivative].filter(Boolean).join(' '),
    extras:(()=>{const col=[v.exterior_colour,v.interior_trim].filter(Boolean).join(' with ');const rest=String(v.optional_extras||'').split('\n').map(s=>s.trim()).filter(s=>s&&s!==v.exterior_colour&&s!==v.interior_trim);return [col,...rest].filter(Boolean).join('\n');})(),otr:v.otr??null,
    registration_address:regAddr||null,invoice_address:invAddr||null,
    delivery_contact:[contactDisplayName(drv.first_name?drv:{first_name:'',last_name:''}).trim(),drv.mobile].filter(Boolean).join(' - ')||null,delivery_phone:drv.mobile||null,
    delivery_address:[accName(v.account_id),addrBlock(drv)].filter(Boolean).join('\n')||null,required_not_before:v.expected_delivery_date||null};
  const dealerRef=prompt("Dealer's quote reference (optional)","");if(dealerRef===null)return;body.dealer_quote_ref=dealerRef||null;
  try{const r=await sbReq('covase_purchase_orders',{method:'POST',body});const po=Array.isArray(r)?r[0]:r;toast(po.po_number+' raised','success');
    const cl=JSON.parse(JSON.stringify(v.stage_checklist||{}));cl.order_to_dealer=cl.order_to_dealer||{};cl.order_to_dealer.po_raised=new Date().toISOString().slice(0,10);v.stage_checklist=cl;
    sbReq(`covase_vehicles?id=eq.${encodeURIComponent(v.id)}`,{method:'PATCH',body:{stage_checklist:cl,covase_po_number:po.po_number},prefer:'return=minimal'}).catch(()=>{});
    await loadVehicleRecordData();
    if(!regAddr||!invAddr)toast('Add the funder\'s registration and invoice addresses on their account to print them on POs','info');
    printPo(po.id);}
  catch(e){toast('Could not raise the PO: '+e.message,'error');}
}
async function poSetStatus(id,status){
  const now=new Date().toISOString();const body={status,updated_at:now};if(status==='sent')body.sent_at=now;if(status==='confirmed')body.confirmed_at=now;
  try{await sbReq(`covase_purchase_orders?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body,prefer:'return=minimal'});
    if(status==='sent')toggleChecklist(vrId,'order_to_dealer','po_sent',true);
    if(status==='confirmed'){await toggleChecklist(vrId,'order_confirmed','dealer_confirmed',true);const v=(allVehicles||[]).find(x=>x.id===vrId);if(v&&vehicleStage(v)==='order_to_dealer')vehicleSetStage(vrId,'order_confirmed');}
    loadVehicleRecordData();}
  catch(e){toast('Update failed: '+e.message,'error');}
}
function printPo(id){
  const p=vrData.pos.find(x=>x.id===id);if(!p){toast('PO not loaded yet — try again','error');return;}
  const nl=s=>esc(s||'').replace(/\n/g,'<br>');
  const html=`${covaseHeader()}<div class="grid"><div style="font-family:var(--netto);font-size:20pt;line-height:1.15">Purchase Order<br><span class="teal" style="font-size:14pt">Dealer</span></div>
    <div style="flex:1"><span class="teal">Order prepared for</span><br><strong>${esc(accName(p.dealer_account_id)||'Dealer')}</strong></div>
    <div class="box">${esc(p.po_number)}<small>${esc(new Date(p.po_date||Date.now()).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}))}</small></div></div>
  <table class="v"><tr><th>VEHICLE DETAILS</th><th class="r">TOTAL OTR</th><th class="r">REFERENCE</th></tr>
    <tr><td><strong>${esc(p.vehicle_description||'')}</strong><br>${nl(p.extras)}</td><td class="r">${lsMoney(p.otr)}<br><span style="font-size:8pt">(incl. VAT &amp; RFL)</span></td><td class="r">${esc(p.dealer_quote_ref||'')}${p.dealer_quote_date?'<br>'+esc(fmtUK(p.dealer_quote_date)):''}</td></tr></table>
  <table class="v left" style="margin-top:6mm"><tr><th>REGISTRATION ADDRESS*</th><th>INVOICE ADDRESS**</th><th>DELIVERY DETAILS</th><th>DELIVERY DATE</th></tr>
    <tr><td>${nl(p.registration_address)||'—'}</td><td>${nl(p.invoice_address)||'—'}</td><td>${nl([p.delivery_contact,p.delivery_address].filter(Boolean).join('\n'))}</td><td>Please advise an expected delivery date${p.required_not_before?'<br><br>Required no sooner than<br>'+esc(fmtUK(p.required_not_before)):''}</td></tr></table>
  <div class="grid" style="align-items:stretch;margin-top:8mm"><div style="flex:1"><p>To accept/confirm this order please return a signed/scanned copy of this PO to admin@covase.co.uk</p><p class="small">* Please provide a copy of the AFRL certificate to confirm the above registration address<br><br>**Please send all invoices to Covase, Woodgreen Farm Barns, Mead Lane, Upper Basildon, Berkshire, RG8 8NA</p></div>
  <div class="sig" style="flex:1">Name<br>Projected build date (if applicable)<br>Estimated delivery date<br>Today's date<br>Signature</div></div>${COVASE_FOOTER}`;
  lsPrint(html,p.po_number);
}

// ── P11D report: every allocation overlapping a tax year (6 Apr – 5 Apr) ──
async function exportP11d(){
  const now=new Date();const y=now.getMonth()>3||(now.getMonth()===3&&now.getDate()>=6)?now.getFullYear():now.getFullYear()-1;
  const ans=prompt('Tax year starting April of (e.g. '+(y-1)+' for '+(y-1)+'/'+String(y).slice(2)+')',String(y-1));if(!ans)return;
  const ys=parseInt(ans);const from=`${ys}-04-06`,to=`${ys+1}-04-05`;
  try{
    await lsEnsureCrm();
    const allocs=await sbReq(`covase_assignments?start_date=lte.${to}&or=(end_date.is.null,end_date.gte.${from})&limit=5000`);
    const rows=[['Client','Driver','Employee no','Registration','Vehicle','Fuel','P11D value','CO2 g/km','EV range','First registered','Available from','Available to','Days available','Driver contribution']];
    allocs.forEach(a=>{const v=(allVehicles||[]).find(x=>x.id===a.vehicle_id)||{};const c=(allContacts||[]).find(x=>x.id===a.contact_id)||{};
      const s=a.start_date>from?a.start_date:from,e=a.end_date&&a.end_date<to?a.end_date:to;
      const days=Math.round((new Date(e)-new Date(s))/864e5)+1;
      rows.push([accName(v.account_id),contactDisplayName(c.first_name?c:{first_name:'',last_name:''}),c.employee_number||'',vehicleRegOf(v),[lsMake(v.manufacturer||v.make),v.model,v.derivative].filter(Boolean).join(' '),v.fuel_type||'',v.p11d_value??'',v.co2_emissions??v.co2_gkm??'',v.ev_range??'',v.registration_date||v.date_of_registration||'',fmtUK(s),fmtUK(e),days,v.driver_contribution??'']);});
    if(rows.length===1){toast('No allocations in that tax year yet','info');return;}
    const csv=rows.map(r=>r.map(x=>{const t=String(x??'');return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;}).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`P11D vehicles ${ys}-${String(ys+1).slice(2)}.csv`;a.click();
    toast(`${rows.length-1} allocation${rows.length===2?'':'s'} exported`,'success');
  }catch(e){toast('Export failed: '+e.message,'error');}
}

// ── wiring ──
window.EXTRA_VIEW_LOADERS=Object.assign(window.EXTRA_VIEW_LOADERS||{},{fleet:loadFleet});
RT_TABLES.covase_purchase_orders=()=>{if(vrId)loadVehicleRecordData();};
RT_TABLES.covase_assignments=()=>{if(vrId)loadVehicleRecordData();};
RT_TABLES.covase_mileage_readings=()=>{if(vrId)loadVehicleRecordData();};
{const prevVeh=RT_TABLES.covase_vehicles;RT_TABLES.covase_vehicles=()=>{prevVeh();if(fleetLoaded)setTimeout(renderFleet,400);};}
window.TAPMOVE_KINDS=Object.assign(window.TAPMOVE_KINDS||{},{lease:id=>{const v=(allVehicles||[]).find(x=>x.id===id);return v&&{title:'Move vehicle to',current:vehicleStage(v),lanes:LEASE_STAGES.map(([key,label])=>({key,label})),apply:vehicleSetStage};}});
