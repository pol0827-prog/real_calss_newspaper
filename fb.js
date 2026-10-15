// 우리들 신문 — Firebase 연결 (로그인 + Firestore 저장)
// 신문 앱(app.js)은 window.fb 만 사용합니다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged,
  signInWithPopup, signInWithRedirect, signOut,
  browserLocalPersistence, setPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, updateDoc,
  collection, getDocs, query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const CFG = window.NEWS_CONFIG;
const app = initializeApp(CFG.firebase);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

const MAX_IMG = 950000;      // Firestore 문서 1MB 제한 아래로
const MAX_SUB_IMG = 850000;

let editorMode = false;      // 편집위원으로 확인된 경우만 저장
let currentLoaded = false;   // 불러오기 실패 시 덮어쓰기 방지
let lastSaved = null;
const imgCache = new Map();  // id -> dataURL
const uploaded = new Set();

// ── 사진: 큰 사진은 줄이고, 신문 데이터에서는 짧은 참조로 바꿔 저장 ──
function loadImage(src) {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => no(new Error("사진을 열지 못했습니다."));
    im.src = src;
  });
}

async function shrink(dataUrl, limit) {
  if (dataUrl.length <= limit) return dataUrl;
  const im = await loadImage(dataUrl);
  let side = Math.max(im.width, im.height);
  let q = 0.82;
  for (let i = 0; i < 8; i++) {
    side = Math.round(side * 0.8);
    const s = Math.min(1, side / Math.max(im.width, im.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(im.width * s));
    c.height = Math.max(1, Math.round(im.height * s));
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(im, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", q);
    if (out.length <= limit) return out;
    q = Math.max(0.6, q - 0.05);
  }
  throw new Error("사진이 너무 큽니다. 더 작은 사진을 넣어 주세요.");
}

async function hashId(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).slice(0, 16)
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

async function pack(obj) {
  const found = [];
  const json = JSON.stringify(obj, (k, v) => {
    if (typeof v === "string" && v.startsWith("data:image/")) { found.push(v); return "\u0000IMG" + (found.length - 1); }
    return v;
  });
  const ids = await Promise.all(found.map(async src => {
    const small = await shrink(src, MAX_IMG);
    const id = await hashId(small);
    if (!uploaded.has(id)) {
      const ref = doc(db, "images", id);
      if (!imgCache.has(id)) {
        const snap = await getDoc(ref);
        if (!snap.exists()) await setDoc(ref, { data: small, createdAt: serverTimestamp() });
      }
      uploaded.add(id);
      imgCache.set(id, small);
    }
    return id;
  }));
  return json.replace(/"\\u0000IMG(\d+)"/g, (_, n) => JSON.stringify("fsimg:" + ids[Number(n)]));
}

async function unpack(str) {
  const obj = JSON.parse(str);
  const need = new Set();
  JSON.stringify(obj, (k, v) => {
    if (typeof v === "string" && v.startsWith("fsimg:")) need.add(v.slice(6));
    return v;
  });
  await Promise.all([...need].filter(id => !imgCache.has(id)).map(async id => {
    try {
      const snap = await getDoc(doc(db, "images", id));
      if (snap.exists()) { imgCache.set(id, snap.data().data); uploaded.add(id); }
    } catch {}
  }));
  return JSON.parse(str, (k, v) =>
    typeof v === "string" && v.startsWith("fsimg:") ? (imgCache.get(v.slice(6)) ?? "") : v);
}

// ── 로그인 ──
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function myEmail() {
  return auth.currentUser?.email?.toLowerCase() ?? null;
}

async function signIn() {
  try {
    const r = await signInWithPopup(auth, provider);
    return r.user;
  } catch (e) {
    if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return null;
    if (e?.code === "auth/unauthorized-domain") {
      throw new Error("이 사이트 주소가 Firebase 로그인 허용 도메인에 없습니다. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 추가해 주세요.");
    }
    throw new Error("로그인하지 못했습니다. 다시 시도해 주세요.");
  }
}

// ── 계정 명단 (관리자 + 편집위원) ──
// accounts: [{ id, name, email, role: "admin" | "editor" }]
async function loadPublic() {
  try {
    const snap = await getDoc(doc(db, "config", "public"));
    return snap.exists() ? snap.data() : { registered: false };
  } catch {
    return { registered: true }; // 확인이 안 되면 안전하게 '등록됨'으로 취급
  }
}

async function loadAccounts() {
  // 결과: 계정 배열 — 등록된 계정이 아니면 null
  if (!myEmail()) return null;
  try {
    const snap = await getDoc(doc(db, "config", "members"));
    return snap.exists() ? (snap.data().accounts ?? []) : null;
  } catch {
    return null; // 권한 없음 = 등록된 계정 아님
  }
}

function membersData(accounts) {
  const clean = accounts.map(a => ({
    id: a.id, name: String(a.name).trim(), email: a.email.trim().toLowerCase(),
    role: a.role === "admin" ? "admin" : "editor"
  }));
  return {
    accounts: clean,
    adminEmails: clean.filter(a => a.role === "admin").map(a => a.email),
    editorEmails: clean.map(a => a.email),
    updatedAt: serverTimestamp(),
    updatedBy: myEmail()
  };
}

// 처음 사용: 로그인한 본인을 편집장(관리자)으로 등록
async function registerChief(name, id) {
  const email = myEmail();
  if (!email) throw new Error("먼저 구글 계정으로 로그인해 주세요.");
  const accounts = [{ id, name, email, role: "admin" }];
  const batch = writeBatch(db);
  batch.set(doc(db, "config", "members"), membersData(accounts));
  batch.set(doc(db, "config", "public"), { registered: true, chiefName: name.trim() });
  try {
    await batch.commit();
  } catch (e) {
    if (e?.code === "permission-denied") throw new Error("이미 편집장이 등록되어 있습니다. 편집장 선생님께 계정 등록을 부탁하세요.");
    throw e;
  }
  return accounts;
}

async function saveAccounts(accounts) {
  await setDoc(doc(db, "config", "members"), membersData(accounts));
}

// ── 지금 신문 ──
async function loadCurrent() {
  try {
    const snap = await getDoc(doc(db, "newspaper", "current"));
    currentLoaded = true;
    if (!snap.exists()) return null;
    const raw = snap.data().data;
    lastSaved = raw;
    const d = await unpack(raw);
    if (d?.version === 1 && Array.isArray(d.pages) && d.pages.length > 0) {
      d.marks ??= { school: "", class: "" };
      return d;
    }
    return null;
  } catch (e) {
    currentLoaded = false;
    throw e;
  }
}

async function saveCurrent(d) {
  if (!editorMode || !currentLoaded) return false;
  const packed = await pack(d);
  if (packed === lastSaved) return true;
  await setDoc(doc(db, "newspaper", "current"), {
    data: packed,
    updatedAt: serverTimestamp(),
    updatedBy: myEmail()
  });
  lastSaved = packed;
  return true;
}

// ── 지난 신문 ──
async function loadIssues() {
  const snap = await getDocs(query(collection(db, "issues"), orderBy("publishedAt", "desc")));
  const out = [];
  for (const s of snap.docs) {
    const v = s.data();
    try { out.push({ id: s.id, name: v.name, publishedAt: v.publishedAt, doc: await unpack(v.data) }); } catch {}
  }
  return out;
}

async function addIssue(issue) {
  const packed = await pack(issue.doc);
  if (packed.length > 1000000) throw new Error("신문이 너무 커서 발행하지 못했습니다. 면을 나누거나 사진 수를 줄여 주세요.");
  await setDoc(doc(db, "issues", issue.id), {
    name: issue.name, publishedAt: issue.publishedAt, data: packed, by: myEmail()
  });
}

// ── 받은 기사 ──
async function loadSubmissions() {
  const snap = await getDocs(query(collection(db, "submissions"), orderBy("createdAt", "desc")));
  return snap.docs.map(s => ({ ...s.data(), id: s.id }));
}

async function addSubmission(sub) {
  const data = { ...sub };
  delete data.id;
  if (data.image) data.image = await shrink(data.image, MAX_SUB_IMG);
  else delete data.image;
  await setDoc(doc(db, "submissions", sub.id), data);
  return { ...sub, image: data.image ?? "" };
}

window.fb = {
  maxAdmins: CFG.maxAdmins ?? 2,
  maxAccounts: CFG.maxAccounts ?? 12,
  onAuth: cb => onAuthStateChanged(auth, cb),
  signIn,
  signOut: () => signOut(auth),
  myEmail,
  setEditor: v => { editorMode = !!v; },
  authHeader: async () => {
    const u = auth.currentUser;
    return u ? { Authorization: "Bearer " + (await u.getIdToken()) } : {};
  },
  loadPublic, loadAccounts, registerChief, saveAccounts,
  loadCurrent, saveCurrent,
  loadIssues, addIssue,
  deleteIssue: id => deleteDoc(doc(db, "issues", id)),
  loadSubmissions, addSubmission,
  updateSubmission: (id, patch) => updateDoc(doc(db, "submissions", id), patch),
  deleteSubmission: id => deleteDoc(doc(db, "submissions", id))
};

// Firebase 준비가 끝난 뒤 신문 앱 실행
const s = document.createElement("script");
s.src = "app.js";
document.body.appendChild(s);
