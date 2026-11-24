// ─── USERS + ACCOUNT (logins-plan.md step 2) ───
// Account chip at the top of ⚙ Settings (sign in / out, change password).
// Users screen (admins only): add people, choose their modules, reset
// passwords, switch accounts off. Accounts are created and passwords set by the
// n8n "Covase — User Admin" workflow (service key, checks the caller is an
// admin); modules and role are plain profile updates allowed to admins by RLS.
// Module ticks hide sidebar items and block opening those screens — screen
// level, not data level (per-module data rules can come later).

// ── Account chip ──
function covaseRenderAccountChip(){
  const panel=document.getElementById('config-panel');if(!panel)return;
  let el=document.getElementById('auth-chip');
  if(!el){el=document.createElement('div');el.id='auth-chip';el.className='auth-chip';panel.insertBefore(el,panel.firstChild);}
  const me=window.covaseMe;
  el.innerHTML=me
    ?`<div>Signed in as <strong>${esc(me.full_name||me.email)}</strong>${me.role==='admin'?' · admin':''}</div><div class="auth-chip-links"><a onclick="openChangePassword()">Change password</a> · <a onclick="covaseSignOut()">Sign out</a></div>`
    :`<div>Not signed in</div><div class="auth-chip-links"><a onclick="covaseShowLogin()">Sign in</a></div>`;
}

lsInjectModal('pw-modal',`
  <div class="modal-header"><div class="modal-title">Change your password</div><button class="modal-close" onclick="document.getElementById('pw-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body">
    <div class="form-field"><label>New password (10+ characters)</label><input type="password" id="pw-new" autocomplete="new-password"></div>
    <div class="form-field"><label>New password again</label><input type="password" id="pw-new2" autocomplete="new-password"></div>
  </div>
  <div class="modal-footer"><button class="btn-secondary-modal" onclick="document.getElementById('pw-modal').classList.remove('open')">Cancel</button><button class="btn-primary-modal" onclick="saveMyPassword()">Change password</button></div>`);
function openChangePassword(){['pw-new','pw-new2'].forEach(id=>document.getElementById(id).value='');document.getElementById('pw-modal').classList.add('open');}
async function saveMyPassword(){
  const a=document.getElementById('pw-new').value,b=document.getElementById('pw-new2').value;
  if(a.length<10){toast('At least 10 characters','error');return;}if(a!==b){toast('The two passwords don\'t match','error');return;}
  try{await covaseAuthWait();const {url,key}=covaseAuthBase();
    const r=await fetch(url+'/auth/v1/user',{method:'PUT',headers:{apikey:key,Authorization:'Bearer '+covaseAuthToken(),'Content-Type':'application/json'},body:JSON.stringify({password:a})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.msg||j.error_description||j.error||('HTTP '+r.status));
    document.getElementById('pw-modal').classList.remove('open');toast('Password changed','success');}
  catch(e){toast('Couldn\'t change it: '+e.message,'error');}
}

// ── Screen gating ──
{const _showView=showView;showView=function(id,el){
  if(typeof SB_ITEMS!=='undefined'&&SB_ITEMS[id]&&!covaseCanSee(id)){toast('You don\'t have access to that part of Covase Tools','error');return;}
  return _showView.apply(this,arguments);
};}

// ── Users screen ──
let usrRows=[],usrEdit=null;
function usrModuleList(){
  // Sidebar items grouped as in the standard layout; buttons/disabled/Users itself left out.
  const used=new Set(),groups=[];
  (DEFAULT_SB_LAYOUT.sections||[]).forEach(sec=>{
    const items=sec.items.filter(k=>SB_ITEMS[k]&&!SB_ITEMS[k].button&&!SB_ITEMS[k].disabled&&k!=='users');
    items.forEach(k=>used.add(k));if(items.length)groups.push([sec.label,items]);
  });
  const rest=Object.keys(SB_ITEMS).filter(k=>!used.has(k)&&!SB_ITEMS[k].button&&!SB_ITEMS[k].disabled&&k!=='users');
  if(rest.length)groups.push(['Other',rest]);
  return groups;
}
function usrModuleTicks(sel){
  const all=!Array.isArray(sel);
  return `<label class="usr-all"><input type="checkbox" id="usr-all" ${all?'checked':''} onchange="document.getElementById('usr-mods').style.display=this.checked?'none':''"> Everything (including new modules as they're added)</label>
  <div id="usr-mods" class="usr-mods" style="${all?'display:none':''}">${usrModuleList().map(([g,items])=>`<div class="usr-group"><div class="usr-group-label">${esc(g)}</div>${items.map(k=>`<label><input type="checkbox" class="usr-mod" value="${esc(k)}" ${!all&&sel.includes(k)?'checked':''}> ${SB_ITEMS[k].icon||''} ${esc(SB_ITEMS[k].label)}</label>`).join('')}</div>`).join('')}</div>`;
}
function usrReadModules(){if(document.getElementById('usr-all').checked)return null;return [...document.querySelectorAll('.usr-mod:checked')].map(x=>x.value);}

lsInjectView('view-users',`
  <div class="topbar"><h1>Users</h1>
    <button class="topbar-btn" onclick="usrShareKeys()" title="Copy this computer's map, mileage and address-lookup keys to everyone">🔑 Share this computer's keys</button>
    <button class="topbar-btn" onclick="loadUsers()">↻ Refresh</button>
    <button class="topbar-btn primary" onclick="openUserModal()">+ Add user</button></div>
  <div class="content" style="max-width:1000px"><div id="usr-list"><div class="loading">Loading…</div></div></div>`);

async function loadUsers(){
  const el=document.getElementById('usr-list');if(!el)return;
  if(!window.covaseMe||window.covaseMe.role!=='admin'){el.innerHTML='<div class="empty-state"><div class="empty-title">Admins only</div><div class="empty-sub">Sign in as an admin to manage users.</div></div>';return;}
  try{
    usrRows=await sbReq('covase_profiles?select=*&order=full_name.asc.nullslast');
    el.innerHTML=`<table class="usr-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Can see</th><th></th></tr></thead><tbody>${usrRows.map(u=>`<tr class="${u.active?'':'usr-off'}">
      <td>${esc(u.full_name||'—')}</td><td>${esc(u.email)}</td><td>${u.role==='admin'?'Admin':'User'}</td>
      <td>${!Array.isArray(u.modules)?'Everything':esc(u.modules.map(k=>SB_ITEMS[k]?SB_ITEMS[k].label:k).join(', ')||'Nothing')}${u.active?'':' · <strong>switched off</strong>'}</td>
      <td class="usr-acts"><button class="btn btn-edit" onclick="openUserModal('${esc(u.user_id)}')">Edit</button><button class="btn btn-edit" onclick="openUserPw('${esc(u.user_id)}')">Reset password</button>${u.user_id===(window.covaseMe||{}).user_id?'':`<button class="btn ${u.active?'btn-danger':'btn-edit'}" onclick="usrSetActive('${esc(u.user_id)}',${!u.active})">${u.active?'Switch off':'Switch on'}</button>`}</td></tr>`).join('')}</tbody></table>`;
  }catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-title">Couldn't load users</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}

lsInjectModal('usr-modal',`
  <div class="modal-header"><div class="modal-title" id="usr-title">Add user</div><button class="modal-close" onclick="document.getElementById('usr-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body">
    <div class="form-row"><div class="form-field"><label>Name</label><input id="usr-name"></div><div class="form-field"><label>Work email</label><input id="usr-email" type="email"></div></div>
    <div class="form-row"><div class="form-field" id="usr-pw-wrap"><label>Starting password (tell them; they can change it)</label><div style="display:flex;gap:6px"><input id="usr-pw" style="flex:1"><button class="btn btn-edit" onclick="document.getElementById('usr-pw').value=usrMakePassword()">Make one</button></div></div>
      <div class="form-field"><label>Role</label><select id="usr-role"><option value="user">User</option><option value="admin">Admin (sees everything, manages users)</option></select></div></div>
    <div class="form-section-label">Which parts of Covase Tools they can use</div>
    <div id="usr-ticks"></div>
  </div>
  <div class="modal-footer"><button class="btn-secondary-modal" onclick="document.getElementById('usr-modal').classList.remove('open')">Cancel</button><button class="btn-primary-modal" id="usr-save" onclick="saveUser()">Save</button></div>`,true);

function usrMakePassword(){const c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';const a=new Uint32Array(14);crypto.getRandomValues(a);return [...a].map(n=>c[n%c.length]).join('');}
function openUserModal(id){
  const u=id?usrRows.find(x=>x.user_id===id):null;usrEdit=u?u.user_id:null;
  document.getElementById('usr-title').textContent=u?'Edit '+(u.full_name||u.email):'Add user';
  document.getElementById('usr-name').value=u?u.full_name||'':'';
  const em=document.getElementById('usr-email');em.value=u?u.email:'';em.disabled=!!u;
  document.getElementById('usr-pw-wrap').style.display=u?'none':'';document.getElementById('usr-pw').value=u?'':usrMakePassword();
  document.getElementById('usr-role').value=u?u.role:'user';
  document.getElementById('usr-ticks').innerHTML=usrModuleTicks(u?u.modules:null);
  document.getElementById('usr-modal').classList.add('open');
}
async function usrHook(body){
  await covaseAuthWait();
  const r=await fetch(COVASE_USER_ADMIN_HOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,token:covaseAuthToken()})});
  if(r.status===404)throw new Error('the user admin workflow is not switched on in n8n yet');
  const j=await r.json().catch(()=>({}));if(!j.ok)throw new Error(j.error||('HTTP '+r.status));return j;
}
async function saveUser(){
  const name=document.getElementById('usr-name').value.trim(),role=document.getElementById('usr-role').value,modules=usrReadModules();
  if(Array.isArray(modules)&&!modules.length&&role!=='admin'&&!confirm('No modules ticked — they will be able to sign in but see nothing. Carry on?'))return;
  const b=document.getElementById('usr-save');b.disabled=true;
  try{
    if(usrEdit){
      if(usrEdit===(window.covaseMe||{}).user_id&&role!=='admin'){toast('You can\'t remove your own admin role','error');return;}
      await sbReq('covase_profiles?user_id=eq.'+encodeURIComponent(usrEdit),{method:'PATCH',body:{full_name:name||null,role,modules,updated_at:new Date().toISOString()},prefer:'return=minimal'});
      toast('Saved — applies next time they open Covase Tools','success');
    }else{
      const email=document.getElementById('usr-email').value.trim(),pw=document.getElementById('usr-pw').value;
      await usrHook({action:'create',full_name:name,email,password:pw,role,modules});
      toast('Account created for '+email+' — give them their starting password','success');
    }
    document.getElementById('usr-modal').classList.remove('open');loadUsers();
  }catch(e){toast('Couldn\'t save: '+e.message,'error');}
  finally{b.disabled=false;}
}
lsInjectModal('usr-pw-modal',`
  <div class="modal-header"><div class="modal-title" id="usr-pw-title">Reset password</div><button class="modal-close" onclick="document.getElementById('usr-pw-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body"><div class="form-field"><label>New password (tell them; they can change it)</label><div style="display:flex;gap:6px"><input id="usr-pw2" style="flex:1"><button class="btn btn-edit" onclick="document.getElementById('usr-pw2').value=usrMakePassword()">Make one</button></div></div></div>
  <div class="modal-footer"><button class="btn-secondary-modal" onclick="document.getElementById('usr-pw-modal').classList.remove('open')">Cancel</button><button class="btn-primary-modal" onclick="saveUserPw()">Set password</button></div>`);
function openUserPw(id){usrEdit=id;const u=usrRows.find(x=>x.user_id===id)||{};document.getElementById('usr-pw-title').textContent='Reset password — '+(u.full_name||u.email||'');document.getElementById('usr-pw2').value=usrMakePassword();document.getElementById('usr-pw-modal').classList.add('open');}
async function saveUserPw(){
  try{await usrHook({action:'set_password',user_id:usrEdit,password:document.getElementById('usr-pw2').value});document.getElementById('usr-pw-modal').classList.remove('open');toast('Password set — let them know','success');}
  catch(e){toast('Couldn\'t set it: '+e.message,'error');}
}
async function usrSetActive(id,active){
  const u=usrRows.find(x=>x.user_id===id)||{};
  if(!confirm((active?'Switch on ':'Switch off ')+(u.full_name||u.email)+'?'+(active?'':' They will be signed out and unable to sign in.')))return;
  try{await usrHook({action:'set_active',user_id:id,active});toast(active?'Switched on':'Switched off','success');loadUsers();}
  catch(e){toast('Failed: '+e.message,'error');}
}
async function usrShareKeys(){
  const v={};Object.entries(COVASE_KEY_MAP).forEach(([k,ls])=>{const x=localStorage.getItem(ls);if(x)v[k]=x;});
  if(!Object.keys(v).length){toast('This computer has no map/mileage/address keys set','error');return;}
  if(!confirm('Share this computer\'s keys ('+Object.keys(v).join(', ')+') with everyone who signs in?'))return;
  try{await sbReq('covase_app_settings',{method:'POST',body:{key:'browser_keys',value:v,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});toast('Shared — other computers pick them up when they sign in','success');}
  catch(e){toast('Couldn\'t share: '+e.message,'error');}
}

window.EXTRA_VIEW_LOADERS=Object.assign(window.EXTRA_VIEW_LOADERS||{},{users:loadUsers});
covaseRenderAccountChip();
