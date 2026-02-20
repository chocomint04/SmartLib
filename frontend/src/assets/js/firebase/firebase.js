// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-analytics.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDob4YBYRUnPxm9iJ07kU8BzXoIQXOyq5A",
    authDomain: "smartlib-14f29.firebaseapp.com",
    projectId: "smartlib-14f29",
    storageBucket: "smartlib-14f29.firebasestorage.app",
    messagingSenderId: "542658824452",
    appId: "1:542658824452:web:54192d813f9dce4d976851",
    measurementId: "G-9S1EJWM83W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
const db = getFirestore(app);
// export the initialized Firestore instance for page modules to use
export { db };