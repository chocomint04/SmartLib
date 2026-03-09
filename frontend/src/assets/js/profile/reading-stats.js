// reading-stats.js
// Path: assets/js/profile/reading-stats.js

import { db, auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

function getMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const txSnap = await getDocs(
      query(
        collection(db, "borrowing_transactions"),
        where("user_id", "==", user.uid)
      )
    );

    let borrowed = 0;
    let dueSoon = 0;
    let totalReturned = 0;
    let overdue = 0;

    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const returnedDays = new Set();

    txSnap.forEach((d) => {
      const data = d.data();
      const status = String(data.status || "").toLowerCase();

      if (status === "borrowed") {
        borrowed++;
        if (data.due_date) {
          const dueMs = getMs(data.due_date);
          if (dueMs - now <= threeDays && dueMs > now) dueSoon++;
        }
      }
      if (status === "returned") {
        totalReturned++;
        if (data.return_date) {
          const ms = getMs(data.return_date);
          if (ms) returnedDays.add(new Date(ms).toDateString());
        }
      }
      if (status === "overdue") overdue++;
    });

    // Wishlist
    let wishlist = 0;
    try {
      const savedSnap = await getDocs(
        query(collection(db, "saved_resources"), where("user_id", "==", user.uid))
      );
      wishlist = savedSnap.size;
    } catch (_) {}

    const streak = returnedDays.size;

    document.getElementById("stat-borrowed").textContent = borrowed;
    document.getElementById("stat-wishlist").textContent = wishlist;
    document.getElementById("stat-due-soon").textContent = dueSoon;
    document.getElementById("stat-total-returned").textContent = totalReturned;
    document.getElementById("stat-overdue").textContent = overdue;
    document.getElementById("stat-streak").textContent = streak;

  } catch (err) {
    console.error("Error loading reading stats", err);
  }
});
