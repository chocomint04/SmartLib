const admin = require("firebase-admin");
const fs = require("fs");
const csv = require("csv-parser");

const serviceAccount = require("../../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function uploadCSV() {
  const books = [];

  fs.createReadStream("catalog.csv")
    // trim headers and remove any BOM/whitespace that might be included in the CSV file
    .pipe(csv({
      mapHeaders: ({ header }) => header.trim()
    }))
    .on("data", (row) => {
      // Map fields from the provided catalog.csv structure and provide defaults
      // always fall back to an empty string before calling trim()
      const book = {
        collection: (row["collection"] || row.collection).trim(),
        call_number: (row["call_number"] || "").trim(),
        author: (row["author"] || "").trim(),
        title_of_material: (row["title_of_material"] || "").trim(),
        year: Number(row["year"]) || 0,
        isbn: (row["isbn"] || "").trim(),
        program: (row["program"] || "").trim(),
        accession_no: (row["accession_no"] || "").trim(),
        date_in_alma: row["date_in_alma"] || "",
        description: row["description"] || "",
        availability_status: "available"
      };
      books.push(book);
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