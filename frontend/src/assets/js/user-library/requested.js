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

async function loadRequestedPage() {
  const userId = getCurrentUserId();
  if (!userId) {
    renderMessage("Please log in to view requested books.");
    return;
  }

  renderMessage("Loading requested books...");

  try {
    const resourcesByAccession = await getResourcesByAccession();
    const borrowItems = await getBorrowItemsForUser(userId, resourcesByAccession);
    const requestedItems = borrowItems.filter((item) => item.status === "requested");

    renderBookCards(grid, requestedItems, {
      emptyMessage: "No requested books yet.",
      statusField: "status",
      dateField: "request_date",
    });
  } catch (error) {
    console.error("Failed to load requested books", error);
    renderMessage("Could not load requested books right now.");
  }
}

onAuthStateChanged(auth, () => {
  loadRequestedPage();
});
