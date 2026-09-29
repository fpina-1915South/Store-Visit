/* Smart Scheduler Firebase project (shared; Store Visit data lives in sv_ collections) */
export const firebaseConfig = {
  apiKey: "AIzaSyDLeBfi4LrYtkXxS9fh9BPf40NcPIsIqQA",
  authDomain: "smart-scheduler-1915.firebaseapp.com",
  projectId: "smart-scheduler-1915",
  storageBucket: "smart-scheduler-1915.firebasestorage.app",
  messagingSenderId: "1678890298",
  appId: "1:1678890298:web:483e73dbcf5b7f7875ac03"
};
/* Only emails at this domain can sign in */
export const EMAIL_DOMAIN = "1915south.com";
/* Always a visit admin (matches OWNER in the Firestore rules) */
export const OWNER_EMAILS = ["fpina@1915south.com"];
/* Executive team: can see every visit (view only). Keep in sync with svExec() in the Firestore rules. */
export const EXEC_EMAILS = ["jwoods@1915south.com","bsmallwood@1915south.com","lodom@1915south.com","ahall@1915south.com","anohelty@1915south.com"];
