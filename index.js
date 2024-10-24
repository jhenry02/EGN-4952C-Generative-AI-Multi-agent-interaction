require("dotenv").config();
const { Client, IntentsBitField, Events } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { createSlideImage } = require("./canva.js");

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

    // Log the entire response
    console.log("Full AI Response:", response.data);

    const content = response.data.choices[0]?.message?.content;
    if (content) {
      console.log("AI Response Content:", content);
      splitAndSendMessage(message.channel, content, 2000);
    } else {
      console.error("No content in AI response");
    }
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

  //M1 content (code)
  if (commandName === "createslide") {
    // Retrieve saved outlines and uploaded materials
    const savedOutlines = await getSavedOutlines();
    const uploadedMaterials = await getUploadedMaterials();
    console.log("Uploaded Materials:", uploadedMaterials);

    if (savedOutlines.length === 0) {
      await interaction.editReply("No saved outlines found.");
      return;
    }

    if (uploadedMaterials.length === 0) {
      await interaction.editReply("No uploaded materials found.");
      return;
    }

    const outlineContent = savedOutlines[0].outline;

    // Split the outline into sections
    const sections = outlineContent
      .split(/\n(V\.|IV\.|III\.|II\.|I\.)/)
      .filter(Boolean);

    for (let i = 0; i < sections.length; i++) {
      const sectionHeader = sections[i].trim();
      const sectionContent = sections[i + 1]?.trim() || "";
      const generatedContent = sections[i].content;
      // Step 1: Generate the slide image
      const slideImage = await createSlideImage(
        `${sectionHeader}\n\n${generatedContent}`,
        uploadedMaterials
      );

      // Step 2: Convert the slide image to a buffer
      const buffer = await slideImage.toBuffer();

      // Step 3: Verify that the buffer is valid and save it
      if (buffer && buffer.length > 0) {
        const imagePath = `./uploads/slide_${Date.now()}_${i}.png`;
        fs.writeFileSync(imagePath, buffer);

        // Step 4: Log the successful save and send the image
        console.log(`Slide image saved at: ${imagePath}`);
        await interaction.followUp({
          content: `Slide for section "${sectionHeader}" generated successfully!`,
          files: [imagePath],
        });
      } else {
        // Handle the error if image generation fails
        console.error("Failed to generate a valid image buffer.");
        await interaction.followUp(
          `Failed to generate slide for section "${sectionHeader}".`
        );
      }

      try {
        let lectureLength = 45;

        // Generate content based on the uploaded materials
        const generatedContent = await generateContentFromMaterials(
          uploadedMaterials,
          sectionHeader,
          sectionContent
        );

        // Create slide image based on the outline and generated content
        const slideImage = await createSlideImage(
          `${sectionHeader}\n\n${generatedContent}`,
          uploadedMaterials
        );

        // Save image locally
        const imagePath = `./uploads/slide_${Date.now()}_${i}.png`;
        const buffer = await slideImage.toBuffer();
        fs.writeFileSync(imagePath, buffer);

        // Send each image as a separate message
        await interaction.followUp({
          content: `Slide for section "${sectionHeader}" generated successfully!`,
          files: [imagePath],
        });
      } catch (error) {
        console.error(
          `Error generating slide for section "${sectionHeader}": ${error.message}`
        );
        await interaction.followUp(
          `Failed to generate slide for section "${sectionHeader}".`
        );
      }
    }

    await interaction.editReply("All slides generated successfully.");
  }
});

// Function to split and send long messages
// Function to split and send long messages
async function splitAndSendMessage(channel, content, delay) {
  const chunkSize = 2000;
  const numChunks = Math.ceil(content.length / chunkSize);
  let start = 0;

  for (let i = 0; i < numChunks; i++) {
    const chunk = content.substring(start, start + chunkSize);
    await channel.send(chunk); // Await the send operation
    start += chunkSize;
    if (i < numChunks - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay)); // Await the delay
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
        console.error("Error retrieving uploaded materials:", err.message);
        return reject(err);
      }
      console.log("Uploaded Materials from DB:", rows); // Add this log to debug
      resolve(rows.map((row) => row.filePath)); // Ensure
      const materials = rows.map((row) => row.filePath);
      resolve(materials);
    });
  });
}
async function generateContentFromMaterials(uploadedMaterials, sectionHeader) {
  const contentArray = [];

  // Read each material file and store its content
  for (const material of uploadedMaterials) {
    if (typeof material !== "string") {
      console.error(`Invalid material path: ${material}`);
      continue; // Skip this iteration if the material is not a string
    }
    try {
      const data = fs.readFileSync(material, "utf-8"); // Ensure 'material' is a valid path
      contentArray.push(data);
    } catch (err) {
      console.error(`Error reading material ${material}: ${err.message}`);
    }
  }

  // Combine the content of all materials
  let sectionContent = contentArray.join("\n");
  // Handle content length to avoid 413 error
  const MAX_CONTENT_LENGTH = 4000; // Adjust based on the API's limit
  if (sectionContent.length > MAX_CONTENT_LENGTH) {
    sectionContent = sectionContent.substring(0, MAX_CONTENT_LENGTH);
    return sectionContent; // Truncate if necessary
  }

  // Return the processed section content

  // Initialize an array to hold generated contents
  const generatedContents = [];

  for (const contentSection of contentSections) {
    try {
      // Prepare the payload for the Trussed API
      const payload = {
        model: "gpt-4", // Adjust the model as needed
        messages: [
          {
            role: "system",
            content: `Create a ${lectureLength}-minute class outline using the following materials: ${uploadedMaterials.join(
              ", "
            )}.`,
          },
        ],
      };
      console.log("Payload being sent:", JSON.stringify(payload));
      // Make the API call to Trussed
      const response = await axios.post(
        "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
        payload,
        {
          headers: {
            Authorization: `Bearer ${process.env.TRUSSED_API_KEY}`, // Ensure you have the correct API key in your environment variable
            "Content-Type": "application/json", // Specify the content type
          },
        }
      );

      // Extract content from the API response
      const generatedContent = response.data.choices[0].message.content;
      generatedContents.push(generatedContent);
      console.log("AI Response Content:", content);
    } catch (error) {
      console.error(
        `Error generating content from materials: ${error.message}`
      );
      throw new Error("Failed to generate content from materials.");
    }
  }

  // Return the concatenated results of all sections
  return generatedContents.join("\n");
}
function splitContent(content, maxLength) {
  const sections = [];
  let currentSection = "";

  const words = content.split(" "); // Split by spaces to maintain whole words

  for (const word of words) {
    if ((currentSection + word).length + 100 <= maxLength) {
      // Add a buffer of 100 characters
      currentSection += `${word} `;
    } else {
      sections.push(currentSection.trim());
      currentSection = `${word} `;
    }
  }
  if (currentSection) sections.push(currentSection.trim());

  return sections;
}
const extractTextFromFiles = async (filePaths) => {
  let allText = [];
  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") {
      const text = await extractTextFromPDF(filePath); // Implement PDF text extraction
      allText.push(text);
    } else {
      // Handle other file types (e.g., .txt, .docx, etc.)
      const text = fs.readFileSync(filePath, "utf8"); // Example for .txt files
      allText.push(text);
    }
  }
  return allText.join(" ");
};

// Login to Discord
client.login(process.env.TOKEN);
