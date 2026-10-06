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

        if(
            target &&
            target.textContent !== ADMIN_SERVER_NOTICE
        ){
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
            column-count:3;
            column-gap:24px;
        }

        .v93-pin{
            display:inline-block;
            width:100%;
            margin:0 0 24px;
            overflow:hidden;
            border-radius:22px;
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
                column-count:2;
                column-gap:18px;
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
                column-count:1;
                column-gap:0;
            }

            .v93-pin{
                margin-bottom:18px;
                border-radius:18px;
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

/* IMPRINT_HOME_SINGLE_VIDEO_V6 */
(function(){
    function cinematicHomeFilm(){
        const page=(location.hash||'#home').slice(1).split('/')[0]||'home';
        if(page!=='home') return;

        const section=document.querySelector('#collections');
        if(!section) return;

        const films=section.querySelector('.collection-films');
        if(!films) return;

        const articles=[...films.querySelectorAll(':scope > article')];
        articles.forEach((article,index)=>{
            article.hidden=index!==0;
        });

        const first=articles[0];
        if(!first) return;

        first.classList.add('imprint-home-film-cinematic');

        const media=first.querySelector('video,iframe');
        if(media){
            media.style.width='100%';
            media.style.aspectRatio='16 / 9';
            media.style.height='auto';
            media.style.objectFit='cover';
            media.style.display='block';
        }

        if(media instanceof HTMLVideoElement){
            media.muted=true;
            media.defaultMuted=true;
            media.autoplay=true;
            media.loop=true;
            media.playsInline=true;
            media.preload='auto';

            media.setAttribute('muted','');
            media.setAttribute('autoplay','');
            media.setAttribute('loop','');
            media.setAttribute('playsinline','');
            media.removeAttribute('controls');

            const playFilm=()=>{
                const attempt=media.play();
                if(attempt && typeof attempt.catch==='function'){
                    attempt.catch(()=>{});
                }
            };

            first.onmouseenter=()=>{
                media.pause();
                first.classList.add('is-paused-by-hover');
            };

            first.onmouseleave=()=>{
                first.classList.remove('is-paused-by-hover');
                playFilm();
            };

            first.onfocusin=()=>{
                media.pause();
                first.classList.add('is-paused-by-hover');
            };

            first.onfocusout=()=>{
                first.classList.remove('is-paused-by-hover');
                playFilm();
            };

            playFilm();
        }

        const photos=section.querySelector('.collection-photos');
        if(photos){
            photos.hidden=false;
        }
    }

    for(const id of [
        'imprint-home-single-video-v2-style',
        'imprint-home-single-video-v3-style',
        'imprint-home-single-video-v4-style'
    ]){
        document.getElementById(id)?.remove();
    }

    const style=document.createElement('style');
    style.id='imprint-home-single-video-v6-style';
    style.textContent=`
        #collections .collection-films > article:not(:first-child){
            display:none !important;
        }

        #collections .collection-films{
            position:relative;
            overflow:visible !important;
            z-index:2;
        }

        #collections .collection-films > article:first-child{
            position:relative;
            width:145% !important;
            max-width:none !important;
            margin:0 -45% 0 0 !important;
            overflow:hidden;
            border-radius:24px;
            background:#111;
            isolation:isolate;
            box-shadow:0 26px 70px rgba(55,42,34,.13);
            z-index:2;
        }

        #collections .collection-films > article:first-child video,
        #collections .collection-films > article:first-child iframe{
            width:100% !important;
            aspect-ratio:16/9 !important;
            height:auto !important;
            display:block !important;
            object-fit:cover !important;
            border:0 !important;
            border-radius:24px;
        }

        #collections .collection-films > article:first-child::after{
            content:"";
            position:absolute;
            inset:0;
            z-index:3;
            pointer-events:none;
            background:
                linear-gradient(
                    90deg,
                    rgba(250,247,242,0) 0%,
                    rgba(250,247,242,0) 60%,
                    rgba(250,247,242,.13) 72%,
                    rgba(250,247,242,.55) 88%,
                    #faf7f2 100%
                ),
                linear-gradient(
                    180deg,
                    rgba(250,247,242,0) 74%,
                    rgba(250,247,242,.14) 89%,
                    rgba(250,247,242,.40) 100%
                );
        }

        #collections .collection-photos{
            position:relative;
            z-index:6;
        }

        @media(max-width:1100px){
            #collections .collection-films > article:first-child{
                width:125% !important;
                margin-right:-25% !important;
            }
        }

        @media(max-width:900px){
            #collections .collection-films > article:first-child{
                width:100% !important;
                margin-right:0 !important;
                border-radius:16px;
            }

            #collections .collection-films > article:first-child video,
            #collections .collection-films > article:first-child iframe{
                border-radius:16px;
            }

            #collections .collection-films > article:first-child::after{
                background:
                    linear-gradient(
                        180deg,
                        rgba(250,247,242,0) 70%,
                        rgba(250,247,242,.12) 84%,
                        #faf7f2 100%
                    );
            }
        }
    `;
    document.head.appendChild(style);

    if(typeof home==='function'){
        const baseHomeSingleVideoV6=home;
        home=function(){
            const result=baseHomeSingleVideoV6.apply(this,arguments);
            requestAnimationFrame(cinematicHomeFilm);
            return result;
        };
    }

    if((location.hash||'#home').startsWith('#home')){
        requestAnimationFrame(cinematicHomeFilm);
    }
})();


/* IMPRINT_PRODUCT_SIZE_CARE_V1 */
(function(){
    const guides={
        tee:{
            title:'BẢNG SIZE T-SHIRT',
            kind:'tee',
            sizes:['S','M','L','XL','2XL'],
            rows:[
                ['Dài áo (a)','66','69','72','75','78'],
                ['Rộng áo (b)','49','52','55','58','61'],
                ['Tay (c)','22','23','24','25','26'],
                ['Cân nặng','<55kg','60–75kg','70–80kg','>80kg','>90kg'],
                ['Chiều cao','<160','<170','<180','>180','>180']
            ]
        },
        baby:{
            title:'BẢNG SIZE BABY TEE',
            kind:'baby',
            sizes:['S','M','L'],
            rows:[
                ['Dài áo (a)','43','45','47'],
                ['Rộng áo (b)','38','40','42'],
                ['Tay (c)','13','14','15']
            ]
        },
        longsleeve:{
            title:'BẢNG SIZE LONG SLEEVE TEE',
            kind:'longsleeve',
            sizes:['M','L','XL'],
            rows:[
                ['Dài áo (a)','64','67','71'],
                ['Rộng áo (b)','58','60','63'],
                ['Tay (c)','59','61','63']
            ]
        },
        sweater:{
            title:'BẢNG SIZE SWEATER / HOODIE',
            kind:'sweater',
            sizes:['M','L','XL'],
            rows:[
                ['Dài áo (a)','66','70','74'],
                ['Rộng áo (b)','57','61','64'],
                ['Cân nặng','40–55kg','55–70kg','70–80kg']
            ]
        },
        hoodie:{
            title:'BẢNG SIZE SWEATER / HOODIE',
            kind:'sweater',
            sizes:['M','L','XL'],
            rows:[
                ['Dài áo (a)','66','70','74'],
                ['Rộng áo (b)','57','61','64'],
                ['Cân nặng','40–55kg','55–70kg','70–80kg']
            ]
        }
    };

    function productKind(p){
        if(!p)return '';
        const t=(typeof typeOf==='function'?typeOf(p):p.garmentType)||'';
        if(guides[t])return t;
        if(['tee','heavy','core'].includes(p.id))return 'tee';
        if(p.id==='baby')return 'baby';
        if(p.id==='longsleeve')return 'longsleeve';
        if(p.id==='sweater')return 'sweater';
        if(p.id==='hoodie')return 'hoodie';
        return '';
    }

    function measureDefs(){
        return '<defs><marker id="ip-size-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path></marker></defs>';
    }

    function shortSleeveSvg(baby){
        const hem=baby?238:270;
        const left=130,right=290,top=60;
        const bodyTop=baby?106:112;
        const sleeveY=baby?92:96;
        const sleeveEndY=baby?142:158;
        return '<svg class="ip-size-drawing" viewBox="0 0 420 320" role="img" aria-label="'+(baby?'Sơ đồ đo Baby Tee':'Sơ đồ đo T-Shirt')+'">'+
            measureDefs()+
            '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+
            '<path d="M166 61 Q210 45 254 61 L292 76 L335 '+sleeveEndY+' L300 174 L286 '+sleeveY+' L286 '+hem+' Q210 '+(hem+8)+' 134 '+hem+' L134 '+sleeveY+' L120 174 L85 '+sleeveEndY+' L128 76 Z"></path>'+
            '<path d="M174 61 Q182 91 210 92 Q238 91 246 61"></path>'+
            '<path d="M180 63 Q188 82 210 83 Q232 82 240 63" stroke-width="1.2" stroke-dasharray="3 3"></path>'+
            '<line x1="134" y1="'+(hem-8)+'" x2="286" y2="'+(hem-8)+'" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '<line x1="86" y1="'+(sleeveEndY-9)+'" x2="121" y2="166" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '<line x1="334" y1="'+(sleeveEndY-9)+'" x2="299" y2="166" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '</g>'+
            '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6 5" marker-start="url(#ip-size-arrow)" marker-end="url(#ip-size-arrow)">'+
            '<line x1="68" y1="'+top+'" x2="68" y2="'+hem+'"></line>'+
            '<line x1="'+left+'" y1="'+bodyTop+'" x2="'+right+'" y2="'+bodyTop+'"></line>'+
            '<line x1="294" y1="79" x2="338" y2="'+(sleeveEndY-5)+'"></line>'+
            '</g>'+
            '<g fill="currentColor" font-family="Arial, sans-serif" font-size="23" font-weight="700">'+
            '<text x="44" y="'+((top+hem)/2)+'">a</text><text x="205" y="'+(bodyTop-12)+'">b</text><text x="347" y="'+(sleeveEndY-18)+'">c</text>'+
            '</g></svg>';
    }

    function longSleeveSvg(){
        return '<svg class="ip-size-drawing" viewBox="0 0 420 320" role="img" aria-label="Sơ đồ đo áo dài tay">'+
            measureDefs()+
            '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+
            '<path d="M164 58 Q210 43 256 58 L291 74 L324 267 L292 274 L276 151 L282 270 Q210 278 138 270 L144 151 L128 274 L96 267 L129 74 Z"></path>'+
            '<path d="M174 59 Q181 91 210 92 Q239 91 246 59"></path>'+
            '<path d="M181 61 Q189 82 210 83 Q231 82 239 61" stroke-width="1.2" stroke-dasharray="3 3"></path>'+
            '<line x1="138" y1="261" x2="282" y2="261" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '<line x1="97" y1="258" x2="127" y2="264" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '<line x1="293" y1="264" x2="323" y2="258" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '</g>'+
            '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6 5" marker-start="url(#ip-size-arrow)" marker-end="url(#ip-size-arrow)">'+
            '<line x1="66" y1="59" x2="66" y2="271"></line>'+
            '<line x1="143" y1="116" x2="277" y2="116"></line>'+
            '<line x1="289" y1="78" x2="320" y2="258"></line>'+
            '</g>'+
            '<g fill="currentColor" font-family="Arial, sans-serif" font-size="23" font-weight="700"><text x="42" y="172">a</text><text x="205" y="104">b</text><text x="326" y="172">c</text></g></svg>';
    }

    function sweaterSvg(){
        return '<svg class="ip-size-drawing" viewBox="0 0 420 320" role="img" aria-label="Sơ đồ đo Sweater và Hoodie">'+
            measureDefs()+
            '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+
            '<path d="M162 58 Q210 43 258 58 L294 76 L326 261 L291 271 L274 145 L282 260 L274 281 Q210 289 146 281 L138 260 L146 145 L129 271 L94 261 L126 76 Z"></path>'+
            '<path d="M174 59 Q181 90 210 91 Q239 90 246 59"></path>'+
            '<path d="M181 61 Q189 81 210 82 Q231 81 239 61" stroke-width="1.2" stroke-dasharray="3 3"></path>'+
            '<line x1="145" y1="261" x2="275" y2="261" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '<line x1="95" y1="252" x2="129" y2="261" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '<line x1="291" y1="261" x2="325" y2="252" stroke-width="1.2" stroke-dasharray="3 3"></line>'+
            '</g>'+
            '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6 5" marker-start="url(#ip-size-arrow)" marker-end="url(#ip-size-arrow)">'+
            '<line x1="66" y1="59" x2="66" y2="280"></line>'+
            '<line x1="144" y1="118" x2="276" y2="118"></line>'+
            '</g>'+
            '<g fill="currentColor" font-family="Arial, sans-serif" font-size="23" font-weight="700"><text x="42" y="177">a</text><text x="205" y="106">b</text></g></svg>';
    }

    function drawing(g){
        if(g.kind==='tee')return shortSleeveSvg(false);
        if(g.kind==='baby')return shortSleeveSvg(true);
        if(g.kind==='longsleeve')return longSleeveSvg();
        return sweaterSvg();
    }

    function guideTable(g){
        let head='<tr><th>Size</th>'+g.sizes.map(function(s){return '<th>'+s+'</th>';}).join('')+'</tr>';
        let body=g.rows.map(function(row){
            return '<tr><th scope="row">'+row[0]+'</th>'+row.slice(1).map(function(v){return '<td>'+v+'</td>';}).join('')+'</tr>';
        }).join('');
        return '<div class="ip-size-table-wrap"><table class="ip-size-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>';
    }

    function guideHtml(p){
        const key=productKind(p),g=guides[key];
        if(!g){
            return '<div class="ip-size-fallback"><p>Bảng số đo riêng cho mẫu này đang được cập nhật.</p><p>Size bạn chọn vẫn được lưu cùng đơn hàng.</p></div>'+
                '<div class="ip-care"><b>Chăm sóc áo</b><ul><li>Giặt mặt trái với nước mát.</li><li>Không dùng chất tẩy mạnh.</li><li>Không ủi trực tiếp lên hình in.</li><li>Phơi nơi thoáng mát, hạn chế nắng gắt.</li></ul></div>';
        }
        const extra=p&&p.sizeGuide?'<p class="ip-size-extra">'+String(p.sizeGuide).replace(/[<>&"]/g,function(ch){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch];})+'</p>':'';
        return '<div class="ip-size-guide">'+
            '<div class="ip-size-title">'+g.title+'</div>'+
            drawing(g)+
            guideTable(g)+
            '<p class="ip-size-note">Đơn vị: cm · Độ sai lệch 2–3 cm. Bảng size mang tính chất tham khảo.</p>'+
            extra+
            '<div class="ip-care"><b>Chăm sóc áo</b><ul><li>Giặt mặt trái với nước mát hoặc tối đa 30°C.</li><li>Không dùng chất tẩy mạnh và không ngâm lâu.</li><li>Không ủi trực tiếp lên hình in.</li><li>Phơi nơi thoáng mát, hạn chế nắng gắt.</li></ul></div>'+
            '</div>';
    }

    function installStyles(){
        if(document.getElementById('imprint-product-size-care-v1-style'))return;
        const style=document.createElement('style');
        style.id='imprint-product-size-care-v1-style';
        style.textContent=[
            '.ip-size-guide{margin-top:14px;padding:18px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}',
            '.ip-size-title{text-align:center;font-size:18px;font-weight:800;letter-spacing:.02em;margin:2px 0 8px}',
            '.ip-size-drawing{display:block;width:min(100%,520px);height:auto;margin:0 auto 8px;color:#241f1c}',
            '.ip-size-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px}',
            '.ip-size-table{width:100%;border-collapse:collapse;min-width:520px;background:#fff;margin:0}',
            '.ip-size-table th,.ip-size-table td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:10px 12px;text-align:center;font-size:12px;white-space:nowrap}',
            '.ip-size-table thead th{background:#f2efeb;font-weight:800;color:var(--ink)}',
            '.ip-size-table tbody th{text-align:left;font-weight:700;background:#faf8f5;color:var(--ink)}',
            '.ip-size-table tr:last-child th,.ip-size-table tr:last-child td{border-bottom:0}',
            '.ip-size-table th:last-child,.ip-size-table td:last-child{border-right:0}',
            '.ip-size-note,.ip-size-extra{font-size:11px!important;line-height:1.55!important;margin:10px 0 0!important;color:var(--muted)!important;text-align:center}',
            '.ip-care{margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}',
            '.ip-care b{font-size:12px}',
            '.ip-care ul{margin:8px 0 0;padding-left:18px}',
            '.ip-care li{font-size:12px!important;line-height:1.55;color:var(--muted);margin:4px 0!important}',
            '.ip-size-fallback{padding:12px 0}',
            '@media(max-width:680px){.ip-size-guide{padding:12px}.ip-size-title{font-size:15px}.ip-size-drawing{width:100%}.ip-size-table{min-width:470px}.ip-size-table th,.ip-size-table td{padding:9px 10px;font-size:11px}}'
        ].join('');
        document.head.appendChild(style);
    }

    function injectGuide(id){
        const p=data&&Array.isArray(data.products)?data.products.find(function(x){return x.id===id;}):null;
        if(!p)return;
        const blocks=[].slice.call(document.querySelectorAll('.detail details'));
        const sizeBlock=blocks.find(function(d){
            const s=d.querySelector('summary');
            return s&&s.textContent.trim()==='Kích cỡ & chăm sóc';
        });
        if(!sizeBlock)return;
        sizeBlock.innerHTML='<summary>Kích cỡ & chăm sóc</summary>'+guideHtml(p);
    }

    installStyles();

    if(typeof product==='function'&&!product.__imprintSizeCareV1){
        const baseProductSizeCare=product;
        product=function(id){
            const result=baseProductSizeCare.apply(this,arguments);
            requestAnimationFrame(function(){injectGuide(id);});
            return result;
        };
        product.__imprintSizeCareV1=true;
    }
})();
