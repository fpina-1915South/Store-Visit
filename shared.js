/* 1915 South Store Visit: shared constants and CSV parsing (used by the app and the visit log) */
var STORES = [
  '1001 — Ashley Tallahassee','1002 — Ashley Thomasville','1003 — Ashley Albany','1004 — Ashley Macon',
  '1005 — Ashley Warner Robins','1006 — Ashley Dothan','1007 — Ashley Enterprise','1008 — Ashley Panama City',
  '1009 — Ashley Valdosta','1010 — Ashley Opelika','1011 — Ashley Columbus','1012 — Ashley Town Center',
  '1013 — Ashley North','1014 — Ashley Orange Park','1015 — Ashley Brunswick','1016 — Ashley Yulee',
  '1017 — Ashley St. Augustine','1018 — Ashley Outlet Regency','1101 — Ashley Mobile',"1102 — Ashley D'Iberville",
  '1103 — Ashley Spanish Fort','1104 — Ashley Pensacola','1105 — Ashley Crestview','1106 — Ashley Ft. Walton',
  '1107 — Ashley Outlet Pensacola','1201 — Ashley Greensboro','1202 — Ashley Winston Salem','1203 — Ashley Burlington',
  '1204 — Ashley Danville','1205 — Ashley Outlet Greensboro',
  '1301 — Ashley Baton Rouge','1302 — Ashley Lafayette','1303 — Ashley Gonzales','1304 — Ashley Harahan',
  '1305 — Ashley Houma','1306 — Ashley Lake Charles','1307 — Ashley Opelousas','1308 — Ashley Ponchatoula','1309 — Ashley Hattiesburg',
  '1310 — Ashley Flowood','1311 — Ashley Harvey'
];
function storeNum(label){ return String(label||'').split(' ')[0]; }

/* Report "segment" names that don't match a store name directly. Add more here if the upload says a name didn't match. */
var SEG_ALIASES = {
  'ft walton beach':'1106','fort walton beach':'1106','diberville':'1102','greensboro outlet':'1205',
  'pensacola outlet':'1107','regency outlet':'1018','outlet regency':'1018','winston-salem':'1202','jax north':'1013','jax orange park':'1014','jax town center':'1012'
};
/* Region and district rollups in the daily report (not stores) */
var ROLLUPS = ['east','central','west','big bend','capital & acadiana','crescent','fall line','golden isles','gulf coast','company','total','online','all stores','magnolia','st johns','the piedmont','piedmont','wiregrass'];

/* Daily report metric names → app keys */
var REPORT_METRICS = {
  spg:'Sales per Guest w. Cancellations', sph:'Sales per Hour', close:'Close Rate', tkt:'Avg Ticket w. Del.',
  apps:'Finance Apps to Traffic', fin:'Finance % of Sales', fino:'Finance % of Orders', bspg:'Bedding SPG',
  bed:'Bedding % of Sales', prot:'Protection % of Sales', patt:'Protection Attachment', del:'Delivery % of sales'
};

function normName(s){ return String(s||'').toLowerCase().replace(/ashley/g,'').replace(/[^a-z& ]/g,' ').replace(/\s+/g,' ').trim(); }
function matchStore(seg){
  const n=normName(seg); if(!n) return null;
  if(SEG_ALIASES[n]) return STORES.find(s=>storeNum(s)===SEG_ALIASES[n])||null;
  const exact=STORES.find(s=>normName(s.split('—')[1])===n); if(exact) return exact;
  return null;
}

/* RFC-4180-ish CSV parser (handles quotes, commas and newlines inside quotes) */
function parseCSV(text){
  const rows=[];let row=[],f='',q=false;text=String(text||'').replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else if(c==='"') q=true;
    else if(c===','){ row.push(f); f=''; }
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n') i++; row.push(f); rows.push(row); row=[]; f=''; }
    else f+=c; }
  if(f!==''||row.length){ row.push(f); rows.push(row); }
  return rows.filter(r=>r.length>1||r[0]!=='');
}
function num(x){ if(x==null||x==='') return null; const n=parseFloat(String(x).replace(/[$,%]/g,'')); return isNaN(n)?null:n; }

/* Daily analytics report CSV → {asOf, stores:{label:{d:{k:[value,budget]},w:{},m:{}}}, unmatched:[]} */
function parseDailyReport(text){
  const rows=parseCSV(text); if(!rows.length) throw new Error('The daily report file is empty.');
  const h=rows[0].map(x=>x.trim()); const ix=n=>h.indexOf(n);
  const need=['report_date','segment','metric','daily_ty','daily_budget','wtd_ty','wtd_budget','mtd_ty','mtd_budget'];
  const miss=need.filter(n=>ix(n)<0); if(miss.length) throw new Error("This doesn't look like the daily report CSV (missing "+miss.join(', ')+').');
  const inv={}; Object.entries(REPORT_METRICS).forEach(([k,v])=>inv[v.toLowerCase()]=k);
  const stores={}, unmatched=new Set(); let asOf=null;
  rows.slice(1).forEach(r=>{
    const seg=r[ix('segment')], met=(r[ix('metric')]||'').toLowerCase(); asOf=asOf||r[ix('report_date')];
    const label=matchStore(seg);
    if(!label){ if(seg&&!ROLLUPS.includes(normName(seg))) unmatched.add(seg); return; }
    const k=inv[met]; if(!k) return;
    const s=stores[label]=stores[label]||{d:{},w:{},m:{}};
    [['d','daily'],['w','wtd'],['m','mtd']].forEach(([p,pre])=>{ s[p][k]=[num(r[ix(pre+'_ty')]),num(r[ix(pre+'_budget')])]; });
  });
  return {asOf, stores, unmatched:[...unmatched].sort()};
}

/* Analytics consultant export → {from,to,cols,goal,rows:{Name:[...]}} */
function parseRSA(text, filename){
  const rows=parseCSV(text); if(!rows.length) throw new Error('The consultant file is empty.');
  const h=rows[0].map(x=>x.trim());
  if(h[0].toLowerCase()!=='sales associate') throw new Error("This doesn't look like the consultant export (first column should be Sales Associate).");
  const cols=h.slice(1); let goal=null; const out={};
  rows.slice(1).forEach(r=>{ const n=(r[0]||'').trim(); if(!n) return;
    if(n.toLowerCase()==='rsa goal'){ goal=r.slice(1); return; }
    const ns=num(r[1]); if(ns==null||ns<=0||n.toUpperCase()==='CONVERT USER') return;
    const name=n.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());
    out[name]=r.slice(1); });
  const m=/(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})/.exec(filename||'');
  return {from:m?m[1]:null,to:m?m[2]:null,cols,goal:goal||cols.map(()=>''),rows:out};
}
function mdate(iso){ if(!iso) return ''; const p=String(iso).split('-'); return (+p[1])+'/'+(+p[2]); }
function fmtDate(v){ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||''); return m?m[2]+'-'+m[3]+'-'+m[1]:(v||''); }
function escA(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

/* ── Visit content (edit wording here; the app and the visit log both read it) ── */
var ELEMENTS=[
 {n:1,t:'High Performing Sales Culture',q:'Is the leader building a team that runs the play?',segs:true,items:[
   'Team understands our selling structure: can explain the Core 4 and why it wins',
   'Furniture Consultant coaching & scorecards in use: 1:1 coaching happening, scorecards reviewed',
   'Role clarity & training discipline: a daily/weekly coaching rhythm is in place',
   'Performance coaching is happening on the floor']},
 {n:2,t:'Assortment',q:'Do we have what customers actually want?',items:[
   'Floor reflects what customers are actually buying',
   'Floor space maximized — heroes placed, no dead space',
   'Markdown/clearance strategy: right product, right time, right place',
   'Best sellers in stock and on the floor',
   'Accessories & attachments available to complete the sale']},
 {n:3,t:'Visual Presentation',q:'Is your store Grand-Opening Ready, every single day?',aorIntro:true,items:[]},
 {n:4,t:'Facilities',q:'Is the store clean, safe, and working?',items:[
   'All tech and TV equipment working',
   'Bathrooms spotless',
   'Backroom clean and safe',
   'Parking lot & signage clean and visible',
   'Lighting fully functional, storefront/windows clean']},
 {n:5,t:'Back Office Controls',q:'Are we managing the business behind the sale?',items:[
   'Order management — delivery dates managed and accurate',
   'Customer service — owning the guest experience',
   'Margin & discounting — protecting profitability',
   'VAMOO worked for open orders']},
 {n:6,t:'Inventory Control',q:'Are the controls tight and accurate?',items:[
   'Tight, accurate controls in place',
   'Shrink minimized through discipline',
   'Visual & operational alignment with what is on-hand',
   'Cycle counts current; damages/RTV processed']}
];

var AORS=['Front Entrance & Windows','Customer Service Desk & Greeter','Living Room / Upholstery','Bedroom','Mattress / Bedding Gallery',
  'Dining','Occasional / Accents / Accessories','Clearance / Outlet','Restrooms','Backroom / Warehouse'];

var SEGMENTS=[
 {name:'Value in Product',must:'What the guest must KNOW before they say yes',items:[
   'Consultant connected features to the guest\'s specific words',
   'Guest understood WHY — not just what',
   'Good / Better / Best presented — full range, never narrowed by assumed budget',
   'Started at Best and walked down gracefully — no pre-qualifying the guest']},
 {name:'Value in Experience',must:'What the guest must FEEL throughout',items:[
   'Greeting felt like a referral, not a transaction — guest\'s name used',
   'Guest was heard before any product was shown',
   'Guided, not sold — zero pressure, genuine care',
   'Guest felt like the only person in the store']},
 {name:'Value in Ashley Brand',must:'What the guest must BELIEVE when they leave',items:[
   'Ashley story told with conviction — believed, not memorized',
   'Guest understood why Ashley\'s size & scale means quality and value',
   'Brand tied naturally into the protection conversation',
   'Guest would send a friend here']}
];

var PRACTICE={q:'Run the play with this consultant, standing up. Score what you see.',items:[
   'Core 4 delivered in order: Connection, Finance, Bedding, Protected & Delivered',
   'Connection felt real, starting at the door',
   'Finance introduced early: buying power first',
   'Healthy-sleep (bedding) conversation included',
   'All 4 options presented as protected & delivered; closed with "which feels right?"',
   'Ashley story told with conviction'
]};


/* Directors: sign-in email -> name. The app fills in and locks the name from this list. */
var DIRECTORS={'fpina@1915south.com':'Frank Pina','ocruz@1915south.com':'Orlando Cruz','msevert@1915south.com':'Meagan Severt','ccarritz@1915south.com':'Cole Carritz','sdance@1915south.com':'Scott Dance','ebrickner@1915south.com':'Erika Brickner','kwilliams@1915south.com':'Kelsie Williams','jkeene@1915south.com':'Jonathan Keene','tdevlin@1915south.com':'Theresa Devlin'};
