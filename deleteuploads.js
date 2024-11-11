const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./uploads.db"); // Adjust path to your SQLite DB

db.run("DROP TABLE IF EXISTS uploads", function (err) {
  if (err) {
    console.error("Error dropping table:", err.message);
  } else {
    console.log("Table 'uploads' dropped successfully.");
  }
  db.close(); // Close the database connection
});

// Close the database
db.close();
