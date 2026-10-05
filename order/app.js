// ---- Configure these for your business ----
const CONFIG = {
  whatsapp: "2340000000000",           // PLACEHOLDER: set to the real order inbox, international format, no "+"
  deliveryFee: 0,                      // pickup only by default
  pickupPoints: ["Wuse II, Abuja", "Garki, Abuja", "Jabi, Abuja"], // SAMPLE pickup points — replace with the real outlets
  openHour: 8, closeHour: 22, slotMinutes: 30, prepMinutes: 30
};
const MENU = [
  {cat:"Rice", items:[
    {id:"pj-s",e:"🍛",n:"Party Jollof (Small)",d:"Smoky party-style jollof",p:1500},
    {id:"pj-l",e:"🍛",n:"Party Jollof (Large)",d:"Generous party portion",p:2500},
    {id:"fr",e:"🍚",n:"Fried Rice",d:"With mixed veg",p:2000}]},
  {cat:"Proteins", items:[
    {id:"chk",e:"🍗",n:"Grilled Chicken",d:"Peppered, charcoal grilled",p:2200},
    {id:"bf",e:"🥩",n:"Beef",d:"Spiced & tender",p:800},
    {id:"pl",e:"🍌",n:"Fried Plantain",d:"Sweet dodo",p:500}]},
  {cat:"Wraps", items:[
    {id:"shw-c",e:"🌯",n:"Chicken Shawarma",d:"Creamy sauce, cabbage, sausage",p:3000},
    {id:"shw-b",e:"🌯",n:"Beef Shawarma",d:"Double beef, extra sauce",p:3500}]},
  {cat:"Soups & Swallow", items:[
    {id:"egu",e:"🥣",n:"Egusi + Pounded Yam",d:"With assorted meat",p:3500},
    {id:"ogb",e:"🥣",n:"Ogbono + Eba",d:"With assorted meat",p:3200}]},
  {cat:"Drinks", items:[
    {id:"zob",e:"🥤",n:"Zobo",d:"Chilled hibiscus drink",p:700},
    {id:"wat",e:"💧",n:"Water",d:"50cl",p:200},
    {id:"sft",e:"🥫",n:"Soft Drink",d:"35cl",p:500}]}
];
const ALL = Object.fromEntries(MENU.flatMap(c=>c.items).map(i=>[i.id,i]));
const $ = s=>document.querySelector(s);
const naira = n=>"₦"+n.toLocaleString("en-NG");
const load = (k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const save = (k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let cart = load("nb-cart",{});
let orders = load("nb-orders",[]);
let profile = load("nb-profile",{name:"",phone:"",note:""});

function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,2200)}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}

function slots(){
  const out=[],now=new Date(),min=new Date(now.getTime()+CONFIG.prepMinutes*60000);
  for(let h=CONFIG.openHour;h<CONFIG.closeHour;h++)for(let m=0;m<60;m+=CONFIG.slotMinutes){
    const d=new Date();d.setHours(h,m,0,0);if(d>=min)out.push(d)}
  return out;
}
function fmt(d){return d.toLocaleTimeString("en-NG",{hour:"numeric",minute:"2-digit"})}
function initPickup(){
  $("#pickupPoint").innerHTML=CONFIG.pickupPoints.map(p=>`<option>${esc(p)}</option>`).join("");
  const s=slots();
  $("#pickupTime").innerHTML=s.length?s.map(d=>`<option value="${fmt(d)}">Today, ${fmt(d)}</option>`).join(""):`<option value="">Closed for today</option>`;
  const sp=load("nb-point",null);if(sp)$("#pickupPoint").value=sp;
  $("#pickupPoint").onchange=e=>save("nb-point",e.target.value);
}

function renderMenu(){
  $("#cats").innerHTML=MENU.map((c,i)=>`<button data-c="${i}" class="${i?"":"on"}">${c.cat}</button>`).join("");
  $("#menu").innerHTML=MENU.map((c,i)=>`<h3 id="cat${i}">${c.cat}</h3>`+c.items.map(it=>`
    <div class="item"><div class="emoji">${it.e}</div>
    <div class="info"><b>${esc(it.n)}</b><small>${esc(it.d)}</small><div class="price">${naira(it.p)}</div></div>
    <div id="ctl-${it.id}"></div></div>`).join("")).join("");
  MENU.forEach(c=>c.items.forEach(i=>ctl(i.id)));
  $("#cats").onclick=e=>{const b=e.target.closest("button");if(!b)return;
    document.querySelectorAll("#cats button").forEach(x=>x.classList.toggle("on",x===b));
    $("#cat"+b.dataset.c).scrollIntoView({behavior:"smooth",block:"start"})};
}
function ctl(id){
  const el=$("#ctl-"+id);if(!el)return;const q=cart[id]||0;
  el.innerHTML=q?`<div class="qty"><button data-a="-" data-id="${id}">−</button><b>${q}</b><button data-a="+" data-id="${id}">+</button></div>`
    :`<button class="add" data-a="+" data-id="${id}">Add</button>`;
}
function change(id,d){
  cart[id]=Math.max(0,(cart[id]||0)+d);if(!cart[id])delete cart[id];
  save("nb-cart",cart);ctl(id);bar();if(!$("#sheet").hidden)renderCart();
}
function totals(){
  const n=Object.values(cart).reduce((a,b)=>a+b,0);
  const sub=Object.entries(cart).reduce((a,[id,q])=>a+ALL[id].p*q,0);
  return {n,sub,fee:n?CONFIG.deliveryFee:0,total:sub+(n?CONFIG.deliveryFee:0)};
}
function bar(){
  const t=totals();$("#cartBar").hidden=!t.n||!$("#sheet").hidden;
  $("#cartCount").textContent=t.n+(t.n===1?" item":" items");$("#cartTotal").textContent=naira(t.total);
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-a]");if(b)change(b.dataset.id,b.dataset.a==="+"?1:-1)});

function open(html,title){$("#sheetTitle").textContent=title;$("#sheetBody").innerHTML=html;$("#sheet").hidden=false;$("#cartBar").hidden=true}
function close(){$("#sheet").hidden=true;bar()}
$("#closeSheet").onclick=close;
$("#sheet").onclick=e=>{if(e.target.id==="sheet")close()};
$("#cartBar").onclick=renderCart;

function renderCart(){
  const t=totals();
  if(!t.n){open("<p>Your cart is empty.</p>","Your cart");return}
  const rows=Object.entries(cart).map(([id,q])=>`<div class="row"><div>${ALL[id].e} ${esc(ALL[id].n)}<br><small>${naira(ALL[id].p)}</small></div>
    <div class="qty"><button data-a="-" data-id="${id}">−</button><b>${q}</b><button data-a="+" data-id="${id}">+</button></div></div>`).join("");
  open(`${rows}
  <div class="sum"><div class="row" style="border:0;padding:0"><span>Subtotal</span><span>${naira(t.sub)}</span></div>
  ${t.fee?`<div class="row" style="border:0;padding:0"><span>Fee</span><span>${naira(t.fee)}</span></div>`:""}
  <div class="row t" style="border:0;padding:0"><span>Total</span><span>${naira(t.total)}</span></div></div>
  <div class="form">
    <input id="fName" placeholder="Your name" autocomplete="name" value="${esc(profile.name)}">
    <input id="fPhone" placeholder="Phone number" inputmode="tel" autocomplete="tel" value="${esc(profile.phone)}">
    <textarea id="fNote" rows="2" placeholder="Notes (e.g. no pepper)">${esc(profile.note)}</textarea>
  </div>
  <p><small>Pickup: <b>${esc($("#pickupPoint").value)}</b>, ${esc($("#pickupTime").value||"—")}. Pay at pickup.</small></p>
  <button class="primary" id="place">Place pre-order</button>`,"Your cart");
  $("#place").onclick=place;
}
function place(){
  const name=$("#fName").value.trim(),phone=$("#fPhone").value.trim();
  if(!name||!/^[+\d][\d\s-]{6,}$/.test(phone))return toast("Enter your name and a valid phone number");
  if(!$("#pickupTime").value)return toast("We're closed for today");
  profile={name,phone,note:$("#fNote").value.trim()};save("nb-profile",profile);
  const t=totals();
  const order={id:"NB"+Date.now().toString(36).toUpperCase().slice(-6),at:new Date().toISOString(),
    point:$("#pickupPoint").value,time:$("#pickupTime").value,name,phone,note:profile.note,total:t.total,
    lines:Object.entries(cart).map(([id,q])=>({n:ALL[id].n,q,p:ALL[id].p}))};
  orders.unshift(order);save("nb-orders",orders.slice(0,30));
  cart={};save("nb-cart",cart);MENU.forEach(c=>c.items.forEach(i=>ctl(i.id)));
  confirmView(order);
}
function msg(o){
  return `*New pre-order ${o.id}*\n`+o.lines.map(l=>`${l.q} x ${l.n}`).join("\n")+
    `\n*Total:* ${naira(o.total)}\n*Pickup:* ${o.point}, ${o.time}\n*Name:* ${o.name}\n*Phone:* ${o.phone}`+(o.note?`\n*Note:* ${o.note}`:"");
}
function confirmView(o){
  const url=`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg(o))}`;
  open(`<p>✅ Order <b>${o.id}</b> saved. Send it to the kitchen on WhatsApp to confirm.</p>
  <p>${esc(o.point)} · ${esc(o.time)} · <b>${naira(o.total)}</b></p>
  <a href="${url}" target="_blank" rel="noopener"><button class="alt">Send via WhatsApp</button></a>`,"Order placed");
}
$("#ordersBtn").onclick=()=>{
  open(orders.length?orders.map(o=>`<div class="row"><div><b>${o.id}</b> <span class="badge">${new Date(o.at).toLocaleDateString("en-NG")}</span><br>
    <small>${o.lines.map(l=>l.q+"× "+esc(l.n)).join(", ")}</small><br><small>${esc(o.point)} · ${esc(o.time)}</small></div><b>${naira(o.total)}</b></div>`).join(""):"<p>No orders yet.</p>","My orders");
};

initPickup();renderMenu();bar();
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
