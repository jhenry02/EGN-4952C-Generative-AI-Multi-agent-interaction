const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./uploads.db"); // Adjust path to your SQLite DB

db.run(`ALTER TABLE saved_outlines ADD COLUMN fileName TEXT`, (err) => {
  if (err && !err.message.includes("duplicate column name")) {
    console.error(
      "Error adding fileName column to saved_outlines table",
      err.message
    );
  } else if (!err) {
    console.log("fileName column added to saved_outlines table.");
  }
});

// Close the database
db.close();
