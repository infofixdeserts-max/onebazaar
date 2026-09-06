/* OneBazaar app - offline-first. Works on GitHub Pages with no backend.
   Optional live sync: Settings -> API URL points at your OMEN server.py. */
window.OB = (function(){
'use strict';
var CFG = window.OB_CONFIG || {};
var BASE_CATS = ["vehicles","electronics","home","jobs","services","rentals","digital","fashion","free","other"];
function customCats(){ return ls("ob_custom_cats") || []; }
function allCats(){
  var seen = {}, out = BASE_CATS.slice(), i;
  for (i = 0; i < out.length; i++) seen[out[i]] = 1;
  customCats().forEach(function(c){ if (c && !seen[c]){ seen[c] = 1; out.push(c); } });
  listings().forEach(function(l){ if (l.category && !seen[l.category]){ seen[l.category] = 1; out.push(l.category); } });
  return out;
}
function slugCat(s){
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}
var ZIPS = {"34994":[27.19,-80.25],"34997":[27.25,-80.22],"34990":[27.17,-80.28],
  "33130":[25.76,-80.19],"32801":[28.54,-81.38],"34996":[27.10,-80.22]};
var HOUSE_ADS = [
  "OneBazaar Premium removes all ads for $2/mo.",
  "Selling? Wanted ads match you with sellers automatically. Post a want ad free.",
  "Tip: listings with specs sell 3x faster. Use autofill when posting."
];
var S = { kind:"all", cat:"all", cur:0, editId:0, tpl:[], tplCache:[], adIdx:0, remotePrem:false };

/* ---------- utils ---------- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function toast(m){ var t = document.createElement("div"); t.className = "toast";
  t.textContent = m; $("toasts").appendChild(t); setTimeout(function(){ t.remove(); }, 3200); }
function ls(k, v){ if (v === undefined){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }
  localStorage.setItem(k, JSON.stringify(v)); return v; }
function apiBase(){ return (ls("ob_api") || CFG.API_BASE || "").replace(/\/$/, ""); }
function hav(a,b,c,d){ var R=6371, p1=a*Math.PI/180, p2=c*Math.PI/180,
  dp=(c-a)*Math.PI/180, dl=(d-b)*Math.PI/180,
  h=Math.sin(dp/2)*Math.sin(dp/2)+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)*Math.sin(dl/2);
  return 2*R*Math.asin(Math.sqrt(h)); }

/* ---------- theme ---------- */
function initTheme(){
  var t = ls("ob_theme");
  if (!t) t = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
}
function toggleTheme(){
  var t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t); ls("ob_theme", t);
}

/* ---------- local store (demo mode) ---------- */
function listings(){ return ls("ob_listings") || []; }
function saveListings(l){ ls("ob_listings", l); }
function myName(){ return ls("ob_user") || ""; }
function isPremium(){ return !!ls("ob_premium_" + myName()); }
function userRec(n){
  var us = ls("ob_users") || [];
  for (var i=0;i<us.length;i++) if (us[i].username === n) return us[i];
  return null;
}
function karma(n){
  var rs = ls("ob_ratings") || [], mine = rs.filter(function(r){ return r.to_user === n; });
  if (!mine.length) return { avg:0, count:0 };
  var s = mine.reduce(function(a,r){ return a + r.stars; }, 0);
  return { avg: Math.round(s/mine.length*100)/100, count: mine.length };
}
async function seedIfEmpty(){
  if (listings().length) return;
  try {
    var r = await fetch("demo-seed.json"); var d = await r.json();
    var l = (d.listings||[]).map(function(x,i){ x.id = i+1; return x; });
    saveListings(l);
    ls("ob_users", (d.users||[]).map(function(u){ return {username:u.username, premium:!!u.premium}; }));
    ls("ob_ratings", [
      {to_user:"maya",from_user:"tom",stars:5,text:"Fast replies, item exactly as described."},
      {to_user:"maya",from_user:"priya",stars:5,text:"Great seller, easy pickup."},
      {to_user:"maya",from_user:"gus",stars:5,text:"Trustworthy, would buy again."},
      {to_user:"maya",from_user:"tom",stars:4,text:"Good, slow to reply once."},
      {to_user:"tom",from_user:"maya",stars:5,text:"Paid cash, no hassle."}]);
    ls("ob_offers", [{listing_id:1,from_user:"tom",amount:15800,message:"Cash today, can meet in Stuart."}]);
    ls("ob_tickets", []);
  } catch(e){ /* offline first run, ignore */ }
}

/* ---------- remote (OMEN live server) ---------- */
async function remote(m, path, body){
  var h = {"Content-Type":"application/json"};
  var t = ls("ob_token"); if (t) h["Authorization"] = "Bearer " + t;
  var o = { method:m, headers:h };
  if (body !== undefined) o.body = JSON.stringify(body);
  var r = await fetch(apiBase() + path, o);
  var j = await r.json().catch(function(){ return {}; });
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}

/* ---------- unified data ops ---------- */
async function opList(){
  var q = $("q").value.trim(), mode = $("modeFilter").value;
  var zip = $("zip").value.trim(), mk = parseFloat($("maxkm").value) || 0;
  var ref = null;
  if (ZIPS[zip]) ref = ZIPS[zip];
  if (apiBase()){
    var p = new URLSearchParams({type:S.kind==="mine"?"all":S.kind, category:S.cat, q:q, mode:mode});
    if (ref){ p.set("lat",ref[0]); p.set("lng",ref[1]); }
    if (mk) p.set("max_km", mk);
    var j = await remote("GET","/api/listings?"+p.toString());
    var list = j.listings || [];
    if (S.kind === "mine" && myName()) list = list.filter(function(x){ return x.seller === myName(); });
    return list;
  }
  var out = listings();
  if (S.kind === "sell" || S.kind === "want") out = out.filter(function(x){ return x.kind === S.kind; });
  if (S.kind === "mine") out = out.filter(function(x){ return x.seller === myName(); });
  if (S.cat !== "all") out = out.filter(function(x){ return x.category === S.cat; });
  if (q){ var s=q.toLowerCase(); out = out.filter(function(x){
    return (x.title+" "+(x.description||"")).toLowerCase().indexOf(s) >= 0; }); }
  if (mode !== "any") out = out.filter(function(x){ return (x.modes||[]).indexOf(mode) >= 0; });
  out = out.map(function(x){
    x = Object.assign({}, x);
    if (ref && x.lat != null){ x.km = Math.round(hav(ref[0],ref[1],x.lat,x.lng)*10)/10; }
    return x;
  });
  if (ref && mk) out = out.filter(function(x){ return x.km == null || x.km <= mk; });
  out.sort(function(a,b){ return ((b.featured?1:0)-(a.featured?1:0)) || (b.id - a.id); });
  return out;
}
async function opGet(id){
  if (apiBase()){ var j = await remote("GET","/api/listings/"+id); return j.listing; }
  var l = listings(); for (var i=0;i<l.length;i++) if (l[i].id === id) return l[i];
  return null;
}
async function opMatches(id){
  var me = await opGet(id); if (!me) return {for:null, matches:[]};
  var pool = apiBase() ? (await remote("GET","/api/matches?listing_id="+id)).matches
    : listings().filter(function(x){ return x.kind !== me.kind; });
  if (apiBase()) return {for:me, matches:pool};
  var words = {};
  String(me.title).toLowerCase().split(/[^a-z0-9]+/).forEach(function(w){ if (w.length>2) words[w]=1; });
  var scored = pool.map(function(c){
    c = Object.assign({}, c);
    var sc = 0;
    if (c.category === me.category) sc += 30;
    var n = 0;
    String(c.title).toLowerCase().split(/[^a-z0-9]+/).forEach(function(w){ if (words[w]) n++; });
    sc += 10*n;
    if (me.price && c.price && Math.max(me.price,c.price)/Math.max(Math.min(me.price,c.price),1) <= 1.5) sc += 25;
    c.score = Math.round(sc*10)/10; return c;
  }).filter(function(c){ return c.score > 0; });
  scored.sort(function(a,b){ return b.score - a.score; });
  return {for:me, matches:scored.slice(0,10)};
}
async function opTemplates(q){
  if (apiBase()){ try { return (await remote("GET","/api/templates?q="+encodeURIComponent(q))).templates || []; } catch(e){} }
  if (!S.tpl.length){ try { S.tpl = await (await fetch("templates.json")).json(); } catch(e){ S.tpl = []; } }
  q = q.toLowerCase();
  return S.tpl.filter(function(t){ return (t.name+" "+t.category).toLowerCase().indexOf(q) >= 0; }).slice(0,12);
}

/* ---------- rendering ---------- */
function money(p){ return p > 0 ? "$" + Number(p).toLocaleString() : "FREE"; }
function card(l, i){
  var img = l.image_url ? '<img src="'+esc(l.image_url)+'" alt="" loading="lazy" onerror="this.remove()">' : "📦";
  var kc = l.kind === "want" ? "want" : (l.price === 0 ? "free" : "");
  var dist = (l.km != null) ? "<span>"+l.km+" km</span>" : "";
  return '<article class="card" style="animation-delay:'+Math.min(i*40,400)+'ms" onclick="OB.open('+l.id+')" tabindex="0" role="button" aria-label="'+esc(l.title)+'">'
    + '<div class="cardimg">'+img+'<span class="kbadge chip '+kc+'">'+(l.kind==="want"?"WANTED":esc(l.category))+"</span></div>"
    + '<div class="cardbody"><div class="price">'+esc(money(l.price))+'</div>'
    + '<div>'+esc(l.title)+"</div>"
    + '<div class="meta"><span>'+esc(l.condition||"")+"</span>"+dist+"<span>by "+esc(l.seller)+"</span></div></div></article>";
}
async function load(){
  var g = $("grid");
  g.innerHTML = Array(8).fill('<div class="skel"></div>').join("");
  try {
    var list = await opList();
    g.innerHTML = list.length ? list.map(card).join("")
      : "<p>No listings found. Be the first to post.</p>";
  } catch(e){ g.innerHTML = "<p>Could not load listings: "+esc(e.message)+"</p>"; }
  renderAds();
}
function renderAds(){
  var slot = $("adSlot");
  var prem = apiBase() ? (S.remotePrem || false) : isPremium();
  if (prem){ slot.hidden = true; return; }
  slot.hidden = false;
  if (CFG.ADSENSE_CLIENT){
    slot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="'+esc(CFG.ADSENSE_CLIENT)
      +'" data-ad-slot="auto" data-ad-format="auto"></ins> <button class="btn small" onclick="OB.openPremium()">Remove ads $2/mo</button>';
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch(e){}
    return;
  }
  S.adIdx = (S.adIdx + 1) % HOUSE_ADS.length;
  slot.innerHTML = "<span><b>Ad</b> · "+esc(HOUSE_ADS[S.adIdx])+'</span> <button class="btn small" onclick="OB.openPremium()">Remove $2/mo</button>';
}
function paintCats(){
  var cats = ["all"].concat(allCats());
  $("catRow").innerHTML = cats.map(function(x){
    return '<button class="catpill'+(x===S.cat?" active":"")+'" onclick="OB.setCat(\''+x+'\')">'+esc(x)+"</button>";
  }).join("");
}
function paintCatSelect(keep){
  var sel = $("p_cat"); if (!sel) return;
  var cur = (keep === undefined) ? sel.value : keep;
  sel.innerHTML = allCats().map(function(x){ return "<option>"+esc(x)+"</option>"; }).join("")
    + '<option value="__new">+ New category...</option>';
  if (cur && cur !== "__new" && allCats().indexOf(cur) >= 0) sel.value = cur;
}
function bindCat(){
  $("p_cat").addEventListener("change", function(){
    if ($("p_cat").value !== "__new") return;
    var raw = prompt("Name your new category (letters, numbers, dashes):");
    if (raw == null){ $("p_cat").value = allCats()[0]; return; }
    var slug = slugCat(raw);
    if (!slug){ $("p_cat").value = allCats()[0]; toast("Invalid name"); return; }
    var cc = customCats();
    if (cc.indexOf(slug) < 0){ cc.push(slug); ls("ob_custom_cats", cc); }
    paintCats(); paintCatSelect(slug);
    toast("Category added: " + slug);
  });
}
function paintUser(){
  var el = $("userMenu"), n = myName();
  if (!n){ el.innerHTML = '<button class="btn" onclick="OB.openAuth()">Log in</button>'; return; }
  var prem = apiBase() ? S.remotePrem : isPremium();
  el.innerHTML = '<button class="btn small" onclick="OB.openYou()">'+esc(n)+(prem?" ★":"")+"</button>";
}

/* ---------- detail ---------- */
async function open(id, push){
  var l = await opGet(id); if (!l){ toast("Listing not found"); return; }
  S.cur = l.id;
  var k = karma(l.seller);
  var stars = k.count ? '<span class="stars">★ '+k.avg+"</span> ("+k.count+" reviews)" : "No reviews yet";
  var specs = Object.keys(l.specs||{}).map(function(k2){
    return "<tr><td>"+esc(k2)+"</td><td>"+esc(l.specs[k2])+"</td></tr>"; }).join("")
    || '<tr><td colspan="2">No specs listed</td></tr>';
  var matchHtml = "";
  if (l.kind === "want"){
    try {
      var m = await opMatches(l.id);
      matchHtml = "<h3>Possible matches ("+m.matches.length+")</h3>" + (m.matches.map(function(x){
        return '<div class="matchcard" onclick="OB.open('+x.id+')"><b>'+esc(money(x.price))+"</b> "+esc(x.title)
          + (x.score != null ? ' <span class="chip">score '+x.score+"</span>" : "") + "</div>";
      }).join("") || "<p class='mut'>No matches yet.</p>");
    } catch(e){}
  }
  var mine = myName() && myName() === l.seller;
  $("detailBody").innerHTML =
    '<div class="youhead"><h2>'+esc(l.title)+'</h2><button class="btn small" onclick="OB.close(\'detailModal\')">Close</button></div>'
    + '<div class="price">'+esc(money(l.price))+"</div>"
    + '<div class="meta"><span class="chip'+(l.kind==="want"?" want":"")+'">'+(l.kind==="want"?"WANTED":esc(l.category))+"</span>"
    + "<span>"+esc(l.condition||"")+"</span>"
    + (l.modes||[]).map(function(m){ return '<span class="chip">'+esc(m)+"</span>"; }).join("")
    + (l.km != null ? "<span>"+l.km+" km away</span>" : "") + "</div>"
    + (l.image_url ? '<img src="'+esc(l.image_url)+'" alt="" style="max-width:100%;border-radius:12px;margin:10px 0" onerror="this.remove()">' : "")
    + "<p>"+esc(l.description||"")+"</p>"
    + "<h3>Specs</h3><table class='specs'>"+specs+"</table>"
    + '<div class="sellerbox"><b>Seller: <a href="#" onclick="OB.profile(\''+esc(l.seller)+'\');return false">'+esc(l.seller)+"</a></b><br>"+stars
    + '<div class="offerrow"><input id="rateStars" type="number" min="1" max="5" placeholder="Stars 1-5" style="width:110px" aria-label="Stars">'
    + '<input id="rateText" placeholder="Write a review" style="flex:1;min-width:140px" aria-label="Review text">'
    + '<button class="btn small" onclick="OB.rate(\''+esc(l.seller)+"')\">Review</button></div></div>"
    + (mine ? '<div class="offerrow"><button class="btn small" onclick="OB.edit('+l.id+')">Edit</button>'
      + (l.featured ? '<span class="chip">FEATURED ★</span>'
        : '<button class="btn small" onclick="OB.feature('+l.id+')">Feature $1</button>')
      + '<button class="btn danger small" onclick="OB.del('+l.id+')">Delete</button></div>'
      + '<div class="offerrow"><button class="btn small" onclick="OB.share('+l.id+')">Share / copy link</button></div>'
      : '<div class="offerrow"><input id="offAmt" type="number" placeholder="Offer $" style="width:120px" aria-label="Offer amount">'
      + '<input id="offMsg" placeholder="Message" style="flex:1;min-width:140px" aria-label="Offer message">'
      + '<button class="btn primary small" onclick="OB.offer('+l.id+')">Send offer</button></div>'
      + '<div class="offerrow"><button class="btn small" onclick="OB.share('+l.id+')">Share / copy link</button></div>')
    + matchHtml;
  try { document.title = l.title + " - " + money(l.price) + " | OneBazaar"; } catch(e){}
  $("detailModal").classList.remove("hidden");
  if (push !== false){
    try {
      var u = new URL(location.href); u.searchParams.set("id", l.id);
      history.replaceState(null, "", u.toString());
    } catch(e){}
  }
}
async function profile(name){
  var list = apiBase() ? (await remote("GET","/api/users/"+encodeURIComponent(name))).user
    : (function(){
        var u = userRec(name) || {username:name, premium:!!ls("ob_premium_"+name)};
        var k = karma(name);
        return {username:u.username, premium:u.premium, karma:k.avg, ratings:k.count,
          listings: listings().filter(function(x){ return x.seller === name; }),
          reviews: (ls("ob_ratings")||[]).filter(function(r){ return r.to_user === name; })}; })();
  var stars = list.karma ? '<span class="stars">★ '+list.karma+"</span> from "+list.ratings+" reviews" : "No reviews yet";
  $("detailBody").innerHTML =
    '<div class="youhead"><h2>'+esc(list.username)+(list.premium?" ★":"")+'</h2><button class="btn small" onclick="OB.close(\'detailModal\')">Close</button></div>'
    + "<p>"+stars+"</p><h3>Listings ("+(list.listings||[]).length+")</h3>"
    + ((list.listings||[]).map(function(x){
        return '<div class="matchcard" onclick="OB.open('+x.id+')"><b>'+esc(money(x.price))+"</b> "+esc(x.title)+"</div>"; }).join("") || "<p class='mut'>None.</p>")
    + "<h3>Reviews</h3>" + (((list.reviews||[]).map(function(r){
        return '<div class="matchcard">★'+r.stars+" <b>"+esc(r.from_user)+"</b>: "+esc(r.text||"")+"</div>"; }).join("")) || "<p class='mut'>No reviews yet.</p>");
  $("detailModal").classList.remove("hidden");
}

/* ---------- offers / ratings / delete ---------- */
async function offer(id){
  if (!myName()) return openAuth();
  var amt = parseFloat($("offAmt").value);
  if (!amt) return toast("Enter an offer amount");
  var msg = $("offMsg").value;
  if (apiBase()) await remote("POST","/api/offers",{listing_id:id, amount:amt, message:msg});
  else { var o = ls("ob_offers")||[]; o.push({listing_id:id, from_user:myName(), amount:amt, message:msg}); ls("ob_offers", o); }
  toast("Offer sent");
}
async function rate(who){
  if (!myName()) return openAuth();
  var st = parseInt($("rateStars").value, 10), tx = $("rateText").value;
  if (!st || st < 1 || st > 5) return toast("Stars must be 1-5");
  if (who === myName()) return toast("You cannot review yourself");
  if (apiBase()) await remote("POST","/api/ratings",{to_user:who, stars:st, text:tx});
  else { var r = ls("ob_ratings")||[]; r.push({to_user:who, from_user:myName(), stars:st, text:tx}); ls("ob_ratings", r); }
  toast("Review posted");
  if (S.cur) open(S.cur, false); else load();
}
async function del(id){
  if (!confirm("Delete this listing?")) return;
  if (apiBase()) await remote("DELETE","/api/listings/"+id);
  else saveListings(listings().filter(function(x){ return x.id !== id; }));
  close("detailModal"); load(); toast("Deleted");
}

/* ---------- post ---------- */
function openPost(){
  if (!myName()) return openAuth();
  S.editId = 0; $("postTitle").textContent = "Post a listing";
  paintCatSelect("");
  ["p_title","p_price","p_zip","p_img","p_desc"].forEach(function(i){ $(i).value = ""; });
  $("p_kind").value = "sell"; $("p_cond").value = "new";
  $("m_local").checked = true; $("m_ship").checked = false; $("m_online").checked = false;
  $("specFields").innerHTML = ""; $("suggest").innerHTML = "";
  $("postModal").classList.remove("hidden");
}
async function edit(id){
  var l = null;
  try { l = await opGet(id); } catch(e){ return toast(e.message); }
  if (!l) return toast("Listing not found");
  if (l.seller !== myName()) return toast("Only the owner can edit this");
  S.editId = id; $("postTitle").textContent = "Edit listing";
  $("p_kind").value = l.kind; paintCats(); paintCatSelect();
  $("p_cat").value = allCats().indexOf(l.category) >= 0 ? l.category : allCats()[0];
  $("p_title").value = l.title || ""; $("p_price").value = l.price || "";
  $("p_cond").value = l.condition || "any"; $("p_zip").value = l.zip || "";
  $("p_img").value = l.image_url || "";
  var modes = l.modes || [];
  $("m_local").checked = modes.indexOf("local") >= 0;
  $("m_ship").checked = modes.indexOf("shipping") >= 0;
  $("m_online").checked = modes.indexOf("online") >= 0;
  $("specFields").innerHTML = ""; $("suggest").innerHTML = "";
  Object.keys(l.specs || {}).forEach(function(k){ addSpecRow(k, l.specs[k]); });
  $("p_desc").value = l.description || "";
  close("detailModal");
  $("postModal").classList.remove("hidden");
}
function addSpecRow(k, v){
  var d = document.createElement("div"); d.className = "specrow";
  var i1 = document.createElement("input"); i1.placeholder = "Spec name"; i1.value = k||"";
  var i2 = document.createElement("input"); i2.placeholder = "Value"; i2.value = v||"";
  var b = document.createElement("button"); b.className = "btn small"; b.textContent = "Remove";
  b.onclick = function(){ d.remove(); };
  d.appendChild(i1); d.appendChild(i2); d.appendChild(b);
  $("specFields").appendChild(d);
}
function clearSpecs(){ $("specFields").innerHTML = ""; }
var sugT = null;
function bindTitle(){
  $("p_title").addEventListener("input", function(){
    clearTimeout(sugT);
    sugT = setTimeout(async function(){
      var q = $("p_title").value.trim(), box = $("suggest");
      if (q.length < 2){ box.innerHTML = ""; return; }
      try {
        S.tplCache = await opTemplates(q);
        box.innerHTML = S.tplCache.map(function(t,i){
          return "<div data-i='"+i+"'>"+esc(t.name)+' <span class="chip">'+esc(t.category)+"</span></div>"; }).join("");
        box.querySelectorAll("div").forEach(function(d){
          d.onclick = function(){ applyTpl(+d.dataset.i); }; });
      } catch(e){}
    }, 250);
  });
}
function applyTpl(i){
  var t = S.tplCache[i]; if (!t) return;
  $("suggest").innerHTML = "";
  $("p_cat").value = t.category;
  $("specFields").innerHTML = "";
  Object.keys(t.specs||{}).forEach(function(k){ addSpecRow(k, t.specs[k]); });
  toast("Specs filled from " + t.name);
}
async function submitPost(){
  var specs = {};
  document.querySelectorAll("#specFields .specrow").forEach(function(r){
    var k = r.children[0].value.trim(), v = r.children[1].value.trim();
    if (k) specs[k] = v;
  });
  var modes = [];
  if ($("m_local").checked) modes.push("local");
  if ($("m_ship").checked) modes.push("shipping");
  if ($("m_online").checked) modes.push("online");
  var zip = $("p_zip").value.trim(), lat = null, lng = null;
  if (ZIPS[zip]){ lat = ZIPS[zip][0]; lng = ZIPS[zip][1]; }
  var cat = $("p_cat").value;
  if (cat === "__new") return toast("Pick + New category first to create it");
  var payload = { kind:$("p_kind").value, category:cat,
    title:$("p_title").value.trim(), price:parseFloat($("p_price").value)||0,
    condition:$("p_cond").value, zip:zip, lat:lat, lng:lng, modes:modes.length?modes:["local"],
    image_url:$("p_img").value.trim(), description:$("p_desc").value.trim(), specs:specs };
  if (!payload.title) return toast("Title required");
  try {
    if (S.editId){
      if (apiBase()){ await remote("PUT","/api/listings/" + S.editId, payload); }
      else {
        var el2 = listings(), done = false;
        for (var e2 = 0; e2 < el2.length; e2++){
          if (el2[e2].id === S.editId && el2[e2].seller === myName()){
            var keep = { id:el2[e2].id, seller:el2[e2].seller, featured:el2[e2].featured };
            el2[e2] = Object.assign(keep, payload); done = true;
          }
        }
        if (!done) throw new Error("Not yours");
        saveListings(el2);
      }
      S.editId = 0; close("postModal"); load(); toast("Saved"); return;
    }
    if (apiBase()){ await remote("POST","/api/listings", Object.assign({seller:myName()}, payload)); }
    else {
      var l = listings();
      var nid = l.reduce(function(m,x){ return Math.max(m,x.id||0); }, 0) + 1;
      l.push(Object.assign({id:nid, seller:myName()}, payload));
      saveListings(l);
      var us = ls("ob_users")||[];
      if (!us.some(function(u){ return u.username === myName(); })){ us.push({username:myName(), premium:false}); ls("ob_users", us); }
    }
    close("postModal"); load(); toast("Published");
  } catch(e){ toast(e.message); }
}

/* ---------- auth / you / support / premium / settings ---------- */
function openAuth(){ $("authModal").classList.remove("hidden"); }
async function doAuth(){
  var u = $("a_user").value.trim();
  var pw = $("a_pass") ? $("a_pass").value : "";
  if (!u) return toast("Enter a username");
  if (apiBase()){
    if (!pw) return toast("Password required by the live server");
    try { var j = await remote("POST","/api/register",{username:u, password:pw}); }
    catch(e){ j = await remote("POST","/api/login",{username:u, password:pw}); }
    ls("ob_token", j.token); S.remotePrem = !!(j.user && j.user.premium);
  }
  ls("ob_user", u);
  var users = ls("ob_users")||[];
  if (!users.some(function(x){ return x.username === u; })){ users.push({username:u, premium:false}); ls("ob_users", users); }
  close("authModal"); paintUser(); load(); renderAds(); toast("Welcome, " + u);
}
function logout(){ ["ob_user","ob_token"].forEach(function(k){ localStorage.removeItem(k); });
  S.remotePrem = false; paintUser(); load(); renderAds(); toast("Logged out"); }
function openYou(){
  var n = myName(); if (!n) return openAuth();
  $("youName").textContent = n;
  var k = karma(n);
  var mine = listings().filter(function(x){ return x.seller === n; });
  var prem = apiBase() ? S.remotePrem : isPremium();
  $("youBody").innerHTML =
    "<p class='mut'>"+(k.count ? "★ "+k.avg+" from "+k.count+" reviews" : "No reviews yet")
    + (prem ? " · <b>Premium ★</b>" : "") + (apiBase() ? " · connected to live server" : " · on this device") + "</p>"
    + "<h3>Your listings ("+mine.length+")</h3>"
    + (mine.map(function(x){ return '<div class="matchcard" onclick="OB.open('+x.id+')"><b>'+esc(money(x.price))+"</b> "+esc(x.title)+"</div>"; }).join("") || "<p class='mut'>Nothing posted yet.</p>")
    + "<h3>Settings</h3><p class='mut'>Live server API URL (empty = this device only):</p>"
    + '<div class="offerrow"><input id="apiUrl" placeholder="https://... or http://192.168.x.x:8895" style="flex:1;min-width:200px" value="'+esc(apiBase())+'">'
    + '<button class="btn small" onclick="OB.saveApi()">Save</button></div>'
    + '<button class="btn small" onclick="OB.openPremium()">Premium $2/mo</button>'
      + '<button class="btn small" onclick="OB.manageCats()">Categories</button>'
      + '<button class="btn small" onclick="OB.invite()">Invite friends</button>'
      + '<button class="btn small" onclick="OB.openSupport()">Support</button>'
      + '<button class="btn small" onclick="OB.logout()">Log out</button></div>';
  $("youModal").classList.remove("hidden");
}
function saveApi(){
  var v = $("apiUrl").value.trim();
  if (v) ls("ob_api", v); else localStorage.removeItem("ob_api");
  close("youModal"); paintUser(); load(); toast(v ? "Live server connected" : "Back on this device");
}
async function feature(id){
  if (!myName()) return openAuth();
  var l = null;
  try { l = await opGet(id); } catch(e){ return toast(e.message); }
  if (!l || l.seller !== myName()) return toast("Only the owner can feature this");
  if (l.featured){ toast("Already featured"); return; }
  if (apiBase()){
    if (CFG.FEATURE_LINK && !confirm("Feature for $1? You will pay with Stripe, then return here.")) return;
    try {
      if (CFG.FEATURE_LINK){ location.href = payJoin(CFG.FEATURE_LINK, "client_reference_id=listing-" + id); return; }
      await remote("POST","/api/feature",{listing_id:id});
      toast("Featured ★"); load(); if (S.cur) open(S.cur, false); return;
    } catch(e){ toast(e.message); return; }
  }
  if (CFG.FEATURE_LINK){ location.href = payJoin(CFG.FEATURE_LINK, "client_reference_id=listing-" + id); return; }
  if (!confirm("Feature this listing for $1? (demo: no charge. Set FEATURE_LINK in config.js for real payments.)")) return;
  var fl2 = listings();
  for (var i = 0; i < fl2.length; i++) if (fl2[i].id === id) fl2[i].featured = true;
  saveListings(fl2); load(); if (S.cur) open(S.cur, false); toast("Featured ★");
}
async function handlePaid(qp){
  var paid = null;
  try { paid = qp.get("paid"); } catch(e){ return; }
  if (!paid) return;
  var clean = function(){
    try {
      var u = new URL(location.href);
      u.searchParams.delete("paid"); u.searchParams.delete("listing");
      history.replaceState(null, "", u.toString());
    } catch(e){}
  };
  if (paid === "premium"){
    if (!apiBase() && myName()) ls("ob_premium_" + myName(), true);
    if (apiBase() && myName()){
      try {
        var j = await remote("GET","/api/users/" + encodeURIComponent(myName()));
        S.remotePrem = !!j.user.premium;
      } catch(e){}
    }
    paintUser(); renderAds(); clean();
    toast("Thanks! Premium status updated."); openPremium();
  } else if (paid === "feature"){
    var fl = 0;
    try { fl = parseInt(qp.get("listing") || "0", 10); } catch(e){}
    if (fl && !apiBase()){
      var hl = listings(), ok = false;
      for (var h = 0; h < hl.length; h++)
        if (hl[h].id === fl && hl[h].seller === myName()){ hl[h].featured = true; ok = true; }
      if (ok){ saveListings(hl); toast("Listing featured ★"); }
      else toast("Payment noted. Open your listing and tap Feature $1.");
    } else if (fl && apiBase()){
      try { await remote("POST","/api/feature",{listing_id:fl}); toast("Listing featured ★"); }
      catch(e){ toast("Payment noted: " + e.message); }
    }
    clean(); load();
  }
}
function payJoin(link, param){
  return link + (link.indexOf("?") >= 0 ? "&" : "?") + param;
}
async function openSupport(){
  $("supportModal").classList.remove("hidden"); loadTickets();
}
function manageCats(){
  var cc = customCats();
  var txt = cc.length ? cc.join(", ") : "(none yet)";
  var raw = prompt("Your custom categories: " + txt + "\n\nType a name to ADD, or -name to REMOVE. Cancel to close.", "");
  if (raw == null) return;
  raw = raw.trim();
  if (!raw) return;
  if (raw.charAt(0) === "-"){
    var gone = slugCat(raw.slice(1));
    var cc2 = customCats().filter(function(c){ return c !== gone; });
    ls("ob_custom_cats", cc2);
    if (S.cat === gone) S.cat = "all";
    paintCats(); paintCatSelect(""); load(); toast("Removed: " + gone); return;
  }
  var slug = slugCat(raw);
  if (!slug){ toast("Invalid name"); return; }
  var cc3 = customCats();
  if (cc3.indexOf(slug) < 0){ cc3.push(slug); ls("ob_custom_cats", cc3); }
  paintCats(); paintCatSelect(slug); load(); toast("Category added: " + slug);
}
function invite(){
  var link = shareLink(S.cur || 0).split("?")[0];
  var text = "Join me on OneBazaar - buy, sell, or post a want-ad free: " + link;
  if (navigator.share){
    navigator.share({ title:"OneBazaar", text:text, url:link }).catch(function(){});
    return;
  }
  try { navigator.clipboard.writeText(text); toast("Invite link copied - send it to a friend"); }
  catch(e){ prompt("Copy your invite link:", text); }
}
async function loadTickets(){
  var t = apiBase() ? (await remote("GET","/api/tickets")).tickets
    : (ls("ob_tickets")||[]).filter(function(x){ return x.user === myName(); });
  $("ticketList").innerHTML = t.length ? t.map(function(x){
    return '<div class="matchcard"><b>#'+x.id+" ["+esc(x.status||"open")+"]</b> "+esc(x.subject)
      +"<br>"+esc(x.body||"")+"</div>"; }).join("") : "<p class='mut'>No tickets.</p>";
}
async function submitTicket(){
  var s = $("t_subj").value.trim(), b = $("t_body").value.trim();
  if (!myName()) return openAuth();
  if (!s) return toast("Subject required");
  if (apiBase()) await remote("POST","/api/tickets",{subject:s, body:b});
  else { var t = ls("ob_tickets")||[]; t.push({id:Date.now(), user:myName(), subject:s, body:b, status:"open"}); ls("ob_tickets", t); }
  $("t_subj").value = ""; $("t_body").value = "";
  loadTickets(); toast("Ticket submitted");
}
function openPremium(){
  var prem = apiBase() ? S.remotePrem : isPremium();
  var area;
  if (prem){
    area = "<p>You are Premium ★. Ads are off.</p>"
      + '<button class="btn small" onclick="OB.togglePrem()">Turn off Premium</button>';
  } else if (CFG.STRIPE_LINK){
   area = '<a class="btn primary" href="'+esc(CFG.STRIPE_LINK)+'" target="_blank" rel="noopener">Pay $2/mo with Stripe</a> '
     + '<button class="btn small" onclick="OB.togglePrem()">I already paid</button>'
     + "<p class='mut'>After paying, return here and tap <b>I already paid</b>. Demo connects instantly; the live server flips on Stripe webhook or the toggle.</p>";
  } else {
    area = "<p class='mut'>Payments open soon. Flip the demo switch to preview ad-free mode.</p>"
      + '<button class="btn primary" onclick="OB.togglePrem()">Enable Premium demo</button>';
  }
  $("payArea").innerHTML = area;
  $("premiumModal").classList.remove("hidden");
}
async function togglePrem(){
  if (!myName()) return openAuth();
  if (apiBase()){ var j = await remote("POST","/api/premium/toggle"); S.remotePrem = !!j.user.premium; }
  else ls("ob_premium_" + myName(), !isPremium());
  paintUser(); renderAds(); openPremium();
  toast("Premium " + ((apiBase() ? S.remotePrem : isPremium()) ? "on: ads removed" : "off"));
}
function openSettings(){ openYou(); }

/* ---------- nav ---------- */
function setKind(k){ S.kind = k;
  document.querySelectorAll(".kindtab").forEach(function(b){ b.classList.toggle("active", b.dataset.kind === k); });
  markNav(k === "sell" ? "sell" : k === "want" ? "want" : "home"); load(); }
function setCat(c){ S.cat = c; paintCats(); load(); }
function markNav(n){ document.querySelectorAll(".bottomnav button").forEach(function(b){
  b.classList.toggle("active", b.dataset.nav === n); }); }
function goHome(){ S.kind = "all"; S.cat = "all"; $("q").value = "";
  document.querySelectorAll(".kindtab").forEach(function(b){ b.classList.toggle("active", b.dataset.kind === "all"); });
  paintCats(); markNav("home"); load(); }
function search(){ load(); }
function applyDist(){ load(); }
function close(id){
  $(id).classList.add("hidden");
  if (id === "detailModal"){
    S.cur = 0;
    try { document.title = "OneBazaar - Buy it. Sell it. Want it."; } catch(e){}
    try {
      var u = new URL(location.href); u.searchParams.delete("id");
      history.replaceState(null, "", u.toString());
    } catch(e){}
  }
}
function shareLink(id){
  try {
    var u = new URL(location.href); u.searchParams.set("id", id);
    return u.toString();
  } catch(e){ return location.href.split("?")[0] + "?id=" + id; }
}
async function share(id){
  var link = shareLink(id), l = null;
  try { l = await opGet(id); } catch(e){}
  var text = l ? (money(l.price) + " " + l.title + " on OneBazaar") : "OneBazaar listing";
  if (navigator.share){
    try { await navigator.share({ title:"OneBazaar", text:text, url:link }); return; }
    catch(e){ if (e && e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(link); toast("Link copied"); }
  catch(e){ prompt("Copy this link:", link); }
  if (l && apiBase()){
    try { await remote("POST","/api/shares",{listing_id:id}); } catch(e){}
  } else if (l){
    var c = ls("ob_shares") || {}; c[id] = (c[id] || 0) + 1; ls("ob_shares", c);
  }
}

/* ---------- boot ---------- */
async function boot(){
  initTheme(); paintCats(); paintCatSelect(""); bindTitle(); bindCat(); paintUser();
  var qp = new URLSearchParams(location.search);
  var q = qp.get("q");
  if (q) $("q").value = q;
  $("q").addEventListener("keydown", function(e){ if (e.key === "Enter") load(); });
  document.querySelectorAll(".modal").forEach(function(m){
    m.addEventListener("click", function(e){ if (e.target === m) m.classList.add("hidden"); }); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape")
    document.querySelectorAll(".modal").forEach(function(m){ m.classList.add("hidden"); }); });
  await seedIfEmpty(); load(); markNav("home");
  try { await handlePaid(qp); } catch(e){}
  var deep = 0;
  try { deep = parseInt(qp.get("id") || "0", 10); } catch(e){}
  if (deep){ try { await open(deep, false); } catch(e){} }
}
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();

return { load:load, open:open, profile:profile, offer:offer, rate:rate, del:del, edit:edit,
  openPost:openPost, addSpecRow:addSpecRow, clearSpecs:clearSpecs, submitPost:submitPost, share:share, feature:feature, invite:invite, manageCats:manageCats,
  openAuth:openAuth, doAuth:doAuth, logout:logout, openYou:openYou, saveApi:saveApi,
  openSupport:openSupport, submitTicket:submitTicket, openPremium:openPremium, togglePrem:togglePrem,
  openSettings:openSettings, setKind:setKind, setCat:setCat, goHome:goHome,
  search:search, applyDist:applyDist, close:close, toggleTheme:toggleTheme };
})();
