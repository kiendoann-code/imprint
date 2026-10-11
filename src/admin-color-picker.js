/* ImPrint · per-product custom garment colour editor.
   Loaded after the legacy UI, before init(). Existing product and order IDs are untouched. */
(function(){
  'use strict';
  const COLOR_RE=/^#[0-9a-f]{6}$/i, LIMIT=30;
  const forbidden=/[<>"'`\\,]/;
  let cardContext=null;
  const isHex=v=>typeof v==='string'&&COLOR_RE.test(v);
  const normalized=v=>isHex(v)?v.toLowerCase():null;
  function inProduct(name,p){
    if(!p||!p.colorHexes||typeof p.colorHexes!=='object')return null;
    return normalized(p.colorHexes[name]);
  }
  const previousColorHex=colorHex;
  function productForColour(){
    if(cardContext)return cardContext;
    if(typeof draft!=='undefined'&&draft&&draft.productId)
      return data?.products?.find(p=>p.id===draft.productId);
    if(typeof chosen!=='undefined'&&chosen&&chosen.id)
      return data?.products?.find(p=>p.id===chosen.id);
    return null;
  }
  colorHex=function(name){
    const p=productForColour(),stored=inProduct(name,p);
    if(stored)return stored;
    const any=data?.products?.find(p=>inProduct(name,p));
    if(any)return inProduct(name,any);
    return previousColorHex(name);
  };
  const previousCard=card;
  card=function(p){
    const before=cardContext;cardContext=p;
    try{return previousCard.apply(this,arguments);}
    finally{cardContext=before;}
  };

  const css=document.createElement('style');
  css.id='imprint-admin-colour-editor-style';
  css.textContent=[
    '.ip-colour-editor{margin:12px 0 18px;padding:16px;border:1px solid var(--line,#ddd);border-radius:14px;background:#faf8f6}',
    '.ip-colour-editor h3{font-size:15px;margin:0 0 5px}',
    '.ip-colour-hint{font-size:12px;color:var(--muted,#6b6764);line-height:1.5;margin:0 0 14px}',
    '.ip-colour-row{display:grid;grid-template-columns:54px minmax(105px,1fr) minmax(100px,125px) auto;align-items:center;gap:9px;margin-bottom:10px}',
    '.ip-colour-row input[type=color]{padding:3px;width:50px;height:42px;cursor:pointer;border:1px solid #d3cdca;border-radius:8px;background:#fff}',
    '.ip-colour-row input[type=text]{height:42px;min-width:0;width:100%;border:1px solid #d3cdca;border-radius:8px;padding:8px;background:#fff;font-size:13px}',
    '.ip-colour-row button,.ip-colour-add{border:1px solid #d3cdca;border-radius:8px;min-height:38px;padding:8px 11px;background:#fff;cursor:pointer}',
    '.ip-colour-row button:hover,.ip-colour-add:hover{background:#f1eae7}',
    '.ip-colour-count{font-size:12px;color:var(--muted,#777);margin-left:10px}',
    '@media(max-width:530px){.ip-colour-editor{padding:12px}.ip-colour-row{grid-template-columns:48px minmax(0,1fr) auto}.ip-colour-row .ip-colour-hex{grid-column:2;grid-row:auto}.ip-colour-row button{grid-column:3;grid-row:1/3}.ip-colour-row input[type=color]{width:44px}}'
  ].join('');
  document.head.appendChild(css);

  function editorFor(input,kind,source,product){
    if(!input||input.dataset.ipColourPicker)return null;
    input.dataset.ipColourPicker='1';
    const field=input.closest('.field')||input.parentElement;
    field.hidden=true;
    field.style.display='none';
    const panel=document.createElement('section');
    panel.className='ip-colour-editor';
    panel.dataset.colourKind=kind;
    const heading=document.createElement('h3');
    heading.textContent=kind==='body'?'Màu thân áo':'Màu tay áo Raglan';
    const hint=document.createElement('p');
    hint.className='ip-colour-hint';
    hint.textContent='Chọn màu hoặc nhập HEX #RRGGBB, đặt tên màu và thêm tùy ý (tối đa 30 màu).';
    const rows=document.createElement('div');
    rows.className='ip-colour-rows';
    const add=document.createElement('button');
    add.className='ip-colour-add';
    add.type='button';
    add.textContent='＋ Thêm màu';
    const count=document.createElement('span');
    count.className='ip-colour-count';
    panel.append(heading,hint,rows,add,count);
    field.insertAdjacentElement('afterend',panel);

    function sync(){
      input.value=Array.from(rows.querySelectorAll('.ip-colour-name')).map(x=>x.value.trim()).filter(Boolean).join(', ');
      count.textContent=rows.children.length+' / '+LIMIT+' màu';
      add.disabled=rows.children.length>=LIMIT;
    }
    function addRow(name,hex){
      if(rows.children.length>=LIMIT)return;
      const row=document.createElement('div');row.className='ip-colour-row';
      const picker=document.createElement('input');picker.type='color';picker.setAttribute('aria-label','Chọn màu áo');picker.value=normalized(hex)||'#eeeeee';
      const title=document.createElement('input');title.type='text';title.className='ip-colour-name';title.placeholder='Tên màu';title.maxLength=40;title.required=true;title.value=name;
      const code=document.createElement('input');code.type='text';code.className='ip-colour-hex';code.placeholder='#RRGGBB';code.maxLength=7;code.required=true;code.setAttribute('aria-label','Mã màu HEX');code.value=picker.value;
      const remove=document.createElement('button');remove.type='button';remove.textContent='Xóa';remove.setAttribute('aria-label','Xóa màu '+(name||'mới'));
      picker.addEventListener('input',()=>{code.value=picker.value.toUpperCase();sync();});
      code.addEventListener('input',()=>{const c=normalized(code.value.trim());if(c)picker.value=c;});
      title.addEventListener('input',sync);
      remove.addEventListener('click',()=>{
        if(rows.children.length===1){toast('Sản phẩm phải có ít nhất một màu.');return;}
        if(name&&!confirm('Xóa màu '+name+'? Giỏ hàng và thiết kế chưa thanh toán dùng màu này có thể cần chọn lại.'))return;
        row.remove();sync();
      });
      row.append(picker,title,code,remove);rows.appendChild(row);sync();
      if(!name)title.focus();
    }
    const entries=source&&source.length?source:['Trắng'];
    entries.forEach(name=>addRow(name,inProduct(name,product)||normalized(COLORS[name])||normalized(name)||'#eeeeee'));
    add.addEventListener('click',()=>addRow('','#ffffff'));
    return panel;
  }
  function readColours(kind){
    const panel=document.querySelector('.ip-colour-editor[data-colour-kind="'+kind+'"]');
    if(!panel)throw Error('Không tìm thấy bộ chọn màu '+kind+'.');
    const names=[],hexes={},keys=new Set();
    for(const row of panel.querySelectorAll('.ip-colour-row')){
      const name=row.querySelector('.ip-colour-name').value.trim().replace(/\s+/g,' ');
      const hex=normalized(row.querySelector('.ip-colour-hex').value.trim());
      if(!name||name.length>40||forbidden.test(name))
        throw Error('Tên màu phải có 1–40 ký tự; không dùng dấu phẩy, dấu nháy hoặc dấu ngoặc HTML.');
      if(!hex)throw Error('Màu '+name+' cần mã HEX hợp lệ, ví dụ #A8D8C8.');
      const key=name.toLocaleLowerCase('vi');
      if(keys.has(key))throw Error('Màu "'+name+'" bị trùng tên trong cùng một nhóm.');
      keys.add(key);names.push(name);hexes[name]=hex;
    }
    if(!names.length||names.length>LIMIT)throw Error('Chọn từ 1 đến '+LIMIT+' màu.');
    return {names,hexes};
  }
  const baseProductForm=productForm;
  productForm=function(id){
    const result=baseProductForm.apply(this,arguments);
    if(typeof user==='undefined'||user?.role!=='admin')return result;
    const p=data.products.find(x=>x.id===id)||null;
    editorFor(document.getElementById('acolors'),'body',p?.colors,p);
    editorFor(document.getElementById('asleeve'),'sleeve',p?.sleeveColors,p);
    const legacyHint=document.querySelector('#asleeveWrap .tiny.muted');
    if(legacyHint)legacyHint.hidden=true;
    return result;
  };

  saveProduct=async function(id){
    if(typeof user==='undefined'||user?.role!=='admin')return;
    let old=null,index=-1,p=null;
    try{
      old=data.products.find(p=>p.id===id);
      index=old?data.products.indexOf(old):-1;
      const body=readColours('body');
      const t=document.getElementById('agarment').value;
      const sleeve=t==='raglan'?readColours('sleeve'):{names:[],hexes:{}};
      const codes={...body.hexes};
      for(const [name,hex] of Object.entries(sleeve.hexes)){
        if(codes[name]&&codes[name]!==hex)throw Error('Màu '+name+' ở thân và tay áo cần có cùng mã HEX.');
        codes[name]=hex;
      }
      const imgInput=document.getElementById('aimage'),file=imgInput?.files?.[0];
      p={...(old||{}),
        id:id||uid(),name:document.getElementById('aname').value.trim(),
        cat:document.getElementById('acat').value.trim(),garmentType:t,
        price:+document.getElementById('aprice').value,sale:+document.getElementById('asale').value,
        stock:+document.getElementById('astock').value,
        fabric:document.getElementById('afabric').value.trim(),fit:document.getElementById('afit').value.trim(),
        sizes:document.getElementById('asizes').value.split(',').map(s=>s.trim()).filter(Boolean),
        colors:body.names,sleeveColors:sleeve.names,colorHexes:codes,
        custom:document.getElementById('acustom').checked,
        description:document.getElementById('adescription').value.trim(),
        details:document.getElementById('adetails').value.split('\n').map(s=>s.trim()).filter(Boolean),
        sizeGuide:document.getElementById('asizeGuide').value.trim(),
        models:t==='baby'?['f']:['f','m']
      };
      p.img=file?await imageData(file):old?.img||(MOCKUPS[t==='tee'?'f_M':t+'_f']||MOCKUPS.f_M).src;
      if(!p.name||!p.description||!p.sizes.length||p.price<1000||p.sale<0||p.sale>90||p.stock<0)
        throw Error('Kiểm tra lại tên, mô tả, size, giá và tồn kho sản phẩm.');
      if(index>=0)data.products[index]=p;
      else data.products.push(p);
      try{
        await persist();
      }catch(error){
        if(index>=0)data.products[index]=old;
        else data.products=data.products.filter(x=>x!==p);
        throw error;
      }
      if(typeof variantCache!=='undefined')variantCache.clear();
      if(typeof cardChoices!=='undefined'&&cardChoices[p.id]){
        const c=cardChoices[p.id];
        if(!p.colors.includes(c.color))c.color=p.colors[0];
        if(t==='raglan'&&!p.sleeveColors.includes(c.sleeveColor))c.sleeveColor=p.sleeveColors[0];
      }
      document.getElementById('modal')?.close();
      admin();
      toast('Đã lưu sản phẩm và màu áo.');
    }catch(error){toast(error?.message||'Không thể lưu màu áo.');}
  };
})();