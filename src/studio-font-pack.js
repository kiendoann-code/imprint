/* ImPrint Studio · 20 extra Unicode/Vietnamese fonts and visual font picker.
 * Keeps the legacy native #fontSelect and addText()/setTextProp() flows intact.
 * Loaded after the legacy Studio script and before init().
 */
(function imprintVietnameseFontPack(){
  'use strict';
  const NEW_FONTS=Object.freeze([
    {name:'Inter',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Roboto',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Montserrat',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Noto Sans',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Nunito Sans',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Quicksand',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Manrope',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Open Sans',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Lexend',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Mulish',group:'Hiện đại',fallback:'sans-serif'},
    {name:'Oswald',group:'Cá tính',fallback:'sans-serif'},
    {name:'Barlow',group:'Cá tính',fallback:'sans-serif'},
    {name:'Space Grotesk',group:'Cá tính',fallback:'sans-serif'},
    {name:'Raleway',group:'Thanh lịch',fallback:'sans-serif'},
    {name:'Noto Serif',group:'Thanh lịch',fallback:'serif'},
    {name:'Merriweather',group:'Thanh lịch',fallback:'serif'},
    {name:'Bitter',group:'Thanh lịch',fallback:'serif'},
    {name:'Pacifico',group:'Viết tay',fallback:'cursive',weights:[400]},
    {name:'Lobster',group:'Viết tay',fallback:'cursive',weights:[400]},
    {name:'Comfortaa',group:'Cá tính',fallback:'sans-serif'}
  ]);
  const VI_SAMPLE='Những điều dịu dàng — Tiếng Việt Ắ Ế Ở Ữ Đ';
  const DIACRITICS='ầ · ằ · ễ · ộ · ự · đ';
  const LEGACY_FALLBACK=Object.freeze(['Lora','Playfair Display','Dancing Script','Patrick Hand','Be Vietnam Pro','Arial','Georgia','Verdana','Tahoma','Trebuchet MS','Courier New','Times New Roman']);
  const fontURL=new URL('https://fonts.googleapis.com/css2');
  for(const f of NEW_FONTS)fontURL.searchParams.append('family',f.name+':wght@'+(f.weights||[400,700]).join(';'));
  fontURL.searchParams.set('display','swap');
  let fontsReady=Promise.resolve();
  let activePicker=null;
  let pendingScan=false;
  let fontSelectSeen=null;
  let installed=false;

  function cssFamily(name){
    const entry=NEW_FONTS.find(f=>f.name===name);
    const fallback=entry?.fallback||(/serif|georgia|times|playfair|lora|merriweather/i.test(name)?'serif':/script|hand|caveat|pacifico|lobster/i.test(name)?'cursive':'sans-serif');
    return '"'+name.replace(/["\\]/g,'')+'", '+fallback;
  }
  function installStyles(){
    if(document.getElementById('ip-vi-font-css'))return;
    for(const host of ['https://fonts.googleapis.com','https://fonts.gstatic.com']){
      const pre=document.createElement('link');pre.rel='preconnect';pre.href=host;
      if(host.includes('gstatic'))pre.crossOrigin='anonymous';document.head.appendChild(pre);
    }
    const link=document.createElement('link');link.id='ip-vi-font-css';link.rel='stylesheet';link.href=fontURL.toString();
    fontsReady=new Promise(resolve=>{link.onload=resolve;link.onerror=resolve;});
    document.head.appendChild(link);
    const style=document.createElement('style');style.id='ip-vi-font-picker-style';
    style.textContent=`
      #fontSelect.ip-font-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important;padding:0!important;margin:0!important}
      .ip-font-combobox{position:relative;width:100%;min-width:0;font-family:inherit;z-index:3}
      .ip-font-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:46px;padding:8px 12px;border:1px solid var(--line,#cfc8c3);border-radius:9px;background:#fff;color:#242022;text-align:left;cursor:pointer}
      .ip-font-trigger:focus-visible,.ip-font-option:focus-visible,.ip-font-filter:focus-visible{outline:2px solid #8e5263;outline-offset:2px}
      .ip-font-trigger-name{min-width:0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:19px;line-height:1.35}
      .ip-font-arrow{font-size:14px;color:#675c63;flex-shrink:0}
      .ip-font-menu{position:absolute;left:0;top:calc(100% + 5px);width:max(100%,min(350px,82vw));max-width:min(380px,90vw);z-index:999;background:#fff;border:1px solid #ded7d3;border-radius:12px;box-shadow:0 14px 35px rgba(35,23,29,.16);overflow:hidden}
      .ip-font-filter{display:block;box-sizing:border-box;width:calc(100% - 20px);margin:10px;border:1px solid #d7cfc9;background:#fdfbfa;border-radius:8px;padding:10px;font:14px sans-serif}
      .ip-font-options{max-height:min(350px,50vh);overflow:auto;overscroll-behavior:contain;padding:0 6px 7px}
      .ip-font-option{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;background:transparent;border:0;border-radius:7px;padding:6px 10px;text-align:left;color:#252127;cursor:pointer}
      .ip-font-option:hover,.ip-font-option[aria-selected="true"]{background:#f8f0f3}
      .ip-font-option-name{font-size:20px;line-height:1.45;overflow-wrap:anywhere}
      .ip-font-option-label{font:11px/1.3 sans-serif;color:#8b7b82;white-space:nowrap}
      .ip-font-empty{padding:20px;text-align:center;font:13px sans-serif;color:#766b6e}
      .font-library .ip-font-library-card{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-height:78px;padding:9px 11px;border-radius:10px;background:#fff;border:1px solid var(--line,#e4ddd7);cursor:pointer;text-align:left;width:100%;overflow:hidden}
      .font-library .ip-font-library-card:hover{background:#fff5f9;border-color:#d5b4c2}
      .ip-font-library-card span{font-size:14px;line-height:1.3}
      .ip-font-library-card b{font-weight:400;font-size:18px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ip-font-library-card small{font-size:12px;color:#766d71}
      @media(max-width:600px){.ip-font-menu{max-width:min(320px,90vw)}.ip-font-options{max-height:44vh}}
    `;
    document.head.appendChild(style);
  }

  function availableFonts(select){
    const names=[...select.options].map(o=>o.value).filter(Boolean);
    // Preserve all original Studio options, even if more are added later.
    const all=[...names,...NEW_FONTS.map(f=>f.name)];
    if(!names.length)all.unshift(...LEGACY_FALLBACK);
    return [...new Set(all)];
  }
  function loadSelected(name){
    if(!NEW_FONTS.some(f=>f.name===name)||!document.fonts?.load)return;
    fontsReady.then(()=>document.fonts.load('400 24px '+cssFamily(name),VI_SAMPLE)).then(()=>{
      const current=document.getElementById('fontSelect');
      // Repaint after font finishes loading, never overwrite a newer choice.
      if(current&&current.value===name)current.dispatchEvent(new Event('change',{bubbles:true}));
    }).catch(()=>{});
  }
  function addOptions(select){
    const existing=new Set([...select.options].map(o=>o.value));
    for(const font of NEW_FONTS)if(!existing.has(font.name))select.add(new Option(font.name,font.name));
  }
  function dismiss(){
    if(!activePicker)return;
    const p=activePicker;activePicker=null;
    p.menu.hidden=true;p.trigger.setAttribute('aria-expanded','false');
  }
  function enhanceSelect(select){
    if(select.dataset.ipFontPack)return;
    select.dataset.ipFontPack='1';
    addOptions(select);
    select.classList.add('ip-font-native');
    select.tabIndex=-1;
    select.setAttribute('aria-label','Font chữ (điều khiển bởi danh sách bên cạnh)');

    const root=document.createElement('div');root.className='ip-font-combobox';
    const trigger=document.createElement('button');trigger.type='button';trigger.className='ip-font-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','Chọn font chữ');
    const current=document.createElement('span');current.className='ip-font-trigger-name';
    const arrow=document.createElement('span');arrow.className='ip-font-arrow';arrow.textContent='▾';arrow.setAttribute('aria-hidden','true');
    trigger.append(current,arrow);
    const menu=document.createElement('div');menu.className='ip-font-menu';menu.hidden=true;
    const filter=document.createElement('input');filter.type='search';filter.className='ip-font-filter';filter.placeholder='Tìm font chữ…';filter.setAttribute('aria-label','Tìm font chữ');filter.autocomplete='off';
    const list=document.createElement('div');list.className='ip-font-options';list.setAttribute('role','listbox');list.setAttribute('aria-label','Danh sách font chữ');
    menu.append(filter,list);root.append(trigger,menu);
    select.insertAdjacentElement('afterend',root);
    const picker={select,root,trigger,current,menu,filter,list};

    const sync=()=>{
      const name=select.value||availableFonts(select)[0]||'Arial';
      current.textContent=name;current.style.fontFamily=cssFamily(name);
      for(const option of list.querySelectorAll('.ip-font-option'))option.setAttribute('aria-selected',String(option.dataset.font===name));
    };
    function renderOptions(){
      const query=filter.value.trim().toLocaleLowerCase('vi');
      const fonts=availableFonts(select).filter(name=>name.toLocaleLowerCase('vi').includes(query));
      list.replaceChildren();
      if(!fonts.length){const empty=document.createElement('p');empty.className='ip-font-empty';empty.textContent='Không tìm thấy font chữ';list.append(empty);return;}
      for(const name of fonts){
        const item=document.createElement('button');item.type='button';item.className='ip-font-option';item.dataset.font=name;item.setAttribute('role','option');
        item.setAttribute('aria-selected',String(select.value===name));
        const display=document.createElement('span');display.className='ip-font-option-name';display.textContent=name;display.style.fontFamily=cssFamily(name);
        const group=document.createElement('span');group.className='ip-font-option-label';group.textContent=NEW_FONTS.find(f=>f.name===name)?.group||'Có sẵn';
        item.append(display,group);
        item.addEventListener('click',()=>{
          select.value=name;
          select.dispatchEvent(new Event('change',{bubbles:true}));
          sync();dismiss();trigger.focus();loadSelected(name);
        });
        list.append(item);
      }
    }
    function open(){
      if(activePicker&&activePicker!==picker)dismiss();
      activePicker=picker;menu.hidden=false;trigger.setAttribute('aria-expanded','true');
      filter.value='';renderOptions();sync();filter.focus();
      const chosen=list.querySelector('.ip-font-option[aria-selected="true"]');chosen?.scrollIntoView({block:'nearest'});
    }
    trigger.addEventListener('click',()=>menu.hidden?open():dismiss());
    trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    filter.addEventListener('input',renderOptions);
    filter.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();dismiss();trigger.focus();}
      if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('.ip-font-option')?.focus();}
    });
    list.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();dismiss();trigger.focus();return;}
      const opts=[...list.querySelectorAll('.ip-font-option')],index=opts.indexOf(document.activeElement);
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();opts[Math.max(0,Math.min(opts.length-1,index+(e.key==='ArrowDown'?1:-1)))]?.focus();
      }
    });
    select.addEventListener('change',sync);
    sync();
  }
  function addLibraryButtons(library){
    for(const font of NEW_FONTS){
      if(library.querySelector('[data-ip-vi-font="'+font.name+'"]'))continue;
      const button=document.createElement('button');button.type='button';button.className='ip-font-library-card';button.dataset.ipViFont=font.name;
      button.setAttribute('aria-label','Thêm chữ với font '+font.name);
      const name=document.createElement('span');name.textContent=font.name;name.style.fontFamily=cssFamily(font.name);
      const sample=document.createElement('b');sample.textContent='Những điều dịu dàng';sample.style.fontFamily=cssFamily(font.name);
      const dia=document.createElement('small');dia.textContent=DIACRITICS;dia.style.fontFamily=cssFamily(font.name);
      button.append(name,sample,dia);
      button.addEventListener('click',()=>{
        // The original editor owns undo, selection, save and preview state.
        if(typeof addText==='function')addText(font.name);
        else if(typeof window.addText==='function')window.addText(font.name);
        else return;
        loadSelected(font.name);
      });
      library.append(button);
    }
  }
  function scan(){
    pendingScan=false;
    const select=document.getElementById('fontSelect');
    if(select||document.querySelectorAll('.font-library').length)installStyles();
    if(select){
      if(fontSelectSeen!==select){fontSelectSeen=select;dismiss();enhanceSelect(select);}
    }else if(fontSelectSeen){fontSelectSeen=null;dismiss();}
    for(const library of document.querySelectorAll('.font-library'))addLibraryButtons(library);
  }
  function scheduleScan(){
    if(pendingScan)return;
    pendingScan=true;
    requestAnimationFrame(scan);
  }
  function start(){
    if(installed)return;installed=true;
    document.addEventListener('pointerdown',e=>{
      if(activePicker&&!activePicker.root.contains(e.target))dismiss();
    });
    window.addEventListener('hashchange',scheduleScan);
    new MutationObserver(scheduleScan).observe(document.body,{childList:true,subtree:true});
    scheduleScan();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();