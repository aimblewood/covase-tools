// ─── MOVEMENTS ───
let allMovements=[],movementsLoaded=false,movementFilter='all',editMovementId=null,movementSupps=[];

async function loadMovements(){
  const el=document.getElementById('movement-list');if(needsSetup(el))return;
  el.innerHTML='<div class="loading">Loading movements…</div>';
  try{
    allMovements=await sbReq('covase_movements?order=created_at.desc&limit=500');
    movementsLoaded=true;
    // Load accounts in background for the dropdown if not loaded
    if(!Array.isArray(allAccounts)||!allAccounts.length){try{allAccounts=await sbReq('covase_accounts?order=company_name.asc&limit=500');}catch(e){}}
    updateMovementStats();applyMovementViewVis();renderMovementsView();updateBadges();
  }catch(e){
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">✗</div><div class="empty-title">Load failed</div><div class="empty-sub">${esc(e.message||'')}</div></div>`;
  }
}

function updateMovementStats(){
  const total=allMovements.length;
  const quoted=allMovements.filter(m=>m.movement_status==='quoted').length;
  const active=allMovements.filter(m=>['booked','in_progress'].includes(m.movement_status)).length;
  const openValue=allMovements
    .filter(m=>['quoted','booked','in_progress'].includes(m.movement_status))
    .reduce((s,m)=>s+(parseFloat(m.quote_total)||0),0);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('sm-total',total);
  set('sm-quoted',quoted);
  set('sm-active',active);
  set('sm-value',fmtMoney(openValue||null));
  // Sidebar badge — count of anything not yet paid/cancelled
  const live=allMovements.filter(m=>!['paid','cancelled'].includes(m.movement_status)).length;
  const badge=document.getElementById('badge-movements');if(badge)badge.textContent=String(live||0);
}

function setMovementFilter(f,btn){
  movementFilter=f;
  document.querySelectorAll('#view-movements .filter-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderMovementsView();
}

// ─── Movements: List / Kanban / Calendar views ───
let movementView='kanban',mvCalMonth=null,mvKanDragId=null;
function movementRowsFiltered(applyStatus){
  const q=(document.getElementById('movement-search')?.value||'').toLowerCase().trim();
  let rows=(allMovements||[]).slice();
  if(applyStatus&&movementFilter!=='all')rows=rows.filter(m=>m.movement_status===movementFilter);
  if(q){rows=rows.filter(m=>{const hay=[m.customer,m.customer_reference,m.pickup_postcode,m.dropoff_postcode,m.vehicle_reg,m.supplier,m.driver_name,m.notes].map(x=>String(x||'').toLowerCase()).join(' ');return hay.includes(q);});}
  return rows;
}
function applyMovementViewVis(){
  const setD=(id,d)=>{const e=document.getElementById(id);if(e)e.style.display=d;};
  setD('movement-list',movementView==='list'?'':'none');
  setD('movement-kanban',movementView==='kanban'?'':'none');
  setD('movement-calendar',movementView==='calendar'?'':'none');
  const pills=document.getElementById('movement-filter-pills');if(pills)pills.style.display=(movementView==='list')?'flex':'none';
}
function setMovementView(v){
  movementView=v;
  document.querySelectorAll('#movement-view-seg .seg-btn').forEach(b=>b.classList.toggle('active',b.getAttribute('data-mv')===v));
  applyMovementViewVis();
  renderMovementsView();
}
function renderMovementsView(){
  if(movementView==='kanban')renderMovementKanban();
  else if(movementView==='calendar')renderMovementCalendar();
  else renderMovements();
}
// ── Kanban (status lanes; drag to change status + per-card advance) ──
const MV_KANBAN_COLS=[
  {key:'quoted',label:'Quoted'},
  {key:'booked',label:'Booked'},
  {key:'in_progress',label:'In progress',hideEmpty:true}, // lane retired from the flow; only shows if legacy cards still sit in it
  {key:'completed_pending_fuel',label:'Awaiting invoice'},
  {key:'invoiced',label:'Invoiced'},
  {key:'paid',label:'Paid'}
];
const MV_NEXT={quoted:'booked',booked:'completed_pending_fuel',in_progress:'completed_pending_fuel',completed_pending_fuel:'invoiced',invoiced:'paid'};
function renderMovementKanban(){
  const wrap=document.getElementById('movement-kanban');if(!wrap)return;
  const rows=movementRowsFiltered(false);
  const buckets={};MV_KANBAN_COLS.forEach(c=>buckets[c.key]=[]);const cancelled=[];
  rows.forEach(m=>{if(m.movement_status==='cancelled'){cancelled.push(m);return;}(buckets[m.movement_status]||(buckets[m.movement_status]=[])).push(m);});
  let cols=MV_KANBAN_COLS.filter(c=>!c.hideEmpty||(buckets[c.key]||[]).length).map(c=>{
    const items=buckets[c.key]||[];
    const body=items.length?items.map(m=>mvKanCard(m)).join(''):'<div class="kan-col-empty">Nothing here</div>';
    return `<div class="kan-col" ondragover="mvKanAllow(event)" ondragleave="mvKanLeave(event)" ondrop="mvKanDrop(event,'${c.key}')">
      <div class="kan-col-header"><span class="kan-col-title">${esc(c.label)}</span><span class="kan-col-count">${items.length}</span></div>
      <div class="kan-col-body">${body}</div>
    </div>`;
  }).join('');
  let out=cols;
  if(cancelled.length){out+=`<div class="kan-col" style="grid-column:1/-1;margin-top:14px"><div class="kan-col-header"><span class="kan-col-title" style="color:var(--tl-red-t)">Cancelled</span><span class="kan-col-count">${cancelled.length}</span></div><div class="kan-col-body" style="max-height:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px">${cancelled.map(m=>mvKanCard(m)).join('')}</div></div>`;}
  wrap.innerHTML=out;
}
function mvKanCard(m){
  const next=MV_NEXT[m.movement_status];
  const advBtn=next?`<button class="kan-advance" onclick="event.stopPropagation();mvAdvance('${esc(m.id)}')" title="Move to ${esc(mvStatusLabel(next))}">→ ${esc(mvStatusLabel(next))}</button>`:'';
  const mvMoveBtn=IS_TOUCH?`<button type="button" class="kan-move" onclick="openTapMove(event,'mv','${esc(m.id)}')" title="Move to another lane">⇄ Move</button>`:'';
  return `<div class="mv-kan-wrap" draggable="true" ondragstart="mvKanDragStart(event,'${esc(m.id)}')" ondragend="mvKanDragEnd(event)">${movementCard(m)}${(advBtn||mvMoveBtn)?`<div class="mv-kan-actions">${mvMoveBtn}${advBtn}</div>`:''}</div>`;
}
function mvKanDragStart(e,id){mvKanDragId=id;try{e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';}catch(_){}}
function mvKanDragEnd(e){mvKanDragId=null;document.querySelectorAll('.kan-col.mvkan-over').forEach(el=>el.classList.remove('mvkan-over'));}
function mvKanAllow(e){e.preventDefault();try{e.dataTransfer.dropEffect='move';}catch(_){}const c=e.currentTarget;if(c&&c.classList)c.classList.add('mvkan-over');}
function mvKanLeave(e){const c=e.currentTarget;if(c&&c.classList)c.classList.remove('mvkan-over');}
async function mvKanDrop(e,status){e.preventDefault();document.querySelectorAll('.kan-col.mvkan-over').forEach(el=>el.classList.remove('mvkan-over'));const id=mvKanDragId;mvKanDragId=null;if(!id)return;await mvSetStatus(id,status);}
function mvAdvance(id){const m=(allMovements||[]).find(x=>x.id===id);if(!m)return;const next=MV_NEXT[m.movement_status];if(next)mvSetStatus(id,next);}
async function mvSetStatus(id,status){
  const m=(allMovements||[]).find(x=>x.id===id);if(!m||m.movement_status===status)return;
  const prev=m.movement_status;m.movement_status=status;m.updated_at=new Date().toISOString();
  renderMovementsView();updateMovementStats();updateBadges();
  try{await sbReq(`covase_movements?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{movement_status:status,updated_at:m.updated_at},prefer:'return=minimal'});toast('Moved to '+mvStatusLabel(status),'success');}
  catch(e){m.movement_status=prev;renderMovementsView();updateMovementStats();updateBadges();toast('Update failed: '+e.message,'error');}
}
// ── Calendar (month grid by movement date) ──
function renderMovementCalendar(){
  const wrap=document.getElementById('movement-calendar');if(!wrap)return;
  if(!mvCalMonth){const t=new Date();mvCalMonth=new Date(t.getFullYear(),t.getMonth(),1);}
  const year=mvCalMonth.getFullYear(),month=mvCalMonth.getMonth();
  const rows=movementRowsFiltered(false);
  const byDate={};rows.forEach(m=>{if(!m.movement_date)return;const key=String(m.movement_date).slice(0,10);(byDate[key]=byDate[key]||[]).push(m);});
  const first=new Date(year,month,1);const startDow=(first.getDay()+6)%7;const daysInMonth=new Date(year,month+1,0).getDate();
  const monthName=first.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const pad=n=>String(n).padStart(2,'0');const t=new Date();const todayKey=t.getFullYear()+'-'+pad(t.getMonth()+1)+'-'+pad(t.getDate());
  let cells='';
  for(let i=0;i<startDow;i++)cells+='<div class="mvcal-cell mvcal-empty"></div>';
  for(let d=1;d<=daysInMonth;d++){
    const key=year+'-'+pad(month+1)+'-'+pad(d);
    const items=byDate[key]||[];
    const chips=items.map(m=>`<div class="mvcal-chip mvcal-${esc(m.movement_status)}" title="${esc((m.customer||'—')+' · '+mvStatusLabel(m.movement_status))}" onclick="openEditMovement('${esc(m.id)}')">${mvChipHtml(m)}</div>`).join('');
    cells+=`<div class="mvcal-cell${key===todayKey?' mvcal-today':''}"><div class="mvcal-daynum">${d}</div>${chips}</div>`;
  }
  const dow=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="mvcal-dow">${x}</div>`).join('');
  wrap.innerHTML=`<div class="mvcal-head"><button class="topbar-btn" onclick="mvCalNav(-1)">‹ Prev</button><div class="mvcal-title">${esc(monthName)}</div><button class="topbar-btn" onclick="mvCalNav(1)">Next ›</button><button class="topbar-btn" onclick="mvCalToday()">Today</button></div><div class="mvcal-grid">${dow}${cells}</div><div style="font-size:11px;color:var(--n400);margin-top:8px">Movements appear on their movement date. Quotes without a date don't show here.</div>`;
}
function mvCalNav(delta){if(!mvCalMonth){const t=new Date();mvCalMonth=new Date(t.getFullYear(),t.getMonth(),1);}mvCalMonth=new Date(mvCalMonth.getFullYear(),mvCalMonth.getMonth()+delta,1);renderMovementCalendar();}
function mvCalToday(){const t=new Date();mvCalMonth=new Date(t.getFullYear(),t.getMonth(),1);renderMovementCalendar();}

function renderMovements(){
  const wrap=document.getElementById('movement-list');if(!wrap)return;
  const q=(document.getElementById('movement-search')?.value||'').toLowerCase().trim();
  let rows=allMovements.slice();
  if(movementFilter!=='all')rows=rows.filter(m=>m.movement_status===movementFilter);
  if(q){
    rows=rows.filter(m=>{
      const hay=[m.customer,m.customer_reference,m.pickup_postcode,m.dropoff_postcode,m.vehicle_reg,m.notes]
        .map(x=>String(x||'').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }
  if(!rows.length){
    wrap.innerHTML='<div class="empty-state"><div class="empty-icon">🚛</div><div class="empty-title">No movements</div><div class="empty-sub">Click + New Movement to start.</div></div>';
    return;
  }
  wrap.innerHTML=rows.map(m=>movementCard(m)).join('');
}

// ─── Movement card designer (drag-and-drop; layout shared via covase_config) ───
function mvStatusLabel(s){const L={quoted:'Quoted',booked:'Booked',in_progress:'In progress',completed_pending_fuel:'Awaiting invoice',invoiced:'Invoiced',paid:'Paid',cancelled:'Cancelled'};return L[s]||s||'';}
const MV_CARD_FIELDS=[
  {key:'customer',label:'Customer',get:m=>m.customer||'—'},
  {key:'customer_reference',label:'Customer ref',get:m=>m.customer_reference||''},
  {key:'status',label:'Status',get:m=>mvStatusLabel(m.movement_status)},
  {key:'route',label:'Route (postcodes)',get:m=>(m.pickup_postcode||'?')+' → '+(m.dropoff_postcode||'?')},
  {key:'route_towns',label:'Route (towns)',get:m=>(m.pickup_town||'?')+' → '+(m.dropoff_town||'?')},
  {key:'pickup_postcode',label:'Pickup postcode',get:m=>m.pickup_postcode||''},
  {key:'dropoff_postcode',label:'Dropoff postcode',get:m=>m.dropoff_postcode||''},
  {key:'pickup_town',label:'Pickup town',get:m=>m.pickup_town||''},
  {key:'dropoff_town',label:'Dropoff town',get:m=>m.dropoff_town||''},
  {key:'pickup_county',label:'Pickup county',get:m=>m.pickup_county||''},
  {key:'dropoff_county',label:'Dropoff county',get:m=>m.dropoff_county||''},
  {key:'miles',label:'Mileage',get:m=>m.mileage!=null?Number(m.mileage).toFixed(1)+' mi':''},
  {key:'drive_time',label:'Drive time',get:m=>m.drive_time_minutes!=null?m.drive_time_minutes+' min':''},
  {key:'vehicle_reg',label:'Vehicle reg',get:m=>m.vehicle_reg||''},
  {key:'vehicle_makemodel',label:'Make / model',get:m=>m.vehicle_makemodel||''},
  {key:'driver_name',label:'Driver',get:m=>m.driver_name||''},
  {key:'supplier',label:'Supplier',get:m=>m.supplier||''},
  {key:'date',label:'Date',get:m=>m.movement_date?fmtD(m.movement_date):(m.quote_date?fmtD(m.quote_date)+' (quote)':'')},
  {key:'movement_date',label:'Movement date',get:m=>m.movement_date?fmtD(m.movement_date):''},
  {key:'quote_date',label:'Quote date',get:m=>m.quote_date?fmtD(m.quote_date):''},
  {key:'total',label:'Total (£)',money:true,get:m=>fmtMoney((parseFloat(m.invoice_total)||parseFloat(m.quote_total)||0)||null)},
  {key:'quote_total',label:'Quote total (£)',money:true,get:m=>fmtMoney(parseFloat(m.quote_total)||null)},
  {key:'invoice_total',label:'Invoice total (£)',money:true,get:m=>fmtMoney(parseFloat(m.invoice_total)||null)},
  {key:'actual_fuel',label:'Actual fuel (£)',money:true,get:m=>fmtMoney(parseFloat(m.actual_fuel_cost)||null)},
  {key:'notes',label:'Notes',get:m=>m.notes||''},
  {key:'job_ref',label:'Job ref',get:m=>m.job_ref||''},
  {key:'pickup_address',label:'Pickup address',get:m=>[m.pickup_address_line1,m.pickup_address_line2].filter(Boolean).join(', ')},
  {key:'dropoff_address',label:'Dropoff address',get:m=>[m.dropoff_address_line1,m.dropoff_address_line2].filter(Boolean).join(', ')},
  {key:'mileage_source',label:'Mileage source',get:m=>m.mileage_source||''},
  {key:'base_charge',label:'Base charge (£)',money:true,get:m=>fmtMoney(parseFloat(m.base_charge)||null)},
  {key:'markup_flat',label:'Markup (£, internal)',money:true,get:m=>fmtMoney(parseFloat(m.markup_flat)||null)},
  {key:'price_override',label:'Spec price (£, override)',money:true,get:m=>m.price_override!=null?fmtMoney(parseFloat(m.price_override)):''},
  {key:'vat_total',label:'VAT (£)',money:true,get:m=>fmtMoney(parseFloat(m.vat_total)||null)},
  {key:'fuel_markup_amount',label:'Fuel markup (£)',money:true,get:m=>fmtMoney(parseFloat(m.fuel_markup_amount)||null)},
  {key:'internal_notes',label:'Internal notes',get:m=>m.internal_notes||''}
];
const MV_FIELD_MAP=Object.fromEntries(MV_CARD_FIELDS.map(f=>[f.key,f]));
// Label tokens: fixed text placed in the layout ('label:<uid>:<text>'). A label
// attaches to the NEXT field's value ("From BN1 1AA") instead of being a
// separate ' · ' segment; a label before an empty field is dropped with it.
function mvIsLabelKey(k){return typeof k==='string'&&k.indexOf('label:')===0;}
function mvLabelText(k){return k.split(':').slice(2).join(':');}
// Per-chip formatting is encoded in the layout entry after a '|':
//   'customer|b,i,s:lg,c:#0a7a72'  → bold italic large teal customer name
function mvKeyBase(k){return String(k).split('|')[0];}
function mvKeyFmt(k){
  const p=String(k).split('|')[1];const f={};if(!p)return f;
  p.split(',').forEach(t=>{if(t==='b')f.b=1;else if(t==='i')f.i=1;else if(t.indexOf('s:')===0)f.s=t.slice(2);else if(t.indexOf('c:')===0)f.c=t.slice(2);});
  return f;
}
function mvFmtEncode(base,f){const t=[];if(f.b)t.push('b');if(f.i)t.push('i');if(f.s)t.push('s:'+f.s);if(f.c)t.push('c:'+f.c);return t.length?base+'|'+t.join(','):base;}
function mvFmtStyle(f){let s='';if(f.b)s+='font-weight:700;';if(f.i)s+='font-style:italic;';if(f.s==='sm')s+='font-size:0.85em;';if(f.s==='lg')s+='font-size:1.25em;';if(f.c)s+='color:'+f.c+';';return s;}
function mvFmtWrap(html,f){const st=mvFmtStyle(f);return st?'<span style="'+st+'">'+html+'</span>':html;}
// Resolve layout keys → HTML parts (escaped values, formatting applied).
// A label glues to the NEXT field's value; label before an empty field is dropped.
function mvResolvePartsHtml(keys,m,map){
  const out=[];let pending=null;
  (keys||[]).forEach(k=>{
    const base=mvKeyBase(k),fmt=mvKeyFmt(k);
    if(mvIsLabelKey(base)){const lh=mvFmtWrap(esc(mvLabelText(base)),fmt);pending=pending?pending+' '+lh:lh;return;}
    const f=(map||MV_FIELD_MAP)[base];if(!f)return;
    const v=f.get(m);
    if(v!==''&&v!=null&&String(v)!==''){out.push((pending?pending+' ':'')+mvFmtWrap(esc(String(v)),fmt));}
    pending=null;
  });
  if(pending)out.push(pending); // trailing label with no field still shows
  return out;
}
const DEFAULT_MV_CARD_LAYOUT={title:['customer'],lines:[['route','miles'],['date','customer_reference','vehicle_reg']],right:['total','status'],chip:['customer']};
const MVCD_MAX_LINES=6;
// Normalises any saved shape (incl. the legacy fixed line1/line2/line3 format)
// into {title:[], lines:[[]...], right:[]} with at least one line.
function mvcdCloneLayout(src){
  const s=src||{};
  let lines;
  if(Array.isArray(s.lines))lines=s.lines.map(l=>Array.isArray(l)?l.slice():[]);
  else{lines=['line1','line2','line3'].map(k=>Array.isArray(s[k])?s[k].slice():[]);while(lines.length>1&&!lines[lines.length-1].length)lines.pop();}
  if(!lines.length)lines=[[]];
  return {title:Array.isArray(s.title)?s.title.slice():[],lines:lines,right:Array.isArray(s.right)?s.right.slice():[],chip:Array.isArray(s.chip)?s.chip.slice():['customer']};
}
let movementCardLayout=mvcdCloneLayout(DEFAULT_MV_CARD_LAYOUT);
async function loadMovementCardLayout(){
  try{
    const rows=await sbReq('covase_config?key=eq.movement_card_layout&select=value');
    const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;
    if(v&&typeof v==='object'){
      const L=mvcdCloneLayout(v);
      const ok=k=>MV_FIELD_MAP[mvKeyBase(k)]||mvIsLabelKey(mvKeyBase(k));
      L.title=L.title.filter(ok);
      L.right=L.right.filter(k=>MV_FIELD_MAP[mvKeyBase(k)]); // right column is fields-only
      L.lines=L.lines.map(l=>l.filter(ok));
      L.chip=L.chip.filter(ok);
      movementCardLayout=L;
    }
  }catch(e){/* covase_config may not exist yet — keep default */}
  if(Array.isArray(allMovements)&&allMovements.length)renderMovementsView();
}
function movementCard(m){
  const L=movementCardLayout||DEFAULT_MV_CARD_LAYOUT;
  const parts=keys=>mvResolvePartsHtml(keys,m); // already escaped + formatted HTML
  const titleParts=parts(L.title);
  const title=titleParts.length?titleParts.join(' '):'—';
  const lineHtml=(keys,style)=>{const p=parts(keys);return p.length?`<div style="${style}">${p.join(' ')}</div>`:'';};
  const lineArrs=Array.isArray(L.lines)?L.lines:['line1','line2','line3'].map(k=>L[k]||[]);
  const linesHtml=lineArrs.map((keys,i)=>lineHtml(keys,'font-size:11px;color:var(--'+(i===0?'n600':'n500')+');margin-top:2px')).join('');
  const rightParts=(L.right||[]).map(k=>{const bk=mvKeyBase(k);const f=MV_FIELD_MAP[bk];if(!f)return '';const v=f.get(m);if(!v)return '';
    // chip formatting appended last so it OVERRIDES the built-in styling
    const fs=mvFmtStyle(mvKeyFmt(k));
    if(bk==='status')return `<div style="font-size:10px;color:var(--n500);margin-top:2px;text-transform:uppercase;letter-spacing:.3px;${fs}">${esc(String(v))}</div>`;
    if(f.money)return `<div style="font-weight:700;font-size:13px;color:var(--covase);${fs}">${esc(String(v))}</div>`;
    return `<div style="font-size:11px;color:var(--n600);margin-top:2px;${fs}">${esc(String(v))}</div>`;
  }).filter(Boolean).join('');
  const right=rightParts?`<div style="text-align:right;white-space:nowrap">${rightParts}</div>`:'';
  return `<div class="card" onclick="openEditMovement('${esc(m.id)}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;color:var(--n800)">${title}</div>
        ${linesHtml}
      </div>
      ${right}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:7px"><button class="mv-journey-btn" onclick="event.stopPropagation();openJourney('${esc(m.id)}')">🧭 Journey</button></div>
  </div>`;
}
// ─── Designer modal state + drag-and-drop interactions ───
const MVCD_SAMPLE={id:'sample',customer:'Woodland Trust',customer_reference:'PO-4471',pickup_postcode:'BN1 1AA',dropoff_postcode:'M1 2AB',pickup_town:'Brighton',dropoff_town:'Manchester',pickup_county:'East Sussex',dropoff_county:'Greater Manchester',mileage:264.3,drive_time_minutes:290,vehicle_reg:'AB12 CDE',vehicle_makemodel:'Ford Transit',driver_name:'Jane Doe',movement_date:'2026-08-20',quote_date:'2026-08-14',quote_total:512.4,invoice_total:0,actual_fuel_cost:0,movement_status:'booked'};
let mvcdDraft=null,mvcdDrag=null;
// ── Designer context: the same drag-drop machinery drives the movement card
// designer and the booking (hire) card designer. cdCtx picks the active one. ──
let cdCtx='mv';
const CD_CONTEXTS={
  mv:{modal:'mv-card-designer-modal',palette:'mvcd-palette',lines:'mvcd-lines',hasChip:true,fields:()=>MV_CARD_FIELDS,map:()=>MV_FIELD_MAP},
  hire:{modal:'hire-card-designer-modal',palette:'hcd-palette',lines:'hcd-lines',hasChip:false,fields:()=>HIRE_CARD_FIELDS,map:()=>HIRE_FIELD_MAP},
  fine:{modal:'fine-card-designer-modal',palette:'fcd-palette',lines:'fcd-lines',hasChip:false,fields:()=>FINE_CARD_FIELDS,map:()=>FINE_FIELD_MAP}
};
function cdCfg(){return CD_CONTEXTS[cdCtx];}
function closeCardDesigner(){mvcdFmtClose();document.getElementById(cdCfg().modal).classList.remove('open');}
function openMvCardDesigner(){cdCtx='mv';mvcdDraft=mvcdCloneLayout(movementCardLayout);mvcdRender();document.getElementById('mv-card-designer-modal').classList.add('open');}
function closeMvCardDesigner(){closeCardDesigner();}
function resetMvCardDesigner(){mvcdDraft=mvcdCloneLayout(DEFAULT_MV_CARD_LAYOUT);mvcdRender();}
function openHireCardDesigner(){cdCtx='hire';mvcdDraft=mvcdCloneLayout(hireCardLayout||DEFAULT_HIRE_CARD_LAYOUT);mvcdRender();document.getElementById('hire-card-designer-modal').classList.add('open');}
function resetHireCardDesigner(){mvcdDraft=mvcdCloneLayout(DEFAULT_HIRE_CARD_LAYOUT);mvcdRender();}
function openFineCardDesigner(){cdCtx='fine';mvcdDraft=mvcdCloneLayout(fineCardLayout||DEFAULT_FINE_CARD_LAYOUT);mvcdRender();document.getElementById('fine-card-designer-modal').classList.add('open');}
function resetFineCardDesigner(){mvcdDraft=mvcdCloneLayout(DEFAULT_FINE_CARD_LAYOUT);mvcdRender();}
async function saveFineCardDesigner(){
  const layout=mvcdCloneLayout(mvcdDraft);fineCardLayout=layout;
  try{await sbReq('covase_config',{method:'POST',body:{key:'fine_card_layout',value:layout,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});toast('Fine card layout saved','success');closeCardDesigner();if(typeof renderFinesView==='function')renderFinesView();}
  catch(e){toast('Save failed: '+e.message+' (is covase_config applied?)','error');}
}
async function saveHireCardDesigner(){
  const layout=mvcdCloneLayout(mvcdDraft);hireCardLayout=layout;
  try{await sbReq('covase_config',{method:'POST',body:{key:'hire_card_layout',value:layout,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});toast('Booking card layout saved','success');closeCardDesigner();if(Array.isArray(allHires)&&allHires.length){hiresLoaded=true;loadHires();}}
  catch(e){toast('Save failed: '+e.message+' (is covase_config applied?)','error');}
}
// Chip text for the calendar view — driven by the designed layout's chip zone
function mvChipHtml(m){
  const L=movementCardLayout||DEFAULT_MV_CARD_LAYOUT;
  const keys=(Array.isArray(L.chip)&&L.chip.length)?L.chip:['customer'];
  const parts=mvResolvePartsHtml(keys,m);
  return parts.length?parts.join(' '):esc(m.customer||'—');
}
// Palette hides only fields used ON THE CARD — the calendar chip is a separate
// surface with its own copies, so a field can be on both card and chip.
function mvcdUsedKeys(){return mvcdDraft.title.concat(mvcdDraft.right,...mvcdDraft.lines);}
// Resolve a zone name ('title' | 'right' | 'line:N') to its draft array
function mvcdZoneArr(zone){
  if(zone==='title')return mvcdDraft.title;
  if(zone==='right')return mvcdDraft.right;
  if(zone==='chip')return mvcdDraft.chip;
  if(zone&&zone.indexOf('line:')===0)return mvcdDraft.lines[parseInt(zone.slice(5),10)]||null;
  return null;
}
function mvcdAddLine(){
  if(mvcdDraft.lines.length>=MVCD_MAX_LINES){toast('Maximum '+MVCD_MAX_LINES+' lines','error');return;}
  mvcdDraft.lines.push([]);mvcdRender();
}
function mvcdRemoveLine(i){
  mvcdDraft.lines.splice(i,1);          // removed line's fields return to the palette
  if(!mvcdDraft.lines.length)mvcdDraft.lines=[[]];
  mvcdRender();
}
function mvcdChip(key,zone){
  const base=mvKeyBase(key),fmt=mvKeyFmt(key);
  const isL=mvIsLabelKey(base);
  const f=isL?null:cdCfg().map()[base];
  if(!isL&&!f)return '';
  const inZone=zone&&zone!=='palette';
  const label=isL?('🏷 '+mvLabelText(base)):f.label;
  const st=mvFmtStyle(fmt); // chip text previews its own formatting
  return `<span class="mvcd-chip${inZone?'':' pal'}${isL?' lbl':''}" draggable="true" ondragstart="mvcdDragStart(event,'${key}','${zone||'palette'}')" ${inZone?`onclick="mvcdOpenFmt(event,'${zone}','${key}')" title="Click to format" ondragover="mvcdChipOver(event)" ondrop="mvcdDropOnChip(event,'${zone}','${key}')"`:''}><span style="${st}">${esc(label)}</span>${inZone?` <span class="x" onclick="mvcdRemove(event,'${zone}','${key}')">✕</span>`:''}</span>`;}
// ── Chip formatting popover ──
let mvcdFmtTarget=null;
function mvcdOpenFmt(e,zone,key){
  e.stopPropagation();
  mvcdFmtTarget={zone,key};
  const pop=document.getElementById('mvcd-fmt-pop');if(!pop)return;
  pop.style.display='flex';
  pop.style.left=Math.min(e.clientX-20,window.innerWidth-260)+'px';
  pop.style.top=Math.min(e.clientY+14,window.innerHeight-70)+'px';
  mvcdFmtSync();
}
function mvcdFmtClose(){const pop=document.getElementById('mvcd-fmt-pop');if(pop)pop.style.display='none';mvcdFmtTarget=null;}
function mvcdFmtSync(){
  if(!mvcdFmtTarget)return;
  const f=mvKeyFmt(mvcdFmtTarget.key);
  const tog=(id,on)=>{const b=document.getElementById(id);if(b){b.style.background=on?'var(--covase)':'#fff';b.style.color=on?'#fff':'var(--n700)';}};
  tog('mvcd-fmt-b',!!f.b);tog('mvcd-fmt-i',!!f.i);
  const s=document.getElementById('mvcd-fmt-s');if(s)s.value=f.s||'';
  const c=document.getElementById('mvcd-fmt-c');if(c)c.value=f.c||'#333333';
}
function mvcdFmtApply(mut){
  if(!mvcdFmtTarget)return;
  const {zone,key}=mvcdFmtTarget;
  const arr=mvcdZoneArr(zone);if(!arr)return;
  const i=arr.indexOf(key);if(i<0)return;
  const f=mvKeyFmt(key);mut(f);
  const nk=mvFmtEncode(mvKeyBase(key),f);
  arr[i]=nk;mvcdFmtTarget.key=nk;
  mvcdRender();mvcdFmtSync();
}
function mvcdAddLabel(){
  let t=prompt('Label text (e.g. From, To, Ref, →)');
  if(!t)return;
  t=t.trim().replace(/['"\\]/g,'');
  if(!t){toast('Label text needed','error');return;}
  mvcdDraft.lines[0].push('label:'+Date.now()+':'+t);
  mvcdRender();
  toast('Label added to line 1 — drag it into position','success');
}
function mvcdZonePlaceholder(z){if(z==='title')return 'Title';if(z==='right')return 'Right column';if(z==='chip')return 'Calendar chip — drag fields here (keep it short)';if(z&&z.indexOf('line:')===0)return 'Line '+(parseInt(z.slice(5),10)+1)+' — drag fields here';return z;}
function mvcdRender(){
  const cfg=cdCfg();
  const used=new Set(mvcdUsedKeys().map(mvKeyBase));
  const pal=document.getElementById(cfg.palette);
  if(pal){const rest=cfg.fields().filter(f=>!used.has(f.key));pal.innerHTML=rest.length?rest.map(f=>mvcdChip(f.key,'palette')).join(''):'<span class="mvcd-zone-empty">All fields placed — drag one back here to remove it</span>';}
  const zoneHtml=(zone,keys)=>keys.length?keys.map(k=>mvcdChip(k,zone)).join(''):'<span class="mvcd-zone-empty">'+mvcdZonePlaceholder(zone)+'</span>';
  (cfg.hasChip?['title','right','chip']:['title','right']).forEach(z=>{const el=document.querySelector('#'+cfg.modal+' .mvcd-zone[data-zone="'+z+'"]');if(el)el.innerHTML=zoneHtml(z,mvcdDraft[z]||[]);});
  const lw=document.getElementById(cfg.lines);
  if(lw)lw.innerHTML=mvcdDraft.lines.map((keys,i)=>{
    const z='line:'+i;
    return '<div style="display:flex;align-items:center;gap:6px">'
      +'<span class="mvcd-line-handle" draggable="true" ondragstart="mvcdLineDragStart(event,'+i+')" title="Drag to reorder line '+(i+1)+'">⠿</span>'
      +'<div class="mvcd-zone" style="flex:1" data-zone="'+z+'" ondragover="mvcdAllowDrop(event)" ondragleave="mvcdDragLeave(event)" ondrop="mvcdDrop(event,\''+z+'\')">'+zoneHtml(z,keys)+'</div>'
      +(mvcdDraft.lines.length>1?'<span class="x" style="cursor:pointer;color:var(--n400);font-weight:700;font-size:12px;padding:2px 4px" title="Delete line '+(i+1)+' (fields return to palette)" onclick="mvcdRemoveLine('+i+')">✕</span>':'')
      +'</div>';
  }).join('');
  mvcdPreview();
}
function mvcdPreview(){
  if(cdCtx==='fine'){
    const sample=(Array.isArray(allFines)&&allFines[0])?allFines[0]:FINECD_SAMPLE;
    const prev=fineCardLayout;fineCardLayout=mvcdDraft;
    let html='';try{html=fineCardHtml(sample);}catch(e){}
    fineCardLayout=prev;
    const pv=document.getElementById('fcd-preview');if(pv)pv.innerHTML=html;
    return;
  }
  if(cdCtx==='hire'){
    const sample=(Array.isArray(allHires)&&allHires[0])?allHires[0]:HIRECD_SAMPLE;
    const prev=hireCardLayout;hireCardLayout=mvcdDraft;
    let html='';try{html=kanCard(sample);}catch(e){}
    hireCardLayout=prev;
    const pv=document.getElementById('hcd-preview');if(pv)pv.innerHTML=html;
    return;
  }
  const sample=(Array.isArray(allMovements)&&allMovements[0])?allMovements[0]:MVCD_SAMPLE;
  const prev=movementCardLayout;movementCardLayout=mvcdDraft;
  let html='',chipTxt='';
  try{html=movementCard(sample);chipTxt=mvChipHtml(sample);}catch(e){}
  movementCardLayout=prev;
  const pv=document.getElementById('mvcd-preview');if(pv)pv.innerHTML=html;
  const cp=document.getElementById('mvcd-chip-preview');
  if(cp)cp.innerHTML='<span class="mvcal-chip mvcal-booked" style="display:inline-block;max-width:220px">'+chipTxt+'</span> <span style="font-size:10px;color:var(--n400)">← calendar chip</span>';
}
function mvcdDragStart(e,key,zone){mvcdDrag={kind:'chip',key,zone};try{e.dataTransfer.setData('text/plain',key);e.dataTransfer.effectAllowed='move';}catch(_){}}
function mvcdLineDragStart(e,i){mvcdDrag={kind:'line',index:i};try{e.dataTransfer.setData('text/plain','line:'+i);e.dataTransfer.effectAllowed='move';}catch(_){}e.stopPropagation();}
// Move a whole line so it sits where the target line currently is
function mvcdReorderLine(from,toZone){
  if(!toZone||toZone.indexOf('line:')!==0)return;
  let to=parseInt(toZone.slice(5),10);
  if(isNaN(to)||to===from)return;
  const l=mvcdDraft.lines.splice(from,1)[0];
  if(to>from)to--;
  mvcdDraft.lines.splice(to,0,l);
}
function mvcdAllowDrop(e){e.preventDefault();try{e.dataTransfer.dropEffect='move';}catch(_){}if(e.currentTarget&&e.currentTarget.classList)e.currentTarget.classList.add('mvcd-over');}
function mvcdDragLeave(e){if(e.currentTarget&&e.currentTarget.classList)e.currentTarget.classList.remove('mvcd-over');}
function mvcdChipOver(e){e.preventDefault();e.stopPropagation();}
function mvcdStripKey(key,scope){
  const arrs=scope==='chip'?[mvcdDraft.chip]:[mvcdDraft.title,mvcdDraft.right,...mvcdDraft.lines];
  arrs.forEach(a=>{const i=a.indexOf(key);if(i>=0)a.splice(i,1);});
}
function mvcdClearOver(){document.querySelectorAll('.mvcd-over').forEach(el=>el.classList.remove('mvcd-over'));}
function mvcdDrop(e,zone){
  e.preventDefault();mvcdClearOver();if(!mvcdDrag)return;
  if(mvcdDrag.kind==='line'){const from=mvcdDrag.index;mvcdDrag=null;mvcdReorderLine(from,zone);mvcdRender();return;}
  const key=mvcdDrag.key,origin=mvcdDrag.zone;mvcdDrag=null;
  if(zone==='palette'){
    // dropping on the palette removes it from where it came from
    const oa=mvcdZoneArr(origin);if(oa){const i=oa.indexOf(key);if(i>=0)oa.splice(i,1);}
    mvcdRender();return;
  }
  mvcdStripKey(key,zone==='chip'?'chip':'card');
  const a=mvcdZoneArr(zone);if(a)a.push(key);
  mvcdRender();
}
function mvcdDropOnChip(e,zone,targetKey){
  e.preventDefault();e.stopPropagation();mvcdClearOver();if(!mvcdDrag)return;
  if(mvcdDrag.kind==='line'){const from=mvcdDrag.index;mvcdDrag=null;mvcdReorderLine(from,zone);mvcdRender();return;}
  const key=mvcdDrag.key;mvcdDrag=null;
  if(key===targetKey)return;
  mvcdStripKey(key,zone==='chip'?'chip':'card');
  const arr=mvcdZoneArr(zone);if(!arr){mvcdRender();return;}
  const ti=arr.indexOf(targetKey);arr.splice(ti<0?arr.length:ti,0,key);
  mvcdRender();
}
function mvcdRemove(e,zone,key){e.stopPropagation();const a=mvcdZoneArr(zone);if(!a)return;const i=a.indexOf(key);if(i>=0)a.splice(i,1);mvcdRender();}
async function saveMvCardDesigner(){const layout=mvcdCloneLayout(mvcdDraft);movementCardLayout=layout;try{await sbReq('covase_config',{method:'POST',body:{key:'movement_card_layout',value:layout,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});toast('Movement card layout saved','success');closeMvCardDesigner();if(Array.isArray(allMovements))renderMovementsView();}catch(e){toast('Save failed: '+e.message+' (is covase_config applied?)','error');}}

// ─── Journey view: animated route + stats for a movement ───
let jvMap=null,jvToken=0;
function ensureLeaflet(){
  if(window.L)return Promise.resolve();
  if(window._leafletLoading)return window._leafletLoading;
  window._leafletLoading=new Promise((res,rej)=>{
    const css=document.createElement('link');css.rel='stylesheet';css.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';document.head.appendChild(css);
    const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';s.onload=res;s.onerror=()=>rej(new Error('Leaflet failed to load'));document.head.appendChild(s);
  });
  return window._leafletLoading;
}
function closeJourney(){jvToken++;document.getElementById('journey-modal').classList.remove('open');}
// CARTO withdrew its keyless basemaps: the tiles still return 200, but every
// one is stamped "API KEY REQUIRED", so the route drew over a watermark and
// nothing errored. The default is now OpenStreetMap, which needs no key.
// Settings takes a provider's own URL template to use anything else -- CARTO
// included, with whatever key parameter they hand you.
const JV_TILE_URL_DEFAULT='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const JV_TILE_ATTR_DEFAULT='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
function jvTileSource(){
  const url=(localStorage.getItem('covase_tile_url')||'').trim();
  const attr=(localStorage.getItem('covase_tile_attribution')||'').trim();
  return {url:url||JV_TILE_URL_DEFAULT, attribution:attr||JV_TILE_ATTR_DEFAULT};
}
function jvBrand(){return (getComputedStyle(document.documentElement).getPropertyValue('--covase')||'#0a7a72').trim()||'#0a7a72';}
// Count-up animation for a stat value
function jvCount(el,target,fmt,dur){
  const t0=performance.now();const tok=jvToken;
  const step=now=>{
    if(tok!==jvToken)return;
    const p=Math.min(1,(now-t0)/dur);const e=1-Math.pow(1-p,3); // ease-out cubic
    el.textContent=fmt(target*e);
    if(p<1)requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// Gentle curve between two points (fallback when no road route is available)
function jvArc(a,b){
  const pts=[];const n=64;
  const mLat=(a.lat+b.lat)/2,mLng=(a.lng+b.lng)/2;
  const dLat=b.lat-a.lat,dLng=b.lng-a.lng;
  const cLat=mLat-dLng*0.18,cLng=mLng+dLat*0.18; // control point perpendicular to the chord
  for(let i=0;i<=n;i++){const t=i/n;const u=1-t;
    pts.push([u*u*a.lat+2*u*t*cLat+t*t*b.lat,u*u*a.lng+2*u*t*cLng+t*t*b.lng]);}
  return pts;
}
function jvStat(v,l,extraCls,delay){return '<div class="jv-stat '+(extraCls||'')+'" style="animation-delay:'+delay+'ms"><div class="v">'+v+'</div><div class="l">'+esc(l)+'</div></div>';}
async function openJourney(id){
  const m=(allMovements||[]).find(x=>x.id===id);if(!m){toast('Movement not found','error');return;}
  const tok=++jvToken;
  document.getElementById('journey-modal').classList.add('open');
  document.getElementById('jv-title').textContent=(m.job_ref?m.job_ref+' · ':'')+(m.customer||'Movement');
  const from=[m.pickup_town,m.pickup_postcode].filter(Boolean).join(' ')||'?';
  const to=[m.dropoff_town,m.dropoff_postcode].filter(Boolean).join(' ')||'?';
  document.getElementById('jv-sub').textContent=from+'  →  '+to+(m.movement_date?'  ·  '+fmtUK(m.movement_date):'');
  document.getElementById('jv-status').textContent=mvStatusLabel(m.movement_status);
  // ── Stats panel (staggered entrance; numbers count up) ──
  const total=(parseFloat(m.invoice_total)||parseFloat(m.quote_total)||null);
  const mins=m.drive_time_minutes!=null?parseInt(m.drive_time_minutes,10):null;
  const stats=document.getElementById('jv-stats');
  stats.innerHTML=
    '<div class="jv-route">'
      +'<div class="jv-endpoint"><span class="jv-dot a"></span><div><strong>'+esc(m.pickup_town||m.pickup_postcode||'Pickup')+'</strong><div style="font-size:10.5px;color:var(--n400)">'+esc([m.pickup_address_line1,m.pickup_postcode].filter(Boolean).join(', '))+'</div></div></div>'
      +'<div class="jv-leg"></div>'
      +'<div class="jv-endpoint"><span class="jv-dot b"></span><div><strong>'+esc(m.dropoff_town||m.dropoff_postcode||'Dropoff')+'</strong><div style="font-size:10.5px;color:var(--n400)">'+esc([m.dropoff_address_line1,m.dropoff_postcode].filter(Boolean).join(', '))+'</div></div></div>'
    +'</div>'
    +jvStat('<span id="jv-n-miles">0</span>','Road miles','',60)
    +jvStat('<span id="jv-n-time">—</span>','Drive time','dark',140)
    +(total!=null?jvStat('<span id="jv-n-total">£0</span>','Job total (ex VAT)','',220):'')
    +((m.vehicle_reg||m.vehicle_makemodel)?jvStat(esc([m.vehicle_reg,m.vehicle_makemodel].filter(Boolean).join(' · ')),'Vehicle','dark',300):'')
    +(m.driver_name?jvStat(esc(m.driver_name),'Driver','dark',380):'')
    +(m.supplier?jvStat(esc(m.supplier),'Supplier','dark',460):'');
  if(m.mileage!=null)jvCount(document.getElementById('jv-n-miles'),parseFloat(m.mileage),v=>v.toFixed(1),1600);
  if(mins!=null){const el=document.getElementById('jv-n-time');jvCount(el,mins,v=>{const h=Math.floor(v/60),mm=Math.round(v%60);return h?h+'h '+mm+'m':mm+' min';},1600);}
  if(total!=null)jvCount(document.getElementById('jv-n-total'),total,v=>'£'+v.toFixed(0),1600);
  // ── Map + animated route ──
  const mapEl=document.getElementById('jv-map');
  const pc1=(m.pickup_postcode||'').trim(),pc2=(m.dropoff_postcode||'').trim();
  if(!pc1||!pc2){mapEl.innerHTML='<div class="jv-map-empty">Add pickup and dropoff postcodes to this movement to see the route.</div>';return;}
  mapEl.innerHTML='<div class="jv-map-empty">Plotting route…</div>';
  try{
    await ensureLeaflet();
    const [r1,r2]=await Promise.all([
      fetch('https://api.postcodes.io/postcodes/'+encodeURIComponent(pc1)).then(r=>r.json()),
      fetch('https://api.postcodes.io/postcodes/'+encodeURIComponent(pc2)).then(r=>r.json())
    ]);
    if(tok!==jvToken)return;
    const A=r1.result&&{lat:r1.result.latitude,lng:r1.result.longitude},B=r2.result&&{lat:r2.result.latitude,lng:r2.result.longitude};
    if(!A||!B){mapEl.innerHTML='<div class="jv-map-empty">Could not resolve one of the postcodes.</div>';return;}
    // Real road geometry when an ORS key is present; branded arc otherwise
    let latlngs=null;
    const orsKey=localStorage.getItem('covase_ors_api_key');
    if(orsKey){
      try{
        const rr=await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson',{method:'POST',headers:{'Authorization':orsKey,'Content-Type':'application/json'},body:JSON.stringify({coordinates:[[A.lng,A.lat],[B.lng,B.lat]]})});
        if(rr.ok){const j=await rr.json();const cs=j.features&&j.features[0]&&j.features[0].geometry&&j.features[0].geometry.coordinates;
          if(Array.isArray(cs)&&cs.length>1){const stepN=Math.max(1,Math.floor(cs.length/400));latlngs=cs.filter((_,i)=>i%stepN===0||i===cs.length-1).map(c=>[c[1],c[0]]);}}
      }catch(e){}
    }
    if(!latlngs)latlngs=jvArc(A,B);
    if(tok!==jvToken)return;
    mapEl.innerHTML='';
    if(jvMap){try{jvMap.remove();}catch(e){}jvMap=null;}
    jvMap=L.map('jv-map',{zoomControl:false,attributionControl:true,scrollWheelZoom:true});
    const tiles=jvTileSource();
    L.tileLayer(tiles.url,{maxZoom:19,attribution:tiles.attribution}).addTo(jvMap);
    const brand=jvBrand();
    const dot=(cls,bg)=>L.divIcon({className:'',html:'<div style="width:14px;height:14px;border-radius:50%;background:'+bg+';border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>',iconSize:[14,14],iconAnchor:[7,7]});
    L.marker([A.lat,A.lng],{icon:dot('a',brand)}).addTo(jvMap).bindTooltip(esc(m.pickup_town||pc1),{direction:'top',offset:[0,-8]});
    L.marker([B.lat,B.lng],{icon:dot('b','#0b1f2a')}).addTo(jvMap).bindTooltip(esc(m.dropoff_town||pc2),{direction:'top',offset:[0,-8]});
    L.polyline(latlngs,{color:'#9db8b3',weight:3,opacity:.45,dashArray:'6 8'}).addTo(jvMap); // ghost of the full route
    const prog=L.polyline([latlngs[0]],{color:brand,weight:4.5,opacity:.95}).addTo(jvMap);
    const truck=L.marker(latlngs[0],{icon:L.divIcon({className:'',html:'<div class="jv-truck-icon">🚗</div>',iconSize:[1,1]})}).addTo(jvMap);
    jvMap.fitBounds(L.latLngBounds(latlngs).pad(0.18));
    setTimeout(()=>{if(jvMap)jvMap.invalidateSize();},120);
    // Progressive draw over ~2.6s (ease-in-out), truck rides the tip
    const t0=performance.now(),DUR=5000,N=latlngs.length;
    const anim=now=>{
      if(tok!==jvToken)return;
      const p=Math.min(1,(now-t0)/DUR);
      const e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      const upto=Math.max(1,Math.round(e*(N-1)));
      prog.setLatLngs(latlngs.slice(0,upto+1));
      truck.setLatLng(latlngs[upto]);
      if(p<1)requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }catch(e){
    mapEl.innerHTML='<div class="jv-map-empty">Map unavailable ('+esc(e.message||'network')+') — stats still stand ➡</div>';
  }
}

function populateMovementSupplierDropdown(){
  const sel=document.getElementById('mv-supplier');if(!sel)return;
  const cur=sel.value;
  const sups=(allAccounts||[]).filter(a=>a.type==='supplier').slice().sort((a,b)=>(a.company_name||'').localeCompare(b.company_name||''));
  sel.innerHTML='<option value="">— select —</option>'+sups.map(a=>`<option value="${esc(a.id)}">${esc(a.company_name)}</option>`).join('');
  if(cur&&[...sel.options].some(o=>o.value===cur))sel.value=cur;
}
function populateMovementAccountDropdown(){
  const sel=document.getElementById('mv-account');if(!sel)return;
  const cur=sel.value;
  const clients=(allAccounts||[]).filter(a=>(a.type||'client')==='client').slice().sort((a,b)=>(a.company_name||'').localeCompare(b.company_name||''));
  sel.innerHTML='<option value="">— select —</option>'+clients.map(a=>`<option value="${esc(a.id)}">${esc(a.company_name)}</option>`).join('');
  if(cur)sel.value=cur;
}

function clearMovementForm(){
  window._pendingMvDriverContact=null;
  ['mv-customer-ref','mv-movement-date','mv-quote-date','mv-pickup-postcode','mv-pickup-addr1','mv-pickup-addr2','mv-pickup-town','mv-pickup-county',
   'mv-dropoff-postcode','mv-dropoff-addr1','mv-dropoff-addr2','mv-dropoff-town','mv-dropoff-county','mv-vehicle-reg','mv-vehicle-makemodel','mv-driver-name','mv-driver-dynamics-id',
   'mv-mileage','mv-drive-time','mv-markup','mv-override','mv-actual-fuel','mv-notes','mv-internal-notes',
   'mv-pickup-contact','mv-pickup-phone','mv-dropoff-contact','mv-dropoff-phone'
  ].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('mv-account').value='';
  const mvSup=document.getElementById('mv-supplier');if(mvSup)mvSup.value='';
  document.getElementById('mv-status').value='quoted';
  document.getElementById('mv-mileage-source').value='manual';
  document.getElementById('mv-vat-pct').value='20';
  document.getElementById('mv-fuel-markup-pct').value='20';
  movementSupps=[];renderMovementSupps();
  document.getElementById('mv-reconciliation').style.display='none';
  document.getElementById('mv-delete-btn').style.display='none';
  {const tb=document.getElementById('mv-thread-btn');if(tb)tb.style.display='none';}
  renderMovementSentState(null);
  window._mvCoords={};
  updateMovementCalc();
}

async function openNewMovement(){
  editMovementId=null;
  document.getElementById('movement-modal-title').textContent='New movement';
  clearMovementForm();
  document.getElementById('mv-quote-date').value=new Date().toISOString().split('T')[0];
  // Load accounts if not already
  if(!Array.isArray(allAccounts)||!allAccounts.length){try{allAccounts=await sbReq('covase_accounts?order=company_name.asc&limit=500');}catch(e){}}
  populateMovementAccountDropdown();
  populateMovementSupplierDropdown();
  document.getElementById('movement-modal').classList.add('open');
}

function openEditMovement(id){
  const m=allMovements.find(x=>x.id===id);if(!m)return;
  editMovementId=id;
  document.getElementById('movement-modal-title').textContent='Edit movement'+(m.job_ref?' · '+m.job_ref:'');
  clearMovementForm();
  populateMovementAccountDropdown();
  populateMovementSupplierDropdown();
  const f=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??''};
  f('mv-account',m.client_account_id||'');
  f('mv-customer-ref',m.customer_reference);
  f('mv-movement-date',m.movement_date);
  f('mv-quote-date',m.quote_date);
  f('mv-status',m.movement_status||'quoted');
  f('mv-supplier',m.supplier_account_id||'');
  f('mv-pickup-postcode',m.pickup_postcode);f('mv-pickup-addr1',m.pickup_address_line1);f('mv-pickup-addr2',m.pickup_address_line2);f('mv-pickup-town',m.pickup_town);f('mv-pickup-county',m.pickup_county);
  f('mv-dropoff-postcode',m.dropoff_postcode);f('mv-dropoff-addr1',m.dropoff_address_line1);f('mv-dropoff-addr2',m.dropoff_address_line2);f('mv-dropoff-town',m.dropoff_town);f('mv-dropoff-county',m.dropoff_county);
  f('mv-vehicle-reg',m.vehicle_reg);f('mv-vehicle-makemodel',m.vehicle_makemodel);
  f('mv-driver-name',m.driver_name);f('mv-driver-dynamics-id',m.driver_dynamics_id);
  f('mv-pickup-contact',m.pickup_contact_name);f('mv-pickup-phone',m.pickup_contact_phone);
  f('mv-dropoff-contact',m.dropoff_contact_name);f('mv-dropoff-phone',m.dropoff_contact_phone);
  renderMovementSentState(m);
  window._mvLastDriverName=m.driver_name||'';
  f('mv-mileage',m.mileage);f('mv-drive-time',m.drive_time_minutes);f('mv-mileage-source',m.mileage_source||'manual');
  f('mv-markup',m.markup_flat);f('mv-override',m.price_override);f('mv-vat-pct',m.vat_total!=null&&m.quote_total!=null&&parseFloat(m.quote_total)>parseFloat(m.vat_total)?(parseFloat(m.vat_total)/(parseFloat(m.quote_total)-parseFloat(m.vat_total))*100).toFixed(1):'20');
  f('mv-actual-fuel',m.actual_fuel_cost);f('mv-fuel-markup-pct',m.fuel_markup_pct||'20');
  f('mv-notes',m.notes);f('mv-internal-notes',m.internal_notes);
  movementSupps=Array.isArray(m.supplementaries)?m.supplementaries.map(x=>({...x})):[];
  renderMovementSupps();
  // Show reconciliation section if relevant
  const showReco=['completed_pending_fuel','invoiced','paid'].includes(m.movement_status);
  document.getElementById('mv-reconciliation').style.display=showReco?'':'none';
  document.getElementById('mv-delete-btn').style.display='';
  {const tb=document.getElementById('mv-thread-btn');if(tb)tb.style.display='';}
  updateMovementCalc();
  document.getElementById('movement-modal').classList.add('open');
}

function closeMovementModal(){document.getElementById('movement-modal').classList.remove('open');}

// ─── Movement supps repeater (parallel to hire supps but separate state) ───
const MV_SUPP_TYPES=['Ferry','Hotel','Fuel (pre-arranged)','Toll','Parking','Cleaning','Driver subsistence','Return travel','Other'];
function mvSuppCost(s){return parseFloat(s.cost_amount!=null?s.cost_amount:s.amount)||0;}
function mvSuppUpsell(s){return parseFloat(s.upsell_amount)||0;}
function addMovementSupp(){movementSupps.push({type:'Ferry',cost_amount:null,upsell_amount:null,vat_status:'full',notes:''});renderMovementSupps();updateMovementCalc();}
function removeMovementSupp(i){movementSupps.splice(i,1);renderMovementSupps();updateMovementCalc();}
function updateMovementSupp(i,field,val){
  if(!movementSupps[i])return;
  if(field==='cost_amount'||field==='upsell_amount')movementSupps[i][field]=val===''?null:parseFloat(val);
  else movementSupps[i][field]=val;
  updateMovementCalc();
}
function renderMovementSupps(){
  const wrap=document.getElementById('mv-supps');if(!wrap)return;
  if(!movementSupps.length){wrap.innerHTML='<div style="font-size:11px;color:#9ca3af;padding:6px 0">No supplementary charges. Click "+ Add supplementary" above.</div>';return;}
  wrap.innerHTML=movementSupps.map((s,i)=>{
    const cost=s.cost_amount!=null?s.cost_amount:(s.amount!=null?s.amount:'');
    const upsell=s.upsell_amount!=null?s.upsell_amount:'';
    return `
    <div class="form-row" style="align-items:end;gap:8px;margin-bottom:6px">
      <div class="form-field" style="flex:0 0 170px">
        <label>Type</label>
        <select onchange="updateMovementSupp(${i},'type',this.value)">
          ${MV_SUPP_TYPES.map(t=>`<option value="${esc(t)}"${s.type===t?' selected':''}>${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field" style="flex:0 0 100px">
        <label>Cost £</label>
        <input type="number" step="0.01" value="${cost}" placeholder="0.00" onchange="updateMovementSupp(${i},'cost_amount',this.value)">
      </div>
      <div class="form-field" style="flex:0 0 100px">
        <label>Charge £ <span style="font-size:9px;color:var(--n400);font-weight:400">(client)</span></label>
        <input type="number" step="0.01" value="${upsell}" placeholder="0.00" onchange="updateMovementSupp(${i},'upsell_amount',this.value)">
      </div>
      <div class="form-field" style="flex:0 0 140px">
        <label>VAT status</label>
        <select onchange="updateMovementSupp(${i},'vat_status',this.value)">
          <option value="full"${s.vat_status==='full'?' selected':''}>Full</option>
          <option value="outside_of_scope"${s.vat_status==='outside_of_scope'?' selected':''}>Outside of scope</option>
        </select>
      </div>
      <div class="form-field" style="flex:1">
        <label>Notes</label>
        <input value="${esc(s.notes||'')}" placeholder="e.g. Cairnryan-Belfast ferry" onchange="updateMovementSupp(${i},'notes',this.value)">
      </div>
      <button type="button" class="btn btn-delete" onclick="removeMovementSupp(${i})" style="flex:0 0 auto;margin-bottom:2px">✕</button>
    </div>`;
  }).join('');
}

// ─── Pricing calculator ───
// Base: £80 first 100 mi + £0.80/mi thereafter. VAT applies to the customer-
// facing amount on the vatable supps + base + markup. "Outside of scope" supps
// pass through without VAT. Markup is internal terminology only — never appears
// on any customer-facing text in this module.
function calcMovementTotals(){
  const mileage=parseFloat(document.getElementById('mv-mileage')?.value)||0;
  const markup=parseFloat(document.getElementById('mv-markup')?.value)||0;
  const vatPct=parseFloat(document.getElementById('mv-vat-pct')?.value)||20;
  let base=0;
  if(mileage>0){
    if(mileage<=100)base=80;
    else base=80+(mileage-100)*0.80;
  }
  // Use the charge (upsell_amount) for customer-facing total; fall back to cost.
  const suppsCharge=(s)=>{const v=parseFloat(s.upsell_amount);if(!isNaN(v))return v;return parseFloat(s.cost_amount)||0;};
  const suppsVatable=movementSupps.filter(s=>(s.vat_status||'full')==='full').reduce((acc,s)=>acc+suppsCharge(s),0);
  const suppsExempt=movementSupps.filter(s=>s.vat_status==='outside_of_scope').reduce((acc,s)=>acc+suppsCharge(s),0);
  const suppsTotal=suppsVatable+suppsExempt;
  // Base price override: replaces the mileage-calculated base only —
  // markup, supplementaries and VAT all still apply on top
  const ov=parseFloat(document.getElementById('mv-override')?.value);
  const override=(!isNaN(ov)&&ov>0)?ov:null;
  const jobExVat=(override!=null?override:base)+markup;
  const vatableSubtotal=jobExVat+suppsVatable;
  const vatAmount=vatableSubtotal*(vatPct/100);
  const subtotalExVat=vatableSubtotal+suppsExempt;
  const quoteTotal=subtotalExVat+vatAmount;
  return{base,markup,override,suppsTotal,subtotalExVat,vatAmount,quoteTotal,vatPct};
}

function calcMovementReconciliation(quoteTotal,vatPct){
  const fuelCost=parseFloat(document.getElementById('mv-actual-fuel')?.value)||0;
  const fuelMarkupPct=parseFloat(document.getElementById('mv-fuel-markup-pct')?.value)||0;
  const fuelMarkupAmount=fuelCost*(fuelMarkupPct/100);
  const fuelVatableExVat=fuelCost+fuelMarkupAmount;
  const fuelVat=fuelVatableExVat*(vatPct/100);
  const invoiceTotal=quoteTotal+fuelVatableExVat+fuelVat;
  return{fuelCost,fuelMarkupAmount,fuelVat,invoiceTotal};
}

function updateMovementCalc(){
  const t=calcMovementTotals();
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('mv-base-display','£'+(t.override!=null?t.override:t.base).toFixed(2)+(t.override!=null?' (override)':''));
  set('mv-markup-display','£'+t.markup.toFixed(2));
  set('mv-supps-display','£'+t.suppsTotal.toFixed(2));
  set('mv-subtotal-display','£'+t.subtotalExVat.toFixed(2));
  set('mv-vat-display','£'+t.vatAmount.toFixed(2));
  set('mv-total-display','£'+t.quoteTotal.toFixed(2));
  // Override note: show the spec price + what the formula would have charged
  const on=document.getElementById('mv-override-note');
  if(on){
    if(t.override!=null){
      on.style.display='';
      on.textContent='⚠ Base price override £'+t.override.toFixed(2)+' in use — calculated base would be £'+t.base.toFixed(2)+' (markup £'+t.markup.toFixed(2)+' still applied on top)';
    }else on.style.display='none';
  }
  // Reconciliation block (only relevant when shown, but harmless to update)
  const r=calcMovementReconciliation(t.quoteTotal,t.vatPct);
  set('mv-quote-recap','£'+t.quoteTotal.toFixed(2));
  set('mv-fuel-cost-display','£'+r.fuelCost.toFixed(2));
  set('mv-fuel-markup-display','£'+r.fuelMarkupAmount.toFixed(2));
  set('mv-fuel-vat-display','£'+r.fuelVat.toFixed(2));
  set('mv-invoice-display','£'+r.invoiceTotal.toFixed(2));
  // Toggle reconciliation section based on status
  const status=document.getElementById('mv-status')?.value||'quoted';
  const showReco=['completed_pending_fuel','invoiced','paid'].includes(status);
  const recoEl=document.getElementById('mv-reconciliation');if(recoEl)recoEl.style.display=showReco?'':'none';
}

// ─── Mileage lookup via Postcodes.io + OpenRouteService ───
async function lookupMovementMileage(){
  const apiKey=localStorage.getItem('covase_ors_api_key');
  if(!apiKey){toast('Set the OpenRouteService API key in Settings (⚙) first','error');return;}
  const pickupPc=(document.getElementById('mv-pickup-postcode').value||'').trim();
  const dropoffPc=(document.getElementById('mv-dropoff-postcode').value||'').trim();
  if(!pickupPc||!dropoffPc){toast('Both postcodes required','error');return;}
  const btn=document.getElementById('mv-lookup-btn');
  if(btn){btn.disabled=true;btn.textContent='Looking up…';}
  try{
    // Postcodes.io for postcode lat/lon — read-only: the mileage lookup never
    // writes to address fields, it only resolves coordinates for routing
    const [pRes,dRes]=await Promise.all([
      fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pickupPc)}`),
      fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(dropoffPc)}`)
    ]);
    if(!pRes.ok)throw new Error(`Pickup postcode not recognised (${pickupPc})`);
    if(!dRes.ok)throw new Error(`Dropoff postcode not recognised (${dropoffPc})`);
    const pickup=(await pRes.json()).result;
    const dropoff=(await dRes.json()).result;
    if(!pickup||!dropoff)throw new Error('Could not resolve one of the postcodes');
    // Routing is deliberately postcode-to-postcode (centroids): reliable and
    // plenty accurate for pricing. The street address fields are for the
    // supplier email and records, not the mileage calc.
    // OpenRouteService directions (driving-car). Returns distance in metres,
    // duration in seconds. Response shape can be either {routes:[...]} (json)
    // or {features:[...]} (geojson) — handle both defensively.
    const orsRes=await fetch('https://api.openrouteservice.org/v2/directions/driving-car',{
      method:'POST',
      headers:{'Authorization':apiKey,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({coordinates:[[pickup.longitude,pickup.latitude],[dropoff.longitude,dropoff.latitude]]})
    });
    if(!orsRes.ok){
      const txt=await orsRes.text();
      throw new Error(`OpenRouteService: ${orsRes.status} ${txt.slice(0,120)}`);
    }
    const data=await orsRes.json();
    let distMeters=null,durSeconds=null;
    if(data.routes&&data.routes[0]&&data.routes[0].summary){
      distMeters=data.routes[0].summary.distance;
      durSeconds=data.routes[0].summary.duration;
    }else if(data.features&&data.features[0]&&data.features[0].properties&&data.features[0].properties.summary){
      distMeters=data.features[0].properties.summary.distance;
      durSeconds=data.features[0].properties.summary.duration;
    }
    if(distMeters==null)throw new Error('Could not read distance from routing response');
    const miles=distMeters/1609.344;
    const minutes=Math.round(durSeconds/60);
    document.getElementById('mv-mileage').value=miles.toFixed(1);
    document.getElementById('mv-drive-time').value=String(minutes);
    document.getElementById('mv-mileage-source').value='openrouteservice';
    updateMovementCalc();
    toast(`Looked up: ${miles.toFixed(1)} mi · ${minutes} min`,'success');
  }catch(e){
    toast('Mileage lookup failed: '+e.message,'error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Look up mileage';}
  }
}

// ── PAF postcode lookup (Ideal Postcodes): postcode → full address list.
// Royal Mail data, ~3p/lookup — the residential-grade option. ORS autocomplete
// below remains the free fallback when no key is set.
// Movements name their fields mv-<prefix>-*, the hire delivery address names
// them hf-*. Same lookup either way -- only the ids differ.
function pafField(prefix,name){return prefix==='hire'?'hf-'+name:'mv-'+prefix+'-'+name;}
async function lookupPafAddresses(prefix){
  const key=localStorage.getItem('covase_idealpc_key');
  const res=document.getElementById(pafField(prefix,'postcode-results'));if(!res)return;
  if(!key){toast('Add your Ideal Postcodes API key in Settings (⚙) for PAF address lookup','error');return;}
  const pc=(document.getElementById(pafField(prefix,'postcode'))?.value||'').trim();
  if(!pc){toast('Enter a postcode first','error');return;}
  res.innerHTML='<div class="lookup-status">Looking up addresses…</div>';res.classList.add('open');
  try{
    const r=await fetch('https://api.ideal-postcodes.co.uk/v1/postcodes/'+encodeURIComponent(pc)+'?api_key='+encodeURIComponent(key));
    const j=await r.json();
    if(r.status===404){
      const sug=(j.suggestions||[]).slice(0,3);
      res.innerHTML='<div class="lookup-status">Postcode not found'+(sug.length?' — did you mean '+sug.map(esc).join(', ')+'?':'')+'</div>';
      return;
    }
    if(!r.ok)throw new Error(j.message||('HTTP '+r.status));
    const list=j.result||[];
    if(!list.length){res.innerHTML='<div class="lookup-status">No addresses for that postcode</div>';return;}
    window['_pafAddr_'+prefix]=list;
    res.innerHTML=list.map((a,i)=>'<div class="lookup-item" onclick="pickPafAddress(\''+prefix+'\','+i+')"><strong>'+esc([a.line_1,a.line_2].filter(Boolean).join(', '))+'</strong><div class="meta">'+esc([a.post_town,a.county,a.postcode].filter(Boolean).join(' · '))+'</div></div>').join('');
  }catch(e){res.innerHTML='<div class="lookup-status">⚠ Lookup failed: '+esc(e.message)+'</div>';}
}
function pickPafAddress(prefix,i){
  const a=(window['_pafAddr_'+prefix]||[])[i];if(!a)return;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v||'';};
  const addr1=a.line_1||'';
  const addr2=[a.line_2,a.line_3].filter(Boolean).join(', ');
  set(pafField(prefix,'addr1'),addr1);
  set(pafField(prefix,'addr2'),addr2);
  set(pafField(prefix,'town'),a.post_town?String(a.post_town).replace(/\b\w+/g,w=>w[0]+w.slice(1).toLowerCase()):'');
  if(a.county)set(pafField(prefix,'county'),a.county);
  if(a.postcode)set(pafField(prefix,'postcode'),a.postcode.toUpperCase());
  // PAF gives the property's exact coordinates — stash them for the mileage
  // route (signature guards against the address being edited afterwards)
  // Only the movement mileage route uses these; a hire has no routing.
  if(prefix!=='hire'){
    window._mvCoords=window._mvCoords||{};
    if(a.longitude!=null&&a.latitude!=null)window._mvCoords[prefix]={longitude:a.longitude,latitude:a.latitude,sig:addr1+'|'+(a.postcode||'').toUpperCase()};
    else delete window._mvCoords[prefix];
  }
  document.getElementById(pafField(prefix,'postcode-results')).classList.remove('open');
  if(prefix==='offhire')ohFieldChanged();
  toast('Address filled from Royal Mail PAF','success');
}
// ── Address autocomplete (ORS/Pelias): suggestions as you type in Address
// line 1, seeded with the postcode when present. OSM data — good but not PAF;
// manual entry always stands. Picking fills address/town/county/postcode. ──
let _mvAddrTimers={};
async function lookupMvAddress(prefix,q){
  clearTimeout(_mvAddrTimers[prefix]);
  const res=document.getElementById('mv-'+prefix+'-addr1-results');if(!res)return;
  if(!q||q.length<3){res.classList.remove('open');return;}
  const apiKey=localStorage.getItem('covase_ors_api_key');
  if(!apiKey){res.classList.remove('open');return;} // no key → plain manual field
  _mvAddrTimers[prefix]=setTimeout(async()=>{
    try{
      const pc=(document.getElementById('mv-'+prefix+'-postcode')?.value||'').trim();
      const text=q+(pc?' '+pc:'');
      const r=await fetch('https://api.openrouteservice.org/geocode/autocomplete?api_key='+encodeURIComponent(apiKey)+'&text='+encodeURIComponent(text)+'&boundary.country=GBR&size=6');
      if(!r.ok){res.classList.remove('open');return;}
      const j=await r.json();
      const feats=(j.features||[]).filter(f=>f.properties);
      if(!feats.length){res.innerHTML='<div class="lookup-status">No suggestions — keep typing manually</div>';res.classList.add('open');return;}
      window['_mvAddr_'+prefix]=feats;
      res.innerHTML=feats.map((f,i)=>{
        const p=f.properties;
        return '<div class="lookup-item" onclick="pickMvAddress(\''+prefix+'\','+i+')"><strong>'+esc(p.name||p.label||'')+'</strong><div class="meta">'+esc([p.locality||p.localadmin,p.county||p.region,p.postalcode].filter(Boolean).join(' · '))+'</div></div>';
      }).join('');
      res.classList.add('open');
    }catch(e){res.classList.remove('open');}
  },350);
}
function pickMvAddress(prefix,i){
  const f=(window['_mvAddr_'+prefix]||[])[i];if(!f)return;
  const p=f.properties||{};
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&v)e.value=v;};
  set('mv-'+prefix+'-addr1',p.name||p.label||'');
  {const e2=document.getElementById('mv-'+prefix+'-addr2');if(e2)e2.value='';}
  set('mv-'+prefix+'-town',p.locality||p.localadmin||'');
  set('mv-'+prefix+'-county',p.county||p.region||'');
  if(p.postalcode)set('mv-'+prefix+'-postcode',p.postalcode.toUpperCase());
  document.getElementById('mv-'+prefix+'-addr1-results').classList.remove('open');
  if(prefix==='offhire')ohFieldChanged();
}
// ── End-point contact lookup (pickup/dropoff): Dynamics typeahead, manual always allowed ──
let _endContactTimers={};
async function lookupEndContact(prefix,q){
  clearTimeout(_endContactTimers[prefix]);
  const res=document.getElementById('mv-'+prefix+'-contact-results');if(!res)return;
  if(!q||q.length<2){res.classList.remove('open');return;}
  const url=getConfig().n8nContact;
  if(!url){res.classList.remove('open');return;}
  res.innerHTML='<div class="lookup-status">Searching Dynamics…</div>';res.classList.add('open');
  _endContactTimers[prefix]=setTimeout(async()=>{
    try{
      const r=await fetch(url+'?q='+encodeURIComponent(q),{mode:'cors'});
      const data=await r.json();
      if(!Array.isArray(data)||!data.length){res.innerHTML='<div class="lookup-status">No matches — keep typing to enter manually</div>';return;}
      window['_endContactResults_'+prefix]=data.slice(0,8);
      res.innerHTML=window['_endContactResults_'+prefix].map((d,i)=>'<div class="lookup-item" onclick="pickEndContact(\''+prefix+'\','+i+')"><strong>'+esc(mvDriverName(d))+'</strong><div class="meta">'+esc([d.accountName,d.mobile].filter(Boolean).join(' · '))+'</div></div>').join('');
    }catch(e){res.innerHTML='<div class="lookup-status">⚠ Lookup failed — enter manually</div>';}
  },350);
}
function pickEndContact(prefix,i){
  const d=(window['_endContactResults_'+prefix]||[])[i];if(!d)return;
  document.getElementById('mv-'+prefix+'-contact').value=mvDriverName(d);
  if(d.mobile)document.getElementById('mv-'+prefix+'-phone').value=d.mobile;
  // Dynamics-first: the contact's address fills the endpoint too (when present)
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&v)e.value=v;};
  const a1=d.address1||'';
  if(a1)set('mv-'+prefix+'-addr1',a1);
  if(d.address2)set('mv-'+prefix+'-addr2',d.address2);
  if(d.town)set('mv-'+prefix+'-town',d.town);
  if(d.county)set('mv-'+prefix+'-county',d.county);
  if(d.postcode)set('mv-'+prefix+'-postcode',String(d.postcode).toUpperCase());
  if(a1||d.postcode)toast('Contact + address filled from Dynamics'+(!d.town?'':''),'success');
  else toast('Contact filled — no address on their Dynamics record, use 📮 Find addresses','error');
  document.getElementById('mv-'+prefix+'-contact-results').classList.remove('open');
  if(prefix==='offhire')ohFieldChanged();
}
// ── Movement request email (template in covase_config 'movement_booking_template') ──
const DEFAULT_MOVEMENT_TEMPLATE={
  subject:'Vehicle movement request - {customer} - {movementDate}',
  body:'Hi {supplierName},\n\nPlease can you arrange the following vehicle movement:\n\nVehicle: {vehicleReg} {makeModel}\nMovement date: {movementDate}\n\nCOLLECTION\n{pickupAddress}\nContact: {pickupContact} — {pickupPhone}\n\nDELIVERY\n{dropoffAddress}\nContact: {dropoffContact} — {dropoffPhone}\n\nEstimated mileage: {mileage} mi\n\n{notes}\n\nPlease confirm you can cover this job and your price.\n\nMany thanks,\nCovase'
};
let movementTemplate={...DEFAULT_MOVEMENT_TEMPLATE};
async function loadMovementTemplate(){try{const rows=await sbReq('covase_config?key=eq.movement_booking_template&select=value');const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;if(v&&(v.subject||v.body))movementTemplate={...DEFAULT_MOVEMENT_TEMPLATE,...v};}catch(e){}}
function openMovementTemplate(){document.getElementById('mvt-subject').value=movementTemplate.subject;document.getElementById('mvt-body').value=movementTemplate.body;document.getElementById('mv-template-modal').classList.add('open');}
function movementTemplateReset(){document.getElementById('mvt-subject').value=DEFAULT_MOVEMENT_TEMPLATE.subject;document.getElementById('mvt-body').value=DEFAULT_MOVEMENT_TEMPLATE.body;}
async function saveMovementTemplate(){
  movementTemplate={subject:document.getElementById('mvt-subject').value,body:document.getElementById('mvt-body').value};
  try{await sbReq('covase_config',{method:'POST',body:{key:'movement_booking_template',value:movementTemplate,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});toast('Template saved','success');document.getElementById('mv-template-modal').classList.remove('open');if(document.getElementById('mv-send-modal').classList.contains('open'))openMovementSend();}
  catch(e){toast('Save failed: '+e.message,'error');}
}
function movementTokens(extraNote){
  const g=id=>(document.getElementById(id)?.value||'').trim();
  const acc=(allAccounts||[]).find(a=>a.id===g('mv-account'));
  const sup=(allAccounts||[]).find(a=>a.id===g('mv-supplier'));
  const addr=p=>[g('mv-'+p+'-addr1'),g('mv-'+p+'-addr2'),g('mv-'+p+'-town'),g('mv-'+p+'-county'),g('mv-'+p+'-postcode')].filter(Boolean).join(', ');
  return {
    supplierName:sup?sup.company_name:'',customer:acc?acc.company_name:'',
    vehicleReg:g('mv-vehicle-reg').toUpperCase(),makeModel:g('mv-vehicle-makemodel'),driver:g('mv-driver-name'),
    movementDate:g('mv-movement-date')?fmtUK(g('mv-movement-date')):'TBC',
    pickupAddress:addr('pickup'),pickupContact:g('mv-pickup-contact')||'—',pickupPhone:g('mv-pickup-phone')||'—',
    dropoffAddress:addr('dropoff'),dropoffContact:g('mv-dropoff-contact')||'—',dropoffPhone:g('mv-dropoff-phone')||'—',
    mileage:g('mv-mileage')||'?',notes:extraNote||''
  };
}
function openMovementSend(){
  if(!editMovementId){toast('Save the movement first, then send','error');return;}
  const sid=document.getElementById('mv-supplier')?.value;
  const sup=(allAccounts||[]).find(a=>a.id===sid);
  const email=sup&&sup.booking_email?sup.booking_email:'';
  const warn=document.getElementById('mvs-warn'),sb=document.getElementById('mvs-send-btn');
  if(!sid){warn.style.display='';warn.textContent='Pick a supplier in the movement first.';sb.disabled=true;sb.style.opacity='0.5';}
  else if(!email){warn.style.display='';warn.textContent='No booking email on "'+(sup?sup.company_name:'')+'" — add one in CRM → Accounts.';sb.disabled=true;sb.style.opacity='0.5';}
  else{warn.style.display='none';sb.disabled=false;sb.style.opacity='';}
  const t=movementTokens(document.getElementById('mvs-notes')?.value||'');
  document.getElementById('mvs-summary').innerHTML='<strong>To: '+esc(t.supplierName||'—')+(email?' &lt;'+esc(email)+'&gt;':'')+'</strong><div style="font-size:11px;color:var(--n500)">From: logistics@covase.co.uk</div>';
  mvsRebuild(true);
  document.getElementById('mv-send-modal').classList.add('open');
}
let mvsDirty=false;
function mvsRebuild(force){
  if(mvsDirty&&!force)return;
  const t=movementTokens((document.getElementById('mvs-notes')?.value||'').trim());
  const se=document.getElementById('mvs-subject'),be=document.getElementById('mvs-body');
  if(se)se.value=fineRender(movementTemplate.subject,t);
  if(be)be.value=fineRender(movementTemplate.body,t);
  mvsDirty=false;
}
async function doMovementSend(){
  const m=(allMovements||[]).find(x=>x.id===editMovementId);if(!m)return;
  const sup=(allAccounts||[]).find(a=>a.id===document.getElementById('mv-supplier')?.value);
  const email=sup&&sup.booking_email;if(!email){toast('No supplier booking email','error');return;}
  const url=getConfig().n8nSupplierBooking;if(!url){toast('Set the supplier booking webhook in Settings','error');return;}
  const subjEdited=(document.getElementById('mvs-subject')?.value||'').trim();
  const bodyText=(document.getElementById('mvs-body')?.value||'').trim();
  if(!subjEdited||!bodyText){toast('Subject and body needed — hit ↻ Rebuild if they are empty','error');return;}
  const subject=subjEdited+' ['+(m.job_ref||('CVM:'+editMovementId))+']';
  const bodyHtml='<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">'+esc(bodyText).replace(/\n/g,'<br>')+'</div>';
  const btn=document.getElementById('mvs-send-btn');btn.disabled=true;btn.textContent='Sending…';
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:email,from:'logistics@covase.co.uk',subject:subject,bodyHtml:bodyHtml,customer:m.customer||''})});
    if(!r.ok)throw new Error('Webhook returned '+r.status);
    const now=new Date().toISOString();
    try{await sbReq('covase_supplier_replies',{method:'POST',body:{id:'sr-mvout-'+Date.now(),movement_id:editMovementId,direction:'outbound',outcome:'movement_request',subject:subject,raw_body:bodyText,from_email:'logistics@covase.co.uk',received_at:now,status:'sent'},prefer:'return=minimal'});}catch(e){}
    try{await sbReq('covase_movements?id=eq.'+encodeURIComponent(editMovementId),{method:'PATCH',body:{supplier_email_sent_at:now,updated_at:now},prefer:'return=minimal'});}catch(e){}
    if(m)m.supplier_email_sent_at=now;
    renderMovementSentState(m);
    toast('Movement request sent to '+sup.company_name,'success');
    document.getElementById('mv-send-modal').classList.remove('open');
  }catch(e){toast('Send failed: '+e.message,'error');}
  finally{btn.disabled=false;btn.textContent='Send request';}
}
function renderMovementSentState(m){
  const el=document.getElementById('mv-supplier-sent');if(!el)return;
  if(m&&m.supplier_email_sent_at){const d=new Date(m.supplier_email_sent_at);el.textContent='✓ Request sent '+d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});el.style.color='var(--covase)';}
  else{el.textContent='';}
}

// ─── Movement vehicle + driver Dynamics lookups (manual entry always allowed) ───
let _mvVehicleResults=[], _mvVehicleTimer=null, _mvDriverResults=[], _mvDriverTimer=null;

// Defensive field readers — n8n/Dynamics response shape may vary, so try several
// common key names and fall back to building make+model from parts.
function _pick(o,keys){for(const k of keys){if(o&&o[k]!=null&&o[k]!=='')return String(o[k]);}return '';}
function mvVehReg(v){return _pick(v,['reg','registration','vrm','vehicleReg','regNumber','plate','numberPlate']);}
function mvVehMakeModel(v){
  const mm=_pick(v,['makeModel','make_model','makemodel','description','vehicle','model']);
  if(mm)return mm;
  return [_pick(v,['make','manufacturer']),_pick(v,['modelName','model'])].filter(Boolean).join(' ');
}
function mvDriverName(d){return d.fullName||((d.firstName||d.first_name||'')+' '+(d.lastName||d.last_name||'')).trim();}

async function lookupMovementVehicle(q){
  clearTimeout(_mvVehicleTimer);
  const res=document.getElementById('mv-vehicle-results');if(!res)return;
  if(!q||q.length<2){res.classList.remove('open');return;}
  const url=getConfig().n8nVehicle;
  if(!url){res.innerHTML='<div class="lookup-status">⚙ Set vehicle lookup webhook in Settings (you can still type manually)</div>';res.classList.add('open');return;}
  res.innerHTML='<div class="lookup-status">Searching Dynamics…</div>';res.classList.add('open');
  _mvVehicleTimer=setTimeout(async()=>{
    try{
      const r=await fetch(`${url}?q=${encodeURIComponent(q)}`,{mode:'cors'});
      const data=await r.json();
      if(!Array.isArray(data)||!data.length){res.innerHTML='<div class="lookup-status">No matches in Dynamics — keep typing to enter manually</div>';return;}
      _mvVehicleResults=data.slice(0,8);
      res.innerHTML=_mvVehicleResults.map((v,i)=>`<div class="lookup-item" onclick="selectMovementVehicle(${i})"><strong>${esc(mvVehReg(v)||'—')}</strong><div class="meta">${esc(mvVehMakeModel(v))}</div></div>`).join('');
    }catch(e){res.innerHTML='<div class="lookup-status">⚠ Lookup failed — check webhook (you can still type manually)</div>';}
  },350);
}
function selectMovementVehicle(idx){
  const v=_mvVehicleResults[idx];if(!v)return;
  document.getElementById('mv-vehicle-results').classList.remove('open');
  const reg=mvVehReg(v),mm=mvVehMakeModel(v);
  if(reg)document.getElementById('mv-vehicle-reg').value=reg.toUpperCase();
  if(mm)document.getElementById('mv-vehicle-makemodel').value=mm;
  toast('Vehicle filled from Dynamics','success');
}

async function lookupMovementDriver(q){
  clearTimeout(_mvDriverTimer);
  const res=document.getElementById('mv-driver-results');if(!res)return;
  // Drop the stored Dynamics id if the user edits away from the matched name
  const hid=document.getElementById('mv-driver-dynamics-id');
  if(hid&&hid.value&&q!==(window._mvLastDriverName||''))hid.value='';
  if(!q||q.length<2){res.classList.remove('open');return;}
  const url=getConfig().n8nContact;
  if(!url){res.innerHTML='<div class="lookup-status">⚙ Set contact lookup webhook in Settings (you can still type manually)</div>';res.classList.add('open');return;}
  res.innerHTML='<div class="lookup-status">Searching Dynamics…</div>';res.classList.add('open');
  _mvDriverTimer=setTimeout(async()=>{
    try{
      const r=await fetch(`${url}?q=${encodeURIComponent(q)}`,{mode:'cors'});
      const data=await r.json();
      if(!Array.isArray(data)||!data.length){res.innerHTML='<div class="lookup-status">No matches — keep typing to enter manually</div>';return;}
      _mvDriverResults=data.slice(0,8);
      res.innerHTML=_mvDriverResults.map((d,i)=>{
        const meta=[d.jobTitle,d.accountName,d.email].filter(Boolean).join(' · ');
        return `<div class="lookup-item" onclick="selectMovementDriver(${i})"><strong>${esc(mvDriverName(d)||'—')}</strong><div class="meta">${esc(meta)}</div></div>`;
      }).join('');
    }catch(e){res.innerHTML='<div class="lookup-status">⚠ Lookup failed — check webhook (you can still type manually)</div>';}
  },350);
}
function selectMovementDriver(idx){
  const d=_mvDriverResults[idx];if(!d)return;
  document.getElementById('mv-driver-results').classList.remove('open');
  const nm=mvDriverName(d);
  document.getElementById('mv-driver-name').value=nm;
  document.getElementById('mv-driver-dynamics-id').value=d.contactId||d.dynamicsId||d.dynamics_id||'';
  window._mvLastDriverName=nm;
  window._pendingMvDriverContact=d;
  toast('Driver filled from Dynamics','success');
}

async function saveMovement(){
  const accountId=document.getElementById('mv-account').value;
  if(!accountId){toast('Customer account required','error');return;}
  const account=(allAccounts||[]).find(a=>a.id===accountId);
  if(!account){toast('Customer account not found','error');return;}
  // Save a Dynamics-matched movement driver into Contacts (linked to this customer).
  if(window._pendingMvDriverContact){const _r=await createContactFromDynamics(window._pendingMvDriverContact,accountId);if(_r)window._pendingMvDriverContact=null;}
  const cleanSupps=movementSupps
    .filter(s=>(mvSuppCost(s)||mvSuppUpsell(s)))
    .map(s=>({type:s.type||'Other',cost_amount:mvSuppCost(s),upsell_amount:mvSuppUpsell(s),vat_status:s.vat_status||'full',notes:(s.notes||'').trim()||null}));
  const t=calcMovementTotals();
  const status=document.getElementById('mv-status').value;
  let actualFuel=parseFloat(document.getElementById('mv-actual-fuel').value);if(isNaN(actualFuel))actualFuel=null;
  let fuelMarkupPct=parseFloat(document.getElementById('mv-fuel-markup-pct').value);if(isNaN(fuelMarkupPct))fuelMarkupPct=null;
  const r=actualFuel!=null?calcMovementReconciliation(t.quoteTotal,t.vatPct):null;
  const payload={
    client_account_id:accountId,
    customer:account.company_name,
    customer_reference:document.getElementById('mv-customer-ref').value.trim()||null,
    supplier_account_id:document.getElementById('mv-supplier')?.value||null,
    supplier:(()=>{const sid=document.getElementById('mv-supplier')?.value;if(!sid)return null;const a=(allAccounts||[]).find(x=>x.id===sid);return a?a.company_name:null;})(),
    pickup_postcode:(document.getElementById('mv-pickup-postcode').value||'').trim().toUpperCase()||null,
    pickup_address_line1:document.getElementById('mv-pickup-addr1').value.trim()||null,
    pickup_address_line2:document.getElementById('mv-pickup-addr2').value.trim()||null,
    pickup_town:document.getElementById('mv-pickup-town').value.trim()||null,
    pickup_county:document.getElementById('mv-pickup-county').value.trim()||null,
    dropoff_postcode:(document.getElementById('mv-dropoff-postcode').value||'').trim().toUpperCase()||null,
    dropoff_address_line1:document.getElementById('mv-dropoff-addr1').value.trim()||null,
    dropoff_address_line2:document.getElementById('mv-dropoff-addr2').value.trim()||null,
    dropoff_town:document.getElementById('mv-dropoff-town').value.trim()||null,
    dropoff_county:document.getElementById('mv-dropoff-county').value.trim()||null,
    vehicle_reg:(document.getElementById('mv-vehicle-reg').value||'').replace(/\s+/g,'').toUpperCase()||null,
    vehicle_makemodel:document.getElementById('mv-vehicle-makemodel').value.trim()||null,
    driver_name:document.getElementById('mv-driver-name').value.trim()||null,
    driver_dynamics_id:document.getElementById('mv-driver-dynamics-id').value.trim()||null,
    pickup_contact_name:document.getElementById('mv-pickup-contact')?.value.trim()||null,
    pickup_contact_phone:document.getElementById('mv-pickup-phone')?.value.trim()||null,
    dropoff_contact_name:document.getElementById('mv-dropoff-contact')?.value.trim()||null,
    dropoff_contact_phone:document.getElementById('mv-dropoff-phone')?.value.trim()||null,
    mileage:parseFloat(document.getElementById('mv-mileage').value)||null,
    mileage_source:document.getElementById('mv-mileage-source').value||null,
    drive_time_minutes:parseInt(document.getElementById('mv-drive-time').value,10)||null,
    base_charge:t.base,
    markup_flat:t.markup,
    price_override:t.override,
    supplementaries:cleanSupps,
    vat_total:t.vatAmount,
    quote_total:t.quoteTotal,
    actual_fuel_cost:actualFuel,
    fuel_markup_pct:fuelMarkupPct,
    fuel_markup_amount:r?r.fuelMarkupAmount:null,
    invoice_total:r?r.invoiceTotal:null,
    movement_status:status,
    quote_date:document.getElementById('mv-quote-date').value||null,
    movement_date:document.getElementById('mv-movement-date').value||null,
    notes:document.getElementById('mv-notes').value.trim()||null,
    internal_notes:document.getElementById('mv-internal-notes').value.trim()||null,
    updated_at:new Date().toISOString()
  };
  try{
    if(editMovementId){
      await sbReq(`covase_movements?id=eq.${encodeURIComponent(editMovementId)}`,{method:'PATCH',body:payload,prefer:'return=minimal'});
      const idx=allMovements.findIndex(x=>x.id===editMovementId);
      if(idx>=0)allMovements[idx]={...allMovements[idx],...payload};
      toast('Movement updated','success');
    }else{
      const newId='mov-'+Date.now();
      const res=await sbReq('covase_movements',{method:'POST',body:{...payload,id:newId}});
      const created=Array.isArray(res)?res[0]:(res||{...payload,id:newId});
      allMovements.unshift(created);
      toast('Movement saved','success');
    }
    closeMovementModal();movementsLoaded=false;loadMovements();
  }catch(e){toast('Save failed: '+e.message,'error');}
}

async function deleteMovementFromModal(){
  if(!editMovementId)return;
  if(!confirm('Delete this movement? Cannot be undone.'))return;
  try{
    await sbReq(`covase_movements?id=eq.${encodeURIComponent(editMovementId)}`,{method:'DELETE',prefer:'return=minimal'});
    allMovements=allMovements.filter(m=>m.id!==editMovementId);
    toast('Movement deleted','success');
    closeMovementModal();
    updateMovementStats();renderMovementsView();updateBadges();
  }catch(e){toast('Delete failed: '+e.message,'error');}
}

// Re-check reconciliation visibility when status changes in the modal
document.addEventListener('change',e=>{if(e.target&&e.target.id==='mv-status')updateMovementCalc();});

