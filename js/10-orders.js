// ─── LEASE ORDERS & QUOTES (phase-lease-crm.sql) ───
// An order is the Dynamics "Opportunity": enquiry → quoting → proposal sent →
// won/lost, with any number of quotes under it. A quote is usually read from
// the funder's worksheet (Lex first; wording mapped by editable funder rules).
// Money is entered once, on the quote; totals, effective rental and profit
// are always worked out here and never stored. Accepting a quote closes the
// order as won and creates the vehicle record with everything copied across.

// ── Shared lease sums (used by orders, quotes, vehicles, dashboard) ──
function lsNum(v){const n=parseFloat(v);return isNaN(n)?0:n;}
function lsMoney(v){return (v===null||v===undefined||v==='')?'—':'£'+lsNum(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});}
function lsRound(n){return Math.round(n*100)/100;}
// Effective rental = total rental + the VAT the client can't reclaim:
// cars 50% of the VAT on the finance rental, LCVs nil (Simon, 21 Oct 2026).
function leaseSums(q){
  q=q||{};
  const fin=lsNum(q.finance_rental),svc=lsNum(q.service_rental);
  const total=lsRound(fin+svc);
  const lcv=String(q.vehicle_type||'').toUpperCase()==='LCV';
  const unreclaimable=lcv?0:lsRound(fin*0.2*0.5);
  const effective=lsRound(total+unreclaimable);
  const term=parseInt(q.term_months)||0;
  const mgmtProfit=lsRound(lsNum(q.management_fee)*term);
  const profit=lsRound(lsNum(q.commissions)+lsNum(q.setup_fee)+mgmtProfit+lsNum(q.other_revenue)-lsNum(q.costs));
  return {total,unreclaimable,effective,mgmtProfit,profit};
}
function vehicleTitle(q){return [q.manufacturer,q.model,q.derivative].filter(Boolean).join(' ')||'Vehicle not set';}
function accName(id){const a=(allAccounts||[]).find(x=>x.id===id);return a?a.company_name:'';}
function conName(id){const c=(allContacts||[]).find(x=>x.id===id);return c?contactDisplayName(c):'';}
function lsInjectView(id,html){if(document.getElementById(id))return;const anchor=document.getElementById('view-vehicles');if(!anchor)return;const d=document.createElement('div');d.className='view';d.id=id;d.innerHTML=html;anchor.parentNode.appendChild(d);}
function lsInjectModal(id,html,wide){if(document.getElementById(id))return;const d=document.createElement('div');d.className='modal-overlay';d.id=id;d.innerHTML=`<div class="modal${wide?' ls-wide':''}">${html}</div>`;document.body.appendChild(d);}
function lsOptions(list,sel,blank){return (blank?`<option value="">${esc(blank)}</option>`:'')+list.map(o=>{const v=Array.isArray(o)?o[0]:o,l=Array.isArray(o)?o[1]:o;return `<option value="${esc(v)}"${String(v)===String(sel??'')?' selected':''}>${esc(l)}</option>`;}).join('');}
function lsAccountOptions(types,sel,blank){return lsOptions((allAccounts||[]).filter(a=>!types||types.includes(a.type)).map(a=>[a.id,a.company_name]),sel,blank||'— select —');}
function lsContactOptions(accountId,sel){const list=(allContacts||[]).filter(c=>!accountId||c.account_id===accountId);return lsOptions(list.map(c=>[c.id,contactDisplayName(c)]),sel,'— select —');}
async function lsEnsureCrm(){
  const jobs=[];
  if(!(allAccounts||[]).length)jobs.push(sbReq('covase_accounts?order=company_name.asc&limit=1000').then(r=>{allAccounts=r||[];}).catch(()=>{}));
  if(!(allContacts||[]).length)jobs.push(sbReq('covase_contacts?order=last_name.asc,first_name.asc&limit=2000').then(r=>{allContacts=r||[];}).catch(()=>{}));
  if(!(allVehicles||[]).length)jobs.push(sbReq('covase_vehicles?order=created_at.desc&limit=1000').then(r=>{allVehicles=r||[];}).catch(()=>{}));
  await Promise.all(jobs);
}

// ── Orders board ──
const ORDER_STAGES=[['enquiry','Enquiry'],['quoting','Quoting'],['proposal_sent','Proposal sent'],['won','Won'],['lost','Lost']];
const ORDER_NEXT={enquiry:'quoting',quoting:'proposal_sent'};
const LOST_REASONS=['Price','Funder declined','Client went elsewhere','No longer needed','Other'];
let allOrders=[],allQuotes=[],ordersLoaded=false;
function orderStageLabel(s){return (ORDER_STAGES.find(x=>x[0]===s)||[0,s])[1];}

lsInjectView('view-orders',`
  <div class="topbar">
    <h1>Orders</h1>
    <input class="search-box" type="text" id="order-search" placeholder="Search client, driver, vehicle, ref…" oninput="renderOrders()">
    <button class="topbar-btn" onclick="loadOrders()">↻ Refresh</button>
    <button class="topbar-btn primary" onclick="openNewOrder()">+ New order</button>
  </div>
  <div class="stats-row">
    <div class="stat-card stat-covase"><div class="stat-label">Open orders</div><div class="stat-val" id="sor-open">—</div><div class="stat-sub">enquiry to proposal</div></div>
    <div class="stat-card stat-indigo"><div class="stat-label">Pipeline profit</div><div class="stat-val" id="sor-pipe">—</div><div class="stat-sub">chosen or best quote</div></div>
    <div class="stat-card stat-green"><div class="stat-label">Won (12 months)</div><div class="stat-val" id="sor-won">—</div></div>
    <div class="stat-card stat-orange"><div class="stat-label">Lost (12 months)</div><div class="stat-val" id="sor-lost">—</div></div>
  </div>
  <div class="content"><div id="order-kanban" class="kanban" style="grid-template-columns:repeat(5,minmax(220px,1fr))"><div class="loading">Loading orders…</div></div></div>`);

async function loadOrders(){
  const el=document.getElementById('order-kanban');if(!el||needsSetup(el))return;
  try{
    await lsEnsureCrm();
    const [o,q]=await Promise.all([sbReq('covase_orders?order=created_at.desc&limit=1000'),sbReq('covase_quotes?order=created_at.asc&limit=3000')]);
    allOrders=o||[];allQuotes=q||[];ordersLoaded=true;
    renderOrders();updateOrderStats();
    const om=document.getElementById('order-modal');if(om&&om.classList.contains('open')&&editOrderId)renderOrderQuotes();
  }catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-title">Couldn't load orders</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}
function orderQuotes(id){return allQuotes.filter(q=>q.order_id===id);}
function orderHeadlineQuote(o){const qs=orderQuotes(o.id);return qs.find(q=>q.id===o.chosen_quote_id)||qs.find(q=>q.status==='accepted')||qs[qs.length-1]||null;}
function updateOrderStats(){
  const yearAgo=new Date(Date.now()-365*864e5).toISOString();
  const open=allOrders.filter(o=>!['won','lost'].includes(o.stage));
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('sor-open',open.length);
  set('sor-pipe',lsMoney(open.reduce((s,o)=>{const q=orderHeadlineQuote(o);return s+(q?leaseSums(q).profit:0);},0)));
  set('sor-won',allOrders.filter(o=>o.stage==='won'&&(o.won_at||o.updated_at)>=yearAgo).length);
  set('sor-lost',allOrders.filter(o=>o.stage==='lost'&&(o.lost_at||o.updated_at)>=yearAgo).length);
  const b=document.getElementById('badge-orders');if(b)b.textContent=open.length||'0';
}
function renderOrders(){
  const wrap=document.getElementById('order-kanban');if(!wrap)return;
  const q=(document.getElementById('order-search')?.value||'').toLowerCase();
  const rows=allOrders.filter(o=>{if(!q)return true;const hq=orderHeadlineQuote(o);return [o.order_ref,o.title,accName(o.account_id),conName(o.driver_contact_id),hq?vehicleTitle(hq):''].join(' ').toLowerCase().includes(q);});
  wrap.innerHTML=ORDER_STAGES.map(([key,label])=>{
    const items=rows.filter(o=>o.stage===key);
    const body=items.length?items.map(orderCard).join(''):'<div class="kan-col-empty">Nothing here</div>';
    return `<div class="kan-col" ondragover="event.preventDefault();this.classList.add('mvkan-over')" ondragleave="this.classList.remove('mvkan-over')" ondrop="orderDrop(event,'${key}')">
      <div class="kan-col-header"><span class="kan-col-title">${esc(label)}</span><span class="kan-col-count">${items.length}</span></div>
      <div class="kan-col-body">${body}</div></div>`;
  }).join('');
}
function orderCard(o){
  const hq=orderHeadlineQuote(o),qs=orderQuotes(o.id);
  const s=hq?leaseSums(hq):null;
  const next=ORDER_NEXT[o.stage];
  const move=IS_TOUCH?`<button type="button" class="kan-move" onclick="openTapMove(event,'order','${esc(o.id)}')">⇄ Move</button>`:'';
  const adv=next?`<button class="kan-advance" onclick="event.stopPropagation();orderSetStage('${esc(o.id)}','${next}')">→ ${esc(orderStageLabel(next))}</button>`:'';
  return `<div class="mv-kan-wrap" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${esc(o.id)}')">
    <div class="kan-card" onclick="openEditOrder('${esc(o.id)}')">
      <div class="kan-card-grid">
        <div class="kan-card-l1">${esc(accName(o.account_id)||o.title||'No client yet')}</div><div class="kan-card-r">${esc(o.order_ref||'')}</div>
        <div class="kan-card-l2">${esc(hq?vehicleTitle(hq):(o.title||'No quote yet'))}</div><div class="kan-card-r">${s?esc(lsMoney(s.total))+'/m':''}</div>
        <div class="kan-card-l3">${esc(conName(o.driver_contact_id)||'Driver not set')} · ${qs.length} quote${qs.length===1?'':'s'}${s?' · profit '+esc(lsMoney(s.profit)):''}</div>
        ${o.stage==='lost'&&o.lost_reason?`<div class="kan-card-l4">Lost: ${esc(o.lost_reason)}</div>`:''}
      </div>
    </div>${(adv||move)?`<div class="mv-kan-actions">${move}${adv}</div>`:''}</div>`;
}
async function orderDrop(e,stage){e.preventDefault();document.querySelectorAll('.kan-col.mvkan-over').forEach(x=>x.classList.remove('mvkan-over'));const id=e.dataTransfer.getData('text/plain');if(id)await orderSetStage(id,stage);}
async function orderSetStage(id,stage){
  const o=allOrders.find(x=>x.id===id);if(!o||o.stage===stage)return;
  if(stage==='won'){openEditOrder(id);toast('Choose the quote the client accepted and click Accept','info');return;}
  const body={stage,updated_at:new Date().toISOString()};
  if(stage==='lost'){const r=prompt('Why was it lost? ('+LOST_REASONS.join(' / ')+')','Price');if(r===null)return;body.lost_reason=r||'Other';body.lost_at=body.updated_at;}
  const prev={...o};Object.assign(o,body);renderOrders();updateOrderStats();
  try{await sbReq(`covase_orders?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body,prefer:'return=minimal'});toast('Moved to '+orderStageLabel(stage),'success');}
  catch(e){Object.assign(o,prev);renderOrders();updateOrderStats();toast('Update failed: '+e.message,'error');}
}

// ── Order modal ──
let editOrderId=null;
lsInjectModal('order-modal',`
  <div class="modal-header"><div class="modal-title" id="order-modal-title">New order</div><button class="modal-close" onclick="closeOrderModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-section-label">Order</div>
    <div class="form-row trio">
      <div class="form-field"><label>Client account *</label><select id="of-account" onchange="ofAccountChanged()"></select></div>
      <div class="form-field"><label>Driver</label><select id="of-driver"></select></div>
      <div class="form-field"><label>Contact</label><select id="of-contact"></select></div>
    </div>
    <div class="form-row trio">
      <div class="form-field"><label>Title</label><input id="of-title" placeholder="e.g. Tim Rogers – EV replacement"></div>
      <div class="form-field"><label>Source</label><select id="of-source">${lsOptions(['Existing renewal','New business','Referral','Website','Other'],'', '— select —')}</select></div>
      <div class="form-field"><label>Owner</label><input id="of-owner" placeholder="Simon Homer"></div>
    </div>
    <div class="form-row trio">
      <div class="form-field"><label>Expected delivery</label><input type="date" id="of-delivery"></div>
      <div class="form-field"><label>Decision timeframe</label><select id="of-decision">${lsOptions(['This week','This month','Next month','This quarter','Unknown'],'','— select —')}</select></div>
      <div class="form-field"><label>Stage</label><select id="of-stage">${lsOptions(ORDER_STAGES.filter(s=>s[0]!=='won'))}</select></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Funder</label><select id="of-funder"></select></div>
      <div class="form-field"><label>Supplying dealer</label><select id="of-dealer"></select></div>
    </div>
    <div class="form-field"><label>Notes</label><textarea id="of-notes"></textarea></div>
    <div id="of-quotes-wrap" style="display:none">
      <div class="form-section-label" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span>Quotes</span>
        <span style="display:flex;gap:6px;flex-wrap:wrap">
          <label class="btn btn-edit" style="cursor:pointer">📄 Read Lex worksheet<input type="file" accept="application/pdf" style="display:none" onchange="readFunderWorksheet(this.files[0]);this.value=''"></label>
          <button class="btn btn-edit" onclick="openNewQuote()">+ Add quote by hand</button>
        </span>
      </div>
      <div id="of-quotes"></div>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn-secondary-modal" id="of-docs-btn" style="margin-right:auto;display:none" onclick="openDocs('order',editOrderId,document.getElementById('order-modal-title').textContent)">📎 Documents</button>
    <button class="btn-secondary-modal" onclick="closeOrderModal()">Close</button>
    <button class="btn-primary-modal" onclick="saveOrder()">Save order</button>
  </div>`,true);

function ofFill(o){
  o=o||{};
  document.getElementById('of-account').innerHTML=lsAccountOptions(['client','both'],o.account_id);
  document.getElementById('of-driver').innerHTML=lsContactOptions(o.account_id,o.driver_contact_id);
  document.getElementById('of-contact').innerHTML=lsContactOptions(o.account_id,o.contact_id);
  document.getElementById('of-funder').innerHTML=lsAccountOptions(['funder'],o.funder_account_id,'— not chosen —');
  document.getElementById('of-dealer').innerHTML=lsAccountOptions(['dealer','supplier'],o.dealer_account_id,'— not chosen —');
  const f=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??'';};
  f('of-title',o.title);f('of-source',o.source);f('of-owner',o.owner||'Simon Homer');f('of-delivery',o.expected_delivery_date);f('of-decision',o.decision_timeframe);f('of-notes',o.notes);
  f('of-stage',o.stage&&o.stage!=='won'?o.stage:'enquiry');
  const st=document.getElementById('of-stage');st.disabled=o.stage==='won';
  if(o.stage==='won'){st.innerHTML=lsOptions(ORDER_STAGES,'won');}else{st.innerHTML=lsOptions(ORDER_STAGES.filter(s=>s[0]!=='won'),o.stage||'enquiry');}
}
function ofAccountChanged(){const a=document.getElementById('of-account').value;['of-driver','of-contact'].forEach(id=>{const e=document.getElementById(id);const cur=e.value;e.innerHTML=lsContactOptions(a,cur);});}
async function openNewOrder(){await lsEnsureCrm();editOrderId=null;document.getElementById('order-modal-title').textContent='New order';ofFill({});document.getElementById('of-quotes-wrap').style.display='none';document.getElementById('of-docs-btn').style.display='none';document.getElementById('order-modal').classList.add('open');}
async function openEditOrder(id){
  await lsEnsureCrm();
  const o=allOrders.find(x=>x.id===id);if(!o)return;editOrderId=id;
  document.getElementById('order-modal-title').textContent=`${o.order_ref} — ${accName(o.account_id)||o.title||'Order'}`;
  ofFill(o);document.getElementById('of-quotes-wrap').style.display='';document.getElementById('of-docs-btn').style.display='';
  renderOrderQuotes();document.getElementById('order-modal').classList.add('open');
}
function closeOrderModal(){document.getElementById('order-modal').classList.remove('open');}
function ofPayload(){
  const v=id=>document.getElementById(id)?.value||null;
  const body={account_id:v('of-account'),driver_contact_id:v('of-driver'),contact_id:v('of-contact'),title:(v('of-title')||'').trim()||null,source:v('of-source'),owner:v('of-owner'),expected_delivery_date:v('of-delivery'),decision_timeframe:v('of-decision'),funder_account_id:v('of-funder'),dealer_account_id:v('of-dealer'),notes:v('of-notes'),updated_at:new Date().toISOString()};
  const st=document.getElementById('of-stage');if(!st.disabled)body.stage=st.value;
  return body;
}
async function saveOrder(){
  const body=ofPayload();if(!body.account_id){toast('Choose the client account','error');return;}
  try{
    if(editOrderId){await sbReq(`covase_orders?id=eq.${encodeURIComponent(editOrderId)}`,{method:'PATCH',body,prefer:'return=minimal'});Object.assign(allOrders.find(x=>x.id===editOrderId)||{},body);toast('Order saved','success');}
    else{const r=await sbReq('covase_orders',{method:'POST',body});const o=Array.isArray(r)?r[0]:r;allOrders.unshift(o);editOrderId=o.id;toast(`Order ${o.order_ref} created — now add a quote`,'success');openEditOrder(o.id);}
    renderOrders();updateOrderStats();
  }catch(e){toast('Save failed: '+e.message,'error');}
}
function renderOrderQuotes(){
  const el=document.getElementById('of-quotes');if(!el||!editOrderId)return;
  const o=allOrders.find(x=>x.id===editOrderId)||{};
  const qs=orderQuotes(editOrderId);
  if(!qs.length){el.innerHTML='<div class="empty-state" style="padding:18px"><div class="empty-sub">No quotes yet. Read the Lex worksheet PDF, or add one by hand.</div></div>';return;}
  el.innerHTML=qs.map(q=>{
    const s=leaseSums(q);const chosen=o.chosen_quote_id===q.id;
    const won=o.stage==='won';
    return `<div class="ls-quote${chosen?' chosen':''}">
      <div class="ls-quote-head"><strong>${esc(q.quote_no)}</strong> · ${esc(vehicleTitle(q))} <span class="badge badge-${q.status==='accepted'?'active':q.status==='sent'?'pending':'closed'}">${esc(q.status)}</span>${chosen?' <span class="badge badge-active">chosen</span>':''}</div>
      <div class="financials-row">
        <div><span>Term / miles</span><strong>${esc(q.term_months||'—')}m · ${q.annual_mileage?Number(q.annual_mileage).toLocaleString('en-GB'):'—'}</strong></div>
        <div><span>Finance + service</span><strong>${lsMoney(q.finance_rental)} + ${lsMoney(q.service_rental)}</strong></div>
        <div><span>Total rental</span><strong>${lsMoney(s.total)}</strong></div>
        <div><span>Effective rental</span><strong>${lsMoney(s.effective)}</strong></div>
        <div><span>Total profit</span><strong class="${s.profit>0?'profit-pos':s.profit<0?'profit-neg':''}">${lsMoney(s.profit)}</strong></div>
      </div>
      ${q.reader_notes?`<div class="notes-box" style="white-space:pre-line">⚠ Check: ${esc(q.reader_notes)}</div>`:''}
      <div class="action-row">
        <button class="btn btn-edit" onclick="openEditQuote('${esc(q.id)}')">✎ Edit</button>
        <button class="btn btn-edit" onclick="printQuotation('${esc(q.id)}')">🖨 Covase quotation</button>
        ${q.status==='draft'?`<button class="btn btn-edit" onclick="markQuoteSent('${esc(q.id)}')">Mark sent to client</button>`:''}
        ${!won?`<button class="btn btn-recharge" onclick="acceptQuote('${esc(q.id)}')">✓ Client accepted — create vehicle</button>`:''}
        ${won&&chosen&&o.vehicle_id?`<button class="btn btn-recharge" onclick="closeOrderModal();openVehicleRecord('${esc(o.vehicle_id)}')">Open vehicle →</button>`:''}
      </div></div>`;
  }).join('');
}
async function markQuoteSent(id){
  const q=allQuotes.find(x=>x.id===id);if(!q)return;
  try{await sbReq(`covase_quotes?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{status:'sent',updated_at:new Date().toISOString()},prefer:'return=minimal'});q.status='sent';
    const o=allOrders.find(x=>x.id===q.order_id);if(o&&['enquiry','quoting'].includes(o.stage))await orderSetStage(o.id,'proposal_sent');
    renderOrderQuotes();toast('Marked as sent','success');}catch(e){toast('Update failed: '+e.message,'error');}
}

// ── Quote editor ──
const QUOTE_FIELDS=[
  ['Vehicle',[['vehicle_type','Vehicle type','select',['Car','LCV']],['manufacturer','Manufacturer'],['model','Model'],['derivative','Derivative'],['engine_size','Engine size'],['engine_cc','Engine CC','int'],['fuel_type','Fuel type','select',['Petrol','Diesel','Hybrid','Plugin Hybrid (Petrol)','Plugin Hybrid (Diesel)','Electric']],['transmission','Transmission','select',['Manual','Automatic','DCT']],['body_style','Body style'],['num_doors','Doors','int'],['exterior_colour','Exterior colour'],['interior_trim','Interior trim'],['co2_emissions','CO2 g/km','int'],['p11d_value','P11D value £','num'],['otr','OTR £','num'],['ev_range','EV range (miles)','num'],['fuel_consumption','Fuel consumption','num']]],
  ['Contract',[['funder_account_id','Funder','funder'],['funders_quote_no','Funder quote no'],['funding_method','Funding method','select',['Contract Hire','Finance Lease','Contract Purchase','Lease Purchase']],['contract_type','Contract type','select',['Full Maintenance','Maintenance','Finance Only']],['term_months','Term (months)','int'],['annual_mileage','Annual mileage','int'],['payment_profile','Payment profile'],['excess_mileage_ppm','Excess mileage £/mile','num4'],['vat_type','VAT','select',['excluding VAT','including VAT']]]],
  ['Money (monthly, ex VAT)',[['finance_rental','Finance rental £','num'],['service_rental','Service rental £','num'],['commissions','Commission £','num'],['setup_fee','Set-up fee £','num'],['management_fee','Management fee £/month','num'],['other_revenue','Other revenue £','num'],['costs','Costs £','num']]]
];
let editQuoteId=null,quoteDraftDoc=null;
lsInjectModal('quote-modal',`
  <div class="modal-header"><div class="modal-title" id="quote-modal-title">Quote</div><button class="modal-close" onclick="closeQuoteModal()">✕</button></div>
  <div class="modal-body" id="quote-form"></div>
  <div class="modal-footer"><button class="btn-secondary-modal" onclick="closeQuoteModal()">Cancel</button><button class="btn-primary-modal" onclick="saveQuote()">Save quote</button></div>`,true);
function quoteFormHtml(q){
  const sec=QUOTE_FIELDS.map(([label,fields])=>`<div class="form-section-label">${esc(label)}</div><div class="ls-grid">`+fields.map(([k,l,t,opts])=>{
    const v=q[k]??'';
    let input;
    if(t==='select')input=`<select id="qf-${k}" oninput="qfRecalc()">${lsOptions(opts.includes(v)||!v?opts:[v,...opts],v,'—')}</select>`;
    else if(t==='funder')input=`<select id="qf-${k}">${lsAccountOptions(['funder'],v,'— select —')}</select>`;
    else input=`<input id="qf-${k}" ${t&&t.startsWith('num')||t==='int'?`type="number" step="${t==='int'?'1':t==='num4'?'0.0001':'0.01'}"`:''} value="${esc(String(v))}" oninput="qfRecalc()">`;
    return `<div class="form-field"><label>${esc(l)}</label>${input}</div>`;
  }).join('')+'</div>').join('');
  return sec+`<div class="form-row"><div class="form-field"><label>Standard items</label><textarea id="qf-standard_items">${esc(q.standard_items||'')}</textarea></div><div class="form-field"><label>Optional extras</label><textarea id="qf-optional_extras">${esc(q.optional_extras||'')}</textarea></div></div>
    <div class="form-field"><label>Notes</label><textarea id="qf-notes">${esc(q.notes||'')}</textarea></div>
    ${q.reader_notes?`<div class="notes-box" style="white-space:pre-line">⚠ From the worksheet reader — please check: ${esc(q.reader_notes)}</div>`:''}
    <div class="detail-section-head">Worked out (not typed)</div><div class="financials-row" id="qf-sums"></div>`;
}
function qfRead(){
  const out={};
  QUOTE_FIELDS.forEach(([,fields])=>fields.forEach(([k,,t])=>{const v=document.getElementById('qf-'+k)?.value;out[k]=(v===''||v==null)?null:(t==='int'?parseInt(v):t&&t.startsWith('num')?parseFloat(v):v);}));
  ['standard_items','optional_extras','notes'].forEach(k=>{const v=document.getElementById('qf-'+k)?.value;out[k]=v?v:null;});
  return out;
}
function qfRecalc(){const s=leaseSums(qfRead());const el=document.getElementById('qf-sums');if(el)el.innerHTML=`<div><span>Total rental</span><strong>${lsMoney(s.total)}</strong></div><div><span>Unreclaimable VAT</span><strong>${lsMoney(s.unreclaimable)}</strong></div><div><span>Effective rental</span><strong>${lsMoney(s.effective)}</strong></div><div><span>Mgmt fee profit</span><strong>${lsMoney(s.mgmtProfit)}</strong></div><div><span>Total profit</span><strong class="${s.profit>0?'profit-pos':s.profit<0?'profit-neg':''}">${lsMoney(s.profit)}</strong></div>`;}
function openQuoteForm(q,title){
  document.getElementById('quote-modal-title').textContent=title;
  document.getElementById('quote-form').innerHTML=quoteFormHtml(q);qfRecalc();
  document.getElementById('quote-modal').classList.add('open');
}
function openNewQuote(prefill){
  const o=allOrders.find(x=>x.id===editOrderId)||{};
  editQuoteId=null;
  const base={vehicle_type:'Car',funding_method:'Contract Hire',vat_type:'excluding VAT',funder_account_id:o.funder_account_id,setup_fee:250,management_fee:15,...(prefill||{})};
  openQuoteForm(base,prefill?'New quote — from the funder worksheet':'New quote');
}
function openEditQuote(id){const q=allQuotes.find(x=>x.id===id);if(!q)return;editQuoteId=id;quoteDraftDoc=null;openQuoteForm(q,`${q.quote_no} — ${vehicleTitle(q)}`);}
function closeQuoteModal(){document.getElementById('quote-modal').classList.remove('open');}
async function saveQuote(){
  const body={...qfRead(),updated_at:new Date().toISOString()};
  try{
    if(editQuoteId){await sbReq(`covase_quotes?id=eq.${encodeURIComponent(editQuoteId)}`,{method:'PATCH',body,prefer:'return=minimal'});Object.assign(allQuotes.find(x=>x.id===editQuoteId)||{},body);toast('Quote saved','success');}
    else{
      body.order_id=editOrderId;
      if(quoteDraftDoc){body.source_document_id=quoteDraftDoc.docId;body.reader_notes=quoteDraftDoc.notes||null;}
      const r=await sbReq('covase_quotes',{method:'POST',body});const q=Array.isArray(r)?r[0]:r;allQuotes.push(q);
      const o=allOrders.find(x=>x.id===editOrderId);if(o&&o.stage==='enquiry')await orderSetStage(o.id,'quoting');
      if(o&&body.funder_account_id&&!o.funder_account_id){o.funder_account_id=body.funder_account_id;sbReq(`covase_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',body:{funder_account_id:body.funder_account_id},prefer:'return=minimal'}).catch(()=>{});}
      toast(`${q.quote_no} saved`,'success');
    }
    quoteDraftDoc=null;closeQuoteModal();renderOrderQuotes();renderOrders();updateOrderStats();
  }catch(e){toast('Save failed: '+e.message,'error');}
}

// ── Accept: order won → vehicle record ──
const QUOTE_TO_VEHICLE=['vehicle_type','manufacturer','model','derivative','engine_size','engine_cc','fuel_type','transmission','body_style','num_doors','exterior_colour','interior_trim','co2_emissions','p11d_value','otr','ev_range','fuel_consumption','standard_items','optional_extras','funders_quote_no','funding_method','contract_type','term_months','annual_mileage','payment_profile','excess_mileage_ppm','vat_type','finance_rental','service_rental','commissions','setup_fee','management_fee','other_revenue','costs'];
async function acceptQuote(id){
  const q=allQuotes.find(x=>x.id===id);if(!q)return;const o=allOrders.find(x=>x.id===q.order_id);if(!o)return;
  if(!confirm(`Client accepted ${q.quote_no}?\n\nThis closes ${o.order_ref} as won and creates the vehicle record (${vehicleTitle(q)}) ready to order from the dealer.`))return;
  try{
    const now=new Date().toISOString(),today=now.slice(0,10);
    const veh={id:'veh-'+Date.now(),registration:'TBC',reg:null,name:[q.manufacturer,q.model].filter(Boolean).join(' ')||'New vehicle',status:'ordered',lease_stage:'order_to_dealer',stage_changed_at:now,
      account_id:o.account_id,driver_id:o.driver_contact_id,funder_id:q.funder_account_id||o.funder_account_id,dealer_id:o.dealer_account_id,
      order_id:o.id,quote_id:q.id,order_received_date:today,expected_delivery_date:o.expected_delivery_date,source:o.source,updated_at:now};
    QUOTE_TO_VEHICLE.forEach(k=>{if(q[k]!==null&&q[k]!==undefined)veh[k]=q[k];});
    const r=await sbReq('covase_vehicles',{method:'POST',body:veh});const v=Array.isArray(r)?r[0]:(r||veh);
    if(Array.isArray(allVehicles))allVehicles.unshift(v);
    await sbReq(`covase_quotes?id=eq.${encodeURIComponent(q.id)}`,{method:'PATCH',body:{status:'accepted',updated_at:now},prefer:'return=minimal'});q.status='accepted';
    const others=orderQuotes(o.id).filter(x=>x.id!==q.id&&x.status!=='declined');
    if(others.length){await sbReq(`covase_quotes?order_id=eq.${encodeURIComponent(o.id)}&id=neq.${encodeURIComponent(q.id)}&status=neq.declined`,{method:'PATCH',body:{status:'superseded',updated_at:now},prefer:'return=minimal'});others.forEach(x=>x.status='superseded');}
    const ob={stage:'won',won_at:now,chosen_quote_id:q.id,vehicle_id:v.id,updated_at:now};
    await sbReq(`covase_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',body:ob,prefer:'return=minimal'});Object.assign(o,ob);
    toast('Order won — vehicle record created','success');
    closeOrderModal();renderOrders();updateOrderStats();
    if(typeof openVehicleRecord==='function')openVehicleRecord(v.id);
  }catch(e){toast("Couldn't complete: "+e.message,'error');}
}

// ── Funder rules: what each funder's wording means in ORBIS ──
// Shared via covase_config 'funder_rules'; editable in Settings → Funder rules.
// A field lists the worksheet labels it may appear under (exact label match,
// any case). Anything on a worksheet no rule covers is listed for checking,
// never guessed.
const DEFAULT_FUNDER_RULES={lex:{name:'Lex Autolease',match:'Lex|Quote No\\s',fields:{
  funders_quote_no:['Quote No'],quote_date:['Date'],vehicle:['Vehicle'],funding_method:['Contract Type'],payment_plan:['Payment Plan'],
  term_months:['Term'],mileage:['Mileage PA / Total'],otr:['Broker OTRP'],commissions:['Sales Code','Commission'],
  co2_emissions:['CO2 g/km'],engine_cc:['Engine Size'],fuel_type:['Fuel Type'],transmission:['Transmission'],body_style:['Body Style'],
  num_doors:['Number of Doors'],fuel_consumption:['FC Weighted (Combined)','MPG (Combined)'],ev_range:['Pure EV Range (Combined)','EAER Miles (Combined)'],
  finance_rental:['Lease Rental'],service_rental:['Service Rental'],monthly_rental:['Monthly Rental'],effective_rental:['Effective Rental'],
  excess_mileage:['Excess Mileage Charge'],p11d_value:['Taxable List Price (P11D)']},
  fuel:{'Electric':'Electric','Elec H':'Plugin Hybrid (Petrol)','Petrol':'Petrol','Diesel':'Diesel'}}};
let funderRules=JSON.parse(JSON.stringify(DEFAULT_FUNDER_RULES));
async function loadFunderRules(){try{const r=await sbReq('covase_config?key=eq.funder_rules&select=value');if(r&&r[0]&&r[0].value)funderRules=r[0].value;}catch(e){}}
async function saveFunderRules(){await sbReq('covase_config',{method:'POST',body:{key:'funder_rules',value:funderRules,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});}

// ── Lex worksheet reader (PDF text, no AI: the worksheet is a fixed layout) ──
const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
async function lsLoadPdfJs(){
  if(window.pdfjsLib)return window.pdfjsLib;
  await new Promise((res,rej)=>{const s=document.createElement('script');s.src=PDFJS_URL;s.onload=res;s.onerror=()=>rej(new Error('PDF reader could not load'));document.head.appendChild(s);});
  window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;return window.pdfjsLib;
}
// Text items → lines (by y), each line a left-to-right list of cells.
async function pdfLines(buf){
  const lib=await lsLoadPdfJs();const pdf=await lib.getDocument({data:buf}).promise;const out=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);const tc=await page.getTextContent();
    const items=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:Math.round(i.transform[5]),w:i.width}));
    const rows=[];items.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(it=>{let r=rows.find(r=>Math.abs(r.y-it.y)<=3);if(!r){r={y:it.y,cells:[]};rows.push(r);}r.cells.push(it);});
    rows.forEach(r=>{r.cells.sort((a,b)=>a.x-b.x);out.push(r);});
  }
  return out;
}
const LS_WORDNUM={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
function lsAmount(s){const m=String(s||'').replace(/,/g,'').match(/-?\d+(\.\d+)?/);return m?parseFloat(m[0]):null;}
function parseFunderWorksheet(lines,rules){
  const labelOf={};Object.entries(rules.fields).forEach(([f,labels])=>labels.forEach(l=>labelOf[l.toLowerCase()]=f));
  const got={},seen=new Set(),unmapped=[];
  lines.forEach(r=>r.cells.forEach((c,i)=>{
    const f=labelOf[c.s.toLowerCase()];if(!f)return;seen.add(i+'@'+r.y);
    const nxt=r.cells[i+1];
    if(nxt&&!labelOf[nxt.s.toLowerCase()]){if(got[f]===undefined)got[f]=nxt.s;seen.add((i+1)+'@'+r.y);}
  }));
  // extras: lines after "Selected Optional Extras" (right half) until "Financials"
  const extras=[];let inX=false,xStart=null;
  lines.forEach(r=>{const t=r.cells.map(c=>c.s).join(' ');
    if(/Selected Optional Extras/i.test(t)){inX=true;xStart=r.cells.find(c=>/Selected Optional Extras/i.test(c.s)).x-5;return;}
    if(inX&&/^(Financials|OTRP Breakdown)/i.test(t.trim())){inX=false;return;}
    if(inX){const cs=r.cells.filter(c=>c.x>=xStart);if(cs.length&&!/^Description$/i.test(cs[0].s))extras.push(cs.map(c=>c.s));}
  });
  // fuel type may be split over two lines ("Petrol/PlugIn" above "Elec H")
  const flat=lines.map(r=>r.cells.map(c=>c.s).join(' ')).join('\n');
  return {got,extras,flat};
}
function worksheetToQuote(parsed,rules){
  const g=parsed.got,q={},notes=[];
  if(g.funders_quote_no)q.funders_quote_no=g.funders_quote_no.replace(/\s+/g,' ').trim();
  if(g.vehicle){const words=g.vehicle.replace(/\s+\d{2}$/,'').split(/\s+/);const tc=w=>/\d/.test(w)?w:w.charAt(0)+w.slice(1).toLowerCase();
    q.manufacturer=tc(words[0]||'');q.model=words[1]?tc(words[1]):null;q.derivative=words.slice(2).join(' ')||null;notes.push('model / derivative split from "'+g.vehicle+'"');}
  if(g.funding_method)q.funding_method=g.funding_method;
  q.term_months=lsAmount(g.term_months)||null;
  if(g.mileage){const pa=lsAmount(String(g.mileage).split('/')[0]);if(pa)q.annual_mileage=pa;}
  if(g.payment_plan){
    const m=String(g.payment_plan).toLowerCase().match(/based on (\w+) months? initial rental.*?month (\w+)/);
    const init=m&&(LS_WORDNUM[m[1]]||parseInt(m[1])),k=m&&(LS_WORDNUM[m[2]]||parseInt(m[2]));
    if(init&&k&&q.term_months){q.payment_profile=init+'+'+(q.term_months-k+1);}else notes.push('payment plan not recognised: "'+g.payment_plan+'"');
  }
  ['otr','commissions','p11d_value','finance_rental','service_rental'].forEach(k=>{if(g[k]!==undefined)q[k]=lsAmount(g[k]);});
  ['co2_emissions','num_doors'].forEach(k=>{if(g[k]!==undefined)q[k]=parseInt(lsAmount(g[k]));});
  if(g.fuel_consumption)q.fuel_consumption=lsAmount(g.fuel_consumption);
  if(g.ev_range)q.ev_range=lsAmount(g.ev_range);
  if(g.excess_mileage){const ppm=lsAmount(g.excess_mileage);if(ppm!==null)q.excess_mileage_ppm=Math.round(ppm*100)/10000;}
  if(g.transmission)q.transmission=g.transmission;
  if(g.body_style)q.body_style=g.body_style;
  if(g.fuel_type){const map=rules.fuel||{};const key=Object.keys(map).find(k=>String(g.fuel_type).toLowerCase().includes(k.toLowerCase()));
    if(key){q.fuel_type=map[key];if(key==='Elec H'&&/Diesel\/PlugIn/i.test(parsed.flat))q.fuel_type='Plugin Hybrid (Diesel)';}else notes.push('fuel type "'+g.fuel_type+'" — no rule');}
  if(g.engine_cc&&q.fuel_type!=='Electric')q.engine_cc=parseInt(lsAmount(g.engine_cc));
  if(q.fuel_type==='Electric'&&(q.co2_emissions==null||isNaN(q.co2_emissions)))q.co2_emissions=0;
  const ext=parsed.extras.map(c=>c[0]).filter(Boolean);
  if(ext.length){q.optional_extras=ext.join('\n');const paint=ext.find(e=>/paint/i.test(e));if(paint){q.exterior_colour=paint;if(!/-/.test(paint))notes.push('paint colour name not on the worksheet ("'+paint+'")');}}
  if(!q.contract_type)notes.push('contract type (full maintenance or not) is not on the worksheet');
  // check our effective rental against the funder's own figure
  const s=leaseSums({...q,vehicle_type:'Car'});
  if(g.monthly_rental&&Math.abs(lsAmount(g.monthly_rental)-s.total)>0.005)notes.push(`monthly rental ${g.monthly_rental} ≠ finance + service (${lsMoney(s.total)})`);
  if(g.effective_rental&&Math.abs(lsAmount(g.effective_rental)-s.effective)>0.005)notes.push(`funder's effective rental ${g.effective_rental} ≠ ORBIS ${lsMoney(s.effective)} — check vehicle type`);
  const missing=['finance_rental','service_rental','term_months','otr','p11d_value'].filter(k=>q[k]==null);
  if(missing.length)notes.push('not found on the worksheet: '+missing.join(', '));
  return {quote:q,notes};
}
async function readFunderWorksheet(file){
  if(!file||!editOrderId)return;
  toast('Reading worksheet…','info');
  try{
    await loadFunderRules();
    const buf=await file.arrayBuffer();
    const lines=await pdfLines(buf.slice(0));
    const rules=Object.values(funderRules).find(r=>new RegExp(r.match,'i').test(lines.map(l=>l.cells.map(c=>c.s).join(' ')).join('\n')))||funderRules.lex;
    const parsed=parseFunderWorksheet(lines,rules);
    const {quote,notes}=worksheetToQuote(parsed,rules);
    const lex=(allAccounts||[]).find(a=>a.type==='funder'&&new RegExp(rules.name.split(' ')[0],'i').test(a.company_name));
    if(lex)quote.funder_account_id=lex.id;else notes.push(rules.name+' is not set up as a funder account yet');
    // keep the worksheet itself on the order
    let docId=null;
    try{await uploadDocsTo('order',editOrderId,[file],'funder_quote');docId=window._lastDocIds&&window._lastDocIds[0];}catch(e){}
    quoteDraftDoc={docId,notes:notes.join('\n')};
    openNewQuote({...quote,reader_notes:notes.join('\n')});
    toast(notes.length?'Worksheet read — please check the highlighted points':'Worksheet read','success');
  }catch(e){toast("Couldn't read the worksheet: "+e.message,'error');}
}

// ── Covase quotation (print / save as PDF) ──
// House print layout (quotation, dealer PO): A4 landscape, measured from the
// Covase quotation template. Fonts per Simon (29 Oct 2026): Netto OT for the
// vertical title (64pt), the reference box (20pt) and the price headings
// (12pt caps); Open Sans 10pt for everything else. Both fonts are Covase's
// purchased copies, served from fonts/ (Simon confirmed full rights, 29 Oct).
const COVASE_LOGO_URL=new URL('img/covase-logo.png',location.href).href;
const COVASE_FONT_URL=f=>new URL('fonts/'+f,location.href).href;
function lsPrint(html,title){
  // Opened as a Blob page rather than document.write into about:blank, so the
  // logo and fonts load like any normal page before printing.
  const page=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
  @font-face{font-family:'Covase Netto';src:url('${COVASE_FONT_URL('NettoOT.otf')}') format('opentype');font-weight:400;font-style:normal}
  @font-face{font-family:'Covase Open Sans';src:url('${COVASE_FONT_URL('OpenSans-Regular.ttf')}') format('truetype');font-weight:400;font-style:normal}
  @page{size:A4 landscape;margin:0}
  :root{--netto:'Covase Netto','NettoOT','Netto OT',Arial,sans-serif;--teal:#03C4B8}
  html,body{margin:0}body{font-family:'Covase Open Sans','Open Sans',Arial,sans-serif;font-size:10pt;color:#222;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{position:relative;width:297mm;min-height:210mm;box-sizing:border-box;padding:9mm 12mm 8mm 52mm;margin:0 auto}
  .bar{position:fixed;bottom:0;right:0;padding:12px}.bar button{font:600 13px 'Covase Open Sans',Arial;padding:8px 14px;border-radius:8px;border:0;background:#03D3C6;color:#08303a;cursor:pointer}
  @media print{.bar{display:none}}@media screen{body{background:#eee}.page{background:#fff;margin:12px auto;box-shadow:0 2px 12px rgba(0,0,0,.15)}}
  .logo{position:absolute;left:18mm;top:9mm;width:55mm;height:auto}
  .co{display:flex;gap:11mm;justify-content:flex-end;font-size:8pt;color:#8a8a8a;line-height:1.45;min-height:22mm}
  .teal{color:var(--teal)}
  .side{position:absolute;left:14mm;top:33mm;writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--netto);font-size:64pt;line-height:1;color:var(--teal);font-weight:400}
  .grid{display:flex;justify-content:space-between;gap:8mm;margin:2mm 0 9mm;align-items:flex-start}
  .kv{border-collapse:collapse}.kv td{padding:0 4mm 1mm 0;vertical-align:top;font-size:10pt;line-height:1.45}.kv td:first-child{color:var(--teal)}
  .box{border:1px solid #222;padding:4mm 9mm;text-align:center;font-family:var(--netto);font-size:20pt;line-height:1.2;min-width:48mm;box-sizing:border-box}
  .box small{display:block;font-family:'Covase Open Sans','Open Sans',Arial,sans-serif;font-size:10pt;margin-top:1.5mm}
  table.v{width:100%;border-collapse:collapse;margin-bottom:6mm}
  table.v th{font-family:var(--netto);font-size:12pt;font-weight:400;text-transform:uppercase;line-height:1.25;border-bottom:2px solid var(--teal);padding:0 2mm 1.5mm;text-align:center;vertical-align:top}
  table.v th:first-child{text-align:left;padding-left:0}
  table.v td{padding:1.5mm 2mm;vertical-align:top;font-size:10pt;text-align:center;white-space:nowrap}
  table.v td:first-child{text-align:left;padding-left:0;white-space:normal}
  table.v ul{margin:1mm 0 0 6mm;padding:0}.r{text-align:center}
  table.v.left th,table.v.left td{text-align:left;white-space:normal;padding-left:0}
  p{margin:0 0 4mm;font-size:10pt}
  .small{font-size:8pt;line-height:1.45;color:#333}
  .sig{border:1px solid var(--teal);padding:3mm 5mm;min-height:30mm;line-height:1.8;font-size:10pt}
  .foot{position:absolute;left:0;right:0;bottom:7mm;font-size:8pt;color:#8a8a8a;text-align:center}
  </style></head><body><div class="bar"><button onclick="print()">Print / save as PDF</button></div><div class="page">${html}</div></body></html>`;
  const url=URL.createObjectURL(new Blob([page],{type:'text/html'}));
  const w=window.open(url,'_blank');if(!w){toast('Allow pop-ups to print','error');return;}
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function covaseHeader(){return `<img class="logo" src="${COVASE_LOGO_URL}" alt="Covase"><div class="co"><div>Woodgreen Farm Barns<br>Mead Lane, Upper Basildon<br>Berkshire, RG8 8NA</div><div>0345 369 7100<br>admin@covase.co.uk</div><div>www.covase.co.uk</div></div>`;}
const COVASE_FOOTER='<div class="foot">VAT No: 866 3107 19 | Registered in England + Wales: 5569777 | Covase Ltd. is a credit broker, not a lender and is a member of the BVRLA (membership number 2181).</div>';
function ownerEmail(owner){const p=String(owner||'Simon Homer').trim().toLowerCase().split(/\s+/);return p.length>1?p[0]+'.'+p[p.length-1]+'@covase.co.uk':'admin@covase.co.uk';}
function printQuotation(id){
  const q=allQuotes.find(x=>x.id===id);if(!q)return;const o=allOrders.find(x=>x.id===q.order_id)||{};const s=leaseSums(q);
  const ppm=q.excess_mileage_ppm!=null?'£'+lsNum(q.excess_mileage_ppm).toFixed(4):'—';
  const html=`<div class="side">Quotation</div>${covaseHeader()}
  <div class="grid"><table class="kv"><tr><td>Client</td><td>${esc(conName(o.driver_contact_id)||'—')}</td></tr><tr><td>Company</td><td>${esc(accName(o.account_id)||'—')}</td></tr>
    <tr><td>Contract</td><td>${esc(q.term_months||'—')} month<br>${esc(q.contract_type||'')}${q.contract_type?'<br>':''}${esc(q.funding_method||'')}<br>${q.annual_mileage?Number(q.annual_mileage).toLocaleString('en-GB'):'—'} miles p/a</td></tr>
    <tr><td>Payments</td><td>${esc(q.payment_profile||'—')} monthly payments<br>${esc(q.vat_type||'excluding VAT')}</td></tr></table>
    <table class="kv"><tr><td>Prepared by</td><td>${esc(o.owner||'Simon Homer')}</td></tr><tr><td>Call</td><td>0345 369 7100</td></tr><tr><td>Email</td><td>${esc(ownerEmail(o.owner))}</td></tr></table>
    <div class="box">Quotation<br>${esc(q.quote_no)}<small>${esc(new Date(q.quote_date||Date.now()).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}))}</small></div></div>
  <table class="v"><tr><th>VEHICLE DETAILS</th><th class="r">FINANCE<br>RENTAL</th><th class="r">SERVICE<br>RENTAL</th><th class="r">TOTAL<br>RENTAL</th><th class="r">P11D<br>VALUE</th><th class="r">CO₂</th><th class="r">EXCESS<br>MILEAGE</th></tr>
    <tr><td>${esc(vehicleTitle(q))}${q.exterior_colour||q.interior_trim?`<ul><li>${esc([q.exterior_colour,q.interior_trim].filter(Boolean).join(' with '))}</li></ul>`:''}</td><td class="r">${lsMoney(q.finance_rental)}</td><td class="r">${lsMoney(q.service_rental)}</td><td class="r">${lsMoney(s.total)}</td><td class="r">${lsMoney(q.p11d_value)}</td><td class="r">${esc(String(q.co2_emissions??'—'))}</td><td class="r">${ppm}<br>ppm*</td></tr></table>
  ${lsNum(q.setup_fee)?`<p>At the point the contract is raised prior to delivery, a set-up fee of ${lsMoney(q.setup_fee)} (+VAT) will be invoiced.</p>`:''}
  ${lsNum(q.management_fee)?`<p>When the vehicle is delivered, a rolling ${lsMoney(q.management_fee)} (+VAT) per month, fleet management charge will commence.</p>`:''}
  <p><strong>To place an order</strong> for this vehicle based on the above figures please return a signed/scanned copy of this quotation to admin@covase.co.uk</p>
  <div class="grid" style="align-items:stretch"><div class="small" style="flex:1">This quotation is in respect of a qualifying car under 7 (2) of the VAT (input tax) order 1992 (as amended). Hirers should independently clarify their VAT position in respect of any restrictions which may be applicable. This quotation is valid for a period of 28 days and is not an offer to enter into a legally binding contract. Acceptance is subject to final credit approval which will be at our sole discretion and to you completing all documents required in connection with this transaction. Where applicable our quotes reflect manufacturer's support. E &amp; O E. * ppm = pence per mile.</div>
  <div class="sig" style="flex:1">Name<br>Date<br><br>Signature</div></div>${COVASE_FOOTER}`;
  lsPrint(html,q.quote_no+' quotation');
}

// ── wiring: view loader, realtime, tap-to-move, startup ──
window.EXTRA_VIEW_LOADERS=Object.assign(window.EXTRA_VIEW_LOADERS||{},{orders:loadOrders});
RT_TABLES.covase_orders=()=>{if(ordersLoaded)loadOrders();};
RT_TABLES.covase_quotes=()=>{if(ordersLoaded)loadOrders();};
window.TAPMOVE_KINDS=Object.assign(window.TAPMOVE_KINDS||{},{order:id=>{const o=allOrders.find(x=>x.id===id);return o&&{title:'Move order to',current:o.stage,lanes:ORDER_STAGES.filter(s=>s[0]!=='won').map(([key,label])=>({key,label})),apply:orderSetStage};}});
