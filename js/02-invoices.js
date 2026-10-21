// ─── INVOICES ───
let allInvoices=[],invFilter='all';
async function loadInvoices(){
  const el=document.getElementById('invoice-list');if(needsSetup(el))return;
  el.innerHTML='<div class="loading">Fetching invoices…</div>';
  try{
    allInvoices=await sbReq(`covase_invoices?or=(category.is.null,category.neq.outgoing)&order=received_at.desc&limit=200`);
    // If any short-hire invoices present, pre-load accounts + hires so review panel can render immediately
    const needsSupport=allInvoices.some(i=>i.is_short_hire);
    if(needsSupport){
      const jobs=[];
      if(!Array.isArray(allAccounts)||!allAccounts.length)jobs.push(sbReq('covase_accounts?order=company_name.asc&limit=500').then(r=>{allAccounts=r||[];}).catch(()=>{}));
      if(!hiresLoaded)jobs.push(sbReq('covase_hires?order=start_date.desc&limit=500').then(r=>{allHires=r||[];hiresLoaded=true;}).catch(()=>{}));
      if(jobs.length)await Promise.all(jobs);
    }
    updateInvStats();renderInvoices();updateBadges();
  }
  catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-icon">✗</div><div class="empty-title">Connection failed</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}
function updateInvStats(){
  const pending=allInvoices.filter(i=>i.status==='pending');
  const approved=allInvoices.filter(i=>i.status==='approved');
  const total=allInvoices.reduce((s,i)=>s+(parseFloat(i.total)||0),0);
  const errors=allInvoices.filter(i=>i.parse_error).length;
  document.getElementById('si-pending').textContent=pending.length;
  document.getElementById('si-approved').textContent=approved.length;
  document.getElementById('si-errors').textContent=errors;
  document.getElementById('si-total').textContent='£'+total.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function renderInvoices(){
  const el=document.getElementById('invoice-list');
  let inv=allInvoices;if(invFilter!=='all')inv=inv.filter(i=>i.status===invFilter);
  if(!inv.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-title">Nothing here</div><div class="empty-sub">No invoices with status "${invFilter}".</div></div>`;return;}
  el.innerHTML=inv.map(i=>buildInvCard(i)).join('');
}
function setInvFilter(f,btn){invFilter=f;document.querySelectorAll('#view-received .filter-pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderInvoices();}
function buildInvCard(inv){
  const conf=parseFloat(inv.confidence)||0,confPct=Math.round(conf*100);
  const confClass=conf>=.85?'':conf>=.6?'mid':'low';
  const amt=parseFloat(inv.total)||0,amtFmt='£'+amt.toLocaleString('en-GB',{minimumFractionDigits:2});
  const sub=parseFloat(inv.subtotal)||0,vat=parseFloat(inv.vat_amount)||0;
  const pm=(inv.payment_method||'unknown').toLowerCase();
  const pmClass=pm==='direct_debit'?'badge-direct_debit':pm==='bacs'?'badge-bacs':'badge-unknown';
  const pmLabel=pm==='direct_debit'?'Direct Debit':pm==='bacs'?'BACS':pm;
  const dateStr=inv.invoice_date?new Date(inv.invoice_date).toLocaleDateString('en-GB'):'—';
  const dueStr=inv.due_date?new Date(inv.due_date).toLocaleDateString('en-GB'):'—';
  const pdfBtn=inv.pdf_url?`<button class="btn btn-pdf" onclick="window.open('${esc(inv.pdf_url)}','_blank')">📄 PDF</button>`:'';
  const extracted=Array.isArray(inv.extracted_hires)?inv.extracted_hires:[];
  const pendingHires=extracted.filter(h=>!h.committed).length;
  const shBadge=inv.is_short_hire?`<span class="badge-shorthire">${pendingHires?pendingHires+' hire'+(pendingHires>1?'s':'')+' to review':'hires committed ✓'}</span>`:'';
  return `<div class="inv-card" id="ic-${inv.id}">
    <div class="inv-header" onclick="toggleCard('ic-${inv.id}')">
      <div><div class="inv-vendor-name">${esc(inv.vendor||inv.source_email||'Unknown')}${inv.pdf_url?' <span style="color:var(--covase);font-size:11px">📄</span>':''} ${shBadge}</div><div class="inv-meta">${esc(inv.invoice_number||'—')} · ${esc(inv.email_subject||'')}</div></div>
      <div class="inv-col"><div class="inv-col-label">Date</div><div class="inv-col-val">${dateStr}</div></div>
      <div class="inv-col"><div class="inv-col-label">Due</div><div class="inv-col-val">${dueStr}</div></div>
      <div class="inv-col"><div class="inv-col-label">Amount</div><div class="inv-amount">${amtFmt}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px"><span class="badge badge-${inv.status||'pending'}">${inv.status||'pending'}</span><span class="badge ${pmClass}">${pmLabel}</span></div>
      <div class="expand-arrow">▶</div>
    </div>
    <div class="card-detail">
      ${inv.parse_error?'<div class="parse-err">⚠ Could not fully parse — check fields before approving.</div>':''}
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">Vendor</div><div class="detail-val">${esc(inv.vendor||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Invoice no.</div><div class="detail-val">${esc(inv.invoice_number||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Category</div><div class="detail-val">${esc(inv.category||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">VAT number</div><div class="detail-val">${esc(inv.vat_number||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Received</div><div class="detail-val">${inv.received_at?new Date(inv.received_at).toLocaleDateString('en-GB'):'—'}</div></div>
        <div class="detail-field"><div class="detail-label">Currency</div><div class="detail-val">${esc(inv.currency||'GBP')}</div></div>
      </div>
      <div class="vat-row"><div><span>Subtotal</span><strong>£${sub.toFixed(2)}</strong></div><div><span>VAT</span><strong>£${vat.toFixed(2)}</strong></div><div><span>Total</span><strong>${amtFmt}</strong></div></div>
      ${inv.description?`<div class="desc-box">${esc(inv.description)}</div>`:''}
      ${hireReviewSection(inv)}
      <div class="conf-row"><span class="conf-label" style="font-size:11px">AI confidence</span><div class="conf-bar-wrap"><div class="conf-bar ${confClass}" style="width:${confPct}%"></div></div><span class="conf-label">${confPct}%</span></div>
      <div class="action-row">
        <textarea class="notes-input" id="n-${inv.id}" placeholder="Notes…">${esc(inv.notes||'')}</textarea>
        ${pdfBtn}
        <button class="btn btn-approve" onclick="setInvStatus('${inv.id}','approved')">✓ Approve</button>
        <button class="btn btn-flag" onclick="setInvStatus('${inv.id}','flagged')">⚑ Flag</button>
        <button class="btn btn-reject" onclick="setInvStatus('${inv.id}','rejected')">✗ Reject</button>
        <button class="btn btn-recharge" onclick="rechargeInvoice('${inv.id}')">↑ Recharge</button>
      </div>
    </div>
  </div>`;
}
async function setInvStatus(id,status){
  const notes=document.getElementById(`n-${id}`)?.value||'';
  try{await sbReq(`covase_invoices?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{status,notes},prefer:'return=minimal'});const i=allInvoices.find(x=>x.id===id);if(i){i.status=status;i.notes=notes;}renderInvoices();updateInvStats();updateBadges();toast(`Invoice ${status}`,'success');}
  catch(e){toast('Update failed: '+e.message,'error');}
}

// ─── Extracted short-hire review ───
// ─── Extracted short-hire review / reconcile ───
function hireReviewSection(inv){
  if(!inv.is_short_hire||!Array.isArray(inv.extracted_hires)||!inv.extracted_hires.length)return '';
  const hires=inv.extracted_hires;
  const done=hires.filter(h=>h.matched_hire_id||h.committed).length;
  const todo=hires.length-done;
  return `<div class="hires-review">
    <div class="hires-review-header">
      <strong>Extracted hires</strong>
      <span>${todo?todo+' to review':'all reviewed'}${done?' · '+done+' linked':''}</span>
    </div>
    ${hires.map((h,i)=>hireReviewRow(inv.id,h,i)).join('')}
  </div>`;
}
function hireReviewRow(invId,h,idx){
  // Already linked / committed → collapsed line
  if(h.matched_hire_id||h.committed){
    const hireId=h.matched_hire_id||h.committed_hire_id||'';
    const label=h.matched_hire_id?'matched to':'committed as';
    return `<div class="hire-row committed">✓ ${esc(h.registration||'—')} · ${esc(h.driver||'')} · £${(parseFloat(h.netAmount)||0).toFixed(2)} — ${label} <code>${esc(hireId)}</code></div>`;
  }
  // Try to find a booking match
  const candidate=findMatchCandidate(h);
  if(candidate)return matchedRow(invId,h,idx,candidate);
  return unmatchedRow(invId,h,idx);
}
// Find an existing booking by reference that isn't already invoice-linked
function findMatchCandidate(h){
  if(!Array.isArray(allHires))return null;
  const ref=(h.bookingReference||'').trim();if(!ref)return null;
  return allHires.find(x=>!x.incoming_invoice_id&&(x.reference===ref||x.agreement_ref===ref))||null;
}
// Matched → side-by-side compare + Approve
function matchedRow(invId,h,idx,c){
  const supps=Array.isArray(h.supplementaries)?h.supplementaries:[];
  const invDays=h.days||null,invRate=parseFloat(h.ratePerDay)||0,invNet=parseFloat(h.netAmount)||0;
  const hireDays=daysOn(c),hireCost=parseFloat(c.cost_per_day)||0,hireNet=hireDays&&hireCost?hireDays*hireCost:0;
  const datesMatch=(c.start_date||'')===(h.startDate||'')&&(c.end_date||'')===(h.endDate||'');
  const daysMatch=hireDays===invDays;
  const rateMatch=Math.abs(hireCost-invRate)<0.01;
  const netMatch=Math.abs(hireNet-invNet)<0.01;
  const allMatch=datesMatch&&daysMatch&&rateMatch;
  const cls=v=>v?'rec-ok':'rec-warn';
  const sym=v=>v?'✓':'⚠';
  return `<div class="hire-row matched" id="hrw-${invId}-${idx}">
    <div class="hire-row-title">🔗 ${esc(h.registration||'—')} · ${esc(h.driver||'—')} — matches booking <code>${esc(c.reference||c.agreement_ref||c.id)}</code> (<code>${esc(c.id)}</code>)</div>
    <div class="reconcile-grid">
      <div class="reconcile-col">
        <div class="reconcile-col-label">Booked</div>
        <div class="reconcile-line">Customer: <strong>${esc(c.customer||'—')}</strong></div>
        <div class="reconcile-line ${cls(datesMatch)}">${sym(datesMatch)} ${fmtD(c.start_date)} – ${c.end_date?fmtD(c.end_date):'ongoing'}</div>
        <div class="reconcile-line ${cls(daysMatch)}">${sym(daysMatch)} ${hireDays??'—'} days</div>
        <div class="reconcile-line ${cls(rateMatch)}">${sym(rateMatch)} £${hireCost.toFixed(2)}/day cost · £${(parseFloat(c.upsell_per_day)||0).toFixed(2)}/day upsell</div>
        <div class="reconcile-line ${cls(netMatch)}">${sym(netMatch)} Net £${hireNet.toFixed(2)}</div>
      </div>
      <div class="reconcile-col">
        <div class="reconcile-col-label">Invoiced</div>
        <div class="reconcile-line">Vendor: <strong>${esc(h.vehicleDescription||'—')}</strong></div>
        <div class="reconcile-line">${fmtD(h.startDate)} – ${fmtD(h.endDate)}</div>
        <div class="reconcile-line">${invDays??'—'} days</div>
        <div class="reconcile-line">£${invRate.toFixed(2)}/day cost</div>
        <div class="reconcile-line">Net £${invNet.toFixed(2)}</div>
      </div>
    </div>
    ${supps.length?`<div class="hire-row-supps">Supplementary from invoice: ${supps.map(s=>'+ '+esc(s.type||'Other')+' £'+(parseFloat(s.amount)||0).toFixed(2)+(s.notes?' ('+esc(s.notes)+')':'')).join(' · ')}</div>`:''}
    <div class="hire-row-form">
      <div style="flex:1;font-size:11px;color:${allMatch?'var(--tl-green-t)':'var(--tl-orange-t)'};font-weight:600">${allMatch?'✓ Everything matches':'⚠ Differences detected — approving will overwrite booking with invoice values (keeps your sell/day rate)'}</div>
      <button class="btn btn-approve" onclick="approveMatch('${invId}',${idx},'${c.id}')">${allMatch?'✓ Approve & link':'Approve with differences'}</button>
      <button class="btn btn-edit" onclick="overrideToUnmatched('${invId}',${idx})">Pick different hire…</button>
    </div>
  </div>`;
}
// Unmatched → pick existing OR create new
function unmatchedRow(invId,h,idx){
  const supps=Array.isArray(h.supplementaries)?h.supplementaries:[];
  const days=h.days||'',rate=h.ratePerDay||'',net=parseFloat(h.netAmount)||0;
  // Unlinked hires that could be picked
  const candidates=(allHires||[]).filter(x=>!x.incoming_invoice_id&&x.hire_status!=='cancelled')
    .sort((a,b)=>(a.customer||'').localeCompare(b.customer||''));
  const candidateOpts=candidates.map(x=>`<option value="${esc(x.id)}">${esc(x.customer||'?')} — ${esc(x.vehicle_reg||'?')} / ${esc(x.driver||'?')} · ${fmtD(x.start_date)}${x.reference?' · '+esc(x.reference):''}</option>`).join('');
  const guessId=guessAccountId(h);
  const clientAccounts=(allAccounts||[]).filter(a=>(a.type||'client')==='client').slice().sort((a,b)=>(a.company_name||'').localeCompare(b.company_name||''));
  const accountOpts=clientAccounts.map(a=>`<option value="${esc(a.id)}"${guessId===a.id?' selected':''}>${esc(a.company_name)}</option>`).join('');
  return `<div class="hire-row" id="hrw-${invId}-${idx}">
    <div class="hire-row-title">⚠ ${esc(h.registration||'—')} · ${esc(h.driver||'—')}${h.vehicleDescription?' · '+esc(h.vehicleDescription):''}</div>
    <div class="hire-row-meta">${h.startDate?fmtD(h.startDate):'—'} – ${h.endDate?fmtD(h.endDate):'—'} · ${days} days${rate?' @ £'+parseFloat(rate).toFixed(2)+'/day':''} · Net £${net.toFixed(2)}${h.bookingReference?' · Booking '+esc(h.bookingReference):''}${h.customerPO?' · PO '+esc(h.customerPO):''}</div>
    ${supps.length?`<div class="hire-row-supps">${supps.map(s=>'+ '+esc(s.type||'Other')+' £'+(parseFloat(s.amount)||0).toFixed(2)+(s.notes?' ('+esc(s.notes)+')':'')).join(' · ')}</div>`:''}
    <div style="font-size:11px;color:var(--tl-orange-t);margin:6px 0 4px;font-weight:600">No matching booking found. Either link to an existing hire below, or create a new one.</div>

    <div class="hire-row-form" style="border-top:1px dashed var(--n100);padding-top:8px">
      <div class="form-field" style="flex:3 1 260px"><label>Link to existing hire</label>
        <select id="hrv-pick-${invId}-${idx}"><option value="">— pick a hire —</option>${candidateOpts}</select>
      </div>
      <button class="btn btn-edit" onclick="linkToExistingHire('${invId}',${idx})">Link</button>
    </div>

    <div class="hire-row-form">
      <div class="form-field" style="flex:2 1 220px"><label>Create new — Customer account</label>
        <select id="hrv-cust-${invId}-${idx}"><option value="">— select —</option>${accountOpts}</select>
      </div>
      <div class="form-field" style="flex:0 0 110px"><label>Upsell/day £</label><input type="number" step="0.01" id="hrv-upsell-${invId}-${idx}" placeholder="0.00"></div>
      <button class="btn btn-approve" onclick="createNewFromExtraction('${invId}',${idx})">Create new</button>
    </div>
  </div>`;
}
// Force render as unmatched even if booking ref matched (allow manual pick)
function overrideToUnmatched(invId,idx){
  const inv=allInvoices.find(x=>x.id===invId);if(!inv)return;
  const h=inv.extracted_hires[idx];if(!h)return;
  h._override=true;
  // Temporarily null out booking ref for rendering by showing unmatched path
  // Simpler: just set a flag and adjust hireReviewRow — but easiest: render in place
  const row=document.getElementById(`hrw-${invId}-${idx}`);
  if(row)row.outerHTML=unmatchedRow(invId,h,idx);
}

function guessAccountId(h){
  if(!Array.isArray(allAccounts))return '';
  const lc=s=>(s||'').toLowerCase().trim();
  if(h.customerPO){
    const po=lc(h.customerPO);
    const exact=allAccounts.find(a=>lc(a.company_name)===po);if(exact)return exact.id;
    const partial=allAccounts.find(a=>a.company_name&&(lc(a.company_name).includes(po)||po.includes(lc(a.company_name))));if(partial)return partial.id;
  }
  if(h.bookingReference&&Array.isArray(allHires)){
    const prev=allHires.find(x=>x.reference===h.bookingReference||x.agreement_ref===h.bookingReference);
    if(prev&&prev.client_account_id)return prev.client_account_id;
  }
  return '';
}
function detectSupplier(vendor){
  const v=(vendor||'').toLowerCase();
  if(v.includes('fourways'))return 'Fourways';
  if(v.includes('ogilvie'))return 'Ogilvie';
  if(v.includes('arval'))return 'Arval';
  if(v.includes('lex'))return 'Lex';
  if(v.includes('ford rental')||v.includes('ford motor'))return 'Ford rental';
  if(v.includes('enterprise'))return 'Enterprise';
  return 'Other';
}

// PATH 1: matched — update the existing booking with invoice values, link invoice, set billing_status
async function approveMatch(invId,idx,hireId){
  const inv=allInvoices.find(x=>x.id===invId);if(!inv)return;
  const extracted=Array.isArray(inv.extracted_hires)?inv.extracted_hires.slice():[];
  const h=extracted[idx];if(!h)return;
  const existing=allHires.find(x=>x.id===hireId);if(!existing){toast('Hire not found','error');return;}
  // Merge invoice supplementary costs onto existing booking supps by type+notes,
  // preserving any upsell_amount already set on the booking.
  const existingSupps=Array.isArray(existing.supplementaries)?existing.supplementaries:[];
  const supps=(h.supplementaries||[]).map(s=>{
    const sType=s.type||'Other',sNotes=s.notes||null;
    const match=existingSupps.find(x=>x.type===sType&&(x.notes||null)===sNotes);
    return {
      type:sType,
      cost_amount:parseFloat(s.amount)||0,
      upsell_amount:match?(parseFloat(match.upsell_amount)||0):0,
      vat_status:s.vatStatus||(match&&match.vat_status)||'full',
      notes:sNotes
    };
  });
  const patch={
    incoming_invoice_id:invId,
    billing_status:'invoiced-in',
    // Overwrite booking to reflect what was actually invoiced (user-visible upsell_per_day kept)
    start_date:h.startDate||existing.start_date,
    end_date:h.endDate||existing.end_date,
    cost_per_day:parseFloat(h.ratePerDay)||existing.cost_per_day,
    vat_status:h.vatStatus||existing.vat_status||'full',
    supplementaries:supps,
    supplier_ref:inv.invoice_number||existing.supplier_ref,
    updated_at:new Date().toISOString()
  };
  try{
    await sbReq(`covase_hires?id=eq.${encodeURIComponent(hireId)}`,{method:'PATCH',body:patch,prefer:'return=minimal'});
    Object.assign(existing,patch);
    extracted[idx]={...h,matched_hire_id:hireId,matched_at:new Date().toISOString()};
    await sbReq(`covase_invoices?id=eq.${encodeURIComponent(invId)}`,{method:'PATCH',body:{extracted_hires:extracted,updated_at:new Date().toISOString()},prefer:'return=minimal'});
    inv.extracted_hires=extracted;
    const wasExpanded=document.getElementById('ic-'+invId)?.classList.contains('expanded');
    renderInvoices();
    if(wasExpanded)document.getElementById('ic-'+invId)?.classList.add('expanded');
    renderPipeline();updateBadges();
    toast(`Linked to ${hireId}`,'success');
  }catch(e){toast('Approve failed: '+e.message,'error');}
}

// PATH 2: unmatched but user picks an existing hire manually
async function linkToExistingHire(invId,idx){
  const hireId=document.getElementById(`hrv-pick-${invId}-${idx}`)?.value;
  if(!hireId){toast('Pick a hire from the list','error');return;}
  return approveMatch(invId,idx,hireId);
}

// PATH 3: create a brand new hire from the extracted data
async function createNewFromExtraction(invId,idx){
  const inv=allInvoices.find(x=>x.id===invId);if(!inv)return;
  const extracted=Array.isArray(inv.extracted_hires)?inv.extracted_hires.slice():[];
  const h=extracted[idx];if(!h)return;
  const accountId=document.getElementById(`hrv-cust-${invId}-${idx}`)?.value;
  const sellRate=parseFloat(document.getElementById(`hrv-upsell-${invId}-${idx}`)?.value);
  if(!accountId){toast('Pick a customer account','error');return;}
  if(isNaN(sellRate)||sellRate<0){toast('Enter an upsell/day rate (0 is allowed)','error');return;}
  const account=(allAccounts||[]).find(a=>a.id===accountId);if(!account){toast('Account not found','error');return;}
  const hireId='hire-'+Date.now();
  const supps=(h.supplementaries||[]).map(s=>({type:s.type||'Other',cost_amount:parseFloat(s.amount)||0,upsell_amount:0,vat_status:s.vatStatus||'full',notes:s.notes||null}));
  const supplier=detectSupplier(inv.vendor||'');
  const hirePayload={
    id:hireId,
    customer:account.company_name,
    client_account_id:accountId,
    driver:h.driver||null,
    reference:h.bookingReference||null,
    agreement_ref:h.bookingReference||null,
    hire_status:'offhired',
    billing_status:'invoiced-in',
    vehicle_reg:h.registration||null,
    make_model:h.vehicleDescription||null,
    supplier,
    supplier_ref:inv.invoice_number||null,
    start_date:h.startDate||null,
    end_date:h.endDate||null,
    cost_per_day:parseFloat(h.ratePerDay)||null,
    upsell_per_day:sellRate,
    vat_status:h.vatStatus||'full',
    supplementaries:supps,
    incoming_invoice_id:invId,
    updated_at:new Date().toISOString()
  };
  try{
    await sbReq('covase_hires',{method:'POST',body:hirePayload,prefer:'return=minimal'});
    allHires.unshift(hirePayload);
    extracted[idx]={...h,committed:true,committed_hire_id:hireId,committed_account_id:accountId,committed_at:new Date().toISOString()};
    await sbReq(`covase_invoices?id=eq.${encodeURIComponent(invId)}`,{method:'PATCH',body:{extracted_hires:extracted,updated_at:new Date().toISOString()},prefer:'return=minimal'});
    inv.extracted_hires=extracted;
    const wasExpanded=document.getElementById('ic-'+invId)?.classList.contains('expanded');
    renderInvoices();
    if(wasExpanded)document.getElementById('ic-'+invId)?.classList.add('expanded');
    renderPipeline();updateBadges();
    toast(`Created ${hireId}`,'success');
  }catch(e){toast('Create failed: '+e.message,'error');}
}

// ─── OUTGOING ───
let outInvoices=[],outFilter='all';
async function loadOutgoing(){
  const el=document.getElementById('outgoing-list');if(needsSetup(el))return;
  el.innerHTML='<div class="loading">Loading…</div>';
  try{outInvoices=await sbReq(`covase_invoices?category=eq.outgoing&order=invoice_date.desc&limit=200`);renderOutgoing();}
  catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-icon">✗</div><div class="empty-title">Load failed</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}
function setOutFilter(f,btn){outFilter=f;document.querySelectorAll('#view-outgoing .filter-pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderOutgoing();}
function renderOutgoing(){
  const el=document.getElementById('outgoing-list');
  let inv=outInvoices;if(outFilter!=='all')inv=inv.filter(i=>i.status===outFilter);
  if(!inv.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">↑</div><div class="empty-title">${outFilter==='all'?'No outgoing invoices yet':'Nothing with status "'+outFilter+'"'}</div><div class="empty-sub">Click "+ New Invoice" to create one.</div></div>`;return;}
  el.innerHTML=inv.map(i=>buildOutCard(i)).join('');
}
function buildOutCard(inv){
  const amt=parseFloat(inv.total)||0,amtFmt='£'+amt.toLocaleString('en-GB',{minimumFractionDigits:2});
  const pm=(inv.payment_method||'unknown').toLowerCase();
  const pmClass=pm==='direct_debit'?'badge-direct_debit':pm==='bacs'?'badge-bacs':'badge-unknown';
  const pmLabel=pm==='direct_debit'?'Direct Debit':pm==='bacs'?'BACS':pm;
  const dateStr=inv.invoice_date?new Date(inv.invoice_date).toLocaleDateString('en-GB'):'—';
  const dueStr=inv.due_date?new Date(inv.due_date).toLocaleDateString('en-GB'):'—';
  const clientName=inv.client_name||inv.description?.split(';')[0]||'—';
  const pdfBtn=inv.pdf_url?`<button class="btn btn-pdf" onclick="window.open('${esc(inv.pdf_url)}','_blank')">📄 PDF</button>`:'';
  return `<div class="inv-card" id="oc-${inv.id}">
    <div class="inv-header" onclick="toggleCard('oc-${inv.id}')">
      <div><div class="inv-vendor-name">${esc(clientName)}</div><div class="inv-meta">${esc(inv.invoice_number||'—')} · ${esc(inv.prepared_by||'')}</div></div>
      <div class="inv-col"><div class="inv-col-label">Date</div><div class="inv-col-val">${dateStr}</div></div>
      <div class="inv-col"><div class="inv-col-label">Due</div><div class="inv-col-val">${dueStr}</div></div>
      <div class="inv-col"><div class="inv-col-label">Amount</div><div class="inv-amount">${amtFmt}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px"><span class="badge badge-${inv.status||'sent'}">${inv.status||'sent'}</span><span class="badge ${pmClass}">${pmLabel}</span></div>
      <div class="expand-arrow">▶</div>
    </div>
    <div class="card-detail">
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">Client</div><div class="detail-val">${esc(inv.client_name||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Invoice no.</div><div class="detail-val">${esc(inv.invoice_number||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Prepared by</div><div class="detail-val">${esc(inv.prepared_by||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Payment terms</div><div class="detail-val">${esc(inv.payment_terms||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Payment method</div><div class="detail-val">${pmLabel}</div></div>
        <div class="detail-field"><div class="detail-label">Currency</div><div class="detail-val">${esc(inv.currency||'GBP')}</div></div>
      </div>
      <div class="vat-row"><div><span>Net</span><strong>£${(parseFloat(inv.subtotal)||0).toFixed(2)}</strong></div><div><span>VAT</span><strong>£${(parseFloat(inv.vat_amount)||0).toFixed(2)}</strong></div><div><span>Total</span><strong>${amtFmt}</strong></div></div>
      ${inv.description?`<div class="desc-box">${esc(inv.description)}</div>`:''}
      ${inv.client_address?`<div class="desc-box" style="font-size:11px;color:var(--n400)">📍 ${esc(inv.client_address).replace(/\n/g,', ')}</div>`:''}
      <div class="action-row">${pdfBtn}<button class="btn btn-edit" onclick="openGenerator('${esc(inv.id)}')">✎ Edit</button><button class="btn btn-paid" onclick="setOutStatus('${inv.id}','approved')">✓ Mark Paid</button><button class="btn btn-flag" onclick="setOutStatus('${inv.id}','flagged')">⚑ Flag</button></div>
    </div>
  </div>`;
}
async function setOutStatus(id,status){
  try{
    await sbReq(`covase_invoices?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{status},prefer:'return=minimal'});
    const i=outInvoices.find(x=>x.id===id);if(i)i.status=status;
    // If marking paid, cascade to any hires linked to this outgoing invoice
    if(status==='paid'||status==='approved'){
      const linkedHires=(allHires||[]).filter(h=>h.outgoing_invoice_id===id&&h.billing_status!=='paid');
      if(linkedHires.length){
        await Promise.all(linkedHires.map(h=>sbReq(`covase_hires?id=eq.${encodeURIComponent(h.id)}`,{method:'PATCH',body:{billing_status:'paid',updated_at:new Date().toISOString()},prefer:'return=minimal'})));
        linkedHires.forEach(h=>h.billing_status='paid');
        renderPipeline();updateHireStats();updateBadges();
      }
    }
    renderOutgoing();
    toast(`Invoice ${status}`,'success');
  }catch(e){toast('Update failed: '+e.message,'error');}
}
function openGenerator(id){
  const base=localStorage.getItem('covase_generator_url')||'covase-invoice-generator.html';
  if(id)window.open(base+'?id='+encodeURIComponent(id),'_blank');
  else window.open(base,'_blank');
}

// ─── RECHARGE PICKER ───
let rpInv=null,rpItems=[];
function rechargeInvoice(id){
  const inv=allInvoices.find(i=>i.id===id);
  if(!inv){window.open((localStorage.getItem('covase_generator_url')||'covase-invoice-generator.html')+'?recharge_from='+encodeURIComponent(id),'_blank');return;}
  let items=[];
  let clientName='';
  // For short-hire invoices, build rich line items from the hires linked to this invoice
  if(inv.is_short_hire){
    const linked=(allHires||[]).filter(h=>h.incoming_invoice_id===id);
    if(!linked.length){toast('No hires linked to this invoice yet — approve the extracted hires first','error');return;}
    // Sanity check: all linked hires should belong to the same client
    const clients=[...new Set(linked.map(h=>h.customer||''))].filter(Boolean);
    if(clients.length>1){toast('Linked hires span multiple clients — recharge separately','error');return;}
    clientName=clients[0]||'';
    linked.forEach(h=>{
      const days=daysOn(h);
      const cpd=parseFloat(h.cost_per_day)||0,upd=parseFloat(h.upsell_per_day)||0,rft=parseFloat(h.rft_per_day)||0;
      const dailyRate=cpd+upd+rft;
      const sellTotal=days?days*dailyRate:0;
      const reg=h.vehicle_reg||'',driver=h.driver||'';
      const hireDesc=`${reg} for ${driver}${dailyRate?' @ £'+dailyRate.toFixed(2)+' per day':''}${days?'\n('+days+' Days – '+fmtD(h.start_date)+' – '+fmtD(h.end_date||'')+')':''}`;
      const vatExempt=(h.vat_status==='outside_of_scope');
      items.push({desc:hireDesc,amt:sellTotal.toFixed(2),vatExempt,reg,driver});
      if(Array.isArray(h.supplementaries)){
        h.supplementaries.forEach(s=>{
          const cost=parseFloat(s.cost_amount!=null?s.cost_amount:s.amount)||0;
          const up=parseFloat(s.upsell_amount)||0;
          const amt=cost+up;if(!amt)return;
          items.push({desc:`${reg}${driver?' — '+driver:''} — ${s.type}${s.notes?' ('+s.notes+')':''}`,amt:amt.toFixed(2),vatExempt:(s.vat_status==='outside_of_scope'),reg,driver});
        });
      }
    });
  }else{
    if(inv.line_items){try{items=typeof inv.line_items==='string'?JSON.parse(inv.line_items):inv.line_items;}catch(e){}}
    if(!Array.isArray(items)||!items.length)items=[{desc:inv.description||inv.vendor||'Recharged item',amt:String(inv.subtotal||inv.total||''),vatExempt:false}];
  }
  if(clientName)localStorage.setItem('recharge_client_name',clientName);
  if(items.length<=1){localStorage.setItem('recharge_selected_items',JSON.stringify(items));localStorage.setItem('recharge_source_id',id);window.open((localStorage.getItem('covase_generator_url')||'covase-invoice-generator.html')+'?recharge_from='+encodeURIComponent(id),'_blank');return;}
  rpInv=inv;rpItems=items;
  document.getElementById('rp-sub').textContent=(inv.vendor||'Invoice')+(inv.invoice_number?' · #'+inv.invoice_number:'')+(clientName?' → '+clientName:'');
  document.getElementById('rp-lines').innerHTML=items.map((li,i)=>`
    <label class="rp-line"><input type="checkbox" id="rpli-${i}" checked onchange="updateRpTotal()">
      <div class="rp-line-info">${li.reg?`<div class="rp-line-reg">${esc(li.reg)}</div>`:''} ${li.driver?`<div class="rp-line-driver">${esc(li.driver)}</div>`:''}<div class="rp-line-desc">${esc(li.desc||'')}</div></div>
      <div class="rp-line-amt">£${parseFloat(li.amt||0).toFixed(2)}</div>
    </label>`).join('');
  updateRpTotal();document.getElementById('rp-overlay').classList.add('open');
}
function updateRpTotal(){const total=rpItems.reduce((s,li,i)=>{const cb=document.getElementById(`rpli-${i}`);return cb&&cb.checked?s+parseFloat(li.amt||0):s;},0);document.getElementById('rp-total').textContent='£'+total.toFixed(2);}
function closeRechargePicker(){document.getElementById('rp-overlay').classList.remove('open');}
function confirmRecharge(){
  const selected=rpItems.filter((_,i)=>document.getElementById(`rpli-${i}`)?.checked);
  if(!selected.length){toast('Select at least one line','error');return;}
  localStorage.setItem('recharge_selected_items',JSON.stringify(selected));localStorage.setItem('recharge_source_id',rpInv.id);
  closeRechargePicker();window.open((localStorage.getItem('covase_generator_url')||'covase-invoice-generator.html')+'?recharge_from='+encodeURIComponent(rpInv.id),'_blank');
  markHiresRecharged(rpInv.id);
  toast(`Opening generator with ${selected.length} line${selected.length>1?'s':''}…`,'success');
}
// Flip any hires linked to this invoice to billing_status=recharged (local + remote)
async function markHiresRecharged(invId){
  const linked=(allHires||[]).filter(h=>h.incoming_invoice_id===invId&&h.billing_status==='invoiced-in');
  if(!linked.length)return;
  const ids=linked.map(h=>h.id);
  try{
    await sbReq(`covase_hires?id=in.(${ids.map(encodeURIComponent).join(',')})`,{method:'PATCH',body:{billing_status:'recharged',updated_at:new Date().toISOString()},prefer:'return=minimal'});
    linked.forEach(h=>h.billing_status='recharged');
    renderPipeline();updateHireStats();updateBadges();
  }catch(e){console.warn('markHiresRecharged failed',e);}
}
async function markHireRecharged(hireId){
  const h=allHires.find(x=>x.id===hireId);if(!h||h.billing_status==='recharged'||h.billing_status==='paid')return;
  try{
    await sbReq(`covase_hires?id=eq.${encodeURIComponent(hireId)}`,{method:'PATCH',body:{billing_status:'recharged',updated_at:new Date().toISOString()},prefer:'return=minimal'});
    h.billing_status='recharged';
    renderPipeline();updateHireStats();updateBadges();
  }catch(e){console.warn('markHireRecharged failed',e);}
}

