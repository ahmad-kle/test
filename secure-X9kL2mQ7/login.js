// Firebase Config
const firebaseConfig = window.TAQWA_CONFIG.firebase;
if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

const loginBtn = document.getElementById('loginButton');
const emailInput = document.getElementById('loginEmail');
const passInput = document.getElementById('loginPassword');
const errorDiv = document.getElementById('errorMsg');

loginBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const password = passInput.value;


  if (window.taqwaFirebaseConfigured && !window.taqwaFirebaseConfigured()) {
    errorDiv.innerText = 'يجب إعداد Firebase أولاً في الملف assets/js/taqwa-config.js';
    errorDiv.style.display = 'block';
    return;
  }
  if (!email || !password) {
    errorDiv.innerText = 'الرجاء إدخال البريد الإلكتروني وكلمة المرور';
    errorDiv.style.display = 'block';
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    // سيتم التوجيه عبر onAuthStateChanged
  } catch (err) {
    let msg =   'بيانات الدخول غير صحيحة' ;
    if (err.code === 'auth/user-not-found') msg = '❌ لا يوجد حساب بهذا البريد الإلكتروني';
    else if (err.code === 'auth/wrong-password') msg =  '❌بيانات الدخول غير صحيحة' ;
    else if (err.code === 'auth/invalid-email') msg = '❌بيانات الدخول غير صحيحة' ;
    else if (err.code === 'auth/too-many-requests') msg = '❌ تم تعطيل الحساب مؤقتاً بسبب كثرة المحاولات';
    errorDiv.innerText = msg;
    errorDiv.style.display = 'block';
  }
};

auth.onAuthStateChanged((user) => {
  if (user) {
    window.location.href = 'taqwa-panel-r7v4k2.html';
  }
});