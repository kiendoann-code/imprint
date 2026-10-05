export function applyDesignAreaPatch(html){
  const changes=[
    [
      "const GARMENTS={tee:{label:'Áo thun',area:{x:185,y:170,w:230,h:270},cm:28},tank:{label:'Áo ba lỗ',area:{x:210,y:170,w:180,h:230},cm:23},baby:{label:'Baby tee',area:{x:213,y:150,w:174,h:155},cm:22},sweater:{label:'Sweater',area:{x:190,y:165,w:220,h:245},cm:28},longsleeve:{label:'Áo thun dài tay',area:{x:190,y:170,w:220,h:240},cm:28},hoodie:{label:'Hoodie',area:{x:225,y:257,w:150,h:48},cm:24},raglan:{label:'Raglan',area:{x:204,y:165,w:192,h:230},cm:26}};",
      "const GARMENTS={tee:{label:'Áo thun',area:{x:160,y:112,w:280,h:405},cm:28},tank:{label:'Áo ba lỗ',area:{x:195,y:118,w:210,h:378},cm:23},baby:{label:'Baby tee',area:{x:198,y:112,w:204,h:295},cm:22},sweater:{label:'Sweater',area:{x:165,y:112,w:270,h:404},cm:28},longsleeve:{label:'Áo thun dài tay',area:{x:165,y:112,w:270,h:404},cm:28},hoodie:{label:'Hoodie',area:{x:185,y:128,w:230,h:368},cm:24},raglan:{label:'Raglan',area:{x:180,y:112,w:240,h:398},cm:26}};"
    ],
    [
      "function fitPlacement(d,p){let a=GARMENTS[typeOf(p)].area;d.placement={x:a.x+a.w/2,y:a.y+a.h/2,w:Math.min(a.w,a.h)*.95,rotation:0}}",
      "function fitPlacement(d,p){let a=GARMENTS[typeOf(p)].area;d.placement={x:a.x+a.w/2,y:a.y+a.h/2,w:a.h*.98,rotation:0}}"
    ],
    [
      "renderMock=function(ctx,safe=true){garment(ctx);let m=draft.placement;ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation*Math.PI/180);ctx.globalAlpha=.97;ctx.drawImage(artwork(),-m.w/2,-m.w/2,m.w,m.w);ctx.restore();if(safe){let a=printArea();ctx.strokeStyle='#a8748799';ctx.setLineDash([5,5]);ctx.strokeRect(a.x,a.y,a.w,a.h);ctx.setLineDash([])}};",
      "renderMock=function(ctx,safe=true){garment(ctx);let m=draft.placement,a=printArea();ctx.save();ctx.beginPath();ctx.rect(a.x,a.y,a.w,a.h);ctx.clip();ctx.translate(m.x,m.y);ctx.rotate(m.rotation*Math.PI/180);ctx.globalAlpha=.97;ctx.drawImage(artwork(),-m.w/2,-m.w/2,m.w,m.w);ctx.restore();if(safe){ctx.strokeStyle='#a8748799';ctx.setLineDash([5,5]);ctx.strokeRect(a.x,a.y,a.w,a.h);ctx.setLineDash([])}};"
    ],
    [
      "let note=$('.mock-note');note.innerHTML=(t==='hoodie'?'Vùng in nhỏ phía trên túi, tránh dây mũ. ':t==='baby'?'Baby tee dành cho nữ. ':t==='raglan'?'Phối riêng màu thân và tay áo. ':'')+'Mockup tạo bằng AI; màu sắc là mô phỏng.<br>'+(t==='tee'?'Có ảnh mẫu nam/nữ theo size.':'Ảnh mẫu dùng chung để xem phom; size chọn được lưu trong đơn.')};",
      "let note=$('.mock-note');note.innerHTML=(t==='baby'?'Baby tee dành cho nữ. ':t==='raglan'?'Phối riêng màu thân và tay áo. ':'')+'Vùng thiết kế mở rộng từ gần cổ xuống sát gấu áo ở cả mặt trước và mặt sau.<br>Mockup tạo bằng AI; màu sắc là mô phỏng. '+(t==='tee'?'Có ảnh mẫu nam/nữ theo size.':'Ảnh mẫu dùng chung để xem phom; size chọn được lưu trong đơn.')};"
    ],
    ["'Vùng in nhỏ được đặt tránh dây mũ và miệng túi.'","'Có thể thiết kế mặt trước hoặc mặt sau trên vùng thân áo mở rộng.'"],
    ["'Ưu tiên chữ ngắn hoặc biểu tượng đơn giản.'","'Vùng thiết kế kéo dài từ gần cổ xuống sát gấu áo.'"],
    ["'Hình in đặt ở phần thân trước, tránh đường bo.'","'Có thể thiết kế mặt trước hoặc mặt sau, từ gần cổ xuống sát đường bo gấu.'"],
    ["'Hình in mặt trước; tay áo giữ màu đồng bộ với thân.'","'Có thể thiết kế mặt trước hoặc mặt sau; tay áo giữ màu đồng bộ với thân.'"],
    ["'Thiết kế được in trên phần thân trước.'","'Có thể thiết kế trên phần thân trước hoặc sau.'"]
  ];
  for(const [from,to] of changes){
    if(!html.includes(from))throw new Error('ImPrint design-area patch target not found: '+from.slice(0,80));
    html=html.replace(from,to);
  }
  return html;
}
