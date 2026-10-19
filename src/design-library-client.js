/* ImPrint Studio · server-managed public art / icons / vectors.
 * Loaded after legacy UI and client-api.js; does not replace existing library entries.
 */
(function(){
  'use strict';
  const API='/api/design-library',ADMIN='/api/admin/design-library';
  const CAT=['Tất cả','Icon','Art','Vector'];
  let adminList=[],publicList=[],filter='Tất cả',studioVisible=false,lastLoad=0;
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element=(tag,className,txt)=>{const v=document.createElement(tag);if(className)v.className=className;if(txt!==undefined)v.textContent=txt;return v};
  const request=async(url,method='GET',body)=>{
    const options={method,credentials:'same-origin',headers:{}};
    if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
    const r=await fetch(url,options);const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(data.error||'Máy chủ từ chối yêu cầu.');return data;
  };
  function notify(message){if(typeof toast==='function')toast(message);else alert(message)}
  function label(text,target,kind='text'){const wrap=element('label','ip-lib-field');wrap.append(element('span','',text));const input=document.createElement('input');input.type=kind;input.name=target;input.setAttribute('aria-label',text);if(kind==='text')input.maxLength=180;wrap.append(input);return wrap}
  function css(){if(document.getElementById('ip-library-styles'))return;const style=document.createElement('style');style.id='ip-library-styles';style.textContent=`
 .ip-library-admin{margin:26px auto 60px;max-width:1200px;padding:24px;background:#fff;border:1px solid #e2d9d3;border-radius:20px;color:#312923;box-shadow:0 8px 25px #21180d0b}
 .ip-library-admin *{box-sizing:border-box}.ip-library-admin header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
 .ip-library-admin h2{font-size:24px;margin:0 0 5px}.ip-library-admin p{margin:0;color:#756b65}
 .ip-lib-upload{display:grid;grid-template-columns:1.5fr 1fr 1fr 1.4fr auto;gap:10px;align-items:end;margin:20px 0;padding:16px;background:#f9f6f4;border-radius:14px}
 .ip-lib-field{display:flex;flex-direction:column;gap:5px;font-size:12px;min-width:0}
 .ip-lib-field input,.ip-lib-field select,.ip-lib-field textarea{border:1px solid #ded7d3;border-radius:8px;background:white;width:100%;padding:10px;color:inherit;min-width:0}
 .ip-lib-btn{background:#292322;color:#fff;border:0;border-radius:9px;padding:10px 13px;min-height:40px;cursor:pointer}
 .ip-lib-btn.subtle{background:#f2ece8;color:#39302d;border:1px solid #ded7d3}.ip-lib-btn.danger{color:#a12735;background:#fff0ef}
 .ip-lib-btn:disabled{opacity:.4;cursor:wait}.ip-lib-toolbar{display:flex;gap:9px;align-items:center;margin:15px 0;flex-wrap:wrap}
 .ip-lib-toolbar input,.ip-lib-toolbar select{padding:9px;border:1px solid #ded7d3;border-radius:8px}
 .ip-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
 .ip-lib-card{border:1px solid #e5dfdb;border-radius:13px;padding:10px;min-width:0;background:#fff}
 .ip-lib-card.is-archived{opacity:.57}.ip-lib-card img{width:100%;height:160px;object-fit:contain;background:repeating-conic-gradient(#f1eeeb 0 25%,#fff 0 50%) 50%/18px 18px;border-radius:8px}
 .ip-lib-card strong{display:block;margin:7px 0 2px;font-size:13px}.ip-lib-card small{font-size:11px;color:#777}
 .ip-lib-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.ip-lib-actions button{font-size:12px;padding:7px 10px}
 .ip-lib-empty{padding:20px;border:1px dashed #ddd;border-radius:12px;color:#777}
 .ip-library-public{margin:10px 0 14px;padding:12px 0;border-top:1px solid #ddd}
 .ip-library-public h4{font-size:12px;margin:0 0 8px;font-weight:700}.ip-library-public .ip-lib-public-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
 .ip-lib-public-tile{display:flex;flex-direction:column;gap:3px;background:#fff;border:1px solid #ebe5e0;border-radius:9px;padding:5px;cursor:pointer;min-width:0}
 .ip-lib-public-tile img{width:100%;aspect-ratio:1;object-fit:contain;background:#f6f3f1;border-radius:5px}
 .ip-lib-public-tile span{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 @media(max-width:850px){.ip-lib-upload{grid-template-columns:1fr 1fr}.ip-lib-upload button{grid-column:1/-1}}
 @media(max-width:500px){.ip-lib-upload{grid-template-columns:1fr}.ip-lib-upload button{grid-column:auto}.ip-library-admin{padding:14px}}
 `;document.head.append(style)}
  function showAdmin(){
    if(typeof user==='undefined'||user?.role!=='admin')return;
    css();const root=document.getElementById('app');if(!root||root.querySelector('#ip-library-admin'))return;
    const panel=element('section','ip-library-admin');panel.id='ip-library-admin';
    panel.innerHTML=`<header><div><h2>Quản lý thư viện thiết kế</h2><p>Đưa Art, Icon và Vector vào Studio cho khách sử dụng. Xóa khỏi thư viện không làm mất thiết kế cũ.</p></div><button class="ip-lib-btn subtle" id="ip-lib-refresh">Làm mới</button></header>
    <form class="ip-lib-upload" id="ip-lib-upload-form">
      <label class="ip-lib-field"><span>Tên tài nguyên</span><input name="name" maxlength="90" required placeholder="VD: Mascot hoodie"></label>
      <label class="ip-lib-field"><span>Danh mục</span><select name="category"><option>Art</option><option>Icon</option><option>Vector</option></select></label>
      <label class="ip-lib-field"><span>Mô tả (ALT)</span><input name="alt" maxlength="180" placeholder="Mô tả ngắn"></label>
      <label class="ip-lib-field"><span>Tệp hình ảnh</span><input name="file" type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/avif" multiple required></label>
      <button type="submit" class="ip-lib-btn">＋ Thêm vào thư viện</button>
    </form>
    <div class="ip-lib-toolbar"><select id="ip-lib-admin-category"><option value="all">Tất cả</option><option>Art</option><option>Icon</option><option>Vector</option></select><input id="ip-lib-admin-search" type="search" placeholder="Tìm tên hình ảnh"><label><input id="ip-lib-admin-archive" type="checkbox"> Hiện đã xóa</label><span id="ip-lib-admin-count"></span></div>
    <div id="ip-lib-admin-items" class="ip-lib-grid" aria-live="polite"></div>`;
    root.append(panel);
    const form=panel.querySelector('form');form.addEventListener('submit',async(e)=>{
      e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
      try{const files=Array.from(form.elements.file.files);if(!files.length)throw Error('Vui lòng chọn ảnh.');
       if(files.length>30)throw Error('Chỉ tải tối đa 30 tệp một lượt.');
       for(const f of files){const category=form.elements.category.value;if(category==='Vector'&&!(/\.svg$/i.test(f.name)||f.type==='image/svg+xml'))throw Error('Danh mục Vector yêu cầu tệp SVG.');
        const saved=await uploadAsset(f);const base=form.elements.name.value.trim(),name=(files.length>1?(base?base+' · ':'')+f.name.replace(/\.[^.]+$/,''):base||f.name.replace(/\.[^.]+$/,''));
        await request(ADMIN,'POST',{name,category,alt:form.elements.alt.value.trim(),mediaId:saved.id});
       }form.reset();await loadAdmin();notify('Đã thêm '+files.length+' tài nguyên.');
      }catch(e){notify(e.message)}finally{button.disabled=false}
    });
    panel.querySelector('#ip-lib-refresh').onclick=loadAdmin;
    for(const id of ['ip-lib-admin-category','ip-lib-admin-search','ip-lib-admin-archive'])panel.querySelector('#'+id).addEventListener('input',renderAdmin);
    loadAdmin();
  }
  async function uploadAsset(file){
    if(!file||file.size>20*1024*1024)throw Error('Mỗi tệp không vượt quá 20 MB.');
    if(file.type==='image/svg+xml'||/\.svg$/i.test(file.name)){
      if(file.size>2*1024*1024)throw Error('SVG không vượt quá 2 MB.');
      const r=await fetch(ADMIN+'/upload',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/svg+xml'},body:file});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'SVG bị từ chối.');return data;
    }
    if(!['image/png','image/jpeg','image/webp','image/avif'].includes(file.type))throw Error('Chỉ hỗ trợ PNG, JPG, WebP, AVIF hoặc SVG.');
    const params=new URLSearchParams({public:'1',name:file.name});
    const r=await fetch('/api/upload?'+params,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Không tải được ảnh.');return data;
  }
  async function loadAdmin(){try{adminList=(await request(ADMIN)).items||[];renderAdmin()}catch(e){notify(e.message)}}
  function renderAdmin(){const panel=document.getElementById('ip-library-admin');if(!panel)return;
    const category=panel.querySelector('#ip-lib-admin-category').value,needle=panel.querySelector('#ip-lib-admin-search').value.trim().toLowerCase(),archived=panel.querySelector('#ip-lib-admin-archive').checked;
    const list=adminList.filter(it=>(category==='all'||it.category===category)&&it.name.toLowerCase().includes(needle)&&(!it.archived||archived));
    panel.querySelector('#ip-lib-admin-count').textContent=list.length+' tài nguyên';const grid=panel.querySelector('#ip-lib-admin-items');grid.replaceChildren();
    if(!list.length)grid.append(element('p','ip-lib-empty','Chưa có tài nguyên phù hợp.'));
    for(const it of list){const card=element('article','ip-lib-card'+(it.archived?' is-archived':''));const img=document.createElement('img');img.src=it.url;img.alt=it.alt||it.name;img.loading='lazy';card.append(img,element('strong','',it.name),element('small','',it.category+' · '+(it.archived?'Đã xóa':it.enabled?'Đang hiện':'Đang ẩn')));
      const row=element('div','ip-lib-actions');
      const button=(text,click,kind='subtle')=>{const b=element('button','ip-lib-btn '+kind,text);b.type='button';b.addEventListener('click',click);row.append(b)};
      button('Sửa',()=>editItem(it));
      if(it.archived)button('Khôi phục',()=>change(it,{archived:false,enabled:true}));
      else {button(it.enabled?'Ẩn':'Hiện',()=>change(it,{enabled:!it.enabled}));button('Xóa',async()=>{if(confirm('Xóa "'+it.name+'" khỏi thư viện? Những thiết kế đã lưu vẫn sử dụng được.')){try{await request(ADMIN+'/'+it.id,'DELETE',{revision:it.revision});await loadAdmin()}catch(e){notify(e.message)}}},'danger')}
      card.append(row);grid.append(card);
    }
  }
  async function change(it,p){try{await request(ADMIN+'/'+it.id,'PATCH',{...p,revision:it.revision});await loadAdmin()}catch(e){notify(e.message)}}
  async function editItem(it){const root=document.getElementById('ip-library-admin');if(!root)return;
    let form=root.querySelector('#ip-lib-edit-form');if(form)form.remove();form=element('form','ip-lib-upload');form.id='ip-lib-edit-form';
    form.innerHTML=`<label class="ip-lib-field"><span>Tên</span><input name="name" maxlength="90" required value="${esc(it.name)}"></label>
      <label class="ip-lib-field"><span>Loại</span><select name="category"><option>Art</option><option>Icon</option><option>Vector</option></select></label>
      <label class="ip-lib-field"><span>ALT</span><input name="alt" maxlength="180" value="${esc(it.alt)}"></label>
      <label class="ip-lib-field"><span>Thứ tự</span><input name="position" type="number" min="0" max="100000" value="${it.position}"></label>
      <label class="ip-lib-field"><span>Thay tệp (tùy chọn)</span><input name="file" type="file" accept=".svg,image/*"></label>
      <button type="submit" class="ip-lib-btn">Lưu sửa đổi</button><button type="button" class="ip-lib-btn subtle" id="ip-lib-edit-cancel">Hủy</button>`;
    form.elements.category.value=it.category;
    form.querySelector('#ip-lib-edit-cancel').onclick=()=>form.remove();
    form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;
      try{const file=form.elements.file.files[0],category=form.elements.category.value;
        if(category==='Vector'&&file&&file.type!=='image/svg+xml'&&!/\.svg$/i.test(file.name))throw Error('Vector cần tệp SVG.');
        const mediaId=file?(await uploadAsset(file)).id:it.mediaId;
        await request(ADMIN+'/'+it.id,'PATCH',{revision:it.revision,name:form.elements.name.value,category,alt:form.elements.alt.value,position:Number(form.elements.position.value),mediaId});
        form.remove();await loadAdmin();notify('Đã cập nhật tài nguyên.');
      }catch(err){notify(err.message)}finally{b.disabled=false}
    });root.querySelector('.ip-lib-upload').insertAdjacentElement('afterend',form);form.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  async function loadPublic(){try{publicList=(await request(API)).items||[];lastLoad=Date.now();mountStudio()}catch(e){console.warn('ImPrint library',e)}}
  function studioReady(){if(location.hash!=='#studio'&&!(document.querySelector('#studio-shell')))return false;
    const app=document.getElementById('app');return !!app&&Array.from(app.querySelectorAll('button')).some(b=>b.textContent.trim()==='Thư viện')}
  function mountStudio(){if(!studioReady())return;
    const app=document.getElementById('app'),btns=Array.from(app.querySelectorAll('button'));
    const categoryBtns=btns.filter(b=>CAT.includes(b.textContent.trim()));
    if(categoryBtns.length<3)return;
    const group=categoryBtns.find(b=>b.textContent.trim()==='Art').parentElement;
    if(!group||!group.isConnected)return;
    let panel=app.querySelector('#ip-library-public');
    if(panel&&!panel.isConnected)panel=null;
    if(!panel){panel=element('section','ip-library-public');panel.id='ip-library-public';group.insertAdjacentElement('afterend',panel)}
    const active=categoryBtns.find(b=>b.classList.contains('active')||b.getAttribute('aria-selected')==='true'||b.getAttribute('aria-pressed')==='true');
    const current=active?.textContent.trim()||filter;
    const chosen=CAT.includes(current)?current:filter;
    const version=chosen+':'+publicList.map(it=>it.id+it.revision).join(',');
    if(panel.dataset.libraryVersion!==version){panel.dataset.libraryVersion=version;renderPublic(panel,chosen)}
  }
  function renderPublic(panel,category){if(!panel)return;
    const list=publicList.filter(it=>category==='Tất cả'||it.category===category);
    panel.replaceChildren();if(!list.length)return;
    panel.append(element('h4','','ImPrint · '+(category==='Tất cả'?'Art / Icon / Vector':category)));
    const grid=element('div','ip-lib-public-grid');
    for(const it of list){const tile=element('button','ip-lib-public-tile');tile.type='button';tile.title='Thêm '+it.name+' vào thiết kế';tile.draggable=true;
      const im=document.createElement('img');im.src=it.url;im.alt=it.alt||it.name;im.loading='lazy';tile.append(im,element('span','',it.name));
      tile.addEventListener('click',()=>insert(it));tile.addEventListener('dragstart',ev=>{ev.dataTransfer.setData('text/uri-list',new URL(it.url,location.origin).href);ev.dataTransfer.setData('text/plain',new URL(it.url,location.origin).href)});grid.append(tile)}
    panel.append(grid);
  }
  async function insert(it){
    try{
      const btns=Array.from(document.querySelectorAll('#app button'));
      // Use the existing editor's image upload pipeline to construct and persist a valid layer.
      const imgTab=btns.find(b=>b.textContent.trim()==='Ảnh');if(imgTab)imgTab.click();
      await new Promise(resolve=>setTimeout(resolve,130));
      const app=document.getElementById('app');
      let fileInput=Array.from(app.querySelectorAll('input[type=file]')).find(input=>/image|png|jpeg|webp|svg/i.test(input.accept||''));
      if(!fileInput)fileInput=Array.from(app.querySelectorAll('input[type=file]')).find(input=>!input.closest('#ip-library-admin'));
      if(!fileInput)throw Error('Chưa tìm được công cụ tải ảnh của Studio.');
      const response=await fetch(it.url,{credentials:'same-origin'});if(!response.ok)throw Error('Không tải được hình trong thư viện.');let blob=await response.blob();
      if(blob.type==='image/svg+xml'){
        // Existing editor accepts bitmap images: rasterize a clean SVG solely for the canvas layer.
        const bitmap=await createImageBitmap(blob).catch(()=>null);if(!bitmap)throw Error('SVG này không tương thích công cụ thiết kế.');
        const can=document.createElement('canvas');const ratio=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));can.width=Math.round(bitmap.width*ratio);can.height=Math.round(bitmap.height*ratio);
        can.getContext('2d').drawImage(bitmap,0,0,can.width,can.height);bitmap.close();
        blob=await new Promise(resolve=>can.toBlob(resolve,'image/png'));if(!blob)throw Error('Không xử lý được SVG.');
      }
      const file=new File([blob],it.name+'.'+((blob.type||'').split('/')[1]||'png'),{type:blob.type||'image/png'}),transfer=new DataTransfer();transfer.items.add(file);
      fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));notify('Đã chuyển "'+it.name+'" vào công cụ Ảnh.');
    }catch(e){notify(e.message)}
  }
  // Legacy app renders sections by replacing #app, so hooks always run *after* its render.
  if(typeof admin==='function'){const previous=admin;admin=function(){const out=previous.apply(this,arguments);if(typeof user!=='undefined'&&user?.role==='admin')queueMicrotask(showAdmin);return out}}
  if(typeof studio==='function'){const previous=studio;studio=function(){const out=previous.apply(this,arguments);queueMicrotask(()=>{mountStudio();if(Date.now()-lastLoad>15000)loadPublic()});return out}}
  document.addEventListener('click',e=>{const btn=e.target.closest('button');if(btn&&CAT.includes(btn.textContent.trim())&&studioReady()){filter=btn.textContent.trim();queueMicrotask(mountStudio)}},true);
  let mutationPending=false;new MutationObserver(()=>{if(mutationPending)return;mutationPending=true;setTimeout(()=>{mutationPending=false;if(studioReady())mountStudio()},150)})
    .observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{if(location.hash==='#studio'&&Date.now()-lastLoad>15000)loadPublic()});
  // Defer first load to avoid delaying legacy initialization.
  setTimeout(()=>{if(location.hash==='#studio')loadPublic()},500);
})();