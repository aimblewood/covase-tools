// ─── ACCOUNTS ───
// Structured address (address_line1..postcode, added 21 Oct 2026) as display
// lines; falls back to the legacy free-text `address`, which is never parsed
// or overwritten.
function fmtAddressLines(o){
  const lines=[o.address_line1,o.address_line2,o.address_line3,o.town,o.county,o.postcode].map(v=>(v||'').trim()).filter(Boolean);
  return lines.length?lines.join('\n'):(o.address||'').trim();
}
// Address fields shared by the account (acf) and contact (ctf) forms.
const ADDR_FIELDS=[['addr1','address_line1'],['addr2','address_line2'],['town','town'],['county','county'],['postcode','postcode']];
function fillAddressFields(px,o){
  ADDR_FIELDS.forEach(([f,col])=>{const e=document.getElementById(px+'-'+f);if(e)e.value=o?.[col]||'';});
  const leg=document.getElementById(px+'-address');if(leg)leg.value=o?.address||'';
  const w=document.getElementById(px+'-legacy-wrap');if(w)w.style.display=o?.address?'':'none';
  const r=document.getElementById(px+'-postcode-results');if(r)r.classList.remove('open');
}
function readAddressFields(px){
  const out={};
  ADDR_FIELDS.forEach(([f,col])=>{const v=(document.getElementById(px+'-'+f)?.value||'').trim();out[col]=v?(f==='postcode'?v.toUpperCase():v):null;});
  return out;
}
let allAccounts=[],accountFilter='all';
async function loadAccounts(){
  const el=document.getElementById('account-list');if(needsSetup(el))return;
  el.innerHTML='<div class="loading">Loading accounts…</div>';
  try{allAccounts=await sbReq('covase_accounts?order=company_name.asc&limit=500');updateAccountStats();renderAccounts();updateBadges();populateAccountDatalist();}
  catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-icon">◉</div><div class="empty-title">Load failed</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}
function updateAccountStats(){
  const clients=allAccounts.filter(a=>a.type==='client'||!a.type);
  const funders=allAccounts.filter(a=>a.type==='funder');
  const other=allAccounts.filter(a=>a.type==='supplier'||a.type==='dealer');
  document.getElementById('sac-total').textContent=allAccounts.length;
  document.getElementById('sac-clients').textContent=clients.length;
  document.getElementById('sac-funders').textContent=funders.length;
  document.getElementById('sac-other').textContent=other.length;
  document.getElementById('badge-accounts').textContent=clients.filter(c=>c.status==='active').length||'0';
}
function setAccountFilter(f,btn){accountFilter=f;document.querySelectorAll('#view-accounts .filter-pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderAccounts();}
function renderAccounts(){
  const el=document.getElementById('account-list');
  const q=(document.getElementById('account-search')?.value||'').toLowerCase();
  let accounts=allAccounts;
  if(accountFilter!=='all')accounts=accounts.filter(a=>a.type===accountFilter);
  if(q)accounts=accounts.filter(a=>(a.company_name||'').toLowerCase().includes(q)||(a.contact_name||'').toLowerCase().includes(q));
  if(!accounts.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">◉</div><div class="empty-title">No accounts found</div><div class="empty-sub">Click "+ New Account" to add your first account.</div></div>`;return;}
  el.innerHTML=accounts.map(a=>buildAccountCard(a)).join('');
}
function buildAccountCard(a){
  const type=a.type||'client';
  const pmClass=a.payment_method==='Direct Debit'?'badge-direct_debit':'badge-bacs';
  const pmLabel=a.payment_method||'BACS';
  const statusBadge=a.status==='active'?'<span class="badge badge-active">Active</span>':'<span class="badge badge-closed">Inactive</span>';
  return `<div class="account-card" id="acc-${a.id}">
    <div class="account-header" onclick="toggleCard('acc-${a.id}')">
      <div><div class="ac-name">${esc(a.company_name)}</div><div class="ac-meta">${esc(a.contact_name||'—')} ${a.contact_email?'· '+esc(a.contact_email):''}</div></div>
      <div class="inv-col"><div class="inv-col-label">Type</div><div class="inv-col-val"><span class="badge badge-${type}">${type}</span></div></div>
      <div class="inv-col"><div class="inv-col-label">Acct mgr</div><div class="inv-col-val">${esc((a.account_manager||'').split(' ')[0])}</div></div>
      <div class="inv-col"><div class="inv-col-label">Terms</div><div class="inv-col-val">${esc(a.payment_terms||'—')}</div></div>
      <div style="display:flex;flex-direction:column;gap:4px">${statusBadge}<span class="badge ${pmClass}">${pmLabel}</span></div>
      <div class="expand-arrow">▶</div>
    </div>
    <div class="card-detail">
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">Company</div><div class="detail-val">${esc(a.company_name||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Type</div><div class="detail-val">${esc(type)}</div></div>
        <div class="detail-field"><div class="detail-label">MHA ref</div><div class="detail-val">${esc(a.mha||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Contact</div><div class="detail-val">${esc(a.contact_name||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Email</div><div class="detail-val">${esc(a.contact_email||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Phone</div><div class="detail-val">${esc(a.contact_phone||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Account manager</div><div class="detail-val">${esc(a.account_manager||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Payment method</div><div class="detail-val">${pmLabel}</div></div>
        <div class="detail-field"><div class="detail-label">Dynamics ID</div><div class="detail-val">${a.dynamics_id?`<a href="${d365Url('account',a.dynamics_id)}" target="_blank" rel="noopener" class="d365-chip small" title="${esc(a.dynamics_id)}">↗ Open in Dynamics</a>`:'—'}</div></div>
      </div>
      ${fmtAddressLines(a)?`<div class="notes-box" style="white-space:pre-line">📍 ${esc(fmtAddressLines(a))}</div>`:''}
      ${a.notes?`<div class="notes-box">${esc(a.notes)}</div>`:''}
      <div class="action-row">
        <button class="btn btn-recharge" onclick="openClientOverview('${a.id}')">🔎 Overview</button>
        <button class="btn btn-edit" onclick="openEditAccount('${a.id}')">✎ Edit</button>
        <button class="btn btn-edit" onclick="openAccountAddresses('${a.id}')">📍 Other addresses</button>
        <button class="btn btn-edit" onclick="openDocs('account','${a.id}',allAccounts.find(x=>x.id==='${a.id}')?.company_name)">📎 Documents</button>
        <button class="btn btn-recharge" onclick="openGenerator();localStorage.setItem('prefill_client','${esc(a.company_name)}')">+ Invoice this account</button>
        <button class="btn btn-danger" onclick="deleteAccount('${a.id}')">✗</button>
      </div>
    </div>
  </div>`;
}
function populateAccountDatalist(){
  const dl=document.getElementById('account-datalist');if(dl)dl.innerHTML=allAccounts.map(a=>`<option value="${esc(a.company_name)}">`).join('');
  // also populate vehicle account/funder/dealer selects if open
  populateVehicleRelationSelects();
}
// ─── ACCOUNT MODAL ───
let editAccountId=null;
function openNewAccount(){editAccountId=null;document.getElementById('account-modal-title').textContent='New account';clearAccountForm();document.getElementById('account-modal').classList.add('open');}
function openEditAccount(id){
  const a=allAccounts.find(x=>x.id===id);if(!a)return;editAccountId=id;
  document.getElementById('account-modal-title').textContent='Edit account';
  const f=(fid,v)=>{const e=document.getElementById(fid);if(e)e.value=v??''};
  f('acf-company',a.company_name);f('acf-type',a.type||'client');f('acf-status',a.status);f('acf-mha',a.mha);f('acf-contact',a.contact_name);f('acf-email',a.contact_email);f('acf-phone',a.contact_phone);f('acf-manager',a.account_manager);fillAddressFields('acf',a);f('acf-website',a.website);f('acf-company-number',a.company_number);f('acf-vat',a.vat_number);f('acf-ordering',a.ordering_route);f('acf-pm',a.payment_method);f('acf-terms',a.payment_terms);f('acf-dynamics',a.dynamics_id);f('acf-notes',a.notes);f('acf-booking-email',a.booking_email);
  updateAccountDynamicsLink();toggleAcfBookingEmail();toggleAcfOrdering();
  document.getElementById('account-modal').classList.add('open');
}
function closeAccountModal(){document.getElementById('account-modal').classList.remove('open');}
function toggleAcfOrdering(){const w=document.getElementById('acf-ordering-wrap');if(w)w.style.display=['dealer','funder','supplier'].includes(document.getElementById('acf-type').value)?'':'none';}
function toggleAcfBookingEmail(){const w=document.getElementById('acf-booking-email-wrap');if(w)w.style.display=document.getElementById('acf-type').value==='supplier'?'':'none';}
function clearAccountForm(){fillAddressFields('acf',null);['acf-company','acf-mha','acf-contact','acf-email','acf-phone','acf-dynamics','acf-notes','acf-booking-email','acf-website','acf-company-number','acf-vat','acf-ordering'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});document.getElementById('acf-type').value='client';document.getElementById('acf-status').value='active';document.getElementById('acf-pm').value='BACS';document.getElementById('acf-terms').value='28 days';document.getElementById('acf-manager').value='Simon Homer';updateAccountDynamicsLink();toggleAcfBookingEmail();toggleAcfOrdering();}
async function saveAccount(){
  const company=document.getElementById('acf-company').value.trim();if(!company){toast('Company name required','error');return;}
  const payload={company_name:company,type:document.getElementById('acf-type').value,status:document.getElementById('acf-status').value,mha:document.getElementById('acf-mha').value.trim()||null,contact_name:document.getElementById('acf-contact').value.trim()||null,contact_email:document.getElementById('acf-email').value.trim()||null,contact_phone:document.getElementById('acf-phone').value.trim()||null,account_manager:document.getElementById('acf-manager').value,address:document.getElementById('acf-address').value.trim()||null,...readAddressFields('acf'),website:document.getElementById('acf-website').value.trim()||null,company_number:document.getElementById('acf-company-number').value.trim()||null,vat_number:document.getElementById('acf-vat').value.trim()||null,ordering_route:document.getElementById('acf-ordering').value||null,payment_method:document.getElementById('acf-pm').value,payment_terms:document.getElementById('acf-terms').value,dynamics_id:document.getElementById('acf-dynamics').value.trim()||null,notes:document.getElementById('acf-notes').value.trim()||null,booking_email:document.getElementById('acf-booking-email').value.trim()||null,updated_at:new Date().toISOString()};
  try{
    if(editAccountId){await sbReq(`covase_accounts?id=eq.${encodeURIComponent(editAccountId)}`,{method:'PATCH',body:payload,prefer:'return=minimal'});const idx=allAccounts.findIndex(x=>x.id===editAccountId);if(idx>=0)allAccounts[idx]={...allAccounts[idx],...payload};toast('Account updated','success');}
    else{const res=await sbReq('covase_accounts',{method:'POST',body:{...payload,id:'acc-'+Date.now()}});allAccounts.push(Array.isArray(res)?res[0]:res||{...payload,id:'acc-'+Date.now()});allAccounts.sort((a,b)=>a.company_name.localeCompare(b.company_name));toast('Account saved','success');}
    closeAccountModal();updateAccountStats();renderAccounts();populateAccountDatalist();
  }catch(e){toast('Save failed: '+e.message,'error');}
}
async function deleteAccount(id){if(!confirm('Remove this account? Cannot be undone.'))return;try{await sbReq(`covase_accounts?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=minimal'});allAccounts=allAccounts.filter(x=>x.id!==id);updateAccountStats();renderAccounts();populateAccountDatalist();toast('Account removed','success');}catch(e){toast('Delete failed: '+e.message,'error');}}

// ─── CONTACTS ───
let allContacts=[],contactFilter='all';
async function loadContacts(){
  const el=document.getElementById('contact-list');if(needsSetup(el))return;
  el.innerHTML='<div class="loading">Loading contacts…</div>';
  try{allContacts=await sbReq('covase_contacts?order=last_name.asc,first_name.asc&limit=1000');updateContactStats();renderContacts();updateBadges();}
  catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">Load failed</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}
function updateContactStats(){
  document.getElementById('sct-total').textContent=allContacts.length;
  document.getElementById('sct-drivers').textContent=allContacts.filter(c=>c.contact_type==='driver').length;
  document.getElementById('sct-leavers').textContent=allContacts.filter(c=>c.employee_status==='leaver').length;
  document.getElementById('sct-fms').textContent=allContacts.filter(c=>c.contact_type==='fleet manager').length;
  document.getElementById('badge-contacts').textContent=allContacts.filter(c=>c.employee_status==='employed').length||'0';
}
function setContactFilter(f,btn){contactFilter=f;document.querySelectorAll('#view-contacts .filter-pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderContacts();}
function renderContacts(){
  const el=document.getElementById('contact-list');
  const q=(document.getElementById('contact-search')?.value||'').toLowerCase();
  let contacts=allContacts;
  if(contactFilter==='leaver')contacts=contacts.filter(c=>c.employee_status==='leaver');
  else if(contactFilter!=='all')contacts=contacts.filter(c=>c.contact_type===contactFilter);
  if(q)contacts=contacts.filter(c=>[(c.first_name||''),(c.last_name||''),(c.preferred_name||''),(c.email||''),(c.employee_number||'')].join(' ').toLowerCase().includes(q));
  if(!contacts.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">No contacts found</div><div class="empty-sub">Click "+ New Contact" to add one.</div></div>`;return;}
  el.innerHTML=contacts.map(c=>buildContactCard(c)).join('');
}
function contactDisplayName(c){return c.preferred_name||(c.first_name+' '+c.last_name);}
function contactAccountName(c){const a=allAccounts.find(x=>x.id===c.account_id);return a?a.company_name:'—';}
function buildContactCard(c){
  const name=contactDisplayName(c);
  const acctName=contactAccountName(c);
  const statusClass='badge-'+(c.employee_status||'unknown');
  const statusLabel=c.employee_status||'unknown';
  return `<div class="contact-card" id="ctc-${c.id}">
    <div class="contact-header" onclick="toggleCard('ctc-${c.id}')">
      <div><div class="ct-name">${esc(name)}</div><div class="ct-meta">${c.employee_number?'#'+esc(c.employee_number)+' · ':''}${esc(acctName)}</div></div>
      <div class="inv-col"><div class="inv-col-label">Type</div><div class="inv-col-val">${esc(c.contact_type||'—')}</div></div>
      <div class="inv-col"><div class="inv-col-label">Grade</div><div class="inv-col-val">${esc(c.driver_grade||'—')}</div></div>
      <div class="inv-col"><div class="inv-col-label">Email</div><div class="inv-col-val" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.email||'—')}</div></div>
      <span class="badge ${statusClass}">${statusLabel}</span>
      <div class="expand-arrow">▶</div>
    </div>
    <div class="card-detail">
      <div class="detail-grid">
        <div class="detail-field"><div class="detail-label">First name</div><div class="detail-val">${esc(c.first_name||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Surname</div><div class="detail-val">${esc(c.last_name||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Preferred name</div><div class="detail-val">${esc(c.preferred_name||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Email</div><div class="detail-val">${esc(c.email||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Mobile</div><div class="detail-val">${esc(c.mobile||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Employee no.</div><div class="detail-val">${esc(c.employee_number||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Job description</div><div class="detail-val">${esc(c.job_description||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Driver grade</div><div class="detail-val">${esc(c.driver_grade||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Account</div><div class="detail-val">${esc(acctName)}</div></div>
      </div>
      ${fmtAddressLines(c)?`<div class="notes-box" style="white-space:pre-line">📍 ${esc(fmtAddressLines(c))} <span style="color:var(--n400);font-size:11px">(${esc(c.address_type||'home')})</span></div>`:''}
      ${c.notes?`<div class="notes-box">${esc(c.notes)}</div>`:''}
      <div class="action-row">
        <button class="btn btn-edit" onclick="openEditContact('${c.id}')">✎ Edit</button>
        <button class="btn btn-edit" onclick="openDocs('contact','${c.id}',contactDisplayName(allContacts.find(x=>x.id==='${c.id}')||{}))">📎 Documents</button>
        <button class="btn btn-danger" onclick="deleteContact('${c.id}')">✗</button>
      </div>
    </div>
  </div>`;
}
// ─── CONTACT MODAL ───
let editContactId=null;
function openNewContact(){editContactId=null;document.getElementById('contact-modal-title').textContent='New contact';clearContactForm();populateContactAccountSelect();document.getElementById('contact-modal').classList.add('open');}
function openEditContact(id){
  const c=allContacts.find(x=>x.id===id);if(!c)return;editContactId=id;
  document.getElementById('contact-modal-title').textContent='Edit contact';
  populateContactAccountSelect(c.account_id);
  const f=(fid,v)=>{const e=document.getElementById(fid);if(e)e.value=v??''};
  f('ctf-first',c.first_name);f('ctf-surname',c.last_name);f('ctf-preferred',c.preferred_name);f('ctf-empno',c.employee_number);f('ctf-email',c.email);f('ctf-mobile',c.mobile);fillAddressFields('ctf',c);f('ctf-addr-type',c.address_type||'home');f('ctf-type',c.contact_type||'driver');f('ctf-status',c.employee_status||'employed');f('ctf-job',c.job_description);f('ctf-grade',c.driver_grade);f('ctf-notes',c.notes);f('ctf-dynamics',c.dynamics_id);
  updateContactDynamicsLink();
  document.getElementById('contact-modal').classList.add('open');
}
function closeContactModal(){document.getElementById('contact-modal').classList.remove('open');}
function clearContactForm(){fillAddressFields('ctf',null);['ctf-first','ctf-surname','ctf-preferred','ctf-empno','ctf-email','ctf-mobile','ctf-job','ctf-grade','ctf-notes','ctf-dynamics'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});document.getElementById('ctf-addr-type').value='home';document.getElementById('ctf-type').value='driver';document.getElementById('ctf-status').value='employed';updateContactDynamicsLink();}
function updateContactDynamicsLink(){
  const id=(document.getElementById('ctf-dynamics')?.value||'').trim();
  const link=document.getElementById('ctf-dynamics-link');if(!link)return;
  const url=id?d365Url('contact',id):null;
  if(url){link.href=url;link.style.display='inline-flex';}
  else{link.removeAttribute('href');link.style.display='none';}
}
function updateAccountDynamicsLink(){
  const id=(document.getElementById('acf-dynamics')?.value||'').trim();
  const link=document.getElementById('acf-dynamics-link');if(!link)return;
  const url=id?d365Url('account',id):null;
  if(url){link.href=url;link.style.display='inline-flex';}
  else{link.removeAttribute('href');link.style.display='none';}
}
function populateContactAccountSelect(selectedId=''){
  const sel=document.getElementById('ctf-account');if(!sel)return;
  sel.innerHTML='<option value="">— no account —</option>'+allAccounts.sort((a,b)=>a.company_name.localeCompare(b.company_name)).map(a=>`<option value="${a.id}"${a.id===selectedId?' selected':''}>${esc(a.company_name)}</option>`).join('');
}
async function saveContact(){
  const first=document.getElementById('ctf-first').value.trim(),surname=document.getElementById('ctf-surname').value.trim();
  if(!first||!surname){toast('First name and surname required','error');return;}
  const payload={first_name:first,last_name:surname,preferred_name:document.getElementById('ctf-preferred').value.trim()||null,account_id:document.getElementById('ctf-account').value||null,employee_number:document.getElementById('ctf-empno').value.trim()||null,email:document.getElementById('ctf-email').value.trim()||null,mobile:document.getElementById('ctf-mobile').value.trim()||null,address:document.getElementById('ctf-address').value.trim()||null,...readAddressFields('ctf'),address_type:document.getElementById('ctf-addr-type').value||'home',contact_type:document.getElementById('ctf-type').value||'driver',employee_status:document.getElementById('ctf-status').value||'employed',job_description:document.getElementById('ctf-job').value.trim()||null,driver_grade:document.getElementById('ctf-grade').value.trim()||null,dynamics_id:document.getElementById('ctf-dynamics').value.trim()||null,notes:document.getElementById('ctf-notes').value.trim()||null,updated_at:new Date().toISOString()};
  try{
    if(editContactId){await sbReq(`covase_contacts?id=eq.${encodeURIComponent(editContactId)}`,{method:'PATCH',body:payload,prefer:'return=minimal'});const idx=allContacts.findIndex(x=>x.id===editContactId);if(idx>=0)allContacts[idx]={...allContacts[idx],...payload};toast('Contact updated','success');}
    else{const res=await sbReq('covase_contacts',{method:'POST',body:{...payload,id:'ct-'+Date.now()}});allContacts.push(Array.isArray(res)?res[0]:res||{...payload,id:'ct-'+Date.now()});allContacts.sort((a,b)=>a.last_name.localeCompare(b.last_name));toast('Contact saved','success');}
    closeContactModal();updateContactStats();renderContacts();populateVehicleDriverSelect();
  }catch(e){toast('Save failed: '+e.message,'error');}
}
async function deleteContact(id){if(!confirm('Remove this contact? Cannot be undone.'))return;try{await sbReq(`covase_contacts?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=minimal'});allContacts=allContacts.filter(x=>x.id!==id);updateContactStats();renderContacts();toast('Contact removed','success');}catch(e){toast('Delete failed: '+e.message,'error');}}

// ─── VEHICLES ───
let allVehicles=[],vehicleFilter='all';
async function loadVehicles(){
  const el=document.getElementById('vehicle-list');if(needsSetup(el))return;
  el.innerHTML='<div class="loading">Loading vehicles…</div>';
  // Load accounts + contacts first if not already loaded
  if(!allAccounts.length){try{allAccounts=await sbReq('covase_accounts?order=company_name.asc&limit=500');populateAccountDatalist();}catch(e){}}
  if(!allContacts.length){try{allContacts=await sbReq('covase_contacts?order=last_name.asc&limit=1000');}catch(e){}}
  try{allVehicles=await sbReq('covase_vehicles?order=created_at.desc&limit=500');updateVehicleStats();renderVehicles();updateBadges();}
  catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-icon">🚙</div><div class="empty-title">Load failed</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}
function vehicleAccountName(v,field){const a=allAccounts.find(x=>x.id===v[field]);return a?a.company_name:'—';}
function vehicleDriverName(v){const c=allContacts.find(x=>x.id===v.driver_id);return c?contactDisplayName(c):'—';}
function updateVehicleStats(){
  const active=allVehicles.filter(v=>v.status==='active');
  const now=new Date(),soon=new Date(now.getTime()+90*86400000);
  const renewals=active.filter(v=>{if(!v.renewal_date)return false;const r=new Date(v.renewal_date);return r>=now&&r<=soon;});
  const ch=allVehicles.filter(v=>v.funding_method==='Contract Hire');
  const ev=allVehicles.filter(v=>v.fuel_type&&(v.fuel_type.toLowerCase().includes('electric')||v.fuel_type.toLowerCase().includes('phev')));
  document.getElementById('svh-active').textContent=active.length;
  document.getElementById('svh-renewals').textContent=renewals.length;
  document.getElementById('svh-ch').textContent=ch.length;
  document.getElementById('svh-ev').textContent=ev.length;
  document.getElementById('badge-vehicles').textContent=active.length||'0';
}
function setVehicleFilter(f,btn){vehicleFilter=f;document.querySelectorAll('#view-vehicles .filter-pill').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderVehicles();}
function renderVehicles(){
  const el=document.getElementById('vehicle-list');
  const q=(document.getElementById('vehicle-search')?.value||'').toLowerCase();
  let vehicles=allVehicles;
  if(vehicleFilter!=='all')vehicles=vehicles.filter(v=>v.status===vehicleFilter);
  if(q)vehicles=vehicles.filter(v=>[(v.reg||''),(v.manufacturer||''),(v.model||''),(v.derivative||''),(v.name||'')].join(' ').toLowerCase().includes(q));
  if(!vehicles.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">🚙</div><div class="empty-title">No vehicles found</div><div class="empty-sub">Click "+ New Vehicle" to add one.</div></div>`;return;}
  el.innerHTML=vehicles.map(v=>buildVehicleCard(v)).join('');
}
function buildVehicleCard(v){
  const accountName=vehicleAccountName(v,'account_id');
  const driverName=vehicleDriverName(v);
  const funderName=vehicleAccountName(v,'funder_id');
  const renewalStr=v.renewal_date?fmtD(v.renewal_date):'—';
  // Highlight if renewal soon
  const now=new Date(),renewDate=v.renewal_date?new Date(v.renewal_date):null;
  const renewSoon=renewDate&&renewDate>=now&&renewDate<new Date(now.getTime()+90*86400000);
  const totalRent=(parseFloat(v.finance_rental)||0)+(parseFloat(v.service_rental)||0);
  const profit=(parseFloat(v.commissions)||0)+(parseFloat(v.setup_fee)||0)+((parseFloat(v.management_fee)||0)*(parseInt(v.term_months)||0))+(parseFloat(v.other_revenue)||0)-(parseFloat(v.costs)||0);
  return `<div class="vehicle-card" id="vhc-${v.id}">
    <div class="vehicle-header" onclick="toggleCard('vhc-${v.id}')">
      <div>
        <div class="vh-reg">${esc(v.reg||'—')}</div>
        <div class="vh-model">${[v.manufacturer,v.model,v.derivative].filter(Boolean).map(esc).join(' ')||esc(v.name||'—')}</div>
      </div>
      <div class="inv-col"><div class="inv-col-label">Account</div><div class="inv-col-val">${esc(accountName)}</div></div>
      <div class="inv-col"><div class="inv-col-label">Driver</div><div class="inv-col-val">${esc(driverName)}</div></div>
      <div class="inv-col"><div class="inv-col-label">Funder</div><div class="inv-col-val">${esc(funderName)}</div></div>
      <div class="inv-col"><div class="inv-col-label">Renewal</div><div class="inv-col-val" style="${renewSoon?'color:var(--tl-orange);font-weight:600':''}"}>${renewalStr}</div></div>
      <span class="badge badge-${v.status||'active'}">${v.status||'active'}</span>
      <div class="expand-arrow">▶</div>
    </div>
    <div class="card-detail">
      <div class="detail-section-head">Vehicle</div>
      <div class="detail-grid-4">
        <div class="detail-field"><div class="detail-label">Reg</div><div class="detail-val">${esc(v.reg||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Make</div><div class="detail-val">${esc(v.manufacturer||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Model</div><div class="detail-val">${esc(v.model||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Derivative</div><div class="detail-val">${esc(v.derivative||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Fuel</div><div class="detail-val">${esc(v.fuel_type||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Transmission</div><div class="detail-val">${esc(v.transmission||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">P11D</div><div class="detail-val">${v.p11d_value?'£'+parseFloat(v.p11d_value).toLocaleString('en-GB'):'—'}</div></div>
        <div class="detail-field"><div class="detail-label">CO₂ g/km</div><div class="detail-val">${v.co2_emissions||'—'}</div></div>
      </div>
      <div class="detail-section-head">Contract</div>
      <div class="detail-grid-4">
        <div class="detail-field"><div class="detail-label">Funding</div><div class="detail-val">${esc(v.funding_method||'—')}</div></div>
        <div class="detail-field"><div class="detail-label">Term</div><div class="detail-val">${v.term_months?v.term_months+' mo':'—'}</div></div>
        <div class="detail-field"><div class="detail-label">Ann. mileage</div><div class="detail-val">${v.annual_mileage?v.annual_mileage.toLocaleString('en-GB'):'—'}</div></div>
        <div class="detail-field"><div class="detail-label">Total rental</div><div class="detail-val">${totalRent?'£'+totalRent.toFixed(2)+'/mo':'—'}</div></div>
      </div>
      <div class="detail-section-head">Deal economics</div>
      <div class="financials-row">
        <div><span>Commissions</span><strong>${v.commissions?'£'+parseFloat(v.commissions).toFixed(2):'—'}</strong></div>
        <div><span>Setup fee</span><strong>${v.setup_fee?'£'+parseFloat(v.setup_fee).toFixed(2):'—'}</strong></div>
        <div><span>Mgmt fee</span><strong>${v.management_fee?'£'+parseFloat(v.management_fee).toFixed(2)+'/mo':'—'}</strong></div>
        <div><span>Other rev</span><strong>${v.other_revenue?'£'+parseFloat(v.other_revenue).toFixed(2):'—'}</strong></div>
        <div><span>Total profit</span><strong class="${profit>0?'profit-pos':profit<0?'profit-neg':''}">${profit?'£'+profit.toFixed(2):'—'}</strong></div>
      </div>
      ${v.notes?`<div class="notes-box">${esc(v.notes)}</div>`:''}
      <div class="action-row">
        <button class="btn btn-recharge" onclick="openVehicleRecord('${v.id}')">Open record</button>
        <button class="btn btn-edit" onclick="openEditVehicle('${v.id}')">✎ Edit</button>
        <button class="btn btn-edit" onclick="openDocs('vehicle','${v.id}',(allVehicles.find(x=>x.id==='${v.id}')||{}).registration)">📎 Documents</button>
        <button class="btn btn-danger" onclick="deleteVehicle('${v.id}')">✗</button>
      </div>
    </div>
  </div>`;
}
// ─── VEHICLE MODAL ───
let editVehicleId=null;
function switchVehicleTab(tab,el){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('vtab-'+tab)?.classList.add('active');
  if(el)el.classList.add('active');
}
function populateVehicleRelationSelects(v={}){
  const clients=allAccounts.filter(a=>a.type==='client'||!a.type);
  const funders=allAccounts.filter(a=>a.type==='funder');
  const dealers=allAccounts.filter(a=>a.type==='dealer');
  const sel=(id,arr,selected,labelField='company_name')=>{const e=document.getElementById(id);if(!e)return;e.innerHTML='<option value="">— select —</option>'+arr.map(x=>`<option value="${x.id}"${x.id===selected?' selected':''}>${esc(x[labelField])}</option>`).join('');};
  sel('vf-account',allAccounts,v.account_id);
  sel('vf-funder',allAccounts.filter(a=>a.type==='funder'||a.type==='client'||!a.type),v.funder_id);
  sel('vf-dealer',allAccounts,v.dealer_id);
  const driverSel=document.getElementById('vf-driver');
  if(driverSel)driverSel.innerHTML='<option value="">— select —</option>'+allContacts.map(c=>`<option value="${c.id}"${c.id===v.driver_id?' selected':''}>${esc(contactDisplayName(c))}${c.employee_number?' (#'+esc(c.employee_number)+')':''}</option>`).join('');
}
function populateVehicleDriverSelect(){
  const driverSel=document.getElementById('vf-driver');if(!driverSel)return;
  const currentVal=driverSel.value;
  driverSel.innerHTML='<option value="">— select —</option>'+allContacts.map(c=>`<option value="${c.id}"${c.id===currentVal?' selected':''}>${esc(contactDisplayName(c))}${c.employee_number?' (#'+esc(c.employee_number)+')':''}</option>`).join('');
}
function openNewVehicle(){
  editVehicleId=null;
  document.getElementById('vehicle-modal-title').textContent='New vehicle';
  clearVehicleForm();
  if(!allAccounts.length)loadAccounts().then(()=>populateVehicleRelationSelects());
  else populateVehicleRelationSelects();
  if(!allContacts.length)loadContacts();
  switchVehicleTab('overview',document.querySelector('.modal-tab'));
  document.getElementById('vehicle-modal').classList.add('open');
  updateVehicleProfitPreview();
}
function openEditVehicle(id){
  const v=allVehicles.find(x=>x.id===id);if(!v)return;editVehicleId=id;
  document.getElementById('vehicle-modal-title').textContent='Edit vehicle — '+esc(v.reg||v.name||'');
  populateVehicleRelationSelects(v);
  // A dropdown keeps a stored value it has no option for (e.g. an "S Tronic"
  // gearbox from a funder quote) instead of blanking it and saving it away.
  const f=(fid,val)=>{const e=document.getElementById(fid);if(!e)return;const v=val??'';
    if(e.tagName==='SELECT'&&v!==''&&![...e.options].some(o=>o.value===String(v))){const o=document.createElement('option');o.value=o.textContent=String(v);e.appendChild(o);}
    e.value=v;};
  // Overview
  f('vf-reg',v.reg);f('vf-name',v.name);f('vf-desc',v.description);f('vf-fqno',v.funders_quote_no);f('vf-cpo',v.covase_po_number);f('vf-lpo',v.legacy_po_number);f('vf-lex',v.lex_900_number);f('vf-source',v.source);f('vf-status',v.status||'active');f('vf-notes',v.notes);f('vf-dynamics',v.dynamics_id);
  // Spec
  f('vf-vtype',v.vehicle_type);f('vf-body',v.body_style);f('vf-doors',v.num_doors);f('vf-make',v.manufacturer);f('vf-model',v.model);f('vf-deriv',v.derivative);f('vf-engsize',v.engine_size);f('vf-engcc',v.engine_cc);f('vf-fuel',v.fuel_type);f('vf-trans',v.transmission);f('vf-evrange',v.ev_range);f('vf-extcol',v.exterior_colour);f('vf-intrim',v.interior_trim);f('vf-chassis',v.chassis_number);f('vf-key',v.key_number);f('vf-p11d',v.p11d_value);f('vf-co2',v.co2_emissions);f('vf-mpg',v.fuel_consumption);f('vf-motheld',String(v.mot_held||false));f('vf-std',v.standard_items);f('vf-opts',v.optional_extras);vfEngineLabel();
  // Contract
  f('vf-term',v.term_months);f('vf-miles',v.annual_mileage);f('vf-profile',v.payment_profile);f('vf-vattype',v.vat_type);f('vf-fundmethod',v.funding_method);f('vf-conttype',v.contract_type);f('vf-finrent',v.finance_rental);f('vf-svcrent',v.service_rental);f('vf-xsmile',v.excess_mileage_ppm);f('vf-otr',v.otr);f('vf-initpay',v.initial_payment);f('vf-finalpay',v.final_payment);f('vf-drivercon',v.driver_contribution);
  // Financials
  f('vf-commissions',v.commissions);f('vf-setupfee',v.setup_fee);f('vf-mgmtfee',v.management_fee);f('vf-otherrev',v.other_revenue);f('vf-costs',v.costs);
  // Dates
  f('vf-d-ordered',v.order_received_date);f('vf-d-proposal',v.proposal_sent_date);f('vf-d-todealer',v.order_to_dealer_date);f('vf-d-confirmed',v.order_confirmed_date);f('vf-d-build',v.build_date_confirmed);f('vf-d-expdeliv',v.expected_delivery_date);f('vf-d-delivered',v.delivery_date);f('vf-d-registered',v.registration_date);f('vf-d-ctsent',v.contracts_sent_date);f('vf-d-ctsigned',v.contracts_signed_date);f('vf-d-sentpay',v.sent_for_payment_date);f('vf-d-paidout',v.paid_out_date);f('vf-d-renewal',v.renewal_date);f('vf-d-dehire',v.de_hire_date);f('vf-d-mot1',v.mot_1_due);f('vf-d-mot2',v.mot_2_due);f('vf-d-motexp',v.mot_expiry);f('vf-d-dcsent',v.driver_card_sent_date);f('vf-d-dcrecd',v.driver_card_received_date);
  switchVehicleTab('overview',document.querySelector('.modal-tab'));
  updateVehicleProfitPreview();
  document.getElementById('vehicle-modal').classList.add('open');
}
function closeVehicleModal(){document.getElementById('vehicle-modal').classList.remove('open');}
function clearVehicleForm(){
  ['vf-reg','vf-name','vf-desc','vf-fqno','vf-cpo','vf-lpo','vf-lex','vf-notes','vf-dynamics','vf-make','vf-model','vf-deriv','vf-engsize','vf-engcc','vf-evrange','vf-extcol','vf-intrim','vf-chassis','vf-key','vf-p11d','vf-co2','vf-mpg','vf-std','vf-opts','vf-term','vf-miles','vf-profile','vf-finrent','vf-svcrent','vf-xsmile','vf-otr','vf-initpay','vf-finalpay','vf-drivercon','vf-commissions','vf-setupfee','vf-mgmtfee','vf-otherrev','vf-costs','vf-d-ordered','vf-d-proposal','vf-d-todealer','vf-d-confirmed','vf-d-build','vf-d-expdeliv','vf-d-delivered','vf-d-registered','vf-d-ctsent','vf-d-ctsigned','vf-d-sentpay','vf-d-paidout','vf-d-renewal','vf-d-dehire','vf-d-mot1','vf-d-mot2','vf-d-motexp','vf-d-dcsent','vf-d-dcrecd'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('vf-status').value='active';document.getElementById('vf-motheld').value='false';
}
function updateVehicleProfitPreview(){
  const comm=parseFloat(document.getElementById('vf-commissions')?.value)||0;
  const setup=parseFloat(document.getElementById('vf-setupfee')?.value)||0;
  const mgmt=parseFloat(document.getElementById('vf-mgmtfee')?.value)||0;
  const term=parseInt(document.getElementById('vf-term')?.value)||0;
  const other=parseFloat(document.getElementById('vf-otherrev')?.value)||0;
  const costs=parseFloat(document.getElementById('vf-costs')?.value)||0;
  const profit=comm+setup+(mgmt*term)+other-costs;
  const el=document.getElementById('vf-profit-preview');
  if(el){el.textContent=profit?'£'+profit.toFixed(2):'£—';el.style.color=profit>0?'var(--tl-green)':profit<0?'var(--tl-orange)':'var(--covase)';}
}
// Wire up profit preview inputs
['vf-commissions','vf-setupfee','vf-mgmtfee','vf-term','vf-otherrev','vf-costs'].forEach(id=>{
  document.addEventListener('input',e=>{if(e.target.id===id)updateVehicleProfitPreview();});
});
function getVehiclePayload(){
  const nd=(id)=>{const e=document.getElementById(id);return e?.value||null};
  const nf=(id)=>{const e=document.getElementById(id);return e?.value?parseFloat(e.value):null};
  const ni=(id)=>{const e=document.getElementById(id);return e?.value?parseInt(e.value):null};
  return{
    account_id:nd('vf-account'),driver_id:nd('vf-driver'),funder_id:nd('vf-funder'),dealer_id:nd('vf-dealer'),
    reg:(document.getElementById('vf-reg')?.value||'').trim().toUpperCase()||null,name:nd('vf-name'),description:nd('vf-desc'),source:nd('vf-source'),funders_quote_no:nd('vf-fqno'),covase_po_number:nd('vf-cpo'),legacy_po_number:nd('vf-lpo'),lex_900_number:nd('vf-lex'),status:nd('vf-status')||'active',notes:nd('vf-notes'),dynamics_id:nd('vf-dynamics'),
    vehicle_type:nd('vf-vtype'),body_style:nd('vf-body'),num_doors:ni('vf-doors'),manufacturer:nd('vf-make'),model:nd('vf-model'),derivative:nd('vf-deriv'),engine_size:nd('vf-engsize'),engine_cc:ni('vf-engcc'),fuel_type:nd('vf-fuel'),transmission:nd('vf-trans'),ev_range:nf('vf-evrange'),exterior_colour:nd('vf-extcol'),interior_trim:nd('vf-intrim'),chassis_number:nd('vf-chassis'),key_number:nd('vf-key'),p11d_value:nf('vf-p11d'),co2_emissions:ni('vf-co2'),fuel_consumption:ni('vf-mpg'),mot_held:document.getElementById('vf-motheld')?.value==='true',standard_items:nd('vf-std'),optional_extras:nd('vf-opts'),
    term_months:ni('vf-term'),annual_mileage:ni('vf-miles'),payment_profile:nd('vf-profile'),vat_type:nd('vf-vattype'),funding_method:nd('vf-fundmethod'),contract_type:nd('vf-conttype'),finance_rental:nf('vf-finrent'),service_rental:nf('vf-svcrent'),excess_mileage_ppm:nf('vf-xsmile'),otr:nf('vf-otr'),initial_payment:nf('vf-initpay'),final_payment:nf('vf-finalpay'),driver_contribution:nf('vf-drivercon'),
    commissions:nf('vf-commissions'),setup_fee:nf('vf-setupfee'),management_fee:nf('vf-mgmtfee'),other_revenue:nf('vf-otherrev'),costs:nf('vf-costs'),
    order_received_date:nd('vf-d-ordered'),proposal_sent_date:nd('vf-d-proposal'),order_to_dealer_date:nd('vf-d-todealer'),order_confirmed_date:nd('vf-d-confirmed'),build_date_confirmed:nd('vf-d-build'),expected_delivery_date:nd('vf-d-expdeliv'),delivery_date:nd('vf-d-delivered'),registration_date:nd('vf-d-registered'),contracts_sent_date:nd('vf-d-ctsent'),contracts_signed_date:nd('vf-d-ctsigned'),sent_for_payment_date:nd('vf-d-sentpay'),paid_out_date:nd('vf-d-paidout'),renewal_date:nd('vf-d-renewal'),de_hire_date:nd('vf-d-dehire'),mot_1_due:nd('vf-d-mot1'),mot_2_due:nd('vf-d-mot2'),mot_expiry:nd('vf-d-motexp'),driver_card_sent_date:nd('vf-d-dcsent'),driver_card_received_date:nd('vf-d-dcrecd'),
    updated_at:new Date().toISOString()
  };
}
// "Engine size" reads "Battery size" for electric vehicles (same field).
function vfEngineLabel(){const l=document.getElementById('vf-engsize-label');if(l)l.textContent=document.getElementById('vf-fuel')?.value==='Electric'?'Battery size':'Engine size';}
async function saveVehicle(){
  const payload=getVehiclePayload();
  try{
    if(editVehicleId){await sbReq(`covase_vehicles?id=eq.${encodeURIComponent(editVehicleId)}`,{method:'PATCH',body:payload,prefer:'return=minimal'});const idx=allVehicles.findIndex(x=>x.id===editVehicleId);if(idx>=0)allVehicles[idx]={...allVehicles[idx],...payload};toast('Vehicle updated','success');}
    else{const res=await sbReq('covase_vehicles',{method:'POST',body:{...payload,id:'veh-'+Date.now()}});allVehicles.unshift(Array.isArray(res)?res[0]:res||{...payload,id:'veh-'+Date.now()});toast('Vehicle saved','success');}
    closeVehicleModal();updateVehicleStats();renderVehicles();
  }catch(e){toast('Save failed: '+e.message,'error');}
}
async function deleteVehicle(id){if(!confirm('Remove this vehicle? Cannot be undone.'))return;try{await sbReq(`covase_vehicles?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',prefer:'return=minimal'});allVehicles=allVehicles.filter(x=>x.id!==id);updateVehicleStats();renderVehicles();toast('Vehicle removed','success');}catch(e){toast('Delete failed: '+e.message,'error');}}

// ─── SHARED ───
function toggleCard(id){document.getElementById(id)?.classList.toggle('expanded');}
function updateBadges(){
  // Optional-chain everything so a removed/renamed sidebar badge can't kill rendering downstream
  const setBadge=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=String(n||0);};
  setBadge('badge-pending',(allInvoices||[]).filter(i=>i.status==='pending').length);
  setBadge('badge-pending-recharge',(allHires||[]).filter(h=>h.billing_status==='invoiced-in'&&!h.outgoing_invoice_id).length);
  // Badges owned by per-module stats functions, repeated here from the caches so
  // a sidebar re-render (which recreates badge elements) can always restore them
  setBadge('badge-movements',(typeof allMovements!=='undefined'?(allMovements||[]):[]).filter(m=>!['paid','cancelled'].includes(m.movement_status)).length);
  setBadge('badge-accounts',(allAccounts||[]).filter(a=>(a.type||'client')==='client'&&a.status==='active').length);
  setBadge('badge-contacts',(typeof allContacts!=='undefined'?(allContacts||[]):[]).filter(c=>c.employee_status==='employed').length);
  setBadge('badge-vehicles',(typeof allVehicles!=='undefined'?(allVehicles||[]):[]).filter(v=>v.status==='active').length);
  setBadge('badge-claims',(typeof allClaims!=='undefined'?(allClaims||[]):[]).filter(c=>{try{return claimOpen(c);}catch(e){return false;}}).length);
  setBadge('badge-fines',(typeof allFines!=='undefined'?(allFines||[]):[]).filter(f=>f.status==='new').length);
  setBadge('badge-supplier-replies',(typeof allSupplierReplies!=='undefined'?(allSupplierReplies||[]):[]).length);
  updatePipelineBadge();
}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast(msg,type=''){const t=document.getElementById('toast');t.textContent=msg;t.className=`toast ${type} show`;setTimeout(()=>t.classList.remove('show'),3000);}

// Close modals on backdrop click
['hire-modal','movement-modal','account-modal','contact-modal','vehicle-modal','send-supplier-modal','email-template-modal','thread-modal','agent-modal','reply-modal','rp-overlay'].forEach(id=>{
  document.getElementById(id)?.addEventListener('click',e=>{
    if(e.target===e.currentTarget){
      if(id==='hire-modal')closeHireModal();
      else if(id==='account-modal')closeAccountModal();
      else if(id==='contact-modal')closeContactModal();
      else if(id==='vehicle-modal')closeVehicleModal();
      else if(id==='send-supplier-modal')closeSendSupplier();
      else if(id==='email-template-modal')closeEmailTemplate();
      else if(id==='thread-modal')closeThread();
      else if(id==='agent-modal')closeAgentInstructions();
      else if(id==='reply-modal')closeReplyModal();
      else closeRechargePicker();
    }
  });
});

