import { auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  getCurrentUserId,
  getResourcesByAccession,
  getSavedItemsForUser,
  getBorrowItemsForUser,
  renderBookCards,
} from "./common.js";

const PREVIEW_LIMIT = 5;

const savedGrid = document.querySelector("#savedPreviewGrid");
const requestedGrid = document.querySelector("#requestedPreviewGrid");
const borrowedGrid = document.querySelector("#borrowedPreviewGrid");
const historyGrid = document.querySelector("#historyPreviewGrid");

function renderLoadingState() {
  renderBookCards(savedGrid, [], { emptyMessage: "Loading saved books..." });
  renderBookCards(requestedGrid, [], { emptyMessage: "Loading requested books..." });
  renderBookCards(borrowedGrid, [], { emptyMessage: "Loading borrowed books..." });
  renderBookCards(historyGrid, [], { emptyMessage: "Loading borrow history..." });
}

function renderAuthRequiredState() {
  const message = "Please log in to view your library.";
  renderBookCards(savedGrid, [], { emptyMessage: message });
  renderBookCards(requestedGrid, [], { emptyMessage: message });
  renderBookCards(borrowedGrid, [], { emptyMessage: message });
  renderBookCards(historyGrid, [], { emptyMessage: message });
}

async function loadUserLibrary() {
  const userId = getCurrentUserId();
  if (!userId) {
    renderAuthRequiredState();
    return;
  }

  renderLoadingState();

  try {
    const resourcesByAccession = await getResourcesByAccession();
    const [savedItems, borrowItems] = await Promise.all([
      getSavedItemsForUser(userId, resourcesByAccession),
      getBorrowItemsForUser(userId, resourcesByAccession),
    ]);

    const requestedItems = borrowItems.filter((item) => item.status === "requested");
    const borrowedItems = borrowItems.filter((item) => item.status === "borrowed");

    renderBookCards(savedGrid, savedItems.slice(0, PREVIEW_LIMIT), {
      emptyMessage: "No saved books yet.",
      dateField: "saved_date",
    });

    renderBookCards(requestedGrid, requestedItems.slice(0, PREVIEW_LIMIT), {
      emptyMessage: "No requested books yet.",
      statusField: "status",
      dateField: "request_date",
    });

    renderBookCards(borrowedGrid, borrowedItems.slice(0, PREVIEW_LIMIT), {
      emptyMessage: "No borrowed books yet.",
      statusField: "status",
      dateField: "borrow_date",
    });

    renderBookCards(historyGrid, borrowItems.slice(0, PREVIEW_LIMIT), {
      emptyMessage: "No borrow history yet.",
      statusField: "status",
      dateField: "request_date",
    });
  } catch (error) {
    console.error("Failed to load user library", error);
    const message = "Could not load your library right now.";
    renderBookCards(savedGrid, [], { emptyMessage: message });
    renderBookCards(requestedGrid, [], { emptyMessage: message });
    renderBookCards(borrowedGrid, [], { emptyMessage: message });
    renderBookCards(historyGrid, [], { emptyMessage: message });
  }
}

onAuthStateChanged(auth, () => {
  loadUserLibrary();
});
