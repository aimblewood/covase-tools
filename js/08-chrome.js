// ─── EDIT MODE: click any element to style it (overrides shared via
// covase_config key 'font_overrides'; injected as !important CSS so they win
// over inline styles). Selectors are class-based, so styling one kanban title
// styles them all — the popover shows how many elements a rule hits. ───
let feMode=false,feOverrides={},feTargetSel=null,feSaveTimer=null;
const FE_STATE_CLASSES=['active','open','disabled','cancelled','selected','pal','lbl','mvcd-over','mvkan-over','fe-hi'];
function feStyleTag(){let t=document.getElementById('fe-style');if(!t){t=document.createElement('style');t.id='fe-style';document.head.appendChild(t);}return t;}
function feBuildCss(){
  feStyleTag().textContent=Object.entries(feOverrides).map(([sel,o])=>{
    const d=[];
    if(o.family)d.push("font-family:'"+o.family+"',sans-serif !important");
    if(o.size)d.push('font-size:'+o.size+'px !important');
    if(o.weight)d.push('font-weight:'+o.weight+' !important');
    if(o.italic)d.push('font-style:italic !important');
    if(o.color)d.push('color:'+o.color+' !important');
    return d.length?sel+'{'+d.join(';')+'}':'';
  }).filter(Boolean).join('\n');
}
async function loadFontOverrides(){
  try{
    const rows=await sbReq('covase_config?key=eq.font_overrides&select=value');
    const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;
    if(v&&typeof v==='object'){feOverrides=v;feBuildCss();ftEnsureFonts(Object.values(v).map(o=>o.family));}
  }catch(e){}
}
function feSaveSoon(){
  clearTimeout(feSaveTimer);
  feSaveTimer=setTimeout(async()=>{
    try{await sbReq('covase_config',{method:'POST',body:{key:'font_overrides',value:feOverrides,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});}
    catch(e){toast('Style save failed: '+e.message,'error');}
  },700);
}
// Derive a stable, class-based selector for the clicked element
function feSelectorFor(el){
  let node=el;
  while(node&&node!==document.body){
    if(node.classList&&node.classList.length){
      const cls=[...node.classList].filter(c=>!FE_STATE_CLASSES.includes(c)&&!/^bill-/.test(c)&&!/^mvcal-(quoted|booked|in_progress|completed_pending_fuel|invoiced|paid|cancelled|today|empty)$/.test(c)&&!/^stat-(covase|indigo|orange|green|purple|red)$/.test(c));
      if(cls.length)return node.tagName.toLowerCase()+'.'+cls.join('.');
    }
    if(node.id&&!/^(badge-|gf-|fe-)/.test(node.id))return '#'+node.id;
    node=node.parentElement;
  }
  return null;
}
function toggleEditMode(){
  feMode=!feMode;
  const bar=document.getElementById('fe-bar');if(bar)bar.style.display=feMode?'flex':'none';
  if(!feMode)feClosePop();
  const cp=document.getElementById('config-panel');if(cp)cp.classList.remove('open');
  document.querySelectorAll('.fe-hi').forEach(x=>x.classList.remove('fe-hi'));
}
function feClosePop(){const p=document.getElementById('fe-pop');if(p)p.style.display='none';feTargetSel=null;}
function feOpenPop(x,y,sel){
  feTargetSel=sel;
  const o=feOverrides[sel]||{};
  const fam=document.getElementById('fe-family');
  if(fam&&fam.options.length<2)fam.innerHTML='<option value="">— inherit —</option>'+FT_FONTS.map(f=>'<option value="'+esc(f)+'">'+esc(f)+'</option>').join('');
  const setv=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
  if(o.family&&FT_FONTS.includes(o.family)){setv('fe-family',o.family);setv('fe-family-custom','');}
  else{setv('fe-family','');setv('fe-family-custom',o.family||'');}
  setv('fe-size',o.size||'');setv('fe-weight',o.weight||'');
  document.getElementById('fe-italic').checked=!!o.italic;
  document.getElementById('fe-color-on').checked=!!o.color;
  if(o.color)setv('fe-color',o.color);
  const n=(()=>{try{return document.querySelectorAll(sel).length;}catch(e){return '?';}})();
  document.getElementById('fe-target').textContent='Applies to: '+sel+' · '+n+' element'+(n===1?'':'s');
  const p=document.getElementById('fe-pop');
  p.style.display='block';
  p.style.left=Math.min(x,window.innerWidth-270)+'px';
  p.style.top=Math.min(y+10,window.innerHeight-260)+'px';
}
function feApply(){
  if(!feTargetSel)return;
  const custom=(document.getElementById('fe-family-custom').value||'').trim();
  const o={
    family:custom||document.getElementById('fe-family').value||null,
    size:parseInt(document.getElementById('fe-size').value,10)||null,
    weight:document.getElementById('fe-weight').value||null,
    italic:document.getElementById('fe-italic').checked||null,
    color:document.getElementById('fe-color-on').checked?document.getElementById('fe-color').value:null
  };
  Object.keys(o).forEach(k=>{if(!o[k])delete o[k];});
  if(Object.keys(o).length)feOverrides[feTargetSel]=o;else delete feOverrides[feTargetSel];
  if(o.family)ftEnsureFonts([o.family]);
  feBuildCss();feSaveSoon();
}
function feRemove(){if(!feTargetSel)return;delete feOverrides[feTargetSel];feBuildCss();feSaveSoon();feClosePop();toast('Style removed','success');}
function initEditMode(){
  document.addEventListener('mouseover',e=>{
    if(!feMode)return;
    if(e.target.closest('#fe-pop,#fe-bar'))return;
    document.querySelectorAll('.fe-hi').forEach(x=>x.classList.remove('fe-hi'));
    if(e.target!==document.body)e.target.classList.add('fe-hi');
  },true);
  document.addEventListener('click',e=>{
    if(!feMode)return;
    if(e.target.closest('#fe-pop,#fe-bar'))return;
    e.preventDefault();e.stopPropagation();
    const sel=feSelectorFor(e.target);
    if(!sel){toast('Could not identify that element','error');return;}
    feOpenPop(e.clientX,e.clientY,sel);
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&feMode)toggleEditMode();});
}

// ─── FONTS & APPEARANCE (shared via covase_config key 'app_theme') ───
const FT_FONTS=['Outfit','DM Sans','Inter','Roboto','Open Sans','Lato','Montserrat','Poppins','Nunito','Raleway','Work Sans','Source Sans 3','IBM Plex Sans','Manrope','Space Grotesk','Karla','Rubik','Figtree','Lexend','Plus Jakarta Sans'];
const DEFAULT_THEME={head:'Outfit',body:'DM Sans',scale:100};
let appTheme={...DEFAULT_THEME};
function ftNormalize(t){
  const x=t&&typeof t==='object'?t:{};
  return {head:String(x.head||DEFAULT_THEME.head).trim(),body:String(x.body||DEFAULT_THEME.body).trim(),scale:Math.min(130,Math.max(80,parseInt(x.scale,10)||100))};
}
// Load a Google Fonts stylesheet for any families not already loaded
function ftEnsureFonts(fams){
  const need=[...new Set(fams.filter(Boolean))];
  need.forEach(f=>{
    const id='gf-'+f.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    if(document.getElementById(id))return;
    const l=document.createElement('link');
    l.id=id;l.rel='stylesheet';
    l.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(f).replace(/%20/g,'+')+':wght@300;400;500;600;700;800&display=swap';
    document.head.appendChild(l);
  });
}
function applyTheme(t){
  appTheme=ftNormalize(t);
  ftEnsureFonts([appTheme.head,appTheme.body]);
  const r=document.documentElement.style;
  r.setProperty('--font-head',"'"+appTheme.head+"',sans-serif");
  r.setProperty('--font-body',"'"+appTheme.body+"',sans-serif");
  document.body.style.zoom=appTheme.scale===100?'':String(appTheme.scale/100);
}
async function loadTheme(){
  try{
    const rows=await sbReq('covase_config?key=eq.app_theme&select=value');
    const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;
    if(v)applyTheme(v);
  }catch(e){/* keep defaults */}
}
function ftSelValue(sel,custom){const c=(document.getElementById(custom)?.value||'').trim();return c||document.getElementById(sel)?.value||'';}
function openFontEditor(){
  ['ft-head','ft-body'].forEach(id=>{
    const s=document.getElementById(id);
    if(s&&s.options.length<2)s.innerHTML=FT_FONTS.map(f=>'<option value="'+esc(f)+'">'+esc(f)+'</option>').join('');
  });
  const setSel=(id,cid,val)=>{const s=document.getElementById(id),c=document.getElementById(cid);if(FT_FONTS.includes(val)){s.value=val;c.value='';}else{s.value=FT_FONTS[0];c.value=val;}};
  setSel('ft-head','ft-head-custom',appTheme.head);
  setSel('ft-body','ft-body-custom',appTheme.body);
  document.getElementById('ft-scale').value=String(appTheme.scale);
  const cp=document.getElementById('config-panel');if(cp)cp.classList.remove('open');
  document.getElementById('font-editor-modal').classList.add('open');
  ftPreview();
}
function closeFontEditor(){document.getElementById('font-editor-modal').classList.remove('open');}
function ftResetDefault(){document.getElementById('ft-head').value=DEFAULT_THEME.head;document.getElementById('ft-head-custom').value='';document.getElementById('ft-body').value=DEFAULT_THEME.body;document.getElementById('ft-body-custom').value='';document.getElementById('ft-scale').value='100';ftPreview();}
function ftPreview(){
  const head=ftSelValue('ft-head','ft-head-custom'),body=ftSelValue('ft-body','ft-body-custom');
  ftEnsureFonts([head,body]);
  const ph=document.getElementById('ft-prev-head'),pb=document.getElementById('ft-prev-body');
  const scale=(parseInt(document.getElementById('ft-scale')?.value,10)||100)/100;
  if(ph){ph.style.fontFamily="'"+head+"',sans-serif";ph.style.fontSize=(17*scale)+'px';}
  if(pb){pb.style.fontFamily="'"+body+"',sans-serif";pb.style.fontSize=(13*scale)+'px';}
}
async function saveFontTheme(){
  const t=ftNormalize({head:ftSelValue('ft-head','ft-head-custom'),body:ftSelValue('ft-body','ft-body-custom'),scale:document.getElementById('ft-scale').value});
  applyTheme(t);
  try{
    await sbReq('covase_config',{method:'POST',body:{key:'app_theme',value:t,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});
    toast('Appearance saved — applies for everyone','success');closeFontEditor();
  }catch(e){toast('Save failed: '+e.message+' (is covase_config applied?)','error');}
}

// ─── REALTIME: Supabase pushes table changes over a websocket; each change
// debounce-reloads the affected module, so every open browser stays current —
// n8n inserts, imports, and colleagues' edits appear within ~a second. ───
const RT_TABLES={
  covase_hires:()=>{hiresLoaded=false;loadHires();},
  covase_movements:()=>loadMovements(),
  covase_claims:()=>loadClaims(),
  covase_fines:()=>loadFines(),
  covase_supplier_replies:()=>loadSupplierReplies(),
  covase_invoices:()=>{loadInvoices();loadOutgoing();},
  covase_accounts:()=>loadAccounts(),
  covase_contacts:()=>loadContacts(),
  covase_vehicles:()=>loadVehicles(),
  covase_config:()=>{loadBookingTemplate();loadAgentInstructions();loadMovementCardLayout();loadHireCardLayout();loadFineCardLayout();loadSidebarLayout();loadTheme();loadFontOverrides();loadFineTemplates();loadFineDash();loadMovementTemplate();loadOffhireTemplate();}
};
let _rtTimers={};
function rtIndicator(on,msg){
  const el=document.getElementById('rt-live');if(!el)return;
  el.textContent=(on?'● ':'○ ')+(msg||(on?'Live — updates apply instantly':'Live updates off'));
  el.style.color=on?'#03d3c6':'rgba(255,255,255,.35)';
}
async function initRealtime(){
  const c=getConfig();
  if(!c.url||!c.key){rtIndicator(false,'Live updates off — no Supabase config');return;}
  try{
    await new Promise((res,rej)=>{
      if(window.supabase)return res();
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload=res;s.onerror=()=>rej(new Error('lib load failed'));
      document.head.appendChild(s);
    });
  }catch(e){rtIndicator(false,'Live updates unavailable (script blocked)');return;}
  try{
    const client=window.supabase.createClient(c.url,c.key);
    const ch=client.channel('orbis-live');
    Object.keys(RT_TABLES).forEach(t=>{
      ch.on('postgres_changes',{event:'*',schema:'public',table:t},()=>{
        clearTimeout(_rtTimers[t]);
        _rtTimers[t]=setTimeout(()=>{try{RT_TABLES[t]();}catch(e){}},900);
      });
    });
    ch.subscribe(status=>{rtIndicator(status==='SUBSCRIBED',status==='SUBSCRIBED'?null:'Live updates: '+String(status).toLowerCase());});
  }catch(e){rtIndicator(false);}
}

// ─── SIDEBAR ORGANISER (layout shared via covase_config key 'sidebar_layout') ───
const SB_ITEMS={
  'received':{icon:'↓',label:'Received invoices',view:'received',badge:'badge-pending'},
  'outgoing':{icon:'↑',label:'Outgoing invoices',view:'outgoing'},
  'new-invoice':{button:true,label:'+ New invoice',action:'openGenerator()'},
  'hires-pipeline':{icon:'🚗',label:'Bookings',view:'hires-pipeline',badge:'badge-pipeline'},
  'hires-recharge':{icon:'↑',label:'Pending recharge',view:'hires-recharge',badge:'badge-pending-recharge',badgeCls:'purple'},
  'movements':{icon:'🚛',label:'Movements',view:'movements',badge:'badge-movements'},
  'claims':{icon:'🚨',label:'Claims',view:'claims',badge:'badge-claims'},
  'fines':{icon:'🎫',label:'Fines & penalties',view:'fines',badge:'badge-fines'},
  'supplier-replies':{icon:'✉',label:'Review queue',view:'supplier-replies',badge:'badge-supplier-replies',badgeCls:'purple'},
  'accounts':{icon:'◉',label:'Accounts',view:'accounts',badge:'badge-accounts'},
  'contacts':{icon:'👤',label:'Contacts',view:'contacts',badge:'badge-contacts'},
  'vehicles':{icon:'🚙',label:'Vehicles',view:'vehicles',badge:'badge-vehicles'},
  'orders':{icon:'📝',label:'Orders',view:'orders',badge:'badge-orders',home:'accounts'},
  'fleet':{icon:'🛣',label:'Lease fleet',view:'fleet',badge:'badge-fleet',home:'vehicles'},
  'crm-dashboard':{icon:'📊',label:'CRM dashboard',view:'crm-dashboard',home:'accounts'},
  'reconciliation':{icon:'⟷',label:'Reconciliation',disabled:true},
  'sage':{icon:'◎',label:'Sage',disabled:true},
  'gocardless':{icon:'◉',label:'GoCardless',disabled:true}
};
const DEFAULT_SB_LAYOUT={sections:[
  {label:'Billing',items:['received','outgoing','new-invoice']},
  {label:'Short Hires',items:['hires-pipeline','hires-recharge']},
  {label:'Logistics',items:['movements']},
  {label:'Accident management',items:['claims']},
  {label:'Fines & penalties',items:['fines']},
  {label:'Supplier replies',items:['supplier-replies']},
  {label:'CRM',items:['crm-dashboard','orders','accounts','contacts']},
  {label:'Fleet',items:['fleet','vehicles']},
  {label:'Reports',items:['reconciliation']},
  {label:'Integrations',items:['sage','gocardless']}
],hidden:[]};
let sbLayout=null,sboDraft=null,sbDrag=null;
// Normalise any saved shape; unknown keys dropped, new modules auto-appended.
function sbCloneLayout(src){
  const s=src||{};
  const sections=Array.isArray(s.sections)&&s.sections.length
    ?s.sections.map(x=>({label:String(x.label||''),items:Array.isArray(x.items)?x.items.filter(k=>SB_ITEMS[k]):[]}))
    :DEFAULT_SB_LAYOUT.sections.map(x=>({label:x.label,items:x.items.slice()}));
  let hidden=Array.isArray(s.hidden)?s.hidden.filter(k=>SB_ITEMS[k]):[];
  // dedupe (first occurrence wins), then append any catalog keys not present
  const used=new Set();
  sections.forEach(x=>{x.items=x.items.filter(k=>{if(used.has(k))return false;used.add(k);return true;});});
  hidden=hidden.filter(k=>{if(used.has(k))return false;used.add(k);return true;});
  // new modules with a `home` join the section that holds their home item
  // (a saved layout otherwise drops them into "Other")
  Object.keys(SB_ITEMS).filter(k=>!used.has(k)&&SB_ITEMS[k].home).forEach(k=>{
    const sec=sections.find(x=>x.items.includes(SB_ITEMS[k].home));
    if(sec){sec.items.splice(sec.items.indexOf(SB_ITEMS[k].home),0,k);used.add(k);}
  });
  const missing=Object.keys(SB_ITEMS).filter(k=>!used.has(k));
  if(missing.length){
    let other=sections.find(x=>x.label==='Other');
    if(!other){other={label:'Other',items:[]};sections.push(other);}
    other.items.push(...missing);
  }
  return {sections:sections,hidden:hidden};
}
async function loadSidebarLayout(){
  try{
    const rows=await sbReq('covase_config?key=eq.sidebar_layout&select=value');
    const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;
    sbLayout=sbCloneLayout(v);
  }catch(e){sbLayout=sbCloneLayout(null);}
  renderSidebar();
}
function renderSidebar(){
  const nav=document.querySelector('.sb-nav');if(!nav||!sbLayout)return;
  const cur=window._sbCurrentView||'hires-pipeline';
  const secs=sbLayout.sections.map(sec=>{
    const items=sec.items.filter(k=>!sbLayout.hidden.includes(k));
    if(!items.length)return '';
    const inner=items.map(k=>{
      const it=SB_ITEMS[k];if(!it)return '';
      if(it.button)return '<button class="sb-new-btn" onclick="'+it.action+'">'+esc(it.label)+'</button>';
      if(it.disabled)return '<div class="sb-item disabled" title="Coming soon"><span class="icon">'+it.icon+'</span> '+esc(it.label)+'</div>';
      return '<div class="sb-item'+(it.view===cur?' active':'')+'" data-view="'+esc(it.view)+'" onclick="window._sbCurrentView=\''+it.view+'\';showView(\''+it.view+'\',this)"><span class="icon">'+it.icon+'</span> '+esc(it.label)
        +(it.badge?' <span class="sb-badge'+(it.badgeCls?' '+it.badgeCls:'')+'" id="'+it.badge+'">—</span>':'')+'</div>';
    }).join('');
    return '<div class="sb-section"><div class="sb-section-label">'+esc(sec.label)+'</div>'+inner+'</div>';
  }).filter(Boolean);
  nav.innerHTML=secs.join('<div class="sb-divider"></div>');
  if(typeof updateBadges==='function'){try{updateBadges();}catch(e){}}
}
// ── Organiser modal ──
function openSbOrganiser(){sboDraft=sbCloneLayout(sbLayout);sboRender();const cp=document.getElementById('config-panel');if(cp)cp.classList.remove('open');document.getElementById('sb-organiser-modal').classList.add('open');}
function closeSbOrganiser(){document.getElementById('sb-organiser-modal').classList.remove('open');}
function sboResetDefault(){sboDraft=sbCloneLayout(null);sboRender();}
function sboAddSection(){sboDraft.sections.push({label:'New section',items:[]});sboRender();}
function sboItemChip(k,loc){
  const it=SB_ITEMS[k];if(!it)return '';
  return '<span class="mvcd-chip" draggable="true" ondragstart="sboDragStart(event,\'item\',\''+k+'\',\''+loc+'\')" ondragover="sboChipOver(event)" ondrop="sboDropOnItem(event,\''+loc+'\',\''+k+'\')">'+(it.icon?it.icon+' ':'')+esc(it.label)
    +(loc!=='hidden'?' <span class="x" title="Hide from sidebar" onclick="sboHide(event,\''+k+'\')">🚫</span>':'')+'</span>';
}
function sboRender(){
  const wrap=document.getElementById('sbo-sections');if(!wrap)return;
  wrap.innerHTML=sboDraft.sections.map((sec,si)=>
    '<div style="border:1px solid var(--n200);border-radius:8px;padding:8px;margin-bottom:8px;background:#fff" ondragover="sboAllow(event)" ondrop="sboDropSection(event,'+si+')">'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
    +'<span class="mvcd-line-handle" draggable="true" ondragstart="sboDragStart(event,\'sec\',\''+si+'\',\'\')" title="Drag to reorder section">⠿</span>'
    +'<input value="'+esc(sec.label)+'" onchange="sboDraft.sections['+si+'].label=this.value" style="flex:1;font-size:12px;font-weight:700;padding:4px 8px;border:1px solid var(--n200);border-radius:6px">'
    +(sec.items.length?'':'<span style="cursor:pointer;color:var(--tl-red-t);font-size:11px" onclick="sboDraft.sections.splice('+si+',1);sboRender()">delete</span>')
    +'</div>'
    +'<div class="mvcd-zone" ondragover="sboAllow(event)" ondrop="sboDropItems(event,'+si+')">'+(sec.items.length?sec.items.map(k=>sboItemChip(k,String(si))).join(''):'<span class="mvcd-zone-empty">Drag items here</span>')+'</div>'
    +'</div>'
  ).join('');
  const hid=document.getElementById('sbo-hidden');
  if(hid)hid.innerHTML=sboDraft.hidden.length?sboDraft.hidden.map(k=>sboItemChip(k,'hidden')).join(''):'<span class="mvcd-zone-empty">Nothing hidden — drop items here to hide them</span>';
}
function sboAllow(e){e.preventDefault();}
function sboChipOver(e){e.preventDefault();e.stopPropagation();}
function sboDragStart(e,kind,a,b){sbDrag={kind:kind,key:kind==='item'?a:null,sec:kind==='sec'?parseInt(a,10):null,from:b};e.stopPropagation();try{e.dataTransfer.setData('text/plain',a);}catch(_){}}
function sboStrip(key){sboDraft.sections.forEach(s=>{const i=s.items.indexOf(key);if(i>=0)s.items.splice(i,1);});const j=sboDraft.hidden.indexOf(key);if(j>=0)sboDraft.hidden.splice(j,1);}
function sboMoveSection(ti){const from=sbDrag.sec;sbDrag=null;if(from==null||from===ti)return;const s=sboDraft.sections.splice(from,1)[0];let to=ti;if(to>from)to--;sboDraft.sections.splice(to,0,s);sboRender();}
function sboDropSection(e,ti){e.preventDefault();if(!sbDrag||sbDrag.kind!=='sec')return;sboMoveSection(ti);}
function sboDropItems(e,si){
  e.preventDefault();e.stopPropagation();if(!sbDrag)return;
  if(sbDrag.kind==='sec'){sboMoveSection(si);return;}
  const k=sbDrag.key;sbDrag=null;sboStrip(k);sboDraft.sections[si].items.push(k);sboRender();
}
function sboDropOnItem(e,loc,target){
  e.preventDefault();e.stopPropagation();if(!sbDrag||sbDrag.kind!=='item')return;
  const k=sbDrag.key;sbDrag=null;if(k===target)return;
  sboStrip(k);
  if(loc==='hidden'){const ti=sboDraft.hidden.indexOf(target);sboDraft.hidden.splice(ti<0?sboDraft.hidden.length:ti,0,k);}
  else{const arr=sboDraft.sections[parseInt(loc,10)].items;const ti=arr.indexOf(target);arr.splice(ti<0?arr.length:ti,0,k);}
  sboRender();
}
function sboDropHidden(e){e.preventDefault();if(!sbDrag||sbDrag.kind!=='item')return;const k=sbDrag.key;sbDrag=null;sboStrip(k);sboDraft.hidden.push(k);sboRender();}
function sboHide(e,k){e.stopPropagation();sboStrip(k);sboDraft.hidden.push(k);sboRender();}
async function saveSbOrganiser(){
  const layout={sections:sboDraft.sections.map(s=>({label:s.label,items:s.items.slice()})),hidden:sboDraft.hidden.slice()};
  sbLayout=sbCloneLayout(layout);
  try{
    await sbReq('covase_config',{method:'POST',body:{key:'sidebar_layout',value:layout,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});
    toast('Sidebar layout saved','success');closeSbOrganiser();renderSidebar();
  }catch(e){toast('Save failed: '+e.message+' (is covase_config applied?)','error');}
}

// Boot — Active hires (Pipeline) is the default landing view
loadHires();
// Also load accounts in the background so the client filter dropdown is populated immediately
loadAccounts();
// Load the shared supplier booking email template (falls back to default if unset)
loadBookingTemplate();
// Load the shared card layouts (drag-and-drop designers; fall back to defaults)
loadMovementCardLayout();loadHireCardLayout();loadFineCardLayout();
// Load the movement request email template
loadMovementTemplate();loadOffhireTemplate();
// Prime the supplier-replies review-queue badge
loadSupplierReplies();
// Prime the accident-claims badge (open-claim count)
loadClaims();
// Prime the fines badge + templates + dashboard config
loadFines();loadFineTemplates();loadFineDash();
// Prime ALL remaining sidebar badges at boot (previously '—' until visited)
loadInvoices();loadOutgoing();loadMovements();loadContacts();loadVehicles();
// Go live: subscribe to database changes so the app stays current by itself
initRealtime();
// Fine notice viewer (wheel-zoom / drag-pan handlers)
initFinePdfViewer();
// Load the reply-agent instructions (for the Settings editor)
loadAgentInstructions();
// Load the shared sidebar layout and render the (organisable) sidebar
loadSidebarLayout();
// Load the shared fonts/appearance theme
loadTheme();
// Element-level style overrides (Edit mode) + listeners
loadFontOverrides();
initEditMode();

// ═══════════════════════════════════════════════════════════════════
// SUPPLIER-REPLY ATTACHMENTS
// Files live in the public reply-attachments Storage bucket; the row carries
// only metadata. Signature logos are filtered out upstream by size, so
// anything that reaches here is worth showing.
// ═══════════════════════════════════════════════════════════════════
function replyAttachments(r){
  const a=r&&r.attachments;
  if(Array.isArray(a))return a;
  if(typeof a==='string'){try{const p=JSON.parse(a);return Array.isArray(p)?p:[];}catch(e){return [];}}
  return [];
}
function attIcon(t){
  t=String(t||'').toLowerCase();
  if(t.indexOf('image/')===0)return '🖼';
  if(t.indexOf('pdf')!==-1)return '📄';
  if(/sheet|excel|csv/.test(t))return '📊';
  if(/word|document/.test(t))return '📝';
  return '📎';
}
function attSize(n){
  n=Number(n)||0;
  return n>=1048576?(n/1048576).toFixed(1)+' MB':(n>=1024?Math.round(n/1024)+' KB':n+' B');
}
function attChips(r){
  const list=replyAttachments(r);
  if(!list.length)return '';
  return '<div class="att-row">'+list.map((f,i)=>
    '<button type="button" class="att-chip" onclick="openAttachment(\''+esc(r.id)+'\','+i+')" title="'+esc((f.name||'attachment')+' · '+attSize(f.size))+'">'
    +attIcon(f.type)+' <span class="att-name">'+esc(f.name||'attachment')+'</span>'
    +'<span class="att-size">'+attSize(f.size)+'</span></button>').join('')+'</div>';
}
// A chip can be clicked from the review queue or from inside a thread, so look
// in both caches rather than assuming which view is open.
// allSupplierReplies is a top-level `let`, which does NOT become a property of
// window — reach it by identifier. _threadMsgs is explicitly set on window by
// openThread, so that one is addressed differently on purpose.
function openAttachment(replyId,i){
  const queue=(typeof allSupplierReplies!=='undefined'&&Array.isArray(allSupplierReplies))?allSupplierReplies:[];
  const thread=Array.isArray(window._threadMsgs)?window._threadMsgs:[];
  const r=queue.find(x=>x&&x.id===replyId)||thread.find(x=>x&&x.id===replyId);
  const f=r&&replyAttachments(r)[i];
  // Separate messages: a missing row is a bug here, a missing url means the
  // upload into Storage did not land.
  if(!r){toast('Could not find that reply — refresh and try again','error');return;}
  if(!f){toast('That attachment is no longer on the reply','error');return;}
  if(!f.url){toast('That attachment has no stored file','error');return;}
  if(String(f.type||'').indexOf('image/')===0)openAttLightbox(f);
  else window.open(f.url,'_blank','noopener');
}
function openAttLightbox(f){
  let el=document.getElementById('att-lightbox');
  if(!el){
    el=document.createElement('div');el.id='att-lightbox';el.className='att-lightbox';
    el.addEventListener('click',ev=>{if(ev.target===el||ev.target.classList.contains('att-lb-close'))closeAttLightbox();});
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeAttLightbox();});
    document.body.appendChild(el);
  }
  el.innerHTML='<div class="att-lb-bar"><span>'+esc(f.name||'image')+'</span>'
    +'<a href="'+esc(f.url)+'" target="_blank" rel="noopener">Open original ↗</a>'
    +'<button type="button" class="att-lb-close" aria-label="Close">✕</button></div>'
    +'<img src="'+esc(f.url)+'" alt="'+esc(f.name||'attachment')+'">';
  el.classList.add('open');
}
function closeAttLightbox(){const el=document.getElementById('att-lightbox');if(el)el.classList.remove('open');}

// ═══════════════════════════════════════════════════════════════════
// RESPONSIVE / TOUCH  (iPhone / iPad)
// Desktop behaviour is untouched: every branch below is gated on
// IS_TOUCH or on the ≤1024px breakpoint.
// ═══════════════════════════════════════════════════════════════════

// Coarse pointer with no hover = phone/tablet. iOS Safari never fires
// HTML5 drag events, so these devices get the tap-to-move sheet instead.
// matchMedia is authoritative where present: a touchscreen laptop reports
// hover:hover and keeps the desktop drag behaviour.
const IS_TOUCH = window.matchMedia
  ? window.matchMedia('(hover:none) and (pointer:coarse)').matches
  : ('ontouchstart' in window && (navigator.maxTouchPoints||0) > 0);

// ── Off-canvas sidebar ──────────────────────────────────────────────
function setNav(open){
  document.body.classList.toggle('nav-open', !!open);
  document.querySelectorAll('.nav-toggle').forEach(b=>b.setAttribute('aria-expanded', open?'true':'false'));
}
function toggleNav(){ setNav(!document.body.classList.contains('nav-open')); }

function initResponsiveNav(){
  // One hamburger per view topbar — views are static markup, so this runs once.
  document.querySelectorAll('.topbar').forEach(tb=>{
    if(tb.querySelector('.nav-toggle')) return;
    const b=document.createElement('button');
    b.type='button'; b.className='nav-toggle'; b.innerHTML='☰';
    b.setAttribute('aria-label','Menu'); b.setAttribute('aria-expanded','false');
    b.onclick=e=>{e.stopPropagation();toggleNav();};
    tb.insertBefore(b, tb.firstChild);
  });
  // Scrim closes the drawer
  if(!document.querySelector('.nav-scrim')){
    const sc=document.createElement('div');
    sc.className='nav-scrim';
    sc.onclick=()=>setNav(false);
    document.body.appendChild(sc);
  }
  // Picking a destination closes the drawer. Delegated, because the sidebar
  // is re-rendered by the organiser (loadSidebarLayout).
  const sb=document.querySelector('.sidebar');
  if(sb && !sb.dataset.navBound){
    sb.dataset.navBound='1';
    sb.addEventListener('click', e=>{
      if(e.target.closest('.sb-item') && !e.target.closest('.sb-item').classList.contains('disabled')) setNav(false);
    });
  }
  // Escape closes it; widening past the breakpoint resets state
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') setNav(false); });
  if(window.matchMedia) window.matchMedia('(max-width:1024px)').addEventListener('change', ev=>{ if(!ev.matches) setNav(false); });
}

// ── Tap-to-move sheet (replaces drag on touch) ──────────────────────
let tapMoveCtx=null;

function openTapMove(e,kind,id){
  if(e){e.stopPropagation();e.preventDefault();}
  let title,lanes,current,apply;
  const reg=(window.TAPMOVE_KINDS||{})[kind]; // later section files register their boards here
  if(reg){
    const c=reg(id); if(!c) return;
    title=c.title; lanes=c.lanes; current=c.current; apply=c.apply;
  }else if(kind==='mv'){
    const m=(allMovements||[]).find(x=>x.id===id); if(!m) return;
    current=m.movement_status;
    // 'in_progress' is retired — only offer it if the card is already sitting there
    lanes=MV_KANBAN_COLS.filter(c=>c.key!=='in_progress'||current==='in_progress')
                        .map(c=>({key:c.key,label:c.label}));
    title='Move movement to'; apply=mvSetStatus;
  }else{
    const f=(allFines||[]).find(x=>x.id===id); if(!f) return;
    current=f.status;
    lanes=FINE_KAN_MAIN.concat(FINE_KAN_PARKED).map(k=>({key:k,label:FINE_STATUS_LABEL[k]||k}));
    title='Move fine to'; apply=fineSetStatus;
  }
  tapMoveCtx={id,apply};
  let sheet=document.getElementById('tapmove-sheet');
  if(!sheet){
    sheet=document.createElement('div');
    sheet.id='tapmove-sheet'; sheet.className='tapmove-sheet';
    sheet.addEventListener('click',ev=>{ if(ev.target===sheet) closeTapMove(); });
    document.body.appendChild(sheet);
  }
  sheet.innerHTML='<div class="tapmove-panel">'
    +'<div class="tapmove-title">'+esc(title)+'</div>'
    + lanes.map(l=>l.key===current
        ? '<div class="tapmove-opt current">'+esc(l.label)+'</div>'
        : '<div class="tapmove-opt" onclick="tapMoveApply(\''+l.key+'\')">'+esc(l.label)+'</div>').join('')
    +'<div class="tapmove-cancel" onclick="closeTapMove()">Cancel</div>'
    +'</div>';
  sheet.classList.add('open');
}
function closeTapMove(){
  const sheet=document.getElementById('tapmove-sheet');
  if(sheet) sheet.classList.remove('open');
  tapMoveCtx=null;
}
async function tapMoveApply(status){
  const ctx=tapMoveCtx; closeTapMove();
  if(!ctx) return;
  await ctx.apply(ctx.id,status);   // same code path drag-and-drop uses
}

// Mobile/tablet chrome: hamburger + off-canvas sidebar + tap-to-move
initResponsiveNav();
