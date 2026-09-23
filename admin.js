const $=s=>document.querySelector(s);
const db=supabase.createClient(window.LEXCESS_SUPABASE_URL,window.LEXCESS_SUPABASE_ANON_KEY);
let current='overview'; let session=null; let productsCache=[]; let staffCache=[];
let currentStaffId=''; let bookingCache=[]; let messageCache=[];

async function getActiveSession(){
  const {data}=await db.auth.getSession();
  session=data?.session||null;
  return session;
}
function msg(t,ok=false){const el=$('#login-msg');if(el){el.textContent=t;el.style.color=ok?'green':'#b00020'}}
function setBusy(b){const btn=$('#login-btn');btn.disabled=b;btn.textContent=b?'Signing in…':'Sign in'}
async function api(path,options={}){
  const s=await getActiveSession();
  if(!s?.access_token) throw new Error('Your admin session has expired. Please sign in again.');
  const m=path.match(/^\/api\/rest\/([^?]+)(.*)$/);
  if(!m) throw new Error('Unsupported request.');
  const url=window.LEXCESS_SUPABASE_URL+'/rest/v1/'+m[1]+m[2];
  const headers=new Headers(options.headers||{});
  headers.set('apikey',window.LEXCESS_SUPABASE_ANON_KEY);
  headers.set('Authorization','Bearer '+s.access_token);
  if(options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const res=await fetch(url,{...options,headers,signal:controller.signal});
    const text=await res.text(); let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
    if(!res.ok) throw new Error(data?.message||data?.msg||data?.error_description||data?.error||text||`Request failed (${res.status})`);
    return data;
  }catch(e){if(e.name==='AbortError')throw new Error('The request timed out. Check your internet connection.');throw e}
  finally{clearTimeout(timer)}
}
$('#login-form').addEventListener('submit',async e=>{
 e.preventDefault(); setBusy(true); msg('Signing in…',true);
 try{
  const {data,error}=await db.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
  if(error) throw error;
  session=data.session; showApp();
 }catch(err){msg(err.message||'Sign in failed.');}
 finally{setBusy(false)}
});
$('#logout').onclick=async()=>{await db.auth.signOut();session=null;localStorage.removeItem('lexcess_session');location.reload()};
function showApp(){ $('#login').style.display='none'; $('#app').style.display='grid'; render(current); }
async function render(view){
 current=view; document.querySelectorAll('aside nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('#title').textContent={overview:'Overview',products:'Dresses / Products',staff:'Staff',bookings:'Bookings',messages:'Messages'}[view];
 if(view==='overview')return overview(); if(view==='products')return products(); if(view==='staff')return staff(); if(view==='bookings')return bookings(); return messages();
}
document.querySelectorAll('aside nav button').forEach(b=>b.onclick=()=>render(b.dataset.view));
async function count(t){const d=await api('/api/rest/'+t+'?select=id');return Array.isArray(d)?d.length:0}
function overview(){
 $('#content').innerHTML='<div class="cards"><div class="stat"><span>Products</span><strong id="c1">…</strong></div><div class="stat"><span>Staff</span><strong id="c2">…</strong></div><div class="stat"><span>Bookings</span><strong id="c3">…</strong></div><div class="stat"><span>Messages</span><strong id="c4">…</strong></div></div><div id="overview-msg" class="notice" style="display:none"></div>';
 Promise.all(['products','staff','bookings','messages'].map(count)).then(a=>['#c1','#c2','#c3','#c4'].forEach((s,i)=>$(s).textContent=a[i])).catch(e=>{const n=$('#overview-msg');n.textContent=e.message;n.style.display='block'});
}
function products(){ $('#content').innerHTML='<div class="toolbar"><p class="muted">Manage dresses and products. Click Edit to change stock, price, details or photos.</p><button class="primary" id="add">+ Add dress</button></div><div id="list">Loading…</div>'; $('#add').onclick=()=>productForm(); loadProductsTable(); }
function staff(){ currentStaffId=''; $('#content').innerHTML='<div class="toolbar"><p class="muted">Manage staff profiles.</p><button class="primary" id="add">+ Add staff</button></div><div id="list">Loading…</div>'; $('#add').onclick=()=>staffForm(); loadTable('staff'); }
async function loadProductsTable(){
 try{
  const data=await api('/api/rest/products?select=*&order=created_at.desc'); productsCache=Array.isArray(data)?data:[];
  if(!productsCache.length){$('#list').innerHTML='<div class="notice">Nothing here yet. Add your first item.</div>';return}
  $('#list').innerHTML='<table class="table"><thead><tr><th>Photo</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Published</th><th>Action</th></tr></thead><tbody>'+productsCache.map(x=>`<tr><td>${photoCount(x.image_url)}</td><td>${escapeHtml(String(x.name??''))}</td><td>${escapeHtml(String(x.category??''))}</td><td>GH₵ ${Number(x.price||0).toLocaleString()}</td><td><strong>${escapeHtml(String(x.stock??0))}</strong></td><td>${x.published?'Yes':'No'}</td><td><button onclick="editProduct('${x.id}')">Edit</button> <button class="danger" onclick="deleteRow('products','${x.id}')">Delete</button></td></tr>`).join('')+'</tbody></table>';
 }catch(e){$('#list').innerHTML='<div class="notice">'+escapeHtml(e.message)+'</div>'}
}
async function loadTable(t){
 try{
  const data=await api('/api/rest/'+t+'?select=*&order=created_at.desc');
  if(t==='staff') staffCache=Array.isArray(data)?data:[];
  if(!data?.length){$('#list').innerHTML='<div class="notice">Nothing here yet. Add your first item.</div>';return}
  const fields=t==='products'?['name','category','price','published']:['name','position','active'];
  const rows=data.map(x=>{
    const actions=t==='staff'
      ? '<button onclick="editStaff(\''+x.id+'\')">Edit</button> <button class="danger" onclick="deleteRow(\''+t+'\',\''+x.id+'\')">Delete</button>'
      : '<button class="danger" onclick="deleteRow(\''+t+'\',\''+x.id+'\')">Delete</button>';
    return '<tr>'+fields.map(f=>'<td>'+escapeHtml(String(x[f]??''))+'</td>').join('')+'<td>'+photoCount(x.image_url)+'</td><td>'+actions+'</td></tr>';
  }).join('');
  $('#list').innerHTML='<table class="table"><thead><tr>'+fields.map(x=>'<th>'+x+'</th>').join('')+'<th>Photo</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table>';
 }catch(e){$('#list').innerHTML='<div class="notice">'+escapeHtml(e.message)+'</div>'}
}
function photoCount(value){const a=readImages(value);return a.length?a.length+' photo'+(a.length===1?'':'s'):'—'}
function readImages(value){if(!value)return[];try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.filter(Boolean)}catch{}return[String(value)]}
window.deleteRow=async(t,id)=>{if(!confirm('Delete this item?'))return;try{await api('/api/rest/'+t+'?id=eq.'+encodeURIComponent(id),{method:'DELETE'});render(current)}catch(e){alert(e.message)}};
window.editProduct=id=>{const p=productsCache.find(x=>x.id===id);if(p)productForm(p)};
function productForm(product=null){
 const editing=!!product, images=editing?readImages(product.image_url):[];
 $('#content').innerHTML=`<form class="form" id="editor" data-staff-id="${escapeAttr(staff?.id||'')}">
 <div class="form-head"><div><h2>${editing?'Edit dress':'Add dress'}</h2><p class="muted">${editing?'Update stock, price, details or photos anytime.':'Add a new dress to the collection.'}</p></div><button type="button" class="secondary" id="cancel-edit">Cancel</button></div>
 <label>Name<input name="name" required value="${escapeAttr(product?.name||'')}"></label>
 <label>Category<input name="category" placeholder="Dresses, Sets, Tops…" required value="${escapeAttr(product?.category||'')}"></label>
 <label>Price (GH₵)<input name="price" type="number" min="0" step="0.01" required value="${product?.price??''}"></label>
 <label>Description<textarea name="description" rows="4">${escapeHtml(product?.description||'')}</textarea></label>
 <label>Sizes<input name="sizes" placeholder="S, M, L, XL" value="${escapeAttr(product?.sizes||'')}"></label>
 <label>Stock<input name="stock" type="number" min="0" value="${product?.stock??1}"></label>
 ${editing&&images.length?`<div><label>Current photos</label><div id="current-images" class="image-preview">${images.map((url,i)=>`<div class="preview-item existing-photo"><img src="${escapeAttr(url)}" alt="Dress photo ${i+1}"><small>Photo ${i+1}</small></div>`).join('')}</div></div>`:''}
 <label>${editing?'Add more photos':'Dress photos'} <span class="muted">(select one or multiple)</span><input id="product-images" name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label>
 <div id="image-preview" class="image-preview"></div>
 <label class="check"><input name="published" type="checkbox" ${product?.published!==false?'checked':''}> Published</label>
 <button class="primary" id="save-product">${editing?'Save changes':'Save dress'}</button><p id="formmsg"></p>
 </form>`;
 $('#cancel-edit').onclick=()=>render('products');
 const input=$('#product-images'); input.onchange=()=>previewFiles(input.files); $('#editor').onsubmit=e=>saveProduct(e,product);
}
function staffForm(staff=null,profileId=null){
 const editing=!!staff;
 const staffProfileId=String(profileId||staff?.id||currentStaffId||'');
 if(editing && !staffProfileId){alert('Could not open this staff profile ID. Please refresh Staff and try again.');return}
 $('#content').innerHTML=`<form class="form" id="editor" data-profile-id="${escapeAttr(staffProfileId)}"><input type="hidden" name="staff_id" value="${escapeAttr(staffProfileId)}"><div class="form-head"><div><h2>${editing?'Edit staff':'Add staff'}</h2><p class="muted">${editing?'Update this staff profile anytime.':'Add a staff profile to the boutique.'}</p></div><button type="button" class="secondary" id="cancel-edit">Cancel</button></div><label>Name<input name="name" required value="${escapeAttr(staff?.name||'')}"></label><label>Position<input name="position" value="${escapeAttr(staff?.position||'')}"></label><label>Bio<textarea name="bio" rows="4">${escapeHtml(staff?.bio||'')}</textarea></label>${editing&&staff?.image_url?`<div><label>Current photo</label><div id="current-images" class="image-preview"><div class="preview-item existing-photo"><img src="${escapeAttr(staff.image_url)}" alt="Staff photo"><small>Current photo</small></div></div></div>`:''}<label>${editing?'Replace photo':'Staff photo'} <span class="muted">(optional)</span><input id="staff-image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><div id="image-preview" class="image-preview"></div><label>Social link<input name="social_url" type="url" value="${escapeAttr(staff?.social_url||'')}"></label><label class="check"><input name="active" type="checkbox" ${staff?.active!==false?'checked':''}> Active</label><button class="primary" id="save-staff">${editing?'Save changes':'Save staff'}</button><p id="formmsg"></p></form>`;
 $('#cancel-edit').onclick=()=>render('staff');
 const input=$('#staff-image'); input.onchange=()=>previewFiles(input.files); $('#editor').onsubmit=e=>saveStaff(e,staff);
}
window.editStaff=id=>{const s=staffCache.find(x=>String(x.id)===String(id));if(!s){alert('Could not open this staff profile. Please refresh Staff and try again.');return}currentStaffId=String(s.id);staffForm(s,currentStaffId)};
function previewFiles(files){const el=$('#image-preview');if(!el)return;el.innerHTML='';[...files].forEach(file=>{const wrap=document.createElement('div');wrap.className='preview-item';const img=document.createElement('img');img.alt=file.name;img.src=URL.createObjectURL(file);wrap.appendChild(img);const name=document.createElement('small');name.textContent=file.name;wrap.appendChild(name);el.appendChild(wrap)})}
async function uploadImage(file,folder='products'){
 if(!session?.access_token)throw new Error('Your admin session has expired. Please sign in again.');
 const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/-+/g,'-');
 const path=`${folder}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
 const url=window.LEXCESS_SUPABASE_URL+'/storage/v1/object/lexcess-media/'+path;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
 try{const res=await fetch(url,{method:'POST',headers:{apikey:window.LEXCESS_SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file,signal:controller.signal});const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!res.ok)throw new Error(data?.message||data?.error||text||`Image upload failed (${res.status})`);return window.LEXCESS_SUPABASE_URL+'/storage/v1/object/public/lexcess-media/'+path}catch(e){if(e.name==='AbortError')throw new Error('Photo upload timed out. Check your internet/VPN connection.');throw e}finally{clearTimeout(timer)}}
async function saveProduct(e,existing=null){
 e.preventDefault();const form=e.currentTarget,msgEl=$('#formmsg'),btn=$('#save-product');btn.disabled=true;msgEl.textContent=existing?'Saving changes…':'Saving dress…';
 try{const fd=new FormData(form),files=[...($('#product-images')?.files||[])],urls=existing?readImages(existing.image_url):[];for(let i=0;i<files.length;i++){msgEl.textContent=`Uploading photo ${i+1} of ${files.length}…`;urls.push(await uploadImage(files[i]))}const o={name:fd.get('name'),category:fd.get('category'),price:Number(fd.get('price')||0),description:fd.get('description')||'',sizes:fd.get('sizes')||'',stock:Number(fd.get('stock')||0),image_url:urls.length?JSON.stringify(urls):'',published:fd.has('published')};msgEl.textContent=existing?'Saving changes…':'Saving dress…';if(existing){await api('/api/rest/products?id=eq.'+encodeURIComponent(existing.id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(o)})}else{await api('/api/rest/products',{method:'POST',body:JSON.stringify(o)})}msgEl.textContent=existing?'Changes saved successfully.':'Saved. Photo(s) uploaded successfully.';setTimeout(()=>render('products'),700)}catch(err){msgEl.textContent=err.message||'Could not save dress.'}finally{btn.disabled=false}}
async function saveStaff(e,existing=null){e.preventDefault();const form=e.currentTarget,msgEl=$('#formmsg'),btn=$('#save-staff');btn.disabled=true;msgEl.textContent=existing?'Saving changes…':'Saving staff…';try{const fd=new FormData(form),files=[...($('#staff-image')?.files||[])];const staffId=String(form.elements.staff_id?.value||form.dataset.profileId||existing?.id||currentStaffId||'').trim();let image_url=existing?.image_url||'';if(files[0]){msgEl.textContent='Uploading photo…';image_url=await uploadImage(files[0],'staff')}const o={name:fd.get('name'),position:fd.get('position')||'',bio:fd.get('bio')||'',image_url,social_url:fd.get('social_url')||'',active:fd.has('active')};if(existing){if(!staffId)throw new Error('Could not determine this staff profile ID. Please close and reopen the profile.');await api('/api/rest/staff?id=eq.'+encodeURIComponent(staffId),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(o)})}else{await api('/api/rest/staff',{method:'POST',body:JSON.stringify(o)})}msgEl.textContent=existing?'Changes saved successfully.':'Saved. Photo uploaded successfully.';currentStaffId='';setTimeout(()=>render('staff'),700)}catch(err){msgEl.textContent=err.message||'Could not save staff.'}finally{btn.disabled=false}}
async function bookings(){try{const data=await api('/api/rest/bookings?select=*&order=created_at.desc');bookingCache=Array.isArray(data)?data:[];renderBookings()}catch(e){$('#content').innerHTML='<div class="notice">'+escapeHtml(e.message)+'</div>'}}
function renderBookings(){if(!bookingCache.length){$('#content').innerHTML='<div class="notice">No bookings yet.</div>';return}const rows=bookingCache.map(r=>`<tr><td>${escapeHtml(r.name||'')}</td><td>${escapeHtml(r.phone||'')}</td><td>${escapeHtml(r.email||'')}</td><td>${escapeHtml(r.service||'')}</td><td>${escapeHtml(r.appointment_date||'')} ${escapeHtml(String(r.appointment_time||'').slice(0,5))}</td><td>${escapeHtml(r.notes||'')}</td><td><select onchange="updateBookingStatus('${r.id}',this.value)"><option value="pending" ${r.status==='pending'?'selected':''}>Pending</option><option value="confirmed" ${r.status==='confirmed'?'selected':''}>Confirmed</option><option value="completed" ${r.status==='completed'?'selected':''}>Completed</option><option value="cancelled" ${r.status==='cancelled'?'selected':''}>Cancelled</option></select></td><td><button class="danger" onclick="deleteRow('bookings','${r.id}')">Delete</button></td></tr>`).join('');$('#content').innerHTML='<div class="toolbar"><p class="muted">Manage customer appointments and update their status.</p></div><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Service</th><th>Appointment</th><th>Notes</th><th>Status</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table></div>'}
window.updateBookingStatus=async(id,status)=>{try{await api('/api/rest/bookings?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status})});const row=bookingCache.find(x=>String(x.id)===String(id));if(row)row.status=status}catch(e){alert(e.message)}};
async function messages(){try{const data=await api('/api/rest/messages?select=*&order=created_at.desc');messageCache=Array.isArray(data)?data:[];renderMessages()}catch(e){$('#content').innerHTML='<div class="notice">'+escapeHtml(e.message)+'</div>'}}
function renderMessages(){if(!messageCache.length){$('#content').innerHTML='<div class="notice">No messages yet.</div>';return}const rows=messageCache.map(r=>`<tr><td>${escapeHtml(r.name||'')}</td><td>${escapeHtml(r.email||'')}</td><td>${escapeHtml(r.message||'')}</td><td><select onchange="updateMessageStatus('${r.id}',this.value)"><option value="unread" ${r.status==='unread'?'selected':''}>Unread</option><option value="read" ${r.status==='read'?'selected':''}>Read</option></select></td><td><button class="danger" onclick="deleteRow('messages','${r.id}')">Delete</button></td></tr>`).join('');$('#content').innerHTML='<div class="toolbar"><p class="muted">Review customer enquiries and mark them read when handled.</p></div><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Message</th><th>Status</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table></div>'}
window.updateMessageStatus=async(id,status)=>{try{await api('/api/rest/messages?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status})});const row=messageCache.find(x=>String(x.id)===String(id));if(row)row.status=status}catch(e){alert(e.message)}};
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(s){return escapeHtml(s).replace(/`/g,'&#96;')}
getActiveSession().then(s=>{if(s)showApp()}).catch(()=>{});
