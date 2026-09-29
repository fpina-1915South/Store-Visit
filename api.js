/* Store Visit data layer (Firebase, free Spark plan). All collections start with sv_ so they never touch the Smart Scheduler's data. */
import { firebaseConfig, EMAIL_DOMAIN, OWNER_EMAILS, EXEC_EMAILS } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut as fbSignOut,
  setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, collection, getDocs,
  query, where, orderBy, limit, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
setPersistence(auth, browserLocalPersistence).catch(()=>{});

const C = { visits:'sv_visits', last:'sv_storeLast', rosters:'sv_rosters', metrics:'sv_metrics', admins:'sv_admins', users:'sv_users' };
const EMAIL_KEY = 'sv_signin_email';
let ADMIN = false, EXEC = false;

/* Resolve a write, or report "queued" if the phone is offline (Firestore sends it when signal returns). */
function ackOrQueue(p, ms=7000){ return Promise.race([p.then(()=>'saved'), new Promise(r=>setTimeout(()=>r('queued'),ms))]); }
function okDomain(email){ return String(email||'').toLowerCase().endsWith('@'+EMAIL_DOMAIN); }

const API = {
  domain: EMAIL_DOMAIN,
  async sendLink(email){
    email=String(email||'').trim().toLowerCase();
    if(!okDomain(email)) throw new Error('Use your @'+EMAIL_DOMAIN+' email.');
    await sendSignInLinkToEmail(auth, email, { url: location.href.split('?')[0].split('#')[0], handleCodeInApp: true });
    try{ localStorage.setItem(EMAIL_KEY, email); }catch(e){}
  },
  async finishLinkIfPresent(askEmail){
    if(!isSignInWithEmailLink(auth, location.href)) return null;
    let email=null; try{ email=localStorage.getItem(EMAIL_KEY); }catch(e){}
    if(!email) email=await askEmail();
    if(!email) return null;
    const cred=await signInWithEmailLink(auth, email.trim().toLowerCase(), location.href);
    try{ localStorage.removeItem(EMAIL_KEY); }catch(e){}
    history.replaceState(null,'',location.pathname);
    return cred.user;
  },
  onUser(cb){
    onAuthStateChanged(auth, async user=>{
      if(!user){ ADMIN=false; cb(null,{}); return; }
      if(!okDomain(user.email)){ await fbSignOut(auth); cb(null,{error:'Only @'+EMAIL_DOMAIN+' emails can use this app.'}); return; }
      /* Signed in by password (e.g. from the Smart Scheduler) but not yet by email link: one-time link sign-in verifies the email. */
      if(!user.emailVerified){ ADMIN=false; EXEC=false; cb(null,{needsVerify:true,email:user.email}); return; }
      let profile={}; try{ const s=await getDoc(doc(db,C.users,user.uid)); profile=s.exists()?s.data():{}; }catch(e){}
      ADMIN = OWNER_EMAILS.includes(user.email.toLowerCase());
      if(!ADMIN){ try{ ADMIN=(await getDoc(doc(db,C.admins,user.email.toLowerCase()))).exists(); }catch(e){ ADMIN=false; } }
      EXEC = ADMIN || EXEC_EMAILS.includes(user.email.toLowerCase());
      cb({uid:user.uid,email:user.email}, {profile, isAdmin:ADMIN, isExec:EXEC});
    });
  },
  signOut(){ return fbSignOut(auth); },
  isAdmin(){ return ADMIN; },
  async setProfile(p){ const u=auth.currentUser; if(!u) return; await setDoc(doc(db,C.users,u.uid),{...p,email:u.email},{merge:true}); },

  async getMetrics(){
    const [a,b]=await Promise.all([getDoc(doc(db,C.metrics,'stores')),getDoc(doc(db,C.metrics,'rsa'))]);
    return { store: a.exists()?JSON.parse(a.data().json):null, rsa: b.exists()?JSON.parse(b.data().json):null,
             storeMeta: a.exists()?a.data():null, rsaMeta: b.exists()?b.data():null };
  },
  async putMetrics(kind, data){ /* kind: 'stores' | 'rsa'. Stored as JSON text so names with dots or slashes are safe. */
    await setDoc(doc(db,C.metrics,kind),{json:JSON.stringify(data),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.email});
  },
  async getRoster(num){ const s=await getDoc(doc(db,C.rosters,num)); return s.exists()?(s.data().names||[]):[]; },
  setRoster(num,names){ return ackOrQueue(setDoc(doc(db,C.rosters,num),{names,updatedAt:serverTimestamp()})); },
  async getLast(num){ const s=await getDoc(doc(db,C.last,num)); return s.exists()?s.data():null; },

  /* visit: plain object. photos: [{scope,key,data(base64 jpeg dataURL)}] */
  async submitVisit(visit, photos){
    const u=auth.currentUser; if(!u) throw new Error('Signed out. Sign in again and submit.');
    const ref=doc(collection(db,C.visits));
    const bytes=photos.reduce((a,p)=>a+p.data.length,0);
    const base={...visit, uid:u.uid, email:u.email, photoCount:photos.length, photoBytes:bytes, submittedAt:serverTimestamp()};
    const writes=[ setDoc(ref, base) ];
    photos.forEach((p,i)=>writes.push(setDoc(doc(db,C.visits,ref.id,'photos',String(i).padStart(3,'0')),{uid:u.uid,scope:p.scope,key:p.key,data:p.data})));
    const num=String(visit.header.store||'').split(' ')[0];
    if(num) writes.push(setDoc(doc(db,C.last,num),{visitId:ref.id,date:visit.header.vdate||'',director:visit.header.director||'',action:visit.action||[],email:u.email,at:serverTimestamp()}));
    const status=await ackOrQueue(Promise.all(writes), 9000);
    return { id:ref.id, status };
  },
  async listVisits(){
    const u=auth.currentUser;
    const q= EXEC ? query(collection(db,C.visits),orderBy('submittedAt','desc'),limit(1000))
                   : query(collection(db,C.visits),where('uid','==',u.uid));
    const s=await getDocs(q); return s.docs.map(d=>({id:d.id,...d.data(),submittedAt:d.data().submittedAt?.toDate?.()||null}));
  },
  async getPhotos(id){ const col=collection(db,C.visits,id,'photos'); const s=await getDocs(EXEC?col:query(col,where('uid','==',auth.currentUser.uid))); return s.docs.map(d=>({id:d.id,...d.data()})); },
  async clearPhotos(id){ const s=await getDocs(collection(db,C.visits,id,'photos')); await Promise.all(s.docs.map(d=>deleteDoc(d.ref)));
    await setDoc(doc(db,C.visits,id),{photoCount:0,photoBytes:0,photosClearedAt:serverTimestamp()},{merge:true}); }
};
window.API = API;
export default API;
