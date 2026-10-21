// ─── CLIENT OVERVIEW, CRM DASHBOARD, ACCOUNT ADDRESSES, FUNDER RULES ───

// ── Client overview: everything about one account on one screen ──
let ovAccountId=null;
lsInjectModal('overview-modal',`
  <div class="modal-header"><div><div class="modal-title" id="ov-title">Client overview</div><div id="ov-sub" style="font-size:12px;color:var(--n500);margin-top:2px"></div></div><button class="modal-close" onclick="document.getElementById('overview-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body" id="ov-body"><div class="loading">Loading…</div></div>
  <div class="modal-footer"><button class="btn-secondary-modal" style="margin-right:auto" onclick="openDocs('account',ovAccountId,document.getElementById('ov-title').textContent)">📎 Documents</button>
    <button class="btn-secondary-modal" onclick="document.getElementById('overview-modal').classList.remove('open');openEditAccount(ovAccountId)">✎ Edit account</button>
    <button class="btn-primary-modal" onclick="document.getElementById('overview-modal').classList.remove('open');ovNewOrder()">+ New order</button></div>`,true);
async function openClientOverview(id){
  await lsEnsureCrm();
  const a=(allAccounts||[]).find(x=>x.id===id);if(!a)return;ovAccountId=id;
  document.getElementById('ov-title').textContent=a.company_name;
  document.getElementById('ov-sub').textContent=[a.type,a.account_manager&&('Account manager: '+a.account_manager),a.payment_terms].filter(Boolean).join(' · ');
  document.getElementById('ov-body').innerHTML='<div class="loading">Loading everything for this client…</div>';
  document.getElementById('overview-modal').classList.add('open');
  const enc=encodeURIComponent,safe=p=>p.catch(()=>[]);
  const vehicles=(allVehicles||[]).filter(v=>v.account_id===id);
  const regs=vehicles.map(v=>vehicleRegOf(v).replace(/\s+/g,'')).filter(Boolean);
  const regIn=regs.length?`(${regs.map(r=>'"'+r+'"').join(',')})`:null;
  const [orders,hires,movements,claims,finesByReg,finesByName,docs,allocs]=await Promise.all([
    safe(sbReq(`covase_orders?account_id=eq.${enc(id)}&order=created_at.desc`)),
    safe(sbReq(`covase_hires?client_account_id=eq.${enc(id)}&order=start_date.desc&limit=200`)),
    safe(sbReq(`covase_movements?client_account_id=eq.${enc(id)}&order=movement_date.desc&limit=200`)),
    safe(sbReq(`covase_claims?client_account_id=eq.${enc(id)}&order=incident_date.desc&limit=200`)),
    regIn?safe(sbReq(`covase_fines?vehicle_reg=in.${enc(regIn)}&order=created_at.desc&limit=200`)):[],
    safe(sbReq(`covase_fines?company=eq.${enc(a.company_name)}&order=created_at.desc&limit=200`)),
    safe(sbReq(`covase_document_links?record_type=eq.account&record_id=eq.${enc(id)}&select=document_id,covase_documents(*)`)),
    vehicles.length?safe(sbReq(`covase_assignments?vehicle_id=in.(${vehicles.map(v=>'"'+v.id+'"').join(',')})&end_date=is.null`)):[]]);
  if(ovAccountId!==id)return;
  const fines=[...new Map([...finesByReg,...finesByName].map(f=>[f.id,f])).values()];
  const contacts=(allContacts||[]).filter(c=>c.account_id===id);
  const onFleet=vehicles.filter(v=>vehicleStage(v)==='on_fleet'),onOrder=vehicles.filter(v=>!['on_fleet','off_hire'].includes(vehicleStage(v)));
  const monthly=onFleet.reduce((s,v)=>s+leaseSums(v).total,0);
  const openOrders=orders.filter(o=>!['won','lost'].includes(o.stage));
  const activeHires=hires.filter(h=>['requested','booked','active'].includes(h.hire_status));
  const openFines=fines.filter(f=>!['charged','cancelled','refunded','appeal_upheld'].includes(f.status));
  const sec=(t,n,body)=>`<div class="detail-section-head">${esc(t)} <span style="color:var(--n400);font-weight:400">(${n})</span></div>${body}`;
  const tbl=(rows,fn,empty)=>rows.length?`<table class="ls-table">${rows.map(fn).join('')}</table>`:`<div class="empty-sub" style="padding:2px 0 10px">${empty||'None.'}</div>`;
  const live=docs.map(d=>d.covase_documents).filter(d=>d&&!d.deleted_at);
  document.getElementById('ov-body').innerHTML=`
    <div class="financials-row">
      <div><span>On fleet</span><strong>${onFleet.length}</strong></div><div><span>On order</span><strong>${onOrder.length}</strong></div>
      <div><span>Monthly rentals</span><strong>${lsMoney(monthly)}</strong></div><div><span>Open orders</span><strong>${openOrders.length}</strong></div>
      <div><span>Active hires</span><strong>${activeHires.length}</strong></div><div><span>Open fines</span><strong>${openFines.length}</strong></div></div>
    ${fmtAddressLines(a)?`<div class="notes-box" style="white-space:pre-line">📍 ${esc(fmtAddressLines(a))}</div>`:''}
    ${sec('Contacts',contacts.length,tbl(contacts.slice(0,40),c=>`<tr><td>${esc(contactDisplayName(c))}</td><td>${esc(c.contact_type||'')}</td><td>${esc(c.email||'')}</td><td>${esc(c.mobile||'')}</td></tr>`))}
    ${sec('Vehicles',vehicles.length,tbl(vehicles,v=>{const cur=allocs.find(x=>x.vehicle_id===v.id);return `<tr style="cursor:pointer" onclick="document.getElementById('overview-modal').classList.remove('open');openVehicleRecord('${esc(v.id)}')"><td>${esc(vehicleRegOf(v)||'TBC')}</td><td>${esc([v.manufacturer||v.make,v.model].filter(Boolean).join(' '))}</td><td>${esc(conName(cur?cur.contact_id:v.driver_id))}</td><td>${esc(stageLabel(vehicleStage(v)))}</td><td>${esc(fmtUK(vehicleRenewal(v)))}</td></tr>`;}))}
    ${sec('Orders',orders.length,tbl(orders,o=>`<tr><td>${esc(o.order_ref)}</td><td>${esc(o.title||'')}</td><td>${esc(conName(o.driver_contact_id))}</td><td>${esc(orderStageLabel(o.stage))}</td></tr>`))}
    ${sec('Short hires',hires.length,tbl(hires.slice(0,30),h=>`<tr><td>${esc(h.job_ref||'')}</td><td>${esc(h.driver||'')}</td><td>${esc(h.vehicle_reg||'')}</td><td>${esc(fmtUK(h.start_date))} – ${esc(fmtUK(h.end_date))}</td><td>${esc(h.hire_status||'')}</td></tr>`))}
    ${sec('Movements',movements.length,tbl(movements.slice(0,30),m=>`<tr><td>${esc(m.job_ref||'')}</td><td>${esc(fmtUK(m.movement_date))}</td><td>${esc(m.vehicle_reg||'')}</td><td>${esc(m.movement_status||'')}</td></tr>`))}
    ${sec('Fines & penalties',fines.length,tbl(fines.slice(0,30),f=>`<tr><td>${esc(fmtUK(f.offence_date||f.created_at))}</td><td>${esc(f.vehicle_reg||'')}</td><td>${esc(f.driver_name||'')}</td><td>${esc(f.issuer||'')}</td><td>${esc(f.status||'')}</td></tr>`))}
    ${sec('Accident claims',claims.length,tbl(claims.slice(0,30),c=>`<tr><td>${esc(fmtUK(c.incident_date))}</td><td>${esc(c.claim_reference||'')}</td><td>${esc(c.vehicle_reg||'')}</td><td>${esc(c.driver_name||'')}</td></tr>`))}
    ${sec('Documents',live.length,tbl(live,d=>`<tr><td>${esc(d.title||d.file_name)}</td><td>${esc(docTypeLabel(d.doc_type))}</td><td>${esc(fmtUK(String(d.created_at).slice(0,10)))}</td></tr>`,'None — use 📎 Documents below.'))}`;
}
async function ovNewOrder(){await openNewOrder();document.getElementById('of-account').value=ovAccountId;ofAccountChanged();}

// ── Account addresses (registration / invoice / delivery, e.g. Lex fleet number for POs) ──
let addrAccountId=null;
lsInjectModal('addr-modal',`
  <div class="modal-header"><div class="modal-title" id="addr-title">Addresses</div><button class="modal-close" onclick="document.getElementById('addr-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body"><div id="addr-list"></div>
    <div class="form-section-label">Add an address</div>
    <div class="form-row trio"><div class="form-field"><label>Kind</label><select id="adr-kind">${lsOptions([['registration','Registration (prints on POs)'],['invoice','Invoice (prints on POs)'],['delivery','Delivery site'],['other','Other']],'registration')}</select></div>
      <div class="form-field"><label>Label</label><input id="adr-label" placeholder="e.g. Lex Autolease Limited Fleet"></div><div class="form-field"><label>Reference</label><input id="adr-ref" placeholder="e.g. fleet number 05074-"></div></div>
    <div class="form-row"><div class="form-field"><label>Address line 1</label><input id="adr-l1"></div><div class="form-field"><label>Address line 2</label><input id="adr-l2"></div></div>
    <div class="form-row trio"><div class="form-field"><label>Town</label><input id="adr-town"></div><div class="form-field"><label>County</label><input id="adr-county"></div><div class="form-field"><label>Postcode</label><input id="adr-pc" style="text-transform:uppercase"></div></div>
  </div>
  <div class="modal-footer"><button class="btn-secondary-modal" onclick="document.getElementById('addr-modal').classList.remove('open')">Close</button><button class="btn-primary-modal" onclick="saveAccountAddress()">Add address</button></div>`);
async function openAccountAddresses(id){
  addrAccountId=id;document.getElementById('addr-title').textContent='Addresses — '+accName(id);
  ['adr-label','adr-ref','adr-l1','adr-l2','adr-town','adr-county','adr-pc'].forEach(x=>document.getElementById(x).value='');
  document.getElementById('addr-modal').classList.add('open');loadAccountAddresses();
}
async function loadAccountAddresses(){
  const el=document.getElementById('addr-list');el.innerHTML='<div class="loading">Loading…</div>';
  try{const rows=await sbReq(`covase_account_addresses?account_id=eq.${encodeURIComponent(addrAccountId)}&order=kind.asc`);
    el.innerHTML=rows.length?rows.map(r=>`<div class="doc-row"><div class="doc-main"><div class="doc-name">${esc(r.kind)}${r.label?' — '+esc(r.label):''}${r.reference?' · ref '+esc(r.reference):''}</div><div class="doc-meta" style="white-space:pre-line">${esc(fmtAddressLines(r))}</div></div><button class="btn btn-danger" onclick="deleteAccountAddress('${esc(r.id)}')">✗</button></div>`).join(''):'<div class="empty-sub" style="padding:6px 0">No extra addresses yet.</div>';}
  catch(e){el.innerHTML=`<div class="empty-sub">${esc(e.message)}</div>`;}
}
async function saveAccountAddress(){
  const g=id=>(document.getElementById(id).value||'').trim()||null;
  const body={account_id:addrAccountId,kind:g('adr-kind'),label:g('adr-label'),reference:g('adr-ref'),address_line1:g('adr-l1'),address_line2:g('adr-l2'),town:g('adr-town'),county:g('adr-county'),postcode:(g('adr-pc')||'').toUpperCase()||null};
  if(!body.address_line1&&!body.postcode){toast('Enter at least the first line or postcode','error');return;}
  try{await sbReq('covase_account_addresses',{method:'POST',body,prefer:'return=minimal'});toast('Address added','success');['adr-label','adr-ref','adr-l1','adr-l2','adr-town','adr-county','adr-pc'].forEach(x=>document.getElementById(x).value='');loadAccountAddresses();}
  catch(e){toast('Save failed: '+e.message,'error');}
}
async function deleteAccountAddress(id){if(!confirm('Remove this address? POs already raised keep their printed copy.'))return;try{await sbReq(`covase_account_addresses?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=minimal'});loadAccountAddresses();}catch(e){toast('Remove failed: '+e.message,'error');}}

// ── CRM dashboard ──
lsInjectView('view-crm-dashboard',`
  <div class="topbar"><h1>CRM dashboard</h1><button class="topbar-btn" onclick="loadCrmDashboard()">↻ Refresh</button><button class="topbar-btn" onclick="exportP11d()">⬇ P11D report (CSV)</button><button class="topbar-btn" onclick="openFunderRules()">⚙ Funder rules</button></div>
  <div class="content" id="crm-dash"><div class="loading">Loading…</div></div>`);
async function loadCrmDashboard(){
  const el=document.getElementById('crm-dash');if(!el||needsSetup(el))return;
  try{
    await lsEnsureCrm();
    const [o,q,m]=await Promise.all([sbReq('covase_orders?limit=2000'),sbReq('covase_quotes?limit=5000'),sbReq('covase_mileage_readings?order=reading_date.desc&limit=5000').catch(()=>[])]);
    allOrders=o;allQuotes=q;
    const vs=(allVehicles||[]).filter(v=>v.status!=='cancelled');
    const pipe=ORDER_STAGES.map(([k,l])=>{const rows=o.filter(x=>x.stage===k);return {l,n:rows.length,p:rows.reduce((s,x)=>{const hq=orderHeadlineQuote(x);return s+(hq?leaseSums(hq).profit:0);},0)};});
    const stages=LEASE_STAGES.filter(s=>!['on_fleet','off_hire'].includes(s[0])).map(([k,l])=>{const rows=vs.filter(v=>vehicleStage(v)===k);return {l,n:rows.length,stuck:rows.filter(v=>v.lease_stage&&daysSince(v.stage_changed_at)>=14).length};});
    const in30=Date.now()+30*864e5,in180=Date.now()+182*864e5;
    const deliveries=vs.filter(v=>!['on_fleet','off_hire'].includes(vehicleStage(v))&&v.expected_delivery_date&&new Date(v.expected_delivery_date)<=in30).sort((a,b)=>String(a.expected_delivery_date).localeCompare(b.expected_delivery_date));
    const renewals=vs.filter(v=>vehicleStage(v)==='on_fleet'&&vehicleRenewal(v)&&new Date(vehicleRenewal(v))<=in180).sort((a,b)=>String(vehicleRenewal(a)).localeCompare(vehicleRenewal(b)));
    const months={};o.filter(x=>x.stage==='won'&&x.won_at).forEach(x=>{const k=String(x.won_at).slice(0,7);const hq=orderHeadlineQuote(x);months[k]=(months[k]||0)+(hq?leaseSums(hq).profit:0);});
    const monthRows=Object.entries(months).sort().slice(-12);
    const byV={};m.forEach(r=>{(byV[r.vehicle_id]=byV[r.vehicle_id]||[]).push(r);});
    const mileage=vs.map(v=>({v,p:byV[v.id]?mileageProjection(v,byV[v.id]):null})).filter(x=>x.p&&x.p.allowance&&Math.abs(x.p.variance)>0.1).sort((a,b)=>b.p.variance-a.p.variance);
    const card=(t,body)=>`<div class="ls-dash-card"><div class="detail-section-head" style="margin-top:0">${esc(t)}</div>${body}</div>`;
    const bar=(n,max)=>`<div class="ls-bar"><span style="width:${max?Math.round(n/max*100):0}%"></span></div>`;
    const maxP=Math.max(1,...pipe.map(x=>x.n)),maxS=Math.max(1,...stages.map(x=>x.n)),maxM=Math.max(1,...monthRows.map(x=>x[1]));
    el.innerHTML=`<div class="ls-dash">
      ${card('Order pipeline',`<table class="ls-table">${pipe.map(x=>`<tr><td>${esc(x.l)}</td><td style="width:40%">${bar(x.n,maxP)}</td><td>${x.n}</td><td>${lsMoney(x.p)}</td></tr>`).join('')}</table>`)}
      ${card('Vehicles on order by stage',`<table class="ls-table">${stages.map(x=>`<tr><td>${esc(x.l)}</td><td style="width:40%">${bar(x.n,maxS)}</td><td>${x.n}</td><td>${x.stuck?`<span class="profit-neg">${x.stuck} stuck 14d+</span>`:''}</td></tr>`).join('')}</table>`)}
      ${card('Deliveries due in 30 days',deliveries.length?`<table class="ls-table">${deliveries.map(v=>`<tr style="cursor:pointer" onclick="openVehicleRecord('${esc(v.id)}')"><td>${esc(fmtUK(v.expected_delivery_date))}</td><td>${esc(vehicleLabel(v))}</td><td>${esc(accName(v.account_id))}</td></tr>`).join('')}</table>`:'<div class="empty-sub">None due.</div>')}
      ${card('Renewals in the next 6 months',renewals.length?`<table class="ls-table">${renewals.map(v=>`<tr style="cursor:pointer" onclick="openVehicleRecord('${esc(v.id)}')"><td>${esc(fmtUK(vehicleRenewal(v)))}</td><td>${esc(vehicleLabel(v))}</td><td>${esc(accName(v.account_id))}</td><td>${esc(conName(v.driver_id))}</td></tr>`).join('')}</table>`:'<div class="empty-sub">None — or delivery dates / terms not filled in yet.</div>')}
      ${card('Profit won by month',monthRows.length?`<table class="ls-table">${monthRows.map(([k,v])=>`<tr><td>${esc(k)}</td><td style="width:50%">${bar(v,maxM)}</td><td>${lsMoney(v)}</td></tr>`).join('')}</table>`:'<div class="empty-sub">No orders won in ORBIS yet.</div>')}
      ${card('Mileage more than 10% off allowance',mileage.length?`<table class="ls-table">${mileage.map(({v,p})=>`<tr style="cursor:pointer" onclick="openVehicleRecord('${esc(v.id)}')"><td>${esc(vehicleLabel(v))}</td><td>${(p.variance>0?'+':'')+Math.round(p.variance*100)}%</td><td>${p.excessCost?lsMoney(p.excessCost):''}</td></tr>`).join('')}</table>`:'<div class="empty-sub">Nothing flagged — add mileage readings to vehicles to track this.</div>')}
    </div>`;
  }catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-title">Couldn't load the dashboard</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}

// ── Funder rules editor ──
const FR_FIELD_LABELS={funders_quote_no:'Funder quote number',quote_date:'Quote date',vehicle:'Vehicle description',funding_method:'Funding method',payment_plan:'Payment plan (wording)',term_months:'Term',mileage:'Mileage (annual / total)',otr:'OTR price',commissions:'Commission',co2_emissions:'CO2',engine_cc:'Engine CC',fuel_type:'Fuel type',transmission:'Transmission',body_style:'Body style',num_doors:'Doors',fuel_consumption:'Fuel consumption',ev_range:'EV range',finance_rental:'Finance rental',service_rental:'Service rental',monthly_rental:'Monthly (total) rental — for checking',effective_rental:'Effective rental — for checking',excess_mileage:'Excess mileage (ppm)',p11d_value:'P11D value'};
lsInjectModal('funder-rules-modal',`
  <div class="modal-header"><div class="modal-title">Funder rules — what the worksheet wording means</div><button class="modal-close" onclick="document.getElementById('funder-rules-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body"><div style="font-size:12px;color:var(--n500);margin-bottom:10px">For each ORBIS field, list the label(s) the funder prints on its worksheet, separated by “ | ”. Labels must match exactly (any case). If a funder changes its paperwork, change the label here.</div><div id="fr-body"></div></div>
  <div class="modal-footer"><button class="btn-secondary-modal" style="margin-right:auto" onclick="if(confirm('Put the Lex rules back to how ORBIS shipped them?')){funderRules=JSON.parse(JSON.stringify(DEFAULT_FUNDER_RULES));renderFunderRules();}">Reset to default</button><button class="btn-secondary-modal" onclick="document.getElementById('funder-rules-modal').classList.remove('open')">Cancel</button><button class="btn-primary-modal" onclick="saveFunderRulesForm()">Save rules</button></div>`,true);
async function openFunderRules(){await loadFunderRules();renderFunderRules();document.getElementById('funder-rules-modal').classList.add('open');}
function renderFunderRules(){
  document.getElementById('fr-body').innerHTML=Object.entries(funderRules).map(([key,r])=>`<div class="form-section-label">${esc(r.name)}</div><table class="ls-table">${Object.keys(FR_FIELD_LABELS).map(f=>`<tr><td style="width:38%">${esc(FR_FIELD_LABELS[f])}</td><td><input style="width:100%" data-fr="${esc(key)}" data-field="${esc(f)}" value="${esc((r.fields[f]||[]).join(' | '))}"></td></tr>`).join('')}</table>
    <div class="form-section-label">Fuel wording</div><table class="ls-table">${Object.entries(r.fuel||{}).map(([w,v])=>`<tr><td style="width:38%">“${esc(w)}” means</td><td><input style="width:100%" data-frfuel="${esc(key)}" data-word="${esc(w)}" value="${esc(v)}"></td></tr>`).join('')}</table>`).join('');
}
async function saveFunderRulesForm(){
  document.querySelectorAll('#fr-body [data-fr]').forEach(i=>{const r=funderRules[i.dataset.fr];r.fields[i.dataset.field]=i.value.split('|').map(s=>s.trim()).filter(Boolean);});
  document.querySelectorAll('#fr-body [data-frfuel]').forEach(i=>{funderRules[i.dataset.frfuel].fuel[i.dataset.word]=i.value.trim();});
  try{await saveFunderRules();toast('Funder rules saved','success');document.getElementById('funder-rules-modal').classList.remove('open');}catch(e){toast('Save failed: '+e.message,'error');}
}

// ── hooks into the existing account, contact and vehicle cards ──
window.EXTRA_VIEW_LOADERS=Object.assign(window.EXTRA_VIEW_LOADERS||{},{'crm-dashboard':loadCrmDashboard});
{const prevCfg=RT_TABLES.covase_config;RT_TABLES.covase_config=()=>{prevCfg();loadFunderRules();};}
