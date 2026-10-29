// ─── CAR CHOICE LISTS: ratebook import → whole life cost → client policy → driver lists ───
// A funder's ratebook (CSV or Excel) is read in the browser, never stored in the
// database: each row is one vehicle at one term/mileage. For the chosen term and
// mileage every car gets its whole life cost (finance + service + irrecoverable
// VAT + lease rental restriction + employer's NI, plus fuel / insurance where the
// policy says) and its company car tax for each tax year. A client policy then
// filters (fuel, range, brands, CO2, P11D) and sorts the survivors into grades by
// budget. Driver lists show the vehicle and the driver's tax only — never the WLC.
// Tax tables, fuel prices and rates: covase_config 'wlc_settings'. Policies:
// covase_config 'wlc_policies'. Anything a figure needs but the ratebook doesn't
// give (PHEV electric range, CO2) is flagged, never guessed.

// ── Defaults (tax tables copied from the Stihl WLC workbook, Aug 2026) ──
const CL_RANGE_BANDS=[['130+',130],['70-129',70],['40-69',40],['30-39',30],['<30',0]];
const CL_DEFAULT_SETTINGS={
  petrol_litre:1.58,diesel_litre:1.91,elec_kwh:0.2467,fuel_as_of:'',elec_as_of:'',
  // Battery sizes for cars whose description doesn't print one (Tesla). Used only when
  // neither the file nor the description gives a size; every word must appear.
  battery_rules:[{match:'Tesla Model 3 RWD',kwh:65},{match:'Tesla Model Y RWD',kwh:65},{match:'Tesla Model Y Long Range',kwh:85},{match:'Tesla Model Y Performance',kwh:85}],
  ni_rate:0.15,diesel_supplement:0.04,vat_rate:0.2,vat_unrecoverable_share:0.5,lrr_share:0.15,
  bik:{
    post:{years:['2021/22','2022/23','2023/24','2024/25','2025/26','2026/27','2027/28','2028/29','2029/30'],
      zero:[0,0.01,0.02,0.02,0.03,0.04,0.05,0.07,0.09],
      range:{'130+':[0,0.01,0.02,0.02,0.03,0.04,0.05,0.18,0.19],'70-129':[0.03,0.04,0.05,0.05,0.06,0.07,0.08,0.18,0.19],'40-69':[0.06,0.07,0.08,0.08,0.09,0.1,0.11,0.18,0.19],'30-39':[0.1,0.11,0.12,0.12,0.13,0.14,0.15,0.18,0.19],'<30':[0.12,0.13,0.14,0.14,0.15,0.16,0.17,0.18,0.19]},
      co2:[[51,0.13,0.14,0.15,0.15,0.16,0.17,0.18,0.19,0.2],[55,0.14,0.15,0.16,0.16,0.17,0.18,0.19,0.2,0.21],[60,0.15,0.16,0.17,0.17,0.18,0.19,0.2,0.21,0.22],[65,0.16,0.17,0.18,0.18,0.19,0.2,0.21,0.22,0.23],[70,0.17,0.18,0.19,0.19,0.2,0.21,0.21,0.22,0.23],[75,0.18,0.19,0.2,0.2,0.21,0.21,0.21,0.22,0.23],[80,0.19,0.2,0.21,0.21,0.22,0.22,0.22,0.23,0.24],[85,0.2,0.21,0.22,0.22,0.23,0.23,0.23,0.24,0.25],[90,0.21,0.22,0.23,0.23,0.24,0.24,0.24,0.25,0.26],[95,0.22,0.23,0.24,0.24,0.25,0.25,0.25,0.26,0.27],[100,0.23,0.24,0.25,0.25,0.26,0.26,0.26,0.27,0.28],[105,0.24,0.25,0.26,0.26,0.27,0.27,0.27,0.28,0.29],[110,0.25,0.26,0.27,0.27,0.28,0.28,0.28,0.29,0.3],[115,0.26,0.27,0.28,0.28,0.29,0.29,0.29,0.3,0.31],[120,0.27,0.28,0.29,0.29,0.3,0.3,0.3,0.31,0.32],[125,0.28,0.29,0.3,0.3,0.31,0.31,0.31,0.32,0.33],[130,0.29,0.3,0.31,0.31,0.32,0.32,0.32,0.33,0.34],[135,0.3,0.31,0.32,0.32,0.33,0.33,0.33,0.34,0.35],[140,0.31,0.32,0.33,0.33,0.34,0.34,0.34,0.35,0.36],[145,0.32,0.33,0.34,0.34,0.35,0.35,0.35,0.36,0.37],[150,0.33,0.34,0.35,0.35,0.36,0.36,0.36,0.37,0.38],[155,0.34,0.35,0.36,0.36,0.37,0.37,0.37,0.38,0.39],[160,0.35,0.36,0.37,0.37,0.37,0.37,0.37,0.38,0.39],[165,0.36,0.37,0.37,0.37,0.37,0.37,0.37,0.38,0.39],[170,0.37,0.37,0.37,0.37,0.37,0.37,0.37,0.38,0.39]]},
    // Registered before 6 April 2020. The workbook only holds these to 2024/25 and
    // gives one rate for every 1-50g/km car, so the range bands all carry it.
    pre:{years:['2021/22','2022/23','2023/24','2024/25'],
      zero:[0,0.01,0.02,0.02],
      range:{'130+':[0.14,0.14,0.14,0.14],'70-129':[0.14,0.14,0.14,0.14],'40-69':[0.14,0.14,0.14,0.14],'30-39':[0.14,0.14,0.14,0.14],'<30':[0.14,0.14,0.14,0.14]},
      co2:[[51,0.15,0.15,0.15,0.15],[55,0.16,0.16,0.16,0.16],[60,0.17,0.17,0.17,0.17],[65,0.18,0.18,0.18,0.18],[70,0.19,0.19,0.19,0.19],[75,0.2,0.2,0.2,0.2],[80,0.21,0.21,0.21,0.21],[85,0.22,0.22,0.22,0.22],[90,0.23,0.23,0.23,0.23],[95,0.24,0.24,0.24,0.24],[100,0.25,0.25,0.25,0.25],[105,0.26,0.26,0.26,0.26],[110,0.27,0.27,0.27,0.27],[115,0.28,0.28,0.28,0.28],[120,0.29,0.29,0.29,0.29],[125,0.3,0.3,0.3,0.3],[130,0.31,0.31,0.31,0.31],[135,0.32,0.32,0.32,0.32],[140,0.33,0.33,0.33,0.33],[145,0.34,0.34,0.34,0.34],[150,0.35,0.35,0.35,0.35],[155,0.36,0.36,0.36,0.36],[160,0.37,0.37,0.37,0.37]]}
  }
};
const CL_FUELS=[['electric','Electric'],['phev','Plug-in hybrid'],['hybrid','Hybrid'],['petrol','Petrol'],['diesel','Diesel']];
const CL_BLANK_POLICY={name:'',account_id:'',term:48,mileage:20000,delivery_date:'',budget_basis:'monthly',budget_includes_fuel:true,insurance_pm:0,ni_basis:'term',corp_tax:0.25,profile_type:'ratebook',profile_upfront:3,commission:0,
  phev_mpg_factor:1,ev_range_factor:1,fuels:['electric','phev','hybrid','petrol','diesel'],min_ev_range:null,min_phev_range:null,max_co2:null,max_p11d:null,
  makes:[],exclude_words:[],grade_mode:'cumulative',grades:[],tax_years_shown:3,show_45:false,driver_note:''};
// The Stihl WLC workbook (Aug 2026) as a starting point for a new policy.
const CL_TEMPLATES={stihl:{name:'Stihl',term:48,mileage:20000,delivery_date:'2026-12-01',corp_tax:0.19,phev_mpg_factor:0.6,fuels:['electric','phev'],min_ev_range:275,min_phev_range:50,
  makes:['Audi','BMW','Mercedes','Kia','Hyundai','Volkswagen','Skoda','Polestar','Tesla','Cupra'],grades:[{name:'Senior Managers',budget:1100},{name:'Managers',budget:1000},{name:'Field Based Staff',budget:900}]}};

let clSettings=JSON.parse(JSON.stringify(CL_DEFAULT_SETTINGS));
let clPolicies=[],clPolicyId='',clRows=[],clFile=null,clImportNotes=[],clResults=[],clLoaded=false,clEditing=null;

// ── Shared config ──
async function clLoadConfig(){
  try{const r=await sbReq('covase_config?key=in.(wlc_settings,wlc_policies)&select=key,value');
    (r||[]).forEach(x=>{if(x.key==='wlc_settings'&&x.value)clSettings=Object.assign(JSON.parse(JSON.stringify(CL_DEFAULT_SETTINGS)),x.value);
      if(x.key==='wlc_policies'&&x.value)clPolicies=Array.isArray(x.value.list)?x.value.list:[];});}catch(e){}
}
async function clSaveConfig(key,value){await sbReq('covase_config',{method:'POST',body:{key,value,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});}
function clPolicy(){return clPolicies.find(p=>p.id===clPolicyId)||null;}

// ── Small helpers ──
function clN(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='number')return isFinite(v)?v:null;const n=parseFloat(String(v).replace(/[£,%\s]/g,''));return isNaN(n)?null:n;}
function clKey(h){return String(h||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function clPct(r){return r==null?'—':(Math.round(r*1000)/10)+'%';}
function clTaxYear(d){let y=d.getFullYear();if(d.getMonth()<3||(d.getMonth()===3&&d.getDate()<6))y--;return y+'/'+String(y+1).slice(2);}
function clIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function clDate(v){if(!v)return null;if(Object.prototype.toString.call(v)==='[object Date]')return isNaN(v)?null:v;const s=String(v).trim();let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m)return new Date(+(m[3].length===2?'20'+m[3]:m[3]),m[2]-1,+m[1]);m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?new Date(+m[1],m[2]-1,+m[3]):null;}
function clFuelCat(raw){const s=String(raw||'').toLowerCase();if(!s)return null;
  if(/plug.?in|phev/.test(s))return 'phev';if(/hybrid|mhev|hev/.test(s))return 'hybrid';if(/electric|^ev$|^bev$/.test(s))return 'electric';
  if(/diesel/.test(s))return 'diesel';if(/petrol|gasoline|unleaded/.test(s))return 'petrol';return null;}

// ── Ratebook reading ──
// Column headings are matched loosely (case, spaces and punctuation ignored).
// First alias that exists wins, so 'True MPG' beats a client-adjusted MPG column.
const CL_COLS={make:['manufacturer','make'],model:['modelname','model'],variant:['variant','derivative','vehicledescription','description'],cap:['capcode','capid'],
  fuel:['fueltype','fuel'],co2:['co2gperkm','co2','co2emissions','co2gkm'],p11d:['p11d','p11dvalue','p11dprice'],term:['term','termmonths','contractterm'],
  mileage:['mileage','annualmileage','milesperannum'],finance:['leaserental','financerental','finance'],service:['servicerental','maintenancerental','service'],
  ev_range:['evrange','electricmilerange','electricrange','wltpelectricrange'],battery:['batterysize','batterykwh','batterycapacity'],
  mpg:['truempg','fuelecocombined','mpg','combinedmpg','mpgcombined'],body:['bodystyle','body'],model_year:['modelyear'],commercial:['commercial'],
  rde:['rdecertificationlevel','rde'],transmission:['transmission'],otr:['otrp','otr','otrprice'],insurance_group:['insurancegroup'],
  excess_ppm:['excessmileage'],plan:['paymentplan','paymentprofile','profile'],reg_date:['delivery','registrationdate','regdate','dateofregistration']};
const CL_REQUIRED={make:'Manufacturer',fuel:'Fuel type',co2:'CO2',p11d:'P11D',term:'Term',mileage:'Mileage',finance:'Finance (lease) rental',service:'Service rental'};
function clParseCsv(text){
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"')q=true;else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;}
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(x=>String(x).trim()!==''));
}
function clMapHeader(hdr){const keys=hdr.map(clKey),map={};Object.entries(CL_COLS).forEach(([f,al])=>{for(const a of al){const i=keys.indexOf(a);if(i>=0){map[f]=i;break;}}});return map;}
async function clReadFile(file){
  let grid;
  if(/\.csv$/i.test(file.name)){
    const buf=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(buf);
    if(text.includes('�'))text=new TextDecoder('windows-1252').decode(buf); // funder exports are often Windows-encoded (£ signs)
    grid=clParseCsv(text.replace(/^﻿/,''));
  }else{
    await loadSheetJS();
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    // the sheet whose heading row maps the most required columns
    let best=null;
    wb.SheetNames.forEach(n=>{const g=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:null,raw:true});
      for(let i=0;i<Math.min(10,g.length);i++){const m=clMapHeader(g[i]||[]);const score=Object.keys(CL_REQUIRED).filter(k=>m[k]!=null).length;if(!best||score>best.score)best={score,grid:g.slice(i)};}});
    grid=best?best.grid:[];
  }
  if(grid.length<2)throw new Error('No rows found in that file');
  const map=clMapHeader(grid[0]);
  const missing=Object.keys(CL_REQUIRED).filter(k=>map[k]==null);if(map.variant==null&&map.model==null)missing.push('model');
  if(missing.length)throw new Error('This file is missing columns ORBIS needs: '+missing.map(k=>CL_REQUIRED[k]||'Model / variant').join(', '));
  const notes=[],seen=new Map();let dupes=0;const rows=[];
  grid.slice(1).forEach(r=>{
    const g=f=>map[f]==null?null:r[map[f]];const str=f=>{const v=g(f);return v==null?'':String(v).trim();};
    const make=str('make');if(!make)return;
    const model=str('model'),variant=str('variant');
    const desc=variant?(model&&!variant.toUpperCase().startsWith(model.toUpperCase())?model+' '+variant:variant):model;
    const kwh=clN(g('battery'))||(()=>{const m=desc.match(/(\d{2,3}(?:\.\d+)?)\s?kWh/i);return m?parseFloat(m[1]):null;})();
    const v={make,model,variant,desc,cap:str('cap'),fuel_raw:str('fuel'),fuel:clFuelCat(g('fuel')),diesel:/diesel/i.test(str('fuel')),co2:clN(g('co2')),p11d:clN(g('p11d')),
      term:clN(g('term')),mileage:clN(g('mileage')),finance:clN(g('finance')),service:clN(g('service')),ev_range:clN(g('ev_range')),battery:kwh,
      mpg:clN(g('mpg')),body:str('body'),model_year:str('model_year'),commercial:/^(y|yes|true|1)$/i.test(str('commercial')),rde2:/2/.test(str('rde')),
      transmission:str('transmission'),otr:clN(g('otr')),insurance_group:str('insurance_group'),excess_ppm:clN(g('excess_ppm')),plan:str('plan'),reg_date:(d=>d?clIso(d):null)(clDate(g('reg_date')))};
    const k=[v.cap||v.make+'|'+v.desc,v.term,v.mileage].join('|');
    if(seen.has(k)){dupes++;return;}seen.set(k,1);rows.push(v);
  });
  if(dupes)notes.push(dupes+' duplicate row'+(dupes>1?'s':'')+' (same vehicle, term and mileage) ignored — the first one in the file was kept');
  if(map.plan==null)notes.push('This file doesn\'t say what payment profile its rentals are based on, so a policy can\'t convert them to the client\'s profile or spread commission');
  const unk=rows.filter(v=>!v.fuel).length;if(unk)notes.push(unk+' row'+(unk>1?'s have a fuel type':' has a fuel type')+' ORBIS doesn\'t recognise — shown as needing data');
  return {rows,notes};
}
async function clImport(file){
  if(!file)return;
  try{const {rows,notes}=await clReadFile(file);clRows=rows;clImportNotes=notes;clFile={name:file.name,at:new Date().toISOString()};
    try{localStorage.setItem('covase_cl_ratebook',JSON.stringify({file:clFile,notes,rows}));}catch(e){} // per-machine convenience only
    const p=clPolicy();clFillTermMiles(p);toast(rows.length.toLocaleString('en-GB')+' ratebook rows read','success');clRender();
  }catch(e){toast(e.message,'error');}
}

// ── The sums ──
function clYearRate(v,year,preTable){
  const t=clSettings.bik[preTable?'pre':'post'];const i=t.years.indexOf(year);
  if(i<0)return {rate:null,why:'no '+year+' rates in the tax tables'};
  if(v.co2==null)return {rate:null,why:'no CO2 figure'};
  let rate;
  if(v.co2<=0)rate=t.zero[i];
  else if(v.co2<=50){
    // 1-50g/km: banded by electric range. A plug-in with no range can't be placed.
    if(v.ev_range==null&&v.fuel==='phev')return {rate:null,why:'plug-in hybrid with no electric range'};
    const r=v.ev_range||0;const band=CL_RANGE_BANDS.find(b=>r>=b[1]);rate=t.range[band[0]][i];
  }else{
    const row=[...t.co2].reverse().find(b=>v.co2>=b[0]);rate=row?row[i+1]:null;
  }
  if(rate==null)return {rate:null,why:'gap in the '+year+' tax table'};
  if(v.diesel&&!v.rde2){const cap=Math.max(...t.co2.map(b=>b[i+1]));rate=Math.min(cap,rate+clSettings.diesel_supplement);}
  return {rate};
}
// Payment profiles. A rental is one of (payments in advance + the monthly ones),
// so the sum of a contract is rental × payment count. 'Spread, 6 down' over 48
// months = 6+47 = 53 payments; 'terminal pause, 3 down' = 3+45 = 48 (= the term).
// Converting keeps the contract total and re-divides it by the client's count.
function clPlanCount(plan,term){
  const s=String(plan||'').toLowerCase();if(!s||!term)return null;
  const pm=s.match(/(\d+)\s*\+\s*(\d+)/);if(pm)return +pm[1]+ +pm[2];
  const d=s.match(/(\d+)\s*(?:down|up\s*front|upfront|in advance|advance)/);if(!d)return null;
  return /terminal|pause/.test(s)?term:+d[1]+term-1;
}
function clProfileCount(p,term){if(!p||p.profile_type==='ratebook'||!term)return null;const n=Math.max(1,parseInt(p.profile_upfront)||1);return p.profile_type==='terminal'?term:n+term-1;}
function clProfileLabel(p,term){if(!p||p.profile_type==='ratebook')return 'as the ratebook';const n=Math.max(1,parseInt(p.profile_upfront)||1);return p.profile_type==='terminal'?`${n}+${term-n} terminal pause`:`${n}+${term-1} spread`;}
// Battery size from the rules: the rule with the most words wins; two equally specific
// rules that disagree means no answer (flagged, not guessed).
function clBatteryRule(v){
  const toks=new Set(clWords(v.make+' '+v.desc));
  const hits=(clSettings.battery_rules||[]).filter(r=>r.kwh>0&&clWords(r.match).length&&clWords(r.match).every(w=>toks.has(w)));
  if(!hits.length)return null;
  const top=Math.max(...hits.map(r=>clWords(r.match).length)),best=hits.filter(r=>clWords(r.match).length===top);
  return new Set(best.map(r=>r.kwh)).size===1?{kwh:best[0].kwh,match:best[0].match}:{clash:best.map(r=>r.match)};
}
function clWords(s){return String(s||'').toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);}
// What a mile costs in petrol vs electricity: £ per gallon of petrol ÷ £ per kWh.
// Multiply a car's miles per kWh by it to get a cost-equivalent MPG ("MPGe") that
// drops into a petrol-style fuel economy column and gives the same fuel cost.
function clMpgeFactor(){const S=clSettings;return S.elec_kwh>0?S.petrol_litre*4.54609/S.elec_kwh:null;}
// Stale prices: fuel older than 7 days; electricity older than the start of the current
// Ofgem price-cap quarter (1 Jan / Apr / Jul / Oct).
function clPriceWarnings(){
  const S=clSettings,now=new Date(),w=[];
  const fd=clDate(S.fuel_as_of),ed=clDate(S.elec_as_of);
  const q=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1);
  if(!fd)w.push('fuel prices have no “as of” date');else if((now-fd)/864e5>7)w.push('fuel prices are from '+fmtUK(S.fuel_as_of)+' — more than a week old');
  if(!ed)w.push('the electricity price has no “as of” date');else if(ed<q)w.push('the electricity price is from '+fmtUK(S.elec_as_of)+', before the current price-cap quarter began on '+fmtUK(clIso(q)));
  return w;
}
// ── Adjusted cars: P11D, the funder's finance/service rentals and commission typed over the
// ratebook for one car (e.g. a revised quote with options). Kept per machine with the ratebook,
// applied everywhere (table, working sheet, driver lists) and marked ✎ so it's never mistaken
// for the funder's own figure. Rentals are entered on the ratebook's payment plan, as the
// funder quotes them; the policy's profile and commission are then applied as normal.
let clOverrides={},clSelected=new Set(),clLastPP=null;
function clRowKey(v){return [v.cap||v.make+'|'+v.desc,v.term,v.mileage].join('|');}
try{clOverrides=JSON.parse(localStorage.getItem('covase_cl_overrides')||'{}')||{};}catch(e){clOverrides={};}
function clSaveOverrides(){try{localStorage.setItem('covase_cl_overrides',JSON.stringify(clOverrides));}catch(e){}}
function clCalc(v0,p,ovr){
  const o=ovr!==undefined?ovr:clOverrides[clRowKey(v0)];
  // A different annual mileage takes the ratebook's own quote for this car at that mileage
  // (same CAP, term) when there is one; otherwise the rentals stay as they were and say so.
  let base=v0,noQuote=false;
  if(o&&o.mileage&&o.mileage!==v0.mileage){
    base=clRows.find(x=>x.term===v0.term&&x.mileage===o.mileage&&(v0.cap?x.cap===v0.cap:x.make===v0.make&&x.desc===v0.desc))||v0;
    noQuote=base===v0;
  }
  const v=o?Object.assign({},base,{mileage:o.mileage??base.mileage,p11d:o.p11d??base.p11d,finance:o.finance??base.finance,service:o.service??base.service}):v0;
  const commission=o&&o.commission!=null?o.commission:p.commission;
  const S=clSettings,out={v,orig:v0,edited:!!o,commission,flags:[],data:[]};
  if(noQuote&&(o.finance==null||o.service==null))out.flags.push('the ratebook has no quote at '+o.mileage.toLocaleString('en-GB')+' miles, so rentals are still the '+v0.mileage.toLocaleString('en-GB')+'-mile ones');
  // Re-profile the rentals, then spread commission over the client's payments (finance only)
  const src=clPlanCount(v.plan,v.term),dst=clProfileCount(p,v.term);
  out.finance=v.finance;out.service=v.service;out.commissionPm=0;out.payments=dst||src;
  if(dst){if(src){out.finance=v.finance*src/dst;out.service=v.service*src/dst;}else out.data.push(v.plan?'payment plan "'+v.plan+'" not understood':'ratebook gives no payment plan');}
  if(commission>0){if(out.payments){out.commissionPm=commission/out.payments;out.finance+=out.commissionPm;}else if(!out.data.length)out.data.push(v.plan?'payment plan "'+v.plan+'" not understood':'ratebook gives no payment plan');}
  const reg=clDate(v.reg_date)||clDate(p.delivery_date)||new Date();
  const pre=reg<new Date(2020,3,6);
  const term=p.term||v.term||0;
  out.vatLost=out.finance*S.vat_rate*S.vat_unrecoverable_share;
  // Lease rental restriction: 15% of the finance rental (incl. the VAT that can't be reclaimed)
  // is disallowed for corporation tax above the CO2 threshold for the car's registration date.
  const lrrLimit=reg>=new Date(2021,3,1)?50:reg>=new Date(2018,3,1)?110:130;
  out.lrr=v.co2!=null&&v.co2>lrrLimit?(out.finance+out.vatLost)*S.lrr_share*(p.corp_tax??0.25):0;
  // Company car tax by tax year, from the delivery date for as many years as the policy shows
  out.years=[];const startY=clTaxYear(reg);const y0=parseInt(startY);
  for(let k=0;k<Math.max(1,p.tax_years_shown||3);k++){const yl=(y0+k)+'/'+String(y0+k+1).slice(2);const r=clYearRate(v,yl,pre);out.years.push({year:yl,rate:r.rate,why:r.why});}
  const first=out.years[0];
  if(first.rate==null)out.data.push(first.why);
  out.bik=first.rate;out.bikValue=first.rate==null?null:v.p11d*first.rate;
  // Employer's NI (Class 1A) on the benefit: first tax year, or month-by-month across the term
  if(p.ni_basis==='first'||!term){out.ni=out.bikValue==null?null:out.bikValue*S.ni_rate/12;}
  else{let sum=0,ok=true,lastKnown=null,assumed=false;
    for(let m=0;m<term;m++){const d=new Date(reg.getFullYear(),reg.getMonth()+m,reg.getDate());const r=clYearRate(v,clTaxYear(d),pre);
      if(r.rate!=null){lastKnown=r.rate;sum+=r.rate;}else if(lastKnown!=null){assumed=true;sum+=lastKnown;}else{ok=false;break;}}
    out.ni=ok?v.p11d*(sum/term)*S.ni_rate/12:null;out.niAssumed=assumed;}
  // Fuel / energy per month
  const miles=(o&&o.mileage)||p.mileage||v.mileage||0;
  if(v.fuel==='electric'){
    out.battery=v.battery;out.batterySrc=v.battery?'file':'';
    if(!v.battery){const b=clBatteryRule(v);if(b&&b.kwh){out.battery=b.kwh;out.batterySrc='rule: '+b.match;}else if(b&&b.clash)out.flags.push('battery size rules disagree ('+b.clash.join(' / ')+')');}
    if(v.ev_range&&out.battery){out.mpu=v.ev_range/out.battery*(p.ev_range_factor||1);out.fuelPm=miles/out.mpu*S.elec_kwh/12;out.mpge=out.mpu*clMpgeFactor();}
    else{out.fuelPm=null;out.flags.push('no '+(out.battery?'electric range':'battery size')+' — energy cost unknown');}
  }else{
    const mpg=v.mpg?v.mpg*(v.fuel==='phev'?(p.phev_mpg_factor||1):1):null;out.mpu=mpg;
    if(mpg){out.fuelPm=miles/mpg*(v.diesel?S.diesel_litre:S.petrol_litre)*4.54609/12;}else{out.fuelPm=null;out.flags.push('no MPG — fuel cost unknown');}
  }
  out.insurance=p.insurance_pm||0;
  out.wlcNoFuel=out.ni==null?null:out.finance+out.service+out.vatLost+out.lrr+out.ni+out.insurance;
  out.wlc=out.wlcNoFuel==null||out.fuelPm==null?null:out.wlcNoFuel+out.fuelPm;
  const rentals=out.finance+out.service+out.vatLost+out.lrr;
  out.wlcTerm=out.wlc==null?null:rentals*(out.payments||term)+(out.wlc-rentals)*term;
  return out;
}
// Policy rules, then grade by budget. Returns reasons a car is out (empty = in).
function clApplyPolicy(res,p){
  const v=res.v,why=[];
  if(v.commercial)why.push('commercial vehicle — choice lists are for cars');
  if(!v.fuel)why.push('fuel type "'+v.fuel_raw+'" not recognised');
  else if(p.fuels&&p.fuels.length&&!p.fuels.includes(v.fuel))why.push(CL_FUELS.find(f=>f[0]===v.fuel)[1]+' not allowed');
  if(v.fuel==='electric'&&p.min_ev_range&&!(v.ev_range>=p.min_ev_range))why.push('range '+(v.ev_range??'?')+'mi under '+p.min_ev_range);
  if(v.fuel==='phev'&&p.min_phev_range&&!(v.ev_range>=p.min_phev_range))why.push('electric range '+(v.ev_range??'?')+'mi under '+p.min_phev_range);
  if(p.max_co2!=null&&v.co2!=null&&v.co2>p.max_co2)why.push('CO2 '+v.co2+' over '+p.max_co2);
  if(p.max_p11d!=null&&v.p11d>p.max_p11d)why.push('P11D over '+lsMoney(p.max_p11d));
  if(p.makes&&p.makes.length){const mk=clKey(v.make);if(!p.makes.some(m=>{const a=clKey(m);return a&&(mk.startsWith(a)||a.startsWith(mk));}))why.push(v.make+' not on the brand list');}
  const d=v.desc.toLowerCase();(p.exclude_words||[]).forEach(w=>{if(w&&d.includes(w.toLowerCase()))why.push('description contains "'+w+'"');});
  res.data.forEach(x=>why.push('needs data: '+x));
  const cost=p.budget_includes_fuel?res.wlc:res.wlcNoFuel;
  res.budgetValue=cost==null?null:(p.budget_basis==='term'?cost*(p.term||v.term||0):cost);
  if(cost==null&&!res.data.length)why.push('needs data: '+res.flags.join('; '));
  const grades=[...(p.grades||[])].filter(g=>g.budget>0).sort((a,b)=>a.budget-b.budget);
  res.grade=null;
  if(grades.length&&res.budgetValue!=null){res.grade=grades.find(g=>res.budgetValue<=g.budget)||null;if(!res.grade)why.push('over every grade budget');}
  res.why=why;res.ok=!why.length;return res;
}
function clRun(){
  const p=clPolicy()||Object.assign({},CL_BLANK_POLICY,{term:clN(clVal('cl-term')),mileage:clN(clVal('cl-miles')),fuels:[]});
  const term=clN(clVal('cl-term')),miles=clN(clVal('cl-miles'));
  const pp=Object.assign({},p,{term,mileage:miles});
  clResults=clRows.filter(v=>v.term===term&&v.mileage===miles).map(v=>clApplyPolicy(clCalc(v,pp),pp));
  clResults.sort((a,b)=>(a.budgetValue??Infinity)-(b.budgetValue??Infinity));
  clLastPP=pp;return pp;
}
function clVal(id){const e=document.getElementById(id);return e?e.value:'';}

// ── Screen ──
lsInjectView('view-choice-lists',`
  <div class="topbar"><h1>Choice lists</h1>
    <button class="topbar-btn primary" onclick="document.getElementById('cl-file-input').click()">📥 Import ratebook</button>
    <button class="topbar-btn" onclick="clExportWorking()">⬇ Working sheet</button>
    <button class="topbar-btn" onclick="clDriverLists('print')">🖨 Driver lists</button>
    <button class="topbar-btn" onclick="clDriverLists('xlsx')">⬇ Driver lists XLSX</button>
    <button class="topbar-btn" onclick="clOpenSettings()">⚙ Tax tables</button>
    <input type="file" id="cl-file-input" accept=".csv,.xlsx,.xls" style="display:none" onchange="clImport(this.files[0]);this.value=''"></div>
  <div class="content">
    <div class="financials-row" style="flex-wrap:wrap;align-items:center">
      <div><span>Policy</span> <select id="cl-policy" onchange="clPickPolicy(this.value)"></select>
        <button class="btn" onclick="clEditPolicy(clPolicyId)">✎ Edit</button> <button class="btn" onclick="clEditPolicy(null)">+ New policy</button></div>
      <div><span>Term</span> <select id="cl-term" onchange="clRender()"></select></div>
      <div><span>Mileage</span> <select id="cl-miles" onchange="clRender()"></select></div>
      <div><span>Show</span> <select id="cl-show" onchange="clRenderTable()"><option value="ok">On the list</option><option value="out">Left off</option><option value="all">Everything</option><option value="sel">Selected</option></select></div>
      <div><button class="btn" onclick="clOpenTinker()">✎ Adjust selected</button></div>
      <div><input id="cl-q" type="search" placeholder="Search — any words, any order…" oninput="clRenderTable()" style="min-width:240px"></div>
    </div>
    <div id="cl-status" class="notes-box"></div>
    <div id="cl-table"></div>
  </div>`);
async function loadChoiceLists(){
  const el=document.getElementById('cl-table');if(!el||needsSetup(el))return;
  if(!clLoaded){await Promise.all([clLoadConfig(),lsEnsureCrm()]);clLoaded=true;
    if(!clRows.length){try{const c=JSON.parse(localStorage.getItem('covase_cl_ratebook')||'null');if(c&&Array.isArray(c.rows)){clRows=c.rows;clFile=c.file;clImportNotes=c.notes||[];}}catch(e){}}}
  clFillPolicies();clFillTermMiles(clPolicy());clRender();
}
function clFillPolicies(){
  const s=document.getElementById('cl-policy');if(!s)return;
  if(clPolicyId&&!clPolicy())clPolicyId='';
  s.innerHTML=lsOptions(clPolicies.map(p=>[p.id,p.name+(p.account_id&&accName(p.account_id)?' — '+accName(p.account_id):'')]),clPolicyId,'No policy (whole life cost only)');
}
function clFillTermMiles(p){
  const terms=[...new Set(clRows.map(v=>v.term).filter(x=>x!=null))].sort((a,b)=>a-b),miles=[...new Set(clRows.map(v=>v.mileage).filter(x=>x!=null))].sort((a,b)=>a-b);
  const pick=(list,want,cur)=>list.includes(want)?want:list.includes(cur)?cur:list[0];
  const t=document.getElementById('cl-term'),m=document.getElementById('cl-miles');if(!t)return;
  const ct=clN(t.value),cm=clN(m.value);
  t.innerHTML=lsOptions(terms.map(x=>[x,x+' months']),pick(terms,p&&p.term,ct));
  m.innerHTML=lsOptions(miles.map(x=>[x,x.toLocaleString('en-GB')+' miles']),pick(miles,p&&p.mileage,cm));
}
function clPickPolicy(id){clPolicyId=id;clFillTermMiles(clPolicy());clRender();}
function clRender(){
  const el=document.getElementById('cl-table'),st=document.getElementById('cl-status');if(!el)return;
  if(!clRows.length){st.innerHTML='No ratebook loaded yet. Use <strong>📥 Import ratebook</strong> to read a funder\'s CSV or Excel export.';el.innerHTML='';return;}
  const p=clPolicy(),pp=clRun();
  const want=[clN(clVal('cl-term')),clN(clVal('cl-miles'))];
  const q=clKey(clVal('cl-q')),show=clVal('cl-show');
  const grades=[...((p&&p.grades)||[])].filter(g=>g.budget>0).sort((a,b)=>a.budget-b.budget);
  const counts=grades.map(g=>[g.name,clResults.filter(r=>r.ok&&(p.grade_mode==='banded'?r.grade===g:r.grade&&r.grade.budget<=g.budget)).length]);
  const out=clResults.filter(r=>!r.ok),reasons={};out.forEach(r=>r.why.forEach(w=>{const k=w.replace(/^electric range .*/,'plug-in electric range under the minimum').replace(/^range .*/,'electric car range under the minimum').replace(/^CO2 .*/,'CO2 over the maximum').replace(/^P11D .*/,'P11D over the maximum').replace(/^.* not on the brand list$/,'brand not on the list').replace(/^description contains .*/,'excluded wording').replace(/^fuel type .*/,'fuel type not recognised');reasons[k]=(reasons[k]||0)+1;}));
  st.innerHTML=`<strong>${esc(clFile?clFile.name:'Ratebook')}</strong> · ${clRows.length.toLocaleString('en-GB')} rows · ${clResults.length.toLocaleString('en-GB')} at ${want[0]} months / ${(want[1]||0).toLocaleString('en-GB')} miles · <strong>${clResults.filter(r=>r.ok).length}</strong> on the list, ${out.length} left off`
    +(counts.length?'<br>'+counts.map(([n,c])=>`${esc(n)}: <strong>${c}</strong>`).join(' · ')+(p.grade_mode==='banded'?' (each car in one grade)':' (each grade also sees the cheaper grades\' cars)'):'')
    +(Object.keys(reasons).length?'<br><span style="color:var(--n400)">Left off: '+Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>esc(k)+' ('+n+')').join(' · ')+'</span>':'')
    +(p&&(p.profile_type!=='ratebook'||p.commission>0)?`<br>Rentals shown on a <strong>${esc(clProfileLabel(p,want[0]))}</strong> profile`+(p.commission>0?` including ${lsMoney(p.commission)} commission (${lsMoney(p.commission/(clProfileCount(p,want[0])||clResults.map(r=>r.payments).find(Boolean)||1))} a month on the finance rental)`:''):'')
    +(clResults.some(r=>r.niAssumed)?'<br><span style="color:var(--n400)">The term runs past the last tax year in the tables, so employer\'s NI for the later years uses that year\'s rates.</span>':'')
    +(clPriceWarnings().length?'<br><span style="color:#c0392b">⚠ Check prices in ⚙ Tax tables: '+clPriceWarnings().map(esc).join('; ')+'</span>':'')
    +(clImportNotes.length?'<br><span style="color:var(--n400)">'+clImportNotes.map(esc).join('<br>')+'</span>':'');
  clRenderTable();
}
// ── Results table: sort by any column, filter under each heading, word search ──
// Re-draws without re-running the sums, and puts the cursor back in the box being typed in.
let clSort={key:'wlc',dir:1},clFilters={};
function clCols(){
  const p=clPolicy(),noFuel=p&&p.budget_includes_fuel===false;
  const yrs=(clResults[0]||{years:[]}).years.map(y=>y.year);
  const money=x=>x==null?'—':lsMoney(x);
  return [
    {key:'sel',label:'',fixed:1,get:r=>clSelected.has(clRowKey(r.orig))?1:0,html:r=>`<input type="checkbox" title="Select to adjust" ${clSelected.has(clRowKey(r.orig))?'checked':''} onclick="clToggleSel('${esc(clRowKey(r.orig)).replace(/'/g,'&#39;')}',this.checked)">`},
    {key:'vehicle',label:'Vehicle',get:r=>r.v.make+' '+r.v.desc,html:r=>`${r.edited?'<span title="Adjusted by hand — ✎ Adjust selected to change or reset" style="color:#b7791f">✎ </span>':''}<strong>${esc(r.v.make)}</strong> ${esc(r.v.desc)}`,wide:1},
    {key:'fuel',label:'Fuel',get:r=>r.v.fuel_raw},
    {key:'co2',label:'CO₂',num:1,get:r=>r.v.co2},
    {key:'range',label:'Range',num:1,get:r=>r.v.ev_range},
    {key:'mpg',label:'MPG / MPGe',num:1,get:r=>r.v.fuel==='electric'?r.mpge:r.mpu,fmt:x=>x==null?'—':(Math.round(x*10)/10).toFixed(1)},
    {key:'p11d',label:'P11D',num:1,get:r=>r.v.p11d,fmt:money},
    {key:'finance',label:'Finance',num:1,get:r=>r.finance,fmt:money},
    {key:'service',label:'Service',num:1,get:r=>r.service,fmt:money},
    {key:'vat',label:'VAT lost',num:1,get:r=>r.vatLost,fmt:money},
    {key:'lrr',label:'LRR',num:1,get:r=>r.lrr,fmt:x=>x?money(x):''},
    {key:'ni',label:'Er NI',num:1,get:r=>r.ni,fmt:money},
    {key:'fuelpm',label:'Fuel',num:1,get:r=>r.fuelPm,fmt:money},
    {key:'wlc',label:'WLC / month',num:1,get:r=>noFuel?r.wlcNoFuel:r.wlc,fmt:x=>`<strong>${money(x)}</strong>`},
    {key:'term',label:'Over term',num:1,get:r=>r.wlcTerm,fmt:money},
    ...yrs.map((y,i)=>({key:'bik'+i,label:'BIK '+y,num:1,pct:1,get:r=>r.years[i]&&r.years[i].rate,fmt:clPct})),
    {key:'grade',label:'Grade',get:r=>r.grade?r.grade.name:''},
    {key:'notes',label:'Notes',get:r=>[...r.why,...r.flags].join('; '),wide:1,notes:1}];
}
// A filter box takes words (all must appear), or for number columns >300, <500, 300-400 or an exact figure.
function clFilterTest(col,text){
  const t=String(text||'').trim();if(!t)return null;
  if(col.num){
    const n=s=>{const x=clN(s);return x==null?null:col.pct?x/100:x;};
    let m=t.match(/^(>=|<=|>|<)\s*(.+)$/);
    if(m){const lim=n(m[2]);if(lim==null)return null;return v=>v!=null&&(m[1]==='>'?v>lim:m[1]==='<'?v<lim:m[1]==='>='?v>=lim:v<=lim);}
    m=t.match(/^([\d.,£%]+)\s*(?:-|to)\s*([\d.,£%]+)$/);
    if(m){const a=n(m[1]),b=n(m[2]);if(a==null||b==null)return null;return v=>v!=null&&v>=a&&v<=b;}
    const eq=n(t);if(eq!=null)return v=>v!=null&&Math.abs(v-eq)<(col.pct?0.0005:0.5);
  }
  const words=t.toLowerCase().split(/\s+/).filter(Boolean);
  return v=>{const s=String(v??'').toLowerCase();return words.every(w=>s.includes(w));};
}
function clSortBy(key){clSort=clSort.key===key?{key,dir:-clSort.dir}:{key,dir:1};clRenderTable();}
function clSetFilter(key,val){if(val)clFilters[key]=val;else delete clFilters[key];clRenderTable();}
function clClearFilters(){clFilters={};const q=document.getElementById('cl-q');if(q)q.value='';clRenderTable();}
function clRenderTable(){
  const el=document.getElementById('cl-table');if(!el||!clRows.length)return;
  const act=document.activeElement,focusKey=act&&act.dataset?act.dataset.clf:null,caret=focusKey!=null?act.selectionStart:null;
  const cols=clCols(),show=clVal('cl-show');
  const words=clVal('cl-q').toLowerCase().split(/\s+/).filter(Boolean);
  const hay=r=>(r.v.make+' '+r.v.model+' '+r.v.desc+' '+r.v.fuel_raw+' '+r.v.body+' '+r.v.cap+' '+(r.grade?r.grade.name:'')+' '+[...r.why,...r.flags].join(' ')).toLowerCase();
  const tests=cols.filter(c=>!c.fixed).map(c=>[c,clFilterTest(c,clFilters[c.key])]).filter(x=>x[1]);
  const match=r=>words.every(w=>hay(r).includes(w))&&tests.every(([c,t])=>t(c.get(r)));
  const all=clResults.filter(match);
  let rows=show==='sel'?clResults.filter(r=>clSelected.has(clRowKey(r.orig))):all.filter(r=>show==='all'||(show==='ok'?r.ok:!r.ok));
  const sc=cols.find(c=>c.key===clSort.key)||cols.find(c=>c.key==='wlc');
  rows=rows.slice().sort((a,b)=>{const x=sc.get(a),y=sc.get(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
    return (sc.num?x-y:String(x).localeCompare(String(y),'en-GB',{numeric:true}))*clSort.dir;});
  const filtering=words.length||tests.length,hidden=all.length-rows.length;
  const head=cols.map(c=>c.fixed?`<th title="Tick cars, then ✎ Adjust selected">${clSelected.size?`<a href="#" onclick="clSelected.clear();clRenderTable();return false" title="Untick all">✕${clSelected.size}</a>`:''}</th>`:`<th style="cursor:pointer;user-select:none" title="Sort" onclick="clSortBy('${c.key}')">${esc(c.label)}${clSort.key===c.key?(clSort.dir>0?' ▲':' ▼'):''}</th>`).join('');
  const filt=cols.map(c=>c.fixed?'<td></td>':`<td style="padding:3px 4px"><input data-clf="${c.key}" value="${esc(clFilters[c.key]||'')}" placeholder="${c.num?'e.g. <500':'filter'}" oninput="clSetFilter('${c.key}',this.value)" style="width:100%;min-width:${c.wide?'120':'56'}px;font-size:11px;padding:3px 5px;box-sizing:border-box"></td>`).join('');
  const body=rows.slice(0,600).map(r=>`<tr>${cols.map(c=>{const v=c.get(r);const h=c.html?c.html(r):c.fmt?c.fmt(v):esc(v==null?'':String(v));
    return `<td${c.wide?` style="white-space:normal;min-width:${c.notes?200:260}px${c.notes?';color:'+(r.ok?'var(--n400)':'#c0392b'):''}"`:''}>${h}</td>`;}).join('')}</tr>`).join('');
  el.innerHTML=`<div style="font-size:12px;color:var(--n500);margin:0 0 6px">${rows.length.toLocaleString('en-GB')} shown${filtering?' matching your search / filters':''}${hidden&&filtering?` · ${hidden} more match but are ${show==='ok'?'left off':'on the list'} — change “Show” to see them`:''}${filtering?' · <a href="#" onclick="clClearFilters();return false">clear all</a>':''} · click a heading to sort</div>
    <div style="overflow-x:auto"><table class="ls-table" style="white-space:nowrap"><tr>${head}</tr><tr>${filt}</tr>${body}</table></div>
    ${rows.length>600?`<div class="empty-sub">Showing the first 600 of ${rows.length} — narrow with the search or filters, or use ⬇ Working sheet for everything.</div>`:''}
    ${rows.length?'':`<div class="empty-state"><div class="empty-title">Nothing to show</div><div class="empty-sub">${filtering?'Nothing matches — try fewer words or clear the filters.':clResults.length?'Try “Show: Everything” to see why cars were left off.':'The ratebook has no rows at this term and mileage.'}</div></div>`}`;
  if(focusKey){const i=el.querySelector(`[data-clf="${focusKey}"]`);if(i){i.focus();try{i.setSelectionRange(caret,caret);}catch(e){}}}
}

function clToggleSel(k,on){if(on)clSelected.add(k);else clSelected.delete(k);if(clVal('cl-show')==='sel'&&!on)clRenderTable();else{const th=document.querySelector('#cl-table th');if(th)th.innerHTML=clSelected.size?`<a href="#" onclick="clSelected.clear();clRenderTable();return false" title="Untick all">✕${clSelected.size}</a>`:'';}}

// ── Adjust selected cars ──
lsInjectModal('cl-tinker-modal',`
  <div class="modal-header"><div class="modal-title">Adjust selected cars</div><button class="modal-close" onclick="clCloseTinker()">✕</button></div>
  <div class="modal-body"><div style="font-size:12px;color:var(--n500);margin-bottom:10px">Type the new figures as you see them in the list: rentals on the client's payment profile, with the finance rental <em>before</em> commission. Commission is added on top (leave it blank to use the policy's). The results update as you type; nothing changes on the list until you press Save.</div><div id="clt-body"></div></div>
  <div class="modal-footer"><button class="btn-secondary-modal" style="margin-right:auto" onclick="clTinkerResetAll()">Reset all to ratebook</button><button class="btn-secondary-modal" onclick="clCloseTinker()">Cancel</button><button class="btn-primary-modal" onclick="clSaveTinker()">Save</button></div>`,true);
let clTinkerRows=[];
function clOpenTinker(){
  if(!clRows.length){toast('Import a ratebook first','error');return;}
  clRun();const rows=clResults.filter(r=>clSelected.has(clRowKey(r.orig)));
  if(!rows.length){toast('Tick one or more cars in the list first','error');return;}
  if(rows.length>10){toast('Pick up to 10 cars to adjust at a time','error');return;}
  clTinkerRows=rows.map(r=>{const k=clRowKey(r.orig),o=clOverrides[k]||{};return {k,v0:r.orig,o:{p11d:o.p11d??null,mileage:o.mileage??null,finance:o.finance??null,service:o.service??null,commission:o.commission??null}};});
  clRenderTinker();document.getElementById('cl-tinker-modal').classList.add('open');
}
function clCloseTinker(){document.getElementById('cl-tinker-modal').classList.remove('open');}
// Rentals are typed on the client's profile; they're stored on the ratebook's own plan (the
// same basis as the file) so a later change of profile in the policy still converts correctly.
function clTinkerRatio(v0){const pp=clLastPP,src=clPlanCount(v0.plan,v0.term),dst=clProfileCount(pp,v0.term);return src&&dst?src/dst:1;}
function clTinkerOverride(t){const o=t.o;return [o.p11d,o.mileage,o.finance,o.service,o.commission].some(x=>x!=null)?o:null;}
function clRenderTinker(){
  const pp=clLastPP;
  document.getElementById('clt-body').innerHTML=clTinkerRows.map((t,i)=>{const v=t.v0,base=clApplyPolicy(clCalc(v,pp,null),pp),k=clTinkerRatio(v),c2=x=>x==null?null:Math.round(x*k*100)/100,f=(fld,label,val,ph)=>`<div class="form-field"><label>${label}</label><input type="number" step="0.01" data-clt="${i}" data-f="${fld}" value="${val==null?'':val}" placeholder="${esc(ph)}" oninput="clTinkerInput(${i},'${fld}',this.value)"></div>`;
    return `<div class="ls-quote"><div class="ls-quote-head"><strong>${esc(v.make)}</strong> ${esc(v.desc)} <span style="color:var(--n400)">· ${esc(String(v.term))} months · ${Number(v.mileage).toLocaleString('en-GB')} miles · ${esc(v.plan||'payment plan not given')}</span><button class="btn" style="margin-left:auto" onclick="clTinkerReset(${i})">Reset</button></div>
      <div class="form-row" style="grid-template-columns:repeat(5,minmax(0,1fr))">${f('p11d','P11D value £',t.o.p11d,'ratebook '+v.p11d)}${f('mileage','Annual mileage',t.o.mileage,'now '+v.mileage)}${f('finance','Finance rental £ (before commission)',c2(t.o.finance),'now '+(base.finance-base.commissionPm).toFixed(2))}${f('service','Service rental £',c2(t.o.service),'now '+base.service.toFixed(2))}${f('commission','Commission £ (whole contract)',t.o.commission,'policy '+((pp&&pp.commission)||0))}</div>
      <div id="clt-res-${i}"></div></div>`;}).join('');
  clTinkerRows.forEach((t,i)=>clTinkerResult(i));
}
function clTinkerInput(i,fld,val){const t=clTinkerRows[i],n=clN(val);t.o[fld]=n!=null&&(fld==='finance'||fld==='service')?n/clTinkerRatio(t.v0):n;
  if(fld==='mileage'){const b=clCalc(t.v0,clLastPP,{mileage:t.o.mileage}),q=x=>document.querySelector(`[data-clt="${i}"][data-f="${x}"]`);q('finance').placeholder='now '+(b.finance-b.commissionPm).toFixed(2);q('service').placeholder='now '+b.service.toFixed(2);}
  clTinkerResult(i);}
function clTinkerReset(i){const t=clTinkerRows[i];t.o={p11d:null,mileage:null,finance:null,service:null,commission:null};document.querySelectorAll(`[data-clt="${i}"]`).forEach(x=>x.value='');clTinkerResult(i);}
function clTinkerResetAll(){clTinkerRows.forEach((t,i)=>clTinkerReset(i));}
function clTinkerResult(i){
  const t=clTinkerRows[i],pp=clLastPP;if(!pp)return;
  const before=clApplyPolicy(clCalc(t.v0,pp,null),pp),after=clApplyPolicy(clCalc(t.v0,pp,clTinkerOverride(t)),pp);
  const m=x=>x==null?'—':lsMoney(x),row=(label,a,b,fmt)=>{const fa=(fmt||m)(a),fb=(fmt||m)(b);return `<tr><td>${label}</td><td>${fa}</td><td${fa!==fb?' style="font-weight:700"':''}>${fb}</td></tr>`;};
  const tax=(r,i,b)=>r.years[i]&&r.years[i].rate!=null?r.v.p11d*r.years[i].rate*b/12:null;
  const status=r=>r.ok?(r.grade?'On the list — '+esc(r.grade.name):'On the list'):'<span style="color:#c0392b">Left off: '+esc(r.why.join('; '))+'</span>';
  document.getElementById('clt-res-'+i).innerHTML=`<table class="ls-table"><tr><th></th><th>Ratebook</th><th>Adjusted</th></tr>
    ${row('Annual mileage',before.v.mileage,after.v.mileage,x=>x==null?'—':Number(x).toLocaleString('en-GB'))}
    ${row('Finance rental before commission',before.finance-before.commissionPm,after.finance-after.commissionPm)}${row('Finance rental incl. commission',before.finance,after.finance)}${row('Client service rental',before.service,after.service)}${row('Commission per payment',before.commissionPm,after.commissionPm)}
    ${row('Irrecoverable VAT',before.vatLost,after.vatLost)}${row('Lease rental restriction',before.lrr,after.lrr)}${row("Employer's NI",before.ni,after.ni)}${row('Fuel / energy',before.fuelPm,after.fuelPm)}
    ${row('<strong>WLC per month</strong>',pp.budget_includes_fuel===false?before.wlcNoFuel:before.wlc,pp.budget_includes_fuel===false?after.wlcNoFuel:after.wlc)}${row('WLC over term',before.wlcTerm,after.wlcTerm)}
    ${after.years.map((y,k)=>row('BIK '+esc(y.year),before.years[k].rate,y.rate,clPct)
      +`<tr><td>&nbsp;&nbsp;driver tax / month at 20% · 40%</td><td>${m(tax(before,k,0.2))} · ${m(tax(before,k,0.4))}</td><td>${m(tax(after,k,0.2))} · ${m(tax(after,k,0.4))}</td></tr>`).join('')}
    <tr><td>Status</td><td>${status(before)}</td><td>${status(after)}</td></tr></table>${after.flags.length?`<div style="font-size:12px;color:#b7791f">${after.flags.map(esc).join('; ')}</div>`:''}`;
}
function clSaveTinker(){
  clTinkerRows.forEach(t=>{const o=clTinkerOverride(t);if(o)clOverrides[t.k]=Object.fromEntries(Object.entries(o).filter(([,x])=>x!=null));else delete clOverrides[t.k];});
  clSaveOverrides();clCloseTinker();clRender();toast('Saved — adjusted cars are marked ✎','success');
}

// ── Exports ──
function clNeedRows(){if(!clRows.length){toast('Import a ratebook first','error');return false;}clRun();if(!clResults.length){toast('No ratebook rows at this term and mileage','error');return false;}return true;}
async function clExportWorking(){
  if(!clNeedRows())return;await loadSheetJS();
  const yrs=clResults[0].years.map(y=>y.year);const r2=x=>x==null?null:Math.round(x*100)/100;
  const aoa=[['Make','Model','Variant','CAP code','Fuel','CO2','Electric range','Battery kWh','Battery size from','Miles per kWh','MPG used / MPGe (cost-equivalent)','P11D','Term','Mileage','Ratebook payment plan','Ratebook finance','Ratebook service','Payments','Commission / month','Finance rental','Service rental','Irrecoverable VAT','Lease rental restriction','Employer NI','Fuel / energy','Insurance','WLC per month','WLC excl fuel','WLC over term',...yrs.map(y=>'BIK '+y),'BIK value (yr 1)','Tax 20% / month','Tax 40% / month','Grade','On list','Adjusted by hand','Reasons / notes']];
  clResults.forEach(r=>{const v=r.v;aoa.push([v.make,v.model,v.variant||v.desc,v.cap,v.fuel_raw,v.co2,v.ev_range,r.battery??null,r.batterySrc||'',v.fuel==='electric'&&r.mpu?Math.round(r.mpu*100)/100:null,(v.fuel==='electric'?r.mpge:r.mpu)==null?null:Math.round((v.fuel==='electric'?r.mpge:r.mpu)*10)/10,v.p11d,v.term,v.mileage,v.plan,v.finance,v.service,r.payments,r2(r.commissionPm),r2(r.finance),r2(r.service),r2(r.vatLost),r2(r.lrr),r2(r.ni),r2(r.fuelPm),r.insurance,r2(r.wlc),r2(r.wlcNoFuel),r2(r.wlcTerm),...r.years.map(y=>y.rate),r2(r.bikValue),r2(r.bikValue==null?null:r.bikValue*0.2/12),r2(r.bikValue==null?null:r.bikValue*0.4/12),r.grade?r.grade.name:'',r.ok?'Yes':'No',r.edited?'Yes (ratebook P11D '+r.orig.p11d+', finance '+r.orig.finance+', service '+r.orig.service+')':'',[...r.why,...r.flags].join('; ')]);});
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'WLC');
  const p=clPolicy();XLSX.writeFile(wb,'WLC-'+((p&&p.name)||'ratebook').replace(/[^\w-]+/g,'_')+'-'+new Date().toISOString().slice(0,10)+'.xlsx');
}
// Driver-facing: vehicle and personal tax only. Nothing about cost to the company.
function clGradeLists(p){
  const ok=clResults.filter(r=>r.ok);
  const grades=[...((p&&p.grades)||[])].filter(g=>g.budget>0).sort((a,b)=>a.budget-b.budget);
  const sortV=(a,b)=>(a.v.make+' '+a.v.desc).localeCompare(b.v.make+' '+b.v.desc);
  if(!grades.length)return [{name:'All vehicles',rows:ok.sort(sortV)}];
  return grades.slice().reverse().map(g=>({name:g.name,rows:ok.filter(r=>r.grade&&(p.grade_mode==='banded'?r.grade===g:r.grade.budget<=g.budget)).sort(sortV)})).reverse();
}
async function clDriverLists(mode){
  if(!clNeedRows())return;const p=clPolicy();
  if(!p&&!confirm('No policy is picked, so this will list every car in the ratebook at this term and mileage. Carry on?'))return;
  const lists=clGradeLists(p),yrs=clResults[0].years.map(y=>y.year),bands=[0.2,0.4].concat(p&&p.show_45?[0.45]:[]);
  const client=p&&p.account_id?accName(p.account_id):(p?p.name:'');
  const tax=(r,i,b)=>{const y=r.years[i];return y.rate==null?null:Math.round(r.v.p11d*y.rate*b/12*100)/100;};
  if(mode==='xlsx'){
    await loadSheetJS();const wb=XLSX.utils.book_new();
    lists.forEach(l=>{const aoa=[['Manufacturer','Vehicle','Fuel','CO2 g/km','Electric range (miles)','P11D value',...yrs.flatMap(y=>['BIK % '+y,...bands.map(b=>'Monthly tax at '+b*100+'% '+y)])]];
      l.rows.forEach(r=>aoa.push([r.v.make,r.v.desc+(r.v.mileage!==r.orig.mileage?' ('+Number(r.v.mileage).toLocaleString('en-GB')+' miles a year)':''),r.v.fuel_raw,r.v.co2,r.v.ev_range,r.v.p11d,...yrs.flatMap((y,i)=>[r.years[i].rate,...bands.map(b=>tax(r,i,b))])]));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),l.name.replace(/[\\\/?*\[\]:]/g,' ').slice(0,31)||'List');});
    XLSX.writeFile(wb,'Choice-list-'+(client||'drivers').replace(/[^\w-]+/g,'_')+'-'+new Date().toISOString().slice(0,10)+'.xlsx');return;
  }
  const m=x=>x==null?'—':lsMoney(x);
  const html=`<style>.cl-page{page-break-after:always;padding-left:0}.cl-page:last-child{page-break-after:auto}table.v{font-size:11px}table.v th{font-size:11px}table.v td{border-bottom:1px solid #eee}h2{font-weight:400;font-size:26px;margin:22px 0 4px}.sub{font-size:13px;color:#666;margin-bottom:12px}</style>`
    +lists.map(l=>`<div class="cl-page">${covaseHeader()}<h2>${esc(client?client+' — ':'')}${esc(l.name)}</h2>
      <div class="sub">Company car choice list · ${esc(String(p?p.term:clVal('cl-term')))} months · ${Number(p?p.mileage:clVal('cl-miles')).toLocaleString('en-GB')} miles a year · ${l.rows.length} vehicles${p&&p.driver_note?'<br>'+esc(p.driver_note):''}</div>
      <table class="v"><tr><th>Vehicle</th><th>Fuel</th><th class="r">CO₂</th><th class="r">Electric<br>range</th><th class="r">P11D</th>${yrs.map(y=>`<th class="r">${esc(y)}<br>BIK %</th>${bands.map(b=>`<th class="r">${esc(y)}<br>tax at ${b*100}%</th>`).join('')}`).join('')}</tr>
      ${l.rows.map(r=>`<tr><td><strong>${esc(r.v.make)}</strong> ${esc(r.v.desc)}${r.v.mileage!==r.orig.mileage?` <span style="color:#888">(${Number(r.v.mileage).toLocaleString('en-GB')} miles a year)</span>`:''}</td><td>${esc(r.v.fuel_raw)}</td><td class="r">${r.v.co2??'—'}</td><td class="r">${r.v.ev_range?r.v.ev_range+' mi':''}</td><td class="r">${m(r.v.p11d)}</td>${yrs.map((y,i)=>`<td class="r">${clPct(r.years[i].rate)}</td>${bands.map(b=>`<td class="r">${m(tax(r,i,b))}</td>`).join('')}`).join('')}</tr>`).join('')}</table>
      <div class="small" style="margin-top:12px">Monthly tax is the company car benefit (P11D value × BIK %) at the income tax rate shown, divided by 12, using HMRC rates for England, Wales and Northern Ireland as published at the date of this list. Scottish rates differ. It ignores any capital contribution, optional extras or other income, and future rates may change. Your own tax position depends on your circumstances.</div>${COVASE_FOOTER}</div>`).join('');
  lsPrint(html,(client||'Driver')+' choice lists');
}

// ── Policy editor ──
lsInjectModal('cl-policy-modal',`
  <div class="modal-header"><div class="modal-title" id="clp-title">Client policy</div><button class="modal-close" onclick="document.getElementById('cl-policy-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body" id="clp-body"></div>
  <div class="modal-footer"><button class="btn-secondary-modal" id="clp-del" style="margin-right:auto" onclick="clDeletePolicy()">Delete policy</button><button class="btn-secondary-modal" onclick="document.getElementById('cl-policy-modal').classList.remove('open')">Cancel</button><button class="btn-primary-modal" onclick="clSavePolicy()">Save policy</button></div>`,true);
function clEditPolicy(id){
  if(id===''){toast('Pick a policy to edit, or make a new one','error');return;}
  const p=id?clPolicies.find(x=>x.id===id):null;clEditing=JSON.parse(JSON.stringify(Object.assign({},CL_BLANK_POLICY,p||{})));
  document.getElementById('clp-title').textContent=p?'Policy — '+p.name:'New client policy';document.getElementById('clp-del').style.display=p?'':'none';
  clRenderPolicy();document.getElementById('cl-policy-modal').classList.add('open');
}
function clTemplate(k){if(!k)return;const keep={id:clEditing.id,account_id:clEditing.account_id};clEditing=Object.assign(JSON.parse(JSON.stringify(CL_BLANK_POLICY)),JSON.parse(JSON.stringify(CL_TEMPLATES[k])),keep);clRenderPolicy();}
function clRenderPolicy(){
  const p=clEditing,f=(id,label,val,extra)=>`<div class="form-field"><label>${label}</label><input id="${id}" value="${esc(val==null?'':String(val))}" ${extra||''}></div>`;
  const pc=x=>x==null?'':Math.round(x*1000)/10;
  document.getElementById('clp-body').innerHTML=`
    ${p.id?'':`<div class="notes-box">Start from: <select onchange="clTemplate(this.value)"><option value="">— blank —</option><option value="stihl">Stihl WLC spreadsheet (Aug 26)</option></select></div>`}
    <div class="form-section-label">Who and what</div>
    <div class="form-row trio">${f('clp-name','Policy name',p.name)}<div class="form-field"><label>Client account</label><select id="clp-acc">${lsAccountOptions(null,p.account_id,'— none —')}</select></div>${f('clp-date','Expected delivery (sets the tax years)',p.delivery_date,'type="date"')}</div>
    <div class="form-row quad">${f('clp-term','Term (months)',p.term,'type="number"')}${f('clp-miles','Annual mileage',p.mileage,'type="number"')}${f('clp-ct','Client corporation tax %',pc(p.corp_tax),'type="number" step="0.1"')}${f('clp-ins','Insurance £ per month (0 = leave out)',p.insurance_pm,'type="number" step="0.01"')}</div>
    <div class="form-section-label">Payment profile and commission</div>
    <div class="form-row trio"><div class="form-field"><label>Client's payment profile</label><select id="clp-prof">${lsOptions([['ratebook','As the ratebook (no change)'],['spread','Spread — payments in advance, then term − 1'],['terminal','Terminal pause — total payments = term']],p.profile_type)}</select></div>
      ${f('clp-up','Payments in advance',p.profile_upfront,'type="number" min="1"')}${f('clp-comm','Commission £ (whole contract, added to finance rental)',p.commission||'','type="number" step="0.01"')}</div>
    <div style="font-size:12px;color:var(--n500);margin:-4px 0 8px">e.g. 4 years: spread 3 down = 3+47, terminal pause 3 down = 3+45. Rentals are converted from the ratebook's own plan; commission is divided by the client's number of payments.</div>
    <div class="form-section-label">Budget and grades</div>
    <div class="form-row trio"><div class="form-field"><label>Budgets are</label><select id="clp-basis">${lsOptions([['monthly','Whole life cost per month'],['term','Whole life cost over the term']],p.budget_basis)}</select></div>
      <div class="form-field"><label>Whole life cost includes fuel</label><select id="clp-fuelin">${lsOptions([['1','Yes'],['0','No']],p.budget_includes_fuel?'1':'0')}</select></div>
      <div class="form-field"><label>Grades</label><select id="clp-mode">${lsOptions([['cumulative','Each grade also gets the cheaper grades\' cars'],['banded','Each car in one grade only']],p.grade_mode)}</select></div></div>
    <table class="ls-table" id="clp-grades"><tr><th>Grade</th><th>Budget £</th><th></th></tr>${(p.grades||[]).map((g,i)=>`<tr><td><input data-gn="${i}" value="${esc(g.name)}" style="width:100%"></td><td><input data-gb="${i}" type="number" step="0.01" value="${esc(String(g.budget??''))}"></td><td><button class="btn btn-danger" onclick="clGradeRow(${i})">✗</button></td></tr>`).join('')}</table>
    <button class="btn" onclick="clGradeRow(-1)">+ Add grade</button>
    <div class="form-section-label">What's allowed</div>
    <div class="ls-check" style="flex-direction:row;flex-wrap:wrap;gap:14px">${CL_FUELS.map(([k,l])=>`<label><input type="checkbox" data-fuel="${k}" ${(p.fuels||[]).includes(k)?'checked':''}> ${l}</label>`).join('')}</div>
    <div class="form-row quad">${f('clp-evr','Min range — electric (miles)',p.min_ev_range,'type="number"')}${f('clp-phr','Min electric range — plug-in (miles)',p.min_phev_range,'type="number"')}${f('clp-co2','Max CO₂ g/km',p.max_co2,'type="number"')}${f('clp-p11d','Max P11D £',p.max_p11d,'type="number"')}</div>
    <div class="form-row"><div class="form-field"><label>Brands allowed (one per line — blank means any)</label><textarea id="clp-makes" rows="5">${esc((p.makes||[]).join('\n'))}</textarea></div>
      <div class="form-field"><label>Leave off if the description contains (one per line)</label><textarea id="clp-excl" rows="5">${esc((p.exclude_words||[]).join('\n'))}</textarea></div></div>
    <div class="form-section-label">How the sums are done</div>
    <div class="form-row quad">${f('clp-phf','Plug-in MPG used, % of official',pc(p.phev_mpg_factor),'type="number"')}${f('clp-evf','Electric range used, % of official',pc(p.ev_range_factor),'type="number"')}
      <div class="form-field"><label>Employer's NI on</label><select id="clp-ni">${lsOptions([['term','Average BIK across the whole term'],['first','First tax year\'s BIK only']],p.ni_basis)}</select></div>${f('clp-yrs','Tax years shown to drivers',p.tax_years_shown,'type="number" min="1" max="6"')}</div>
    <div class="form-section-label">Driver lists</div>
    <div class="ls-check"><label><input type="checkbox" id="clp-45" ${p.show_45?'checked':''}> Also show tax at 45%</label></div>
    <div class="form-field"><label>Note printed at the top of each list</label><input id="clp-note" value="${esc(p.driver_note||'')}" placeholder="e.g. Please choose by 30 November and send your choice to admin@covase.co.uk"></div>`;
}
function clReadPolicyForm(){
  const g=id=>(document.getElementById(id).value||'').trim(),n=id=>clN(g(id)),lines=id=>g(id).split(/\n|,/).map(s=>s.trim()).filter(Boolean),pc=id=>{const x=n(id);return x==null?null:x/100;};
  const p=clEditing;
  p.grades=[...document.querySelectorAll('#clp-grades [data-gn]')].map(i=>({name:i.value.trim(),budget:clN(document.querySelector(`#clp-grades [data-gb="${i.dataset.gn}"]`).value)}));
  Object.assign(p,{name:g('clp-name'),account_id:g('clp-acc')||'',delivery_date:g('clp-date'),term:n('clp-term'),mileage:n('clp-miles'),corp_tax:pc('clp-ct')??0.25,insurance_pm:n('clp-ins')||0,profile_type:g('clp-prof'),profile_upfront:Math.max(1,n('clp-up')||1),commission:n('clp-comm')||0,
    budget_basis:g('clp-basis'),budget_includes_fuel:g('clp-fuelin')==='1',grade_mode:g('clp-mode'),fuels:[...document.querySelectorAll('#clp-body [data-fuel]:checked')].map(i=>i.dataset.fuel),
    min_ev_range:n('clp-evr'),min_phev_range:n('clp-phr'),max_co2:n('clp-co2'),max_p11d:n('clp-p11d'),makes:lines('clp-makes'),exclude_words:lines('clp-excl'),
    phev_mpg_factor:pc('clp-phf')||1,ev_range_factor:pc('clp-evf')||1,ni_basis:g('clp-ni'),tax_years_shown:Math.min(6,Math.max(1,n('clp-yrs')||3)),show_45:document.getElementById('clp-45').checked,driver_note:g('clp-note')});
  return p;
}
function clGradeRow(i){clReadPolicyForm();if(i<0)clEditing.grades.push({name:'',budget:null});else clEditing.grades.splice(i,1);clRenderPolicy();}
async function clSavePolicy(){
  const p=clReadPolicyForm();if(!p.name){toast('Give the policy a name','error');return;}
  if(!p.term||!p.mileage){toast('Enter the term and mileage','error');return;}
  p.grades=p.grades.filter(g=>g.name||g.budget);if(p.grades.some(g=>!g.name||!(g.budget>0))){toast('Each grade needs a name and a budget','error');return;}
  if(!p.id)p.id='wlcp-'+Date.now().toString(36);
  const list=clPolicies.filter(x=>x.id!==p.id).concat([p]).sort((a,b)=>a.name.localeCompare(b.name));
  try{await clSaveConfig('wlc_policies',{list});clPolicies=list;clPolicyId=p.id;toast('Policy saved','success');document.getElementById('cl-policy-modal').classList.remove('open');clFillPolicies();clFillTermMiles(p);clRender();}
  catch(e){toast('Save failed: '+e.message,'error');}
}
async function clDeletePolicy(){
  if(!clEditing||!clEditing.id||!confirm('Delete the "'+clEditing.name+'" policy? Lists already sent are not affected.'))return;
  const list=clPolicies.filter(x=>x.id!==clEditing.id);
  try{await clSaveConfig('wlc_policies',{list});clPolicies=list;clPolicyId='';document.getElementById('cl-policy-modal').classList.remove('open');clFillPolicies();clRender();}catch(e){toast('Delete failed: '+e.message,'error');}
}

// ── Tax tables & fuel prices editor ──
lsInjectModal('cl-settings-modal',`
  <div class="modal-header"><div class="modal-title">Tax tables, fuel prices and rates</div><button class="modal-close" onclick="document.getElementById('cl-settings-modal').classList.remove('open')">✕</button></div>
  <div class="modal-body" id="cls-body"></div>
  <div class="modal-footer"><button class="btn-secondary-modal" style="margin-right:auto" onclick="if(confirm('Put every rate back to how ORBIS shipped them (the Stihl workbook tables)?')){clSettings=JSON.parse(JSON.stringify(CL_DEFAULT_SETTINGS));clRenderSettings();}">Reset to default</button><button class="btn-secondary-modal" onclick="document.getElementById('cl-settings-modal').classList.remove('open')">Cancel</button><button class="btn-primary-modal" onclick="clSaveSettings()">Save</button></div>`,true);
async function clOpenSettings(){await clLoadConfig();clRenderSettings();document.getElementById('cl-settings-modal').classList.add('open');}
function clTableGrid(which){
  const t=clSettings.bik[which],inp=(path,v)=>`<input data-bik="${which}" data-path="${path}" value="${v==null?'':Math.round(v*1000)/10}" style="width:52px">`;
  const head=`<tr><th>Band</th>${t.years.map((y,i)=>`<th><input data-bik="${which}" data-year="${i}" value="${esc(y)}" style="width:62px"></th>`).join('')}</tr>`;
  const zero=`<tr><td>0 g/km</td>${t.zero.map((v,i)=>`<td>${inp('zero.'+i,v)}</td>`).join('')}</tr>`;
  const rng=CL_RANGE_BANDS.map(([b])=>`<tr><td>1–50 g/km, range ${esc(b)} mi</td>${t.range[b].map((v,i)=>`<td>${inp('range.'+b+'.'+i,v)}</td>`).join('')}</tr>`).join('');
  const co2=t.co2.map((row,r)=>`<tr><td>${row[0]}${t.co2[r+1]?'–'+(t.co2[r+1][0]-1):'+'} g/km</td>${row.slice(1).map((v,i)=>`<td>${inp('co2.'+r+'.'+(i+1),v)}</td>`).join('')}</tr>`).join('');
  return `<div style="overflow-x:auto"><table class="ls-table" style="white-space:nowrap">${head}${zero}${rng}${co2}</table></div><button class="btn" onclick="clAddYear('${which}')">+ Add a tax year</button>`;
}
function clRenderSettings(){
  const S=clSettings,f=(id,label,val,pct)=>`<div class="form-field"><label>${label}</label><input id="${id}" type="number" step="0.0001" value="${pct?Math.round(val*10000)/100:val}"></div>`;
  document.getElementById('cls-body').innerHTML=`
    <div class="form-section-label">Fuel and energy</div>
    <div class="form-row quad">${f('cls-pet','Petrol £ per litre',S.petrol_litre)}${f('cls-die','Diesel £ per litre',S.diesel_litre)}<div class="form-field"><label>Fuel prices as of</label><input id="cls-fasof" type="date" value="${esc(S.fuel_as_of||'')}"></div>
      <div class="form-field"><label>&nbsp;</label><a class="btn" href="https://www.rac.co.uk/drive/advice/fuel-watch/" target="_blank" rel="noopener">RAC Fuel Watch ↗</a></div></div>
    <div class="form-row quad">${f('cls-ele','Electricity £ per kWh (UK average)',S.elec_kwh)}<div class="form-field"><label>Electricity price as of</label><input id="cls-easof" type="date" value="${esc(S.elec_as_of||'')}"></div>
      <div class="form-field"><label>&nbsp;</label><a class="btn" href="https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap" target="_blank" rel="noopener">Ofgem price cap ↗</a></div>
      <div class="form-field"><label>Petrol ↔ electricity factor (worked out)</label><input id="cls-factor" value="${clMpgeFactor()?clMpgeFactor().toFixed(2):''}" readonly title="£ per gallon of petrol ÷ £ per kWh"></div></div>
    <div class="notes-box" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn" id="cls-fetch" onclick="clFetchPrices()">↻ Fetch latest prices</button><span>${clFeedLine()}</span></div>
    <div style="font-size:12px;color:var(--n500);margin:-4px 0 8px">Electric running costs use the electricity price directly. The factor is only used to show an MPGe (cost-equivalent MPG) for electric cars, and updates itself when you change a price — no tuning needed. A warning shows on the choice list when fuel prices are over a week old or the electricity price is from before the current price-cap quarter.</div>
    <div class="form-section-label">Battery sizes the description doesn't give</div>
    <div style="font-size:12px;color:var(--n500);margin-bottom:6px">Used only when the file and the description have no kWh figure. Every word must appear in the make and description; the most specific match wins.</div>
    <table class="ls-table" id="cls-batt"><tr><th>Description contains</th><th>Battery kWh</th><th></th></tr>${(S.battery_rules||[]).map((r,i)=>`<tr><td><input data-bm="${i}" value="${esc(r.match)}" style="width:100%"></td><td><input data-bk="${i}" type="number" step="0.1" value="${esc(String(r.kwh??''))}" style="width:90px"></td><td><button class="btn btn-danger" onclick="clBattRow(${i})">✗</button></td></tr>`).join('')}</table>
    <button class="btn" onclick="clBattRow(-1)">+ Add battery size</button>
    <div class="form-section-label">Rates</div>
    <div class="form-row quad">${f('cls-ni','Employer\'s NI (Class 1A) %',S.ni_rate,1)}${f('cls-ds','Diesel supplement % (not RDE2)',S.diesel_supplement,1)}${f('cls-vat','VAT %',S.vat_rate,1)}${f('cls-vu','Share of finance VAT not reclaimable %',S.vat_unrecoverable_share,1)}</div>
    <div class="form-row quad">${f('cls-lrr','Lease rental restriction %',S.lrr_share,1)}</div>
    <div class="form-section-label">Company car tax (BIK %) — cars registered from 6 April 2020</div>
    <div style="font-size:12px;color:var(--n500);margin-bottom:6px">Check against HMRC after each Budget. 1–50 g/km cars use the electric-range rows; above 50 g/km the CO₂ rows apply whatever the range. The highest CO₂ rate each year is the cap, diesel supplement included.</div>
    ${clTableGrid('post')}
    <div class="form-section-label" style="margin-top:12px">Cars registered before 6 April 2020</div>${clTableGrid('pre')}`;
  ['cls-pet','cls-ele'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{const pt=clN(document.getElementById('cls-pet').value),el=clN(document.getElementById('cls-ele').value);document.getElementById('cls-factor').value=pt&&el?(pt*4.54609/el).toFixed(2):'';}));
}
function clReadSettings(){
  const n=id=>clN(document.getElementById(id).value),S=clSettings;
  Object.assign(S,{petrol_litre:n('cls-pet'),diesel_litre:n('cls-die'),elec_kwh:n('cls-ele'),ni_rate:n('cls-ni')/100,diesel_supplement:n('cls-ds')/100,vat_rate:n('cls-vat')/100,vat_unrecoverable_share:n('cls-vu')/100,lrr_share:n('cls-lrr')/100,fuel_as_of:document.getElementById('cls-fasof').value,elec_as_of:document.getElementById('cls-easof').value});
  S.battery_rules=[...document.querySelectorAll('#cls-batt [data-bm]')].map(i=>({match:i.value.trim(),kwh:clN(document.querySelector(`#cls-batt [data-bk="${i.dataset.bm}"]`).value)})).filter(r=>r.match||r.kwh);
  document.querySelectorAll('#cls-body [data-year]').forEach(i=>{S.bik[i.dataset.bik].years[+i.dataset.year]=i.value.trim();});
  document.querySelectorAll('#cls-body [data-path]').forEach(i=>{const t=S.bik[i.dataset.bik],p=i.dataset.path.split('.');const v=clN(i.value);const val=v==null?null:v/100;
    if(p[0]==='zero')t.zero[+p[1]]=val;else if(p[0]==='range')t.range[p[1]][+p[2]]=val;else t.co2[+p[1]][+p[2]]=val;});
}
// Weekly n8n job (WLC Price Feed) fills these from GOV.UK weekly road fuel prices and the
// Ofgem price cap; this button runs it now. Prices it couldn't read keep their old value.
const CL_PRICE_FEED='https://covase.app.n8n.cloud/webhook/covase-wlc-price-refresh';
function clFeedLine(){const f=clSettings.price_feed;if(!f||!f.ran_at)return 'Updates automatically every Wednesday from GOV.UK (fuel) and Ofgem (electricity) once the n8n job is switched on.';
  const when=new Date(f.ran_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  return 'Last automatic update '+esc(when)+((f.problems||[]).length?' — <span style="color:#c0392b">'+f.problems.map(esc).join('; ')+'</span>':' — all prices updated');}
async function clFetchPrices(){
  const b=document.getElementById('cls-fetch');if(b){b.disabled=true;b.textContent='Fetching…';}
  try{const r=await fetch(CL_PRICE_FEED,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error('the price job answered '+r.status+' — is it switched on in n8n?');
    const j=await r.json().catch(()=>({}));const res=Array.isArray(j)?j[0]:j;
    await clLoadConfig();clRenderSettings();clRender();
    toast(res&&res.problems&&res.problems.length?'Some prices could not be fetched — see the note':'Prices updated',res&&res.problems&&res.problems.length?'error':'success');}
  catch(e){toast('Could not fetch prices: '+e.message,'error');if(b){b.disabled=false;b.textContent='↻ Fetch latest prices';}}
}
function clBattRow(i){clReadSettings();clSettings.battery_rules=clSettings.battery_rules||[];if(i<0)clSettings.battery_rules.push({match:'',kwh:null});else clSettings.battery_rules.splice(i,1);clRenderSettings();}
function clAddYear(which){
  clReadSettings();const t=clSettings.bik[which],last=t.years[t.years.length-1],y=parseInt(last)+1;
  t.years.push(y+'/'+String(y+1).slice(2));t.zero.push(t.zero[t.zero.length-1]);Object.values(t.range).forEach(a=>a.push(a[a.length-1]));t.co2.forEach(r=>r.push(r[r.length-1]));
  clRenderSettings();toast('Added '+t.years[t.years.length-1]+' as a copy of '+last+' — change the rates once HMRC publishes them');
}
async function clSaveSettings(){
  clReadSettings();
  if(['petrol_litre','diesel_litre','elec_kwh','ni_rate'].some(k=>!(clSettings[k]>0))){toast('Fuel prices and the NI rate must be filled in','error');return;}
  if((clSettings.battery_rules||[]).some(r=>!r.match||!(r.kwh>0))){toast('Each battery size needs wording and a kWh figure','error');return;}
  try{await clSaveConfig('wlc_settings',clSettings);toast('Saved','success');document.getElementById('cl-settings-modal').classList.remove('open');clRender();}catch(e){toast('Save failed: '+e.message,'error');}
}

// ── wiring ──
window.EXTRA_VIEW_LOADERS=Object.assign(window.EXTRA_VIEW_LOADERS||{},{'choice-lists':loadChoiceLists});
{const prevCfg=RT_TABLES.covase_config;RT_TABLES.covase_config=()=>{prevCfg&&prevCfg();if(clLoaded)clLoadConfig().then(()=>{clFillPolicies();clRender();});};}
