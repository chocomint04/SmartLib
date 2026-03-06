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

async function loadBorrowedPage() {
  const userId = getCurrentUserId();
  if (!userId) {
    renderMessage("Please log in to view borrowed books.");
    return;
  }

  renderMessage("Loading borrowed books...");

  try {
    const resourcesByAccession = await getResourcesByAccession();
    const borrowItems = await getBorrowItemsForUser(userId, resourcesByAccession);
    const borrowedItems = borrowItems.filter((item) => item.status === "borrowed");

    renderBookCards(grid, borrowedItems, {
      emptyMessage: "No borrowed books yet.",
      statusField: "status",
      dateField: "borrow_date",
    });
  } catch (error) {
    console.error("Failed to load borrowed books", error);
    renderMessage("Could not load borrowed books right now.");
  }
}

onAuthStateChanged(auth, () => {
  loadBorrowedPage();
});
