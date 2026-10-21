// ─── DOCUMENT LIBRARY (phase-crm-foundations.sql) ───
// Files live in the PRIVATE Storage bucket `documents`; covase_documents holds
// one row per file and covase_document_links attaches it to any record
// (record_type + record_id), so one signed contract can sit on the vehicle,
// the account and the driver at once. Nothing gets a public URL: opening a
// file asks Storage for a link that expires after 5 minutes. "Remove" only
// stamps deleted_at -- the file is kept, so a mis-click loses nothing.
const DOC_TYPES=[['quotation','Quotation'],['funder_quote','Funder quote / worksheet'],['purchase_order','Purchase order'],
  ['order_confirmation','Order confirmation'],['contract','Contract'],['signed_contract','Signed contract'],['v5','V5 / registration'],
  ['driving_licence','Driving licence'],['delivery_note','Delivery note'],['invoice','Invoice'],['photo','Photo'],
  ['correspondence','Correspondence'],['other','Other']];
const DOC_MAX_BYTES=26214400; // matches the bucket's file_size_limit (25MB)
let docCtx=null; // {type,id,title}

function docTypeLabel(t){return (DOC_TYPES.find(d=>d[0]===t)||[0,'Other'])[1];}
function docSize(n){if(!n&&n!==0)return '';return n<1024?n+' B':n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB';}
function docStorageUrl(path){const{url}=getConfig();return `${url}/storage/v1/object/${path}`;}
function docHeaders(extra){const{key}=getConfig();return {'apikey':key,'Authorization':`Bearer ${key}`,...(extra||{})};}

function openDocs(type,id,title){
  docCtx={type,id,title:title||''};
  document.getElementById('docs-modal-title').textContent='Documents'+(title?' — '+title:'');
  document.getElementById('docs-type').value='other';
  document.getElementById('docs-file').value='';
  document.getElementById('docs-modal').classList.add('open');
  loadDocs();
}
function closeDocsModal(){document.getElementById('docs-modal').classList.remove('open');docCtx=null;}

async function loadDocs(){
  const el=document.getElementById('docs-list');if(!docCtx)return;
  el.innerHTML='<div class="loading">Loading documents…</div>';
  try{
    const rows=await sbReq(`covase_document_links?record_type=eq.${encodeURIComponent(docCtx.type)}&record_id=eq.${encodeURIComponent(docCtx.id)}&select=document_id,covase_documents(*)`);
    const docs=rows.map(r=>r.covase_documents).filter(d=>d&&!d.deleted_at).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    if(!docs.length){el.innerHTML='<div class="empty-state" style="padding:24px"><div class="empty-icon">📎</div><div class="empty-title">No documents yet</div><div class="empty-sub">Choose a type, then add files or drop them here.</div></div>';return;}
    el.innerHTML=docs.map(d=>`<div class="doc-row">
      <div class="doc-main"><div class="doc-name">${esc(d.title||d.file_name)}</div>
        <div class="doc-meta">${esc(docTypeLabel(d.doc_type))} · ${esc(docSize(d.size_bytes))} · ${d.created_at?fmtUK(String(d.created_at).slice(0,10)):''}${d.uploaded_by?' · '+esc(d.uploaded_by):''}</div></div>
      <button class="btn btn-edit" onclick="openDoc('${esc(d.id)}')">Open</button>
      <button class="btn btn-danger" title="Remove from this list (the file is kept)" onclick="removeDoc('${esc(d.id)}')">✗</button>
    </div>`).join('');
    el._docs=docs;
  }catch(e){el.innerHTML=`<div class="empty-state" style="padding:24px"><div class="empty-title">Couldn't load documents</div><div class="empty-sub">${esc(e.message)}</div></div>`;}
}

async function uploadDocs(files){
  if(!docCtx||!files||!files.length)return;
  const type=document.getElementById('docs-type').value||'other';
  let ok=0;
  for(const f of files){
    if(f.size>DOC_MAX_BYTES){toast(`${f.name} is over 25MB — not uploaded`,'error');continue;}
    const safe=f.name.replace(/[^\w.\-]+/g,'_').slice(-120);
    const path=`documents/${docCtx.type}/${docCtx.id}/${Date.now()}-${safe}`;
    try{
      const r=await fetch(docStorageUrl(path),{method:'POST',headers:docHeaders({'Content-Type':f.type||'application/octet-stream','x-upsert':'false'}),body:f});
      if(!r.ok)throw new Error(await r.text());
      const ins=await sbReq('covase_documents',{method:'POST',body:{storage_path:path.replace(/^documents\//,''),file_name:f.name,mime_type:f.type||null,size_bytes:f.size,doc_type:type,source:'upload'}});
      const doc=Array.isArray(ins)?ins[0]:ins;
      await sbReq('covase_document_links',{method:'POST',body:{document_id:doc.id,record_type:docCtx.type,record_id:docCtx.id},prefer:'return=minimal'});
      ok++;
    }catch(e){toast(`${f.name}: upload failed — ${e.message}`,'error');}
  }
  document.getElementById('docs-file').value='';
  if(ok)toast(ok===1?'Document added':ok+' documents added','success');
  loadDocs();
}

async function openDoc(docId){
  const d=(document.getElementById('docs-list')._docs||[]).find(x=>x.id===docId);if(!d)return;
  const w=window.open('','_blank'); // open now so the browser doesn't block it as a pop-up
  try{
    const r=await fetch(`${getConfig().url}/storage/v1/object/sign/documents/${d.storage_path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:docHeaders({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:300})});
    const j=await r.json();
    if(!r.ok||!j.signedURL)throw new Error(j.message||j.error||('HTTP '+r.status));
    const link=`${getConfig().url}/storage/v1${j.signedURL}`;
    if(w)w.location=link;else window.location=link;
  }catch(e){if(w)w.close();toast("Couldn't open document — "+e.message,'error');}
}

async function removeDoc(docId){
  if(!confirm('Remove this document from the list? The file itself is kept.'))return;
  try{
    await sbReq(`covase_documents?id=eq.${encodeURIComponent(docId)}`,{method:'PATCH',body:{deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()},prefer:'return=minimal'});
    toast('Document removed','success');loadDocs();
  }catch(e){toast('Remove failed: '+e.message,'error');}
}

function docsDrop(ev){ev.preventDefault();document.getElementById('docs-drop').classList.remove('over');uploadDocs(ev.dataTransfer.files);}
