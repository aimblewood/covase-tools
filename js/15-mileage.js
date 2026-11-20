// ─── MILEAGE (lease contracts) ───
// Start of a wider mileage module (Simon, 20 Nov 2026). Today: the mid-term
// mileage amend calculator. Type a reg → Dynamics vehicle lookup (n8n webhook
// covase-vehicle-lookup, which now also returns deliveryDate, annualMileage,
// termMonths, funderName, funderQuoteNo, excessMileage, dehireDate) → enter the
// current odometer → straight-line projection to the contract end date.
// Nothing is saved yet (no SQL); every Dynamics value can be overtyped.
// Dynamics' own xpg_currentmileage is not used: on 20 Nov it read 0 on every
// vehicle with "last updated" = the moment of the query, i.e. never filled in.
let mlDynResults=[],mlDyn=null,_mlTimer=null;
const ML_DAY=86400000;
function mlDate(v){if(!v)return null;const t=Date.parse(String(v).slice(0,10)+'T00:00:00Z');return isNaN(t)?null:t;}
function mlIso(t){return t==null?'':new Date(t).toISOString().slice(0,10);}
function mlTodayIso(){const n=new Date();return mlIso(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()));}
// Same day-of-month N months on; clamps 31 Jan + 1 → 28/29 Feb.
function mlAddMonths(t,m){const d=new Date(t),y=d.getUTCFullYear(),mo=d.getUTCMonth()+m,day=d.getUTCDate();const last=new Date(Date.UTC(y,mo+1,0)).getUTCDate();return Date.UTC(y,mo,Math.min(day,last));}
function mlInt(id){const e=document.getElementById(id);if(!e)return null;const n=parseInt(String(e.value).replace(/[^0-9.-]/g,''),10);return isNaN(n)?null:n;}
function mlMiles(n){return n==null||isNaN(n)?'—':Math.round(n).toLocaleString('en-GB');}
// Whole months + leftover days between two dates, for "age" display.
function mlAge(a,b){if(a==null||b==null||b<a)return '—';let m=0;while(mlAddMonths(a,m+1)<=b)m++;const d=Math.round((b-mlAddMonths(a,m))/ML_DAY);return m+' month'+(m===1?'':'s')+(d?' '+d+' day'+(d===1?'':'s'):'');}

lsInjectView('view-mileage',`
  <div class="topbar"><h1>Mileage</h1></div>
  <div class="content" style="max-width:980px">
    <div class="notes-box"><strong>Mileage amend calculator.</strong> Look up the car, check the contract details from Dynamics, type the current mileage and the date it was read. It projects the mileage at contract end at the rate the car has done so far, ready to send to the lease company.</div>
    <div class="ml-grid">
      <div class="form-field" style="position:relative;grid-column:span 2"><label>Registration</label>
        <input id="ml-reg" placeholder="e.g. FN24EYD" autocomplete="off" oninput="mlLookup(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();mlLookup(this.value,true);}">
        <div class="lookup-results" id="ml-reg-results"></div></div>
      <div id="ml-veh" class="ml-veh" style="grid-column:span 2"></div>
    </div>
    <h3 class="ml-h">Contract</h3>
    <div class="ml-grid">
      <div class="form-field"><label>Delivery date</label><input type="date" id="ml-del" oninput="mlCalc()"></div>
      <div class="form-field"><label>Term (months)</label><input type="number" id="ml-term" min="1" oninput="mlCalc()"></div>
      <div class="form-field"><label>Annual mileage (contracted)</label><input type="number" id="ml-annual" min="0" step="1000" oninput="mlCalc()"></div>
      <div class="form-field"><label>Contract end</label><input type="date" id="ml-end" oninput="mlEndTouched=true;mlCalc()"><div class="ml-hint" id="ml-end-hint"></div></div>
    </div>
    <h3 class="ml-h">Current reading</h3>
    <div class="ml-grid">
      <div class="form-field"><label>Current mileage</label><input type="number" id="ml-odo" min="0" oninput="mlCalc()" placeholder="Odometer"></div>
      <div class="form-field"><label>Date of reading</label><input type="date" id="ml-odo-date" oninput="mlCalc()"></div>
    </div>
    <div id="ml-out"></div>
  </div>`);

let mlEndTouched=false;
function loadMileage(){const d=document.getElementById('ml-odo-date');if(d&&!d.value)d.value=mlTodayIso();mlCalc();}

function mlLookup(q,now){
  clearTimeout(_mlTimer);
  const res=document.getElementById('ml-reg-results');if(!res)return;
  const nq=normReg(q);
  if(nq.length<2){res.classList.remove('open');return;}
  const url=getConfig().n8nVehicle;
  if(!url){res.innerHTML='<div class="lookup-status">⚙ Set the vehicle lookup webhook in Settings — you can still type the details in below</div>';res.classList.add('open');return;}
  res.innerHTML='<div class="lookup-status">Searching Dynamics…</div>';res.classList.add('open');
  _mlTimer=setTimeout(async()=>{
    try{
      const r=await fetch(url+'?q='+encodeURIComponent(nq),{mode:'cors'});
      const data=await r.json();
      if(normReg(document.getElementById('ml-reg').value)!==nq)return; // typed on since
      if(!Array.isArray(data)||!data.length){res.innerHTML='<div class="lookup-status">Not found in Dynamics — you can type the details in below</div>';return;}
      // Exact reg first, then the rest; on-fleet cars before de-hired ones.
      const exact=data.filter(v=>normReg(v.reg)===nq);
      mlDynResults=(exact.length?exact:data).slice().sort((a,b)=>(a.fleetStatus==='On Fleet'?0:1)-(b.fleetStatus==='On Fleet'?0:1)).slice(0,8);
      if(exact.length===1&&now){mlPick(0);return;}
      res.innerHTML=mlDynResults.map((v,i)=>`<div class="lookup-item" onclick="mlPick(${i})"><strong>${esc(v.reg||'—')}${v.fleetStatus?' · '+esc(v.fleetStatus):''}</strong><div class="meta">${esc([v.makeModel,v.driverName,v.accountName].filter(Boolean).join(' · '))}${v.deliveryDate?' · delivered '+esc(fmtUK(v.deliveryDate)):''}</div></div>`).join('');
    }catch(e){res.innerHTML='<div class="lookup-status">⚠ Dynamics lookup failed — you can type the details in below</div>';}
  },now?0:400);
}
function mlPick(i){
  const v=mlDynResults[i];if(!v)return;mlDyn=v;
  document.getElementById('ml-reg-results').classList.remove('open');
  document.getElementById('ml-reg').value=(v.reg||'').toUpperCase();
  const set=(id,val)=>{document.getElementById(id).value=val==null?'':val;};
  set('ml-del',v.deliveryDate?String(v.deliveryDate).slice(0,10):'');
  set('ml-term',v.termMonths||'');
  set('ml-annual',v.annualMileage||'');
  mlEndTouched=false;document.getElementById('ml-end').value='';
  const odo=document.getElementById('ml-odo');odo.value='';
  const missing=[!v.deliveryDate&&'delivery date',!v.termMonths&&'term',!v.annualMileage&&'annual mileage'].filter(Boolean);
  toast(missing.length?'Filled from Dynamics — no '+missing.join(', ')+' recorded, please type it in':'Filled from Dynamics',missing.length?'error':'success');
  mlCalc();odo.focus();
}
function mlRenderVehicle(){
  const el=document.getElementById('ml-veh');if(!el)return;const v=mlDyn;
  if(!v){el.innerHTML='';return;}
  const bits=[['Vehicle',v.makeModel],['Driver',v.driverName],['Client',v.accountName],['Funder',v.funderName],['Funder quote no.',v.funderQuoteNo],['Fleet status',v.fleetStatus],v.dehireDate?['De-hire date',fmtUK(v.dehireDate)]:null].filter(b=>b&&b[1]);
  el.innerHTML='<div class="financials-row" style="flex-wrap:wrap;gap:6px 22px;margin:0">'+bits.map(b=>`<div><span>${esc(b[0])}</span><strong>${esc(b[1])}</strong></div>`).join('')+'</div>'
    +(v.fleetStatus&&v.fleetStatus!=='On Fleet'?`<div class="ml-warn">Dynamics has this car as <strong>${esc(v.fleetStatus)}</strong> — check it's the right one.</div>`:'');
}

// The working: straight-line rate so far, carried to the contract end.
function mlWork(){
  const del=mlDate(document.getElementById('ml-del').value),term=mlInt('ml-term'),annual=mlInt('ml-annual');
  const odo=mlInt('ml-odo'),read=mlDate(document.getElementById('ml-odo-date').value);
  const endIn=document.getElementById('ml-end');
  const calcEnd=del!=null&&term?mlAddMonths(del,term):null;
  if(!mlEndTouched)endIn.value=mlIso(calcEnd);
  const end=mlDate(endIn.value);
  document.getElementById('ml-end-hint').textContent=mlEndTouched&&calcEnd!=null&&end!==calcEnd?'Typed in — delivery + term gives '+fmtUK(mlIso(calcEnd)):(calcEnd!=null?'Delivery date + term':'');
  const w={del,term,annual,odo,read,end};
  w.allowance=annual&&term?Math.round(annual*term/12):null;
  if(del==null||end==null||odo==null||read==null)return w;
  w.elapsed=Math.round((read-del)/ML_DAY);w.total=Math.round((end-del)/ML_DAY);w.left=Math.round((end-read)/ML_DAY);
  if(w.elapsed<=0||w.total<=0)return w;
  w.perDay=odo/w.elapsed;w.perYear=w.perDay*365.25;
  w.predicted=Math.round(odo+w.perDay*Math.max(0,w.left));
  w.predictedUp=Math.ceil(w.predicted/1000)*1000;
  if(term)w.revisedAnnual=w.predicted/(term/12);
  if(w.allowance!=null){w.diff=w.predicted-w.allowance;w.pct=w.allowance?w.diff/w.allowance*100:null;}
  return w;
}
function mlCalc(){
  mlRenderVehicle();
  const out=document.getElementById('ml-out');if(!out)return;
  const w=mlWork();
  if(w.del==null||w.end==null){out.innerHTML='<div class="notes-box">Enter a delivery date and term (or contract end) to start.</div>';return;}
  if(w.odo==null||w.read==null){out.innerHTML='<div class="notes-box">Enter the current mileage and the date it was read.'+(w.allowance!=null?' Contract allowance is <strong>'+mlMiles(w.allowance)+' miles</strong>.':'')+'</div>';return;}
  if(!(w.elapsed>0)){out.innerHTML='<div class="ml-warn">The reading date must be after the delivery date.</div>';return;}
  const warn=[];
  if(w.elapsed<60)warn.push('The car has only been out '+w.elapsed+' days — a projection this early can be well off.');
  if(w.left<0)warn.push('The reading date is after the contract end, so this is the mileage at the reading, not a forecast.');
  if(w.term&&mlDyn&&mlDyn.termMonths&&w.term!==mlDyn.termMonths)warn.push('Term differs from Dynamics ('+mlDyn.termMonths+' months).');
  const over=w.diff!=null&&w.diff>0;
  const tile=(lbl,val,sub,cls)=>`<div class="stat-card ml-tile${cls?' '+cls:''}"><div class="ml-tl">${lbl}</div><div class="ml-tv">${val}</div>${sub?`<div class="ml-ts">${sub}</div>`:''}</div>`;
  let excess='';
  const ppm=mlDyn&&mlDyn.excessMileage;
  if(over&&ppm&&ppm<1)excess=`If not amended, excess at ${(ppm*100).toFixed(1)}p a mile (Dynamics) ≈ <strong>${fmtMoney(w.diff*ppm)}</strong>`;
  out.innerHTML=(warn.length?'<div class="ml-warn">'+warn.map(esc).join('<br>')+'</div>':'')
    +'<div class="ml-tiles">'
    +tile('Predicted end mileage',mlMiles(w.predicted),'Rounded up to the next 1,000: <strong>'+mlMiles(w.predictedUp)+'</strong>','ml-main')
    +tile('Contract allowance',w.allowance!=null?mlMiles(w.allowance):'—',w.annual&&w.term?mlMiles(w.annual)+' a year × '+w.term+' months':'Needs annual mileage and term')
    +tile(over?'Over allowance by':'Under allowance by',w.diff!=null?mlMiles(Math.abs(w.diff)):'—',w.pct!=null?Math.abs(w.pct).toFixed(1)+'% '+(over?'over':'under'):'',w.diff==null?'':over?'ml-bad':'ml-good')
    +tile('Running at',mlMiles(w.perYear)+' a year',mlMiles(w.perDay*30.44)+' a month'+(w.revisedAnnual?' · revised annual over the term: <strong>'+mlMiles(w.revisedAnnual)+'</strong>':''))
    +'</div>'
    +'<table class="ml-table">'
    +[['Delivered',fmtUK(mlIso(w.del))],['Reading',mlMiles(w.odo)+' miles on '+fmtUK(mlIso(w.read))],['Age at reading',mlAge(w.del,w.read)+' ('+w.elapsed+' days)'],['Contract end',fmtUK(mlIso(w.end))+' ('+w.total+' days in total)'],['Still to run',w.left>0?mlAge(w.read,w.end)+' ('+w.left+' days)':'—'],['Projection',mlMiles(w.odo)+' + '+w.perDay.toFixed(1)+' miles a day × '+Math.max(0,w.left)+' days = '+mlMiles(w.predicted)]]
      .map(r=>`<tr><td>${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')
    +(excess?`<tr><td>Excess</td><td>${excess}</td></tr>`:'')
    +'</table>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" onclick="mlCopy()">📋 Copy summary for the lease company</button></div>';
}
function mlSummary(){
  const w=mlWork();if(w.predicted==null)return '';
  const v=mlDyn||{},reg=(document.getElementById('ml-reg').value||'').toUpperCase();
  return [
    'Vehicle: '+[reg,v.makeModel].filter(Boolean).join(' – '),
    v.funderQuoteNo?'Your reference: '+v.funderQuoteNo:null,
    v.driverName?'Driver: '+v.driverName:null,
    'Delivered: '+fmtUK(mlIso(w.del))+(w.term?' · term '+w.term+' months':'')+' · contract end '+fmtUK(mlIso(w.end)),
    w.allowance!=null?'Current contract mileage: '+mlMiles(w.annual)+' a year ('+mlMiles(w.allowance)+' over the term)':null,
    'Current mileage: '+mlMiles(w.odo)+' on '+fmtUK(mlIso(w.read)),
    'Predicted end mileage: '+mlMiles(w.predicted)+(w.revisedAnnual?' ('+mlMiles(w.revisedAnnual)+' a year over the term)':''),
  ].filter(Boolean).join('\n');
}
async function mlCopy(){const t=mlSummary();if(!t)return;try{await navigator.clipboard.writeText(t);toast('Summary copied','success');}catch(e){prompt('Copy this:',t);}}

window.EXTRA_VIEW_LOADERS=Object.assign(window.EXTRA_VIEW_LOADERS||{},{'mileage':loadMileage});
