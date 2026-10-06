;(()=>{
  const GUIDES={
    tee:{title:'BẢNG SIZE T-SHIRT',sizes:['S','M','L','XL','2XL'],rows:[['Dài áo (a)',['66','69','72','75','78']],['Rộng áo (b)',['49','52','55','58','61']],['Tay (c)',['22','23','24','25','26']],['Cân nặng',['<55kg','60–75kg','70–80kg','>80kg','>90kg']],['Chiều cao',['<160cm','<170cm','<180cm','>180cm','>180cm']]]},
    baby:{title:'BẢNG SIZE BABY TEE',sizes:['S','M','L'],rows:[['Dài áo (a)',['43','45','47']],['Rộng áo (b)',['38','40','42']],['Tay (c)',['13','14','15']]]},
    longsleeve:{title:'BẢNG SIZE LONG SLEEVE TEE',sizes:['M','L','XL'],rows:[['Dài áo (a)',['64','67','71']],['Rộng áo (b)',['58','60','63']],['Tay (c)',['59','61','63']]]},
    sweater:{title:'BẢNG SIZE SWEATER',sizes:['M','L','XL'],rows:[['Dài áo (a)',['66','70','74']],['Rộng áo (b)',['57','61','64']],['Cân nặng',['40–55kg','55–70kg','70–80kg']]]},
    hoodie:{title:'BẢNG SIZE HOODIE',sizes:['M','L','XL'],rows:[['Dài áo (a)',['66','70','74']],['Rộng áo (b)',['57','61','64']],['Cân nặng',['40–55kg','55–70kg','70–80kg']]]}
  };

  const style=document.createElement('style');
  style.id='imprint-size-guide-style';
  style.textContent=`
    .ip-size-care{border-bottom:1px solid var(--line);padding:17px 0}
    .ip-size-care>summary{cursor:pointer;font-weight:700;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px}
    .ip-size-care>summary::-webkit-details-marker{display:none}
    .ip-size-care>summary:after{content:'＋';font-size:18px;font-weight:400;color:var(--muted)}
    .ip-size-care[open]>summary:after{content:'−'}
    .ip-size-wrap{margin-top:18px;border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden}
    .ip-size-head{padding:22px 22px 10px;text-align:center}
    .ip-size-head h3{margin:0;font-size:clamp(18px,2.2vw,25px);letter-spacing:-.025em}
    .ip-size-visual{padding:4px 18px 10px;display:flex;justify-content:center}
    .ip-size-visual svg{width:min(100%,560px);height:auto;color:#2e2926}
    .ip-size-table-wrap{overflow-x:auto;padding:0 18px 18px}
    .ip-size-table{width:100%;min-width:480px;border-collapse:separate;border-spacing:0;border:1px solid #d8d0c9;border-radius:9px;overflow:hidden;font-size:13px}
    .ip-size-table th,.ip-size-table td{padding:11px 10px;text-align:center;border-right:1px solid #e4ddd7;border-bottom:1px solid #e4ddd7;white-space:nowrap}
    .ip-size-table th:last-child,.ip-size-table td:last-child{border-right:0}
    .ip-size-table tr:last-child td{border-bottom:0}
    .ip-size-table thead th{background:#f5f1ec;font-weight:800}
    .ip-size-table tbody th{text-align:left;background:#fbf9f6;font-weight:700}
    .ip-size-note{margin:0;padding:0 20px 18px;text-align:center;color:var(--muted);font-size:12px}
    .ip-care{margin:14px 0 2px;padding:15px 17px;background:#f7f1eb;border-radius:9px;color:var(--muted);font-size:13px;line-height:1.65}
    .ip-care b{color:var(--ink)}
    .ip-care ul{margin:8px 0 0;padding-left:18px}
    @media(max-width:640px){.ip-size-head{padding-top:18px}.ip-size-visual{padding-inline:8px}.ip-size-table-wrap{padding-inline:10px}.ip-size-table{font-size:12px}.ip-size-table th,.ip-size-table td{padding:9px 8px}}
  `;
  if(!document.getElementById(style.id))document.head.append(style);

  function garmentSvg(type){
    const arrow=`<defs><marker id="ipArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="currentColor"/></marker></defs>`;
    const dimsShort=`<g fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="7 7" marker-start="url(#ipArrow)" marker-end="url(#ipArrow)"><path d="M145 68V286"/><path d="M218 170H382"/><path d="M405 92L463 151"/></g><g fill="currentColor" font-family="Arial,sans-serif" font-size="22" font-weight="700"><text x="120" y="182">a</text><text x="295" y="154">b</text><text x="466" y="125">c</text></g>`;
    const dimsLong=`<g fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="7 7" marker-start="url(#ipArrow)" marker-end="url(#ipArrow)"><path d="M135 58V294"/><path d="M220 159H380"/><path d="M405 102L474 282"/></g><g fill="currentColor" font-family="Arial,sans-serif" font-size="22" font-weight="700"><text x="108" y="182">a</text><text x="295" y="143">b</text><text x="468" y="198">c</text></g>`;
    const dimsAB=`<g fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="7 7" marker-start="url(#ipArrow)" marker-end="url(#ipArrow)"><path d="M135 58V294"/><path d="M220 159H380"/></g><g fill="currentColor" font-family="Arial,sans-serif" font-size="22" font-weight="700"><text x="108" y="182">a</text><text x="295" y="143">b</text></g>`;
    let body='';
    if(type==='baby')body=`<path d="M225 72L260 57Q300 74 340 57L375 72L435 128L392 170L373 151L366 264Q300 277 234 264L227 151L208 170L165 128Z"/><path d="M260 57Q300 101 340 57"/><path d="M179 142L209 166M391 166L421 142M236 254Q300 263 364 254" stroke-dasharray="3 4"/>`;
    else if(type==='tee')body=`<path d="M220 70L260 55Q300 74 340 55L380 70L451 130L414 176L382 151L371 285H229L218 151L186 176L149 130Z"/><path d="M260 55Q300 101 340 55"/><path d="M165 146L193 169M407 169L435 146M231 276H369" stroke-dasharray="3 4"/>`;
    else if(type==='longsleeve')body=`<path d="M224 66L260 54Q300 73 340 54L376 66L421 103L480 282L431 296L382 155L370 286H230L218 155L169 296L120 282L179 103Z"/><path d="M260 54Q300 99 340 54"/><path d="M127 274L171 288M429 288L473 274M232 277H368" stroke-dasharray="3 4"/>`;
    else if(type==='hoodie')body=`<path d="M225 78L260 64Q300 78 340 64L375 78L420 110L474 281L428 295L382 158L370 286H230L218 158L172 295L126 281L180 110Z"/><path d="M257 65Q270 22 300 34Q330 22 343 65Q300 94 257 65Z"/><path d="M262 190Q300 176 338 190L350 248H250Z"/><path d="M132 274L171 287M429 287L468 274M232 277H368" stroke-dasharray="3 4"/>`;
    else body=`<path d="M225 66L260 54Q300 73 340 54L375 66L418 103L474 281L428 295L382 158L370 286H230L218 158L172 295L126 281L182 103Z"/><path d="M260 54Q300 99 340 54"/><path d="M132 274L171 287M429 287L468 274M232 271H368M232 279H368" stroke-dasharray="3 4"/>`;
    const dims=(type==='tee'||type==='baby')?dimsShort:(type==='longsleeve'?dimsLong:dimsAB);
    return `<svg viewBox="0 0 600 340" role="img" aria-label="Sơ đồ đo kích cỡ ${type}">${arrow}<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${body}</g>${dims}</svg>`;
  }

  function tableHTML(g){
    return `<div class="ip-size-table-wrap"><table class="ip-size-table"><thead><tr><th>Size</th>${g.sizes.map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${g.rows.map(([label,vals])=>`<tr><th>${label}</th>${vals.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function guideHTML(p){
    const g=GUIDES[p?.garmentType];if(!g)return'';
    return `<details class="ip-size-care"><summary>Kích cỡ & chăm sóc</summary><div class="ip-size-wrap"><div class="ip-size-head"><h3>${g.title}</h3></div><div class="ip-size-visual">${garmentSvg(p.garmentType)}</div>${tableHTML(g)}<p class="ip-size-note">Độ sai lệch 2–3cm. Bảng size mang tính chất tham khảo.</p></div><div class="ip-care"><b>Chăm sóc áo</b><ul><li>Giặt mặt trái bằng nước mát, ưu tiên chế độ nhẹ.</li><li>Không dùng thuốc tẩy và không ngâm áo quá lâu.</li><li>Không ủi trực tiếp lên hình in; ưu tiên phơi tự nhiên.</li><li>Màu hiển thị trên màn hình có thể chênh nhẹ so với sản phẩm thực tế.</li></ul></div></details>`;
  }

  const baseProduct=product;
  product=function(id){
    const p=data.products.find(x=>x.id===id),g=GUIDES[p?.garmentType];
    if(p&&g){const allowed=g.sizes.filter(s=>p.sizes.includes(s));if(allowed.length)p.sizes=allowed;}
    baseProduct(id);
    if(!p||!g)return;
    const right=app.querySelector('.detail > div:last-child');if(!right)return;
    const blocks=[...right.querySelectorAll(':scope > details')];
    const oldSize=blocks.find(d=>d.querySelector('summary')?.textContent.trim()==='Chọn kích cỡ');
    const oldCare=blocks.find(d=>d.querySelector('summary')?.textContent.trim()==='Hình in & chăm sóc');
    const shipping=blocks.find(d=>d.querySelector('summary')?.textContent.trim()==='Giao hàng & hỗ trợ');
    const holder=document.createElement('div');holder.innerHTML=guideHTML(p);const node=holder.firstElementChild;
    if(oldSize){oldSize.replaceWith(node);if(oldCare)oldCare.remove();}
    else if(oldCare){oldCare.replaceWith(node);}
    else if(shipping)shipping.before(node);else right.append(node);
  };
})();