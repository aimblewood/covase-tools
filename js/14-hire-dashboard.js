// ─── SHORT-HIRE DASHBOARD ───
// Same idea as the fines dashboard: a row of fixed headline tiles, then
// widgets anyone can add/remove/reorder/rename. The widget list is shared via
// covase_config key 'hire_dashboard' (no SQL — config row only). Charts reuse
// dashChartBody() from the fines file; this file adds hire metrics, groupings,
// a per-widget scope (all / open / on hire / finished / cancelled) and
// "action list" widgets (ending soon, missing details…) that open the booking.
// Reads allHires as loadHires() left it (latest 500 by start date).
let hireDashCfg=null;
const HD_DAY=86400000;
// Date-only strings → UTC midnight, so month slicing ignores BST shifts.
function hdDate(v){if(!v)return null;const s=String(v).slice(0,10);const t=Date.parse(s+'T00:00:00Z');return isNaN(t)?null:t;}
function hdToday(){const n=new Date();return Date.UTC(n.getFullYear(),n.getMonth(),n.getDate());}
function hdNum(v){const n=parseFloat(v);return isNaN(n)?0:n;}
// Days that count for money: a month slice carries its own; otherwise daysOn().
function hdDays(h){return h._days!=null?h._days:(daysOn(h)||0);}
// Extras (supplementaries) belong to the booking once — on its first slice only.
function hdExtras(h,fn){return h._slice&&!h._first?0:fn(h);}
function hdCost(h){return hdDays(h)*hdNum(h.cost_per_day)+hdExtras(h,suppTotal);}
function hdProfit(h){return hdDays(h)*hdNum(h.upsell_per_day)+hdExtras(h,suppUpsellTotal);}
function hdCharge(h){return hdDays(h)*(hdNum(h.cost_per_day)+hdNum(h.upsell_per_day)+hdNum(h.rft_per_day))+hdExtras(h,suppTotal)+hdExtras(h,suppUpsellTotal);}
const hdSum=fn=>rows=>rows.reduce((s,h)=>s+fn(h),0);
const HIRE_METRICS={
  count:{label:'Number of bookings',fn:rows=>rows.length,fmt:v=>String(v)},
  days:{label:'Days on hire',fn:hdSum(hdDays),fmt:v=>Math.round(v).toLocaleString('en-GB')},
  avg_days:{label:'Average days on hire',fn:rows=>{const r=rows.filter(h=>h.start_date&&hdDate(h.start_date)<=hdToday());return r.length?r.reduce((s,h)=>s+hdDays(h),0)/r.length:null;},fmt:v=>v==null?'—':v.toFixed(1)+' days'},
  cost:{label:'Cost to date (£)',fn:hdSum(hdCost),fmt:v=>fmtMoney(v)},
  charge:{label:'Client charge to date (£)',fn:hdSum(hdCharge),fmt:v=>fmtMoney(v)},
  profit:{label:'Profit to date (£)',fn:hdSum(hdProfit),fmt:v=>fmtMoney(v)},
  margin:{label:'Margin on cost (%)',fn:rows=>{const c=rows.reduce((s,h)=>s+hdCost(h),0);return c?rows.reduce((s,h)=>s+hdProfit(h),0)/c*100:null;},fmt:v=>v==null?'—':v.toFixed(1)+'%'},
  avg_upsell:{label:'Average upsell per day (£)',fn:rows=>{const r=rows.filter(h=>h.upsell_per_day!=null&&h.upsell_per_day!=='');return r.length?r.reduce((s,h)=>s+hdNum(h.upsell_per_day),0)/r.length:null;},fmt:v=>v==null?'—':fmtMoney(v)}
};
const HD_BANDS=[[7,'Up to a week'],[14,'1–2 weeks'],[28,'2–4 weeks'],[56,'1–2 months'],[Infinity,'Over 2 months']];
// Split each booking into one slice per calendar month it was on hire, so
// "by month on hire" spreads a long hire's days/cost/profit across the months
// it actually ran (and counts it in each of them).
function hdMonthSlices(rows){
  const today=hdToday(),out=[];
  rows.forEach(h=>{
    const s=hdDate(h.start_date);if(s==null||s>today)return;
    const endD=hdDate(h.end_date);const e=endD!=null&&endD<today?endD:today;
    let d=new Date(s),first=true;
    while(true){
      const ms=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),next=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);
      if(ms>e)break;
      const a=Math.max(s,ms),b=Math.min(e,next);
      const days=Math.max(0,Math.round((b-a)/HD_DAY));
      if(days>0||first)out.push(Object.assign({},h,{_slice:true,_first:first,_days:days,_month:new Date(ms).toISOString().slice(0,7)}));
      first=false;d=new Date(next);
      if(next>e)break;
    }
  });
  return out;
}
const HIRE_GROUPS={
  customer:{label:'Client',key:h=>h.customer||'—'},
  supplier:{label:'Supplier',key:h=>h.supplier||'Not recorded'},
  status:{label:'Status',key:h=>hireStatusLabel(h.hire_status)||'—'},
  billing:{label:'Billing status',key:h=>({'pending':'Billing pending','invoiced-in':'Invoiced in','recharged':'Recharged','paid':'Paid'}[h.billing_status]||'Billing pending')},
  month_on:{label:'Month (days on hire)',ordered:true,expand:hdMonthSlices,key:h=>h._month||'Unknown'},
  month:{label:'Month started',ordered:true,key:h=>h.start_date?String(h.start_date).slice(0,7):'Unknown'},
  driver:{label:'Driver',key:h=>h.driver||'—'},
  category:{label:'Vehicle category',key:h=>h.category||'Not recorded'},
  make:{label:'Make',key:h=>{const w=String(h.make_model||'').trim().split(/\s+/)[0];if(!w)return 'Not recorded';const t=w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();return typeof lsMake==='function'?lsMake(t):t;}},
  fuel:{label:'Fuel',key:h=>h.fuel_type||'Not recorded'},
  county:{label:'Delivery county',key:h=>h.delivery_county||'Not recorded'},
  length:{label:'Length of hire',ordered:true,order:k=>HD_BANDS.findIndex(b=>b[1]===k),key:h=>{const d=daysOn(h);if(d==null)return HD_BANDS[0][1];return HD_BANDS.find(b=>d<=b[0])[1];}}
};
const HIRE_SCOPES={
  all:{label:'all bookings',fn:h=>h.hire_status!=='cancelled'},
  open:{label:'open bookings',fn:h=>['pending','requested','booked','active'].includes(h.hire_status)},
  on_hire:{label:'on hire now',fn:h=>h.hire_status==='active'},
  finished:{label:'off-hired',fn:h=>h.hire_status==='offhired'},
  cancelled:{label:'cancelled',fn:h=>h.hire_status==='cancelled'}
};
// Action lists: "things that need doing", each row opens the booking.
const HIRE_LISTS={
  ending:{label:'Ending in the next 7 days',empty:'Nothing ends this week.',
    rows:(rs,t)=>rs.filter(h=>['booked','active'].includes(h.hire_status)&&hdDate(h.end_date)!=null&&hdDate(h.end_date)>=t&&hdDate(h.end_date)<=t+7*HD_DAY).sort((a,b)=>hdDate(a.end_date)-hdDate(b.end_date)),
    right:(h,t)=>{const d=Math.round((hdDate(h.end_date)-t)/HD_DAY);return d===0?'ends today':(d===1?'ends tomorrow':'ends '+fmtUK(h.end_date));}},
  starting:{label:'Starting in the next 7 days',empty:'No bookings start this week.',
    rows:(rs,t)=>rs.filter(h=>['pending','requested','booked'].includes(h.hire_status)&&hdDate(h.start_date)!=null&&hdDate(h.start_date)>=t&&hdDate(h.start_date)<=t+7*HD_DAY).sort((a,b)=>hdDate(a.start_date)-hdDate(b.start_date)),
    right:h=>fmtUK(h.start_date)+' · '+hireStatusLabel(h.hire_status)},
  unconfirmed:{label:'Starting soon, not yet booked',empty:'Every booking starting in the next 3 days is confirmed.',
    rows:(rs,t)=>rs.filter(h=>['pending','requested'].includes(h.hire_status)&&hdDate(h.start_date)!=null&&hdDate(h.start_date)<=t+3*HD_DAY).sort((a,b)=>hdDate(a.start_date)-hdDate(b.start_date)),
    right:h=>hireStatusLabel(h.hire_status)+' · starts '+fmtUK(h.start_date),warn:true},
  long:{label:'On hire over 28 days',empty:'No hire has run past 28 days.',
    rows:rs=>rs.filter(h=>h.hire_status==='active'&&(daysOn(h)||0)>28).sort((a,b)=>(daysOn(b)||0)-(daysOn(a)||0)),
    right:h=>daysOn(h)+' days'},
  open_ended:{label:'On hire with no end date',empty:'Every live hire has an end date.',
    rows:rs=>rs.filter(h=>h.hire_status==='active'&&!h.end_date).sort((a,b)=>(daysOn(b)||0)-(daysOn(a)||0)),
    right:h=>daysOn(h)+' days so far'},
  missing:{label:'Open bookings missing details',empty:'No open booking is missing a reg, supplier or cost.',
    rows:rs=>rs.filter(h=>['booked','active'].includes(h.hire_status)&&hdMissing(h).length),
    right:h=>'no '+hdMissing(h).join(', '),warn:true},
  recharge:{label:'Awaiting recharge',empty:'Nothing waiting to be recharged.',
    rows:rs=>rs.filter(h=>h.billing_status==='invoiced-in'&&!h.outgoing_invoice_id).sort((a,b)=>(hdDate(a.end_date)||0)-(hdDate(b.end_date)||0)),
    right:h=>fmtMoney(hdCharge(h))}
};
function hdMissing(h){const m=[];if(!h.vehicle_reg)m.push('reg');if(!h.supplier)m.push('supplier');if(h.cost_per_day==null||h.cost_per_day==='')m.push('cost/day');return m;}
const HIRE_CHART_TYPES=Object.assign({},typeof FINE_CHART_TYPES!=='undefined'?FINE_CHART_TYPES:{bars:'Bars',columns:'Columns',donut:'Donut',line:'Line',stat:'Stat tile'});
const DEFAULT_HIRE_DASH=[
  {t:'list',l:'ending'},{t:'list',l:'starting'},
  {m:'profit',g:'month_on',t:'columns'},{m:'count',g:'customer',t:'bars',s:'on_hire'},
  {m:'count',g:'supplier',t:'donut'},{m:'avg_days',g:'supplier',t:'bars',s:'finished'},
  {m:'margin',g:'customer',t:'bars'},{m:'count',g:'length',t:'columns'},
  {t:'list',l:'unconfirmed'},{t:'list',l:'missing'}
];
async function loadHireDashCfg(){try{const rows=await sbReq('covase_config?key=eq.hire_dashboard&select=value');const v=Array.isArray(rows)&&rows[0]?rows[0].value:null;hireDashCfg=Array.isArray(v)?v:DEFAULT_HIRE_DASH.map(w=>Object.assign({},w));}catch(e){hireDashCfg=DEFAULT_HIRE_DASH.map(w=>Object.assign({},w));}}
function hireDashSave(){sbReq('covase_config',{method:'POST',body:{key:'hire_dashboard',value:hireDashCfg,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'}).catch(e=>toast('Dashboard save failed: '+e.message,'error'));}

lsInjectView('view-hires-dashboard',`
  <div class="topbar">
    <h1>Bookings dashboard</h1>
    <div style="display:flex;align-items:center;gap:10px;margin-right:auto;margin-left:14px;font-size:12px;color:var(--n500);flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:6px"><span>Client</span>
        <select id="hd-client" onchange="renderHireDash()" style="font-size:12px;padding:3px 6px;border:1px solid var(--n200);border-radius:6px;background:#fff;min-width:160px"><option value="">All clients</option></select></label>
      <label style="display:flex;align-items:center;gap:6px"><span>On hire during</span>
        <select id="hd-period" onchange="renderHireDash()" style="font-size:12px;padding:3px 6px;border:1px solid var(--n200);border-radius:6px;background:#fff">
          <option value="">All time</option><option value="month">This month</option><option value="last_month">Last month</option><option value="3m">Last 3 months</option><option value="12m">Last 12 months</option><option value="year">This calendar year</option>
        </select></label>
    </div>
    <button class="topbar-btn" onclick="hiresLoaded=false;loadHireDashboard()">↻ Refresh</button>
    <button class="topbar-btn primary" onclick="openNewHire()">+ New Hire</button>
  </div>
  <div class="content" id="hire-dash"><div class="loading">Loading…</div></div>`);

async function loadHireDashboard(){
  const el=document.getElementById('hire-dash');if(!el||needsSetup(el))return;
  if(!hireDashCfg)await loadHireDashCfg();
  if(!hiresLoaded)await loadHires();
  renderHireDash();
}
// Period = bookings that were on hire at any point in the window (overlap),
// so a long hire that started earlier still counts in "this month".
function hdPeriodRange(p){
  const n=new Date(),y=n.getFullYear(),m=n.getMonth(),t=hdToday();
  if(p==='month')return [Date.UTC(y,m,1),t];
  if(p==='last_month')return [Date.UTC(y,m-1,1),Date.UTC(y,m,1)-HD_DAY];
  if(p==='3m')return [Date.UTC(y,m-2,1),t];
  if(p==='12m')return [Date.UTC(y,m-11,1),t];
  if(p==='year')return [Date.UTC(y,0,1),t];
  return null;
}
function hdFiltered(){
  const c=document.getElementById('hd-client')?.value||'';
  let rows=(allHires||[]).slice();
  if(c)rows=rows.filter(h=>(h.customer||'')===c);
  const r=hdPeriodRange(document.getElementById('hd-period')?.value||'');
  if(r)rows=rows.filter(h=>{const s=hdDate(h.start_date);if(s==null||s>r[1])return false;const e=hdDate(h.end_date);return e==null||e>=r[0];});
  return rows;
}
function hdTile(cls,label,val,sub,onclick){return '<div class="stat-card '+cls+'"'+(onclick?' style="cursor:pointer" onclick="'+onclick+'"':'')+'><div class="stat-label">'+esc(label)+'</div><div class="stat-val">'+esc(val)+'</div><div class="stat-sub">'+esc(sub)+'</div></div>';}
function hdTiles(){
  // Headline tiles follow the client filter but always describe "now".
  const c=document.getElementById('hd-client')?.value||'';
  const rows=(allHires||[]).filter(h=>!c||(h.customer||'')===c);
  const t=hdToday(),n=new Date();
  const onHire=rows.filter(h=>h.hire_status==='active');
  const monthStart=Date.UTC(n.getFullYear(),n.getMonth(),1);
  const monthProfit=hdMonthSlices(rows.filter(h=>h.hire_status!=='cancelled')).filter(s=>hdDate(s._month+'-01')===monthStart).reduce((s,h)=>s+h._days*hdNum(h.upsell_per_day),0);
  const fin=rows.filter(h=>h.hire_status==='offhired'&&hdDate(h.end_date)!=null&&hdDate(h.end_date)>=t-365*HD_DAY);
  const avg=fin.length?fin.reduce((s,h)=>s+(daysOn(h)||0),0)/fin.length:null;
  const rech=HIRE_LISTS.recharge.rows(rows,t);
  const startWk=HIRE_LISTS.starting.rows(rows,t).length,endWk=HIRE_LISTS.ending.rows(rows,t).length;
  return '<div class="stats-row" style="padding:0;margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))">'
    +hdTile('stat-orange','On hire now',String(onHire.length),'vehicles out')
    +hdTile('stat-indigo','This week',startWk+' in · '+endWk+' out','starting · ending, next 7 days')
    +hdTile('stat-green','Profit this month',fmtMoney(monthProfit),'daily upsell so far, excl. extras')
    +hdTile('stat-purple','Average hire length',avg==null?'—':avg.toFixed(1)+' days','off-hired in the last 12 months')
    +hdTile('stat-orange','Awaiting recharge',String(rech.length),fmtMoney(rech.reduce((s,h)=>s+hdCharge(h),0))+' to bill',"window._sbCurrentView='hires-recharge';showView('hires-recharge',document.querySelector('.sb-item[data-view=\\'hires-recharge\\']'))")
    +'</div>';
}
function hdWidgetTitle(w){
  if(w.title)return w.title;
  if(w.t==='list')return (HIRE_LISTS[w.l]||{label:'List'}).label;
  const M=HIRE_METRICS[w.m]||HIRE_METRICS.count,G=HIRE_GROUPS[w.g]||HIRE_GROUPS.customer,S=HIRE_SCOPES[w.s||'all']||HIRE_SCOPES.all;
  return (w.t==='stat'?M.label:M.label+' by '+G.label.toLowerCase())+(w.s&&w.s!=='all'?' — '+S.label:'');
}
function hdListBody(w){
  const L=HIRE_LISTS[w.l];if(!L)return '<div style="font-size:12px;color:var(--n400)">Unknown list</div>';
  const c=document.getElementById('hd-client')?.value||'';
  const t=hdToday();
  const rows=L.rows((allHires||[]).filter(h=>!c||(h.customer||'')===c),t);
  if(!rows.length)return '<div style="font-size:12px;color:var(--n400);padding:6px 0">✓ '+esc(L.empty)+'</div>';
  const shown=rows.slice(0,8);
  return '<div style="font-size:11px;color:var(--n500);margin:-2px 0 6px">'+rows.length+' booking'+(rows.length===1?'':'s')+'</div>'
    +shown.map(h=>'<div onclick="openEditHire(\''+esc(h.id)+'\')" style="display:flex;gap:8px;align-items:center;padding:6px 4px;border-top:1px solid var(--n100);cursor:pointer;font-size:12px" title="Open booking">'
      +'<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--n700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(h.customer||'—')+(h.job_ref?' <span style="color:var(--n400);font-weight:400">'+esc(h.job_ref)+'</span>':'')+'</div>'
      +'<div style="color:var(--n500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc([h.driver,h.vehicle_reg,h.supplier].filter(Boolean).join(' · ')||'—')+'</div></div>'
      +'<div style="flex-shrink:0;font-size:11px;'+(L.warn?'color:#b45309;font-weight:600':'color:var(--n500)')+'">'+esc(L.right(h,t))+'</div></div>').join('')
    +(rows.length>shown.length?'<div style="font-size:11px;color:var(--n400);padding-top:6px;border-top:1px solid var(--n100)">+ '+(rows.length-shown.length)+' more</div>':'');
}
function hdWidgetBody(w,rows){
  if(w.t==='list')return hdListBody(w);
  const M=HIRE_METRICS[w.m]||HIRE_METRICS.count,G=HIRE_GROUPS[w.g]||HIRE_GROUPS.customer,S=HIRE_SCOPES[w.s||'all']||HIRE_SCOPES.all;
  let r=rows.filter(S.fn);
  if(G.expand&&w.t!=='stat')r=G.expand(r);
  return dashChartBody(M,G,w,r,'bookings');
}
function hdMove(i,d){const j=i+d;if(j<0||j>=hireDashCfg.length)return;const x=hireDashCfg[i];hireDashCfg[i]=hireDashCfg[j];hireDashCfg[j]=x;hireDashSave();renderHireDash();}
function hdRemove(i){hireDashCfg.splice(i,1);hireDashSave();renderHireDash();}
function hdRename(i){const w=hireDashCfg[i];if(!w)return;const v=prompt('Widget title (leave blank for the automatic one):',w.title||hdWidgetTitle(w));if(v===null)return;const s=v.trim();if(s&&s!==hdWidgetTitle(Object.assign({},w,{title:''})))w.title=s;else delete w.title;hireDashSave();renderHireDash();}
function hdAddChart(){const g=id=>document.getElementById(id).value;const w={m:g('hdw-m'),g:g('hdw-g'),t:g('hdw-t')};const s=g('hdw-s');if(s&&s!=='all')w.s=s;hireDashCfg.push(w);hireDashSave();renderHireDash();}
function hdAddList(){hireDashCfg.push({t:'list',l:document.getElementById('hdw-l').value});hireDashSave();renderHireDash();}
function hdReset(){if(!confirm('Put the dashboard back to the standard set of widgets? This changes it for everyone.'))return;hireDashCfg=DEFAULT_HIRE_DASH.map(w=>Object.assign({},w));hireDashSave();renderHireDash();}
function renderHireDash(){
  const el=document.getElementById('hire-dash');if(!el)return;
  if(!hireDashCfg){loadHireDashCfg().then(renderHireDash);return;}
  const cs=document.getElementById('hd-client');
  if(cs){const cur=cs.value;const names=[...new Set((allHires||[]).map(h=>h.customer).filter(Boolean))].sort((a,b)=>a.localeCompare(b));cs.innerHTML='<option value="">All clients</option>'+names.map(n=>'<option value="'+esc(n)+'"'+(n===cur?' selected':'')+'>'+esc(n)+'</option>').join('');}
  const rows=hdFiltered();
  const sel='font-size:12px;padding:5px;border:1px solid var(--n200);border-radius:6px';
  const ctl='cursor:pointer;color:var(--n300);font-size:12px;padding:0 3px';
  const widgets=hireDashCfg.map((w,i)=>'<div class="clm-dash-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:6px"><div class="clm-dash-title" style="cursor:pointer" title="Click to rename" onclick="hdRename('+i+')">'+esc(hdWidgetTitle(w))+'</div>'
    +'<span style="white-space:nowrap">'+(i>0?'<span style="'+ctl+'" title="Move earlier" onclick="hdMove('+i+',-1)">‹</span>':'')+(i<hireDashCfg.length-1?'<span style="'+ctl+'" title="Move later" onclick="hdMove('+i+',1)">›</span>':'')+'<span style="'+ctl+'" title="Remove widget" onclick="hdRemove('+i+')">✕</span></span></div>'
    +hdWidgetBody(w,rows)+'</div>').join('');
  const o=obj=>Object.entries(obj).map(([k,v])=>'<option value="'+k+'">'+esc(typeof v==='string'?v:v.label)+'</option>').join('');
  const cap=(allHires||[]).length>=500?'<div style="font-size:11px;color:var(--n400);margin-top:10px">Based on the latest 500 bookings by start date.</div>':'';
  el.innerHTML=hdTiles()
    +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><span style="font-size:11px;color:var(--n500);font-weight:700">ADD CHART:</span>'
    +'<select id="hdw-m" style="'+sel+'">'+o(HIRE_METRICS)+'</select><span style="font-size:11px;color:var(--n500)">by</span>'
    +'<select id="hdw-g" style="'+sel+'">'+o(HIRE_GROUPS)+'</select><span style="font-size:11px;color:var(--n500)">as</span>'
    +'<select id="hdw-t" style="'+sel+'">'+o(HIRE_CHART_TYPES)+'</select><span style="font-size:11px;color:var(--n500)">for</span>'
    +'<select id="hdw-s" style="'+sel+'">'+o(HIRE_SCOPES)+'</select>'
    +'<button class="topbar-btn" onclick="hdAddChart()">＋ Add</button></div>'
    +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><span style="font-size:11px;color:var(--n500);font-weight:700">ADD LIST:</span>'
    +'<select id="hdw-l" style="'+sel+'">'+o(HIRE_LISTS)+'</select>'
    +'<button class="topbar-btn" onclick="hdAddList()">＋ Add</button>'
    +'<button class="topbar-btn" style="margin-left:auto" onclick="hdReset()">↺ Standard widgets</button></div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:12px">'+(widgets||'<div style="font-size:12px;color:var(--n400)">No widgets — add one above.</div>')+'</div>'
    +cap;
}
window.EXTRA_VIEW_LOADERS=Object.assign(window.EXTRA_VIEW_LOADERS||{},{'hires-dashboard':loadHireDashboard});
RT_TABLES.covase_hires=()=>{hiresLoaded=false;loadHires().then(()=>{if(currentViewId==='hires-dashboard')renderHireDash();});};
{const prevCfg=RT_TABLES.covase_config;RT_TABLES.covase_config=()=>{prevCfg&&prevCfg();if(hireDashCfg)loadHireDashCfg().then(()=>{if(currentViewId==='hires-dashboard')renderHireDash();});};}
