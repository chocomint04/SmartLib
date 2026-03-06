import { auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  getCurrentUserId,
  getResourcesByAccession,
  getSavedItemsForUser,
  renderBookCards,
} from "./common.js";

const grid = document.querySelector("#libraryListGrid");

function renderMessage(message) {
  renderBookCards(grid, [], { emptyMessage: message });
}

async function loadSavedPage() {
  const userId = getCurrentUserId();
  if (!userId) {
    renderMessage("Please log in to view saved books.");
    return;
  }

  renderMessage("Loading saved books...");

  try {
    const resourcesByAccession = await getResourcesByAccession();
    const savedItems = await getSavedItemsForUser(userId, resourcesByAccession);

    renderBookCards(grid, savedItems, {
      emptyMessage: "No saved books yet.",
      dateField: "saved_date",
    });
  } catch (error) {
    console.error("Failed to load saved books", error);
    renderMessage("Could not load saved books right now.");
  }
}

onAuthStateChanged(auth, () => {
  loadSavedPage();
});
