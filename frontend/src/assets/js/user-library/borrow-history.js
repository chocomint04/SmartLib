import { auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  getCurrentUserId,
  getResourcesByAccession,
  getBorrowItemsForUser,
  renderBookCards,
} from "./common.js";

const grid = document.querySelector("#libraryListGrid");

function renderMessage(message) {
  renderBookCards(grid, [], { emptyMessage: message });
}

async function loadBorrowHistoryPage() {
  const userId = getCurrentUserId();
  if (!userId) {
    renderMessage("Please log in to view borrow history.");
    return;
  }

  renderMessage("Loading borrow history...");

  try {
    const resourcesByAccession = await getResourcesByAccession();
    const borrowItems = await getBorrowItemsForUser(userId, resourcesByAccession);

    renderBookCards(grid, borrowItems, {
      emptyMessage: "No borrow history yet.",
      statusField: "status",
      dateField: "request_date",
    });
  } catch (error) {
    console.error("Failed to load borrow history", error);
    renderMessage("Could not load borrow history right now.");
  }
}

onAuthStateChanged(auth, () => {
  loadBorrowHistoryPage();
});
