const express = require("express");
const cors = require("cors");
const path = require("path");
const { spawnSync } = require("child_process");
const { PythonShell } = require("python-shell");
const admin = require("firebase-admin");

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (err) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not valid JSON: " + err.message);
  }
} else {
  // Falls back to local file for development
  serviceAccount = require("../../serviceAccountKey.json");
}

const app = express();
const PORT = Number(process.env.PORT || 5000);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

app.use(cors());
app.use(express.json());

function canRunCommand(command, args) {
  try {
    const result = spawnSync(command, args, {
      windowsHide: true,
      stdio: "ignore",
      shell: false,
    });
    return !result.error;
  } catch (_err) {
    return false;
  }
}

function resolvePythonRuntime() {
  const configuredPath = String(process.env.PYTHON_PATH || "").trim();
  if (configuredPath) {
    return { pythonPath: configuredPath, launcherArgs: [] };
  }

  if (process.platform === "win32") {
    if (canRunCommand("py", ["-3", "--version"])) {
      return { pythonPath: "py", launcherArgs: ["-3"] };
    }
    if (canRunCommand("python3", ["--version"])) {
      return { pythonPath: "python3", launcherArgs: [] };
    }
    return { pythonPath: "python", launcherArgs: [] };
  }

  if (canRunCommand("python3", ["--version"])) {
    return { pythonPath: "python3", launcherArgs: [] };
  }

  return { pythonPath: "python", launcherArgs: [] };
}

const pythonRuntime = resolvePythonRuntime();

function toPositiveInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function toFiniteFloat(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseRecommendationOutput(lines) {
  const text = (lines || []).join("\n").trim();
  if (!text) return [];

  try {
    return JSON.parse(text);
  } catch (_err) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const candidate = text.slice(start, end + 1);
      return JSON.parse(candidate);
    }
    throw new Error("Failed to parse recommender output as JSON.");
  }
}

function parseGeneratedRecommendationsRequest(req) {
  return {
    topK: toPositiveInt(req.query.top_k, 21, 1, 50),
    savedLimit: toPositiveInt(req.query.saved_limit, 100, 1, 1000),
    searchLimit: toPositiveInt(req.query.search_limit, 10, 1, 100),
    savedWeight: toFiniteFloat(req.query.saved_weight, 0.7),
    queryWeight: toFiniteFloat(req.query.query_weight, 0.3),
  };
}

function isQuotaExceededError(error) {
  const details = String((error && error.message) || "").toLowerCase();
  return (
    details.includes("quota exceeded")
    || details.includes("resource_exhausted")
    || details.includes("statuscode.resource_exhausted")
    || details.includes("429")
  );
}

async function runPythonRecommender(userId, options) {
  const scriptPath = path.join(__dirname, "recommender.py");
  const bundlePath = path.join(__dirname, "recommender.joblib");

  const shellOptions = {
    mode: "text",
    pythonOptions: [...pythonRuntime.launcherArgs, "-u"],
    pythonPath: pythonRuntime.pythonPath,
    args: [
      "--bundle", bundlePath,
      "--user_id", userId,
      "--top_k", String(options.topK),
      "--saved_limit", String(options.savedLimit),
      "--search_limit", String(options.searchLimit),
      "--saved_weight", String(options.savedWeight),
      "--query_weight", String(options.queryWeight),
    ],
  };

  try {
    const lines = await PythonShell.run(scriptPath, shellOptions);
    return parseRecommendationOutput(lines);
  } catch (error) {
    if (error && (error.code === "EACCES" || error.code === "ENOENT")) {
      throw new Error(
        `Unable to execute Python using '${shellOptions.pythonPath}'. `
        + "Set PYTHON_PATH to a valid Python executable path. "
        + `Original error: ${error.message}`,
      );
    }
    throw error;
  }
}

function buildRecommendationDocId(userId, accession) {
  return `${encodeURIComponent(String(userId).trim())}__${encodeURIComponent(String(accession).trim())}`;
}

async function replaceUserRecommendations(userId, recommendations) {
  const existingSnap = await db.collection("recommendations").where("user_id", "==", userId).get();
  const uniqueByAccession = new Map();

  if (Array.isArray(recommendations)) {
    for (const item of recommendations) {
      const accession = String(item.accession_no || "").trim();
      if (!accession || uniqueByAccession.has(accession)) continue;
      uniqueByAccession.set(accession, {
        accession_no: accession,
        score: Number(item.score || 0),
        title_of_material: String(item.title_of_material || "").trim(),
        program: String(item.program || "").trim(),
        collection: String(item.collection || "").trim(),
      });
    }
  }

  const desiredDocIds = new Set();
  uniqueByAccession.forEach((_, accession) => {
    desiredDocIds.add(buildRecommendationDocId(userId, accession));
  });

  const commitPromises = [];
  let batch = db.batch();
  let ops = 0;

  const commitBatchIfNeeded = () => {
    if (ops === 450) {
      commitPromises.push(batch.commit());
      batch = db.batch();
      ops = 0;
    }
  };

  existingSnap.docs.forEach((docSnap) => {
    if (!desiredDocIds.has(docSnap.id)) {
      batch.delete(docSnap.ref);
      ops += 1;
      commitBatchIfNeeded();
    }
  });

  let rank = 1;
  uniqueByAccession.forEach((item, accession) => {
    const docId = buildRecommendationDocId(userId, accession);
    const docRef = db.collection("recommendations").doc(docId);
    batch.set(docRef, {
      user_id: userId,
      accession_no: item.accession_no,
      score: item.score,
      rank,
      title_of_material: item.title_of_material,
      program: item.program,
      collection: item.collection,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    rank += 1;
    ops += 1;
    commitBatchIfNeeded();
  });

  if (ops > 0) {
    commitPromises.push(batch.commit());
  }

  if (commitPromises.length > 0) {
    await Promise.all(commitPromises);
  }
}

async function getStoredRecommendations(userId, maxItems) {
  let docs = [];
  try {
    const snap = await db
      .collection("recommendations")
      .where("user_id", "==", userId)
      .orderBy("created_at", "desc")
      .limit(maxItems)
      .get();
    docs = snap.docs;
  } catch (_err) {
    const fallback = await db
      .collection("recommendations")
      .where("user_id", "==", userId)
      .limit(maxItems * 3)
      .get();

    docs = fallback.docs.sort((a, b) => {
      const aDate = a.get("created_at") && a.get("created_at").toDate ? a.get("created_at").toDate().getTime() : 0;
      const bDate = b.get("created_at") && b.get("created_at").toDate ? b.get("created_at").toDate().getTime() : 0;
      return bDate - aDate;
    }).slice(0, maxItems);
  }

  return docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/recommendations/:userId/generate", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const options = parseGeneratedRecommendationsRequest(req);

  try {
    const recommendations = await runPythonRecommender(userId, options);
    await replaceUserRecommendations(userId, recommendations);

    res.json({
      user_id: userId,
      generated: true,
      count: recommendations.length,
      recommendations,
    });
  } catch (error) {
    console.error("Recommendation generation error:", error);

    if (isQuotaExceededError(error)) {
      try {
        const cachedRecommendations = await getStoredRecommendations(userId, options.topK);
        res.status(200).json({
          user_id: userId,
          generated: false,
          from_cache: true,
          quota_exceeded: true,
          count: cachedRecommendations.length,
          recommendations: cachedRecommendations,
        });
        return;
      } catch (_fallbackErr) {
        // Fall through to standard error response.
      }
    }

    res.status(500).json({
      error: "Failed to generate and store recommendations",
      details: error && error.message ? error.message : "Unknown error",
    });
  }
});

app.get("/recommendations/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const limit = toPositiveInt(req.query.limit, 21, 1, 50);
  try {
    const recommendations = await getStoredRecommendations(userId, limit);
    res.json({
      user_id: userId,
      count: recommendations.length,
      recommendations,
    });
  } catch (error) {
    console.error("Stored recommendations read error:", error);
    res.status(500).json({
      error: "Failed to read stored recommendations",
      details: error && error.message ? error.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`SmartLib backend listening on port ${PORT}`);
  console.log(`Recommender Python command: ${pythonRuntime.pythonPath}`);
});