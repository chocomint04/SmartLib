const admin = require("firebase-admin");
const fs = require("fs");
const csv = require("csv-parser");

const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function uploadCSV() {
  const books = [];

  fs.createReadStream("books_sample_10k.csv")
    .pipe(csv())
    .on("data", (row) => {
      books.push({
  title: row.title || "",
  author: row.author || "",
  category: row.category || "",
  publish_year: Number(row.publish_year) || 0,
  resource_id: row.resource_id || "",
  cover_url: row.cover_url || "",
  description: row.description || "",
  publisher: row.publisher || "",
  availability_status: "available"
});
    })
    .on("end", async () => {
      console.log(`Uploading ${books.length} books...`);

      const batchSize = 500;
      for (let i = 0; i < books.length; i += batchSize) {
        const batch = db.batch();
        const chunk = books.slice(i, i + batchSize);

        chunk.forEach((book) => {
          const docRef = db.collection("resources").doc();
          batch.set(docRef, book);
        });

        await batch.commit();
        console.log(`Uploaded batch ${i / batchSize + 1}`);
      }

      console.log("✅ All books uploaded successfully!");
      process.exit();
    });
}

uploadCSV();