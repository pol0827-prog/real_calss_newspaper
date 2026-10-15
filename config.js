// 우리들 신문 설정
window.NEWS_CONFIG = {
  firebase: {
    apiKey: "AIzaSyClhltg4bXMQrtG3dp-7gYVb5eVmz86j1A",
    authDomain: "real-calss-newspaper.firebaseapp.com",
    projectId: "real-calss-newspaper",
    storageBucket: "real-calss-newspaper.firebasestorage.app",
    messagingSenderId: "396281003508",
    appId: "1:396281003508:web:90b92474ee9f13a1d40da1"
  },
  // 관리자(편집장 포함) 최대 인원 — firestore.rules 의 adminEmails.size() <= 2 와 맞춰 주세요.
  maxAdmins: 2,
  // 관리자 포함 전체 계정 최대 인원 — firestore.rules 의 editorEmails.size() <= 12 와 맞춰 주세요.
  maxAccounts: 12
};
