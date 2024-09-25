require("dotenv").config();
const { Client, IntentsBitField, Events } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./uploads.db", (err) => {
  if (err) {
    console.error("Error opening database " + err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

// Create a table if it doesn't exist
db.run(
  `CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fileName TEXT,
  filePath TEXT,
  uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`,
  (err) => {
    if (err) {
      console.error("Error creating table " + err.message);
    } else {
      console.log("Uploads table is ready.");
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

let lastGeneratedOutline = ""; // Variable to store the most recent outline

// Log when the bot is online
client.on("ready", () => {
  console.log("The bot is online!");
});

// Handle message creation event
client.on("messageCreate", async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

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

  // Handle command messages (starts with "/")
  if (message.content.startsWith("/")) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Command to create a class outline
    if (command === "createoutline") {
      const lectureLength = args[0] || "45"; // Default to 45 minutes if not specified

      try {
        // Fetch uploaded materials from the SQLite database asynchronously
        const uploadedMaterials = await getUploadedMaterials();

        if (uploadedMaterials.length === 0) {
          message.reply(
            "No materials uploaded. Please upload materials before creating an outline."
          );
          return;
        }

        // Call AI to generate a class outline based on materials
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
        lastGeneratedOutline = content; // Store the generated outline
        splitAndSendMessage(message.channel, content, 2000);
      } catch (error) {
        console.error(`Error creating class outline: ${error.message}`);
        message.reply(
          "Failed to create class outline. Please try again later."
        );
      }
    }

    // Command to save the most recent outline to a file
    if (command === "save") {
      const nameArgIndex = args.findIndex((arg) => arg === "name");
      if (nameArgIndex === -1 || nameArgIndex === args.length - 1) {
        message.reply(
          "Please provide a name for the file using the format: /save name <desired_name>"
        );
        return;
      }

      const fileName = args[nameArgIndex + 1];
      if (!lastGeneratedOutline) {
        message.reply(
          "No outline available to save. Please create an outline first."
        );
        return;
      }

      // Create a /saves directory if it doesn't exist
      const savesDir = path.join(__dirname, "saves");
      if (!fs.existsSync(savesDir)) {
        fs.mkdirSync(savesDir, { recursive: true });
      }

      // Save the outline to a file in the /saves directory
      const filePath = path.join(savesDir, `${fileName}.txt`);

      fs.writeFile(filePath, lastGeneratedOutline, (err) => {
        if (err) {
          console.error(`Error saving outline: ${err.message}`);
          message.reply("Failed to save the outline. Please try again.");
        } else {
          message.reply(`Outline saved successfully to ${filePath}`);
        }
      });
    }

    return; // Ensure it doesn't continue to handle general messages after command execution
  }

  // Handle normal messages (not starting with "/")
  try {
    await message.channel.sendTyping(); // Simulate typing indicator

    // Simple AI conversation logic for normal messages
    const response = await axios.post(
      "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
      {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a friendly chatbot." },
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
    splitAndSendMessage(message.channel, content, 2000);
  } catch (error) {
    console.error(`Error in message handling: ${error.message}`);
  }
});

// Handle interactions (Slash Commands)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  try {
    // Acknowledge the interaction immediately
    await interaction.deferReply();

    if (commandName === "createoutline") {
      const lectureLength = options.getString("length") || "45";
      const uploadedMaterials = await getUploadedMaterials();

      if (uploadedMaterials.length === 0) {
        await interaction.editReply(
          "No materials uploaded. Please upload materials before creating an outline."
        );
        return;
      }

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
      await interaction.editReply(
        content.length > 2000
          ? "Response is too long to display in a single message."
          : content
      );
      if (content.length > 2000)
        splitAndSendMessage(interaction.channel, content, 2000);
    }

    if (commandName === "releasematerials") {
      const materialIds = options
        .getString("materials")
        .split(",")
        .map((id) => id.trim());

      if (materialIds.length === 0) {
        await interaction.editReply("Please specify the materials to release.");
        return;
      }

      await interaction.editReply(
        `Materials released: ${materialIds.join(", ")}`
      );
    }
  } catch (error) {
    console.error(`Error handling interaction: ${error.message}`);
    await interaction.editReply(
      "An error occurred while processing your request."
    );
  }
});

// Async function to get uploaded materials from the SQLite database
async function getUploadedMaterials() {
  return new Promise((resolve, reject) => {
    db.all("SELECT fileName FROM uploads", [], (err, rows) => {
      if (err) {
        console.error("Error fetching materials from database", err.message);
        reject(err);
        return;
      }
      // Extract filenames from the database result
      const fileNames = rows.map((row) => row.fileName);
      resolve(fileNames);
    });
  });
}

// Function to split long messages and send in parts
function splitAndSendMessage(channel, content, limit) {
  const parts = [];
  for (let i = 0; i < content.length; i += limit) {
    parts.push(content.slice(i, i + limit));
  }
  parts.forEach((part) => channel.send(part));
}

// Log in to Discord
client.login(process.env.TOKEN);
