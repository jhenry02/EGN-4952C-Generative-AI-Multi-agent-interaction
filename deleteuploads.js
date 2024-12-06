const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./uploads.db"); // Adjust path to your SQLite DB
db.run(`DELETE FROM generated_quizzes`, (err) => {
  if (err) {
    console.error("Error deleting all records from uploads table", err.message);
  } else {
    console.log("All records deleted successfully from uploads table.");
  }
});

// Close the database
db.close();
