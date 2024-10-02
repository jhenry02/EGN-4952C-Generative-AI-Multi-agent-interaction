require("dotenv").config();
const { Client, IntentsBitField, Events } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const PptxGenJS = require("pptxgenjs");

const db = new sqlite3.Database("./uploads.db", (err) => {
  if (err) {
    console.error("Error opening database " + err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

// Create tables if they don't exist
db.run(
  `CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fileName TEXT,
    filePath TEXT,
    uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating uploads table " + err.message);
    } else {
      console.log("Uploads table is ready.");
    }
  }
);

db.run(
  `CREATE TABLE IF NOT EXISTS generated_outlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    outline TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating generated_outlines table " + err.message);
    } else {
      console.log("Generated outlines table is ready.");
    }
  }
);

db.run(
  `CREATE TABLE IF NOT EXISTS saved_outlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    outline TEXT,
    savedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating saved_outlines table " + err.message);
    } else {
      console.log("Saved outlines table is ready.");
    }
  }
);

// Initialize Discord client with necessary intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions,
  ],
});

let lastGeneratedOutlineId = null; // Store the ID of the last generated outline

// Log when the bot is online
client.on("ready", () => {
  console.log("The bot is online!");
});

/// Keep this part to handle normal messages and file uploads
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  try {
    // Send typing indicator
    await message.channel.sendTyping();

    // Simple AI conversation logic for normal messages
    const response = await axios.post(
      "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
      {
        model: "gpt-4", // Or whichever model you are using
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: message.content },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );

    const content = response.data.choices[0].message.content;

    // Send the AI's response back to the user
    splitAndSendMessage(message.channel, content, 2000);
  } catch (error) {
    console.error(`Error in message handling: ${error.message}`);
  }

  // Handle file uploads
  if (message.attachments.size > 0) {
    message.attachments.forEach(async (attachment) => {
      const fileUrl = attachment.url;
      const fileName = attachment.name;

      const uploadDir = path.join(__dirname, "uploads");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);
      const fileStream = fs.createWriteStream(filePath);

      try {
        const response = await axios({
          method: "get",
          url: fileUrl,
          responseType: "stream",
        });

        response.data.pipe(fileStream);

        fileStream.on("finish", () => {
          message.reply(
            `File "${fileName}" uploaded successfully and saved to "${filePath}".`
          );

          // Insert file info into the SQLite database
          db.run(
            `INSERT INTO uploads (fileName, filePath) VALUES (?, ?)`,
            [fileName, filePath],
            function (err) {
              if (err) {
                return console.error(
                  "Error inserting into database",
                  err.message
                );
              }
              console.log(
                `File "${fileName}" stored at "${filePath}" with ID ${this.lastID}`
              );
            }
          );
        });

        fileStream.on("error", (err) => {
          console.error(`Error downloading file: ${err.message}`);
          message.reply(`Failed to upload "${fileName}".`);
        });
      } catch (error) {
        console.error(`Error downloading file: ${error.message}`);
        message.reply(`Failed to upload "${fileName}".`);
      }
    });
    return;
  }

  // Normal message processing, if needed
});

// Now, let's handle slash commands in the interactionCreate event
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  try {
    await interaction.deferReply(); // Acknowledge interaction

    if (commandName === "createoutline") {
      const lectureLength = options.getString("length") || "45"; // Length argument for outline
      const uploadedMaterials = await getUploadedMaterials();

      if (uploadedMaterials.length === 0) {
        await interaction.editReply(
          "No materials uploaded. Please upload materials before creating an outline."
        );
        return;
      }

      // Use AI to generate a class outline
      const response = await axios.post(
        "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
        {
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `Create a ${lectureLength}-minute class outline using the following materials: ${uploadedMaterials.join(
                ", "
              )}.`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.API_KEY}`,
          },
        }
      );

      const content = response.data.choices[0].message.content;

      db.run(
        "INSERT INTO generated_outlines (name, outline) VALUES (?, ?)",
        ["Outline", content],
        function (err) {
          if (err) {
            console.error("Error saving outline to database", err.message);
            interaction.editReply("Failed to save the generated outline.");
          } else {
            lastGeneratedOutlineId = this.lastID; // Store the last generated outline ID
            splitAndSendMessage(interaction.channel, content, 2000);
            interaction.editReply("Outline generated and saved.");
          }
        }
      );
    }

    if (commandName === "save") {
      const fileName = options.getString("name");

      if (!lastGeneratedOutlineId) {
        await interaction.editReply(
          "No outline available to save. Please create an outline first."
        );
        return;
      }

      db.get(
        `SELECT outline FROM generated_outlines WHERE id = ?`,
        [lastGeneratedOutlineId],
        (err, row) => {
          if (err) {
            console.error("Error retrieving generated outline", err.message);
            interaction.editReply("Failed to retrieve the generated outline.");
            return;
          }

          if (!row) {
            interaction.editReply(
              "No generated outline found to save. Please generate an outline first."
            );
            return;
          }

          // Insert into saved_outlines
          db.run(
            "INSERT INTO saved_outlines (name, outline) VALUES (?, ?)",
            [fileName, row.outline],
            function (err) {
              if (err) {
                console.error("Error saving outline to database", err.message);
                interaction.editReply(
                  "Failed to save the outline. Please try again."
                );
              } else {
                // Successfully saved, now delete the outline from generated_outlines
                db.run(
                  `DELETE FROM generated_outlines WHERE id = ?`,
                  [lastGeneratedOutlineId],
                  (err) => {
                    if (err) {
                      console.error(
                        "Error deleting old generated outline",
                        err.message
                      );
                    }
                  }
                );
                interaction.editReply(
                  `Outline saved successfully with the name "${fileName}".`
                );
              }
            }
          );
        }
      );
    }
  } catch (error) {
    console.error(`Error handling interaction: ${error.message}`);
    await interaction.editReply(
      "An error occurred while processing your request."
    );
  }

  if (commandName === "createpowerpoint") {
    // Retrieve saved outlines and uploaded materials
    const savedOutlines = await getSavedOutlines();
    const uploadedMaterials = await getUploadedMaterials();

    if (savedOutlines.length === 0) {
      await interaction.editReply("No saved outlines found.");
      return;
    }

    if (uploadedMaterials.length === 0) {
      await interaction.editReply("No uploaded materials found.");
      return;
    }

    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();

    // Add title to slide
    slide.addText("Class Outline", { x: 1, y: 0.5, fontSize: 24 });

    // Add outline and materials to slide
    slide.addText(savedOutlines[0].outline, { x: 1, y: 1, fontSize: 18 });
    slide.addText("Materials:", { x: 1, y: 2, fontSize: 20 });

    uploadedMaterials.forEach((material, index) => {
      slide.addText(material, { x: 1, y: 2.5 + index * 0.5, fontSize: 16 });
    });

    // Save the PowerPoint file
    const pptxFile = `./uploads/class_outline_${Date.now()}.pptx`;
    await pptx.writeFile({ fileName: pptxFile });

    // Send file back to the user
    await interaction.editReply({
      content: "PowerPoint created successfully!",
      files: [pptxFile],
    });
  }
});

// Function to split and send long messages
function splitAndSendMessage(channel, content, delay) {
  const chunkSize = 2000;
  const numChunks = Math.ceil(content.length / chunkSize);
  let start = 0;

  for (let i = 0; i < numChunks; i++) {
    const chunk = content.substring(start, start + chunkSize);
    channel.send(chunk);
    start += chunkSize;
    if (i < numChunks - 1) {
      new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
// Function to retrieve saved outlines
function getSavedOutlines() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM saved_outlines ORDER BY createdAt DESC LIMIT 1",
      [],
      (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
}
// Function to get uploaded materials from the SQLite database
function getUploadedMaterials() {
  return new Promise((resolve, reject) => {
    db.all("SELECT filePath FROM uploads", [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      const materials = rows.map((row) => row.filePath);
      resolve(materials);
    });
  });
}

// Login to Discord
client.login(process.env.TOKEN);
