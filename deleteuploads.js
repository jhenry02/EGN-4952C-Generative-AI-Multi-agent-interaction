const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./uploads.db", (err) => {
  if (err) {
    console.error("Error opening database " + err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

// Delete all entries from the uploads table
db.run("DELETE FROM uploads", function (err) {
  if (err) {
    console.error("Error deleting uploads:", err.message);
  } else {
    console.log("All uploaded files have been deleted.");
  }
});

// Close the database
db.close();
