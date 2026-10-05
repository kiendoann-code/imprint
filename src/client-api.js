let backendReady=false,serverSnapshot=null,cartRevision=0,syncQueue=Promise.resolve(),uploadedAssets=new Map(),uploadedMedia=new Map();
async function api(path,method='GET',value){const r=await fetch(path,{method,credentials:'same-origin',headers:value!==undefined?{'Content-Type':'application/json'}:{},body:value!==undefined?JSON.stringify(value):undefined});let result;try{result=await r.json()}catch{throw Error('Máy chủ chưa phản hồi đúng. Hãy tải lại trang.')}if(!r.ok){const e=Error(result.error||'Không thể xử lý yêu cầu.');e.status=r.status;throw e}return result}
function updateHeader(){$('#count').textContent=data.cart.reduce((s,i)=>s+i.qty,0);$('#announcement').textContent=data.campaign;$('#accountBtn').textContent=user?user.name:'Tài khoản'}
function rememberSnapshot(){serverSnapshot=JSON.parse(JSON.stringify({products:data.products,campaign:data.campaign,coupons:data.coupons,feedback:data.feedback,collections:collectionItems(),orders:data.orders,designs:data.designs,cart:data.cart}));}
async function refreshBackend({keepGuest=false}={}){const guest=keepGuest&&!user?data?.cart||[]:[];const result=await api('/api/bootstrap');user=result.user;cartRevision=result.cartRevision||0;data={...result,cart:result.user?result.cart:guest,users:[],catalogV5:true};rememberSnapshot();updateHeader();return result}
async function uploadBlob(blob,publicFile=false,meta={}){const q=new URLSearchParams({public:publicFile?'1':'0',name:meta.name||'ảnh',width:meta.width||0,height:meta.height||0});const r=await fetch('/api/upload?'+q,{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type},body:blob});const result=await r.json();if(!r.ok)throw Error(result.error||'Không tải được tệp.');return result}
async function mediaRemote(src,publicFile=false){if(!src||!src.startsWith('data:'))return src;if(uploadedMedia.has(src))return uploadedMedia.get(src);const file=await(await fetch(src)).blob(),out=await uploadBlob(file,publicFile);uploadedMedia.set(src,out.url);return out.url}
async function designRemote(d){const out=clone(d);for(const layer of [...out.layers,...Object.values(out.sides||{}).flatMap(s=>s.layers||[])]){if(!layer.asset)continue;let id=layer.asset;if(uploadedAssets.has(id)){layer.asset=uploadedAssets.get(id);continue}if(await get('assets',id)){const a=await get('assets',id);if(a.cloudId&&a.cloudOwner===user.id){layer.asset=a.cloudId;uploadedAssets.set(id,a.cloudId);continue}const r=await uploadBlob(a.original,false,{name:a.name,width:a.width,height:a.height});a.cloudId=r.id;a.cloudOwner=user.id;await put('assets',id,a);await put('assets',r.id,a);uploadedAssets.set(id,r.id);layer.asset=r.id}else{layer.asset=id}}return out}
async function itemsRemote(items){const out=[];for(const item of items){const next=clone(item);if(next.design)next.design=await designRemote(next.design);next.preview=await mediaRemote(next.preview,false);out.push(next)}return out}
const equalData=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function syncAdmin(){const before=serverSnapshot;for(let i=0;i<data.products.length;i++){let p=data.products[i],old=before.products.find(x=>x.id===p.id);if(!old||!equalData(p,old)){p=clone(p);p.img=await mediaRemote(p.img,true);const updated=await api('/api/admin/products'+(old?'/'+p.id:''),old?'PUT':'POST',p);data.products[i]=updated;const pos=before.products.findIndex(x=>x.id===p.id);if(pos>=0)before.products[pos]=clone(updated);else before.products.push(clone(updated))}}for(const old of before.products.slice())if(!data.products.some(p=>p.id===old.id)){await api('/api/admin/products/'+old.id,'DELETE',{});before.products=before.products.filter(p=>p.id!==old.id)}for(const key of ['campaign','coupons','feedback','collections']){const value=key==='collections'?collectionItems():data[key];if(equalData(value,before[key]))continue;let next=clone(value);if(key==='feedback')for(const f of next)f.img=await mediaRemote(f.img,true);if(key==='collections')for(const c of next)if(c.kind!=='youtube')c.src=await mediaRemote(c.src,true);const result=await api('/api/admin/settings/'+key,'PUT',{value:next,revision:data.revisions[key]});data[key]=next;data.revisions[key]=result.revision;before[key]=clone(next)}for(let i=0;i<data.orders.length;i++){const o=data.orders[i],old=before.orders.find(x=>x.id===o.id);if(old&&(old.status!==o.status||old.tracking!==o.tracking)){const saved=await api('/api/admin/orders/'+o.id,'PUT',{status:o.status,tracking:o.tracking});data.orders[i]=saved;before.orders[before.orders.findIndex(x=>x.id===o.id)]=clone(saved)}}}
async function syncCustomer(){if(!equalData(data.cart,serverSnapshot.cart)){const out=await api('/api/cart','PUT',{items:await itemsRemote(data.cart),revision:cartRevision});data.cart=out.items;cartRevision=out.revision;serverSnapshot.cart=clone(out.items)}for(let i=0;i<data.designs.length;i++){const d=data.designs[i],old=serverSnapshot.designs.find(x=>x.id===d.id);if(!old||!equalData(d,old)){const saved=await api('/api/designs','POST',{id:d.id,design:await designRemote(d.design)});data.designs[i]=saved;const pos=serverSnapshot.designs.findIndex(x=>x.id===d.id);if(pos>=0)serverSnapshot.designs[pos]=clone(saved);else serverSnapshot.designs.push(clone(saved))}}for(const old of serverSnapshot.designs.slice())if(!data.designs.some(d=>d.id===old.id)){await api('/api/designs/'+old.id,'DELETE',{});serverSnapshot.designs=serverSnapshot.designs.filter(d=>d.id!==old.id)}}
persist=function(){const job=async()=>{if(!backendReady)return true;try{if(user?.role==='admin')await syncAdmin();else if(user)await syncCustomer();else await put('state','guest-cart',data.cart);updateHeader();return true}catch(e){toast(e.message);throw e}};const task=syncQueue.then(job);syncQueue=task.catch(()=>{});return task};
const oldGetBackend=get;get=async function(store,key){const cached=await oldGetBackend(store,key);if(store!=='assets'||cached||!backendReady)return cached;if(!user)return null;const r=await fetch('/api/files/'+key,{credentials:'same-origin'});if(!r.ok)throw Error('Không tải được ảnh gốc. Hãy đăng nhập lại.');const original=await r.blob(),im=await createImageBitmap(original),scale=Math.min(1,1800/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*scale);c.height=Math.round(im.height*scale);c.getContext('2d').drawImage(im,0,0,c.width,c.height);const a={original,preview:await new Promise(res=>c.toBlob(res,'image/png')),width:im.width,height:im.height,name:'Ảnh đã lưu',cloudId:key,cloudOwner:user.id};im.close();await put('assets',key,a);return a};
const authBeforeBackend=auth;auth=function(register=false,adminLogin=false){if(adminLogin){if($('#modal').open)$('#modal').close();go('admin');return}authBeforeBackend(register,false);const note=$('#modal .muted');if(note)note.textContent='Đăng nhập để lưu thiết kế, giỏ hàng và theo dõi đơn trên mọi thiết bị.'};
submitAuth=async function(register){const button=$('#authSubmit');button.disabled=true;try{const guest=user?[]:clone(data.cart),response=await api('/api/auth/'+(register?'register':'login'),'POST',{email:$('#email').value.trim(),password:$('#password').value,name:$('#authName')?.value.trim()});user=response.user;await refreshBackend();if(guest.length&&user.role!=='admin'){const ids=new Set(data.cart.map(i=>i.id));data.cart.push(...guest.filter(i=>!ids.has(i.id)));await persist()}await put('state','guest-cart',[]);$('#modal').close();const next=authNext;authNext=null;if(next)next();else go(user.role==='admin'?'admin':'account')}catch(e){$('#authError').textContent=e.message;button.disabled=false}};
logout=async function(){try{await api('/api/auth/logout','POST',{});const admin=user?.role==='admin';user=null;data.cart=[];data.designs=[];data.orders=[];uploadedAssets.clear();uploadedMedia.clear();for(const im of images.values())im.close?.();images.clear();await new Promise((res,rej)=>{const t=db.transaction('assets','readwrite');t.objectStore('assets').clear();t.oncomplete=res;t.onerror=()=>rej(t.error)});await put('state','guest-cart',[]);await refreshBackend();go('home')}catch(e){toast(e.message)}};
saveProfile=async function(){try{const r=await api('/api/profile','PUT',{name:$('#profileName').value.trim(),phone:$('#profilePhone').value,address:$('#profileAddress').value});user=r.user;updateHeader();toast('Đã lưu thông tin.')}catch(e){toast(e.message)}};
const checkoutBeforeBackend=checkout;checkout=function(){checkoutBeforeBackend();if(!$('#checkoutForm'))return;app.querySelector('.notice').textContent='Đơn hàng được gửi đến ImPrint. Cửa hàng sẽ kiểm tra thiết kế và liên hệ xác nhận trước khi sản xuất.';$('#placeBtn').textContent='Đặt hàng';const label=$('#checkoutForm input[name="pay"]').parentElement;label.lastChild.textContent=' Thanh toán khi nhận hàng';};
let orderRequestKey=null;placeOrder=async function(){if(busy||!user||!data.cart.length)return;busy=true;$('#placeBtn').disabled=true;try{await persist();orderRequestKey||=crypto.randomUUID();const shipping=Object.fromEntries(['fullName','phone','city','ward','address','note'].map(k=>[k,$('#'+k).value.trim()]));const order=await api('/api/orders','POST',{shipping,coupon,cartRevision,requestKey:orderRequestKey});orderRequestKey=null;coupon='';await refreshBackend();go('account');toast('Đã gửi đơn '+order.id+' đến ImPrint.')}catch(e){toast(e.message);if($('#placeBtn'))$('#placeBtn').disabled=false}finally{busy=false}};
const adminBeforeBackend=admin;admin=function(){if(user?.role==='admin'){adminBeforeBackend();const notice=app.querySelector('.notice');if(notice)notice.textContent='Nội dung được lưu trên máy chủ và hiển thị cho khách. Đơn hàng, ảnh gốc và thiết kế được lưu chung.';return}app.innerHTML=`<div class="wrap section admin-login-layout"><div><div class="eyebrow">IMPRINT · QUẢN TRỊ</div><h1>Quản lý cửa hàng.</h1><p>Đăng nhập bằng email và mật khẩu quản trị để quản lý cửa hàng.</p></div><div class="panel"><h2>Đăng nhập quản trị</h2><p>Chỉ tài khoản chủ website có quyền truy cập.</p><button class="button primary" onclick="auth(false)">Đăng nhập quản trị</button><p class="muted">Tài khoản quản trị do chủ cửa hàng thiết lập.</p></div></div>`};
const helpBeforeBackend=help;help=function(){helpBeforeBackend();app.querySelectorAll('details').forEach(d=>{const q=d.querySelector('summary').textContent;if(q==='Thanh toán và giao hàng')d.querySelector('p').textContent='Đặt hàng trên website để gửi thông tin và thiết kế đến ImPrint. Hiện hỗ trợ thanh toán khi nhận hàng; cửa hàng kiểm tra thiết kế và liên hệ xác nhận trước sản xuất. Thanh toán trực tuyến và hãng vận chuyển chưa được kết nối.';if(q==='Thông tin và dữ liệu được lưu ở đâu?')d.querySelector('p').textContent='Tài khoản, thiết kế đã lưu, giỏ hàng sau đăng nhập và đơn hàng được lưu trên máy chủ. Bản nháp trước đăng nhập nằm trên thiết bị hiện tại.'})};

/* IMPRINT_COLLECTIONS_PAGE_START */

function imprintInstallCollectionsStyle(){
    if(document.getElementById('imprintCollectionsStyle')) return;

    const style=document.createElement('style');
    style.id='imprintCollectionsStyle';

    style.textContent=`
        .imprint-collections-page{
            min-height:80vh;
            padding:54px 0 90px;
        }

        .imprint-collections-head{
            max-width:760px;
            margin-bottom:42px;
        }

        .imprint-collections-head h1{
            font-size:clamp(42px,6vw,76px);
            margin:8px 0 16px;
            line-height:1;
            letter-spacing:-.055em;
        }

        .imprint-collections-head p{
            max-width:580px;
            color:var(--muted);
            font-size:16px;
        }

        .imprint-collections-filter{
            display:flex;
            flex-wrap:wrap;
            gap:8px;
            margin-top:25px;
        }

        .imprint-collections-filter button{
            border-radius:999px;
            padding:8px 15px;
            background:transparent;
        }

        .imprint-collections-filter button.active{
            background:var(--ink);
            color:#fff;
            border-color:var(--ink);
        }

        .imprint-pinterest{
            column-count:4;
            column-gap:18px;
            width:100%;
        }

        .imprint-pin{
            display:inline-block;
            width:100%;
            break-inside:avoid;
            margin:0 0 18px;
            background:#fff;
            border-radius:14px;
            overflow:hidden;
            border:1px solid rgba(80,60,50,.08);
            vertical-align:top;
            transition:
                transform .25s ease,
                box-shadow .25s ease;
        }

        .imprint-pin:hover{
            transform:translateY(-3px);
            box-shadow:0 16px 35px rgba(60,40,30,.09);
        }

        .imprint-pin-media{
            width:100%;
            overflow:hidden;
            background:#eee8e1;
        }

        .imprint-pin-media img{
            width:100%;
            height:auto;
            display:block;
        }

        .imprint-pin-media video{
            width:100%;
            height:auto;
            display:block;
            background:#111;
        }

        .imprint-pin-media iframe{
            width:100%;
            aspect-ratio:16/9;
            display:block;
            border:0;
            background:#111;
        }

        .imprint-pin-info{
            padding:13px 15px 15px;
        }

        .imprint-pin-info h3{
            font-size:14px;
            line-height:1.4;
            margin:0;
            letter-spacing:-.01em;
        }

        .imprint-pin-type{
            display:block;
            margin-top:4px;
            color:var(--muted);
            font-size:11px;
            text-transform:uppercase;
            letter-spacing:.08em;
        }

        .imprint-collections-empty{
            padding:70px 25px;
            text-align:center;
            border:1px dashed var(--line);
            border-radius:15px;
            color:var(--muted);
        }

        @media(max-width:1100px){
            .imprint-pinterest{
                column-count:3;
            }
        }

        @media(max-width:760px){
            .imprint-collections-page{
                padding-top:35px;
            }

            .imprint-pinterest{
                column-count:2;
                column-gap:11px;
            }

            .imprint-pin{
                margin-bottom:11px;
                border-radius:10px;
            }

            .imprint-pin-info{
                padding:10px 11px 12px;
            }
        }

        @media(max-width:420px){
            .imprint-pinterest{
                column-count:2;
            }
        }
    `;

    document.head.appendChild(style);
}


function imprintCollectionTypeLabel(kind){
    if(kind==='video') return 'Video';
    if(kind==='youtube') return 'YouTube';
    return 'Ảnh';
}


function imprintCollectionsCard(c){

    return `
        <article
            class="imprint-pin"
            data-collection-kind="${esc(c.kind)}"
        >
            <div class="imprint-pin-media">
                ${collectionMedia(c)}
            </div>

            <div class="imprint-pin-info">
                <h3>${esc(c.title || 'ImPrint')}</h3>
                <span class="imprint-pin-type">
                    ${imprintCollectionTypeLabel(c.kind)}
                </span>
            </div>
        </article>
    `;
}


function imprintFilterCollections(kind,button){

    document
        .querySelectorAll('.imprint-collections-filter button')
        .forEach(b=>b.classList.remove('active'));

    button?.classList.add('active');

    document
        .querySelectorAll('.imprint-pin')
        .forEach(card=>{
            card.style.display =
                kind==='all' ||
                card.dataset.collectionKind===kind
                    ? 'inline-block'
                    : 'none';
        });
}


function imprintCollectionsPage(){

    imprintInstallCollectionsStyle();

    const items=collectionItems();

    app.innerHTML=`
        <div class="wrap imprint-collections-page">

            <div class="imprint-collections-head">

                <div class="eyebrow">
                    IMPRINT VISUAL ARCHIVE
                </div>

                <h1>
                    Bộ sưu tập.
                </h1>

                <p>
                    Hình ảnh, thiết kế, video và những khoảnh khắc
                    tạo nên thế giới của ImPrint.
                </p>

                ${
                    items.length
                    ? `
                    <div class="imprint-collections-filter">
                        <button
                            class="active"
                            onclick="imprintFilterCollections('all',this)"
                        >
                            Tất cả
                        </button>

                        <button
                            onclick="imprintFilterCollections('image',this)"
                        >
                            Ảnh
                        </button>

                        <button
                            onclick="imprintFilterCollections('video',this)"
                        >
                            Video
                        </button>

                        <button
                            onclick="imprintFilterCollections('youtube',this)"
                        >
                            YouTube
                        </button>
                    </div>
                    `
                    : ''
                }

            </div>

            ${
                items.length
                ? `
                    <section
                        class="imprint-pinterest"
                        aria-label="Bộ sưu tập ImPrint"
                    >
                        ${items.map(imprintCollectionsCard).join('')}
                    </section>
                `
                : `
                    <div class="imprint-collections-empty">
                        <h3>Bộ sưu tập đang được cập nhật.</h3>
                        <p>
                            Ảnh và video bạn thêm trong khu vực quản trị
                            sẽ xuất hiện tại đây.
                        </p>
                    </div>
                `
            }

        </div>
    `;

    window.scrollTo(0,0);
}


/*
    route() gốc không biết #collections,
    vì vậy ta mở rộng route mà không sửa các trang khác.
*/

const imprintRouteBeforeCollectionsPage=route;

route=function(){

    const page=location.hash
        .slice(1)
        .split('/')[0];

    if(page==='collections'){
        imprintCollectionsPage();
        return;
    }

    return imprintRouteBeforeCollectionsPage();
};


/*
    Listener cũ của website giữ reference của route cũ.
    Listener này chạy sau để đảm bảo #collections
    luôn render đúng trang mới.
*/

window.addEventListener('hashchange',()=>{

    if(
        location.hash==='#collections' ||
        location.hash.startsWith('#collections/')
    ){
        imprintCollectionsPage();
    }

});


/* IMPRINT_COLLECTIONS_PAGE_END */

init=async function(){app.innerHTML='<div class="wrap section"><p>Đang mở ImPrint…</p></div>';sessionStorage.removeItem('imprint-admin-session');db=await new Promise((res,rej)=>{const r=indexedDB.open('imprint_studio_v3',1);r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('assets')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const guest=await oldGetBackend('state','guest-cart')||[];await Promise.all([loadMocks(),...FONT_NAMES.map(f=>document.fonts.load('32px "'+f+'"'))]);data={cart:guest};await refreshBackend({keepGuest:true});backendReady=true;document.getElementById('adminNav')?.remove();installCompanion();document.querySelector('header nav').insertAdjacentHTML('beforeend','<a href="#home" onclick="event.preventDefault();openCollections()">Bộ sưu tập</a>');document.querySelector('footer .wrap').insertAdjacentHTML('beforeend',`<nav class="social-links" aria-label="Mạng xã hội">${SOCIALS}</nav>`);document.querySelector('#companionPanel nav').insertAdjacentHTML('beforeend',SOCIALS);if(new URL(location.href).searchParams.has('admin')){window.history.replaceState(null,'','/#admin')}route();};


/* IMPRINT_COLLECTIONS_CLEAN_V6 */

(function(){

    /* ==============================================
       HELPERS
       ============================================== */

    function v6esc(v){

        if(typeof esc === 'function'){
            return esc(v == null ? '' : String(v));
        }

        return String(v == null ? '' : v)
            .replaceAll('&','&amp;')
            .replaceAll('<','&lt;')
            .replaceAll('>','&gt;')
            .replaceAll('"','&quot;');

    }


    function v6norm(v){

        return String(v == null ? '' : v)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'')
            .replace(/đ/g,'d')
            .replace(/Đ/g,'D')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g,' ')
            .trim();

    }


    function v6money(v){

        return new Intl.NumberFormat(
            'vi-VN'
        ).format(
            Number(v || 0)
        ) + ' đ';

    }


    function v6isPose(v){

        const s = v6norm(v);

        return (
            s.includes('mau tao dang') ||
            s.includes('tao dang') ||
            s.includes('anh nguoi mau') ||
            s.includes('nguoi mau') ||
            s.includes('model pose') ||
            s.includes('model shot') ||
            s.includes('on model') ||
            s.includes('lookbook') ||
            s.includes('lifestyle')
        );

    }


    function v6isImage(v){

        if(typeof v !== 'string'){
            return false;
        }

        const s = v.trim();

        return (
            s.startsWith('data:image/') ||
            s.startsWith('blob:') ||
            s.startsWith('/static/') ||
            s.startsWith('/api/files/') ||
            s.startsWith('/uploads/') ||
            s.startsWith('https://') ||
            s.startsWith('http://') ||
            /\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(s)
        );

    }


    /* ==============================================
       FIND IMAGES INSIDE "MẪU TẠO DÁNG"
       ============================================== */

    const V6_IMAGE_KEYS = [
        'src',
        'url',
        'image',
        'img',
        'photo',
        'preview',
        'previewUrl',
        'publicUrl',
        'fileUrl',
        'thumbnail',
        'thumb',
        'original',
        'downloadUrl'
    ];


    function v6extractImages(node,out,seen,depth){

        out ||= [];

        if(depth > 10 || node == null){
            return out;
        }


        if(typeof node === 'string'){

            if(v6isImage(node)){
                out.push(node);
            }

            return out;
        }


        if(typeof node !== 'object'){
            return out;
        }


        seen ||= new WeakSet();

        if(seen.has(node)){
            return out;
        }

        seen.add(node);


        for(const key of V6_IMAGE_KEYS){

            if(
                Object.prototype.hasOwnProperty.call(node,key)
            ){

                v6extractImages(
                    node[key],
                    out,
                    seen,
                    depth + 1
                );

            }

        }


        if(Array.isArray(node)){

            for(const item of node){

                v6extractImages(
                    item,
                    out,
                    seen,
                    depth + 1
                );

            }

            return out;
        }


        for(const value of Object.values(node)){

            if(value && typeof value === 'object'){

                v6extractImages(
                    value,
                    out,
                    seen,
                    depth + 1
                );

            }

        }


        return out;

    }


    function v6productMatch(node,p){

        if(!node || typeof node !== 'object'){
            return false;
        }


        const id =
            v6norm(p.id);

        const name =
            v6norm(p.name);


        const fields = [
            'productId',
            'product_id',
            'productID',
            'product',
            'productName',
            'product_name',
            'sku',
            'slug',
            'id',
            'name'
        ];


        return fields.some(k => {

            const value =
                node[k];

            if(
                typeof value !== 'string' &&
                typeof value !== 'number'
            ){
                return false;
            }


            const s =
                v6norm(value);


            return (
                s === id ||
                s === name ||
                (
                    name.length > 4 &&
                    s.includes(name)
                )
            );

        });

    }


    function v6scanPoseTree(
        node,
        product,
        poseContext,
        productContext,
        result,
        seen,
        depth,
        keyContext
    ){

        if(
            node == null ||
            typeof node !== 'object' ||
            depth > 10
        ){
            return;
        }


        seen ||= new WeakSet();

        if(seen.has(node)){
            return;
        }

        seen.add(node);


        const labelFields = [
            'name',
            'title',
            'label',
            'group',
            'category',
            'section',
            'folder',
            'tab',
            'type',
            'kind'
        ];


        const nodePose =
            poseContext ||
            v6isPose(keyContext || '') ||
            labelFields.some(k =>
                typeof node[k] === 'string' &&
                v6isPose(node[k])
            );


        const productId =
            v6norm(product.id);

        const productName =
            v6norm(product.name);


        const keyNorm =
            v6norm(keyContext || '');


        const nodeProduct =
            productContext ||
            v6productMatch(node,product) ||
            keyNorm === productId ||
            keyNorm === productName ||
            (
                productName.length > 4 &&
                keyNorm.includes(productName)
            );


        if(nodePose){

            const images =
                v6extractImages(
                    node,
                    [],
                    new WeakSet(),
                    0
                );


            for(const src of images){

                if(!result.all.includes(src)){
                    result.all.push(src);
                }


                if(
                    nodeProduct &&
                    !result.product.includes(src)
                ){
                    result.product.push(src);
                }

            }

        }


        for(const [key,value] of Object.entries(node)){

            if(
                !value ||
                typeof value !== 'object'
            ){
                continue;
            }


            v6scanPoseTree(
                value,
                product,
                nodePose,
                nodeProduct,
                result,
                seen,
                depth + 1,
                key
            );

        }

    }


    /* ==============================================
       SOURCES TO SEARCH
       ============================================== */

    function v6storageSources(){

        const out = [];


        for(const storage of [
            window.localStorage,
            window.sessionStorage
        ]){

            try{

                for(let i=0;i<storage.length;i++){

                    const key =
                        storage.key(i);

                    const raw =
                        storage.getItem(key);


                    if(!raw){
                        continue;
                    }


                    try{

                        const parsed =
                            JSON.parse(raw);

                        if(
                            parsed &&
                            typeof parsed === 'object'
                        ){

                            out.push({
                                key,
                                value:parsed
                            });

                        }

                    }
                    catch{}

                }

            }
            catch{}

        }


        return out;

    }


    function v6globalSources(){

        const out = [];


        const keyword =
            /(product|media|gallery|photo|image|asset|model|pose|library|lookbook)/i;


        for(const key of Object.keys(window)){

            if(!keyword.test(key)){
                continue;
            }


            let value;

            try{
                value = window[key];
            }
            catch{
                continue;
            }


            if(
                !value ||
                typeof value !== 'object'
            ){
                continue;
            }


            if(
                value instanceof Element ||
                value instanceof Window ||
                value instanceof Document
            ){
                continue;
            }


            out.push({
                key,
                value
            });

        }


        return out;

    }


    function v6posePoolForProduct(product){

        const result = {
            product:[],
            all:[]
        };


        /*
         * Main bootstrap data
         */

        if(
            typeof data !== 'undefined' &&
            data
        ){

            v6scanPoseTree(
                data,
                product,
                false,
                false,
                result,
                new WeakSet(),
                0,
                'data'
            );

        }


        /*
         * Storage
         */

        for(const source of v6storageSources()){

            v6scanPoseTree(
                source.value,
                product,
                v6isPose(source.key),
                false,
                result,
                new WeakSet(),
                0,
                source.key
            );

        }


        /*
         * Global media libraries
         */

        for(const source of v6globalSources()){

            v6scanPoseTree(
                source.value,
                product,
                v6isPose(source.key),
                false,
                result,
                new WeakSet(),
                0,
                source.key
            );

        }


        return result;

    }


    /* ==============================================
       FEATURED PRODUCTS
       ============================================== */

    function v6featuredProducts(){

        if(
            typeof data === 'undefined' ||
            !Array.isArray(data.products)
        ){
            return [];
        }


        return data.products
            .filter(p =>
                p &&
                p.id &&
                p.name &&
                Number(
                    p.stock == null
                    ? 1
                    : p.stock
                ) !== 0
            )
            .slice(0,4);

    }


    function v6resolveFeatured(){

        const products =
            v6featuredProducts();


        /*
         * First pass:
         * exact product pose matches.
         */

        const resolved =
            products.map(p => {

                const pool =
                    v6posePoolForProduct(p);


                return {
                    product:p,
                    exact:
                        pool.product[0] || null,
                    pool:
                        pool.all
                };

            });


        /*
         * Build shared pose pool.
         */

        const shared = [];

        for(const item of resolved){

            for(const src of item.pool){

                if(!shared.includes(src)){
                    shared.push(src);
                }

            }

        }


        /*
         * Product-specific photo wins.
         * Otherwise use another image from
         * the Mẫu tạo dáng pool.
         *
         * NO MOCKUP FALLBACK.
         */

        return resolved.map(
            (item,index)=>({

                product:
                    item.product,

                image:
                    item.exact ||
                    shared[
                        index %
                        Math.max(
                            shared.length,
                            1
                        )
                    ] ||
                    null

            })
        );

    }


    function v6productCard(item){

        const p =
            item.product;


        /*
         * Even if an image cannot be resolved,
         * DO NOT remove the product card.
         */

        const imageHTML =
            item.image
            ? `
                <img
                    src="${v6esc(item.image)}"
                    alt="${v6esc(p.name)}"
                    loading="lazy">
            `
            : `
                <div class="imprint-feature-no-photo">
                    IMPRINT
                </div>
            `;


        return `
            <a
                class="imprint-feature-card"
                href="#product/${encodeURIComponent(p.id)}">

                <div class="imprint-feature-badge">
                    HOT &#128293;
                </div>


                <div class="imprint-feature-top">

                    ${imageHTML}

                </div>


                <div class="imprint-feature-bottom">

                    <div class="imprint-feature-title">
                        ${v6esc(p.name)}
                    </div>


                    ${
                        p.fabric
                        ? `
                        <div class="imprint-feature-sub">
                            ${v6esc(p.fabric)}
                        </div>
                        `
                        : ''
                    }


                    <div class="imprint-feature-price">
                        ${v6money(p.price)}
                    </div>

                </div>


                <div class="imprint-feature-shine"></div>

            </a>
        `;

    }


    /* ==============================================
       COLLECTION MEDIA
       ============================================== */

    function v6collectionItems(){

        if(typeof collectionItems === 'function'){
            return collectionItems() || [];
        }

        return [];
    }


    function v6collectionMedia(c){

        if(c.kind === 'youtube'){

            return `
                <iframe
                    src="https://www.youtube-nocookie.com/embed/${v6esc(c.src)}"
                    loading="lazy"
                    allowfullscreen>
                </iframe>
            `;

        }


        if(c.kind === 'video'){

            return `
                <video
                    controls
                    playsinline
                    preload="metadata">

                    <source src="${v6esc(c.src)}">

                </video>
            `;

        }


        return `
            <img
                src="${v6esc(c.src)}"
                alt=""
                loading="lazy">
        `;

    }


    /* ==============================================
       FINAL COLLECTION PAGE
       ============================================== */

    window.collectionsPage = function(){

        const gallery =
            v6collectionItems();


        const featured =
            v6resolveFeatured();


        app.innerHTML = `

            <main class="wrap imprint-collection-page-v6">


                <section class="imprint-collection-head-v6">

                    <div class="eyebrow">
                        IMPRINT &middot; VISUAL DIARY
                    </div>


                    <h1>
                        B\u1ed9 s\u01b0u t\u1eadp
                    </h1>


                    <p>
                        H\u00ecnh \u1ea3nh, video v\u00e0 nh\u1eefng
                        kho\u1ea3nh kh\u1eafc trong th\u1ebf gi\u1edbi
                        ImPrint.
                    </p>

                </section>


                <section class="imprint-pinterest-v6">

                    ${
                        gallery.map(c => `

                            <article class="imprint-pin-v6">

                                <div class="imprint-pin-media-v6">
                                    ${v6collectionMedia(c)}
                                </div>

                            </article>

                        `).join('')
                    }

                </section>


                <section class="imprint-featured-products">


                    <div class="imprint-featured-head">

                        <div>

                            <div class="eyebrow">
                                IMPRINT PICKS
                            </div>


                            <h2>
                                S\u1ea3n ph\u1ea9m ti\u00eau bi\u1ec3u
                            </h2>


                            <p>
                                Ch\u1ecdn m\u1ed9t item v\u00e0
                                b\u1eaft \u0111\u1ea7u t\u1ea1o
                                phi\u00ean b\u1ea3n c\u1ee7a ri\u00eang
                                b\u1ea1n.
                            </p>

                        </div>


                        <a href="#shop">
                            Xem t\u1ea5t c\u1ea3 &rarr;
                        </a>

                    </div>


                    <div class="imprint-featured-grid">

                        ${
                            featured
                                .map(v6productCard)
                                .join('')
                        }

                    </div>


                </section>


            </main>
        `;


        window.scrollTo(0,0);

    };


    /* ==============================================
       ROUTING
       ============================================== */

    window.openCollections = function(){

        location.hash =
            'collections';

    };


    function v6route(){

        const page =
            location.hash
                .slice(1)
                .split('/')[0];


        if(page === 'collections'){

            setTimeout(
                ()=>window.collectionsPage(),
                0
            );

        }

    }


    window.addEventListener(
        'hashchange',
        v6route
    );


    /* ==============================================
       INIT
       ============================================== */

    if(typeof init === 'function'){

        const oldInitV6 =
            init;


        init = async function(){

            const result =
                await oldInitV6.apply(
                    this,
                    arguments
                );


            const nav =
                document.querySelector(
                    'header nav'
                );


            if(nav){

                let link =
                    nav.querySelector(
                        'a[href="#collections"]'
                    );


                if(!link){

                    link =
                        [...nav.querySelectorAll('a')]
                        .find(a =>
                            (
                                a.getAttribute('onclick')
                                || ''
                            )
                            .includes('openCollections')
                        );

                }


                if(link){

                    link.href =
                        '#collections';

                    link.removeAttribute(
                        'onclick'
                    );

                    link.textContent =
                        'B\u1ed9 s\u01b0u t\u1eadp';

                }

            }


            v6route();


            return result;

        };

    }


    /* ==============================================
       CSS
       ============================================== */

    const style =
        document.createElement('style');


    style.id =
        'imprint-collections-clean-v6';


    style.textContent = `

        .imprint-collection-page-v6{
            padding-top:52px;
            padding-bottom:96px;
        }


        .imprint-collection-head-v6{
            margin-bottom:38px;
        }


        .imprint-collection-head-v6 h1{
            margin:5px 0 12px;
            font-size:clamp(44px,6vw,78px);
            line-height:.98;
        }


        .imprint-collection-head-v6 p{
            margin:0;
            max-width:620px;
            opacity:.68;
            line-height:1.7;
        }


        .imprint-pinterest-v6{
            column-count:4;
            column-gap:16px;
        }


        .imprint-pin-v6{
            display:inline-block;
            width:100%;
            margin:0 0 16px;
            break-inside:avoid;
            border-radius:18px;
            overflow:hidden;
        }


        .imprint-pin-media-v6 img,
        .imprint-pin-media-v6 video{
            width:100%;
            height:auto;
            display:block;
        }


        .imprint-pin-media-v6 iframe{
            width:100%;
            aspect-ratio:16/9;
            border:0;
            display:block;
        }


        .imprint-featured-products{
            margin-top:84px;
            padding-top:48px;
            border-top:1px solid var(--line,#e4d9cf);
        }


        .imprint-featured-head{
            display:flex;
            justify-content:space-between;
            align-items:flex-end;
            gap:30px;
            margin-bottom:46px;
        }


        .imprint-featured-head h2{
            margin:5px 0 10px;
            font-size:clamp(32px,4vw,52px);
            line-height:1;
        }


        .imprint-featured-head p{
            margin:0;
            max-width:520px;
            opacity:.66;
        }


        .imprint-featured-grid{
            display:grid;
            grid-template-columns:repeat(4,minmax(0,250px));
            justify-content:space-between;
            gap:30px;
            padding:14px 12px 44px;
        }


        .imprint-feature-card{
            width:250px;
            height:325px;
            display:block;
            position:relative;
            overflow:hidden;

            background:lightgrey;

            border-radius:20px;
            border:2px solid white;

            box-shadow:
                -8px 8px 0 5px
                rgb(50 50 50 / 20%);

            transform:
                rotate(3deg)
                skewX(3deg);

            transition:
                all .5s ease;

            color:#323232;
            text-decoration:none;
        }


        .imprint-feature-top{
            width:100%;
            height:70%;
            overflow:hidden;
            background:#ebe7e2;
        }


        .imprint-feature-top img{
            width:100%;
            height:100%;
            object-fit:cover;
            object-position:center top;
            display:block;
        }


        .imprint-feature-no-photo{
            width:100%;
            height:100%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:13px;
            letter-spacing:.16em;
            color:#a59890;
        }


        .imprint-feature-bottom{
            box-sizing:border-box;
            width:100%;
            height:31%;
            padding:9px 11px;
            position:relative;
            z-index:3;
            background:white;
        }


        .imprint-feature-title{
            font-size:15px;
            font-weight:650;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }


        .imprint-feature-sub{
            margin-top:4px;
            font-size:10px;
            color:#80746d;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }


        .imprint-feature-price{
            display:flex;
            justify-content:flex-end;
            margin-top:8px;
            padding-top:7px;
            border-top:2px solid lightgrey;
            color:#fc6969;
            font-size:16px;
            font-weight:700;
        }


        .imprint-feature-badge{
            position:absolute;
            left:0;
            top:0;
            z-index:5;

            min-width:94px;
            height:30px;
            padding:0 13px;

            box-sizing:border-box;

            display:flex;
            align-items:center;
            justify-content:center;

            border-radius:0 0 25px 0;

            background:#fc6969;
            color:white;

            font-size:11px;
            font-weight:700;
            white-space:nowrap;
        }


        .imprint-feature-shine{
            width:450px;
            height:200px;

            position:absolute;
            z-index:2;

            background:
                rgb(255 255 255 / 50%);

            transform:
                rotate(-40deg)
                translateX(-15%)
                translateY(-160%);

            transition:
                all .5s ease;

            pointer-events:none;
        }


        .imprint-feature-card:hover{
            transform:translateY(-5%);
            box-shadow:
                0 20px 10px
                rgb(50 50 50 / 20%);
        }


        .imprint-feature-card:hover
        .imprint-feature-shine{

            transform:
                rotate(-42deg)
                translateX(-15%)
                translateY(-79%);
        }


        @media(max-width:1120px){

            .imprint-pinterest-v6{
                column-count:3;
            }

            .imprint-featured-grid{
                grid-template-columns:
                    repeat(2,minmax(0,250px));
                justify-content:center;
                gap:44px 56px;
            }

        }


        @media(max-width:760px){

            .imprint-pinterest-v6{
                column-count:2;
                column-gap:12px;
            }

            .imprint-featured-head{
                flex-direction:column;
                align-items:flex-start;
            }

            .imprint-featured-grid{
                grid-template-columns:
                    minmax(0,250px);
                justify-content:center;
            }

        }


        @media(max-width:480px){

            .imprint-pinterest-v6{
                column-count:1;
            }

        }

    `;


    document.head.appendChild(style);


})();


/* IMPRINT_FINAL_POSE_V9_3 */

(function(){

    const ADMIN_SERVER_NOTICE =
        'N\u1ed9i dung \u0111\u01b0\u1ee3c l\u01b0u tr\u00ean m\u00e1y ch\u1ee7 v\u00e0 hi\u1ec3n th\u1ecb cho kh\u00e1ch. \u0110\u01a1n h\u00e0ng, \u1ea3nh g\u1ed1c v\u00e0 thi\u1ebft k\u1ebf \u0111\u01b0\u1ee3c l\u01b0u chung.';

    function v93esc(v){

        if(typeof esc === 'function'){
            return esc(v == null ? '' : String(v));
        }

        return String(v == null ? '' : v)
            .replaceAll('&','&amp;')
            .replaceAll('<','&lt;')
            .replaceAll('>','&gt;')
            .replaceAll('"','&quot;');
    }

    function v93money(v){

        return new Intl.NumberFormat(
            'vi-VN'
        ).format(
            Number(v || 0)
        ) + ' \u0111';
    }

    function v93fixAdminNotice(){

        if(
            typeof user === 'undefined' ||
            !user ||
            user.role !== 'admin'
        ){
            return;
        }

        const notices =
            [...app.querySelectorAll('.notice')];

        if(!notices.length){
            return;
        }

        const target =
            notices.find(el =>
                /dung/i.test(
                    String(el.textContent || '')
                )
            ) ||
            notices[0];

        if(target){
            target.textContent =
                ADMIN_SERVER_NOTICE;
        }
    }

    if(typeof admin === 'function'){

        const baseAdminV93 =
            admin;

        admin = function(){

            const result =
                baseAdminV93.apply(
                    this,
                    arguments
                );

            v93fixAdminNotice();

            setTimeout(
                v93fixAdminNotice,
                0
            );

            setTimeout(
                v93fixAdminNotice,
                100
            );

            return result;
        };
    }

    const adminObserverV93 =
        new MutationObserver(()=>{

            if(
                typeof user !== 'undefined' &&
                user &&
                user.role === 'admin'
            ){
                v93fixAdminNotice();
            }
        });

    adminObserverV93.observe(
        app,
        {
            childList:true,
            subtree:true
        }
    );

    function v93collectionItems(){

        if(typeof collectionItems === 'function'){
            return collectionItems() || [];
        }

        return [];
    }

    function v93collectionMedia(c){

        if(c.kind === 'youtube'){

            return `
                <iframe
                    src="https://www.youtube-nocookie.com/embed/${v93esc(c.src)}"
                    loading="lazy"
                    allowfullscreen>
                </iframe>
            `;
        }

        if(c.kind === 'video'){

            return `
                <video
                    controls
                    playsinline
                    preload="metadata">

                    <source
                        src="${v93esc(c.src)}">

                </video>
            `;
        }

        return `
            <img
                src="${v93esc(c.src)}"
                alt=""
                loading="lazy">
        `;
    }

    function v93featured(){

        if(
            typeof data === 'undefined' ||
            !Array.isArray(data.products)
        ){
            return [];
        }

        return data.products
            .filter(p =>
                p &&
                p.id &&
                p.poseImg &&
                p.featuredPick === true
            )
            .sort((a,b)=>
                Number(a.featuredRank || 999) -
                Number(b.featuredRank || 999)
            )
            .slice(0,4);
    }

    function v93card(p){

        return `
            <a
                class="v93-pick-card"
                href="#product/${encodeURIComponent(p.id)}">

                <div class="v93-pick-badge">
                    HOT &#128293;
                </div>

                <div class="v93-pick-photo">

                    <img
                        src="${v93esc(p.poseImg)}"
                        alt="${v93esc(p.name)}"
                        loading="lazy">

                </div>

                <div class="v93-pick-info">

                    <div class="v93-pick-name">
                        ${v93esc(p.name)}
                    </div>

                    ${
                        p.fabric
                        ? `
                            <div class="v93-pick-fabric">
                                ${v93esc(p.fabric)}
                            </div>
                        `
                        : ''
                    }

                    <div class="v93-pick-price">
                        ${v93money(p.price)}
                    </div>

                </div>

                <div class="v93-pick-shine"></div>

            </a>
        `;
    }

    window.collectionsPage = function(){

        const collection =
            v93collectionItems();

        const products =
            v93featured();

        app.innerHTML = `

            <main class="wrap v93-collections">

                <section class="v93-collections-head">

                    <div class="eyebrow">
                        IMPRINT &middot; VISUAL DIARY
                    </div>

                    <h1>
                        B\u1ed9 s\u01b0u t\u1eadp
                    </h1>

                    <p>
                        H\u00ecnh \u1ea3nh, video v\u00e0 nh\u1eefng kho\u1ea3nh kh\u1eafc
                        trong th\u1ebf gi\u1edbi ImPrint.
                    </p>

                </section>

                <section class="v93-masonry">

                    ${
                        collection
                            .map(c => `
                                <article class="v93-pin">
                                    ${v93collectionMedia(c)}
                                </article>
                            `)
                            .join('')
                    }

                </section>

                <section class="v93-picks">

                    <div class="v93-picks-head">

                        <div>

                            <div class="eyebrow">
                                IMPRINT PICKS
                            </div>

                            <h2>
                                S\u1ea3n ph\u1ea9m ti\u00eau bi\u1ec3u
                            </h2>

                            <p>
                                Ch\u1ecdn m\u1ed9t item v\u00e0 b\u1eaft \u0111\u1ea7u t\u1ea1o
                                phi\u00ean b\u1ea3n c\u1ee7a ri\u00eang b\u1ea1n.
                            </p>

                        </div>

                        <a href="#shop">
                            Xem t\u1ea5t c\u1ea3 &rarr;
                        </a>

                    </div>

                    <div class="v93-picks-grid">
                        ${products.map(v93card).join('')}
                    </div>

                </section>

            </main>
        `;

        window.scrollTo(0,0);
    };

    window.openCollections = function(){
        location.hash = 'collections';
    };

    function v93isCollections(){

        return (
            location.hash
                .slice(1)
                .split('/')[0] ===
            'collections'
        );
    }

    function v93route(){

        if(v93isCollections()){

            setTimeout(
                ()=>window.collectionsPage(),
                30
            );
        }
    }

    window.addEventListener(
        'hashchange',
        v93route
    );

    const collectionObserverV93 =
        new MutationObserver(()=>{

            if(
                v93isCollections() &&
                !app.querySelector('.v93-collections')
            ){
                setTimeout(
                    ()=>window.collectionsPage(),
                    0
                );
            }
        });

    collectionObserverV93.observe(
        app,
        {
            childList:true,
            subtree:false
        }
    );

    if(typeof init === 'function'){

        const baseInitV93 =
            init;

        init = async function(){

            const result =
                await baseInitV93.apply(
                    this,
                    arguments
                );

            const nav =
                document.querySelector(
                    'header nav'
                );

            if(nav){

                let link =
                    nav.querySelector(
                        'a[href="#collections"]'
                    ) ||
                    [...nav.querySelectorAll('a')]
                        .find(a =>
                            (
                                a.getAttribute('onclick') ||
                                ''
                            ).includes(
                                'openCollections'
                            )
                        );

                if(link){

                    link.href =
                        '#collections';

                    link.removeAttribute(
                        'onclick'
                    );

                    link.textContent =
                        'B\u1ed9 s\u01b0u t\u1eadp';
                }
            }

            v93fixAdminNotice();
            v93route();

            return result;
        };
    }

    const style =
        document.createElement(
            'style'
        );

    style.id =
        'imprint-final-pose-v93-style';

    style.textContent = `

        .v93-collections{
            padding-top:52px;
            padding-bottom:96px;
        }

        .v93-collections-head{
            margin-bottom:40px;
        }

        .v93-collections-head h1{
            margin:5px 0 12px;
            font-size:clamp(44px,6vw,78px);
            line-height:.98;
        }

        .v93-collections-head p{
            margin:0;
            max-width:620px;
            opacity:.68;
            line-height:1.7;
        }

        .v93-masonry{
            column-count:4;
            column-gap:16px;
        }

        .v93-pin{
            display:inline-block;
            width:100%;
            margin:0 0 16px;
            overflow:hidden;
            border-radius:18px;
            break-inside:avoid;
        }

        .v93-pin img,
        .v93-pin video{
            display:block;
            width:100%;
            height:auto;
        }

        .v93-pin iframe{
            display:block;
            width:100%;
            aspect-ratio:16/9;
            border:0;
        }

        .v93-picks{
            margin-top:84px;
            padding-top:48px;
            border-top:
                1px solid
                var(--line,#e4d9cf);
        }

        .v93-picks-head{
            display:flex;
            justify-content:space-between;
            align-items:flex-end;
            gap:30px;
            margin-bottom:46px;
        }

        .v93-picks-head h2{
            margin:5px 0 10px;
            font-size:clamp(32px,4vw,52px);
            line-height:1;
        }

        .v93-picks-head p{
            margin:0;
            max-width:520px;
            opacity:.66;
            line-height:1.65;
        }

        .v93-picks-head > a{
            padding-bottom:5px;
            border-bottom:
                1px solid
                currentColor;
        }

        .v93-picks-grid{
            display:grid;
            grid-template-columns:
                repeat(
                    4,
                    minmax(0,250px)
                );
            justify-content:space-between;
            gap:30px;
            padding:14px 12px 44px;
        }

        .v93-pick-card{
            width:250px;
            height:325px;
            display:block;
            position:relative;
            overflow:hidden;

            border-radius:20px;
            border:2px solid white;

            background:lightgrey;

            box-shadow:
                -8px 8px 0 5px
                rgb(50 50 50 / 20%);

            color:#323232;
            text-decoration:none;

            transform:
                rotate(3deg)
                skewX(3deg);

            transition:
                all .5s ease;
        }

        .v93-pick-photo{
            width:100%;
            height:70%;
            overflow:hidden;
            background:#ebe7e2;
        }

        .v93-pick-photo img{
            width:100%;
            height:100%;
            object-fit:cover;
            object-position:center top;
            display:block;
        }

        .v93-pick-info{
            box-sizing:border-box;
            width:100%;
            height:31%;
            padding:9px 11px;

            position:relative;
            z-index:3;

            background:white;
        }

        .v93-pick-name{
            font-size:15px;
            line-height:1.2;
            font-weight:650;

            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }

        .v93-pick-fabric{
            margin-top:4px;
            font-size:10px;
            color:#80746d;

            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        }

        .v93-pick-price{
            display:flex;
            justify-content:flex-end;

            margin-top:8px;
            padding-top:7px;

            border-top:
                2px solid
                lightgrey;

            font-size:16px;
            font-weight:700;

            color:#fc6969;
        }

        .v93-pick-badge{
            position:absolute;
            top:0;
            left:0;
            z-index:5;

            min-width:94px;
            height:30px;
            padding:0 13px;

            box-sizing:border-box;

            display:flex;
            justify-content:center;
            align-items:center;

            border-radius:
                0 0 25px 0;

            background:#fc6969;
            color:white;

            font-size:11px;
            font-weight:700;

            white-space:nowrap;
        }

        .v93-pick-shine{
            position:absolute;
            z-index:2;

            width:450px;
            height:200px;

            background:
                rgb(
                    255 255 255 / 50%
                );

            transform:
                rotate(-40deg)
                translateX(-15%)
                translateY(-160%);

            transition:
                all .5s ease;

            pointer-events:none;
        }

        .v93-pick-card:hover{
            transform:
                translateY(-5%);

            box-shadow:
                0 20px 10px
                rgb(50 50 50 / 20%);
        }

        .v93-pick-card:hover
        .v93-pick-shine{
            transform:
                rotate(-42deg)
                translateX(-15%)
                translateY(-79%);
        }

        @media(max-width:1120px){

            .v93-masonry{
                column-count:3;
            }

            .v93-picks-grid{
                grid-template-columns:
                    repeat(
                        2,
                        minmax(0,250px)
                    );

                justify-content:center;

                gap:44px 56px;
            }
        }

        @media(max-width:760px){

            .v93-masonry{
                column-count:2;
                column-gap:12px;
            }

            .v93-picks-head{
                flex-direction:column;
                align-items:flex-start;
            }

            .v93-picks-grid{
                grid-template-columns:
                    minmax(0,250px);

                justify-content:center;
            }
        }

        @media(max-width:480px){

            .v93-masonry{
                column-count:1;
            }
        }
    `;

    document.head.appendChild(
        style
    );

})();